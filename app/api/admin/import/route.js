import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { getPool } from "../../../../lib/db";
import {
  verifySessionToken,
  SESSION_COOKIE,
} from "../../../../lib/auth";
import { mesActualUTC5 } from "../../../../lib/fecha";

export const dynamic = "force-dynamic";

const UUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

function parseBooleanValue(val) {
  if (val === null || val === undefined) return null;
  if (typeof val === "boolean") return val;
  const str = String(val).trim().toLowerCase();
  if (str === "1" || str === "si" || str === "sí" || str === "true" || str === "yes") return true;
  if (str === "0" || str === "no" || str === "false") return false;
  return null;
}

function parseNumberValue(val) {
  if (val === null || val === undefined) return null;
  if (typeof val === "number" && !Number.isNaN(val)) return val;
  const str = String(val).trim().replace(",", ".");
  if (!str) return null;
  const num = Number(str);
  return Number.isNaN(num) ? null : num;
}

// Solo calificaciones enteras 1-10 (mismo criterio que la app del encuestador).
function parseCalificacion(val) {
  const num = parseNumberValue(val);
  return Number.isInteger(num) && num >= 1 && num <= 10 ? num : null;
}

function parseDateValue(val) {
  if (!val) return new Date().toISOString();
  if (val instanceof Date) return val.toISOString();
  const d = new Date(val);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

async function procesarLote(rows, mapping) {
  let pool;
  try {
    pool = getPool();
  } catch (err) {
    return NextResponse.json(
      { error: `Error de base de datos: ${err.message}. Asegúrate de configurar SUPABASE_DB_URL en el archivo .env.` },
      { status: 500 }
    );
  }

  let client;
  try {
    client = await pool.connect();
  } catch (err) {
    return NextResponse.json(
      { error: `No se pudo conectar a PostgreSQL: ${err.message}. Verifica que el servicio esté disponible.` },
      { status: 500 }
    );
  }

  try {
    // 1. Obtener cuestionario activo
    const { rows: cuestionarios } = await client.query(
      `select id from cuestionarios where activo = true order by created_at desc limit 1`
    );
    if (cuestionarios.length === 0) {
      return NextResponse.json(
        { error: "No hay un cuestionario activo en el sistema. Debe existir al menos un cuestionario con activo = true." },
        { status: 400 }
      );
    }
    const cuestionarioId = cuestionarios[0].id;

    // 2. Obtener preguntas activas
    const { rows: preguntas } = await client.query(
      `select id, orden, numero_reporte, texto, tipo, requiere_justificacion
       from preguntas where cuestionario_id = $1 and activa = true
       order by orden asc`,
      [cuestionarioId]
    );

    // 3. Caché de encuestadores existentes con matching inteligente (evita crear encuestadores duplicados)
    const { rows: encRows } = await client.query(`select id, nombre, activo from encuestadores`);

    function normalizar(str) {
      return (str || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim();
    }

    const porDefecto = () => encRows.find((e) => e.activo)?.id || encRows[0]?.id;

    // Devuelve { id, inferido } — inferido=true cuando no hubo coincidencia y se
    // usó un encuestador por defecto (se reporta como advertencia al admin).
    function resolverEncuestador(nombreRaw) {
      const r = resolverEncuestadorId(nombreRaw);
      return r ? { id: r, inferido: false } : { id: porDefecto(), inferido: true };
    }

    function resolverEncuestadorId(nombreRaw) {
      if (!nombreRaw) return null;
      const normInput = normalizar(nombreRaw);
      if (!normInput) return null;

      // 1. Coincidencia exacta normalizada
      const exacto = encRows.find((e) => normalizar(e.nombre) === normInput);
      if (exacto) return exacto.id;

      // 2. Coincidencia por primer nombre o prefijo (ej: "Evelyn" -> "Evelyn Velasquez", "Vanessa" -> "Vanessa Velasquez", "Verónica" -> "Verónica Manosalvas")
      const primerPalabra = normInput.split(/\s+/)[0];
      const matchPrimerNombre = encRows.find((e) => {
        const dbPrimerPalabra = normalizar(e.nombre).split(/\s+/)[0];
        return dbPrimerPalabra === primerPalabra;
      });
      if (matchPrimerNombre) return matchPrimerNombre.id;

      // 3. Coincidencia por inclusión de subcadena
      const matchInclusion = encRows.find((e) => {
        const dbNorm = normalizar(e.nombre);
        return dbNorm.includes(normInput) || normInput.includes(dbNorm);
      });
      if (matchInclusion) return matchInclusion.id;

      // 4. Sin coincidencia: el llamador asigna un encuestador por defecto y lo advierte.
      return null;
    }

    if (encRows.length === 0) {
      return NextResponse.json(
        { error: "No hay encuestadores registrados. Crea al menos uno antes de importar." },
        { status: 400 }
      );
    }

    // Caché de clientes para optimizar transacciones
    const cliMap = new Map();

    await client.query("begin");

    let importadas = 0;
    let duplicados = 0;
    const errores = [];
    const advertencias = [];

    for (let rIdx = 0; rIdx < rows.length; rIdx++) {
      const row = rows[rIdx];
      const spName = `sp_${rIdx}`;
      await client.query(`savepoint ${spName}`);

      try {
        let submissionId = null;
        let fecha = new Date().toISOString();
        let nombreEncuestador = "";
        let codigoCliente = null;
        let nombreCliente = "Cliente Importado";
        // Sin PDV en el archivo se deja vacío: antes se inventaba "MATRIZ" y esa
        // sucursal ficticia aparecía en el monitoreo.
        let pdv = null;
        let mesGestion = mesActualUTC5();

        const respuestasDict = {};
        const justificativoDict = {};

        Object.entries(mapping).forEach(([headerName, targetField]) => {
          const cellValue = row[headerName];
          if (!targetField || targetField === "ignore" || cellValue === undefined || cellValue === "") return;

          if (targetField === "submission_id") {
            const val = String(cellValue).trim();
            // Dar preferencia a UUIDs reales en caso de mapeos múltiples accidentales (como FormId + Submission Id)
            if (!submissionId || (!UUID_REGEX.test(submissionId) && UUID_REGEX.test(val))) {
              submissionId = val;
            }
          } else if (targetField === "fecha") {
            fecha = parseDateValue(cellValue);
          } else if (targetField === "encuestador") {
            nombreEncuestador = String(cellValue).trim();
          } else if (targetField === "codigo_cliente") {
            codigoCliente = String(cellValue).trim();
          } else if (targetField === "nombre_cliente") {
            nombreCliente = String(cellValue).trim();
          } else if (targetField === "pdv") {
            pdv = String(cellValue).trim();
          } else if (targetField === "mes_gestion") {
            mesGestion = String(cellValue).trim().toUpperCase();
          } else if (targetField.startsWith("pregunta_")) {
            const qId = targetField.replace("pregunta_", "");
            respuestasDict[qId] = cellValue;
          } else if (targetField.startsWith("justificacion_")) {
            const qId = targetField.replace("justificacion_", "");
            justificativoDict[qId] = cellValue;
          }
        });

        // Deduplicación: por submissionId (UUID) o por código de cliente + fecha
        let esDuplicado = false;
        if (submissionId && UUID_REGEX.test(submissionId)) {
          const { rows: dups } = await client.query(
            `select 1 from encuestas where id = $1 limit 1`,
            [submissionId]
          );
          if (dups.length > 0) esDuplicado = true;
        } else if (codigoCliente) {
          const { rows: dups } = await client.query(
            `select 1 from encuestas where codigo_cliente = $1 and created_at = $2 limit 1`,
            [codigoCliente, fecha]
          );
          if (dups.length > 0) esDuplicado = true;
        }

        if (esDuplicado) {
          duplicados++;
          await client.query(`release savepoint ${spName}`);
          continue;
        }

        // 1. Resolver encuestador existente legítimo (nunca duplica)
        const { id: encuestadorId, inferido } = resolverEncuestador(nombreEncuestador);

        // 2. Obtener o crear cliente en clientes_cache
        let clienteTwentyId = null;
        if (codigoCliente) {
          clienteTwentyId = cliMap.get(codigoCliente);
          if (!clienteTwentyId) {
            const { rows: cliRows } = await client.query(
              `select id_twenty from clientes_cache where codigo_cliente = $1 limit 1`,
              [codigoCliente]
            );
            if (cliRows.length > 0) {
              clienteTwentyId = cliRows[0].id_twenty;
            } else {
              // Cliente histórico que no está en Twenty (id ficticio): se marca como ya
              // encuestado para que nunca aparezca en el buscador del encuestador.
              const { rows: newCli } = await client.query(
                `insert into clientes_cache (id_twenty, codigo_cliente, nombre, pdv, mes_gestion, status, synced_at)
                 values (gen_random_uuid(), $1, $2, $3, $4, 'YA_LE_REALIZARON_LA_ENCUESTA', now())
                 returning id_twenty`,
                [codigoCliente, nombreCliente, pdv, mesGestion]
              );
              clienteTwentyId = newCli[0].id_twenty;
            }
            cliMap.set(codigoCliente, clienteTwentyId);
          }
        }

        let completada = true;

        // 3. Crear encuesta
        let encuestaId;
        if (submissionId && UUID_REGEX.test(submissionId)) {
          const { rows: encInsert } = await client.query(
            `insert into encuestas (id, cuestionario_id, cliente_twenty_id, codigo_cliente, encuestador_id, completada, created_at)
             values ($1, $2, $3, $4, $5, $6, $7)
             returning id`,
            [submissionId, cuestionarioId, clienteTwentyId, codigoCliente, encuestadorId, completada, fecha]
          );
          encuestaId = encInsert[0].id;
        } else {
          const { rows: encInsert } = await client.query(
            `insert into encuestas (cuestionario_id, cliente_twenty_id, codigo_cliente, encuestador_id, completada, created_at)
             values ($1, $2, $3, $4, $5, $6)
             returning id`,
            [cuestionarioId, clienteTwentyId, codigoCliente, encuestadorId, completada, fecha]
          );
          encuestaId = encInsert[0].id;
        }

        // 4. Inserción de respuestas
        for (const p of preguntas) {
          const rawVal = respuestasDict[p.id];
          const rawJust = justificativoDict[p.id] || "";

          let valorFinal = null;

          if (p.tipo === "aceptacion_si_no") {
            const boolVal = parseBooleanValue(rawVal);
            if (boolVal !== null) {
              valorFinal = boolVal;
              if (boolVal === false) completada = false;
            }
          } else if (p.tipo === "escala_1_10") {
            const numVal = parseCalificacion(rawVal);
            if (numVal !== null) {
              if (p.requiere_justificacion) {
                valorFinal = {
                  calificacion: numVal,
                  justificacion: String(rawJust).trim(),
                };
              } else {
                valorFinal = { calificacion: numVal };
              }
            }
          } else if (p.tipo === "texto_abierto") {
            if (rawVal) valorFinal = String(rawVal).trim();
          }

          if (valorFinal !== null) {
            await client.query(
              `insert into respuestas (encuesta_id, pregunta_id, valor) values ($1, $2, $3)`,
              [encuestaId, p.id, JSON.stringify(valorFinal)]
            );
          }
        }

        if (!completada) {
          await client.query(`update encuestas set completada = false where id = $1`, [encuestaId]);
        } else if (clienteTwentyId) {
          // Solo una encuesta efectiva saca al cliente del buscador (antes también las cortadas).
          await client.query(
            `update clientes_cache set status = 'EFECTIVA', synced_at = now() where id_twenty = $1`,
            [clienteTwentyId]
          );
        }

        if (inferido) {
          advertencias.push({
            fila: rIdx + 1,
            cliente: nombreCliente || codigoCliente || `Fila ${rIdx + 1}`,
            mensaje: nombreEncuestador
              ? `Encuestador "${nombreEncuestador}" no reconocido: se asignó uno por defecto.`
              : "Fila sin encuestador: se asignó uno por defecto.",
          });
        }

        await client.query(`release savepoint ${spName}`);
        importadas++;
      } catch (rowErr) {
        await client.query(`rollback to savepoint ${spName}`);
        errores.push({
          fila: rIdx + 1,
          cliente: row["Nombre"] || row["Cliente"] || codigoCliente || `Fila ${rIdx + 1}`,
          error: rowErr.message,
        });
      }
    }

    await client.query("commit");
    return NextResponse.json({ ok: true, importadas, duplicados, errores, advertencias });
  } catch (err) {
    await client.query("rollback");
    console.error("Error en lote de importación masiva:", err);
    let msg = err.message || "Error procesando lote";
    if (msg.includes("relation") && msg.includes("does not exist")) {
      msg = `Faltan tablas en la base de datos (${msg}). Asegúrate de ejecutar 'npm run db:migrate'.`;
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  } finally {
    client.release();
  }
}

export async function POST(request) {
  try {
    // 1. Verificar sesión de administrador
    const adminToken = request.cookies.get(SESSION_COOKIE)?.value;
    if (!verifySessionToken(adminToken)) {
      return NextResponse.json({ error: "Sesión de administrador inválida o expirada. Inicia sesión nuevamente." }, { status: 401 });
    }

    const contentType = request.headers.get("content-type") || "";

    // MODO BATCH (JSON directo para lotes)
    if (contentType.includes("application/json")) {
      const body = await request.json();
      const { rows = [], mapping = {} } = body;
      return await procesarLote(rows, mapping);
    }

    // MODO UPLOAD EXCEL (FormData)
    const formData = await request.formData();
    const file = formData.get("file");
    const isPreview = formData.get("preview") === "true";
    const mappingRaw = formData.get("mapping");

    if (!file) {
      return NextResponse.json({ error: "No se envió ningún archivo" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = new ExcelJS.Workbook();

    const fileName = (file.name || "").toLowerCase();
    const isCsv = fileName.endsWith(".csv");

    let worksheet;
    if (isCsv) {
      const { Readable } = await import("stream");
      worksheet = await workbook.csv.read(Readable.from(buffer));
    } else {
      try {
        await workbook.xlsx.load(buffer);
        worksheet = workbook.worksheets[0];
      } catch (xlsxErr) {
        try {
          const { Readable } = await import("stream");
          worksheet = await workbook.csv.read(Readable.from(buffer));
        } catch {
          return NextResponse.json(
            { error: `No se pudo leer el archivo Excel/CSV. Asegúrate de subir un archivo .xlsx o .csv válido: ${xlsxErr.message}` },
            { status: 400 }
          );
        }
      }
    }

    if (!worksheet) {
      return NextResponse.json({ error: "El archivo Excel/CSV está vacío o no contiene hojas válidas" }, { status: 400 });
    }

    function extraerTextoCelda(val) {
      if (val === null || val === undefined) return "";
      if (typeof val === "object") {
        if (val.result !== undefined) return String(val.result).trim();
        if (val.text !== undefined) return String(val.text).trim();
        if (Array.isArray(val.richText)) return val.richText.map((t) => t.text).join("").trim();
        if (val instanceof Date) return val.toISOString();
      }
      return String(val).trim();
    }

    const headers = [];
    const rows = [];

    worksheet.eachRow((row, rowNumber) => {
      const rowValues = row.values.slice(1);
      if (rowNumber === 1) {
        rowValues.forEach((cellVal, colIdx) => {
          const text = extraerTextoCelda(cellVal);
          headers.push(text || `Columna ${colIdx + 1}`);
        });
      } else {
        const rowObj = {};
        let hasData = false;
        headers.forEach((h, idx) => {
          const val = rowValues[idx];
          const textVal = extraerTextoCelda(val);
          rowObj[h] = textVal;
          if (textVal) hasData = true;
        });
        if (hasData) {
          rows.push(rowObj);
        }
      }
    });

    // Si es previsualización, retornamos headers, samples, totalRows y todas las filas parseadas
    if (isPreview) {
      const samples = rows.slice(0, 3);
      return NextResponse.json({
        ok: true,
        headers,
        samples,
        totalRows: rows.length,
        rows, // Retorna todas las filas parseadas para permitir procesamiento por lotes desde el cliente
      });
    }

    // Si llaman sin batch (modo compatibilidad anterior)
    let mapping = {};
    try {
      mapping = mappingRaw ? JSON.parse(mappingRaw) : {};
    } catch {
      return NextResponse.json({ error: "Mapeo inválido" }, { status: 400 });
    }

    return await procesarLote(rows, mapping);
  } catch (err) {
    console.error("Error general en POST /api/admin/import:", err);
    return NextResponse.json({ error: `Error procesando la solicitud: ${err.message}` }, { status: 500 });
  }
}
