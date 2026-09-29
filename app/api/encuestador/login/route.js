import { NextResponse } from "next/server";
import {
  createEncuestadorSessionToken,
  ENCUESTADOR_SESSION_COOKIE,
  SESSION_TTL_MS,
  safeEqual,
  ipDe,
  loginBloqueado,
  registrarLoginFallido,
  limpiarLoginFallido,
} from "../../../../lib/auth";

export const dynamic = "force-dynamic";

// Más holgado que el de administradores: en un call center todo el equipo suele
// salir a internet con la misma IP pública.
const MAX_INTENTOS_EQUIPO = 30;

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const password = typeof body.password === "string" ? body.password : "";

  if (!process.env.ENCUESTADOR_ACCESS_PASSWORD) {
    return NextResponse.json({ error: "No configurado (falta ENCUESTADOR_ACCESS_PASSWORD)" }, { status: 500 });
  }

  const clave = `encuestador:${ipDe(request)}`;
  const espera = loginBloqueado(clave, MAX_INTENTOS_EQUIPO);
  if (espera) {
    return NextResponse.json(
      { error: `Demasiados intentos fallidos. Intenta de nuevo en ${Math.ceil(espera / 60)} min.` },
      { status: 429, headers: { "Retry-After": String(espera) } }
    );
  }

  if (!password || !safeEqual(password, process.env.ENCUESTADOR_ACCESS_PASSWORD)) {
    registrarLoginFallido(clave);
    return NextResponse.json({ error: "Contraseña incorrecta" }, { status: 401 });
  }

  limpiarLoginFallido(clave);
  const token = createEncuestadorSessionToken();
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ENCUESTADOR_SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_TTL_MS / 1000,
    path: "/",
  });
  return res;
}
