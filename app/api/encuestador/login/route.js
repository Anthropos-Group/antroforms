import { NextResponse } from "next/server";
import { createEncuestadorSessionToken, ENCUESTADOR_SESSION_COOKIE, SESSION_TTL_MS } from "../../../../lib/auth";

export const dynamic = "force-dynamic";

export async function POST(request) {
  const { password } = await request.json();

  if (!process.env.ENCUESTADOR_ACCESS_PASSWORD) {
    return NextResponse.json({ error: "No configurado (falta ENCUESTADOR_ACCESS_PASSWORD)" }, { status: 500 });
  }
  if (!password || password !== process.env.ENCUESTADOR_ACCESS_PASSWORD) {
    return NextResponse.json({ error: "Contraseña incorrecta" }, { status: 401 });
  }

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
