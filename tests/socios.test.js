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

test("base del sorteo: principal pendiente, reemplazo en reserva y datos limpios", () => {
  const { socioDesdeSorteo, personaTwenty } = require("../lib/socios");
  const base = {
    "ID SELECCIÓN": "QUI-P-0001", "ESTRATO (CIUDAD)": "Quito", "SUCURSAL": "QUITO NORTE", "ORDEN DE GESTIÓN": 1,
    "ID ORIGINAL (CLIENTE)": "519509", "TIPO DE IDENTIFICACIÓN": "CI", "NOMBRE": "FATIMA MU¥OZ",
    "CELULAR (NORMALIZADO)": "0986460790", "TIPO DE PERSONA": "PN", "EDAD": "86", "CANTÓN DOMICILIO": "QUITO",
    "ACTIVIDAD ECONÓMICA": "X".repeat(64), "CANTÓN EMPLEO": "QUITO", "CONDICIÓN": "Principal", "ID REEMPLAZO VINCULADO": "QUI-R-0001",
  };
  const p = socioDesdeSorteo(base);
  assert.equal(p.nombre, "FATIMA MUÑOZ");
  assert.equal(p.tipoPersona, "NATURAL");
  assert.equal(p.estadoGestion, "PENDIENTE");
  assert.equal(p.idVinculado, "QUI-R-0001");
  assert.ok(p.actividadEconomica.endsWith("…"));
  const r = socioDesdeSorteo({ ...base, "CONDICIÓN": "Reemplazo", "TIPO DE IDENTIFICACIÓN": "RUC", "TIPO DE PERSONA": "NULL", "EDAD": "NULL", "ID REEMPLAZO VINCULADO": undefined, "ID DEL REGISTRO PRINCIPAL": "QUI-P-0001" });
  assert.equal(r.estadoGestion, "RESERVA");
  assert.equal(r.tipoPersona, "JURIDICA");
  assert.equal(r.edad, null);
  assert.equal(r.idVinculado, "QUI-P-0001");
  const t = personaTwenty(r);
  assert.equal(t.estadoGestion, "RESERVA");
  assert.equal(t.codigoMuestra, "QUI-P-0001".replace("P", "P"));
  assert.ok(!("edad" in t));
});
