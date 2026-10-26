import { NextResponse } from "next/server";
import { getPool } from "../../../lib/db";
import { mesGestionActivo } from "../../../lib/gestion";
import { memo } from "../../../lib/cache";
import {
  verifySessionToken,
  SESSION_COOKIE,
} from "../../../lib/auth";
import { metaMensual, filtroEncuestasDelMes } from "../../../lib/meta";
import { periodoDeMesGestion } from "../../../lib/fecha";

export const dynamic = "force-dynamic";

// Las pantallas de monitoreo se refrescan solas cada minuto: el cálculo se comparte
// entre todas durante esta ventana. Los cambios del panel (meta, PDVs) la invalidan.
const CACHE_MONITOREO_MS = 30_000;

async function calcularMonitoreo(pool, mes) {
  const { sql: filtroMes, valores: valoresMes } = filtroEncuestasDelMes(mes);

  // Las consultas son independientes: van en paralelo.
  const [meta, { rows: pdvs }, improbables, { rows: grupos }, { rows: entrevistadoresRaw }] = await Promise.all([
    metaMensual(pool),
    // 1. Sucursales (PDVs) con clientes en la base de ese mes de gestión, cruzadas con
    // las encuestas completadas: así se ven también las que tienen 0 avance.
    pool.query(
      `with base as (
         select trim(pdv) as pdv, count(*)::int as clientes_base
         from clientes_cache
         where pdv is not null and trim(pdv) != '' and upper(trim(mes_gestion)) = $1
         group by 1
       ),
       completadas_mes as (
         select trim(cc.pdv) as pdv, count(*)::int as completadas
         from encuestas e
         join clientes_cache cc on cc.id_twenty = e.cliente_twenty_id
         where cc.pdv is not null and trim(cc.pdv) != '' and ${filtroMes}
         group by 1
       )
       select coalesce(b.pdv, c.pdv) as pdv,
              coalesce(c.completadas, 0) as completadas,
              coalesce(b.clientes_base, 0) as clientes_base
       from base b
       full join completadas_mes c on c.pdv = b.pdv
       order by completadas desc, pdv asc`,
      valoresMes
    ),
    // PDVs marcados en el panel como "meta improbable" (migración 0013).
    pool
      .query(`select pdv from pdv_config where meta_improbable`)
      .then(({ rows }) => new Set(rows.map((r) => r.pdv.trim())))
      .catch((err) => {
        if (err.code !== "42P01") throw err;
        return new Set();
      }),
    // 2. Histórico por mes de gestión (últimos 12). Se agrupa en SQL por mes del
    // cliente y día de la encuesta, y el período se resuelve con la misma regla.
    pool.query(
      `select upper(trim(cc.mes_gestion)) as mes_cliente,
              to_char(e.created_at at time zone 'America/Guayaquil', 'YYYY-MM-DD') as dia,
              count(*)::int as completadas
       from encuestas e
       left join clientes_cache cc on cc.id_twenty = e.cliente_twenty_id
       where e.completada = true
       group by 1, 2`
    ),
    // 3. Encuestas completadas por encuestador en el mes de gestión.
    pool.query(
      `select enc.nombre as encuestador_nombre, count(*)::int as completadas
       from encuestas e
       join encuestadores enc on enc.id = e.encuestador_id
       left join clientes_cache cc on cc.id_twenty = e.cliente_twenty_id
       where ${filtroMes}
       group by enc.id, enc.nombre
       order by completadas desc`,
      valoresMes
    ),
  ]);
  pdvs.forEach((p) => {
    p.meta_improbable = improbables.has(p.pdv);
  });

  const porPeriodo = new Map();
  for (const g of grupos) {
    const periodo = periodoDeMesGestion(g.mes_cliente, `${g.dia}T17:00:00Z`);
    porPeriodo.set(periodo, (porPeriodo.get(periodo) || 0) + g.completadas);
  }
  const historico = [...porPeriodo.entries()]
    .map(([m, completadas]) => ({ mes: m, completadas }))
    .sort((a, b) => a.mes.localeCompare(b.mes))
    .slice(-12);

  const totalEntrevistas = entrevistadoresRaw.reduce((acc, r) => acc + r.completadas, 0);

  const entrevistadores = entrevistadoresRaw.map((r) => ({
    nombre: r.encuestador_nombre,
    completadas: r.completadas,
    porcentaje: totalEntrevistas > 0 ? Number(((r.completadas / totalEntrevistas) * 100).toFixed(2)) : 0,
  }));

  return { mes, meta_por_pdv: meta, pdvs, historico, entrevistadores };
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    // Mes de gestión (no de calendario): una encuesta cuenta para el mes de gestión
    // de su cliente. Una de un cliente de OCTUBRE hecha el 28/09 cuenta en octubre, y
    // una de SEPTIEMBRE hecha el 2/10 cuenta en septiembre.
    // El proxy ya garantiza que hay una sesión válida; aquí solo se distingue el rol.
    const rol = verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value) ? "admin" : "encuestador";
    const pool = getPool();
    // Por defecto, el mes de gestión activo. El encuestador solo ve ese mes; el admin
    // puede consultar cualquiera.
    const activo = await mesGestionActivo(pool);
    const pedido = searchParams.get("mes");
    const mes = rol === "admin" && /^\d{4}-(0[1-9]|1[0-2])$/.test(pedido || "") ? pedido : activo.periodo;
    const datos = await memo(`monitoreo:${mes}`, CACHE_MONITOREO_MS, () => calcularMonitoreo(pool, mes));
    return NextResponse.json({ ...datos, rol, mes_activo: activo.periodo });
  } catch (err) {
    console.error("Error en /api/monitoreo:", err);
    return NextResponse.json({ error: "No se pudo cargar el monitoreo", pdvs: [], entrevistadores: [] }, { status: 500 });
  }
}
