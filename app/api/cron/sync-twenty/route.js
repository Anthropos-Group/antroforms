import { NextResponse } from "next/server";
import { runSync, VALID_MODES } from "../../../../lib/sync";

// Backfills grandes (20k+ registros) pueden exceder el límite de duración de
// funciones serverless incluso con maxDuration elevado. Para el backfill inicial
// o reconciliaciones completas, usar el CLI (`npm run sync:twenty -- --mode=backfill_completo`)
// desde un entorno sin ese límite. Este endpoint está pensado para la corrida
// diaria incremental (solo registros actualizados desde la última corrida).
export const maxDuration = 300;

export async function POST(request) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  let body = {};
  try {
    body = await request.json();
  } catch {
    // sin body es válido, se usa el modo por defecto
  }

  const mode = body.modo || "incremental";
  if (!VALID_MODES.includes(mode)) {
    return NextResponse.json(
      { error: `Modo inválido: ${mode}. Usa uno de: ${VALID_MODES.join(", ")}` },
      { status: 400 }
    );
  }

  try {
    const result = await runSync({ mode });
    return NextResponse.json({
      sync_run_id: result.syncRunId,
      registros_escaneados: result.escaneados,
      registros_modificados: result.modificados,
      errores: result.errores,
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
