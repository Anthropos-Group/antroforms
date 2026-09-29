const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizePhone, normalizeText, computeChanges } = require("../lib/normalize");
const { rangoMesEcuador, mesISOEcuador, hoyISOEcuador, mesActualUTC5 } = require("../lib/fecha");
const { valorLegible, construirFiltro } = require("../lib/reportes");
const { validarPregunta } = require("../lib/preguntas");
const { filaCache } = require("../lib/clientes");

test("normalizePhone: formatos ecuatorianos", () => {
  assert.equal(normalizePhone("+593 99 123 4567"), "0991234567");
  assert.equal(normalizePhone("991234567"), "0991234567");
  assert.equal(normalizePhone("NULL"), "");
  assert.equal(normalizePhone("02-245-6789"), "022456789");
});

test("normalizeText y computeChanges limpian espacios de relleno", () => {
  assert.equal(normalizeText("  ZONA   1   "), "ZONA 1");
  const { changes, patch } = computeChanges({ name: { firstName: "JUAN  PEREZ ", lastName: "" }, telefono2: "NULL", total: "N/A" });
  assert.deepEqual(patch.name, { firstName: "JUAN PEREZ", lastName: "" });
  assert.equal(patch.telefono2, "");
  assert.equal(patch.total, "");
  assert.ok(changes["name.firstName"]);
});

test("rangoMesEcuador usa medianoche de Ecuador (UTC-5)", () => {
  assert.deepEqual(rangoMesEcuador("2026-09"), {
    inicio: "2026-09-01T05:00:00.000Z",
    fin: "2026-10-01T05:00:00.000Z",
    mes: "2026-09",
  });
  assert.equal(rangoMesEcuador("2026-12").fin, "2027-01-01T05:00:00.000Z");
  // Valor inválido: cae al mes en curso.
  assert.equal(rangoMesEcuador("xx").mes, mesISOEcuador());
});

test("fechas de Ecuador: 30-sep 23:00 local sigue siendo septiembre", () => {
  const ahora = new Date("2026-10-01T04:00:00Z"); // 30-sep 23:00 en Ecuador
  assert.equal(mesISOEcuador(ahora), "2026-09");
  assert.equal(hoyISOEcuador(ahora), "2026-09-30");
  assert.equal(mesActualUTC5(ahora), "SEPTIEMBRE");
});

test("valorLegible: N/A en una pregunta Sí/No no se reporta como 'No'", () => {
  const siNo = { tipo: "aceptacion_si_no", requiere_justificacion: false };
  const esc = { tipo: "escala_1_10", requiere_justificacion: true };
  assert.deepEqual(valorLegible(siNo, "N/A"), { principal: "N/A", justificacion: "" });
  assert.deepEqual(valorLegible(siNo, false), { principal: "No", justificacion: "" });
  assert.deepEqual(valorLegible(esc, "N/A"), { principal: "N/A", justificacion: "N/A" });
  assert.deepEqual(valorLegible(esc, { calificacion: 8, justificacion: "bien" }), { principal: 8, justificacion: "bien" });
  assert.deepEqual(valorLegible(esc, undefined), { principal: "", justificacion: "" });
});

test("construirFiltro arma parámetros posicionales en orden", () => {
  const { where, valores } = construirFiltro({ desde: "2026-09-01", pdv: "MATRIZ", estado: "cortada" });
  assert.deepEqual(valores, ["2026-09-01", "MATRIZ"]);
  assert.match(where, /\$1::date/);
  assert.match(where, /trim\(cc\.pdv\) = \$2/);
  assert.match(where, /e\.completada = false/);
  assert.deepEqual(construirFiltro({}), { where: "", valores: [] });
});

test("validarPregunta rechaza tipos y condiciones inválidas", () => {
  assert.ok(validarPregunta({ texto: "x", tipo: "otro" }).error);
  assert.ok(validarPregunta({ texto: " ", tipo: "escala_1_10" }).error);
  assert.ok(validarPregunta({ texto: "x", tipo: "escala_1_10", condicion: { pregunta_id: "nope", valor_esperado: true } }).error);
  assert.ok(validarPregunta({ tipo: "escala_1_10" }, { parcial: true }).datos);
  const ok = validarPregunta({ texto: " ¿Qué tal? ", tipo: "escala_1_10", condicion: { fuente: "cliente", campo: "total", x: 1 } });
  assert.deepEqual(ok.datos, { texto: "¿Qué tal?", tipo: "escala_1_10", condicion: { fuente: "cliente", campo: "total" } });
});

test("filaCache normaliza nombre, teléfono y total del registro de Twenty", () => {
  const fila = filaCache({
    id: "id-1", codigoCliente: "123", name: { firstName: " ANA   LOPEZ ", lastName: "" },
    nombrePuntoVenta: "MATRIZ  ", telefono1: "+593991234567", total: "NULL", status: "PENDIENTE",
  });
  assert.equal(fila[0], "id-1");
  assert.equal(fila[2], "ANA LOPEZ");
  assert.equal(fila[3], "MATRIZ");
  assert.equal(fila[7], "0991234567");
  assert.equal(fila[8], "");
});
