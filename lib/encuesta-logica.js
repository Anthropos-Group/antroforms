// Reglas del cuestionario compartidas entre la app del encuestador (cliente) y
// POST /api/encuestas (servidor). Mantenerlas en un solo lugar garantiza que el
// servidor valide exactamente lo mismo que la UI — antes el servidor confiaba en
// lo que mandara el navegador (incluido el flag `completada`).
// Módulo puro: sin dependencias de Node ni del DOM.

const NA = "N/A";
const MAX_JUSTIFICACION = 2000;
const MAX_TEXTO = 5000;

// Marcadores de "vacío" heredados de la carga de ancho fijo (la sincronización
// los convierte en "" en Twenty, pero pueden llegar antes de la limpieza).
const MARCADORES_VACIO = new Set(["NULL", "N/A", "NA", "NONE"]);

// ¿El cliente tiene algún dato en el campo? Cualquier contenido cuenta (número,
// texto, "0"…): p. ej. cualquier valor en TOTAL significa que compró corte y
// laminado y activa esa pregunta. Solo vacío o un marcador de vacío no cuenta.
function valorCliente(cliente, campo) {
  if (!cliente) return undefined;
  if (cliente[campo] !== undefined && cliente[campo] !== null) return cliente[campo];
  return cliente.datos?.[campo];
}

function tieneDatoCliente(cliente, campo) {
  const valor = valorCliente(cliente, campo);
  if (valor === null || valor === undefined) return false;
  const texto = String(valor).trim();
  return texto !== "" && !MARCADORES_VACIO.has(texto.toUpperCase());
}

// ---------------------------------------------------------------------------
// Reglas de ruta (cuestionarios con saltos, p. ej. Cooperativa 23 de Julio)
//
// Una regla es un objeto JSON:
//   { todas: [r, …] } · { alguna: [r, …] } · { no: r }
//   { pregunta: "A1", op, valor }   → respuesta a otra pregunta (por código o id)
//   { cliente: "tipo_persona", op, valor } → dato precargado del cliente
// Operadores: "=", "!=", "en", "no_en", "contiene" (selección múltiple),
//   "respondida", "vacio", "no_vacio", "especial" (No sabe / Prefiere no responder),
//   ">", ">=", "<", "<=".
// `mostrar_si`: si no se cumple, la pregunta queda "No aplica por ruta" (N/A).
// `termina_si`: si se cumple con la respuesta dada, la encuesta termina ahí.
// ---------------------------------------------------------------------------

// Respuestas especiales: se registran por separado, nunca como cero.
const NO_SABE = "NS";
const NO_RESPONDE = "NR";
const ESPECIALES = [NO_SABE, NO_RESPONDE];

function esEspecial(val) {
  return val !== null && typeof val === "object" && ESPECIALES.includes(val.especial);
}

// Valor "plano" de una respuesta para comparar en las reglas.
function valorPlano(val) {
  if (val === null || val === undefined) return undefined;
  if (esEspecial(val)) return val.especial;
  if (typeof val === "object" && !Array.isArray(val)) {
    if ("calificacion" in val) return val.calificacion;
    if ("valor" in val) return val.valor;
  }
  return val;
}

function indicePorCodigo(preguntas) {
  const idx = {};
  for (const p of preguntas || []) {
    idx[p.id] = p.id;
    if (p.codigo) idx[p.codigo] = p.id;
  }
  return idx;
}

function vacio(v) {
  if (v === undefined || v === null) return true;
  if (Array.isArray(v)) return v.length === 0;
  const t = String(v).trim();
  return t === "" || MARCADORES_VACIO.has(t.toUpperCase());
}

function igual(a, b) {
  if (typeof a === "string" && typeof b === "string") return a.trim().toUpperCase() === b.trim().toUpperCase();
  return a === b;
}

function comparar(op, actual, esperado) {
  const lista = Array.isArray(esperado) ? esperado : [esperado];
  switch (op) {
    case "=": return !vacio(actual) && igual(actual, esperado);
    case "!=": return !vacio(actual) && !igual(actual, esperado);
    case "en": return !vacio(actual) && lista.some((e) => igual(actual, e));
    case "no_en": return !vacio(actual) && !lista.some((e) => igual(actual, e));
    case "contiene":
      return Array.isArray(actual) && lista.some((e) => actual.some((a) => igual(a, e)));
    case "vacio": return vacio(actual);
    case "no_vacio":
    case "respondida": return !vacio(actual);
    case ">": case ">=": case "<": case "<=": {
      const n = Number(actual);
      const m = Number(esperado);
      if (vacio(actual) || !Number.isFinite(n) || !Number.isFinite(m)) return false;
      return op === ">" ? n > m : op === ">=" ? n >= m : op === "<" ? n < m : n <= m;
    }
    default: return false;
  }
}

function evaluarRegla(regla, ctx) {
  if (!regla || typeof regla !== "object") return true;
  if (Array.isArray(regla.todas)) return regla.todas.every((r) => evaluarRegla(r, ctx));
  if (Array.isArray(regla.alguna)) return regla.alguna.some((r) => evaluarRegla(r, ctx));
  if (regla.no) return !evaluarRegla(regla.no, ctx);
  const op = regla.op || "=";
  if (regla.pregunta) {
    const id = ctx.indice[regla.pregunta];
    const val = id ? ctx.respuestas?.[id] : undefined;
    if (op === "especial") return esEspecial(val) && (regla.valor ? val.especial === regla.valor : true);
    // "No aplica" no cumple ninguna condición sobre el valor.
    if (val === NA) return op === "vacio";
    return comparar(op, valorPlano(val), regla.valor);
  }
  if (regla.cliente) return comparar(op, valorCliente(ctx.cliente, regla.cliente), regla.valor);
  return true;
}

function contexto(preguntas, respuestas, cliente) {
  return { indice: indicePorCodigo(preguntas), respuestas: respuestas || {}, cliente };
}

// Preguntas calculadas (p. ej. la ruta A/B/C/U): su valor sale de reglas sobre las
// respuestas previas y los datos del cliente; el encuestador no las contesta.
//   config.calculo = [{ si: regla, valor: "A" }, …, { valor: "U" }]
function aplicarCalculadas(preguntas, respuestas, cliente) {
  let nuevas = respuestas || {};
  for (const p of preguntas || []) {
    const reglas = p.config?.calculo;
    if (!Array.isArray(reglas)) continue;
    const ctx = contexto(preguntas, nuevas, cliente);
    const elegida = reglas.find((r) => !r.si || evaluarRegla(r.si, ctx));
    const valor = elegida ? elegida.valor : undefined;
    if (nuevas[p.id] !== valor) {
      nuevas = { ...nuevas };
      if (valor === undefined) delete nuevas[p.id];
      else nuevas[p.id] = valor;
    }
  }
  return nuevas;
}

// Preguntas que se contestan solas con "N/A" porque dependen de un dato del
// cliente que no existe (ej. P7 de corte/laminado sin dato en TOTAL).
//
// También quedan en N/A ("No aplica por ruta") las preguntas cuyo `mostrar_si` no
// se cumple con las respuestas dadas hasta ahora y los datos del cliente, y las
// preguntas informativas (solo se leen, no se responden).
function evaluarAutoRespuestas(preguntas, cliente, respuestas = {}) {
  const auto = {};
  const ctx = contexto(preguntas, respuestas, cliente);
  (preguntas || []).forEach((p) => {
    if (p.condicion?.fuente === "cliente" && !tieneDatoCliente(cliente, p.condicion.campo)) {
      auto[p.id] = NA;
    } else if (p.mostrar_si && !evaluarRegla(p.mostrar_si, ctx)) {
      auto[p.id] = NA;
    } else if (p.tipo === "informativa") {
      auto[p.id] = NA;
    }
  });
  return auto;
}

// Ajusta las respuestas cuando cambian los datos del cliente (p. ej. al traer su
// versión más reciente de Twenty): pone N/A en las preguntas que el cliente ya no
// habilita y quita el N/A de las que ahora sí habilita, para que se pregunten.
function reconciliarAutoRespuestas(preguntas, cliente, respuestas) {
  const base = aplicarCalculadas(preguntas, respuestas || {}, cliente);
  const auto = evaluarAutoRespuestas(preguntas, cliente, base);
  const nuevas = { ...base };
  let cambio = base !== (respuestas || {});
  for (const p of preguntas || []) {
    if (p.condicion?.fuente !== "cliente" && !p.mostrar_si && p.tipo !== "informativa") continue;
    if (auto[p.id] === NA && nuevas[p.id] !== NA) {
      nuevas[p.id] = NA;
      cambio = true;
    } else if (auto[p.id] !== NA && nuevas[p.id] === NA) {
      delete nuevas[p.id];
      cambio = true;
    }
  }
  return cambio ? nuevas : respuestas;
}

// La encuesta se corta en la primera pregunta cuya condición (respuesta a una
// pregunta previa) no se cumple: esa y todas las siguientes no se preguntan.
//
// `termina_si` es la otra forma de corte: tras responder la pregunta, si la regla
// se cumple la encuesta termina ahí (esa pregunta sí se guarda). El resultado del
// corte sale de `config.resultado` ("rechazo", "fuera_universo"…).
function evaluarCortePrematuro(preguntas, respuestas, cliente) {
  const ctx = contexto(preguntas, respuestas, cliente);
  for (let i = 0; i < preguntas.length; i++) {
    const p = preguntas[i];
    const cond = p.condicion;
    if (cond?.pregunta_id) {
      const previa = respuestas[cond.pregunta_id];
      if (previa !== undefined && previa !== null && previa !== NA && previa !== cond.valor_esperado) {
        return { cortada: true, indiceCorte: i, preguntaCausaId: cond.pregunta_id };
      }
    }
    if (p.termina_si) {
      const val = respuestas[p.id];
      if (val !== undefined && val !== null && val !== NA && evaluarRegla(p.termina_si, ctx)) {
        return {
          cortada: true,
          indiceCorte: i + 1,
          preguntaCausaId: p.id,
          resultado: p.config?.resultado || null,
        };
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

// Rango de una escala configurable (0–10, Likert 1–5…).
function rangoEscala(pregunta) {
  const min = Number.isInteger(pregunta.config?.min) ? pregunta.config.min : 1;
  const max = Number.isInteger(pregunta.config?.max) ? pregunta.config.max : 10;
  return { min, max };
}

function opcionesDe(pregunta) {
  return Array.isArray(pregunta.config?.opciones) ? pregunta.config.opciones : [];
}

function admiteEspecial(pregunta, especial) {
  const permitidas = pregunta.config?.especiales;
  return Array.isArray(permitidas) && permitidas.includes(especial);
}

// Opción única: "valor" o { valor, texto } cuando la opción pide detalle ("Otro: ___").
function opcionUnicaValida(pregunta, val) {
  const valor = typeof val === "object" && val !== null ? val.valor : val;
  const opcion = opcionesDe(pregunta).find((o) => o.valor === valor);
  if (!opcion) return false;
  if (opcion.con_texto) return typeof val?.texto === "string" && val.texto.trim().length > 0;
  return true;
}

// Selección múltiple: valores de opciones existentes, sin repetir; una opción
// excluyente ("Ninguna") no puede ir acompañada de otras.
function seleccionMultipleValida(pregunta, val) {
  const lista = Array.isArray(val) ? val : Array.isArray(val?.valores) ? val.valores : null;
  if (!lista || lista.length === 0) return false;
  const opciones = opcionesDe(pregunta);
  if (opciones.length === 0) return lista.every((v) => typeof v === "string" && v.trim());
  const porValor = new Map(opciones.map((o) => [o.valor, o]));
  if (new Set(lista).size !== lista.length) return false;
  if (!lista.every((v) => porValor.has(v))) return false;
  if (lista.length > 1 && lista.some((v) => porValor.get(v).excluyente)) return false;
  const max = pregunta.config?.max_selecciones;
  if (Number.isInteger(max) && lista.length > max) return false;
  const conTexto = lista.filter((v) => porValor.get(v).con_texto);
  if (conTexto.length && !(typeof val?.texto === "string" && val.texto.trim())) return false;
  return true;
}

function numeroValido(pregunta, val) {
  if (typeof val !== "number" || !Number.isFinite(val)) return false;
  const { min, max, entero } = pregunta.config || {};
  if (entero && !Number.isInteger(val)) return false;
  if (typeof min === "number" && val < min) return false;
  if (typeof max === "number" && val > max) return false;
  return true;
}

// ¿La pregunta tiene una respuesta completa y válida? (usada por la barra de
// progreso, las "pills" de navegación y la validación final).
function respuestaCompleta(pregunta, val, cliente) {
  // El N/A de una pregunta que depende de un dato del cliente solo vale si el
  // cliente realmente no tiene ese dato (un N/A viejo, puesto cuando la copia
  // local aún no tenía el TOTAL, no puede dejar la pregunta sin responder).
  if (val === NA && pregunta.condicion?.fuente === "cliente") {
    return cliente === undefined || !tieneDatoCliente(cliente, pregunta.condicion.campo);
  }
  if (pregunta.tipo === "informativa") return true;
  if (esEspecial(val)) return admiteEspecial(pregunta, val.especial);
  if (pregunta.tipo === "aceptacion_si_no") return typeof val === "boolean";
  if (pregunta.tipo === "escala_1_10") {
    if (!esCalificacionValida(calificacionDe(val))) return false;
    if (!pregunta.requiere_justificacion) return true;
    const just = val && typeof val === "object" ? val.justificacion : "";
    return typeof just === "string" && just.trim().length > 0;
  }
  if (pregunta.tipo === "escala") {
    const { min, max } = rangoEscala(pregunta);
    const cal = calificacionDe(val);
    if (!Number.isInteger(cal) || cal < min || cal > max) return false;
    if (!pregunta.requiere_justificacion) return true;
    const just = val && typeof val === "object" ? val.justificacion : "";
    return typeof just === "string" && just.trim().length > 0;
  }
  if (pregunta.tipo === "texto_abierto") return typeof val === "string" && val.trim().length > 0;
  if (pregunta.tipo === "opcion_unica") {
    // Preguntas calculadas: cualquier valor que haya dado el cálculo.
    if (Array.isArray(pregunta.config?.calculo)) return !vacio(val);
    return opcionUnicaValida(pregunta, val);
  }
  if (pregunta.tipo === "numero") return numeroValido(pregunta, val);
  if (pregunta.tipo === "opcion_multiple") return seleccionMultipleValida(pregunta, val);
  return val !== undefined && val !== null && val !== "";
}

function mensajeFaltante(pregunta, val, numPregunta) {
  const etiqueta = pregunta.codigo ? `${pregunta.codigo}` : `Pregunta ${numPregunta}`;
  if (pregunta.tipo === "aceptacion_si_no") return `${etiqueta}: Debe seleccionar Sí o No.`;
  if (pregunta.tipo === "escala_1_10" || pregunta.tipo === "escala") {
    const { min, max } = pregunta.tipo === "escala" ? rangoEscala(pregunta) : { min: 1, max: 10 };
    const cal = calificacionDe(val);
    if (!Number.isInteger(cal) || cal < min || cal > max) {
      return `${etiqueta}: Debe seleccionar una calificación del ${min} al ${max}.`;
    }
    return `${etiqueta}: Debe escribir el motivo / por qué de su calificación.`;
  }
  if (pregunta.tipo === "opcion_unica") return `${etiqueta}: Debe elegir una opción.`;
  if (pregunta.tipo === "opcion_multiple") {
    return `${etiqueta}: Elija al menos una opción ("Ninguna", "No sabe" y "Prefiere no responder" van solas).`;
  }
  if (pregunta.tipo === "numero") {
    const { min, max } = pregunta.config || {};
    const rango = typeof min === "number" && typeof max === "number" ? ` entre ${min} y ${max}` : "";
    return `${etiqueta}: Debe ingresar un número válido${rango}.`;
  }
  return `${etiqueta}: Debe ingresar la respuesta.`;
}

// Respuestas automáticas estables: las de ruta dependen de lo respondido, que a su
// vez incluye las automáticas; se repite hasta que no cambian (pocas vueltas).
function resolverRespuestas(preguntas, respuestas, cliente) {
  const definidas = Object.fromEntries(
    Object.entries(respuestas || {}).filter(([, v]) => v !== undefined && v !== null)
  );
  let combinadas = aplicarCalculadas(preguntas, definidas, cliente);
  let auto = {};
  for (let vuelta = 0; vuelta < 5; vuelta++) {
    auto = evaluarAutoRespuestas(preguntas, cliente, combinadas);
    // Lo registrado por el encuestador tiene prioridad sobre el N/A automático,
    // salvo que la ruta diga que la pregunta no aplica (respuesta de otra ruta).
    const siguiente = { ...auto };
    for (const [id, v] of Object.entries(definidas)) {
      const p = preguntas.find((x) => x.id === id);
      const porRuta = p && (p.mostrar_si || p.tipo === "informativa") && auto[id] === NA;
      if (!porRuta) siguiente[id] = v;
    }
    const recalculadas = aplicarCalculadas(preguntas, siguiente, cliente);
    if (JSON.stringify(recalculadas) === JSON.stringify(combinadas)) break;
    combinadas = recalculadas;
  }
  return { auto, combinadas };
}

function validarCuestionarioCompleto(preguntas, respuestas, cliente) {
  const errores = [];
  const autoRespuestas = evaluarAutoRespuestas(preguntas, cliente, respuestas);
  const corteInfo = evaluarCortePrematuro(preguntas, respuestas, cliente);
  const limite = corteInfo.cortada ? corteInfo.indiceCorte : preguntas.length;

  for (let i = 0; i < limite; i++) {
    const p = preguntas[i];
    if (autoRespuestas[p.id] === NA) continue;
    const val = respuestas[p.id];
    if (!respuestaCompleta(p, val, cliente)) {
      errores.push({ preguntaId: p.id, indice: i, mensaje: mensajeFaltante(p, val, p.numero_reporte ?? i + 1) });
    }
  }

  return {
    valido: errores.length === 0,
    errores,
    cortada: corteInfo.cortada,
    hasta: limite,
    resultadoCorte: corteInfo.resultado || null,
  };
}

// Limpia un valor antes de guardarlo (recorta textos, descarta campos extra).
function sanearValor(pregunta, val) {
  if (val === NA) return NA;
  if (esEspecial(val)) return { especial: val.especial };
  if (pregunta.tipo === "escala_1_10" || pregunta.tipo === "escala") {
    const limpio = { calificacion: calificacionDe(val) };
    if (pregunta.requiere_justificacion) {
      const just = val && typeof val === "object" ? val.justificacion : "";
      limpio.justificacion = String(just ?? "").trim().slice(0, MAX_JUSTIFICACION);
    }
    return limpio;
  }
  if (pregunta.tipo === "texto_abierto") return String(val).trim().slice(0, MAX_TEXTO);
  if (pregunta.tipo === "opcion_unica" && val && typeof val === "object") {
    return { valor: val.valor, texto: String(val.texto ?? "").trim().slice(0, MAX_TEXTO) };
  }
  if (pregunta.tipo === "opcion_multiple" && val && typeof val === "object" && !Array.isArray(val)) {
    return { valores: [...val.valores], texto: String(val.texto ?? "").trim().slice(0, MAX_TEXTO) };
  }
  if (pregunta.tipo === "opcion_multiple" && Array.isArray(val)) return [...val];
  return val;
}

// Resultados con los que el encuestador puede cerrar una llamada sin terminar el
// cuestionario (Cooperativa 23 de Julio). "completa" y "rechazo" los decide la
// propia encuesta.
const RESULTADOS_CIERRE = [
  "parcial",
  "cita",
  "no_contacto",
  "numero_incorrecto",
  "informante_no_autorizado",
  "fuera_universo",
];

// Arma el envío definitivo a partir del mapa { pregunta_id: valor }.
// Devuelve lo que se debe guardar y el estado resultante calculado aquí (no el
// que diga el cliente). Lo usa el servidor, y la UI para armar el payload.
//
// Con `cierre` (uno de RESULTADOS_CIERRE) la llamada se cierra antes de terminar:
// se guarda solo lo respondido hasta ese momento, sin exigir el resto.
function prepararEnvio(preguntas, respuestas, cliente, { cierre = null } = {}) {
  const { combinadas } = resolverRespuestas(preguntas, respuestas, cliente);

  if (cierre) {
    if (!RESULTADOS_CIERRE.includes(cierre)) {
      return { valido: false, errores: [{ mensaje: "Resultado de cierre inválido." }], completada: false, respuestas: [], rechazo: false };
    }
    const respondidas = preguntas.filter(
      (p) => combinadas[p.id] !== undefined && combinadas[p.id] !== NA && respuestaCompleta(p, combinadas[p.id], cliente)
    );
    // El último bloque contestado lo da una pregunta que respondió el socio (no una
    // calculada como la ruta).
    const ultima = [...respondidas].reverse().find((p) => !Array.isArray(p.config?.calculo));
    return {
      valido: true,
      errores: [],
      cortada: true,
      completada: false,
      rechazo: false,
      resultado: cierre,
      ultimoBloque: ultima?.bloque || null,
      respuestas: respondidas.map((p) => ({ pregunta_id: p.id, valor: sanearValor(p, combinadas[p.id]) })),
    };
  }

  const validacion = validarCuestionarioCompleto(preguntas, combinadas, cliente);
  if (!validacion.valido) return { ...validacion, completada: false, respuestas: [], rechazo: false };

  const payload = preguntas.slice(0, validacion.hasta).map((p) => ({
    pregunta_id: p.id,
    valor: sanearValor(p, combinadas[p.id]),
  }));

  // "No acepta participar" = la primera pregunta (aceptación) respondida No, o un
  // corte cuyo resultado es "rechazo". Se usa para marcar al cliente en Twenty.
  const primera = preguntas[0];
  const rechazo =
    validacion.resultadoCorte === "rechazo" ||
    Boolean(primera && primera.tipo === "aceptacion_si_no" && !primera.termina_si && combinadas[primera.id] === false);
  const completada = !validacion.cortada;
  const resultado = completada ? "completa" : rechazo ? "rechazo" : validacion.resultadoCorte || null;
  const ultima = [...payload].reverse().find((r) => r.valor !== NA);
  const ultimoBloque = preguntas.find((p) => p.id === ultima?.pregunta_id)?.bloque || null;

  return { ...validacion, completada, respuestas: payload, rechazo, resultado, ultimoBloque };
}

// Ids de las preguntas que "No aplican por ruta" con las respuestas actuales.
function preguntasFueraDeRuta(preguntas, respuestas, cliente) {
  const ctx = contexto(preguntas, respuestas, cliente);
  return new Set((preguntas || []).filter((p) => p.mostrar_si && !evaluarRegla(p.mostrar_si, ctx)).map((p) => p.id));
}

// Reemplaza {{dato}} en el texto de una pregunta por el dato precargado del cliente
// (p. ej. A1: "se dedica a {{actividad}}"). Sin dato queda un aviso visible.
function textoConDatos(texto, cliente) {
  return String(texto || "").replace(/\{\{\s*(\w+)\s*\}\}/g, (_, campo) => {
    const v = valorCliente(cliente, campo);
    return vacio(v) ? "[sin dato en el listado]" : String(v);
  });
}

// La pregunta tal como se le muestra al encuestador con las respuestas actuales:
//   config.variantes = [{ si: regla, texto?, ayuda?, ocultar_opciones?: [valor…] }]
// La primera variante que cumple reemplaza texto/ayuda (p. ej. A2 se lee distinto
// en la ruta B) y oculta opciones que no aplican. Una opción también puede llevar
// su propio `solo_si`. La validación sigue aceptando todas las opciones.
function preguntaParaMostrar(pregunta, preguntas, respuestas, cliente) {
  if (!pregunta?.config) return pregunta;
  const { variantes, opciones } = pregunta.config;
  const tieneSoloSi = Array.isArray(opciones) && opciones.some((o) => o.solo_si);
  if (!Array.isArray(variantes) && !tieneSoloSi) return pregunta;
  const ctx = contexto(preguntas, respuestas, cliente);
  const variante = (variantes || []).find((v) => v && v.si && evaluarRegla(v.si, ctx));
  const ocultas = new Set(variante?.ocultar_opciones || []);
  const vista = {
    ...pregunta,
    texto: variante?.texto ?? pregunta.texto,
    ayuda: variante?.ayuda ?? pregunta.ayuda,
  };
  if (Array.isArray(opciones)) {
    vista.config = {
      ...pregunta.config,
      opciones: opciones.filter((o) => !ocultas.has(o.valor) && (!o.solo_si || evaluarRegla(o.solo_si, ctx))),
    };
  }
  return vista;
}

module.exports = {
  NA,
  textoConDatos,
  preguntaParaMostrar,
  preguntasFueraDeRuta,
  NO_SABE,
  NO_RESPONDE,
  RESULTADOS_CIERRE,
  tieneDatoCliente,
  valorCliente,
  esEspecial,
  evaluarRegla,
  aplicarCalculadas,
  evaluarAutoRespuestas,
  reconciliarAutoRespuestas,
  evaluarCortePrematuro,
  respuestaCompleta,
  validarCuestionarioCompleto,
  resolverRespuestas,
  prepararEnvio,
};
