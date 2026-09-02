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
  if (pregunta.tipo === "aceptacion_si_no") {
    return { principal: valor === true ? "Sí" : "No", justificacion: "" };
  }
  if (pregunta.tipo === "escala_1_10") {
    if (typeof valor === "object") {
      return { principal: valor.calificacion ?? "", justificacion: valor.justificacion ?? "" };
    }
    return { principal: valor, justificacion: pregunta.requiere_justificacion ? "N/A" : "" };
  }
  return { principal: typeof valor === "object" ? JSON.stringify(valor) : String(valor), justificacion: "" };
}

async function obtenerReporte(pool, { desde, hasta, encuestadorId, limit } = {}) {
  const cuestionario = await getCuestionarioActivo(pool);
  if (!cuestionario) return null;

  const condiciones = [];
  const valores = [];
  if (desde) {
    valores.push(desde);
    condiciones.push(`e.created_at >= $${valores.length}`);
  }
  if (hasta) {
    valores.push(hasta + "T23:59:59.999Z");
    condiciones.push(`e.created_at <= $${valores.length}`);
  }
  if (encuestadorId) {
    valores.push(encuestadorId);
    condiciones.push(`e.encuestador_id = $${valores.length}`);
  }
  const where = condiciones.length ? `where ${condiciones.join(" and ")}` : "";

  const { rows: encuestas } = await pool.query(
    `select e.id, e.created_at, e.completada, e.codigo_cliente,
            enc.nombre as encuestador_nombre,
            cc.nombre as cliente_nombre, cc.pdv, cc.mes_gestion
     from encuestas e
     left join encuestadores enc on enc.id = e.encuestador_id
     left join clientes_cache cc on cc.id_twenty = e.cliente_twenty_id
     ${where}
     order by e.created_at desc
     ${limit ? `limit ${Number(limit)}` : ""}`,
    valores
  );

  const ids = encuestas.map((e) => e.id);
  let respuestasPorEncuesta = {};
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

module.exports = { obtenerReporte, valorLegible };
