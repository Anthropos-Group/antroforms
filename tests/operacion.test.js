const test = require("node:test");
const assert = require("node:assert/strict");
const { periodoDeMesGestion, relojEcuador } = require("../lib/fecha");
const { resolverPeriodo, validarConfig, esMesActivo } = require("../lib/gestion");
const { parsearHoras, turnoVigente } = require("../lib/programador");

test("mes activo automático: el mes siguiente se activa al cargarse su base", () => {
  const config = { modo: "automatico", umbral: 100 };
  // 30-sep con la base de octubre cargada (1 348 clientes): ya rige OCTUBRE.
  assert.deepEqual(resolverPeriodo({ config, calendario: "2026-09", cargadosSiguiente: 1348 }), {
    periodo: "2026-10",
    origen: "automatico",
  });
  // Sin base del mes siguiente (o por debajo del umbral): sigue el mes calendario.
  assert.deepEqual(resolverPeriodo({ config, calendario: "2026-10", cargadosSiguiente: 12 }), {
    periodo: "2026-10",
    origen: "calendario",
  });
  // Cambio de año.
  assert.equal(resolverPeriodo({ config, calendario: "2026-12", cargadosSiguiente: 500 }).periodo, "2027-01");
});

test("mes activo manual: fijo o programado, nunca anterior al mes calendario", () => {
  const ahora = new Date("2026-10-26T12:00:00Z");
  const manual = (periodo, desde = null) => ({ modo: "manual", periodo, desde });
  assert.equal(resolverPeriodo({ config: manual("2026-11"), calendario: "2026-10", cargadosSiguiente: 0, ahora }).periodo, "2026-11");
  // Programado para más tarde: todavía no.
  assert.equal(
    resolverPeriodo({ config: manual("2026-11", "2026-10-26T13:00:00Z"), calendario: "2026-10", cargadosSiguiente: 0, ahora }).periodo,
    "2026-10"
  );
  assert.equal(
    resolverPeriodo({ config: manual("2026-11", "2026-10-26T11:00:00Z"), calendario: "2026-10", cargadosSiguiente: 0, ahora }).periodo,
    "2026-11"
  );
  // Un mes manual ya pasado no retrocede: el día 1 manda el calendario.
  assert.deepEqual(resolverPeriodo({ config: manual("2026-10"), calendario: "2026-11", cargadosSiguiente: 0, ahora }), {
    periodo: "2026-11",
    origen: "calendario",
  });
});

test("configuración del mes de gestión: validación", () => {
  assert.deepEqual(validarConfig({}).config, { modo: "automatico", umbral: 100 });
  assert.ok(validarConfig({ modo: "automatico", umbral: 0 }).error);
  assert.ok(validarConfig({ modo: "manual", periodo: "2026-13" }).error);
  assert.deepEqual(validarConfig({ modo: "manual", periodo: "2026-11", desde: "2026-10-26T13:00:00Z" }).config, {
    modo: "manual",
    periodo: "2026-11",
    desde: "2026-10-26T13:00:00.000Z",
  });
  assert.equal(esMesActivo(" octubre ", "OCTUBRE"), true);
  assert.equal(esMesActivo("SEPTIEMBRE", "OCTUBRE"), false);
  assert.equal(esMesActivo(null, "OCTUBRE"), false);
});

test("período de gestión de una encuesta según el mes del cliente", () => {
  assert.equal(periodoDeMesGestion("OCTUBRE", "2026-09-28T17:00:00Z"), "2026-10");
  assert.equal(periodoDeMesGestion("septiembre ", "2026-10-02T17:00:00Z"), "2026-09");
  assert.equal(periodoDeMesGestion("ENERO", "2026-12-28T17:00:00Z"), "2027-01");
  assert.equal(periodoDeMesGestion("DICIEMBRE", "2027-01-03T17:00:00Z"), "2026-12");
  // Sin mes reconocible: el mes calendario de la encuesta.
  assert.equal(periodoDeMesGestion(null, "2026-09-29T17:00:00Z"), "2026-09");
  assert.equal(periodoDeMesGestion("", "2026-10-01T17:00:00Z"), "2026-10");
});

test("relojEcuador: fecha y hora locales (UTC-5)", () => {
  assert.deepEqual(relojEcuador(new Date("2026-10-01T04:30:00Z")), { fecha: "2026-09-30", hora: 23, minuto: 30 });
});

test("programador: horas de sincronización", () => {
  assert.deepEqual(parsearHoras("13, 7,7,x,25"), [7, 13]);
  assert.deepEqual(parsearHoras(""), []);
});

test("programador: turno vigente de sincronización", () => {
  const horas = [7, 13];
  // 06:59 en Ecuador: todavía no toca.
  assert.equal(turnoVigente(horas, new Date("2026-10-01T11:59:00Z")), null);
  // 07:00 en Ecuador = 12:00 UTC.
  const t7 = turnoVigente(horas, new Date("2026-10-01T12:00:00Z"));
  assert.equal(t7.clave, "2026-10-01 07:00");
  assert.equal(t7.desde.toISOString(), "2026-10-01T12:00:00.000Z");
  // 22:00 en Ecuador: el último turno del día es el de las 13:00.
  const t13 = turnoVigente(horas, new Date("2026-10-02T03:00:00Z"));
  assert.equal(t13.clave, "2026-10-01 13:00");
  assert.equal(t13.desde.toISOString(), "2026-10-01T18:00:00.000Z");
});
