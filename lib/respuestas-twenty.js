// Respuestas de la encuesta que también se copian a campos de Twenty, para que el
// CRM muestre los datos de la gestión (otro contacto, cita, encuestado). Se configura
// por cliente en `twenty.respuestasACampos` ({ CODIGO_PREGUNTA: "campoTwenty" }).
// Solo se escriben valores con contenido: nunca se borra un dato de Twenty.

const { tenant } = require("./tenant");

const NA = "N/A";

// Valor de una respuesta tal como se escribe en un campo de texto de Twenty.
function valorParaTwenty(pregunta, valor) {
  if (valor === null || valor === undefined || valor === NA) return null;
  if (typeof valor === "object" && !Array.isArray(valor)) {
    if (valor.especial) return null;
    if ("valor" in valor) return valorParaTwenty(pregunta, valor.texto || valor.valor);
    if ("calificacion" in valor) return String(valor.calificacion);
    return null;
  }
  if (typeof valor === "number") return String(valor);
  if (typeof valor !== "string") return null;
  const texto = valor.trim();
  if (!texto) return null;
  const opcion = (pregunta?.config?.opciones || []).find((o) => o.valor === texto);
  return opcion ? opcion.etiqueta.replace(/\s*→.*$/, "").trim() : texto.slice(0, 500);
}

// filas: [{ codigo, config, valor }] → { campoTwenty: texto }.
function camposDesdeFilas(filas, mapa = tenant().twenty.respuestasACampos || {}) {
  const patch = {};
  for (const f of filas) {
    const campo = mapa[f.codigo];
    if (!campo) continue;
    const v = valorParaTwenty(f, f.valor);
    if (v !== null) patch[campo] = v;
  }
  return patch;
}

// Campos a escribir en Twenty con la última gestión registrada del cliente (cada
// cierre guarda todo lo respondido hasta ese momento, así que basta la última).
async function camposTwentyDelCliente(db, clienteTwentyId) {
  const mapa = tenant().twenty.respuestasACampos;
  if (!mapa || !Object.keys(mapa).length) return {};
  const { rows } = await db.query(
    `select p.codigo, p.config, r.valor
     from respuestas r
     join preguntas p on p.id = r.pregunta_id
     where r.encuesta_id = (select id from encuestas where cliente_twenty_id = $1 order by created_at desc limit 1)
       and p.codigo = any($2::text[])`,
    [clienteTwentyId, Object.keys(mapa)]
  );
  return camposDesdeFilas(rows, mapa);
}

module.exports = { valorParaTwenty, camposDesdeFilas, camposTwentyDelCliente };
