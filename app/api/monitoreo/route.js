import { NextResponse } from "next/server";
import { getPool } from "../../../lib/db";
import {
  verifySessionToken,
  SESSION_COOKIE,
} from "../../../lib/auth";
import { rangoMesEcuador } from "../../../lib/fecha";

export const dynamic = "force-dynamic";

// Valor por defecto si la migración 0009 (meta configurable) aún no se aplicó.
const META_MENSUAL_POR_PDV_DEFAULT = 25;

async function metaMensual(pool) {
  try {
    const { rows } = await pool.query(
      `select meta_mensual_pdv from cuestionarios where activo = true order by created_at desc limit 1`
    );
    return rows[0]?.meta_mensual_pdv || META_MENSUAL_POR_PDV_DEFAULT;
  } catch {
    return META_MENSUAL_POR_PDV_DEFAULT;
  }
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    // Mes calendario en hora de Ecuador (antes se cortaba a medianoche UTC y las
    // encuestas hechas después de las 19:00 del último día caían en el mes siguiente).
    const { inicio: fechaInicio, fin: fechaFin, mes } = rangoMesEcuador(searchParams.get("mes"));

    // El proxy ya garantiza que hay una sesión válida; aquí solo se distingue el rol.
    const rol = verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value) ? "admin" : "encuestador";

    const pool = getPool();
    const meta = await metaMensual(pool);

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

    // 2. Histórico mensual general (últimos 12 meses, agrupado en hora de Ecuador)
    const { rows: historico } = await pool.query(
      `select to_char(created_at at time zone 'America/Guayaquil', 'YYYY-MM') as mes, count(*)::int as completadas
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
      meta_por_pdv: meta,
      pdvs,
      historico: historico.reverse(),
      entrevistadores,
      rol,
    });
  } catch (err) {
    console.error("Error en /api/monitoreo:", err);
    return NextResponse.json({ error: "No se pudo cargar el monitoreo", pdvs: [], entrevistadores: [] }, { status: 500 });
  }
}
