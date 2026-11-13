// Codificación del Excel de análisis (Cooperativa 23 de Julio).
const test = require("node:test");
const assert = require("node:assert/strict");
const { NA } = require("../lib/encuesta-logica");
const { columnasRespuestas, codificar, filasRespuestas, filasDiccionario } = require("../lib/exportacion-rutas");

const def = require("../tenants/coop23dejulio.cuestionario");
const preguntas = def.preguntas.map((p, i) => ({ ...p, id: `p${i}`, orden: i + 1 }));
const P = (c) => preguntas.find((p) => p.codigo === c);

test("columnas: una por código, binarias para selección múltiple, sin indicaciones", () => {
  const cols = columnasRespuestas(preguntas).map((c) => c.header);
  assert.ok(cols.includes("CI1"));
  assert.ok(cols.includes("RUTA"));
  assert.ok(cols.includes("A3_EMPLEO") && cols.includes("A3_TEXTO"));
  assert.ok(!cols.includes("A3"), "la múltiple se abre en columnas");
  assert.ok(cols.includes("T2_TEXTO"), "texto de 'otro / especifique'");
  assert.ok(!cols.some((c) => c.startsWith("IND_")), "las indicaciones no son columnas");
  assert.equal(new Set(cols).size, cols.length, "sin columnas repetidas");
});

test("codificar: única, múltiple, escala, especiales y no aplica", () => {
  assert.deepEqual(codificar(P("CI1"), "SI"), { CI1: "SI" });
  assert.deepEqual(codificar(P("T2"), { valor: "SI", texto: "queso" }), { T2: "SI", T2_TEXTO: "queso" });
  const a3 = codificar(P("A3"), ["EMPLEO", "ARRIENDOS"]);
  assert.equal(a3.A3_EMPLEO, 1);
  assert.equal(a3.A3_ARRIENDOS, 1);
  assert.equal(a3.A3_PENSION_BONO, 0);
  assert.equal(codificar(P("SM3"), "9").SM3, 9, "0–10 sale como número");
  assert.equal(codificar(P("AC1"), { calificacion: 4 }).AC1, 4);
  assert.equal(codificar(P("L7"), 45).L7, 45);
  const ns = codificar(P("A3"), { especial: "NS" });
  assert.equal(ns.A3_EMPLEO, "NS");
  assert.ok(!("A3_TEXTO" in ns), "el texto queda vacío");
  assert.equal(codificar(P("B1"), NA).B1, "NA");
  assert.deepEqual(codificar(P("B1"), undefined), {}, "no preguntada = vacío");
});

test("filas y diccionario", () => {
  const filas = filasRespuestas(preguntas, [{ respuestas: { [P("CI1").id]: "NO" } }]);
  assert.equal(filas[0].CI1, "NO");
  assert.ok(!("A2" in filas[0]));
  const dic = filasDiccionario(preguntas);
  assert.ok(dic.some((d) => d.codigo === "CI1" && d.valor === "NO"));
  assert.ok(dic.some((d) => d.codigo === "B1" && d.valor === "NA"), "preguntas con ruta documentan NA");
  assert.ok(dic.some((d) => d.codigo === "A2" && d.valor === "NS"));
  assert.ok(!dic.some((d) => d.codigo === "CI1" && d.valor === "NS"), "CI1 no admite NS");
});

test("los rangos con código '0' siguen como texto (solo la escala 0–10 es número)", () => {
  assert.equal(codificar(P("C2"), "0").C2, "0");
  assert.equal(codificar(P("SM3"), "0").SM3, 0);
});
