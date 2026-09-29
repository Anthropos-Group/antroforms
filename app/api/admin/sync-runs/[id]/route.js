import { NextResponse } from "next/server";
import { getPool } from "../../../../../lib/db";
import { esUUID, errorJson, conErrores } from "../../../../../lib/http";
import { verifySessionToken, SESSION_COOKIE } from "../../../../../lib/auth";

export const dynamic = "force-dynamic";

// Estado y avance de una corrida de sincronización (el botón del panel la consulta
// cada pocos segundos mientras corre en segundo plano).
export const GET = conErrores("GET /api/admin/sync-runs/[id]", async (request, { params }) => {
  // El proxy ya exige sesión de admin; se verifica también aquí por si cambia el matcher.
  if (!verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value)) return errorJson("No autorizado", 401);
  const { id } = await params;
  if (!esUUID(id)) return errorJson("Id de corrida inválido");

  const { rows } = await getPool().query(
    // `*` en vez de columnas explícitas: `detalle` no existe hasta la migración 0010.
    `select * from sync_runs where id = $1`,
    [id]
  );
  if (!rows[0]) return errorJson("Corrida no encontrada", 404);
  return NextResponse.json(rows[0]);
});
