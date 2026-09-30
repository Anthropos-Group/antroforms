import { NextResponse } from "next/server";
import { estadoMesGestion, guardarConfig } from "../../../../lib/gestion";
import { verifySessionToken, SESSION_COOKIE } from "../../../../lib/auth";
import { errorJson, leerJson, conErrores } from "../../../../lib/http";

export const dynamic = "force-dynamic";

// El proxy ya exige sesión de admin; se verifica también aquí por si cambia el matcher.
const esAdmin = (request) => Boolean(verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value));

// Mes de gestión activo para los encuestadores y cómo se decide (ver lib/gestion.js).
export const GET = conErrores("GET /api/admin/mes-gestion", async (request) => {
  if (!esAdmin(request)) return errorJson("No autorizado", 401);
  return NextResponse.json(await estadoMesGestion());
});

export const PUT = conErrores("PUT /api/admin/mes-gestion", async (request) => {
  if (!esAdmin(request)) return errorJson("No autorizado", 401);
  const body = await leerJson(request);
  if (!body) return errorJson("Cuerpo de la solicitud inválido");
  const { error } = await guardarConfig(body);
  if (error) return errorJson(error);
  return NextResponse.json(await estadoMesGestion());
});
