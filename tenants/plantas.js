// Estudio a plantas de manufactura (Strattos) — encuesta a empresas en modalidad
// híbrida: el encuestador contacta por llamada, WhatsApp o correo y registra la
// encuesta aquí (el canal es la primera pregunta). Sin mes de gestión: levantamiento
// único sobre la muestra de empresas cargada en Twenty, agrupada por ciudad.
//
// Cada registro `person` de Twenty es el contacto de una empresa: su nombre es el
// de la persona de contacto y la razón social va en `razonSocial` (también se
// busca por ella).

module.exports = {
  id: "plantas",
  nombre: "Estudio de plantas de manufactura",
  marca: { inicial: "P", subtitulo: "Plantas de manufactura · Strattos" },

  twenty: {
    campos: {
      codigo_cliente: "codigoEmpresa",
      grupo: "ciudad",
      mes_gestion: null,
      // Se muestra y se busca como «Empresa».
      id_externo: "razonSocial",
      status: "estadoGestion",
      intentos: "intentosContacto",
      telefono: "celular",
      total: null,
      fecha_atencion: null,
      etiqueta: null,
    },
    datos: {
      razon_social: "razonSocial",
      ruc: "ruc",
      ciudad: "ciudad",
      sector: "sector",
      cargo: "cargoContacto",
      correo: "correoContacto",
    },
    // Solo se encuestan empresas cargadas desde la muestra (con código).
    requiereCodigo: true,
    estados: { completada: "COMPLETA", rechazo: "RECHAZO" },
    // Resultados con los que se cierra una gestión sin terminar la encuesta (en este
    // orden se le ofrecen al encuestador).
    estadosCierre: {
      primera_llamada: "PRIMERA_LLAMADA",
      correo_enviado: "CORREO_ENVIADO",
      esperando_correo: "ESPERANDO_CORREO",
      whatsapp_enviado: "WHATSAPP_ENVIADO",
      cita: "CITA",
      parcial: "PARCIAL",
      no_contesta: "NO_CONTESTA",
      no_contacto: "NO_CONTACTO",
      no_interesado: "NO_INTERESADO",
      numero_incorrecto: "NUMERO_INCORRECTO",
      informante_no_autorizado: "INFORMANTE_NO_AUTORIZADO",
      fuera_universo: "FUERA_UNIVERSO",
    },
    estadosExcluidos: ["RECHAZO", "NO_INTERESADO", "NUMERO_INCORRECTO", "FUERA_UNIVERSO", "COMPLETA"],
    limpieza: {
      texto: ["razonSocial", "ciudad", "sector"],
      telefono: ["celular"],
      numerico: [],
    },
  },

  // Campos personalizados de `person` en el Twenty del estudio
  // (scripts/twenty-esquema.js crea los que falten; no modifica ni borra otros).
  esquemaTwenty: [
    { name: "codigoEmpresa", label: "Código de empresa", type: "TEXT", icon: "IconHash" },
    { name: "razonSocial", label: "Razón social", type: "TEXT", icon: "IconBuildingFactory2" },
    { name: "ruc", label: "RUC", type: "TEXT", icon: "IconReceipt" },
    { name: "ciudad", label: "Ciudad", type: "TEXT", icon: "IconMapPin" },
    { name: "sector", label: "Sector", type: "TEXT", icon: "IconBriefcase" },
    { name: "cargoContacto", label: "Cargo del contacto", type: "TEXT", icon: "IconId" },
    { name: "correoContacto", label: "Correo del contacto", type: "TEXT", icon: "IconMail" },
    { name: "celular", label: "Teléfono / celular", type: "TEXT", icon: "IconPhone" },
    { name: "intentosContacto", label: "Intentos de contacto", type: "NUMBER", icon: "IconPhoneCall" },
    {
      name: "estadoGestion", label: "Estado de gestión", type: "SELECT", icon: "IconProgressCheck",
      defaultValue: "'PENDIENTE'",
      opciones: [
        ["PENDIENTE", "Pendiente", "gray"],
        ["COMPLETA", "Completa", "green"],
        ["PRIMERA_LLAMADA", "Primera llamada", "sky"],
        ["CORREO_ENVIADO", "Correo enviado", "turquoise"],
        ["ESPERANDO_CORREO", "Esperando respuesta de correo", "turquoise"],
        ["WHATSAPP_ENVIADO", "WhatsApp enviado", "green"],
        ["CITA", "Cita agendada", "blue"],
        ["PARCIAL", "Parcial", "yellow"],
        ["NO_CONTACTO", "No contacto", "orange"],
        ["NO_CONTESTA", "No contesta", "yellow"],
        ["RECHAZO", "Rechazo", "red"],
        ["NO_INTERESADO", "No interesado", "red"],
        ["NUMERO_INCORRECTO", "Número / correo incorrecto", "pink"],
        ["INFORMANTE_NO_AUTORIZADO", "Informante no autorizado", "purple"],
        ["FUERA_UNIVERSO", "Fuera del universo", "sky"],
      ],
    },
  ],

  // Columnas del listado en la exportación a Excel (después del grupo: Ciudad).
  exportacion: {
    codigo: "CODIGO_EMPRESA",
    datos: [
      { header: "EMPRESA", dato: "razon_social" },
      { header: "RUC", dato: "ruc" },
      { header: "SECTOR", dato: "sector" },
    ],
  },

  etiquetas: { grupo: "Ciudad", grupoPlural: "Ciudades", idExterno: "Empresa" },

  gestionMensual: false,
  // Todas las preguntas son obligatorias (NS/NR cuentan como respuesta).
  avanceObligatorio: true,
  // Una gestión cerrada sin terminar (parcial, cita, correo enviado…) se retoma donde
  // quedó al volver a abrir la empresa (otro día u otro dispositivo).
  retomarParciales: true,
  metaPorGrupo: false,

  // 0002 carga el cuestionario de EDIMCA: aquí el cuestionario es otro.
  migracionesOmitidas: ["0002_seed_cuestionario_edimca.sql"],
};
