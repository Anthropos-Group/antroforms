import { NextResponse } from "next/server";
import { getPool } from "../../../../lib/db";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const q = (searchParams.get("q") || "").trim();
    const mesGestion = (searchParams.get("mes_gestion") || "").trim();

    if (q.length < 3) {
      return NextResponse.json({ results: [] });
    }

    let pool;
    try {
      pool = getPool();
    } catch (err) {
      return NextResponse.json(
        { error: `Error de base de datos: ${err.message}` },
        { status: 500 }
      );
    }

    // Búsqueda multi-campo: Nombre, Código de cliente, Teléfono o ID Edimca / Cédula
    const condiciones = [
      "(nombre ilike $1 or codigo_cliente ilike $1 or telefono1 ilike $1 or id_edimca ilike $1)"
    ];
    const valores = [`%${q}%`];

    if (mesGestion && mesGestion !== "TODOS") {
      valores.push(mesGestion);
      condiciones.push(`upper(trim(mes_gestion)) = upper($${valores.length})`);
    }

    const { rows } = await pool.query(
      `select id_twenty, nombre, codigo_cliente, pdv, mes_gestion, id_edimca, status, telefono1, total, fecha_atencion, etiqueta
       from clientes_cache
       where ${condiciones.join(" and ")}
       order by nombre asc
       limit 15`,
      valores
    );

    return NextResponse.json({ results: rows });
  } catch (err) {
    console.error("Error en búsqueda de clientes:", err);
    return NextResponse.json({ error: err.message, results: [] }, { status: 500 });
  }
}
