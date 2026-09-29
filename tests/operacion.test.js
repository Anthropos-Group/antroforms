const test = require("node:test");
const assert = require("node:assert/strict");
const {
  mesesPermitidosEncuestador,
  mesPermitidoEncuestador,
  periodoGestionActual,
  periodoDeMesGestion,
  relojEcuador,
} = require("../lib/fecha");
const { parsearHoras, turnoVigente } = require("../lib/programador");

test("mes de gestión: una semana de anticipación al cambio de mes", () => {
  // 23-sep: todavía rige septiembre.
  const sep23 = new Date("2026-09-23T17:00:00Z");
  assert.equal(periodoGestionActual(sep23), "2026-09");
  assert.deepEqual(mesesPermitidosEncuestador(sep23), ["SEPTIEMBRE", "AGOSTO"]);
  // 24-sep 00:00 en Ecuador: ya rige octubre y agosto queda fuera.
  const sep24 = new Date("2026-09-24T05:00:00Z");
  assert.equal(periodoGestionActual(sep24), "2026-10");
  assert.deepEqual(mesesPermitidosEncuestador(sep24), ["OCTUBRE", "SEPTIEMBRE"]);
  assert.equal(mesPermitidoEncuestador("octubre ", sep24), true);
  assert.equal(mesPermitidoEncuestador("AGOSTO", sep24), false);
  assert.equal(mesPermitidoEncuestador(null, sep24), false);
  // Durante octubre sigue OCTUBRE + SEPTIEMBRE; el 25-oct pasa a NOVIEMBRE + OCTUBRE.
  assert.deepEqual(mesesPermitidosEncuestador(new Date("2026-10-24T17:00:00Z")), ["OCTUBRE", "SEPTIEMBRE"]);
  assert.deepEqual(mesesPermitidosEncuestador(new Date("2026-10-25T17:00:00Z")), ["NOVIEMBRE", "OCTUBRE"]);
  // Cambio de año.
  assert.equal(periodoGestionActual(new Date("2026-12-26T17:00:00Z")), "2027-01");
  assert.deepEqual(mesesPermitidosEncuestador(new Date("2026-12-26T17:00:00Z")), ["ENERO", "DICIEMBRE"]);
});

test("período de gestión de una encuesta según el mes del cliente", () => {
  assert.equal(periodoDeMesGestion("OCTUBRE", "2026-09-28T17:00:00Z"), "2026-10");
  assert.equal(periodoDeMesGestion("septiembre ", "2026-10-02T17:00:00Z"), "2026-09");
  assert.equal(periodoDeMesGestion("ENERO", "2026-12-28T17:00:00Z"), "2027-01");
  assert.equal(periodoDeMesGestion("DICIEMBRE", "2027-01-03T17:00:00Z"), "2026-12");
  // Sin mes reconocible: el período de gestión vigente ese día.
  assert.equal(periodoDeMesGestion(null, "2026-09-29T17:00:00Z"), "2026-10");
  assert.equal(periodoDeMesGestion("", "2026-09-10T17:00:00Z"), "2026-09");
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
