const test = require("node:test");
const assert = require("node:assert/strict");
const {
  NA,
  tieneDatoCliente,
  evaluarAutoRespuestas,
  reconciliarAutoRespuestas,
  evaluarCortePrematuro,
  respuestaCompleta,
  prepararEnvio,
} = require("../lib/encuesta-logica");

// Réplica del cuestionario EDIMCA: P1 acepta, P2 es comprador, P5..P9 escalas
// (P7 depende del dato TOTAL del cliente).
const Q1 = { id: "q1", orden: 1, numero_reporte: 1, tipo: "aceptacion_si_no", condicion: null };
const Q2 = { id: "q2", orden: 2, numero_reporte: 2, tipo: "aceptacion_si_no", condicion: { pregunta_id: "q1", valor_esperado: true } };
const escala = (id, n, condicion = { pregunta_id: "q2", valor_esperado: true }) => ({
  id, orden: n, numero_reporte: n, tipo: "escala_1_10", requiere_justificacion: true, condicion,
});
const PREGUNTAS = [Q1, Q2, escala("q5", 5), escala("q6", 6), escala("q7", 7, { fuente: "cliente", campo: "total" }), escala("q8", 8), escala("q9", 9)];
const conCorte = { total: "150.00" };
const sinCorte = { total: "NULL" };
const r = (cal, just = "ok") => ({ calificacion: cal, justificacion: just });
const todas = { q1: true, q2: true, q5: r(9), q6: r(8), q7: r(10), q8: r(7), q9: r(6) };

test("tieneDatoCliente: cualquier dato en TOTAL cuenta; solo vacío o marcadores de vacío no", () => {
  for (const v of ["150", "$ 12,50", "11", 11, "0", "-5", "abc", "SI", "NO", "corte"]) {
    assert.equal(tieneDatoCliente({ total: v }, "total"), true, `valor ${v}`);
  }
  for (const v of [null, undefined, "", "  ", "NULL", "n/a", "NA", " none "]) {
    assert.equal(tieneDatoCliente({ total: v }, "total"), false, `valor ${v}`);
  }
});

test("un N/A viejo en P7 no vale si el cliente sí tiene TOTAL (caso DELGADO MONICA)", () => {
  const q7 = PREGUNTAS[4];
  assert.equal(respuestaCompleta(q7, NA, { total: "11" }), false);
  assert.equal(respuestaCompleta(q7, NA, { total: "" }), true);
  // El borrador se abrió cuando la copia local aún no tenía el TOTAL: P7 quedó en N/A.
  const envio = prepararEnvio(PREGUNTAS, { ...todas, q7: NA }, { total: "11" });
  assert.equal(envio.valido, false);
  assert.equal(envio.errores[0].preguntaId, "q7");
});

test("reconciliarAutoRespuestas reactiva u omite P7 según los datos vigentes del cliente", () => {
  const conNA = { q1: true, q7: NA };
  assert.deepEqual(reconciliarAutoRespuestas(PREGUNTAS, { total: "11" }, conNA), { q1: true });
  assert.deepEqual(reconciliarAutoRespuestas(PREGUNTAS, { total: "" }, { q1: true }), { q1: true, q7: NA });
  // Sin cambios devuelve el mismo objeto (no dispara re-render ni pisa lo respondido).
  const respondida = { q1: true, q7: r(9) };
  assert.equal(reconciliarAutoRespuestas(PREGUNTAS, { total: "11" }, respondida), respondida);
});

test("evaluarAutoRespuestas marca N/A solo si falta el dato del cliente", () => {
  assert.deepEqual(evaluarAutoRespuestas(PREGUNTAS, sinCorte), { q7: NA });
  assert.deepEqual(evaluarAutoRespuestas(PREGUNTAS, conCorte), {});
});

test("evaluarCortePrematuro corta en la primera condición no cumplida", () => {
  assert.equal(evaluarCortePrematuro(PREGUNTAS, { q1: true, q2: true }).cortada, false);
  assert.deepEqual(evaluarCortePrematuro(PREGUNTAS, { q1: false }), { cortada: true, indiceCorte: 1, preguntaCausaId: "q1" });
  assert.equal(evaluarCortePrematuro(PREGUNTAS, { q1: true, q2: false }).indiceCorte, 2);
});

test("respuestaCompleta exige calificación entera 1-10 y justificación", () => {
  const p = escala("x", 1);
  assert.equal(respuestaCompleta(p, r(10)), true);
  assert.equal(respuestaCompleta(p, r(0)), false);
  assert.equal(respuestaCompleta(p, r(11)), false);
  assert.equal(respuestaCompleta(p, r(7.5)), false);
  assert.equal(respuestaCompleta(p, r("9")), false);
  assert.equal(respuestaCompleta(p, r(9, "   ")), false);
  assert.equal(respuestaCompleta({ ...p, requiere_justificacion: false }, { calificacion: 9 }), true);
  assert.equal(respuestaCompleta(Q1, "true"), false);
  // N/A solo es válido en preguntas que dependen de un dato del cliente.
  assert.equal(respuestaCompleta(p, NA), false);
  assert.equal(respuestaCompleta(PREGUNTAS[4], NA), true);
});

test("prepararEnvio: encuesta completa con corte", () => {
  const envio = prepararEnvio(PREGUNTAS, todas, conCorte);
  assert.equal(envio.valido, true);
  assert.equal(envio.completada, true);
  assert.equal(envio.rechazo, false);
  assert.equal(envio.respuestas.length, 7);
});

test("prepararEnvio: sin dato de corte P7 se guarda como N/A aunque no venga", () => {
  const { q7, ...resto } = todas;
  void q7;
  const envio = prepararEnvio(PREGUNTAS, resto, sinCorte);
  assert.equal(envio.valido, true);
  assert.equal(envio.completada, true);
  assert.deepEqual(envio.respuestas.find((x) => x.pregunta_id === "q7").valor, NA);
});

test("prepararEnvio: una calificación real de P7 tiene prioridad sobre el N/A automático", () => {
  const envio = prepararEnvio(PREGUNTAS, todas, sinCorte);
  assert.deepEqual(envio.respuestas.find((x) => x.pregunta_id === "q7").valor, r(10));
});

test("prepararEnvio: rechazo en P1 corta, no es completada y marca rechazo", () => {
  const envio = prepararEnvio(PREGUNTAS, { q1: false, q5: r(3) }, conCorte);
  assert.equal(envio.valido, true);
  assert.equal(envio.completada, false);
  assert.equal(envio.rechazo, true);
  // Solo se guarda lo que se preguntó antes del corte.
  assert.deepEqual(envio.respuestas, [{ pregunta_id: "q1", valor: false }]);
});

test("prepararEnvio: no comprador (P2 = No) corta sin marcar rechazo", () => {
  const envio = prepararEnvio(PREGUNTAS, { q1: true, q2: false }, conCorte);
  assert.equal(envio.completada, false);
  assert.equal(envio.rechazo, false);
  assert.equal(envio.respuestas.length, 2);
});

test("prepararEnvio: faltantes devuelven errores con el número de reporte", () => {
  const envio = prepararEnvio(PREGUNTAS, { q1: true, q2: true, q5: r(9, "") }, conCorte);
  assert.equal(envio.valido, false);
  assert.deepEqual(envio.errores.map((e) => e.preguntaId), ["q5", "q6", "q7", "q8", "q9"]);
  assert.match(envio.errores[0].mensaje, /^Pregunta 5: .*motivo/);
});

test("prepararEnvio sanea valores: recorta justificación y descarta campos extra", () => {
  const largo = "x".repeat(5000);
  const envio = prepararEnvio(PREGUNTAS, { ...todas, q5: { calificacion: 9, justificacion: `  ${largo}  `, extra: 1 } }, conCorte);
  const q5 = envio.respuestas.find((x) => x.pregunta_id === "q5").valor;
  assert.deepEqual(Object.keys(q5), ["calificacion", "justificacion"]);
  assert.equal(q5.justificacion.length, 2000);
});
