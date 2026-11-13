const TIPOS_PREGUNTA = [
  "aceptacion_si_no",
  "escala_1_10",
  "texto_abierto",
  "opcion_multiple",
  "opcion_unica",
  "numero",
  "escala",
  "informativa",
];
// Columnas jsonb de preguntas (se guardan serializadas).
const CAMPOS_JSON = ["condicion", "config", "mostrar_si", "termina_si"];
const OPERADORES = ["=", "!=", "en", "no_en", "contiene", "respondida", "vacio", "no_vacio", "especial", ">", ">=", "<", "<="];
const ESPECIALES = ["NS", "NR"];
function camposClienteCondicion() {
  const { tenant } = require("./tenant");
  return ["total", ...Object.keys(tenant().twenty.datos || {})];
}

// Regla de ruta (ver lib/encuesta-logica.js). Devuelve un mensaje de error o null.
function errorRegla(regla, profundidad = 0) {
  if (profundidad > 6) return "Regla demasiado anidada";
  if (!regla || typeof regla !== "object" || Array.isArray(regla)) return "Regla inválida";
  for (const clave of ["todas", "alguna"]) {
    if (clave in regla) {
      if (!Array.isArray(regla[clave]) || regla[clave].length === 0) return `"${clave}" debe ser una lista de reglas`;
      for (const r of regla[clave]) {
        const e = errorRegla(r, profundidad + 1);
        if (e) return e;
      }
      return null;
    }
  }
  if ("no" in regla) return errorRegla(regla.no, profundidad + 1);
  const op = regla.op || "=";
  if (!OPERADORES.includes(op)) return `Operador inválido: ${op}`;
  if (typeof regla.pregunta === "string" && regla.pregunta.trim()) return null;
  if (typeof regla.cliente === "string") {
    return camposClienteCondicion().includes(regla.cliente) ? null : `Dato de cliente no soportado: ${regla.cliente}`;
  }
  return "La regla debe referirse a una pregunta o a un dato del cliente";
}

function errorConfig(config, tipo) {
  if (typeof config !== "object" || config === null || Array.isArray(config)) return "config debe ser un objeto";
  if (config.opciones !== undefined) {
    if (!Array.isArray(config.opciones)) return "config.opciones debe ser una lista";
    const vistos = new Set();
    for (const o of config.opciones) {
      if (!o || typeof o.valor !== "string" || !o.valor.trim() || typeof o.etiqueta !== "string") {
        return "Cada opción necesita valor y etiqueta";
      }
      if (vistos.has(o.valor)) return `Opción repetida: ${o.valor}`;
      vistos.add(o.valor);
    }
  }
  if ((tipo === "opcion_unica" || tipo === "opcion_multiple") && !config.calculo && !(config.opciones || []).length) {
    return "Las preguntas de opciones necesitan al menos una opción";
  }
  if (config.especiales !== undefined) {
    if (!Array.isArray(config.especiales) || !config.especiales.every((e) => ESPECIALES.includes(e))) {
      return "config.especiales admite solo NS y NR";
    }
  }
  if (config.calculo !== undefined) {
    if (!Array.isArray(config.calculo)) return "config.calculo debe ser una lista";
    for (const r of config.calculo) {
      if (r?.si) {
        const e = errorRegla(r.si);
        if (e) return e;
      }
    }
  }
  if (tipo === "escala") {
    const { min = 1, max = 10 } = config;
    if (!Number.isInteger(min) || !Number.isInteger(max) || min >= max) return "La escala necesita min < max enteros";
  }
  if (JSON.stringify(config).length > 20000) return "config es demasiado grande";
  return null;
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Valida y normaliza los campos editables de una pregunta. Devuelve
// { error } o { datos } con solo los campos presentes en `body`.
// Antes cualquier valor iba directo a SQL y, por ejemplo, un tipo inválido
// terminaba en un 500 por el enum de Postgres.
function validarPregunta(body, { parcial = false } = {}) {
  const datos = {};

  if ("texto" in body || !parcial) {
    const texto = typeof body.texto === "string" ? body.texto.trim() : "";
    if (!texto) return { error: "El texto de la pregunta es obligatorio" };
    if (texto.length > 1000) return { error: "El texto de la pregunta es demasiado largo (máx. 1000 caracteres)" };
    datos.texto = texto;
  }
  if ("tipo" in body || !parcial) {
    if (!TIPOS_PREGUNTA.includes(body.tipo)) return { error: `Tipo inválido. Usa uno de: ${TIPOS_PREGUNTA.join(", ")}` };
    datos.tipo = body.tipo;
  }
  for (const campo of ["orden", "numero_reporte"]) {
    if (campo in body && body[campo] !== undefined && body[campo] !== null && body[campo] !== "") {
      const n = Number(body[campo]);
      if (!Number.isInteger(n) || n < 1 || n > 1000) return { error: `${campo} debe ser un entero entre 1 y 1000` };
      datos[campo] = n;
    }
  }
  for (const campo of ["requiere_justificacion", "activa"]) {
    if (campo in body && body[campo] !== undefined) datos[campo] = Boolean(body[campo]);
  }
  if ("condicion" in body) {
    const c = body.condicion;
    if (c === null || c === undefined) {
      datos.condicion = null;
    } else if (c.fuente === "cliente") {
      if (!camposClienteCondicion().includes(c.campo)) return { error: "Campo de cliente no soportado en la condición" };
      datos.condicion = { fuente: "cliente", campo: c.campo };
    } else if (UUID.test(c.pregunta_id || "") && typeof c.valor_esperado === "boolean") {
      datos.condicion = { pregunta_id: c.pregunta_id, valor_esperado: c.valor_esperado };
    } else {
      return { error: "Condición inválida" };
    }
  }
  if ("codigo" in body) {
    const codigo = body.codigo === null || body.codigo === "" ? null : String(body.codigo).trim().toUpperCase();
    if (codigo !== null && !/^[A-Z0-9_]{1,20}$/.test(codigo)) {
      return { error: "El código solo admite letras, números y _ (máx. 20)" };
    }
    datos.codigo = codigo;
  }
  for (const [campo, max] of [["bloque", 100], ["ayuda", 3000]]) {
    if (campo in body) {
      const texto = body[campo] === null ? "" : String(body[campo]).trim();
      if (texto.length > max) return { error: `${campo} es demasiado largo (máx. ${max} caracteres)` };
      datos[campo] = texto || null;
    }
  }
  if ("config" in body || (!parcial && ["opcion_unica", "opcion_multiple"].includes(datos.tipo))) {
    const config = body.config ?? {};
    const e = errorConfig(config, datos.tipo ?? body.tipo);
    if (e) return { error: e };
    datos.config = config;
  }
  for (const campo of ["mostrar_si", "termina_si"]) {
    if (campo in body) {
      if (body[campo] === null) {
        datos[campo] = null;
      } else {
        const e = errorRegla(body[campo]);
        if (e) return { error: `${campo}: ${e}` };
        datos[campo] = body[campo];
      }
    }
  }
  return { datos };
}

// La pregunta de la que depende una condición debe existir en el mismo
// cuestionario, ser Sí/No y estar antes en el orden (si no, el corte nunca se
// evalúa correctamente en la app del encuestador).
async function validarCondicionContraBD(db, { cuestionarioId, preguntaId, orden, condicion }) {
  if (!condicion?.pregunta_id) return null;
  if (condicion.pregunta_id === preguntaId) return "Una pregunta no puede depender de sí misma";
  const { rows } = await db.query(
    `select orden, tipo from preguntas where id = $1 and cuestionario_id = $2`,
    [condicion.pregunta_id, cuestionarioId]
  );
  const base = rows[0];
  if (!base) return "La pregunta de la condición no existe en este cuestionario";
  if (base.tipo !== "aceptacion_si_no") return "Solo se puede depender de una pregunta Sí/No";
  if (orden !== undefined && orden !== null && base.orden >= orden) {
    return "La pregunta de la que depende debe ir antes en el orden";
  }
  return null;
}

module.exports = { TIPOS_PREGUNTA, CAMPOS_JSON, validarPregunta, validarCondicionContraBD, errorRegla };
