// Reglas del cuestionario compartidas entre la app del encuestador (cliente) y
// POST /api/encuestas (servidor). Mantenerlas en un solo lugar garantiza que el
// servidor valide exactamente lo mismo que la UI — antes el servidor confiaba en
// lo que mandara el navegador (incluido el flag `completada`).
// Módulo puro: sin dependencias de Node ni del DOM.

const NA = "N/A";
const MAX_JUSTIFICACION = 2000;
const MAX_TEXTO = 5000;

function tieneDatoCliente(cliente, campo) {
  const valor = cliente?.[campo];
  if (valor === null || valor === undefined) return false;
  const texto = String(valor).trim();
  if (texto === "") return false;
  const upper = texto.toUpperCase();
  if (upper === "NULL" || upper === "N/A" || upper === "NA" || upper === "NONE" || upper === "NO") return false;
  if (campo === "total") {
    const num = Number(texto.replace(/[^0-9.-]/g, ""));
    if (Number.isNaN(num) || num <= 0) return false;
  }
  return true;
}

// Preguntas que se contestan solas con "N/A" porque dependen de un dato del
// cliente que no existe (ej. P7 de corte/laminado sin dato en TOTAL).
function evaluarAutoRespuestas(preguntas, cliente) {
  const auto = {};
  (preguntas || []).forEach((p) => {
    if (p.condicion?.fuente === "cliente" && !tieneDatoCliente(cliente, p.condicion.campo)) {
      auto[p.id] = NA;
    }
  });
  return auto;
}

// La encuesta se corta en la primera pregunta cuya condición (respuesta a una
// pregunta previa) no se cumple: esa y todas las siguientes no se preguntan.
function evaluarCortePrematuro(preguntas, respuestas) {
  for (let i = 0; i < preguntas.length; i++) {
    const cond = preguntas[i].condicion;
    if (cond?.pregunta_id) {
      const previa = respuestas[cond.pregunta_id];
      if (previa !== undefined && previa !== null && previa !== NA && previa !== cond.valor_esperado) {
        return { cortada: true, indiceCorte: i, preguntaCausaId: cond.pregunta_id };
      }
    }
  }
  return { cortada: false, indiceCorte: preguntas.length };
}

function calificacionDe(val) {
  return val !== null && typeof val === "object" ? val.calificacion : val;
}

function esCalificacionValida(cal) {
  return Number.isInteger(cal) && cal >= 1 && cal <= 10;
}

// ¿La pregunta tiene una respuesta completa y válida? (usada por la barra de
// progreso, las "pills" de navegación y la validación final).
function respuestaCompleta(pregunta, val) {
  if (val === NA && pregunta.condicion?.fuente === "cliente") return true;
  if (pregunta.tipo === "aceptacion_si_no") return typeof val === "boolean";
  if (pregunta.tipo === "escala_1_10") {
    if (!esCalificacionValida(calificacionDe(val))) return false;
    if (!pregunta.requiere_justificacion) return true;
    const just = val && typeof val === "object" ? val.justificacion : "";
    return typeof just === "string" && just.trim().length > 0;
  }
  if (pregunta.tipo === "texto_abierto") return typeof val === "string" && val.trim().length > 0;
  // Tipos sin UI todavía (opcion_multiple): cualquier valor no vacío.
  return val !== undefined && val !== null && val !== "";
}

function mensajeFaltante(pregunta, val, numPregunta) {
  if (pregunta.tipo === "aceptacion_si_no") return `Pregunta ${numPregunta}: Debe seleccionar Sí o No.`;
  if (pregunta.tipo === "escala_1_10") {
    if (!esCalificacionValida(calificacionDe(val))) {
      return `Pregunta ${numPregunta}: Debe seleccionar una calificación del 1 al 10.`;
    }
    return `Pregunta ${numPregunta}: Debe escribir el motivo / por qué de su calificación.`;
  }
  return `Pregunta ${numPregunta}: Debe ingresar la respuesta.`;
}

function validarCuestionarioCompleto(preguntas, respuestas, cliente) {
  const errores = [];
  const autoRespuestas = evaluarAutoRespuestas(preguntas, cliente);
  const corteInfo = evaluarCortePrematuro(preguntas, respuestas);
  const limite = corteInfo.cortada ? corteInfo.indiceCorte : preguntas.length;

  for (let i = 0; i < limite; i++) {
    const p = preguntas[i];
    if (autoRespuestas[p.id] === NA) continue;
    const val = respuestas[p.id];
    if (!respuestaCompleta(p, val)) {
      errores.push({ preguntaId: p.id, indice: i, mensaje: mensajeFaltante(p, val, p.numero_reporte ?? i + 1) });
    }
  }

  return { valido: errores.length === 0, errores, cortada: corteInfo.cortada, hasta: limite };
}

// Limpia un valor antes de guardarlo (recorta textos, descarta campos extra).
function sanearValor(pregunta, val) {
  if (val === NA) return NA;
  if (pregunta.tipo === "escala_1_10") {
    const limpio = { calificacion: calificacionDe(val) };
    if (pregunta.requiere_justificacion) {
      const just = val && typeof val === "object" ? val.justificacion : "";
      limpio.justificacion = String(just ?? "").trim().slice(0, MAX_JUSTIFICACION);
    }
    return limpio;
  }
  if (pregunta.tipo === "texto_abierto") return String(val).trim().slice(0, MAX_TEXTO);
  return val;
}

// Arma el envío definitivo a partir del mapa { pregunta_id: valor }.
// Devuelve lo que se debe guardar y el estado resultante calculado aquí (no el
// que diga el cliente). Lo usa el servidor, y la UI para armar el payload.
function prepararEnvio(preguntas, respuestas, cliente) {
  const auto = evaluarAutoRespuestas(preguntas, cliente);
  // Lo que el encuestador efectivamente registró tiene prioridad sobre el N/A
  // automático (y un N/A que la UI puso con su foto del cliente se respeta
  // aunque el dato en la caché haya cambiado mientras duraba la llamada).
  const definidas = Object.fromEntries(
    Object.entries(respuestas || {}).filter(([, v]) => v !== undefined && v !== null)
  );
  const combinadas = { ...auto, ...definidas };
  const validacion = validarCuestionarioCompleto(preguntas, combinadas, cliente);
  if (!validacion.valido) return { ...validacion, completada: false, respuestas: [], rechazo: false };

  const payload = preguntas.slice(0, validacion.hasta).map((p) => ({
    pregunta_id: p.id,
    valor: sanearValor(p, combinadas[p.id]),
  }));

  // "No acepta participar" = la primera pregunta (aceptación) respondida No.
  // Se usa para marcar al cliente NO_LLAMAR en Twenty.
  const primera = preguntas[0];
  const rechazo = Boolean(primera && primera.tipo === "aceptacion_si_no" && combinadas[primera.id] === false);

  return { ...validacion, completada: !validacion.cortada, respuestas: payload, rechazo };
}

module.exports = {
  NA,
  tieneDatoCliente,
  evaluarAutoRespuestas,
  evaluarCortePrematuro,
  respuestaCompleta,
  validarCuestionarioCompleto,
  prepararEnvio,
};
