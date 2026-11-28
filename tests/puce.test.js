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
  assert.deepEqual(porCodigo("CANAL").config.opciones.map((o) => o.valor), ["LLAMADA", "WHATSAPP", "CORREO"]);
  assert.ok(!JSON.stringify(def).toLowerCase().includes("presencial"), "sin modalidad presencial (PMO)");
  const pos = (c) => preguntas.findIndex((p) => p.codigo === c);
  assert.ok(pos("GESTION") < pos("CI1") && pos("CI1") < pos("ENC_NOMBRE") && pos("ENC_NOMBRE") < pos("IND_GENERAL"));
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
  const SIN_NSNR = ["CANAL", "CI1", "GESTION", "CITA_MODALIDAD", "ENC_NOMBRE", "ENC_CARGO"];
  for (const p of preguntas) {
    if (p.tipo === "informativa" || SIN_NSNR.includes(p.codigo)) continue;
    if (p.tipo === "texto_abierto") assert.equal(p.config?.opcional, true, p.codigo);
    else assert.deepEqual(p.config?.especiales, ["NS", "NR"], p.codigo);
  }
});

test("una sola persona responde: nombre y cargo obligatorios, teléfono opcional", () => {
  assert.ok(!porCodigo("ENC_NOMBRE").config?.opcional);
  assert.ok(!porCodigo("ENC_CARGO").config?.opcional);
  assert.equal(porCodigo("ENC_TELEFONO").config.opcional, true);
  const sinCargo = prepararEnvio(preguntas, todas({ ENC_CARGO: undefined }), {});
  assert.deepEqual(sinCargo.errores.map((e) => e.preguntaId), ["ENC_CARGO"]);
});

test("gestión: qué pasó en el contacto decide si se anota otro contacto o la cita", () => {
  const { preguntasFueraDeRuta } = require("../lib/encuesta-logica");
  const DERIVA = ["CD_NOMBRE", "CD_TELEFONO", "CD_CORREO"];
  const AGENDA = ["CITA_FECHA", "CITA_HORA", "CITA_MODALIDAD"];
  const responde = preguntasFueraDeRuta(preguntas, { CANAL: "LLAMADA", GESTION: "RESPONDE" }, {});
  for (const c of [...DERIVA, ...AGENDA]) assert.ok(responde.has(c), c);
  const deriva = preguntasFueraDeRuta(preguntas, { CANAL: "LLAMADA", GESTION: "DERIVA" }, {});
  for (const c of DERIVA) assert.ok(!deriva.has(c), c);
  for (const c of AGENDA) assert.ok(deriva.has(c), c);
  const agenda = preguntasFueraDeRuta(preguntas, { CANAL: "LLAMADA", GESTION: "AGENDA" }, {});
  for (const c of AGENDA) assert.ok(!agenda.has(c), c);
  // Correo enviado al otro contacto, sin empezar la encuesta.
  const envio = prepararEnvio(preguntas, { CANAL: "CORREO", GESTION: "DERIVA", CD_NOMBRE: "Luis", CD_CORREO: "luis@planta.ec" }, {}, { cierre: "correo_enviado" });
  assert.deepEqual(envio.respuestas.map((r) => r.pregunta_id), ["CANAL", "GESTION", "CD_NOMBRE", "CD_CORREO"]);
});

test("pantallas sin respuesta: speech para leer y notas aparte", () => {
  for (const c of ["IND_GENERAL", "S6", "S5", "S4", "S2"]) {
    const p = porCodigo(c);
    assert.ok(p.config.speech && p.config.speech.length <= 600, `${c}: speech breve`);
    assert.ok(!/^Lea[:]/.test(p.config.speech), c);
  }
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
  const envio = prepararEnvio(preguntas, { CANAL: "WHATSAPP", GESTION: "RESPONDE", CI1: "NO" }, {});
  assert.equal(envio.valido, true);
  assert.equal(envio.rechazo, true);
  assert.equal(envio.completada, false);
});

test("cerrar como parcial guarda solo lo respondido (para retomarlo después)", () => {
  const envio = prepararEnvio(preguntas, { CANAL: "CORREO", GESTION: "RESPONDE", CI1: "SI", ENC_NOMBRE: "Ana", ENC_CARGO: "Gerente", LM01_01: { calificacion: 6 } }, {}, { cierre: "parcial" });
  assert.equal(envio.valido, true);
  assert.deepEqual(envio.respuestas.map((r) => r.pregunta_id), ["CANAL", "GESTION", "CI1", "ENC_NOMBRE", "ENC_CARGO", "LM01_01"]);
  assert.equal(envio.ultimoBloque, "VI Liderazgo");
});

test("guion breve: un párrafo con Strattos y la PUCE", () => {
  const g = def.guion_apertura;
  for (const t of ["STRATTOS", "Pontificia Universidad Católica del Ecuador", "{{ENCUESTADOR}}", "{{NOMBRE}}"]) assert.ok(g.includes(t), t);
  assert.ok(!g.includes("\n"), "un solo párrafo");
  assert.ok(g.length <= 500, `máximo unos 5 renglones (${g.length} caracteres)`);
});

test("el guion saluda al representante legal y nombra la empresa", () => {
  const { textoConDatos } = require("../lib/encuesta-logica");
  const g = def.guion_apertura.replace("{{NOMBRE}}", "CERVECERIA NACIONAL").replace("{{ENCUESTADOR}}", "Ana");
  const texto = textoConDatos(g, { datos: { representante_legal: "ROA ECHEVERRÍA JUAN PABLO" } });
  assert.ok(texto.startsWith("Buenos días/tardes, ¿hablo con ROA ECHEVERRÍA JUAN PABLO, de CERVECERIA NACIONAL?"), texto.slice(0, 90));
  const { tenant } = require("../lib/tenant");
  assert.equal(tenant("puce").twenty.datos.representante_legal, "representanteLegal");
});

test("revisión GMRG: introducciones originales de cada módulo", () => {
  assert.ok(porCodigo("S2").config.speech.includes("se consideran como tecnologías digitales novedosas las tecnologías informáticas que son nuevas en la planta (en los últimos tres años)"));
  assert.ok(porCodigo("S4").config.speech.includes("Las innovaciones de proceso son nuevos métodos de manufactura en su planta."));
  assert.ok(porCodigo("S5").config.speech.includes("La cultura de planta es un sistema de normas compartidas"));
  assert.ok(porCodigo("S6").config.speech.includes("El equipo directivo de la planta es el pequeño grupo de altos ejecutivos de la misma."));
});

test("revisión GMRG: NS/NR con código propio y el 0 de participación como ausencia de información", () => {
  const { codificar, filasDiccionario, columnasRespuestas } = require("../lib/exportacion-rutas");
  const lm = porCodigo("LM01_01");
  assert.deepEqual(codificar(lm, { especial: "NS" }), { LM01_01: "NS" });
  assert.deepEqual(codificar(lm, { especial: "NR" }), { LM01_01: "NR" });
  assert.deepEqual(codificar(lm, { calificacion: 7 }), { LM01_01: 7 });
  const dic = filasDiccionario(preguntas).filter((f) => f.columna === "FC10_01");
  const cero = dic.find((f) => f.valor === "0");
  assert.ok(cero && /ausencia de información/i.test(cero.etiqueta));
  assert.ok(dic.some((f) => f.valor === "1–5"));
  // Datos personales de la gestión no van al Excel de análisis.
  const columnas = columnasRespuestas(preguntas).map((c) => c.header);
  for (const c of ["ENC_NOMBRE", "ENC_TELEFONO", "CD_NOMBRE", "CD_TELEFONO", "CD_CORREO"]) assert.ok(!columnas.includes(c), c);
  assert.ok(columnas.includes("ENC_CARGO"), "el cargo sí se exporta (perfil del informante)");
});
