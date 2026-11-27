// Estudio a plantas de manufactura (Strattos) — encuesta a empresas en modalidad
// híbrida: el encuestador contacta por llamada, WhatsApp, correo o en persona y
// registra la encuesta aquí (el canal es la primera pregunta). Sin mes de gestión:
// levantamiento único sobre la base de empresas cargada en Twenty, agrupada por tipo
// de empresa. Proceso de la PMO: documentos/Proceso_de_encuesta.docx.
//
// Cada registro `person` de Twenty es una empresa: su nombre es el nombre de la
// empresa y la razón social va en `razonSocial` (también se busca por ella). Los
// datos de la gestión (otro contacto, cita, encuestado) se copian a Twenty desde la
// encuesta (`respuestasACampos`).

module.exports = {
  id: "puce",
  nombre: "PUCE · Estudio de plantas de manufactura",
  marca: { inicial: "P", subtitulo: "PUCE · Plantas de manufactura · Strattos" },

  twenty: {
    campos: {
      codigo_cliente: "codigoEmpresa",
      grupo: "tipoEmpresa",
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
      tipo_empresa: "tipoEmpresa",
      telefono2: "telefono2",
      correo: "correoContacto",
      ciudad: "ciudad",
      sector: "sector",
      prioridad: "prioridad",
      elegibilidad: "elegibilidad",
      // Se nombra en el guion de apertura: «¿hablo con <representante>, de <empresa>?».
      representante_legal: "representanteLegal",
    },
    // Respuestas que también se escriben en Twenty al cerrar cada gestión.
    respuestasACampos: {
      CD_NOMBRE: "contactoDerivadoNombre",
      CD_TELEFONO: "contactoDerivadoTelefono",
      CD_CORREO: "contactoDerivadoCorreo",
      CITA_FECHA: "fechaCita",
      CITA_HORA: "horaCita",
      CITA_MODALIDAD: "modalidadCita",
      ENC_NOMBRE: "encuestadoNombre",
      ENC_CARGO: "encuestadoCargo",
      ENC_TELEFONO: "encuestadoTelefono",
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
      texto: ["razonSocial", "tipoEmpresa", "ciudad", "sector"],
      telefono: ["celular", "telefono2", "whatsapp"],
      numerico: [],
    },
  },

  // Campos personalizados de `person` en el Twenty del estudio
  // (scripts/twenty-esquema.js crea los que falten; no modifica ni borra otros).
  esquemaTwenty: [
    { name: "codigoEmpresa", label: "Código de empresa", type: "TEXT", icon: "IconHash" },
    { name: "razonSocial", label: "Razón social", type: "TEXT", icon: "IconBuildingFactory2" },
    { name: "ruc", label: "RUC", type: "TEXT", icon: "IconReceipt" },
    { name: "tipoEmpresa", label: "Tipo de empresa", type: "TEXT", icon: "IconCategory" },
    { name: "celular", label: "Teléfono 1", type: "TEXT", icon: "IconPhone" },
    { name: "telefono2", label: "Teléfono 2", type: "TEXT", icon: "IconPhone" },
    { name: "correoContacto", label: "Correo de la empresa", type: "TEXT", icon: "IconMail" },
    { name: "ciudad", label: "Ciudad", type: "TEXT", icon: "IconMapPin" },
    { name: "sector", label: "Sector", type: "TEXT", icon: "IconBriefcase" },
    { name: "cargoContacto", label: "Cargo del contacto", type: "TEXT", icon: "IconId" },
    // Datos de la base de Strattos (base_contacto_AAAAMMDD.csv).
    { name: "prioridad", label: "Prioridad", type: "NUMBER", icon: "IconFlag" },
    { name: "elegibilidad", label: "Elegibilidad", type: "TEXT", icon: "IconChecklist" },
    { name: "telefono3", label: "Otros teléfonos", type: "TEXT", icon: "IconPhone" },
    { name: "whatsapp", label: "WhatsApp confirmado", type: "TEXT", icon: "IconBrandWhatsapp" },
    { name: "correo2", label: "Correo 2", type: "TEXT", icon: "IconMail" },
    { name: "direccion", label: "Dirección", type: "TEXT", icon: "IconMap" },
    { name: "origenBase", label: "Origen de la base", type: "TEXT", icon: "IconDatabase" },
    { name: "representanteLegal", label: "Representante legal", type: "TEXT", icon: "IconUserStar" },
    { name: "sitioWeb", label: "Sitio web", type: "TEXT", icon: "IconWorld" },
    // Gestión (se llenan desde la encuesta).
    { name: "contactoDerivadoNombre", label: "Otro contacto: nombre", type: "TEXT", icon: "IconUserShare" },
    { name: "contactoDerivadoTelefono", label: "Otro contacto: teléfono", type: "TEXT", icon: "IconPhone" },
    { name: "contactoDerivadoCorreo", label: "Otro contacto: correo", type: "TEXT", icon: "IconMail" },
    { name: "fechaCita", label: "Fecha de cita", type: "TEXT", icon: "IconCalendarEvent" },
    { name: "horaCita", label: "Hora de cita", type: "TEXT", icon: "IconClock" },
    { name: "modalidadCita", label: "Modalidad de la cita", type: "TEXT", icon: "IconMapPin" },
    { name: "encuestadoNombre", label: "Encuestado: nombre", type: "TEXT", icon: "IconUserCheck" },
    { name: "encuestadoCargo", label: "Encuestado: cargo", type: "TEXT", icon: "IconId" },
    { name: "encuestadoTelefono", label: "Encuestado: teléfono", type: "TEXT", icon: "IconPhone" },
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

  // Columnas del listado en la exportación a Excel (después del grupo: tipo de empresa).
  exportacion: {
    codigo: "CODIGO_EMPRESA",
    datos: [
      { header: "RAZON_SOCIAL", dato: "razon_social" },
      { header: "RUC", dato: "ruc" },
      { header: "SEGMENTO", dato: "sector" },
      { header: "CANTON", dato: "ciudad" },
      { header: "PRIORIDAD", dato: "prioridad" },
      { header: "ELEGIBILIDAD", dato: "elegibilidad" },
    ],
  },

  etiquetas: { grupo: "Tipo de empresa", grupoPlural: "Tipos de empresa", idExterno: "Razón social" },

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
