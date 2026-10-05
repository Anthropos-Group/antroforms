import { NextResponse } from "next/server";
import { getPool } from "../../../../lib/db";
import { verifySessionToken, SESSION_COOKIE } from "../../../../lib/auth";
import { errorJson, leerJson, conErrores } from "../../../../lib/http";

export const dynamic = "force-dynamic";

// Marca o desmarca un PDV como "meta improbable" (se ve en naranja en el monitoreo).
export const PUT = conErrores("PUT /api/admin/pdv-config", async (request) => {
  // El proxy ya exige sesión de admin; se verifica también aquí por si cambia el matcher.
  if (!verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value)) return errorJson("No autorizado", 401);
  const body = await leerJson(request);
  const pdv = typeof body?.pdv === "string" ? body.pdv.trim() : "";
  if (!pdv || pdv.length > 200 || typeof body.meta_improbable !== "boolean") return errorJson("Datos inválidos");

  await getPool().query(
    `insert into pdv_config (pdv, meta_improbable, actualizado_en) values ($1, $2, now())
     on conflict (pdv) do update set meta_improbable = excluded.meta_improbable, actualizado_en = now()`,
    [pdv, body.meta_improbable]
  );
  return NextResponse.json({ ok: true, pdv, meta_improbable: body.meta_improbable });
});
