import { NextResponse } from "next/server";
import { getPool } from "../../../lib/db";
import { patchPerson, twentyConfigurado } from "../../../lib/twenty";
import { obtenerReporte, obtenerResumen, leerFiltros } from "../../../lib/reportes";
import { prepararEnvio } from "../../../lib/encuesta-logica";
import { esUUID, errorJson, leerJson, conErrores } from "../../../lib/http";
import { verifySessionToken, SESSION_COOKIE } from "../../../lib/auth";
import { mesesPermitidosEncuestador, mesPermitidoEncuestador } from "../../../lib/fecha";

export const dynamic = "force-dynamic";

// Tope de filas que se mandan al navegador; los KPIs se calculan en SQL sobre
// el universo completo, así que no se distorsionan si se supera el tope.
const LIMITE_LISTADO = 1000;

export const GET = conErrores("GET /api/encuestas", async (request) => {
  const { searchParams } = new URL(request.url);
  const filtros = leerFiltros(searchParams);
  const pool = getPool();

  const [reporte, resumen] = await Promise.all([
    obtenerReporte(pool, { ...filtros, limit: LIMITE_LISTADO }),
    obtenerResumen(pool, filtros),
  ]);
  if (!reporte) {
    return NextResponse.json({ preguntas: [], encuestas: [], resumen: null });
  }

  return NextResponse.json({
    preguntas: reporte.cuestionario.preguntas.map((p) => ({
      id: p.id,
      orden: p.orden,
      numero_reporte: p.numero_reporte ?? p.orden,
      texto: p.texto,
      tipo: p.tipo,
      requiere_justificacion: p.requiere_justificacion,
    })),
    encuestas: reporte.encuestas,
    resumen,
    limite: LIMITE_LISTADO,
    truncado: resumen.total > reporte.encuestas.length,
  });
});

async function cargarCuestionarioActivo(pool) {
  const { rows } = await pool.query(
    `select id from cuestionarios where activo = true order by created_at desc limit 1`
  );
  if (!rows[0]) return null;
  const { rows: preguntas } = await pool.query(
    `select id, orden, numero_reporte, texto, tipo, requiere_justificacion, condicion
     from preguntas where cuestionario_id = $1 and activa = true
     order by orden asc`,
    [rows[0].id]
  );
  return { id: rows[0].id, preguntas };
}

export const POST = conErrores("POST /api/encuestas", async (request) => {
  const body = await leerJson(request);
  if (!body) return errorJson("Cuerpo de la solicitud inválido");

  const { cuestionario_id, cliente_twenty_id, encuestador_id, respuestas } = body;
  const idempotencyKey =
    typeof body.idempotency_key === "string" && body.idempotency_key.trim()
      ? body.idempotency_key.trim().slice(0, 100)
      : null;

  if (!esUUID(cliente_twenty_id) || !esUUID(encuestador_id) || !Array.isArray(respuestas)) {
    return errorJson("Faltan campos requeridos para registrar la encuesta");
  }

  const pool = getPool();

  // 1. Idempotencia: el mismo envío reintentado (doble clic, red intermitente,
  //    reintento tras un error) devuelve la encuesta ya creada en vez de duplicarla.
  if (idempotencyKey) {
    const { rows } = await pool.query(
      `select id, completada from encuestas where idempotency_key = $1`,
      [idempotencyKey]
    );
    if (rows[0]) {
      return NextResponse.json({ id: rows[0].id, completada: rows[0].completada, duplicada: true });
    }
  }

  // 2. Contexto real desde la BD (no se confía en lo que manda el navegador).
  const cuestionario = await cargarCuestionarioActivo(pool);
  if (!cuestionario) return errorJson("No hay un cuestionario activo", 409);
  if (cuestionario_id && cuestionario_id !== cuestionario.id) {
    return errorJson(
      "El cuestionario cambió mientras se llenaba esta encuesta. Recarga la página: el borrador se conserva.",
      409,
      { code: "CUESTIONARIO_DESACTUALIZADO" }
    );
  }

  const [{ rows: encRows }, { rows: cliRows }] = await Promise.all([
    pool.query(`select id from encuestadores where id = $1`, [encuestador_id]),
    pool.query(`select * from clientes_cache where id_twenty = $1`, [cliente_twenty_id]),
  ]);
  if (!encRows[0]) return errorJson("El encuestador seleccionado no existe", 400);
  const cliente = cliRows[0];
  if (!cliente) return errorJson("El cliente no existe en la base de clientes", 404);

  // El encuestador solo registra clientes del mes de gestión en curso o del anterior
  // (p. ej. en septiembre: septiembre y agosto, no julio). El admin no tiene el límite.
  const esAdmin = Boolean(verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value));
  if (!esAdmin && !mesPermitidoEncuestador(cliente.mes_gestion)) {
    const [actual, anterior] = mesesPermitidosEncuestador();
    return errorJson(
      `Este cliente es del mes de gestión ${cliente.mes_gestion?.trim() || "(sin mes)"}; solo se pueden registrar encuestas de ${actual} y ${anterior}.`,
      422,
      { code: "MES_NO_PERMITIDO" }
    );
  }

  // 3. Validación con las mismas reglas que la UI y cálculo del estado final.
  const idsValidos = new Set(cuestionario.preguntas.map((p) => p.id));
  const mapa = {};
  for (const r of respuestas) {
    if (r && idsValidos.has(r.pregunta_id)) mapa[r.pregunta_id] = r.valor;
  }
  const envio = prepararEnvio(cuestionario.preguntas, mapa, cliente);
  if (!envio.valido) {
    return errorJson(
      "Faltan respuestas o hay valores inválidos. Si el cuestionario fue modificado, recarga la página (el borrador se conserva).",
      422,
      { code: "RESPUESTAS_INVALIDAS", errores: envio.errores }
    );
  }

  const targetStatus = envio.completada ? "EFECTIVA" : envio.rechazo ? "NO_LLAMAR" : null;

  // 4. Transacción con candado por cliente: dos encuestadores (o dos pestañas)
  //    no pueden registrar a la vez una encuesta efectiva del mismo cliente.
  const client = await pool.connect();
  let encuestaId;
  try {
    await client.query("begin");
    await client.query(`select pg_advisory_xact_lock(hashtext($1))`, [cliente_twenty_id]);

    const { rows: previas } = await client.query(
      `select e.id, e.created_at, enc.nombre as encuestador
       from encuestas e left join encuestadores enc on enc.id = e.encuestador_id
       where e.completada = true
         and (e.cliente_twenty_id = $1 or ($2::text is not null and e.codigo_cliente = $2))
       order by e.created_at desc limit 1`,
      [cliente_twenty_id, cliente.codigo_cliente]
    );
    if (previas[0]) {
      await client.query("rollback");
      const fecha = new Date(previas[0].created_at).toLocaleString("es-EC", { timeZone: "America/Guayaquil" });
      return errorJson(
        `Este cliente ya tiene una encuesta efectiva registrada${previas[0].encuestador ? ` por ${previas[0].encuestador}` : ""} (${fecha}); no se guardó una segunda.`,
        409,
        { code: "YA_ENCUESTADO", id: previas[0].id }
      );
    }

    // Red de seguridad para clientes sin idempotency_key (versiones viejas de la UI).
    const { rows: recientes } = await client.query(
      `select id, completada from encuestas
       where cliente_twenty_id = $1 and encuestador_id = $2 and created_at > now() - interval '5 minutes'
       order by created_at desc limit 1`,
      [cliente_twenty_id, encuestador_id]
    );
    if (recientes[0] && !idempotencyKey) {
      await client.query("rollback");
      return NextResponse.json({ id: recientes[0].id, completada: recientes[0].completada, duplicada: true });
    }

    const { rows } = await client.query(
      `insert into encuestas (cuestionario_id, cliente_twenty_id, codigo_cliente, encuestador_id, completada, idempotency_key)
       values ($1, $2, $3, $4, $5, $6)
       returning id`,
      [cuestionario.id, cliente_twenty_id, cliente.codigo_cliente ?? null, encuestador_id, envio.completada, idempotencyKey]
    );
    encuestaId = rows[0].id;

    if (envio.respuestas.length > 0) {
      const placeholders = [];
      const params = [];
      envio.respuestas.forEach((r, i) => {
        placeholders.push(`($${i * 3 + 1}, $${i * 3 + 2}, $${i * 3 + 3})`);
        params.push(encuestaId, r.pregunta_id, JSON.stringify(r.valor));
      });
      await client.query(
        `insert into respuestas (encuesta_id, pregunta_id, valor) values ${placeholders.join(", ")}`,
        params
      );
    }

    // La caché local se actualiza en la misma transacción: el cliente desaparece
    // del buscador de inmediato aunque Twenty tarde o esté caído.
    if (targetStatus) {
      await client.query(
        `update clientes_cache set status = $1, synced_at = now() where id_twenty = $2`,
        [targetStatus, cliente_twenty_id]
      );
    }

    await client.query("commit");
  } catch (err) {
    await client.query("rollback").catch(() => {});
    // Carrera entre dos reintentos con la misma idempotency_key.
    if (err.code === "23505" && idempotencyKey) {
      const { rows } = await pool.query(`select id, completada from encuestas where idempotency_key = $1`, [idempotencyKey]);
      if (rows[0]) return NextResponse.json({ id: rows[0].id, completada: rows[0].completada, duplicada: true });
    }
    throw err;
  } finally {
    client.release();
  }

  // 5. Cierre del ciclo con Twenty (fuera de la transacción). Timeout corto para
  //    no dejar esperando al encuestador; si falla, queda en la cola de reintentos.
  let twentyError = null;
  if (targetStatus && twentyConfigurado()) {
    try {
      await patchPerson(cliente_twenty_id, { status: targetStatus }, { timeoutMs: 8000, reintentos: 0 });
    } catch (err) {
      twentyError = err.message;
      console.error(`Twenty CRM no respondió para ${cliente_twenty_id}. Encolando reintento:`, err.message);
      try {
        await pool.query(
          `insert into pending_twenty_sync (cliente_twenty_id, status_target, ultimo_error) values ($1, $2, $3)`,
          [cliente_twenty_id, targetStatus, err.message.slice(0, 1000)]
        );
      } catch (qErr) {
        console.warn("No se pudo registrar en pending_twenty_sync:", qErr.message);
      }
    }
  }

  return NextResponse.json(
    { id: encuestaId, completada: envio.completada, status: targetStatus, twentyError },
    { status: 201 }
  );
});
