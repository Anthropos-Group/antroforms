import { NextResponse } from "next/server";
import { getPool } from "../../../lib/db";
import {
  verifySessionToken,
  SESSION_COOKIE,
  verifyEncuestadorSessionToken,
  ENCUESTADOR_SESSION_COOKIE,
} from "../../../lib/auth";

export const dynamic = "force-dynamic";

// Meta mensual por PDV — regla de negocio del cliente (38 sucursales x 25 = ~950,
// coherente con el volumen de EFECTIVA/mes que se ve en Twenty).
const META_MENSUAL_POR_PDV = 25;

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const mes = searchParams.get("mes") || new Date().toISOString().slice(0, 7); // YYYY-MM

  // Determinar el rol de la sesión activa
  let rol = "encuestador";
  const adminToken = request.cookies.get(SESSION_COOKIE)?.value;
  if (verifySessionToken(adminToken)) {
    rol = "admin";
  } else {
    const encToken = request.cookies.get(ENCUESTADOR_SESSION_COOKIE)?.value;
    if (verifyEncuestadorSessionToken(encToken)) {
      rol = "encuestador";
    }
  }

  const pool = getPool();

  // Filtrar solo sucursales con encuestas completadas (omitiendo las que tienen 0)
  const { rows: pdvs } = await pool.query(
    `select trim(cc.pdv) as pdv, count(*)::int as completadas
     from encuestas e
     join clientes_cache cc on cc.id_twenty = e.cliente_twenty_id
     where e.completada = true and to_char(e.created_at, 'YYYY-MM') = $1
     group by trim(cc.pdv)
     having count(*) > 0
     order by completadas desc, pdv asc`,
    [mes]
  );

  const { rows: historico } = await pool.query(
    `select to_char(created_at, 'YYYY-MM') as mes, count(*)::int as completadas
     from encuestas
     where completada = true
     group by 1
     order by 1 asc`
  );

  // Conteo de encuestas por entrevistador para el mes seleccionado
  const { rows: entrevistadoresRaw } = await pool.query(
    `select enc.nombre as encuestador_nombre, count(*)::int as completadas
     from encuestas e
     join encuestadores enc on enc.id = e.encuestador_id
     where e.completada = true and to_char(e.created_at, 'YYYY-MM') = $1
     group by enc.id, enc.nombre
     order by completadas desc`,
    [mes]
  );

  const totalEntrevistas = entrevistadoresRaw.reduce((acc, r) => acc + r.completadas, 0);

  const entrevistadores = entrevistadoresRaw.map((r) => ({
    nombre: r.encuestador_nombre,
    completadas: r.completadas,
    porcentaje: totalEntrevistas > 0 ? Number(((r.completadas / totalEntrevistas) * 100).toFixed(2)) : 0,
  }));

  return NextResponse.json({
    mes,
    meta_por_pdv: META_MENSUAL_POR_PDV,
    pdvs,
    historico,
    entrevistadores,
    rol,
  });
}
