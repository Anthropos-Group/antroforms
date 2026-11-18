// Regla de reemplazos de la Cooperativa 23 de Julio: la 3.ª llamada «No contesta»
// agota al socio (y activa su reemplazo, ver lib/reemplazos.js).
process.env.TENANT = "coop23dejulio";
const test = require("node:test");
const assert = require("node:assert/strict");
const { agotaAlSocio, configReemplazos } = require("../lib/reemplazos");

test("la 3.ª llamada sin contestar agota al socio; antes, o con otro resultado, no", () => {
  assert.equal(configReemplazos().intentosSinContacto, 3);
  assert.equal(agotaAlSocio("no_contacto", 1), false);
  assert.equal(agotaAlSocio("no_contacto", 2), false);
  assert.equal(agotaAlSocio("no_contacto", 3), true);
  assert.equal(agotaAlSocio("no_contacto", 4), true);
  assert.equal(agotaAlSocio("cita", 3), false);
  assert.equal(agotaAlSocio("rechazo", 5), false);
});

test("sin configuración de reemplazos nunca agota", () => {
  assert.equal(agotaAlSocio("no_contacto", 9, null), false);
});

test("«No contesta» y «No contacto» suman juntos para agotar al socio", () => {
  const prev = process.env.TENANT;
  process.env.TENANT = "coop23dejulio";
  try {
    assert.equal(agotaAlSocio("no_contesta", 2), false);
    assert.equal(agotaAlSocio("no_contesta", 3), true);
    assert.equal(agotaAlSocio("no_interesado", 3), false, "No interesado no activa el reemplazo");
    const { tenant } = require("../lib/tenant");
    const c = tenant();
    assert.equal(c.twenty.estadosCierre.no_contesta, "NO_CONTESTA");
    assert.ok(!c.twenty.estadosExcluidos.includes("NO_CONTESTA"), "se le vuelve a llamar");
  } finally {
    if (prev === undefined) delete process.env.TENANT;
    else process.env.TENANT = prev;
  }
});
