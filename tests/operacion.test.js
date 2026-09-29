const test = require("node:test");
const assert = require("node:assert/strict");
const { mesesPermitidosEncuestador, mesPermitidoEncuestador, relojEcuador } = require("../lib/fecha");
const { parsearHoras, turnoVigente } = require("../lib/programador");

test("meses permitidos al encuestador: el mes en curso y el anterior", () => {
  const sep = new Date("2026-09-29T15:00:00Z");
  assert.deepEqual(mesesPermitidosEncuestador(sep), ["SEPTIEMBRE", "AGOSTO"]);
  assert.equal(mesPermitidoEncuestador("agosto ", sep), true);
  assert.equal(mesPermitidoEncuestador("JULIO", sep), false);
  assert.equal(mesPermitidoEncuestador(null, sep), false);

  // 1-oct 00:30 en Ecuador: ya es octubre, agosto queda fuera.
  const oct = new Date("2026-10-01T05:30:00Z");
  assert.deepEqual(mesesPermitidosEncuestador(oct), ["OCTUBRE", "SEPTIEMBRE"]);
  assert.equal(mesPermitidoEncuestador("AGOSTO", oct), false);

  // Cambio de año.
  assert.deepEqual(mesesPermitidosEncuestador(new Date("2027-01-10T12:00:00Z")), ["ENERO", "DICIEMBRE"]);
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
