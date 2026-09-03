import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { getPool } from "../../../../lib/db";
import {
  verifySessionToken,
  SESSION_COOKIE,
} from "../../../../lib/auth";

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
  const str = String(val).trim();
  const num = Number(str);
  return Number.isNaN(num) ? null : num;
}

function parseDateValue(val) {
  if (!val) return new Date().toISOString();
  if (val instanceof Date) return val.toISOString();
  const d = new Date(val);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

export async function POST(request) {
  // Verificar sesión de administrador
  const adminToken = request.cookies.get(SESSION_COOKIE)?.value;
  if (!verifySessionToken(adminToken)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  const isPreview = formData.get("preview") === "true";
  const mappingRaw = formData.get("mapping");

  if (!file) {
    return NextResponse.json({ error: "No se envió ningún archivo" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    return NextResponse.json({ error: "El archivo Excel está vacío" }, { status: 400 });
  }

  const headers = [];
  const rows = [];

  worksheet.eachRow((row, rowNumber) => {
    const rowValues = row.values.slice(1);
    if (rowNumber === 1) {
      rowValues.forEach((cellVal, colIdx) => {
        headers.push(cellVal ? String(cellVal).trim() : `Columna ${colIdx + 1}`);
      });
    } else {
      const rowObj = {};
      let hasData = false;
      headers.forEach((h, idx) => {
        const val = rowValues[idx];
        const textVal = val !== null && val !== undefined ? String(val).trim() : "";
        rowObj[h] = textVal;
        if (textVal) hasData = true;
      });
      if (hasData) {
        rows.push(rowObj);
      }
    }
  });

  // Previsualización de muestra
  if (isPreview) {
    const samples = rows.slice(0, 3);
    return NextResponse.json({
      ok: true,
      headers,
      samples,
      totalRows: rows.length,
    });
  }

  let mapping = {};
  try {
    mapping = mappingRaw ? JSON.parse(mappingRaw) : {};
  } catch (err) {
    return NextResponse.json({ error: "Mapeo inválido" }, { status: 400 });
  }

  const pool = getPool();

  const { rows: cuestionarios } = await pool.query(
    `select id from cuestionarios where activo = true order by created_at desc limit 1`
  );
  if (cuestionarios.length === 0) {
    return NextResponse.json({ error: "No hay un cuestionario activo en el sistema" }, { status: 400 });
  }
  const cuestionarioId = cuestionarios[0].id;

  const { rows: preguntas } = await pool.query(
    `select id, orden, numero_reporte, texto, tipo, requiere_justificacion
     from preguntas where cuestionario_id = $1 and activa = true
     order by orden asc`,
    [cuestionarioId]
  );

  const client = await pool.connect();
  let importadas = 0;
  let duplicados = 0;
  const errores = [];

  try {
    await client.query("begin");

    for (let rIdx = 0; rIdx < rows.length; rIdx++) {
      const row = rows[rIdx];
      const numFila = rIdx + 2;

      let submissionId = null;
      let fecha = new Date().toISOString();
      let nombreEncuestador = "Encuestador Importado";
      let codigoCliente = null;
      let nombreCliente = "Cliente Importado";
      let pdv = "MATRIZ";
      let mesGestion = new Date().toLocaleDateString("es-EC", { month: "long" });

      const respuestasDict = {};
      const justificativoDict = {};

      Object.entries(mapping).forEach(([headerName, targetField]) => {
        const cellValue = row[headerName];
        if (!targetField || targetField === "ignore" || cellValue === undefined || cellValue === "") return;

        if (targetField === "submission_id") {
          submissionId = cellValue;
        } else if (targetField === "fecha") {
          fecha = parseDateValue(cellValue);
        } else if (targetField === "encuestador") {
          nombreEncuestador = cellValue;
        } else if (targetField === "codigo_cliente") {
          codigoCliente = cellValue;
        } else if (targetField === "nombre_cliente") {
          nombreCliente = cellValue;
        } else if (targetField === "pdv") {
          pdv = cellValue;
        } else if (targetField === "mes_gestion") {
          mesGestion = cellValue;
        } else if (targetField.startsWith("pregunta_")) {
          const qId = targetField.replace("pregunta_", "");
          respuestasDict[qId] = cellValue;
        } else if (targetField.startsWith("justificacion_")) {
          const qId = targetField.replace("justificacion_", "");
          justificativoDict[qId] = cellValue;
        }
      });

      // DEDUPLICACIÓN basándonos en FormId / Submission Id o cliente + fecha
      let esDuplicado = false;
      if (submissionId && UUID_REGEX.test(submissionId)) {
        const { rows: dups } = await client.query(
          `select id from encuestas where id = $1 limit 1`,
          [submissionId]
        );
        if (dups.length > 0) esDuplicado = true;
      } else if (codigoCliente) {
        const { rows: dups } = await client.query(
          `select id from encuestas where codigo_cliente = $1 and created_at = $2 limit 1`,
          [codigoCliente, fecha]
        );
        if (dups.length > 0) esDuplicado = true;
      }

      if (esDuplicado) {
        duplicados++;
        continue;
      }

      // 1. Obtener o crear encuestador
      let encuestadorId;
      const { rows: encRows } = await client.query(
        `select id from encuestadores where lower(trim(nombre)) = lower(trim($1)) limit 1`,
        [nombreEncuestador]
      );
      if (encRows.length > 0) {
        encuestadorId = encRows[0].id;
      } else {
        const { rows: newEnc } = await client.query(
          `insert into encuestadores (nombre, activo) values ($1, true) returning id`,
          [nombreEncuestador]
        );
        encuestadorId = newEnc[0].id;
      }

      // 2. Obtener o crear cliente en clientes_cache
      let clienteTwentyId = null;
      if (codigoCliente) {
        const { rows: cliRows } = await client.query(
          `select id_twenty from clientes_cache where codigo_cliente = $1 limit 1`,
          [codigoCliente]
        );
        if (cliRows.length > 0) {
          clienteTwentyId = cliRows[0].id_twenty;
        } else {
          const { rows: newCli } = await client.query(
            `insert into clientes_cache (id_twenty, codigo_cliente, nombre, pdv, mes_gestion)
             values (gen_random_uuid(), $1, $2, $3, $4)
             returning id_twenty`,
            [codigoCliente, nombreCliente, pdv, mesGestion]
          );
          clienteTwentyId = newCli[0].id_twenty;
        }
      }

      let completada = true;

      // 3. Crear registro en encuestas con ID especificado o autogenerado
      let encuestaId;
      if (submissionId && UUID_REGEX.test(submissionId)) {
        const { rows: encuestInsert } = await client.query(
          `insert into encuestas (id, cuestionario_id, cliente_twenty_id, codigo_cliente, encuestador_id, completada, created_at)
           values ($1, $2, $3, $4, $5, $6, $7)
           returning id`,
          [submissionId, cuestionarioId, clienteTwentyId, codigoCliente, encuestadorId, completada, fecha]
        );
        encuestaId = encuestInsert[0].id;
      } else {
        const { rows: encuestInsert } = await client.query(
          `insert into encuestas (cuestionario_id, cliente_twenty_id, codigo_cliente, encuestador_id, completada, created_at)
           values ($1, $2, $3, $4, $5, $6)
           returning id`,
          [cuestionarioId, clienteTwentyId, codigoCliente, encuestadorId, completada, fecha]
        );
        encuestaId = encuestInsert[0].id;
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
          const numVal = parseNumberValue(rawVal);
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
      }

      importadas++;
    }

    await client.query("commit");
    return NextResponse.json({ ok: true, importadas, duplicados, errores });
  } catch (err) {
    await client.query("rollback");
    console.error("Error en importación masiva:", err);
    return NextResponse.json({ error: `Error en importación: ${err.message}` }, { status: 500 });
  } finally {
    client.release();
  }
}
