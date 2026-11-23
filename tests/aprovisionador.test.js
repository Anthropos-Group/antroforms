// Reglas del aprovisionador que no necesitan Postgres: ventana de escritura,
// ocultar contraseñas y filtro de comandos en consultas de solo lectura.
const test = require("node:test");
const assert = require("node:assert/strict");
const { estadoVentana, ocultarClaves, PROHIBIDAS, SLUG } = require("../aprovisionador/server");

function conVentana(hasta, cliente, fn) {
  const previo = { h: process.env.ESCRITURA_HABILITADA_HASTA, c: process.env.ESCRITURA_CLIENTE };
  if (hasta === undefined) delete process.env.ESCRITURA_HABILITADA_HASTA;
  else process.env.ESCRITURA_HABILITADA_HASTA = hasta;
  if (cliente === undefined) delete process.env.ESCRITURA_CLIENTE;
  else process.env.ESCRITURA_CLIENTE = cliente;
  try {
    fn();
  } finally {
    for (const [k, v] of [["ESCRITURA_HABILITADA_HASTA", previo.h], ["ESCRITURA_CLIENTE", previo.c]]) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

const ahora = Date.parse("2026-11-23T15:00:00-05:00");

test("ventana de escritura: cerrada por defecto", () => {
  conVentana(undefined, undefined, () => assert.equal(estadoVentana(ahora).abierta, false));
});

test("ventana de escritura: abierta solo con hora válida, un cliente y máximo 12 h", () => {
  conVentana("2026-11-23T16:30-05:00", "nuevo", () => {
    const v = estadoVentana(ahora);
    assert.equal(v.abierta, true);
    assert.equal(v.cliente, "nuevo");
    assert.equal(v.minutos_restantes, 90);
  });
  conVentana("2026-11-23T16:30-05:00", undefined, () => assert.equal(estadoVentana(ahora).abierta, false));
  conVentana("2026-11-24T08:00-05:00", "nuevo", () => assert.equal(estadoVentana(ahora).abierta, false));
  conVentana("2026-11-23T14:00-05:00", "nuevo", () => assert.equal(estadoVentana(ahora).abierta, false));
  conVentana("mañana", "nuevo", () => assert.equal(estadoVentana(ahora).abierta, false));
});

test("ocultarClaves: no deja contraseñas en textos de consulta ni URLs", () => {
  assert.equal(ocultarClaves("alter role af_x with password 'secreta'"), "alter role af_x with password '***'");
  assert.equal(ocultarClaves("postgres://af_x:secreta@antroforms-postgres:5432/af_x"), "postgres://af_x:***@antroforms-postgres:5432/af_x");
});

test("consultas de solo lectura: bloquea comandos de control y funciones peligrosas", () => {
  for (const sql of ["set role postgres", "reset role", "commit", "copy x to stdout", "do $$ begin end $$", "select set_config('role','x',false)", "select pg_terminate_backend(1)"]) {
    assert.ok(PROHIBIDAS.test(sql), sql);
  }
  for (const sql of ["select * from encuestas", "with x as (select 1) select * from x", "select settings from configuracion"]) {
    assert.ok(!PROHIBIDAS.test(sql), sql);
  }
});

test("slug de cliente", () => {
  assert.ok(SLUG.test("coop23dejulio"));
  for (const malo of ["Coop", "23julio", "ab", "con-guion", "con_guion"]) assert.ok(!SLUG.test(malo), malo);
});
