import { NextResponse } from "next/server";
import { getPool } from "../../../../lib/db";
import { verifyPassword, createSessionToken, SESSION_COOKIE, SESSION_TTL_MS } from "../../../../lib/auth";

export const dynamic = "force-dynamic";

export async function POST(request) {
  const { email, password } = await request.json();

  if (!email || !password) {
    return NextResponse.json({ error: "Falta email o contraseña" }, { status: 400 });
  }

  const pool = getPool();
  const { rows } = await pool.query(
    `select id, password_hash from administradores where email = $1 and activo = true`,
    [email.toLowerCase()]
  );
  const admin = rows[0];

  if (!admin || !verifyPassword(password, admin.password_hash)) {
    return NextResponse.json({ error: "Credenciales inválidas" }, { status: 401 });
  }

  const token = createSessionToken(admin.id);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_TTL_MS / 1000,
    path: "/",
  });
  return res;
}
