// Texto/ayuda/opciones según la ruta (config.variantes), con el cuestionario real
// de la Cooperativa 23 de Julio.
const test = require("node:test");
const assert = require("node:assert/strict");
const { aplicarCalculadas, preguntaParaMostrar } = require("../lib/encuesta-logica");
const def = require("../tenants/coop23dejulio.cuestionario");

const preguntas = def.preguntas.map((p, i) => ({ ...p, id: `p${i}`, orden: i + 1 }));
const porCodigo = (c) => preguntas.find((p) => p.codigo === c);
const NATURAL = { datos: { actividad: "Producción de leche", tipo_persona: "NATURAL" } };
const JURIDICA = { datos: { actividad: "Producción de leche", tipo_persona: "JURIDICA" } };

// TP y RUTA son calculadas: TP sale del tipo de persona del listado.
function conRespuestas(cliente, valores = {}) {
  const r = {};
  for (const [codigo, v] of Object.entries(valores)) r[porCodigo(codigo).id] = v;
  return { r: aplicarCalculadas(preguntas, r, cliente), cliente };
}
const vista = (codigo, { r, cliente } = { r: {}, cliente: {} }) =>
  preguntaParaMostrar(porCodigo(codigo), preguntas, r, cliente);
const valores = (p) => p.config.opciones.map((o) => o.valor);

test("A2 en ruta B pregunta por lo que recibe y oculta la opción de empresas", () => {
  const e = conRespuestas(NATURAL, { T2: "NO" });
  assert.equal(e.r[porCodigo("RUTA").id], "B");
  const a2 = vista("A2", e);
  assert.match(a2.texto, /cuánto recibe por mes/);
  assert.match(a2.ayuda, /RUTA B/);
  assert.ok(!valores(a2).includes("SIN_OPERACIONES"));
});

test("A2 en ruta A habla de ventas y en ruta C mantiene la opción sin operaciones", () => {
  const a = vista("A2", conRespuestas(NATURAL, { T2: "SI" }));
  assert.match(a.texto, /vende o cobra/);
  assert.ok(!valores(a).includes("SIN_OPERACIONES"));
  const c = vista("A2", conRespuestas(JURIDICA));
  assert.match(c.texto, /su empresa/);
  assert.ok(valores(c).includes("SIN_OPERACIONES"));
});

test("sin variante que aplique se muestra la pregunta tal cual", () => {
  const p = porCodigo("A2");
  assert.equal(vista("A2").texto, p.texto);
  assert.equal(vista("A2").config.opciones.length, p.config.opciones.length);
});

test("A1 y L8 se adaptan a persona natural o empresa", () => {
  const nat = conRespuestas(NATURAL);
  const jur = conRespuestas(JURIDICA);
  assert.match(vista("A1", nat).texto, /^Según los registros de la cooperativa, usted se dedica/);
  assert.match(vista("A1", jur).texto, /su empresa se dedica/);
  assert.equal(vista("L8", nat).texto, "¿En qué cantón vive?");
  assert.match(vista("L8", jur).texto, /domicilio de su empresa/);
});

test("ruta B: el bloque de manejo del dinero habla de lo que recibe, no de su actividad", () => {
  const e = conRespuestas(NATURAL, { T2: "NO" });
  for (const codigo of ["C1", "C2", "C3", "C4"]) {
    assert.doesNotMatch(vista(codigo, e).texto, /actividad/, codigo);
  }
  assert.match(vista("C1", e).texto, /recibe/);
  assert.ok(!valores(vista("C3", e)).includes("PAGA_PROVEEDORES"));
});

test("G1 y C6 muestran solo la redacción y opciones del tipo de persona", () => {
  const nat = conRespuestas(NATURAL);
  const jur = conRespuestas(JURIDICA);
  assert.ok(!valores(vista("G1", nat)).includes("SI_SOCIO_REP"));
  assert.ok(!valores(vista("G1", jur)).includes("SI_YO"));
  assert.doesNotMatch(vista("C6", nat).texto, /\[Persona/);
  assert.match(vista("C6", jur).texto, /Su empresa/);
});
