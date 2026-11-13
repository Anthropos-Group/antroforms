// Transformación de la base de socios (datos ficticios).
const test = require("node:test");
const assert = require("node:assert/strict");
const { socioDesdeFila, deduplicar, personaTwenty } = require("../lib/socios");

const oficinas = new Map([["1", { nombre: "MATRIZ CAYAMBE", ciudad: "CAYAMBE" }], ["11", { nombre: "TABACUNDO", ciudad: "QUITO" }]]);
const fila = (o = {}) => ({
  CLIENTE: "100", NOMBRE: "PEREZ  PEREZ JUAN", OFICINA: "1", "NOMBRE OFICINA": "CAYAMBE", TIPO: "P",
  "TIPO PERSONA": "PEP", EDAD: "45", "ACTIVIDAD ECONOMICA": "COMERCIO", PROFESION: "NULL",
  "CANTON DOM": "CAYAMBE", "PROVINCIA DOM": "DE PICHINCHA", CELULAR: "593991234567",
  CEDULA: "1700000000", "INGRESOS TOTALES": "1200", PATRIMONIO: "5000", ...o,
});

test("socioDesdeFila: limpia, normaliza y no toma datos sensibles", () => {
  const s = socioDesdeFila(fila(), oficinas);
  assert.equal(s.nombre, "PEREZ PEREZ JUAN");
  assert.equal(s.celular, "0991234567");
  assert.equal(s.tipoPersona, "NATURAL");
  assert.equal(s.profesion, null, "NULL se trata como vacío");
  assert.equal(s.ciudadOficina, "CAYAMBE");
  assert.equal(s.edad, 45);
  const p = personaTwenty(s);
  for (const prohibido of ["cedula", "CEDULA", "ingresos", "patrimonio", "tipoPersonaOriginal"]) {
    assert.ok(!JSON.stringify(p).includes("1700000000"), "sin cédula");
    assert.ok(!(prohibido in p));
  }
  assert.ok(!JSON.stringify(p).includes("PEP"), "la marca PEP no se carga");
  assert.equal(p.estadoGestion, "PENDIENTE");
  assert.ok(!("profesion" in p), "los vacíos se omiten");
});

test("tipo C es persona jurídica", () => {
  assert.equal(socioDesdeFila(fila({ TIPO: "C" })).tipoPersona, "JURIDICA");
  assert.equal(socioDesdeFila(fila({ TIPO: "X" })).tipoPersona, null);
});

test("deduplicar: un socio por código, cuenta duplicados y completa vacíos", () => {
  const filas = [
    fila(),
    fila(),
    fila({ NOMBRE: "JUAN PEREZ PEREZ", PROFESION: "INGENIERIA" }),
    fila({ CLIENTE: "200" }),
    fila({ CLIENTE: "NULL" }),
  ].map((f) => socioDesdeFila(f, oficinas));
  const { socios, resumen } = deduplicar(filas);
  assert.equal(resumen.unicos, 2);
  assert.equal(resumen.duplicadasIguales, 1);
  assert.deepEqual(resumen.duplicadasDistintas, ["100"]);
  assert.equal(resumen.sinCodigo, 1);
  const s100 = socios.find((s) => s.codigoCliente === "100");
  assert.equal(s100.nombre, "PEREZ PEREZ JUAN", "se queda la primera fila");
  assert.equal(s100.profesion, "INGENIERIA", "pero completa lo que faltaba");
});
