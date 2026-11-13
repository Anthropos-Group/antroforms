// Exportación para análisis de cuestionarios con códigos de pregunta (Cooperativa
// 23 de Julio): una fila por llamada, una columna por código, valores codificados
// y un diccionario aparte. Sin nombre ni teléfono del socio: se identifica por su
// código, como promete el consentimiento ("resultados agrupados").
//
// Valores:  NA = no aplica por ruta · NS = no sabe · NR = prefiere no responder
//           vacío = no se llegó a preguntar (llamada cerrada antes).
// Selección múltiple: una columna 1/0 por opción (A3_EMPLEO…); con NS/NR/NA,
// todas las columnas de esa pregunta llevan ese código.
const { NA } = require("./encuesta-logica");

const ETIQUETA_ESPECIAL = { NS: "No sabe", NR: "Prefiere no responder", NA: "No aplica por ruta" };

function tieneTexto(p) {
  return (p.config?.opciones || []).some((o) => o.con_texto);
}

// Columnas de datos de una pregunta: [{ key, header, pregunta, opcion? , texto? }]
function columnasDePregunta(p) {
  const opciones = p.config?.opciones || [];
  if (p.tipo === "opcion_multiple") {
    const cols = opciones.map((o) => ({ key: `${p.codigo}_${o.valor}`, header: `${p.codigo}_${o.valor}`, pregunta: p, opcion: o }));
    if (tieneTexto(p)) cols.push({ key: `${p.codigo}_TEXTO`, header: `${p.codigo}_TEXTO`, pregunta: p, texto: true });
    return cols;
  }
  const cols = [{ key: p.codigo, header: p.codigo, pregunta: p }];
  if (p.requiere_justificacion) cols.push({ key: `${p.codigo}_POR_QUE`, header: `${p.codigo}_POR_QUE`, pregunta: p, justificacion: true });
  if (tieneTexto(p)) cols.push({ key: `${p.codigo}_TEXTO`, header: `${p.codigo}_TEXTO`, pregunta: p, texto: true });
  return cols;
}

function columnasRespuestas(preguntas) {
  return preguntas.filter((p) => p.codigo && p.tipo !== "informativa").flatMap(columnasDePregunta);
}

function especialDe(valor) {
  if (valor === NA) return "NA";
  if (valor && typeof valor === "object" && (valor.especial === "NS" || valor.especial === "NR")) return valor.especial;
  return null;
}

// Valores codificados de una pregunta → { columna: valor }
function codificar(p, valor) {
  const fuera = {};
  const cols = columnasDePregunta(p);
  if (valor === undefined || valor === null) return fuera;
  const esp = especialDe(valor);
  if (esp) {
    for (const c of cols) if (!c.texto && !c.justificacion) fuera[c.key] = esp;
    return fuera;
  }
  switch (p.tipo) {
    case "opcion_multiple": {
      const lista = Array.isArray(valor) ? valor : valor.valores || [];
      for (const c of cols) if (c.opcion) fuera[c.key] = lista.includes(c.opcion.valor) ? 1 : 0;
      if (!Array.isArray(valor) && valor.texto) fuera[`${p.codigo}_TEXTO`] = valor.texto;
      return fuera;
    }
    case "opcion_unica":
      if (typeof valor === "object") {
        fuera[p.codigo] = valor.valor;
        if (valor.texto) fuera[`${p.codigo}_TEXTO`] = valor.texto;
      } else {
        fuera[p.codigo] = valor;
      }
      // Escalas cargadas como opciones (SM3 0–10): número, para poder promediar.
      // Los rangos ("0", "500_999") siguen como código de texto.
      if (p.config?.en_fila && /^\d+$/.test(String(fuera[p.codigo]))) fuera[p.codigo] = Number(fuera[p.codigo]);
      return fuera;
    case "escala":
    case "escala_1_10":
      fuera[p.codigo] = typeof valor === "object" ? valor.calificacion : valor;
      if (p.requiere_justificacion && typeof valor === "object") fuera[`${p.codigo}_POR_QUE`] = valor.justificacion || "";
      return fuera;
    case "aceptacion_si_no":
      fuera[p.codigo] = valor === true ? 1 : valor === false ? 0 : String(valor);
      return fuera;
    default:
      fuera[p.codigo] = typeof valor === "object" ? JSON.stringify(valor) : valor;
      return fuera;
  }
}

// encuestas: [{ ...metadatos, respuestas: { pregunta_id: valor crudo } }]
function filasRespuestas(preguntas, encuestas) {
  const conCodigo = preguntas.filter((p) => p.codigo && p.tipo !== "informativa");
  return encuestas.map((e) => {
    const fila = {};
    for (const p of conCodigo) Object.assign(fila, codificar(p, e.respuestas?.[p.id]));
    return fila;
  });
}

// Diccionario: una fila por código de valor de cada pregunta.
function filasDiccionario(preguntas) {
  const filas = [];
  for (const p of preguntas.filter((x) => x.codigo && x.tipo !== "informativa")) {
    const base = { codigo: p.codigo, bloque: p.bloque || "", pregunta: p.texto, tipo: p.tipo };
    const opciones = p.config?.opciones || [];
    if (p.tipo === "opcion_multiple") {
      for (const o of opciones) filas.push({ ...base, columna: `${p.codigo}_${o.valor}`, valor: "1 / 0", etiqueta: `${o.etiqueta} (1 = mencionada)` });
    } else if (opciones.length) {
      for (const o of opciones) filas.push({ ...base, columna: p.codigo, valor: o.valor, etiqueta: o.etiqueta });
    } else if (p.tipo === "escala") {
      const { min = 1, max = 10, etiquetas = {} } = p.config || {};
      filas.push({ ...base, columna: p.codigo, valor: `${min}–${max}`, etiqueta: [etiquetas.min, etiquetas.max].filter(Boolean).join(" · ") });
    } else if (p.tipo === "numero") {
      filas.push({ ...base, columna: p.codigo, valor: "número", etiqueta: p.config?.unidad || "" });
    } else {
      filas.push({ ...base, columna: p.codigo, valor: "texto", etiqueta: "" });
    }
    for (const e of ["NS", "NR", "NA"]) {
      if (e === "NA" ? p.mostrar_si : (p.config?.especiales || []).includes(e)) {
        filas.push({ ...base, columna: p.codigo, valor: e, etiqueta: ETIQUETA_ESPECIAL[e] });
      }
    }
  }
  return filas;
}

module.exports = { columnasRespuestas, codificar, filasRespuestas, filasDiccionario };
