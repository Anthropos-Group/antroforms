import { NextResponse } from "next/server";
import { getPool } from "../../../lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const pool = getPool();
  const { rows } = await pool.query(
    `select id, nombre, activo from encuestadores order by nombre`
  );
  return NextResponse.json({ encuestadores: rows });
}

export async function POST(request) {
  const { nombre } = await request.json();
  if (!nombre || !nombre.trim()) {
    return NextResponse.json({ error: "Falta el nombre" }, { status: 400 });
  }
  const pool = getPool();
  const { rows } = await pool.query(
    `insert into encuestadores (nombre) values ($1) returning id, nombre, activo`,
    [nombre.trim()]
  );
  return NextResponse.json(rows[0], { status: 201 });
}
