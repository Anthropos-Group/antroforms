// Cuestionario de plantas de manufactura: orden de secciones, tablas 1–7, NS/NR y rutas.
const test = require("node:test");
const assert = require("node:assert/strict");
const def = require("../tenants/puce.cuestionario");
const { prepararEnvio, rangoGrupo, siguientePantalla } = require("../lib/encuesta-logica");

// Las preguntas llevan id en la base; aquí el código hace de id.
const preguntas = def.preguntas.map((p) => ({ ...p, id: p.codigo }));
const porCodigo = (c) => preguntas.find((p) => p.codigo === c);

// Respuesta válida para cualquier pregunta (la primera opción, el mínimo de la escala…).
function responder(p) {
  if (p.tipo === "informativa") return undefined;
  if (p.tipo === "escala") return { calificacion: p.config.min };
  if (p.tipo === "texto_abierto") return "Respuesta de prueba";
  if (p.tipo === "numero") return 25;
  if (p.tipo === "opcion_unica") return p.config.opciones[0].valor;
  throw new Error(`tipo sin respuesta de prueba: ${p.tipo}`);
}

function todas(extra = {}) {
  const r = {};
  for (const p of preguntas) {
    const v = responder(p);
    if (v !== undefined) r[p.id] = v;
  }
  return { ...r, ...extra };
}

test("secciones en el orden 6 → 5 → 4 → 2, con canal, gestión y consentimiento al inicio", () => {
  assert.equal(preguntas[0].codigo, "CANAL");
  assert.deepEqual(porCodigo("CANAL").config.opciones.map((o) => o.valor), ["LLAMADA", "WHATSAPP", "CORREO", "PRESENCIAL"]);
  const pos = (c) => preguntas.findIndex((p) => p.codigo === c);
  assert.ok(pos("GD1") < pos("GC1") && pos("GC1") < pos("CI1") && pos("CI1") < pos("ENC_NOMBRE"));
  const inicio = (prefijo) => preguntas.findIndex((p) => p.codigo.startsWith(prefijo));
  assert.ok(inicio("LM01") < inicio("FC01"));
  assert.ok(inicio("FC01") < inicio("IN01"));
  assert.ok(inicio("IN01") < inicio("SC01"));
});

test("LM01 es una sola tabla de 26 afirmaciones con escala 1–7 (incluye las dos sin escala del Word)", () => {
  const i = preguntas.findIndex((p) => p.codigo === "LM01_01");
  const r = rangoGrupo(preguntas, i);
  assert.equal(r.fin - r.inicio + 1, 26);
  assert.equal(preguntas[r.fin].texto, "Utilizar métodos electrónicos de comunicación con los empleados.");
  for (const p of preguntas.slice(r.inicio, r.fin + 1)) {
    assert.equal(p.config.min, 1);
    assert.equal(p.config.max, 7);
  }
  // «Siguiente» desde la tabla va directo a la pantalla después de las 26.
  assert.equal(preguntas[siguientePantalla(preguntas, i, 1)].codigo, "S5");
});

test("las cerradas admiten NS y NR (salvo canal, gestión y consentimiento); las abiertas son opcionales", () => {
  const SIN_NSNR = ["CANAL", "CI1", "GD1", "GC1", "CITA_MODALIDAD", "ENC_NOMBRE", "ENC_CARGO"];
  for (const p of preguntas) {
    if (p.tipo === "informativa" || SIN_NSNR.includes(p.codigo)) continue;
    if (p.tipo === "texto_abierto") assert.equal(p.config?.opcional, true, p.codigo);
    else assert.deepEqual(p.config?.especiales, ["NS", "NR"], p.codigo);
  }
});

test("una sola persona responde: nombre y cargo obligatorios, teléfono opcional", () => {
  assert.equal(porCodigo("ENC_NOMBRE").config, undefined);
  assert.equal(porCodigo("ENC_CARGO").config, undefined);
  assert.equal(porCodigo("ENC_TELEFONO").config.opcional, true);
  const sinCargo = prepararEnvio(preguntas, todas({ ENC_CARGO: undefined }), {});
  assert.deepEqual(sinCargo.errores.map((e) => e.preguntaId), ["ENC_CARGO"]);
});

test("gestión: otro contacto y cita solo se piden si la empresa lo solicita, y son opcionales", () => {
  const { preguntasFueraDeRuta } = require("../lib/encuesta-logica");
  const fuera = preguntasFueraDeRuta(preguntas, { CANAL: "LLAMADA" }, {});
  for (const c of ["CD_NOMBRE", "CD_TELEFONO", "CD_CORREO", "CITA_FECHA", "CITA_HORA", "CITA_MODALIDAD"]) assert.ok(fuera.has(c), c);
  const dentro = preguntasFueraDeRuta(preguntas, { CANAL: "LLAMADA", GD1: "SI", GC1: "SI" }, {});
  for (const c of ["CD_NOMBRE", "CITA_FECHA", "CITA_MODALIDAD"]) assert.ok(!dentro.has(c), c);
  // Correo enviado al otro contacto, sin empezar la encuesta.
  const envio = prepararEnvio(preguntas, { CANAL: "CORREO", GD1: "SI", CD_NOMBRE: "Luis", CD_CORREO: "luis@planta.ec" }, {}, { cierre: "correo_enviado" });
  assert.deepEqual(envio.respuestas.map((r) => r.pregunta_id), ["CANAL", "GD1", "CD_NOMBRE", "CD_CORREO"]);
});

test("las abiertas se pueden dejar en blanco y no se guardan vacías", () => {
  const abiertas = preguntas.filter((p) => p.tipo === "texto_abierto" && p.config?.opcional).map((p) => p.id);
  const sinAbiertas = todas(Object.fromEntries(abiertas.map((id) => [id, undefined])));
  const envio = prepararEnvio(preguntas, sinAbiertas, {});
  assert.equal(envio.valido, true, JSON.stringify(envio.errores?.slice(0, 3)));
  assert.equal(envio.completada, true);
  // Solo quedan las que no aplican por ruta («Otros: especifique»), como N/A.
  assert.ok(envio.respuestas.filter((r) => abiertas.includes(r.pregunta_id)).every((r) => r.valor === "N/A"));
  assert.ok(!envio.respuestas.some((r) => r.pregunta_id === "IN16"));
  // Una cerrada sin responder sí bloquea.
  assert.equal(prepararEnvio(preguntas, todas({ LM01_05: undefined }), {}).valido, false);
});

test("gestión por canal: primera llamada, correo y WhatsApp enviados, esperando correo y cita", () => {
  const { tenant } = require("../lib/tenant");
  const cierres = tenant("puce").twenty.estadosCierre;
  for (const c of ["primera_llamada", "correo_enviado", "esperando_correo", "whatsapp_enviado", "cita", "parcial", "no_contesta", "no_contacto", "numero_incorrecto"]) {
    assert.ok(cierres[c], c);
    const envio = prepararEnvio(preguntas, { CANAL: "CORREO" }, {}, { cierre: c });
    assert.equal(envio.valido, true, c);
    assert.deepEqual(envio.respuestas.map((r) => r.pregunta_id), ["CANAL"]);
  }
});

test("encuesta completa válida, y con NS/NR en las tablas también", () => {
  const ok = prepararEnvio(preguntas, todas(), {});
  assert.equal(ok.valido, true, JSON.stringify(ok.errores?.slice(0, 3)));
  assert.equal(ok.completada, true);

  const conEspeciales = prepararEnvio(preguntas, todas({ LM01_01: { especial: "NS" }, SC14: { especial: "NR" }, IN13: { especial: "NS" } }), {});
  assert.equal(conEspeciales.valido, true);
});

test("«Otros» pide especificar solo si se calificó", () => {
  // Con 0 (sin información) no se pide el texto.
  const { preguntasFueraDeRuta } = require("../lib/encuesta-logica");
  assert.ok(preguntasFueraDeRuta(preguntas, todas({ FC10_09: { calificacion: 0 } }), {}).has("FC10_OTRO"));
  // Con 1–5 sí (y como es abierta, puede quedar en blanco).
  assert.ok(!preguntasFueraDeRuta(preguntas, todas({ FC10_09: { calificacion: 3 } }), {}).has("FC10_OTRO"));
  // IN02 «Otros motivos»: 1 = nunca, no se especifica.
  assert.ok(preguntasFueraDeRuta(preguntas, todas(), {}).has("IN02_OTRO"));
  assert.ok(!preguntasFueraDeRuta(preguntas, todas({ IN02_08: { calificacion: 5 } }), {}).has("IN02_OTRO"));
});

test("si la empresa no acepta, termina como rechazo", () => {
  const envio = prepararEnvio(preguntas, { CANAL: "WHATSAPP", CI1: "NO" }, {});
  assert.equal(envio.valido, true);
  assert.equal(envio.rechazo, true);
  assert.equal(envio.completada, false);
});

test("cerrar como parcial guarda solo lo respondido (para retomarlo después)", () => {
  const envio = prepararEnvio(preguntas, { CANAL: "CORREO", CI1: "SI", ENC_NOMBRE: "Ana", ENC_CARGO: "Gerente", LM01_01: { calificacion: 6 } }, {}, { cierre: "parcial" });
  assert.equal(envio.valido, true);
  assert.deepEqual(envio.respuestas.map((r) => r.pregunta_id), ["CANAL", "CI1", "ENC_NOMBRE", "ENC_CARGO", "LM01_01"]);
  assert.equal(envio.ultimoBloque, "VI Liderazgo");
});

test("guion breve: un párrafo con Strattos y la PUCE", () => {
  const g = def.guion_apertura;
  for (const t of ["STRATTOS", "Pontificia Universidad Católica del Ecuador", "{{ENCUESTADOR}}", "{{NOMBRE}}"]) assert.ok(g.includes(t), t);
  assert.ok(!g.includes("\n"), "un solo párrafo");
  assert.ok(g.length <= 500, `máximo unos 5 renglones (${g.length} caracteres)`);
});
