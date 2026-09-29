import { NextResponse } from "next/server";
import { runSync, iniciarSync, VALID_MODES } from "../../../../lib/sync";
import { verifySessionToken, SESSION_COOKIE, safeEqual, adminSigueActivo } from "../../../../lib/auth";
import { getPool } from "../../../../lib/db";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

async function estaAutorizado(request) {
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret) {
    // 1. Header Bearer token
    const authHeader = request.headers.get("authorization") || "";
    if (authHeader.startsWith("Bearer ") && safeEqual(authHeader.slice(7), cronSecret)) return true;

    // 2. Query param ?secret=... o ?key=... (para servicios externos de cron sencillos).
    //    Preferir el header: la URL con el secreto puede quedar en logs de proxies.
    const { searchParams } = new URL(request.url);
    const paramSecret = searchParams.get("secret") || searchParams.get("key");
    if (paramSecret && safeEqual(paramSecret, cronSecret)) return true;
  }

  // 3. Sesión activa de administrador (para botón manual en /admin/sync)
  const adminId = verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (adminId) {
    try {
      return await adminSigueActivo(adminId, getPool);
    } catch {
      return false;
    }
  }

  return false;
}

async function ejecutarSincronizacion(request, modeOverride, maxPagesOverride, esperarOverride) {
  if (!(await estaAutorizado(request))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const mode = modeOverride || searchParams.get("modo") || "incremental";
  const maxPagesRaw = maxPagesOverride ?? (searchParams.get("max_pages") ? Number(searchParams.get("max_pages")) : 50);
  const maxPages = Number.isFinite(maxPagesRaw) && maxPagesRaw > 0 ? Math.min(Math.floor(maxPagesRaw), 1000) : 50;

  if (!VALID_MODES.includes(mode)) {
    return NextResponse.json(
      { error: `Modo inválido: ${mode}. Usa uno de: ${VALID_MODES.join(", ")}` },
      { status: 400 }
    );
  }

  // Por defecto la corrida sigue en segundo plano y se responde de inmediato con su
  // id (202): una corrida grande tarda minutos y Cloudflare corta el request a los
  // 100 s. `?esperar=1` mantiene el comportamiento anterior (esperar el resultado).
  const esperar = esperarOverride ?? ["1", "true", "si"].includes(searchParams.get("esperar") || "");

  try {
    if (!esperar) {
      const { syncRunId } = await iniciarSync({ mode, maxPages });
      return NextResponse.json(
        { ok: true, sync_run_id: syncRunId, tipo: mode, estado: "en_progreso" },
        { status: 202 }
      );
    }

    const result = await runSync({ mode, maxPages });
    return NextResponse.json({
      ok: true,
      sync_run_id: result.syncRunId,
      tipo: mode,
      registros_escaneados: result.escaneados,
      registros_modificados: result.modificados,
      errores: result.errores,
      estado: result.estado,
      parcial: result.parcial,
    });
  } catch (err) {
    if (err.code === "SYNC_EN_CURSO") {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
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

  return await ejecutarSincronizacion(
    request,
    body.modo,
    body.max_pages,
    typeof body.esperar === "boolean" ? body.esperar : undefined
  );
}

