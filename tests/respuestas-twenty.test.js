// Respuestas de la gestión que se copian a Twenty (otro contacto, cita, encuestado).
const test = require("node:test");
const assert = require("node:assert/strict");
const { camposDesdeFilas, valorParaTwenty } = require("../lib/respuestas-twenty");
const { tenant } = require("../lib/tenant");
const def = require("../tenants/puce.cuestionario");

test("convierte respuestas en texto para Twenty y omite vacíos, N/A y NS/NR", () => {
  const mod = def.preguntas.find((p) => p.codigo === "CITA_MODALIDAD");
  assert.equal(valorParaTwenty(mod, "PRESENCIAL"), "Presencial");
  assert.equal(valorParaTwenty({}, " Ana Pérez "), "Ana Pérez");
  assert.equal(valorParaTwenty({}, "N/A"), null);
  assert.equal(valorParaTwenty({}, { especial: "NR" }), null);
  assert.equal(valorParaTwenty({}, "  "), null);
});

test("PUCE: los códigos mapeados existen en el cuestionario y los campos en el esquema de Twenty", () => {
  const mapa = tenant("puce").twenty.respuestasACampos;
  const codigos = new Set(def.preguntas.map((p) => p.codigo));
  const campos = new Set(tenant("puce").esquemaTwenty.map((c) => c.name));
  for (const [codigo, campo] of Object.entries(mapa)) {
    assert.ok(codigos.has(codigo), codigo);
    assert.ok(campos.has(campo), campo);
  }
  const filas = [
    { codigo: "CD_NOMBRE", valor: "Luis Torres" },
    { codigo: "CITA_FECHA", valor: "28/11/2026" },
    { codigo: "CITA_MODALIDAD", config: def.preguntas.find((p) => p.codigo === "CITA_MODALIDAD").config, valor: "PRESENCIAL" },
    { codigo: "LM01_01", valor: { calificacion: 5 } },
  ];
  assert.deepEqual(camposDesdeFilas(filas, mapa), { contactoDerivadoNombre: "Luis Torres", fechaCita: "28/11/2026", modalidadCita: "Presencial" });
});
