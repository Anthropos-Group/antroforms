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

  etiquetas: { grupo: "Oficina", grupoPlural: "Oficinas", idExterno: "Código de muestra" },

  gestionMensual: false,
  // Las cuotas por oficina se definen cuando llegue el diseño muestral.
  metaPorGrupo: false,

  // 0002 carga el cuestionario de EDIMCA: aquí el cuestionario es otro.
  migracionesOmitidas: ["0002_seed_cuestionario_edimca.sql"],
};
