import { NextResponse } from "next/server";
import { runSync, VALID_MODES } from "../../../../lib/sync";
import { verifySessionToken, SESSION_COOKIE } from "../../../../lib/auth";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

function estaAutorizado(request) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");

  // 1. Header Bearer token
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    return true;
  }

  // 2. Query param ?secret=... o ?key=... (ideal para servicios externos de cron sencillos)
  const { searchParams } = new URL(request.url);
  const paramSecret = searchParams.get("secret") || searchParams.get("key");
  if (cronSecret && paramSecret === cronSecret) {
    return true;
  }

  // 3. Sesión activa de administrador (para botón manual en /admin/sync)
  const adminToken = request.cookies.get(SESSION_COOKIE)?.value;
  if (verifySessionToken(adminToken)) {
    return true;
  }

  return false;
}

async function ejecutarSincronizacion(request, modeOverride, maxPagesOverride) {
  if (!estaAutorizado(request)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const mode = modeOverride || searchParams.get("modo") || "incremental";
  const maxPages = maxPagesOverride ?? (searchParams.get("max_pages") ? Number(searchParams.get("max_pages")) : 5);

  if (!VALID_MODES.includes(mode)) {
    return NextResponse.json(
      { error: `Modo inválido: ${mode}. Usa uno de: ${VALID_MODES.join(", ")}` },
      { status: 400 }
    );
  }

  try {
    const result = await runSync({ mode, maxPages });
    return NextResponse.json({
      ok: true,
      sync_run_id: result.syncRunId,
      tipo: mode,
      registros_escaneados: result.escaneados,
      registros_modificados: result.modificados,
      errores: result.errores,
      estado: result.estado,
    });
  } catch (err) {
    console.error("Error en cron sync-twenty:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function GET(request) {
  return await ejecutarSincronizacion(request);
}

export async function POST(request) {
  let body = {};
  try {
    body = await request.json();
  } catch {
    // Sin body es válido
  }

  return await ejecutarSincronizacion(request, body.modo, body.max_pages);
}

