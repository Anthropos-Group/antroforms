import { NextResponse } from "next/server";
import { getPool } from "../../../lib/db";
import { mesGestionActivo } from "../../../lib/gestion";
import {
  verifySessionToken,
  SESSION_COOKIE,
} from "../../../lib/auth";
import {
  MESES_ES,
  rangoMesEcuador,
  periodoAnterior,
  nombreMesDePeriodo,
  periodoDeMesGestion,
} from "../../../lib/fecha";

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
    const nombreMes = nombreMesDePeriodo(mes);
    const siguiente = rangoMesEcuador(rangoMesEcuador(mes).fin.slice(0, 7)).mes;
    // Ventana amplia para distinguir el año (el mes de gestión del cliente no lo trae):
    // desde el mes anterior hasta el siguiente.
    const ventanaInicio = rangoMesEcuador(periodoAnterior(mes)).inicio;
    const ventanaFin = rangoMesEcuador(siguiente).fin;
    // Clientes sin mes reconocible: cuentan en el mes calendario de la encuesta.
    const { inicio: sinMesInicio, fin: sinMesFin } = rangoMesEcuador(mes);
    const filtroMes = `e.completada = true
      and (
        (upper(trim(cc.mes_gestion)) = $1 and e.created_at >= $2 and e.created_at < $3)
        or (coalesce(upper(trim(cc.mes_gestion)), '') <> all($4::text[]) and e.created_at >= $5 and e.created_at < $6)
      )`;
    const valoresMes = [nombreMes, ventanaInicio, ventanaFin, MESES_ES, sinMesInicio, sinMesFin];

    const meta = await metaMensual(pool);

    // 1. Sucursales (PDVs) con clientes en la base de ese mes de gestión, cruzadas con
    // las encuestas completadas: así se ven también las que tienen 0 avance.
    const { rows: pdvs } = await pool.query(
      `with catalogo as (
         select distinct trim(pdv) as pdv
         from clientes_cache
         where pdv is not null and trim(pdv) != '' and upper(trim(mes_gestion)) = $1
         union
         select distinct trim(cc.pdv)
         from encuestas e
         join clientes_cache cc on cc.id_twenty = e.cliente_twenty_id
         where cc.pdv is not null and trim(cc.pdv) != '' and ${filtroMes}
       ),
       completadas_mes as (
         select trim(cc.pdv) as pdv, count(*)::int as completadas
         from encuestas e
         join clientes_cache cc on cc.id_twenty = e.cliente_twenty_id
         where ${filtroMes}
         group by trim(cc.pdv)
       )
       select cat.pdv, coalesce(c.completadas, 0) as completadas
       from catalogo cat
       left join completadas_mes c on c.pdv = cat.pdv
       order by completadas desc, cat.pdv asc`,
      valoresMes
    );

    // 2. Histórico por mes de gestión (últimos 12). Se agrupa en SQL por mes del
    // cliente y día de la encuesta, y el período se resuelve con la misma regla.
    const { rows: grupos } = await pool.query(
      `select upper(trim(cc.mes_gestion)) as mes_cliente,
              to_char(e.created_at at time zone 'America/Guayaquil', 'YYYY-MM-DD') as dia,
              count(*)::int as completadas
       from encuestas e
       left join clientes_cache cc on cc.id_twenty = e.cliente_twenty_id
       where e.completada = true
       group by 1, 2`
    );
    const porPeriodo = new Map();
    for (const g of grupos) {
      const periodo = periodoDeMesGestion(g.mes_cliente, `${g.dia}T17:00:00Z`);
      porPeriodo.set(periodo, (porPeriodo.get(periodo) || 0) + g.completadas);
    }
    const historico = [...porPeriodo.entries()]
      .map(([m, completadas]) => ({ mes: m, completadas }))
      .sort((a, b) => a.mes.localeCompare(b.mes))
      .slice(-12);

    // 3. Encuestas completadas por encuestador en el mes de gestión.
    const { rows: entrevistadoresRaw } = await pool.query(
      `select enc.nombre as encuestador_nombre, count(*)::int as completadas
       from encuestas e
       join encuestadores enc on enc.id = e.encuestador_id
       left join clientes_cache cc on cc.id_twenty = e.cliente_twenty_id
       where ${filtroMes}
       group by enc.id, enc.nombre
       order by completadas desc`,
      valoresMes
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
      historico,
      entrevistadores,
      rol,
      mes_activo: activo.periodo,
    });
  } catch (err) {
    console.error("Error en /api/monitoreo:", err);
    return NextResponse.json({ error: "No se pudo cargar el monitoreo", pdvs: [], entrevistadores: [] }, { status: 500 });
  }
}
