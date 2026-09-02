import { NextResponse } from "next/server";
import { getPool } from "../../../lib/db";
import { patchPerson } from "../../../lib/twenty";
import { obtenerReporte } from "../../../lib/reportes";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const desde = searchParams.get("desde");
  const hasta = searchParams.get("hasta");
  const encuestadorId = searchParams.get("encuestador_id");

  const pool = getPool();
  const reporte = await obtenerReporte(pool, { desde, hasta, encuestadorId, limit: 500 });
  if (!reporte) {
    return NextResponse.json({ preguntas: [], encuestas: [] });
  }

  return NextResponse.json({
    preguntas: reporte.cuestionario.preguntas.map((p) => ({
      id: p.id,
      orden: p.orden,
      numero_reporte: p.numero_reporte ?? p.orden,
      texto: p.texto,
      requiere_justificacion: p.requiere_justificacion,
    })),
    encuestas: reporte.encuestas.map((e) => ({
      id: e.id,
      created_at: e.created_at,
      completada: e.completada,
      codigo_cliente: e.codigo_cliente,
      encuestador_nombre: e.encuestador_nombre,
      cliente_nombre: e.cliente_nombre,
      respuestas: e.respuestas,
    })),
  });
}

export async function POST(request) {
  const body = await request.json();
  const {
    cuestionario_id,
    cliente_twenty_id,
    codigo_cliente,
    encuestador_id,
    completada,
    respuestas,
  } = body;

  if (!cuestionario_id || !cliente_twenty_id || !encuestador_id || !Array.isArray(respuestas)) {
    return NextResponse.json({ error: "Faltan campos requeridos" }, { status: 400 });
  }

  const pool = getPool();
  const client = await pool.connect();

  let encuestaId;
  try {
    await client.query("begin");

    const { rows } = await client.query(
      `insert into encuestas (cuestionario_id, cliente_twenty_id, codigo_cliente, encuestador_id, completada)
       values ($1, $2, $3, $4, $5)
       returning id`,
      [cuestionario_id, cliente_twenty_id, codigo_cliente ?? null, encuestador_id, !!completada]
    );
    encuestaId = rows[0].id;

    for (const r of respuestas) {
      await client.query(
        `insert into respuestas (encuesta_id, pregunta_id, valor) values ($1, $2, $3)`,
        [encuestaId, r.pregunta_id, JSON.stringify(r.valor)]
      );
    }

    await client.query("commit");
  } catch (err) {
    await client.query("rollback");
    return NextResponse.json({ error: err.message }, { status: 500 });
  } finally {
    client.release();
  }

  let twentyError = null;
  if (completada) {
    try {
      await patchPerson(cliente_twenty_id, { status: "EFECTIVA" });
    } catch (err) {
      twentyError = err.message;
      console.error(`No se pudo actualizar status en Twenty para ${cliente_twenty_id}:`, err.message);
    }
  }

  return NextResponse.json({ id: encuestaId, twentyError });
}
