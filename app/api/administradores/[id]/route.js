import { NextResponse } from "next/server";
import { getPool } from "../../../../lib/db";
import { hashPassword } from "../../../../lib/auth";

export const dynamic = "force-dynamic";

export async function PATCH(request, { params }) {
  const { id } = await params;
  const body = await request.json();
  const pool = getPool();

  const sets = [];
  const valores = [];
  if (typeof body.nombre === "string") {
    valores.push(body.nombre.trim());
    sets.push(`nombre = $${valores.length}`);
  }
  if (typeof body.activo === "boolean") {
    valores.push(body.activo);
    sets.push(`activo = $${valores.length}`);
  }
  if (typeof body.password === "string" && body.password.length > 0) {
    if (body.password.length < 8) {
      return NextResponse.json({ error: "La contraseña debe tener al menos 8 caracteres" }, { status: 400 });
    }
    valores.push(hashPassword(body.password));
    sets.push(`password_hash = $${valores.length}`);
  }
  if (sets.length === 0) {
    return NextResponse.json({ error: "Nada que actualizar" }, { status: 400 });
  }

  valores.push(id);
  const { rows } = await pool.query(
    `update administradores set ${sets.join(", ")}, updated_at = now() where id = $${valores.length}
     returning id, nombre, email, activo`,
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
    `update administradores set activo = false, updated_at = now() where id = $1 returning id`,
    [id]
  );
  if (rows.length === 0) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
