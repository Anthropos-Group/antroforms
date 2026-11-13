// Avance de un levantamiento sin mes de gestión (Cooperativa 23 de Julio): por
// grupo (oficina) y por resultado de la llamada. Cada socio cuenta una vez, con su
// resultado más reciente (una encuesta completa manda sobre cualquier otro).
const { getPool } = require("./db");

// Resultados finales: el socio ya no se vuelve a llamar.
const FINALES = ["completa", "rechazo", "numero_incorrecto", "fuera_universo"];

async function calcularAvance(pool = getPool()) {
  const [{ rows: grupos }, { rows: encuestadores }, { rows: totales }] = await Promise.all([
    pool.query(
      `with ultimo as (
         select distinct on (cliente_twenty_id) cliente_twenty_id, completada, resultado
         from encuestas
         order by cliente_twenty_id, completada desc, created_at desc
       )
       select coalesce(nullif(trim(cc.pdv), ''), '(sin oficina)') as grupo,
              max(cc.datos->>'ciudad_oficina') as ciudad,
              count(*)::int as base,
              count(*) filter (where u.completada)::int as completas,
              count(*) filter (where not coalesce(u.completada, false) and u.resultado = 'rechazo')::int as rechazos,
              count(*) filter (where not coalesce(u.completada, false)
                               and u.resultado in ('numero_incorrecto', 'fuera_universo'))::int as descartados,
              count(*) filter (where not coalesce(u.completada, false)
                               and u.resultado in ('parcial', 'cita', 'no_contacto', 'informante_no_autorizado'))::int as en_gestion,
              count(*) filter (where u.cliente_twenty_id is null)::int as sin_llamar
       from clientes_cache cc
       left join ultimo u on u.cliente_twenty_id = cc.id_twenty
       group by 1
       order by completas desc, grupo asc`
    ),
    pool.query(
      `select coalesce(enc.nombre, '(sin nombre)') as nombre,
              count(*)::int as llamadas,
              count(*) filter (where e.completada)::int as completas,
              count(*) filter (where (e.created_at at time zone 'America/Guayaquil')::date
                                     = (now() at time zone 'America/Guayaquil')::date)::int as hoy
       from encuestas e
       left join encuestadores enc on enc.id = e.encuestador_id
       group by 1
       order by completas desc, llamadas desc`
    ),
    pool.query(
      `select coalesce(resultado, case when completada then 'completa' else 'cortada' end) as resultado,
              count(*)::int as llamadas
       from encuestas group by 1 order by 2 desc`
    ),
  ]);
  return { modo: "avance", grupos, encuestadores, resultados: totales };
}

module.exports = { calcularAvance, FINALES };
