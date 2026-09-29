const test = require("node:test");
const assert = require("node:assert/strict");

process.env.ADMIN_SESSION_SECRET = "secreto-de-prueba";
process.env.ENCUESTADOR_ACCESS_PASSWORD = "clave-equipo";
const auth = require("../lib/auth");

const ADMIN_ID = "1a9ee616-5d4a-48ea-b7ec-7750e7a8f8ae";

test("hash y verificación de contraseñas", () => {
  const h = auth.hashPassword("claveSegura1");
  assert.equal(auth.verifyPassword("claveSegura1", h), true);
  assert.equal(auth.verifyPassword("otra", h), false);
  assert.equal(auth.verifyPassword("x", "basura"), false);
});

test("token de admin: válido, manipulado y ajeno", () => {
  const token = auth.createSessionToken(ADMIN_ID);
  assert.equal(auth.verifySessionToken(token), ADMIN_ID);
  const [id, exp, sig] = token.split(".");
  assert.equal(auth.verifySessionToken(`${id}.${Number(exp) + 1000}.${sig}`), null);
  assert.equal(auth.verifySessionToken(`${id}.${exp}.zz`), null);
  assert.equal(auth.verifySessionToken("no-es-token"), null);
});

test("rotar la contraseña del equipo invalida las sesiones de encuestador", () => {
  const token = auth.createEncuestadorSessionToken();
  assert.equal(auth.verifyEncuestadorSessionToken(token), true);
  process.env.ENCUESTADOR_ACCESS_PASSWORD = "clave-nueva";
  assert.equal(auth.verifyEncuestadorSessionToken(token), false);
  process.env.ENCUESTADOR_ACCESS_PASSWORD = "clave-equipo";
  // Un token de admin no sirve como sesión de encuestador.
  assert.equal(auth.verifyEncuestadorSessionToken(auth.createSessionToken(ADMIN_ID)), false);
});

test("safeEqual compara en tiempo constante sin falsos positivos", () => {
  assert.equal(auth.safeEqual("abc", "abc"), true);
  assert.equal(auth.safeEqual("abc", "abcd"), false);
  assert.equal(auth.safeEqual("abc", undefined), false);
});

test("rate limit de login bloquea tras N fallos y se limpia al acertar", () => {
  const clave = `test:${Math.random()}`;
  for (let i = 0; i < 3; i++) auth.registrarLoginFallido(clave);
  assert.equal(auth.loginBloqueado(clave, 5), 0);
  assert.ok(auth.loginBloqueado(clave, 3) > 0);
  auth.limpiarLoginFallido(clave);
  assert.equal(auth.loginBloqueado(clave, 3), 0);
});
