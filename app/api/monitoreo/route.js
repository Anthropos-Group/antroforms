import { NextResponse } from "next/server";
import { getPool } from "../../../lib/db";

export const dynamic = "force-dynamic";

// Meta mensual por PDV — regla de negocio del cliente (38 sucursales x 25 = ~950,
// coherente con el volumen de EFECTIVA/mes que se ve en Twenty).
const META_MENSUAL_POR_PDV = 25;

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const mes = searchParams.get("mes") || new Date().toISOString().slice(0, 7); // YYYY-MM

  const pool = getPool();

  const { rows: pdvs } = await pool.query(
    `with pdvs as (
       select distinct trim(pdv) as pdv
       from clientes_cache
       where pdv is not null and trim(pdv) <> ''
     ),
     conteos as (
       select trim(cc.pdv) as pdv, count(*)::int as completadas
       from encuestas e
       join clientes_cache cc on cc.id_twenty = e.cliente_twenty_id
       where e.completada = true and to_char(e.created_at, 'YYYY-MM') = $1
       group by trim(cc.pdv)
     )
     select p.pdv, coalesce(c.completadas, 0)::int as completadas
     from pdvs p
     left join conteos c on c.pdv = p.pdv
     order by completadas desc, p.pdv asc`,
    [mes]
  );

  const { rows: historico } = await pool.query(
    `select to_char(created_at, 'YYYY-MM') as mes, count(*)::int as completadas
     from encuestas
     where completada = true
     group by 1
     order by 1 asc`
  );

  return NextResponse.json({ mes, meta_por_pdv: META_MENSUAL_POR_PDV, pdvs, historico });
}
