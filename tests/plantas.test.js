// Cuestionario de plantas de manufactura: orden de secciones, tablas 1–7, NS/NR y rutas.
const test = require("node:test");
const assert = require("node:assert/strict");
const def = require("../tenants/plantas.cuestionario");
const { prepararEnvio, rangoGrupo, siguientePantalla } = require("../lib/encuesta-logica");

// Las preguntas llevan id en la base; aquí el código hace de id.
const preguntas = def.preguntas.map((p) => ({ ...p, id: p.codigo }));
const porCodigo = (c) => preguntas.find((p) => p.codigo === c);

// Respuesta válida para cualquier pregunta (la primera opción, el mínimo de la escala…).
function responder(p) {
  if (p.tipo === "informativa") return undefined;
  if (p.tipo === "escala") return { calificacion: p.config.min };
  if (p.tipo === "texto_abierto") return "Respuesta de prueba";
  if (p.tipo === "numero") return 25;
  if (p.tipo === "opcion_unica") return p.config.opciones[0].valor;
  throw new Error(`tipo sin respuesta de prueba: ${p.tipo}`);
}

function todas(extra = {}) {
  const r = {};
  for (const p of preguntas) {
    const v = responder(p);
    if (v !== undefined) r[p.id] = v;
  }
  return { ...r, ...extra };
}

test("secciones en el orden 6 → 5 → 4 → 2, con canal y consentimiento al inicio", () => {
  assert.equal(preguntas[0].codigo, "CANAL");
  assert.deepEqual(porCodigo("CANAL").config.opciones.map((o) => o.valor), ["LLAMADA", "WHATSAPP", "CORREO"]);
  assert.equal(preguntas[1].codigo, "CI1");
  const inicio = (prefijo) => preguntas.findIndex((p) => p.codigo.startsWith(prefijo));
  assert.ok(inicio("LM01") < inicio("FC01"));
  assert.ok(inicio("FC01") < inicio("IN01"));
  assert.ok(inicio("IN01") < inicio("SC01"));
});

test("LM01 es una sola tabla de 26 afirmaciones con escala 1–7 (incluye las dos sin escala del Word)", () => {
  const i = preguntas.findIndex((p) => p.codigo === "LM01_01");
  const r = rangoGrupo(preguntas, i);
  assert.equal(r.fin - r.inicio + 1, 26);
  assert.equal(preguntas[r.fin].texto, "Utilizar métodos electrónicos de comunicación con los empleados.");
  for (const p of preguntas.slice(r.inicio, r.fin + 1)) {
    assert.equal(p.config.min, 1);
    assert.equal(p.config.max, 7);
  }
  // «Siguiente» desde la tabla va directo a la pantalla después de las 26.
  assert.equal(preguntas[siguientePantalla(preguntas, i, 1)].codigo, "S5");
});

test("todas las preguntas que se contestan admiten NS y NR (salvo canal y consentimiento)", () => {
  for (const p of preguntas) {
    if (p.tipo === "informativa" || ["CANAL", "CI1"].includes(p.codigo)) continue;
    assert.deepEqual(p.config?.especiales, ["NS", "NR"], p.codigo);
  }
});

test("cada sección registra quién la responde", () => {
  for (const s of ["6", "5", "4", "2"]) assert.equal(porCodigo(`INF_${s}`).tipo, "texto_abierto");
});

test("encuesta completa válida, y con NS/NR en las tablas también", () => {
  const ok = prepararEnvio(preguntas, todas(), {});
  assert.equal(ok.valido, true, JSON.stringify(ok.errores?.slice(0, 3)));
  assert.equal(ok.completada, true);

  const conEspeciales = prepararEnvio(preguntas, todas({ LM01_01: { especial: "NS" }, SC14: { especial: "NR" }, IN16: { especial: "NR" } }), {});
  assert.equal(conEspeciales.valido, true);
});

test("«Otros» pide especificar solo si se calificó", () => {
  // Con 0 (sin información) no se pide el texto.
  const sinOtro = prepararEnvio(preguntas, todas({ FC10_09: { calificacion: 0 }, FC10_OTRO: undefined }), {});
  assert.equal(sinOtro.valido, true);
  // Con 1–5 sí.
  const conOtro = prepararEnvio(preguntas, todas({ FC10_09: { calificacion: 3 }, FC10_OTRO: undefined }), {});
  assert.equal(conOtro.valido, false);
  assert.deepEqual(conOtro.errores.map((e) => e.preguntaId), ["FC10_OTRO"]);
  // IN02 «Otros motivos»: 1 = nunca, no se especifica.
  assert.equal(prepararEnvio(preguntas, todas({ IN02_OTRO: undefined }), {}).valido, true);
  assert.equal(prepararEnvio(preguntas, todas({ IN02_08: { calificacion: 5 }, IN02_OTRO: undefined }), {}).valido, false);
});

test("si la empresa no acepta, termina como rechazo", () => {
  const envio = prepararEnvio(preguntas, { CANAL: "WHATSAPP", CI1: "NO" }, {});
  assert.equal(envio.valido, true);
  assert.equal(envio.rechazo, true);
  assert.equal(envio.completada, false);
});

test("cerrar como parcial guarda solo lo respondido (para retomarlo después)", () => {
  const envio = prepararEnvio(preguntas, { CANAL: "CORREO", CI1: "SI", INF_6: "Ana, gerente", LM01_01: { calificacion: 6 } }, {}, { cierre: "parcial" });
  assert.equal(envio.valido, true);
  assert.deepEqual(envio.respuestas.map((r) => r.pregunta_id), ["CANAL", "CI1", "INF_6", "LM01_01"]);
  assert.equal(envio.ultimoBloque, "VI Liderazgo");
});
