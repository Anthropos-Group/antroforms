import { NextResponse } from "next/server";
import { getPool } from "../../../lib/db";
import { hashPassword } from "../../../lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const pool = getPool();
  const { rows } = await pool.query(
    `select id, nombre, email, activo, created_at from administradores order by nombre`
  );
  return NextResponse.json({ administradores: rows });
}

export async function POST(request) {
  const { nombre, email, password } = await request.json();
  if (!nombre || !email || !password) {
    return NextResponse.json({ error: "Faltan campos (nombre, email, password)" }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "La contraseña debe tener al menos 8 caracteres" }, { status: 400 });
  }

  const pool = getPool();
  try {
    const { rows } = await pool.query(
      `insert into administradores (nombre, email, password_hash)
       values ($1, $2, $3)
       returning id, nombre, email, activo`,
      [nombre.trim(), email.trim().toLowerCase(), hashPassword(password)]
    );
    return NextResponse.json(rows[0], { status: 201 });
  } catch (err) {
    if (err.code === "23505") {
      return NextResponse.json({ error: "Ya existe un administrador con ese email" }, { status: 409 });
    }
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
