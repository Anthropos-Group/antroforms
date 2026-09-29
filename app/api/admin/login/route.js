import { NextResponse } from "next/server";
import { getPool } from "../../../../lib/db";
import {
  verifyPassword,
  createSessionToken,
  SESSION_COOKIE,
  SESSION_TTL_MS,
  ipDe,
  loginBloqueado,
  registrarLoginFallido,
  limpiarLoginFallido,
} from "../../../../lib/auth";

export const dynamic = "force-dynamic";

// Hash de relleno para que un email inexistente tarde lo mismo que uno válido
// (no revela por tiempo de respuesta qué correos tienen cuenta).
const HASH_RELLENO = "00000000000000000000000000000000:" + "0".repeat(128);

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!email || !password) {
    return NextResponse.json({ error: "Falta email o contraseña" }, { status: 400 });
  }

  const clave = `admin:${ipDe(request)}:${email}`;
  const espera = loginBloqueado(clave);
  if (espera) {
    return NextResponse.json(
      { error: `Demasiados intentos fallidos. Intenta de nuevo en ${Math.ceil(espera / 60)} min.` },
      { status: 429, headers: { "Retry-After": String(espera) } }
    );
  }

  try {
    const pool = getPool();
    const { rows } = await pool.query(
      `select id, password_hash from administradores where email = $1 and activo = true`,
      [email]
    );
    const admin = rows[0];
    const valido = verifyPassword(password, admin?.password_hash || HASH_RELLENO) && Boolean(admin);

    if (!valido) {
      registrarLoginFallido(clave);
      return NextResponse.json({ error: "Credenciales inválidas" }, { status: 401 });
    }

    limpiarLoginFallido(clave);
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
  } catch (err) {
    console.error("Error en login de administrador:", err);
    return NextResponse.json({ error: "No se pudo validar el acceso. Intenta de nuevo." }, { status: 500 });
  }
}
