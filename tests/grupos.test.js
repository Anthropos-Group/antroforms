// Tablas de afirmaciones (config.grupo): navegación por pantallas.
const test = require("node:test");
const assert = require("node:assert/strict");
const { rangoGrupo, siguientePantalla, prepararEnvio } = require("../lib/encuesta-logica");

const esc = (id, grupo) => ({ id, codigo: id, tipo: "escala", config: { min: 1, max: 7, especiales: ["NS", "NR"], ...(grupo ? { grupo } : {}) } });
const preguntas = [esc("A"), esc("B1", "B"), esc("B2", "B"), esc("B3", "B"), esc("C"), esc("D1", "D"), esc("D2", "D")];

test("rangoGrupo: preguntas sueltas y agrupadas", () => {
  assert.deepEqual(rangoGrupo(preguntas, 0), { inicio: 0, fin: 0 });
  assert.deepEqual(rangoGrupo(preguntas, 2), { inicio: 1, fin: 3 });
  assert.deepEqual(rangoGrupo(preguntas, 6), { inicio: 5, fin: 6 });
});

test("siguientePantalla avanza y retrocede de grupo en grupo", () => {
  assert.equal(siguientePantalla(preguntas, 0, 1), 1);
  assert.equal(siguientePantalla(preguntas, 1, 1), 4);
  assert.equal(siguientePantalla(preguntas, 2, 1), 4);
  assert.equal(siguientePantalla(preguntas, 4, 1), 5);
  assert.equal(siguientePantalla(preguntas, 5, 1), 5, "al final se queda");
  assert.equal(siguientePantalla(preguntas, 6, -1), 4);
  assert.equal(siguientePantalla(preguntas, 4, -1), 1, "retrocede al inicio del grupo");
  assert.equal(siguientePantalla(preguntas, 1, -1), 0);
  assert.equal(siguientePantalla(preguntas, 0, -1), 0);
});

test("siguientePantalla salta pantallas completas fuera de ruta", () => {
  const saltar = (p) => p.id === "C";
  assert.equal(siguientePantalla(preguntas, 1, 1, saltar), 5);
  assert.equal(siguientePantalla(preguntas, 5, -1, saltar), 1);
});

test("cada afirmación del grupo se valida y guarda por separado (NS/NR incluidos)", () => {
  const resp = { A: { calificacion: 7 }, B1: { calificacion: 1 }, B2: { especial: "NS" }, B3: { especial: "NR" }, C: { calificacion: 4 }, D1: { calificacion: 2 }, D2: { calificacion: 3 } };
  const envio = prepararEnvio(preguntas, resp, {});
  assert.equal(envio.valido, true);
  assert.equal(envio.completada, true);
  assert.equal(envio.respuestas.length, 7);

  const incompleto = prepararEnvio(preguntas, { ...resp, B2: undefined }, {});
  assert.equal(incompleto.valido, false);
  assert.deepEqual(incompleto.errores.map((e) => e.preguntaId), ["B2"]);
});
