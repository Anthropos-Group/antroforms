import { NextResponse } from "next/server";
import { getPool } from "../../../../lib/db";
import { MESES_ES, mesesPermitidosEncuestador } from "../../../../lib/fecha";

export const dynamic = "force-dynamic";

export async function GET() {
  const pool = getPool();
  const { rows } = await pool.query(
    `select distinct upper(trim(mes_gestion)) as mes
     from clientes_cache
     where mes_gestion is not null and trim(mes_gestion) <> ''`
  );

  const meses = rows
    .map((r) => r.mes)
    .sort((a, b) => {
      const ia = MESES_ES.indexOf(a);
      const ib = MESES_ES.indexOf(b);
      if (ia === -1 && ib === -1) return a.localeCompare(b);
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });

  // Meses de gestión (con la semana de anticipación), no de calendario.
  const [mesActual, mesAnterior] = mesesPermitidosEncuestador();
  return NextResponse.json({
    mesActual,
    mesAnterior,
    meses,
  });
}
