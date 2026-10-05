import { NextResponse } from "next/server";
import { getPool } from "../../../../lib/db";
import { usoSupabase } from "../../../../lib/uso";
import { verifySessionToken, SESSION_COOKIE } from "../../../../lib/auth";
import { errorJson, conErrores } from "../../../../lib/http";

export const dynamic = "force-dynamic";

// Uso del proyecto de Supabase frente a los límites del plan (ver lib/uso.js).
export const GET = conErrores("GET /api/admin/uso", async (request) => {
  // El proxy ya exige sesión de admin; se verifica también aquí por si cambia el matcher.
  if (!verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value)) return errorJson("No autorizado", 401);
  return NextResponse.json(await usoSupabase(getPool()));
});
