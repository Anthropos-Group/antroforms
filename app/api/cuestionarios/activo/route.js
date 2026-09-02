import { NextResponse } from "next/server";
import { getPool } from "../../../../lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const pool = getPool();

  const { rows: cuestionarios } = await pool.query(
    `select id, nombre, version, guion_apertura, guion_cierre from cuestionarios where activo = true order by created_at desc limit 1`
  );
  const cuestionario = cuestionarios[0];
  if (!cuestionario) {
    return NextResponse.json({ error: "No hay cuestionario activo" }, { status: 404 });
  }

  const { rows: preguntas } = await pool.query(
    `select id, orden, texto, tipo, requiere_justificacion, condicion
     from preguntas
     where cuestionario_id = $1 and activa = true
     order by orden asc`,
    [cuestionario.id]
  );

  return NextResponse.json({ ...cuestionario, preguntas });
}
