// Motor de rutas: saltos (mostrar_si), cortes (termina_si), preguntas calculadas,
// tipos nuevos y cierre anticipado. Usa un fragmento del cuestionario de la
// Cooperativa 23 de Julio.
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  NA,
  evaluarRegla,
  evaluarAutoRespuestas,
  reconciliarAutoRespuestas,
  respuestaCompleta,
  prepararEnvio,
  preguntasFueraDeRuta,
  textoConDatos,
} = require("../lib/encuesta-logica");

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const SI_NO = [
  { valor: "SI", etiqueta: "Sí" },
  { valor: "NO", etiqueta: "No" },
];
const NS_NR = ["NS", "NR"];

const preguntas = [
  {
    id: id(1), codigo: "CI1", bloque: "Consentimiento", orden: 1, tipo: "opcion_unica",
    config: { opciones: [{ valor: "SI", etiqueta: "Sí, acepto" }, { valor: "NO", etiqueta: "No acepto" }], resultado: "rechazo" },
    termina_si: { pregunta: "CI1", op: "=", valor: "NO" },
  },
  {
    id: id(2), codigo: "L1", bloque: "Listado", orden: 2, tipo: "opcion_unica",
    config: { opciones: [{ valor: "N", etiqueta: "Natural" }, { valor: "J", etiqueta: "Jurídica" }] },
    mostrar_si: { cliente: "tipo_persona", op: "vacio" },
  },
  { id: id(3), codigo: "T1", bloque: "Listado", orden: 3, tipo: "informativa", texto: "Confirme tipo de persona" },
  {
    id: id(4), codigo: "T2", bloque: "Actividad", orden: 4, tipo: "opcion_unica",
    config: { opciones: SI_NO, especiales: NS_NR },
    mostrar_si: { alguna: [{ cliente: "tipo_persona", op: "=", valor: "N" }, { pregunta: "L1", op: "=", valor: "N" }] },
  },
  {
    id: id(5), codigo: "RUTA", bloque: "Actividad", orden: 5, tipo: "opcion_unica",
    config: {
      calculo: [
        { si: { alguna: [{ cliente: "tipo_persona", op: "=", valor: "J" }, { pregunta: "L1", op: "=", valor: "J" }] }, valor: "C" },
        { si: { pregunta: "T2", op: "=", valor: "SI" }, valor: "A" },
        { si: { pregunta: "T2", op: "=", valor: "NO" }, valor: "B" },
        { valor: "U" },
      ],
    },
  },
  {
    id: id(6), codigo: "A2", bloque: "Actividad", orden: 6, tipo: "numero",
    config: { min: 0, max: 10000000, especiales: NS_NR },
  },
  {
    id: id(7), codigo: "B1", bloque: "Formalidad", orden: 7, tipo: "opcion_multiple",
    config: {
      opciones: [
        { valor: "FACTURA", etiqueta: "Factura" },
        { valor: "CUADERNO", etiqueta: "Cuaderno" },
        { valor: "NINGUNA", etiqueta: "Ninguna", excluyente: true },
      ],
      especiales: NS_NR,
    },
    mostrar_si: { pregunta: "RUTA", op: "en", valor: ["A", "C"] },
  },
  {
    id: id(8), codigo: "SM3", bloque: "Marca", orden: 8, tipo: "escala",
    config: { min: 0, max: 10, especiales: NS_NR },
  },
];

const natural = { codigo_cliente: "2013", datos: { tipo_persona: "N" } };
const juridica = { codigo_cliente: "9", datos: { tipo_persona: "J" } };
const sinTipo = { codigo_cliente: "3171", datos: { tipo_persona: null } };

test("evaluarRegla: operadores sobre respuestas y datos del cliente", () => {
  const ctx = { indice: { A2: id(6), B1: id(7) }, respuestas: { [id(6)]: 1500, [id(7)]: ["FACTURA"] }, cliente: natural };
  assert.equal(evaluarRegla({ pregunta: "A2", op: ">", valor: 1000 }, ctx), true);
  assert.equal(evaluarRegla({ pregunta: "B1", op: "contiene", valor: "FACTURA" }, ctx), true);
  assert.equal(evaluarRegla({ cliente: "tipo_persona", op: "=", valor: "n" }, ctx), true);
  assert.equal(evaluarRegla({ no: { cliente: "tipo_persona", op: "vacio" } }, ctx), true);
  assert.equal(evaluarRegla({ pregunta: "A2", op: "especial" }, ctx), false);
});

test("las preguntas 'solo si falta' se saltan cuando el listado trae el dato", () => {
  const auto = evaluarAutoRespuestas(preguntas, natural, {});
  assert.equal(auto[id(2)], NA, "L1 no aplica: el listado ya trae tipo de persona");
  assert.notEqual(auto[id(4)], NA, "T2 aplica a persona natural");
  const autoSinTipo = evaluarAutoRespuestas(preguntas, sinTipo, {});
  assert.notEqual(autoSinTipo[id(2)], NA, "L1 se pregunta si falta el tipo");
});

test("la ruta se calcula sola y decide qué bloques aplican", () => {
  const conT2 = reconciliarAutoRespuestas(preguntas, natural, { [id(1)]: "SI", [id(4)]: "NO" });
  assert.equal(conT2[id(5)], "B");
  assert.equal(conT2[id(7)], NA, "B1 no aplica en ruta B");

  const empresa = reconciliarAutoRespuestas(preguntas, juridica, { [id(1)]: "SI" });
  assert.equal(empresa[id(5)], "C");
  assert.equal(empresa[id(4)], NA, "T2 es solo para persona natural");
});

test("selección múltiple: 'Ninguna' es excluyente", () => {
  const b1 = preguntas[6];
  assert.equal(respuestaCompleta(b1, ["FACTURA", "CUADERNO"]), true);
  assert.equal(respuestaCompleta(b1, ["NINGUNA"]), true);
  assert.equal(respuestaCompleta(b1, ["NINGUNA", "FACTURA"]), false);
  assert.equal(respuestaCompleta(b1, ["OTRA"]), false);
  assert.equal(respuestaCompleta(b1, { especial: "NS" }), true);
});

test("No sabe / Prefiere no responder solo donde la pregunta lo admite", () => {
  const ci1 = preguntas[0];
  const sm3 = preguntas[7];
  assert.equal(respuestaCompleta(sm3, { especial: "NR" }), true);
  assert.equal(respuestaCompleta(ci1, { especial: "NR" }), false);
  assert.equal(respuestaCompleta(sm3, 0), true, "0 es una calificación válida en escala 0–10");
  assert.equal(respuestaCompleta(sm3, 11), false);
});

test("prepararEnvio: ruta A completa guarda N/A en lo que no aplica", () => {
  const envio = prepararEnvio(
    preguntas,
    { [id(1)]: "SI", [id(4)]: "SI", [id(6)]: 800, [id(7)]: ["CUADERNO"], [id(8)]: { especial: "NS" } },
    natural
  );
  assert.equal(envio.valido, true, JSON.stringify(envio.errores));
  assert.equal(envio.completada, true);
  assert.equal(envio.resultado, "completa");
  const valor = (n) => envio.respuestas.find((r) => r.pregunta_id === id(n)).valor;
  assert.equal(valor(2), NA);
  assert.equal(valor(5), "A");
  assert.deepEqual(valor(8), { especial: "NS" });
});

test("prepararEnvio: una respuesta de otra ruta no se guarda", () => {
  // Respondió B1 creyendo ruta A, pero T2 = No (ruta B): B1 queda N/A.
  const envio = prepararEnvio(
    preguntas,
    { [id(1)]: "SI", [id(4)]: "NO", [id(6)]: 500, [id(7)]: ["FACTURA"], [id(8)]: 7 },
    natural
  );
  assert.equal(envio.valido, true, JSON.stringify(envio.errores));
  assert.equal(envio.respuestas.find((r) => r.pregunta_id === id(7)).valor, NA);
});

test("prepararEnvio: CI1 = No termina la encuesta como rechazo", () => {
  const envio = prepararEnvio(preguntas, { [id(1)]: "NO" }, natural);
  assert.equal(envio.valido, true);
  assert.equal(envio.completada, false);
  assert.equal(envio.rechazo, true);
  assert.equal(envio.resultado, "rechazo");
  assert.deepEqual(envio.respuestas.map((r) => r.pregunta_id), [id(1)]);
});

test("prepararEnvio: faltantes de la ruta se reportan con el código de la pregunta", () => {
  const envio = prepararEnvio(preguntas, { [id(1)]: "SI", [id(4)]: "SI" }, natural);
  assert.equal(envio.valido, false);
  const mensajes = envio.errores.map((e) => e.mensaje).join(" | ");
  assert.match(mensajes, /A2/);
  assert.match(mensajes, /B1/);
});

test("prepararEnvio con cierre: guarda solo lo respondido y el último bloque", () => {
  const envio = prepararEnvio(preguntas, { [id(1)]: "SI", [id(4)]: "SI", [id(6)]: 300 }, natural, { cierre: "parcial" });
  assert.equal(envio.valido, true);
  assert.equal(envio.completada, false);
  assert.equal(envio.resultado, "parcial");
  assert.equal(envio.ultimoBloque, "Actividad");
  assert.ok(envio.respuestas.every((r) => r.valor !== NA));
  assert.equal(prepararEnvio(preguntas, {}, natural, { cierre: "inventado" }).valido, false);
});

test("el cuestionario de la Cooperativa 23 de Julio es válido (reglas, códigos y orden)", () => {
  const { validarCuestionario } = require("../scripts/cargar-cuestionario");
  const def = require("../tenants/coop23dejulio.cuestionario");
  const prev = process.env.TENANT;
  process.env.TENANT = "coop23dejulio";
  try {
    assert.deepEqual(validarCuestionario(def), []);
  } finally {
    if (prev === undefined) delete process.env.TENANT;
    else process.env.TENANT = prev;
  }
});

test("tenant: EDIMCA por defecto y error claro con un TENANT desconocido", () => {
  const { tenant } = require("../lib/tenant");
  assert.equal(tenant().id, process.env.TENANT || "edimca");
  assert.equal(tenant("coop23dejulio").gestionMensual, false);
  assert.throws(() => tenant("otro"), /TENANT desconocido/);
});

test("preguntasFueraDeRuta y textoConDatos (lo que usa la pantalla del encuestador)", () => {
  const fuera = preguntasFueraDeRuta(preguntas, { [id(1)]: "SI", [id(4)]: "NO" }, natural);
  assert.ok(fuera.has(id(2)), "L1 fuera: el listado trae el tipo");
  assert.ok(fuera.has(id(7)), "B1 fuera en ruta B");
  assert.ok(!fuera.has(id(4)), "T2 aplica");
  assert.equal(textoConDatos("Se dedica a {{actividad}}.", { datos: { actividad: "COMERCIO" } }), "Se dedica a COMERCIO.");
  assert.equal(textoConDatos("Se dedica a {{actividad}}.", { datos: {} }), "Se dedica a [sin dato en el listado].");
});

// Recorre el cuestionario real de 23 de Julio con distintos socios.
function cuestionarioReal() {
  const def = require("../tenants/coop23dejulio.cuestionario");
  return def.preguntas.map((p, i) => ({ ...p, id: id(100 + i), orden: i + 1 }));
}
function idDe(ps, codigo) {
  return ps.find((p) => p.codigo === codigo).id;
}

test("23 de Julio: socio sin tipo ni actividad en el listado → L1 y L2 se preguntan", () => {
  const ps = cuestionarioReal();
  const fuera = preguntasFueraDeRuta(ps, { [idDe(ps, "CI1")]: "SI" }, { datos: {} });
  assert.ok(!fuera.has(idDe(ps, "L1")), "L1 aplica");
  assert.ok(!fuera.has(idDe(ps, "L2")), "L2 aplica");
  assert.ok(fuera.has(idDe(ps, "A1")), "A1 no aplica sin actividad registrada");
  // Tipo raro en el listado ("P") también pide L1.
  assert.ok(!preguntasFueraDeRuta(ps, {}, { datos: { tipo_persona: "P" } }).has(idDe(ps, "L1")));
});

test("23 de Julio: L1 = natural y T2 = No llevan a la ruta B, que omite B1/B2/C5/L3–L5", () => {
  const ps = cuestionarioReal();
  const r = reconciliarAutoRespuestas(ps, { datos: {} }, {
    [idDe(ps, "CI1")]: "SI",
    [idDe(ps, "L1")]: "NATURAL",
    [idDe(ps, "L2")]: "COMERCIO",
    [idDe(ps, "T2")]: "NO",
  });
  assert.equal(r[idDe(ps, "TP")], "NATURAL");
  assert.equal(r[idDe(ps, "RUTA")], "B");
  for (const c of ["B1", "B2", "C5", "L3", "L4", "L5"]) assert.equal(r[idDe(ps, c)], NA, `${c} no aplica en B`);
  for (const c of ["A2", "A3", "C1", "C4", "C6", "L6", "L7", "L8"]) assert.notEqual(r[idDe(ps, c)], NA, `${c} aplica en B`);
});

test("23 de Julio: persona jurídica → ruta C, sin T2/A3/L5/L6/L7; sin operaciones salta a C6", () => {
  const ps = cuestionarioReal();
  const cliente = { datos: { tipo_persona: "JURIDICA" } };
  const r = reconciliarAutoRespuestas(ps, cliente, { [idDe(ps, "CI1")]: "SI", [idDe(ps, "A2")]: "SIN_OPERACIONES" });
  assert.equal(r[idDe(ps, "RUTA")], "C");
  for (const c of ["T2", "A3", "L5", "L6", "L7", "B1", "B2", "C1", "C2", "C3", "C4", "C5"]) {
    assert.equal(r[idDe(ps, c)], NA, `${c} no aplica`);
  }
  assert.notEqual(r[idDe(ps, "C6")], NA);
});

test("23 de Julio: tipo sin resolver → ruta U, salta al bloque común (SM0) y omite G1", () => {
  const ps = cuestionarioReal();
  const r = reconciliarAutoRespuestas(ps, { datos: {} }, { [idDe(ps, "CI1")]: "SI", [idDe(ps, "L1")]: { especial: "NS" } });
  assert.equal(r[idDe(ps, "RUTA")], "U");
  for (const c of ["A2", "C1", "C6", "AC2", "AC3", "G1", "L8"]) assert.equal(r[idDe(ps, c)], NA, `${c} no aplica en U`);
  for (const c of ["SM0", "SM3", "AC1", "AC4", "AC5"]) assert.notEqual(r[idDe(ps, c)], NA, `${c} aplica en U`);
});
