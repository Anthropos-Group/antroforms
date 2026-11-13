// EDIMCA — encuesta de satisfacción mensual por punto de venta (PDV).
// Este archivo describe lo que antes estaba escrito directamente en el código:
// cambiar algo aquí cambia solo el comportamiento de EDIMCA.

module.exports = {
  id: "edimca",
  nombre: "EDIMCA",
  // Letra del logo cuadrado y subtítulo de las pantallas de acceso.
  marca: { inicial: "E", subtitulo: "EDIMCA · Antroproyectos" },

  twenty: {
    // Campo de Twenty → columna de clientes_cache.
    campos: {
      codigo_cliente: "codigoCliente",
      grupo: "nombrePuntoVenta",
      mes_gestion: "mesGestion",
      id_externo: "idEdimca",
      status: "status",
      telefono: "telefono1",
      total: "total",
      fecha_atencion: "djulfechaRpdivj",
      etiqueta: "etiqueta",
    },
    // Campos del cliente que el cuestionario puede consultar (clave → campo de Twenty).
    datos: {},
    // Valor que se escribe en el campo de estado al cerrar la encuesta.
    estados: { completada: "EFECTIVA", rechazo: "NO_LLAMAR" },
    // EDIMCA gestiona las llamadas sin terminar directamente en Twenty.
    estadosCierre: null,
    // Estados con los que el cliente ya no aparece en el buscador.
    estadosExcluidos: ["NO_LLAMAR", "YA_LE_REALIZARON_LA_ENCUESTA"],
    // Campos que la limpieza nocturna normaliza en Twenty.
    limpieza: {
      texto: ["nombrePuntoVenta", "etiqueta", "mcuServicios"],
      telefono: ["telefono1", "telefono2", "telefono3", "telefono4", "telefono5", "telefono6"],
      numerico: ["total"],
    },
  },

  // El Twenty de EDIMCA ya tiene sus campos: no se administran desde aquí.
  esquemaTwenty: [],

  etiquetas: { grupo: "PDV", grupoPlural: "PDV", idExterno: "ID EDIMCA" },

  // Un solo mes de gestión activo a la vez (ver lib/gestion.js).
  gestionMensual: true,
  // Meta de encuestas efectivas por PDV y mes (el valor se edita en el panel).
  metaPorGrupo: true,

  // Migraciones con datos propios de otro cliente que no se aplican aquí.
  migracionesOmitidas: [],
};
