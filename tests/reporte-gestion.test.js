// Números clave del reporte de gestión (cuerpo del correo diario).
process.env.TENANT = "coop23dejulio";
const test = require("node:test");
const assert = require("node:assert/strict");
const { resumenReporte } = require("../lib/reporte-gestion");

test("el resumen calcula avance, llamadas por efectiva y efectividad por encuestador", () => {
  const r = resumenReporte({
    ciudades: [{ ciudad: "Quito", cuota: 400, efectivas: 40 }, { ciudad: "Loja", cuota: 250, efectivas: 25 }],
    productividad: [{ encuestador: "Evelyn", llamadas: 80, efectivas: 20 }],
    totales: { llamadas: 260, efectivas: 65, encuestadores: 3, llamadas_ayer: 50, efectivas_ayer: 12, llamadas_hoy: 5, efectivas_hoy: 1, inicio: null },
  });
  assert.equal(r.cuota, 650);
  assert.equal(r.avance_pct, 10);
  assert.equal(r.llamadas_por_efectiva, 4);
  assert.deepEqual(r.ayer, { llamadas: 50, efectivas: 12 });
  assert.equal(r.ciudades[0].avance_pct, 10);
  assert.equal(r.encuestadores_detalle[0].efectividad_pct, 25);
});

test("sin efectivas no divide por cero", () => {
  const r = resumenReporte({ ciudades: [], productividad: [], totales: { llamadas: 0, efectivas: 0, encuestadores: 0, inicio: null } });
  assert.equal(r.avance_pct, 0);
  assert.equal(r.llamadas_por_efectiva, null);
});
