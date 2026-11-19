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
      // Número de llamadas registradas al socio (se actualiza con cada cierre).
      intentos: "intentosLlamada",
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
    // Solo se encuestan socios cargados desde la base (con código de cliente).
    requiereCodigo: true,
    estados: { completada: "COMPLETA", rechazo: "RECHAZO" },
    // Estado en Twenty según el resultado con el que se cierra la llamada.
    estadosCierre: {
      parcial: "PARCIAL",
      cita: "CITA",
      no_contesta: "NO_CONTESTA",
      no_contacto: "NO_CONTACTO",
      no_interesado: "NO_INTERESADO",
      numero_incorrecto: "NUMERO_INCORRECTO",
      informante_no_autorizado: "INFORMANTE_NO_AUTORIZADO",
      fuera_universo: "FUERA_UNIVERSO",
    },
    // RESERVA: reemplazo todavía no activado (el encuestador no lo ve).
    // MENOR_EDAD: socio menor de 18 años, bloqueado (no se encuesta).
    estadosExcluidos: ["RECHAZO", "NO_INTERESADO", "NUMERO_INCORRECTO", "FUERA_UNIVERSO", "COMPLETA", "RESERVA", "AGOTADO", "MENOR_EDAD"],
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
    { name: "intentosLlamada", label: "Intentos de llamada", type: "NUMBER", icon: "IconPhoneCall" },
    // Sorteo de la muestra (Entrega_Sorteo_23deJulio): principal o reemplazo, el
    // registro vinculado y el orden en que se llama dentro de cada ciudad.
    {
      name: "condicion", label: "Condición", type: "SELECT", icon: "IconArrowsExchange",
      opciones: [["PRINCIPAL", "Principal", "blue"], ["REEMPLAZO", "Reemplazo", "orange"]],
    },
    { name: "idVinculado", label: "ID vinculado (principal ↔ reemplazo)", type: "TEXT", icon: "IconLink" },
    { name: "ordenGestion", label: "Orden de gestión", type: "NUMBER", icon: "IconSortAscendingNumbers" },
    {
      name: "estadoGestion", label: "Estado de gestión", type: "SELECT", icon: "IconProgressCheck",
      defaultValue: "'PENDIENTE'",
      opciones: [
        ["PENDIENTE", "Pendiente", "gray"],
        ["COMPLETA", "Completa", "green"],
        ["PARCIAL", "Parcial", "yellow"],
        ["CITA", "Cita", "blue"],
        ["NO_CONTACTO", "No contacto", "orange"],
        // Timbra y nadie atiende (No contacto = apagado, fuera de servicio, buzón).
        ["NO_CONTESTA", "No contesta", "yellow"],
        ["RECHAZO", "Rechazo", "red"],
        // Dice explícitamente que no le interesa: no se vuelve a llamar.
        ["NO_INTERESADO", "No interesado", "red"],
        ["NUMERO_INCORRECTO", "Número incorrecto", "pink"],
        ["INFORMANTE_NO_AUTORIZADO", "Informante no autorizado", "purple"],
        ["FUERA_UNIVERSO", "Fuera del universo", "sky"],
        // Reemplazos del sorteo: cargados pero ocultos a los encuestadores hasta
        // que se activen (pasan a PENDIENTE).
        ["RESERVA", "Reserva (reemplazo)", "turquoise"],
        // 3 llamadas sin contestar: sale de la lista (y se activa su reemplazo).
        ["AGOTADO", "Agotado (3 sin contestar)", "gray"],
        // Socio menor de 18 años: no se encuesta (se activa su reemplazo).
        ["MENOR_EDAD", "Menor de 18 (no encuestar)", "red"],
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
  // Reemplazos del sorteo (lib/reemplazos.js): a la 3.ª llamada cerrada como «No
  // contesta» el socio queda AGOTADO y, si es principal, su reemplazo vinculado
  // pasa de RESERVA a PENDIENTE.
  reemplazos: {
    intentosSinContacto: 3,
    estadoAgotado: "AGOTADO",
    // Otros estados del principal que también activan su reemplazo.
    estadosQueActivan: ["MENOR_EDAD"],
    estadoReserva: "RESERVA",
    estadoActivo: "PENDIENTE",
  },
  // Todas las preguntas son obligatorias: no se pasa a la siguiente sin responder la
  // actual (NS/NR cuentan como respuesta).
  avanceObligatorio: true,
  // Las cuotas por oficina se definen cuando llegue el diseño muestral.
  metaPorGrupo: false,

  // 0002 carga el cuestionario de EDIMCA: aquí el cuestionario es otro.
  migracionesOmitidas: ["0002_seed_cuestionario_edimca.sql"],
};
