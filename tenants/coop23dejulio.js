// Cooperativa de Ahorro y Crédito 23 de Julio — estudio de caracterización
// (CATI) a socios. No hay mes de gestión: es un levantamiento único sobre la
// base de socios cargada en su propio Twenty, agrupada por oficina.

module.exports = {
  id: "coop23dejulio",
  nombre: "Cooperativa 23 de Julio",
  marca: { inicial: "23", subtitulo: "Cooperativa 23 de Julio · Strattos" },

  twenty: {
    campos: {
      codigo_cliente: "codigoCliente",
      grupo: "nombreOficina",
      mes_gestion: null,
      id_externo: "codigoMuestra",
      status: "estadoGestion",
      telefono: "celular",
      total: null,
      fecha_atencion: null,
      etiqueta: null,
    },
    // Datos precargados del listado que deciden la ruta del cuestionario
    // (preguntas "solo si falta" L1–L8, rutas A/B/C/U).
    datos: {
      tipo_persona: "tipoPersona",
      actividad: "actividadEconomica",
      profesion: "profesion",
      edad: "edad",
      sexo: "sexo",
      canton_domicilio: "cantonDomicilio",
      canton_actividad: "cantonActividad",
      antiguedad_actividad: "antiguedadActividad",
      tiene_ruc: "tieneRuc",
      ciudad_oficina: "ciudadOficina",
    },
    estados: { completada: "COMPLETA", rechazo: "RECHAZO" },
    // Estado en Twenty según el resultado con el que se cierra la llamada.
    estadosCierre: {
      parcial: "PARCIAL",
      cita: "CITA",
      no_contacto: "NO_CONTACTO",
      numero_incorrecto: "NUMERO_INCORRECTO",
      informante_no_autorizado: "INFORMANTE_NO_AUTORIZADO",
      fuera_universo: "FUERA_UNIVERSO",
    },
    estadosExcluidos: ["RECHAZO", "NUMERO_INCORRECTO", "FUERA_UNIVERSO", "COMPLETA"],
    limpieza: {
      texto: ["nombreOficina", "actividadEconomica", "profesion", "cantonDomicilio"],
      telefono: ["celular"],
      numerico: [],
    },
  },

  // Campos personalizados de `person` que necesita este cliente en su Twenty.
  // scripts/twenty-esquema.js crea los que falten (no modifica ni borra otros).
  esquemaTwenty: [
    { name: "codigoCliente", label: "Código cliente", type: "TEXT", icon: "IconHash" },
    { name: "codigoMuestra", label: "Código de muestra", type: "TEXT", icon: "IconTicket" },
    { name: "nombreOficina", label: "Oficina", type: "TEXT", icon: "IconBuildingBank" },
    { name: "ciudadOficina", label: "Ciudad (estrato)", type: "TEXT", icon: "IconMapPin" },
    { name: "celular", label: "Celular", type: "TEXT", icon: "IconPhone" },
    {
      name: "estadoGestion", label: "Estado de gestión", type: "SELECT", icon: "IconProgressCheck",
      defaultValue: "'PENDIENTE'",
      opciones: [
        ["PENDIENTE", "Pendiente", "gray"],
        ["COMPLETA", "Completa", "green"],
        ["PARCIAL", "Parcial", "yellow"],
        ["CITA", "Cita", "blue"],
        ["NO_CONTACTO", "No contacto", "orange"],
        ["RECHAZO", "Rechazo", "red"],
        ["NUMERO_INCORRECTO", "Número incorrecto", "pink"],
        ["INFORMANTE_NO_AUTORIZADO", "Informante no autorizado", "purple"],
        ["FUERA_UNIVERSO", "Fuera del universo", "sky"],
      ],
    },
    {
      name: "tipoPersona", label: "Tipo de persona", type: "SELECT", icon: "IconUser",
      opciones: [["NATURAL", "Natural", "blue"], ["JURIDICA", "Jurídica", "purple"]],
    },
    { name: "actividadEconomica", label: "Actividad económica", type: "TEXT", icon: "IconBriefcase" },
    { name: "profesion", label: "Profesión", type: "TEXT", icon: "IconSchool" },
    { name: "edad", label: "Edad", type: "NUMBER", icon: "IconCalendar" },
    { name: "sexo", label: "Sexo al nacer", type: "TEXT", icon: "IconGenderBigender" },
    { name: "cantonDomicilio", label: "Cantón de domicilio", type: "TEXT", icon: "IconHome" },
    { name: "cantonActividad", label: "Cantón de la actividad", type: "TEXT", icon: "IconMap" },
    { name: "antiguedadActividad", label: "Antigüedad de la actividad", type: "TEXT", icon: "IconClock" },
    { name: "tieneRuc", label: "Registro tributario (RUC/RIMPE)", type: "TEXT", icon: "IconReceipt" },
  ],

  etiquetas: { grupo: "Oficina", grupoPlural: "Oficinas", idExterno: "Código de muestra" },

  gestionMensual: false,
  // Las cuotas por oficina se definen cuando llegue el diseño muestral.
  metaPorGrupo: false,

  // 0002 carga el cuestionario de EDIMCA: aquí el cuestionario es otro.
  migracionesOmitidas: ["0002_seed_cuestionario_edimca.sql"],
};
