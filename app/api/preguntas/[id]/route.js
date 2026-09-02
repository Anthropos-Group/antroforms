import { NextResponse } from "next/server";
import { getPool } from "../../../../lib/db";

export const dynamic = "force-dynamic";

const CAMPOS_EDITABLES = {
  texto: "text",
  tipo: "text",
  orden: "int",
  numero_reporte: "int",
  requiere_justificacion: "bool",
  condicion: "json",
  activa: "bool",
};

export async function PATCH(request, { params }) {
  const { id } = await params;
  const body = await request.json();
  const pool = getPool();

  const sets = [];
  const valores = [];
  for (const [campo, kind] of Object.entries(CAMPOS_EDITABLES)) {
    if (!(campo in body)) continue;
    let valor = body[campo];
    if (kind === "text" && typeof valor === "string") valor = valor.trim();
    if (kind === "json") valor = valor === null ? null : JSON.stringify(valor);
    valores.push(valor);
    sets.push(`${campo} = $${valores.length}`);
  }

  if (sets.length === 0) {
    return NextResponse.json({ error: "Nada que actualizar" }, { status: 400 });
  }

  valores.push(id);
  const { rows } = await pool.query(
    `update preguntas set ${sets.join(", ")} where id = $${valores.length}
     returning id, orden, numero_reporte, texto, tipo, requiere_justificacion, condicion, activa`,
    valores
  );
  if (rows.length === 0) {
    return NextResponse.json({ error: "No encontrada" }, { status: 404 });
  }
  return NextResponse.json(rows[0]);
}

export async function DELETE(request, { params }) {
  const { id } = await params;
  const pool = getPool();
  const { rows } = await pool.query(
    `update preguntas set activa = false where id = $1 returning id`,
    [id]
  );
  if (rows.length === 0) {
    return NextResponse.json({ error: "No encontrada" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
