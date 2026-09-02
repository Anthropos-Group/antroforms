import { NextResponse } from "next/server";
import { getPool } from "../../../lib/db";

export const dynamic = "force-dynamic";

async function getCuestionarioActivoId(pool) {
  const { rows } = await pool.query(
    `select id from cuestionarios where activo = true order by created_at desc limit 1`
  );
  return rows[0]?.id ?? null;
}

export async function GET() {
  const pool = getPool();
  const cuestionarioId = await getCuestionarioActivoId(pool);
  if (!cuestionarioId) {
    return NextResponse.json({ cuestionario_id: null, preguntas: [] });
  }
  const { rows } = await pool.query(
    `select id, orden, numero_reporte, texto, tipo, requiere_justificacion, condicion, activa
     from preguntas where cuestionario_id = $1
     order by orden asc`,
    [cuestionarioId]
  );
  return NextResponse.json({ cuestionario_id: cuestionarioId, preguntas: rows });
}

export async function POST(request) {
  const body = await request.json();
  const { texto, tipo, orden, numero_reporte, requiere_justificacion, condicion } = body;

  if (!texto || !tipo) {
    return NextResponse.json({ error: "Faltan campos requeridos (texto, tipo)" }, { status: 400 });
  }

  const pool = getPool();
  const cuestionarioId = await getCuestionarioActivoId(pool);
  if (!cuestionarioId) {
    return NextResponse.json({ error: "No hay cuestionario activo" }, { status: 400 });
  }

  let ordenFinal = orden;
  if (ordenFinal === undefined || ordenFinal === null) {
    const { rows } = await pool.query(
      `select coalesce(max(orden), 0) + 1 as siguiente from preguntas where cuestionario_id = $1`,
      [cuestionarioId]
    );
    ordenFinal = rows[0].siguiente;
  }

  const { rows } = await pool.query(
    `insert into preguntas (cuestionario_id, orden, numero_reporte, texto, tipo, requiere_justificacion, condicion)
     values ($1, $2, $3, $4, $5, $6, $7)
     returning id, orden, numero_reporte, texto, tipo, requiere_justificacion, condicion, activa`,
    [cuestionarioId, ordenFinal, numero_reporte ?? ordenFinal, texto.trim(), tipo, !!requiere_justificacion, condicion ?? null]
  );
  return NextResponse.json(rows[0], { status: 201 });
}
