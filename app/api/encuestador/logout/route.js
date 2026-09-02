import { NextResponse } from "next/server";
import { ENCUESTADOR_SESSION_COOKIE } from "../../../../lib/auth";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(ENCUESTADOR_SESSION_COOKIE);
  return res;
}
