const { NA } = require("./encuesta-logica");

async function getCuestionarioActivo(pool) {
  const { rows } = await pool.query(
    `select id, nombre from cuestionarios where activo = true order by created_at desc limit 1`
  );
  const cuestionario = rows[0];
  if (!cuestionario) return null;

  const { rows: preguntas } = await pool.query(
    `select id, orden, numero_reporte, texto, tipo, requiere_justificacion
     from preguntas where cuestionario_id = $1 and activa = true
     order by orden asc`,
    [cuestionario.id]
  );
  return { ...cuestionario, preguntas };
}

// "N/A" también en la justificación cuando la pregunta se saltó por regla de
// negocio (ej. sin dato en TOTAL) — antes quedaba vacía y generaba confusión.
function valorLegible(pregunta, valor) {
  if (valor === undefined || valor === null) return { principal: "", justificacion: "" };
  if (valor === NA) {
    return { principal: NA, justificacion: pregunta.requiere_justificacion ? NA : "" };
  }
  if (pregunta.tipo === "aceptacion_si_no") {
    return { principal: valor === true ? "Sí" : valor === false ? "No" : String(valor), justificacion: "" };
  }
  if (pregunta.tipo === "escala_1_10") {
    if (typeof valor === "object") {
      return { principal: valor.calificacion ?? "", justificacion: valor.justificacion ?? "" };
    }
    return { principal: valor, justificacion: pregunta.requiere_justificacion ? NA : "" };
  }
  return { principal: typeof valor === "object" ? JSON.stringify(valor) : String(valor), justificacion: "" };
}

// Filtros comunes a listado, resumen y Excel. Las fechas se interpretan en
// hora de Ecuador. Asume los alias `e` (encuestas) y `cc` (clientes_cache).
function construirFiltro({ desde, hasta, encuestadorId, mesGestion, pdv, estado } = {}) {
  const condiciones = [];
  const valores = [];
  const agregar = (sql, valor) => {
    valores.push(valor);
    condiciones.push(sql.replace("?", `$${valores.length}`));
  };
  if (desde) agregar(`(e.created_at at time zone 'America/Guayaquil')::date >= ?::date`, desde);
  if (hasta) agregar(`(e.created_at at time zone 'America/Guayaquil')::date <= ?::date`, hasta);
  if (encuestadorId) agregar(`e.encuestador_id = ?`, encuestadorId);
  if (mesGestion) agregar(`upper(trim(cc.mes_gestion)) = upper(?)`, mesGestion);
  if (pdv) agregar(`trim(cc.pdv) = ?`, pdv);
  if (estado === "efectiva") condiciones.push("e.completada = true");
  if (estado === "cortada") condiciones.push("e.completada = false");
  return { where: condiciones.length ? `where ${condiciones.join(" and ")}` : "", valores };
}

function leerFiltros(searchParams) {
  const fecha = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v || "") ? v : null);
  const uuid = (v) => (/^[0-9a-f-]{36}$/i.test(v || "") ? v : null);
  const estado = searchParams.get("estado");
  return {
    desde: fecha(searchParams.get("desde")),
    hasta: fecha(searchParams.get("hasta")),
    encuestadorId: uuid(searchParams.get("encuestador_id")),
    mesGestion: searchParams.get("mes_gestion") || null,
    pdv: searchParams.get("pdv") || null,
    estado: estado === "efectiva" || estado === "cortada" ? estado : null,
  };
}

const FROM_ENCUESTAS = `from encuestas e
     left join encuestadores enc on enc.id = e.encuestador_id
     left join clientes_cache cc on cc.id_twenty = e.cliente_twenty_id`;

async function obtenerReporte(pool, { limit, ...filtros } = {}) {
  const cuestionario = await getCuestionarioActivo(pool);
  if (!cuestionario) return null;

  const { where, valores } = construirFiltro(filtros);
  const { rows: encuestas } = await pool.query(
    `select e.id, e.created_at, e.completada, e.codigo_cliente,
            enc.nombre as encuestador_nombre,
            cc.nombre as cliente_nombre, cc.pdv, cc.mes_gestion, cc.telefono1, cc.etiqueta
     ${FROM_ENCUESTAS}
     ${where}
     order by e.created_at desc
     ${limit ? `limit ${Number(limit)}` : ""}`,
    valores
  );

  const ids = encuestas.map((e) => e.id);
  const respuestasPorEncuesta = {};
  if (ids.length > 0) {
    const { rows: respuestas } = await pool.query(
      `select encuesta_id, pregunta_id, valor from respuestas where encuesta_id = any($1::uuid[])`,
      [ids]
    );
    for (const r of respuestas) {
      if (!respuestasPorEncuesta[r.encuesta_id]) respuestasPorEncuesta[r.encuesta_id] = {};
      respuestasPorEncuesta[r.encuesta_id][r.pregunta_id] = r.valor;
    }
  }

  const filas = encuestas.map((e) => {
    const crudas = respuestasPorEncuesta[e.id] || {};
    const respuestas = {};
    for (const p of cuestionario.preguntas) {
      respuestas[p.id] = valorLegible(p, crudas[p.id]);
    }
    return { ...e, respuestas };
  });

  return { cuestionario, encuestas: filas };
}

// KPIs y estadísticas por pregunta calculados en SQL sobre TODO el universo
// filtrado (no sobre la página/lote que se muestra en pantalla).
async function obtenerResumen(pool, filtros = {}) {
  const { where, valores } = construirFiltro(filtros);

  const { rows: [totales] } = await pool.query(
    `select count(*)::int as total,
            count(*) filter (where e.completada)::int as completadas,
            count(distinct e.encuestador_id)::int as encuestadores,
            count(distinct trim(cc.pdv)) filter (where cc.pdv is not null and trim(cc.pdv) <> '')::int as pdvs
     ${FROM_ENCUESTAS}
     ${where}`,
    valores
  );

  const { rows: porPregunta } = await pool.query(
    `with base as (
       select r.pregunta_id, r.valor,
              case
                when jsonb_typeof(r.valor) = 'object' and jsonb_typeof(r.valor->'calificacion') = 'number'
                  then (r.valor->>'calificacion')::numeric
                when jsonb_typeof(r.valor) = 'number' then (r.valor #>> '{}')::numeric
              end as cal
       from respuestas r
       join encuestas e on e.id = r.encuesta_id
       left join clientes_cache cc on cc.id_twenty = e.cliente_twenty_id
       ${where}
     )
     select pregunta_id,
            count(cal)::int as n,
            round(avg(cal), 2)::float as promedio,
            count(*) filter (where cal >= 9)::int as promotores,
            count(*) filter (where cal between 7 and 8)::int as pasivos,
            count(*) filter (where cal <= 6)::int as detractores,
            count(*) filter (where valor = 'true'::jsonb)::int as si,
            count(*) filter (where valor = 'false'::jsonb)::int as no,
            count(*) filter (where valor = '"N/A"'::jsonb)::int as na
     from base
     group by pregunta_id`,
    valores
  );

  const preguntas = {};
  for (const r of porPregunta) {
    preguntas[r.pregunta_id] = {
      ...r,
      nps: r.n > 0 ? Math.round(((r.promotores - r.detractores) / r.n) * 100) : null,
    };
  }

  return {
    total: totales.total,
    completadas: totales.completadas,
    cortadas: totales.total - totales.completadas,
    tasa_efectiva: totales.total > 0 ? Math.round((totales.completadas / totales.total) * 100) : 0,
    encuestadores: totales.encuestadores,
    pdvs: totales.pdvs,
    preguntas,
  };
}

module.exports = {
  getCuestionarioActivo,
  obtenerReporte,
  obtenerResumen,
  valorLegible,
  construirFiltro,
  leerFiltros,
};
