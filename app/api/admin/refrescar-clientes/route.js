import { NextResponse } from "next/server";
import { refrescarCache, estadoRefresco } from "../../../../lib/refresco";
import { twentyConfigurado } from "../../../../lib/twenty";
import { verifySessionToken, SESSION_COOKIE } from "../../../../lib/auth";
import { errorJson, conErrores } from "../../../../lib/http";

export const dynamic = "force-dynamic";

// El proxy ya exige sesión de admin; se verifica también aquí por si cambia el matcher.
const esAdmin = (request) => Boolean(verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value));

// Estado del refresco de la copia local de clientes (última pasada, si hay una en curso).
export const GET = conErrores("GET /api/admin/refrescar-clientes", async (request) => {
  if (!esAdmin(request)) return errorJson("No autorizado", 401);
  return NextResponse.json(await estadoRefresco());
});

// Lanza un refresco ya (solo lectura en Twenty) y responde sin esperar: el avance
// se consulta con GET.
export const POST = conErrores("POST /api/admin/refrescar-clientes", async (request) => {
  if (!esAdmin(request)) return errorJson("No autorizado", 401);
  if (!twentyConfigurado()) return errorJson("Twenty CRM no está configurado", 409);
  refrescarCache().catch((err) => console.error("[refresco manual] Falló:", err.message));
  return NextResponse.json({ ok: true, enCurso: true }, { status: 202 });
});
