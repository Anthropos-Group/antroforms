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

test("A1 = No abre la pregunta de ocupación (A1A) con sus 9 opciones", () => {
  const { preguntasFueraDeRuta } = require("../lib/encuesta-logica");
  const si = conRespuestas(NATURAL, { A1: "SI" });
  const no = conRespuestas(NATURAL, { A1: "NO" });
  const a1a = porCodigo("A1A");
  assert.ok(preguntasFueraDeRuta(preguntas, si.r, NATURAL).has(a1a.id));
  assert.ok(!preguntasFueraDeRuta(preguntas, no.r, NATURAL).has(a1a.id));
  assert.equal(a1a.config.opciones.length, 9);
  assert.ok(a1a.config.opciones.find((o) => o.valor === "OTRA").con_texto);
});

test("SM0 rota las cooperativas por encuesta y deja «Otra» y «Ninguna» al final", () => {
  const sm0 = porCodigo("SM0");
  const orden = (semilla) =>
    preguntaParaMostrar(sm0, preguntas, {}, NATURAL, { semilla }).config.opciones.map((o) => o.valor);
  const a = orden("cliente-1");
  assert.deepEqual(orden("cliente-1"), a, "estable para la misma encuesta");
  const distintos = new Set(["c1", "c2", "c3", "c4", "c5", "c6"].map((x) => orden(x).join(",")));
  assert.ok(distintos.size > 1, "cambia entre encuestas");
  assert.deepEqual(a.slice(-2), ["OTRA", "NINGUNA"]);
  assert.equal(a.length, sm0.config.opciones.length);
});

test("SM1 ofrece solo las cooperativas marcadas en SM0 (sin la 23 de Julio)", () => {
  const e = conRespuestas(NATURAL, { SM0: ["C23_JULIO", "JEP", "MUSHUC_RUNA"] });
  const v = valores(vista("SM1", e));
  assert.deepEqual(v, ["JEP", "MUSHUC_RUNA", "OTRA_INST", "SOLO_23"]);
  const ninguna = valores(vista("SM1", conRespuestas(NATURAL, { SM0: ["NINGUNA"] })));
  assert.deepEqual(ninguna, ["OTRA_INST", "SOLO_23"]);
});

test("el guion de apertura usa el nombre del socio y ya no pide el correo del responsable", () => {
  assert.match(def.guion_apertura, /¿hablo con \{\{NOMBRE\}\}\?/);
  assert.doesNotMatch(def.guion_apertura, /derechos sobre sus datos/);
});

test("ruta A con actividad confirmada en A1: el texto nombra la actividad del listado", () => {
  const e = conRespuestas(NATURAL, { A1: "SI", T2: "SI" });
  for (const codigo of ["A2", "A3", "C1", "C2", "C3", "C4"]) {
    assert.match(vista(codigo, e).texto, /\{\{actividad\}\}/, codigo);
  }
  // Si en A1 dijo que ya no se dedica a eso, no se nombra la actividad vieja.
  const cambio = conRespuestas(NATURAL, { A1: "NO", T2: "SI" });
  assert.doesNotMatch(vista("A2", cambio).texto, /\{\{actividad\}\}/);
});
