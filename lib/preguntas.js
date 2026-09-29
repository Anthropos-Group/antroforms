const TIPOS_PREGUNTA = ["aceptacion_si_no", "escala_1_10", "texto_abierto", "opcion_multiple"];
const CAMPOS_CLIENTE_CONDICION = ["total"];
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
      if (!CAMPOS_CLIENTE_CONDICION.includes(c.campo)) return { error: "Campo de cliente no soportado en la condición" };
      datos.condicion = { fuente: "cliente", campo: c.campo };
    } else if (UUID.test(c.pregunta_id || "") && typeof c.valor_esperado === "boolean") {
      datos.condicion = { pregunta_id: c.pregunta_id, valor_esperado: c.valor_esperado };
    } else {
      return { error: "Condición inválida" };
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

module.exports = { TIPOS_PREGUNTA, validarPregunta, validarCondicionContraBD };
