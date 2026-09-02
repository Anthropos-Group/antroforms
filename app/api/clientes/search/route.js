import { NextResponse } from "next/server";
import { getPool } from "../../../../lib/db";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") || "").trim();
  const mesGestion = (searchParams.get("mes_gestion") || "").trim();

  if (q.length < 3) {
    return NextResponse.json({ results: [] });
  }

  const condiciones = ["nombre ilike $1"];
  const valores = [`%${q}%`];
  if (mesGestion && mesGestion !== "TODOS") {
    valores.push(mesGestion);
    condiciones.push(`upper(trim(mes_gestion)) = upper($${valores.length})`);
  }

  const pool = getPool();
  const { rows } = await pool.query(
    `select id_twenty, nombre, codigo_cliente, pdv, mes_gestion, id_edimca, status, total, fecha_atencion, etiqueta
     from clientes_cache
     where ${condiciones.join(" and ")}
     order by nombre asc
     limit 10`,
    valores
  );

  return NextResponse.json({ results: rows });
}
