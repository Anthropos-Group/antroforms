import { NextResponse } from "next/server";
import { getPool } from "../../../../lib/db";
import { MESES_ES } from "../../../../lib/fecha";
import { mesGestionActivo } from "../../../../lib/gestion";
import { memo } from "../../../../lib/cache";
import { conErrores } from "../../../../lib/http";

export const dynamic = "force-dynamic";

// Recorre la copia local completa y se pide en cada carga de pantalla; los meses
// presentes cambian solo con una carga nueva de clientes.
const CACHE_MESES_MS = 60_000;

async function mesesPresentes(pool) {
  const { rows } = await pool.query(
    `select distinct upper(trim(mes_gestion)) as mes
     from clientes_cache
     where mes_gestion is not null and trim(mes_gestion) <> ''`
  );
  return rows
    .map((r) => r.mes)
    .sort((a, b) => {
      const ia = MESES_ES.indexOf(a);
      const ib = MESES_ES.indexOf(b);
      if (ia === -1 && ib === -1) return a.localeCompare(b);
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
}

export const GET = conErrores("GET /api/clientes/meses", async () => {
  const pool = getPool();
  const meses = await memo("meses-clientes", CACHE_MESES_MS, () => mesesPresentes(pool));

  // Mes de gestión activo (el único que ve el encuestador).
  const activo = await mesGestionActivo(pool);
  return NextResponse.json({
    mesActivo: activo.nombre,
    periodoActivo: activo.periodo,
    meses,
  });
});
