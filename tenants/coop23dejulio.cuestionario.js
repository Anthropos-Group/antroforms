// Cuestionario de la Cooperativa 23 de Julio — "Caracterización del riesgo LA/FT
// (Art. 60, Res. SEPS-2026-0119), con salud de marca y preguntas ácidas".
// Fuente: 23deJulio_Instrumento_cuantitativo_encuesta_ajustada_131126.docx
//
// Se carga con: TENANT=coop23dejulio node scripts/cargar-cuestionario.js
// Las reglas de ruta (`mostrar_si`, `termina_si`, `config.calculo`) se explican en
// lib/encuesta-logica.js. Los datos del cliente (`cliente: "…"`) son las claves de
// `twenty.datos` en tenants/coop23dejulio.js.

const NS_NR = ["NS", "NR"];
const op = (valor, etiqueta, extra = {}) => ({ valor, etiqueta, ...extra });

// --- Reglas reutilizables ---------------------------------------------------
const ruta = (...rutas) => ({ pregunta: "RUTA", op: "en", valor: rutas });
const tipoConfirmado = { pregunta: "TP", op: "en", valor: ["NATURAL", "JURIDICA"] };
const esNatural = { pregunta: "TP", op: "=", valor: "NATURAL" };
const esJuridica = { pregunta: "TP", op: "=", valor: "JURIDICA" };
const conOperaciones = { no: { pregunta: "A2", op: "=", valor: "SIN_OPERACIONES" } };
// La actividad cambió o no constaba: hay que volver a levantar antigüedad, cantón y RUC.
const actividadNueva = { alguna: [{ pregunta: "A1", op: "=", valor: "NO" }, { pregunta: "L2", op: "respondida" }] };
const faltaOActividadNueva = (dato) => ({ alguna: [{ cliente: dato, op: "vacio" }, actividadNueva] });

const RANGOS_USD = (cero) => [
  op("0", cero),
  op("1_499", "Más de 0 y menos de 500"),
  op("500_999", "De 500 a menos de 1.000"),
  op("1000_1999", "De 1.000 a menos de 2.000"),
  op("2000_4999", "De 2.000 a menos de 5.000"),
  op("5000_9999", "De 5.000 a menos de 10.000"),
  op("10000_MAS", "10.000 o más"),
];

module.exports = {
  nombre: "Cooperativa 23 de Julio — Caracterización LA/FT 2026",
  guion_apertura:
    "Buenos días/tardes, ¿hablo con [nombre del socio o representante]? Soy {{ENCUESTADOR}} y le llamo en nombre de la Cooperativa de Ahorro y Crédito 23 de Julio, con el apoyo de la empresa Strattos. La cooperativa está haciendo un estudio para conocer mejor cómo trabajan y usan sus servicios sus socios. Dura unos 10 minutos y es voluntaria: puede no responder cualquier pregunta o terminar cuando quiera. No le pediremos cédula ni números de cuenta. Sus respuestas son confidenciales: se identifican con un código y la cooperativa recibe solo resultados agrupados. Si desea verificar esta llamada, puede comunicarse con la cooperativa al [PENDIENTE: teléfono de verificación]. Para ejercer sus derechos sobre sus datos puede escribir a [PENDIENTE: correo del responsable del estudio].",
  guion_cierre: "¡Muchas gracias por su tiempo y su colaboración!",

  preguntas: [
    // --- Consentimiento ------------------------------------------------------
    {
      codigo: "CI1", bloque: "Consentimiento", tipo: "opcion_unica",
      texto: "¿Acepta participar? (se registra la aceptación verbal; no se graba la llamada)",
      ayuda:
        "Antes de leer, confirme que habla con el titular seleccionado. Si es persona jurídica, confirme que responde el representante legal o una persona autorizada que conoce las finanzas de la organización. Si no es la persona indicada, cierre la llamada como «Informante no autorizado» o «Cita». Si luego retira su consentimiento, cierre como «Parcial», sin completar por inferencia.",
      config: { opciones: [op("SI", "Sí, acepto"), op("NO", "No acepto → agradecer y terminar")], resultado: "rechazo" },
      termina_si: { pregunta: "CI1", op: "=", valor: "NO" },
    },
    {
      codigo: "IND_GENERAL", bloque: "Consentimiento", tipo: "informativa",
      texto: "Indicación general",
      ayuda:
        "Una sola respuesta salvo selección múltiple expresa. «No sabe» y «Prefiere no responder» se registran por separado; nunca como cero. En preguntas múltiples, «Ninguna», «No sabe» y «Prefiere no responder» son excluyentes. Persona jurídica: todas las respuestas se refieren a la organización.",
    },

    // --- Datos del listado y ruta ------------------------------------------------
    {
      codigo: "L1", bloque: "Listado", tipo: "opcion_unica",
      texto: "¿Responde esta encuesta a título personal o en representación de una empresa o negocio legalmente constituido?",
      ayuda: "SOLO SI FALTA EL TIPO DE PERSONA. Un negocio con RUC a nombre de una persona natural sigue siendo natural. Si no se resuelve, la ruta queda U (bloque común desde SM0).",
      config: { opciones: [op("NATURAL", "A título personal (persona natural)"), op("JURIDICA", "En representación de una empresa (persona jurídica)")], especiales: NS_NR },
      // Falta o trae un valor que no es natural/jurídica.
      mostrar_si: {
        alguna: [
          { cliente: "tipo_persona", op: "vacio" },
          { cliente: "tipo_persona", op: "no_en", valor: ["NATURAL", "JURIDICA"] },
        ],
      },
    },
    {
      codigo: "TP", bloque: "Listado", tipo: "opcion_unica",
      texto: "T1. Tipo de persona (confirmado)",
      config: {
        opciones: [op("NATURAL", "Persona natural"), op("JURIDICA", "Persona jurídica"), op("PENDIENTE", "Pendiente de confirmar")],
        calculo: [
          { si: { pregunta: "L1", op: "=", valor: "NATURAL" }, valor: "NATURAL" },
          { si: { pregunta: "L1", op: "=", valor: "JURIDICA" }, valor: "JURIDICA" },
          { si: { cliente: "tipo_persona", op: "=", valor: "NATURAL" }, valor: "NATURAL" },
          { si: { cliente: "tipo_persona", op: "=", valor: "JURIDICA" }, valor: "JURIDICA" },
          { valor: "PENDIENTE" },
        ],
      },
    },
    {
      codigo: "L2", bloque: "Su actividad", tipo: "opcion_unica",
      texto: "¿A qué se dedica principalmente usted o su empresa?",
      ayuda: "SOLO SI FALTA LA ACTIVIDAD · REEMPLAZA A A1. Las opciones de jubilación o sin ingresos prevalecen sobre la categoría agrupada si describen mejor el caso. No clasifique en B solo por tener empleo: T2 identifica actividad propia adicional.",
      config: {
        // Texto según el tipo de persona confirmado (TP).
        variantes: [
          { si: esNatural, texto: "¿A qué se dedica principalmente?" },
          { si: esJuridica, texto: "¿A qué se dedica principalmente su empresa?" },
        ],
        opciones: [
          op("AGRICULTURA", "Agricultura o ganadería"),
          op("COMERCIO", "Comercio (tienda, local, mercado)"),
          op("ARTESANIA", "Artesanía o manufactura"),
          op("TRANSPORTE", "Transporte"),
          op("CONSTRUCCION", "Construcción"),
          op("SERVICIOS_PROF", "Servicios profesionales o técnicos"),
          op("TURISMO", "Turismo, hospedaje o comidas"),
          op("EDUCACION_SALUD", "Educación o salud"),
          op("OTRO_NEGOCIO", "Otro negocio o servicio (especifique)", { con_texto: true }),
          op("EMPLEADO", "Empleado en relación de dependencia"),
          op("SIN_OCUPACION", "Sin ocupación remunerada (estudiante, hogar, jubilado)"),
          op("JUBILACION", "Jubilación o pensión como fuente principal"),
          op("SIN_INGRESOS", "Sin ingresos personales actualmente"),
        ],
        especiales: NS_NR,
      },
      mostrar_si: { cliente: "actividad", op: "vacio" },
    },
    {
      codigo: "A1", bloque: "Su actividad", tipo: "opcion_unica",
      texto: "Según los registros de la cooperativa, usted (o su empresa) se dedica a {{actividad}}. ¿Sigue siendo su actividad principal?",
      config: {
        opciones: [op("SI", "Sí"), op("NO", "No — actividad actual:", { con_texto: true })],
        especiales: NS_NR,
        variantes: [
          { si: esNatural, texto: "Según los registros de la cooperativa, usted se dedica a {{actividad}}. ¿Sigue siendo su actividad principal?" },
          { si: esJuridica, texto: "Según los registros de la cooperativa, su empresa se dedica a {{actividad}}. ¿Sigue siendo su actividad principal?" },
        ],
      },
      mostrar_si: { cliente: "actividad", op: "no_vacio" },
    },
    {
      codigo: "T2", bloque: "Su actividad", tipo: "opcion_unica",
      texto: "¿Actualmente realiza alguna actividad por cuenta propia o tiene un negocio, aunque también tenga empleo, estudie o reciba una pensión?",
      ayuda: "SOLO PERSONA NATURAL. Define qué preguntas siguen: Sí = ruta A (tiene actividad propia: se pregunta por su negocio); No = ruta B (no tiene actividad propia: se pregunta por sus ingresos personales y se omiten las preguntas del negocio). Cuenta cualquier actividad propia, aunque no sea la que más ingresos le da.",
      config: { opciones: [op("SI", "Sí — actividad propia (si es secundaria, cuál):", { con_texto: true }), op("NO", "No")], especiales: NS_NR },
      mostrar_si: esNatural,
    },
    {
      codigo: "RUTA", bloque: "Su actividad", tipo: "opcion_unica",
      texto: "Ruta de aplicación",
      config: {
        opciones: [
          op("A", "A — persona natural con actividad propia, incluso secundaria"),
          op("B", "B — persona natural sin actividad propia"),
          op("C", "C — persona jurídica"),
          op("U", "U — clasificación pendiente, bloque común"),
        ],
        calculo: [
          { si: { pregunta: "TP", op: "=", valor: "JURIDICA" }, valor: "C" },
          { si: { todas: [esNatural, { pregunta: "T2", op: "=", valor: "SI" }] }, valor: "A" },
          { si: { todas: [esNatural, { pregunta: "T2", op: "=", valor: "NO" }] }, valor: "B" },
          { valor: "U" },
        ],
      },
    },
    {
      codigo: "A2", bloque: "Su actividad", tipo: "opcion_unica",
      texto: "Aproximadamente, ¿cuánto vende o cobra por mes en total por su actividad (USD)?",
      ayuda:
        "A y C: ventas o cobros brutos del negocio antes de gastos. B: lea «¿cuánto recibe por mes en total?», ingresos personales, no del hogar. Referencia: promedio mensual de los últimos tres meses. El ingreso cero no termina la encuesta.",
      config: {
        opciones: [...RANGOS_USD("0 — Sin ventas o sin ingresos"), op("SIN_OPERACIONES", "(Solo empresas) La organización no tiene operaciones")],
        especiales: NS_NR,
        // El instrumento lee A2 distinto según la ruta: se muestra ya adaptada.
        variantes: [
          {
            si: ruta("B"),
            texto: "Aproximadamente, ¿cuánto recibe por mes en total (USD)?",
            ayuda: "RUTA B (sin actividad propia): ingresos personales —sueldo, pensión, bonos, ayudas—, no los del hogar. Referencia: promedio mensual de los últimos tres meses. El ingreso cero no termina la encuesta.",
            ocultar_opciones: ["SIN_OPERACIONES"],
          },
          {
            si: ruta("C"),
            texto: "Aproximadamente, ¿cuánto vende o cobra por mes en total su empresa (USD)?",
            ayuda: "RUTA C (empresa): ventas o cobros brutos antes de gastos. Referencia: promedio mensual de los últimos tres meses. Si la organización no tiene operaciones, marque esa opción.",
          },
          {
            si: ruta("A"),
            ayuda: "RUTA A (actividad propia): ventas o cobros brutos del negocio antes de gastos. Referencia: promedio mensual de los últimos tres meses. El ingreso cero no termina la encuesta.",
            ocultar_opciones: ["SIN_OPERACIONES"],
          },
        ],
      },
      mostrar_si: ruta("A", "B", "C"),
    },
    {
      codigo: "A3", bloque: "Su actividad", tipo: "opcion_multiple",
      texto: "Además de su actividad principal, ¿tiene otra actividad o fuente de ingresos?",
      ayuda: "SOLO PERSONA NATURAL (rutas A y B). Registre únicamente fuentes adicionales a la principal.",
      config: {
        opciones: [
          op("NO_SOLO_PRINCIPAL", "No, solo la actividad principal", { excluyente: true }),
          op("OTRO_NEGOCIO", "Otro negocio o trabajo por cuenta propia"),
          op("EMPLEO", "Empleo con sueldo"),
          op("ARRIENDOS", "Arriendos"),
          op("FAMILIARES", "Dinero de familiares (en el país o del exterior)"),
          op("PENSION_BONO", "Pensión, jubilación o bono del Estado"),
          op("OTRO", "Otro (especifique)", { con_texto: true }),
          op("NINGUNA_FUENTE", "No tiene ninguna fuente de ingresos", { excluyente: true }),
        ],
        especiales: NS_NR,
      },
      mostrar_si: ruta("A", "B"),
    },

    // --- Formalidad (A y C) ---------------------------------------------------------
    {
      codigo: "B1", bloque: "Formalidad", tipo: "opcion_unica",
      texto: "¿Cómo documenta sus ventas o ingresos?",
      config: {
        opciones: [
          op("FACT_CONTAB", "Con facturas o notas de venta y contabilidad formal"),
          op("FACT_REGISTRO", "Con facturas o notas de venta y un registro sencillo"),
          op("FACT_SIN_REG", "Con facturas o notas de venta, pero sin registros propios"),
          op("CONTAB_SIN_FACT", "Con contabilidad formal, pero sin facturas o notas de venta"),
          op("SOLO_REGISTRO", "Solo con un registro propio, sin facturas o notas de venta"),
          op("NADA", "No emite documentos ni deja registros"),
          op("OTRA", "Otra forma (especifique)", { con_texto: true }),
        ],
        especiales: NS_NR,
      },
      mostrar_si: { todas: [ruta("A", "C"), conOperaciones] },
    },
    {
      codigo: "B2", bloque: "Formalidad", tipo: "opcion_unica",
      texto: "¿Su actividad necesita permisos o licencias (municipales, sanitarios, ambientales, de funcionamiento)?",
      ayuda: "Registre lo declarado sin emitir una calificación de cumplimiento durante la llamada.",
      config: {
        opciones: [
          op("SI_AL_DIA", "Sí, y tiene todos los requeridos al día"),
          op("SI_PENDIENTES", "Sí, pero tiene permisos pendientes de obtener o renovar"),
          op("SI_NINGUNO", "Sí, necesita permisos, pero no tiene ninguno"),
          op("NO_NECESITA", "Considera que no necesita permisos"),
        ],
        especiales: NS_NR,
      },
      mostrar_si: { todas: [ruta("A", "C"), conOperaciones] },
    },

    // --- Manejo del dinero ------------------------------------------------------------
    {
      codigo: "IND_B", bloque: "Manejo del dinero", tipo: "informativa",
      texto: "Aclaración para la ruta B",
      ayuda: "Lea: «En las siguientes preguntas, cuando se mencione su actividad, piense en sus ingresos y pagos personales».",
      mostrar_si: ruta("B"),
    },
    {
      codigo: "C1", bloque: "Manejo del dinero", tipo: "opcion_unica",
      texto: "De lo que cobra por su actividad, ¿qué parte es en efectivo?",
      ayuda: "Efectivo = billetes y monedas; no incluye transferencias ni tarjetas. No agrupar cero con «casi nada».",
      config: {
        opciones: [
          op("0", "Nada — 0%"),
          op("1_25", "Más de 0% y hasta 25% — hasta la cuarta parte"),
          op("26_50", "Más de 25% y hasta 50% — hasta la mitad"),
          op("51_75", "Más de 50% y hasta 75% — hasta tres cuartas partes"),
          op("76_100", "Más de 75% y hasta 100%"),
        ],
        especiales: NS_NR,
      },
      mostrar_si: { todas: [ruta("A", "B", "C"), conOperaciones] },
    },
    {
      codigo: "C2", bloque: "Manejo del dinero", tipo: "opcion_unica",
      texto: "En un mes normal, ¿cuánto dinero en efectivo maneja por su actividad (USD)?",
      ayuda:
        "«Maneja» = efectivo recibido por cobros o ingresos, sin sumar retiros ni volver a contar el mismo dinero. Promedio mensual de los últimos tres meses. Si C1 indicó una proporción positiva y responde 0, confirme la inconsistencia sin forzar una respuesta.",
      config: { opciones: RANGOS_USD("0 — Sin efectivo recibido"), especiales: NS_NR },
      mostrar_si: { todas: [ruta("A", "B", "C"), conOperaciones, { no: { pregunta: "C1", op: "=", valor: "0" } }] },
    },
    {
      codigo: "C3", bloque: "Manejo del dinero", tipo: "opcion_multiple",
      texto: "¿Qué hace normalmente con el efectivo que cobra por su actividad?",
      ayuda: "No solicite números de cuenta ni montos de depósitos.",
      config: {
        opciones: [
          op("DEPOSITA_23", "Lo deposita en la Cooperativa 23 de Julio"),
          op("DEPOSITA_OTRA", "Lo deposita en otra cooperativa o banco"),
          op("PAGA_PROVEEDORES", "Paga a proveedores o gastos en efectivo"),
          op("GUARDA", "Lo guarda en casa o en el negocio"),
          op("GASTOS_PERSONALES", "Paga gastos personales o entrega a familiares"),
          op("OTRO", "Otro (especifique)", { con_texto: true }),
        ],
        especiales: NS_NR,
      },
      mostrar_si: {
        todas: [
          ruta("A", "B", "C"),
          conOperaciones,
          { no: { pregunta: "C1", op: "=", valor: "0" } },
          { no: { pregunta: "C2", op: "=", valor: "0" } },
        ],
      },
    },
    {
      codigo: "C4", bloque: "Manejo del dinero", tipo: "opcion_unica",
      texto: "En su actividad, ¿alguna vez recibe o entrega pagos en bienes (vehículos, joyas, electrodomésticos, materiales) en lugar de dinero?",
      config: { opciones: [op("FRECUENTE", "Sí, con frecuencia"), op("OCASIONAL", "Sí, ocasionalmente"), op("NO", "No")], especiales: NS_NR },
      mostrar_si: { todas: [ruta("A", "B", "C"), conOperaciones] },
    },
    {
      codigo: "C5", bloque: "Manejo del dinero", tipo: "opcion_multiple",
      texto: "¿Su actividad está relacionada con alguna de estas?",
      ayuda: "«Otra actividad parecida» se registra textualmente, sin clasificarla por semejanza a criterio del encuestador.",
      config: {
        opciones: [
          op("MINERIA", "Minería artesanal"),
          op("COMERCIO_INFORMAL", "Comercio informal (venta ambulante o sin local fijo)"),
          op("EMPENO_ORO", "Casa de empeño o compraventa de oro"),
          op("ENVIO_DINERO", "Envío o cambio de dinero"),
          op("VEHICULOS", "Compraventa de vehículos"),
          op("OTRA", "Otra actividad parecida (especifique)", { con_texto: true }),
          op("NINGUNA", "Ninguna de las anteriores", { excluyente: true }),
        ],
        especiales: NS_NR,
      },
      mostrar_si: { todas: [ruta("A", "C"), conOperaciones] },
    },
    {
      codigo: "C6", bloque: "Manejo del dinero", tipo: "opcion_unica",
      texto:
        "[Persona natural] ¿Recibe o envía dinero del o hacia el exterior (remesas, pagos)? [Persona jurídica] ¿Realiza pagos o cobros con el exterior? En ambos casos: ¿con qué país tiene más movimiento?",
      ayuda: "Si responde sí, registre el país con mayor monto de movimiento. Si responde no, no sabe o negativa, no pida país.",
      config: {
        opciones: [
          op("NO", "No"),
          op("EEUU", "Sí, con Estados Unidos"),
          op("ESPANA", "Sí, con España"),
          op("ITALIA", "Sí, con Italia"),
          op("COLOMBIA", "Sí, con Colombia"),
          op("PERU", "Sí, con Perú"),
          op("OTRO_PAIS", "Sí, con otro país (especifique)", { con_texto: true }),
          op("SIN_PAIS_PRINCIPAL", "Sí, pero no identifica un país principal"),
        ],
        especiales: NS_NR,
      },
      mostrar_si: ruta("A", "B", "C"),
    },

    // --- Salud de marca ---------------------------------------------------------------
    {
      codigo: "SM0", bloque: "Salud de marca", tipo: "opcion_multiple",
      texto: "Le voy a leer algunos nombres de cooperativas de ahorro y crédito. Dígame cuáles conoce, aunque sea de nombre.",
      ayuda: "CONOCIMIENTO ASISTIDO. Lea siempre los mismos nombres, rotando el orden. Lista PENDIENTE de validar con la cooperativa por ciudad.",
      config: {
        opciones: [
          op("C23_JULIO", "Cooperativa 23 de Julio"),
          op("JEP", "Juventud Ecuatoriana Progresista (JEP)"),
          op("JARDIN_AZUAYO", "Jardín Azuayo"),
          op("ALIANZA_VALLE", "Alianza del Valle"),
          op("POLICIA_NACIONAL", "Policía Nacional"),
          op("29_OCTUBRE", "29 de Octubre"),
          op("COOPROGRESO", "Cooprogreso"),
          op("SAN_FRANCISCO", "San Francisco"),
          op("MUSHUC_RUNA", "Mushuc Runa"),
          op("OTRA", "Otra (especifique)", { con_texto: true }),
          op("NINGUNA", "Ninguna", { excluyente: true }),
        ],
        especiales: NS_NR,
      },
    },
    {
      codigo: "SM1", bloque: "Salud de marca", tipo: "opcion_unica",
      texto: "De las cooperativas, bancos u otras instituciones que conoce, ¿con cuáles trabaja o ha trabajado, además de la Cooperativa 23 de Julio?",
      ayuda: "No vuelva a leer la lista: anote textualmente las que mencione, sean de SM0 o cualquier otra.",
      config: {
        opciones: [op("SOLO_23", "Solo con la Cooperativa 23 de Julio"), op("MENCIONA", "Instituciones mencionadas:", { con_texto: true })],
        especiales: NS_NR,
      },
    },
    {
      codigo: "SM2", bloque: "Salud de marca", tipo: "opcion_unica",
      texto: "Si hoy tuviera que elegir UNA sola institución para guardar sus ahorros, ¿cuál elegiría?",
      ayuda: "«Ninguna (guardaría en casa)» solo si confirma ambas cosas. Identifique otra entidad si la menciona espontáneamente.",
      config: {
        opciones: [
          op("C23_JULIO", "Cooperativa 23 de Julio"),
          op("OTRA_COOP", "Otra cooperativa (cuál)", { con_texto: true }),
          op("BANCO", "Un banco (cuál)", { con_texto: true }),
          op("OTRA_INST", "Otra institución (cuál)", { con_texto: true }),
          op("CASA", "Ninguna (guardaría en casa)"),
          op("NINGUNA_SIN_LUGAR", "Ninguna institución, sin especificar dónde guardaría sus ahorros"),
        ],
        especiales: NS_NR,
      },
    },
    {
      codigo: "SM3", bloque: "Salud de marca", tipo: "opcion_unica",
      texto:
        "En una escala de 0 a 10, donde 0 es «nada probable» y 10 es «muy probable», ¿qué tan probable es que recomiende la Cooperativa 23 de Julio a un familiar o amigo?",
      ayuda: "«No tiene experiencia suficiente», «No sabe» y «Prefiere no responder» van fuera de la escala y no se codifican como 0.",
      config: {
        en_fila: true,
        opciones: [
          ...Array.from({ length: 11 }, (_, n) => op(String(n), String(n))),
          op("SIN_EXPERIENCIA", "No tiene experiencia suficiente para recomendar"),
        ],
        especiales: NS_NR,
      },
    },
    {
      codigo: "SM4", bloque: "Salud de marca", tipo: "opcion_unica",
      texto: "¿Qué es lo que MENOS le gusta de la Cooperativa 23 de Julio?",
      ayuda: "Respuesta espontánea; anote textualmente. No lea las categorías ni discuta lo que diga.",
      config: {
        opciones: [
          op("TEXTUAL", "Respuesta textual:", { con_texto: true }),
          op("NADA", "Nada en particular"),
          op("SIN_EXPERIENCIA", "No tiene experiencia suficiente"),
        ],
        especiales: NS_NR,
      },
    },
    {
      codigo: "SM5", bloque: "Salud de marca", tipo: "opcion_multiple",
      texto: "En los próximos 6 meses, ¿tiene previsto abrir o contratar con la Cooperativa 23 de Julio alguno de estos productos o servicios?",
      ayuda: "Catálogo PENDIENTE de validar con la oferta real de la cooperativa.",
      config: {
        opciones: [
          op("AHORROS", "Cuenta de ahorros"),
          op("PLAZO_FIJO", "Depósito a plazo fijo"),
          op("CREDITO", "Crédito (de consumo o microcrédito)"),
          op("TARJETA", "Tarjeta de débito o crédito"),
          op("DIGITAL", "Servicios digitales (aplicación móvil o banca por internet)"),
          op("REMESAS", "Envío o recepción de remesas"),
          op("OTRO", "Otro producto o servicio (especifique)", { con_texto: true }),
          op("NINGUNO", "Ninguno por ahora", { excluyente: true }),
          op("NO_DECIDE", "Aún no lo decide", { excluyente: true }),
        ],
        especiales: NS_NR,
      },
    },

    // --- Preguntas ácidas ----------------------------------------------------------------
    {
      codigo: "IND_AC", bloque: "Entorno y trámites", tipo: "informativa",
      texto: "Antes de las preguntas sobre el entorno",
      ayuda: "Lea: «Le recuerdo que sus respuestas son confidenciales y se analizan de forma agrupada».",
    },
    {
      codigo: "AC1", bloque: "Entorno y trámites", tipo: "escala",
      texto:
        "¿Qué tan de acuerdo está con esta frase? «Es común que los negocios de su zona manejen parte de su dinero sin registrarlo formalmente.»",
      ayuda: "Lea las etiquetas completas: 1 Muy en desacuerdo; 2 En desacuerdo; 3 Ni de acuerdo ni en desacuerdo; 4 De acuerdo; 5 Muy de acuerdo. «No sabe» no es el valor 3.",
      config: { min: 1, max: 5, etiquetas: { min: "1 = Muy en desacuerdo", max: "5 = Muy de acuerdo" }, especiales: NS_NR },
    },
    {
      codigo: "AC2", bloque: "Entorno y trámites", tipo: "opcion_unica",
      texto:
        "En los últimos 12 meses, ¿le han ofrecido a usted (o a su empresa) invertir dinero con promesas de ganancias altas y rápidas (pirámides, «ahorros que se duplican», inversiones por redes sociales o criptomonedas)?",
      config: { opciones: [op("SI_PARTICIPO", "Sí, y participé"), op("SI_NO_PARTICIPO", "Sí, pero no participé"), op("NO", "No me han ofrecido")], especiales: NS_NR },
      mostrar_si: ruta("A", "B", "C"),
    },
    {
      codigo: "AC3", bloque: "Entorno y trámites", tipo: "opcion_unica",
      texto: "En los últimos 12 meses, ¿ha pedido dinero prestado usted (o su empresa) a prestamistas informales (chulco o «gota a gota»)?",
      ayuda: "Distinga el préstamo de prestamistas del apoyo ocasional de familiares o amigos; no pida la identidad del prestamista.",
      config: { opciones: [op("SI", "Sí"), op("NO", "No")], especiales: NS_NR },
      mostrar_si: ruta("A", "B", "C"),
    },
    {
      codigo: "AC4", bloque: "Entorno y trámites", tipo: "opcion_unica",
      texto: "¿Conoce a personas o negocios de su zona que reciben en su cuenta dinero de otras personas para entregarlo o pagarlo a terceros?",
      ayuda: "No pida nombres, cuentas ni datos identificables de terceros.",
      config: { opciones: [op("VARIOS", "Sí, a varios"), op("ALGUNO", "Sí, a alguno"), op("NO", "No conozco")], especiales: NS_NR },
    },
    {
      codigo: "AC5", bloque: "Entorno y trámites", tipo: "opcion_unica",
      texto: "Pensando en los trámites y documentos que la cooperativa le pide para sus operaciones, usted diría que son…",
      config: {
        opciones: [op("EXCESIVOS", "Excesivos"), op("ADECUADOS", "Adecuados"), op("INSUFICIENTES", "Insuficientes"), op("SIN_TRAMITES", "No he hecho trámites")],
        especiales: NS_NR,
      },
    },

    // --- Cargos públicos ---------------------------------------------------------------------
    {
      codigo: "G1", bloque: "Cargos públicos", tipo: "opcion_multiple",
      texto:
        "¿Usted (o, si responde por una empresa, alguno de sus socios o accionistas o su representante legal), o algún familiar de ellos (cónyuge o conviviente, padres, hijos, abuelos, hermanos, nietos, suegros, yernos, nueras o cuñados), ocupa o ha ocupado un cargo público de alta jerarquía o de elección popular (por ejemplo, ministro, asambleísta, alcalde, concejal, juez, fiscal, o alto mando militar o policial)?",
      ayuda:
        "Persona natural: «Sí, yo» y «Sí, un familiar». Persona jurídica: «Sí, un socio o el representante legal» y «Sí, un familiar». Se permiten varios sí. No solicite nombres.",
      config: {
        opciones: [
          op("SI_YO", "Sí, yo (solo persona natural)"),
          op("SI_SOCIO_REP", "Sí, un socio o el representante legal (solo empresas)"),
          op("SI_FAMILIAR", "Sí, un familiar"),
          op("NO", "No", { excluyente: true }),
        ],
        especiales: NS_NR,
      },
      mostrar_si: tipoConfirmado,
    },

    // --- Datos que faltan en el listado ------------------------------------------------------
    {
      codigo: "L3", bloque: "Datos faltantes", tipo: "opcion_unica",
      texto: "¿Hace cuánto tiempo realiza esta actividad? (empresa: ¿hace cuánto tiempo opera?)",
      ayuda: "SOLO SI FALTA o cambió la actividad. Registre antigüedad operativa; no la sustituya por la fecha de constitución.",
      config: {
        variantes: [
          { si: ruta("A"), texto: "¿Hace cuánto tiempo realiza esta actividad?" },
          { si: ruta("C"), texto: "¿Hace cuánto tiempo opera su empresa?" },
        ],
        opciones: [op("MENOS_1", "Menos de 1 año"), op("1_3", "De 1 a menos de 3 años"), op("3_5", "De 3 a menos de 5 años"), op("5_MAS", "5 años o más")],
        especiales: NS_NR,
      },
      mostrar_si: { todas: [ruta("A", "C"), faltaOActividadNueva("antiguedad_actividad")] },
    },
    {
      codigo: "L4", bloque: "Datos faltantes", tipo: "opcion_unica",
      texto: "¿En qué cantón realiza principalmente su actividad?",
      ayuda: "SOLO SI FALTA o cambió la actividad. «Varios cantones» debe registrar el principal si lo identifica.",
      config: {
        opciones: [
          op("MISMO_CANTON", "En el mismo cantón donde vive"),
          op("OTRO_CANTON", "En otro cantón (anote cuál)", { con_texto: true, catalogo: "cantones" }),
          op("VARIOS", "En varios cantones / sin lugar fijo (principal, si lo identifica)", { con_texto: true, catalogo: "cantones" }),
          op("SIN_ACTIVIDAD", "No realiza actualmente actividad"),
        ],
        especiales: NS_NR,
      },
      mostrar_si: { todas: [ruta("A", "C"), faltaOActividadNueva("canton_actividad")] },
    },
    {
      codigo: "L5", bloque: "Datos faltantes", tipo: "opcion_unica",
      texto: "¿Su actividad o negocio tiene RUC, o está inscrito en el RIMPE o el RISE?",
      ayuda: "SOLO SI FALTA · SOLO RUTA A. No pida el número de RUC. La mención de RISE no se convierte automáticamente en RIMPE.",
      config: {
        opciones: [
          op("RUC_GENERAL", "Sí, tiene RUC y declara régimen general"),
          op("RUC_RIMPE", "Sí, tiene RUC y declara RIMPE"),
          op("RUC_DESCONOCE", "Sí, tiene RUC, pero desconoce su régimen"),
          op("RUC_OTRO", "Sí, tiene RUC y declara otro régimen (cuál)", { con_texto: true }),
          op("SIN_RUC", "No tiene RUC"),
          op("RISE", "Menciona RISE (anote literalmente)", { con_texto: true }),
        ],
        especiales: NS_NR,
      },
      mostrar_si: { todas: [ruta("A"), faltaOActividadNueva("tiene_ruc")] },
    },
    {
      codigo: "L6", bloque: "Datos faltantes", tipo: "opcion_unica",
      texto: "¿Cuál fue su sexo al nacer?",
      ayuda: "SOLO SI FALTA · SOLO PERSONA NATURAL.",
      config: { opciones: [op("HOMBRE", "Hombre"), op("MUJER", "Mujer")], especiales: NS_NR },
      mostrar_si: { todas: [esNatural, { cliente: "sexo", op: "vacio" }] },
    },
    {
      codigo: "L7", bloque: "Datos faltantes", tipo: "numero",
      texto: "¿Cuántos años cumplidos tiene?",
      ayuda: "SOLO SI FALTA · SOLO PERSONA NATURAL. Guarde años cumplidos, no el año de nacimiento.",
      config: { min: 16, max: 110, entero: true, unidad: "años", especiales: NS_NR },
      mostrar_si: { todas: [esNatural, { cliente: "edad", op: "vacio" }] },
    },
    {
      codigo: "L8", bloque: "Datos faltantes", tipo: "opcion_unica",
      texto: "¿En qué cantón vive? (empresa: ¿en qué cantón está el domicilio de la empresa?)",
      ayuda: "SOLO SI FALTA. Elija el cantón del catálogo DPA (escriba para buscar); no confunda residencia, domicilio de la organización y lugar de actividad.",
      config: {
        variantes: [
          { si: esNatural, texto: "¿En qué cantón vive?" },
          { si: esJuridica, texto: "¿En qué cantón está el domicilio de su empresa?" },
        ],
        opciones: [
          op("CANTON", "Cantón (y provincia):", { con_texto: true, catalogo: "cantones" }),
          op("EXTERIOR", "Reside o tiene domicilio fuera de Ecuador (especifique)", { con_texto: true }),
        ],
        especiales: NS_NR,
      },
      mostrar_si: { todas: [tipoConfirmado, { cliente: "canton_domicilio", op: "vacio" }] },
    },
  ],
};
