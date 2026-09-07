import { NextResponse } from "next/server";
import { getPool } from "../../../lib/db";
import {
  verifySessionToken,
  SESSION_COOKIE,
  verifyEncuestadorSessionToken,
  ENCUESTADOR_SESSION_COOKIE,
} from "../../../lib/auth";

export const dynamic = "force-dynamic";

// Meta mensual por PDV — regla de negocio del cliente (meta de 25 encuestas completadas por sucursal).
const META_MENSUAL_POR_PDV = 25;

function calcularRangoMes(yyyyMm) {
  const parts = (yyyyMm || "").split("-");
  const now = new Date();
  const anio = parts.length === 2 ? Number(parts[0]) : now.getFullYear();
  const mes = parts.length === 2 ? Number(parts[1]) : now.getMonth() + 1;

  const inicio = new Date(Date.UTC(anio, mes - 1, 1, 0, 0, 0, 0)).toISOString();
  const fin = new Date(Date.UTC(anio, mes, 1, 0, 0, 0, 0)).toISOString();
  return { inicio, fin };
}

export async function GET(request) {
  try {
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

    let pool;
    try {
      pool = getPool();
    } catch (err) {
      return NextResponse.json(
        { error: `Error de configuración de BD: ${err.message}` },
        { status: 500 }
      );
    }

    const { inicio: fechaInicio, fin: fechaFin } = calcularRangoMes(mes);

    // 1. Obtener todas las sucursales (PDVs) del catálogo de clientes y cruzar con encuestas completadas en el rango.
    // Esto asegura que gerencia y encuestadores vean qué sucursales tienen 0 avance.
    const { rows: pdvs } = await pool.query(
      `with catalogo as (
         select distinct trim(pdv) as pdv
         from clientes_cache
         where pdv is not null and trim(pdv) != ''
       ),
       completadas_mes as (
         select trim(cc.pdv) as pdv, count(*)::int as completadas
         from encuestas e
         join clientes_cache cc on cc.id_twenty = e.cliente_twenty_id
         where e.completada = true and e.created_at >= $1 and e.created_at < $2
         group by trim(cc.pdv)
       )
       select cat.pdv, coalesce(c.completadas, 0) as completadas
       from catalogo cat
       left join completadas_mes c on c.pdv = cat.pdv
       order by completadas desc, cat.pdv asc`,
      [fechaInicio, fechaFin]
    );

    // 2. Histórico mensual general (últimos 12 meses)
    const { rows: historico } = await pool.query(
      `select to_char(created_at, 'YYYY-MM') as mes, count(*)::int as completadas
       from encuestas
       where completada = true
       group by 1
       order by 1 desc
       limit 12`
    );

    // 3. Conteo de encuestas por encuestador para el mes seleccionado utilizando índice de fecha
    const { rows: entrevistadoresRaw } = await pool.query(
      `select enc.nombre as encuestador_nombre, count(*)::int as completadas
       from encuestas e
       join encuestadores enc on enc.id = e.encuestador_id
       where e.completada = true and e.created_at >= $1 and e.created_at < $2
       group by enc.id, enc.nombre
       order by completadas desc`,
      [fechaInicio, fechaFin]
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
      historico: historico.reverse(),
      entrevistadores,
      rol,
    });
  } catch (err) {
    console.error("Error en /api/monitoreo:", err);
    return NextResponse.json({ error: err.message, pdvs: [], entrevistadores: [] }, { status: 500 });
  }
}
