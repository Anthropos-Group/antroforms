import { NextResponse } from "next/server";
import { getPool } from "../../../../lib/db";

export const dynamic = "force-dynamic";

export async function PATCH(request, { params }) {
  const { id } = await params;
  const body = await request.json();
  const pool = getPool();

  const campos = [];
  const valores = [];
  if (typeof body.nombre === "string") {
    valores.push(body.nombre.trim());
    campos.push(`nombre = $${valores.length}`);
  }
  if (typeof body.activo === "boolean") {
    valores.push(body.activo);
    campos.push(`activo = $${valores.length}`);
  }
  if (campos.length === 0) {
    return NextResponse.json({ error: "Nada que actualizar" }, { status: 400 });
  }

  valores.push(id);
  const { rows } = await pool.query(
    `update encuestadores set ${campos.join(", ")}, updated_at = now() where id = $${valores.length} returning id, nombre, activo`,
    valores
  );
  if (rows.length === 0) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }
  return NextResponse.json(rows[0]);
}

export async function DELETE(request, { params }) {
  const { id } = await params;
  const pool = getPool();
  const { rows } = await pool.query(
    `update encuestadores set activo = false, updated_at = now() where id = $1 returning id`,
    [id]
  );
  if (rows.length === 0) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
