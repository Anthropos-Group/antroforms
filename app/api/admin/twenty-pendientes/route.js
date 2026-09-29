import { NextResponse } from "next/server";
import { getPool } from "../../../../lib/db";
import { procesarReintentosTwenty, MAX_INTENTOS_TWENTY } from "../../../../lib/sync";
import { twentyConfigurado } from "../../../../lib/twenty";
import { conErrores, errorJson } from "../../../../lib/http";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Cola de cambios de estado (EFECTIVA / NO_LLAMAR) que no se pudieron escribir
// en Twenty al cerrar la encuesta. Solo admin (ver proxy.js).
export const GET = conErrores("GET /api/admin/twenty-pendientes", async () => {
  const pool = getPool();
  const { rows } = await pool.query(
    `select p.id, p.cliente_twenty_id, p.status_target, p.intentos, p.ultimo_error, p.creado_en, p.actualizado_en,
            cc.nombre as cliente_nombre, cc.codigo_cliente
     from pending_twenty_sync p
     left join clientes_cache cc on cc.id_twenty = p.cliente_twenty_id
     order by p.creado_en asc
     limit 200`
  );
  return NextResponse.json({
    pendientes: rows,
    agotados: rows.filter((r) => r.intentos >= MAX_INTENTOS_TWENTY).length,
    max_intentos: MAX_INTENTOS_TWENTY,
  });
});

// Reintenta ahora todos los pendientes, incluidos los que agotaron los reintentos automáticos.
export const POST = conErrores("POST /api/admin/twenty-pendientes", async () => {
  if (!twentyConfigurado()) return errorJson("Twenty CRM no está configurado (TWENTY_API_URL / TWENTY_API_KEY)", 400);
  const resultado = await procesarReintentosTwenty(getPool(), { incluirAgotados: true, limite: 200 });
  return NextResponse.json({ ok: true, ...resultado });
});
