// Cuestionario de plantas de manufactura (encuesta a empresas, modalidad híbrida:
// llamada, WhatsApp o correo; siempre la registra el encuestador).
// Fuente: 6_Leadership.docx, 5_Plant_Culture.docx, 4_Innovation.docx y
// 2_Supply_Chain.docx — una sola encuesta en el orden 6 → 5 → 4 → 2.
//
// Se carga con: TENANT=<slug> node scripts/cargar-cuestionario.js
//
// Decisiones (ver clientes/<slug>/FICHA.md):
// - Cada afirmación es una pregunta propia (una columna en la exportación); las de un
//   mismo enunciado (LM01, FC01…) comparten `config.grupo` y se muestran juntas en
//   una tabla con la escala 1–7.
// - Las preguntas cerradas admiten «No sabe» y «Prefiere no responder» (NS/NR) y son
//   obligatorias; las abiertas se pueden dejar en blanco (PMO).
// - Las dos últimas afirmaciones de LM01 venían sin escala en el Word: van con 1–7.
// - Participación de departamentos (FC10, IN19, SC15): 1–5 de menor a mayor aporte;
//   0 = sin información de ese departamento (el «en blanco» del papel).
// - Una sola persona de la empresa responde toda la encuesta (PMO): se registra su
//   nombre y cargo al inicio.

const NS_NR = ["NS", "NR"];
const op = (valor, etiqueta, extra = {}) => ({ valor, etiqueta, ...extra });
const dos = (n) => String(n).padStart(2, "0");

const NIVEL = { min: "No en absoluto", medio: "Nivel moderado", max: "Nivel alto" };
const FRECUENCIA = { min: "Nunca", medio: "Alrededor de la mitad del tiempo", max: "Siempre" };
const COMPARACION = { min: "Mucho peor", medio: "Similar", max: "Mucho mejor" };
const ACUERDO = { min: "Muy en desacuerdo", medio: "Ni de acuerdo ni en desacuerdo", max: "Muy de acuerdo" };

// Tabla de afirmaciones con escala 1–7: una pregunta por afirmación (CODIGO_01…).
function tabla(codigo, bloque, enunciado, etiquetas, afirmaciones) {
  return afirmaciones.map((texto, i) => ({
    codigo: `${codigo}_${dos(i + 1)}`,
    bloque,
    tipo: "escala",
    texto,
    config: { min: 1, max: 7, etiquetas, especiales: NS_NR, grupo: codigo, grupo_texto: `${codigo}. ${enunciado}` },
  }));
}

function escalaSola(codigo, bloque, texto, etiquetas) {
  return { codigo, bloque, tipo: "escala", texto: `${codigo}. ${texto}`, config: { min: 1, max: 7, etiquetas, especiales: NS_NR } };
}

// Abiertas: se pueden dejar en blanco (no llevan NS/NR).
const ABIERTA = { opcional: true };
function abierta(codigo, bloque, texto) {
  return { codigo, bloque, tipo: "texto_abierto", texto: `${codigo}. ${texto}`, config: ABIERTA };
}

function indicacion(codigo, bloque, texto, ayuda) {
  return { codigo, bloque, tipo: "informativa", texto, ayuda };
}

// Participación de cada departamento al responder el módulo: 0 = sin información
// (en blanco en el papel), 1–5 de menor a mayor aporte. «Otros» pide especificar.
function participacion(codigo, bloque, departamentos) {
  const enunciado =
    "Califique la participación de cada departamento al responder a este módulo: 0 indica que no hay información de ese departamento (en blanco); 1 a 5 indica de menor a mayor aporte de información (del informante primario).";
  const filas = [...departamentos, "Otros"].map((texto, i) => ({
    codigo: `${codigo}_${dos(i + 1)}`,
    bloque,
    tipo: "escala",
    texto,
    config: {
      min: 0,
      max: 5,
      etiquetas: { min: "Sin información (en blanco)", max: "Mayor aporte" },
      especiales: NS_NR,
      grupo: codigo,
      grupo_texto: `${codigo}. ${enunciado}`,
    },
  }));
  const otros = filas[filas.length - 1].codigo;
  return [
    ...filas,
    {
      codigo: `${codigo}_OTRO`,
      bloque,
      tipo: "texto_abierto",
      texto: `${codigo}. «Otros»: especifique qué otro departamento participó`,
      config: ABIERTA,
      mostrar_si: { pregunta: otros, op: ">", valor: 0 },
    },
  ];
}

const DEPARTAMENTOS = [
  "Contabilidad y Finanzas",
  "Compras/Cadena de Suministro",
  "Gerente de Manufacturas",
  "Diseño de Ingeniería",
  "Ingeniero de Manufactura",
  "Mercadeo/Ventas",
  "Directivos de planta",
  "Sindicato de planta",
];

const ENTIDADES_INTERNAS = [
  "Operadores de planta.",
  "Personal de mantenimiento (es decir, técnicos).",
  "Personal de I+D (es decir, ingenieros de productos y procesos).",
  "Personal de ventas/mercadeo.",
  "Gerentes de compras y suministros.",
  "Dirección de la planta.",
];

const ENTIDADES_EXTERNAS = [
  "Proveedores.",
  "Clientes.",
  "Organizaciones de investigación (universidades, centros de investigación, etc.).",
  "Gobierno y otras instituciones públicas.",
  "Miembros de convenciones, ferias comerciales.",
  "Consultores.",
];

// --- Sección VI: Liderazgo ----------------------------------------------------
const B6 = "VI Liderazgo";
const seccion6 = [
  indicacion("S6", B6, "Sección VI: Liderazgo", "Lea: «El equipo directivo de la planta es el pequeño grupo de altos ejecutivos de la misma.»"),
  ...tabla("LM01", B6, "Indique en qué medida los siguientes comportamientos se observan comúnmente entre todos los miembros del equipo directivo de la planta:", NIVEL, [
    "Asignar tareas y explicar las responsabilidades del trabajo.",
    "Explicar los objetivos de la tarea y las expectativas de desempeño.",
    "Comprobar el progreso y la calidad del trabajo.",
    "Evaluar el rendimiento individual y de la unidad.",
    "Determinar cómo utilizar el personal y los recursos para realizar las tareas con eficiencia.",
    "Determinar cómo programar y coordinar eficientemente las actividades de la unidad.",
    "Consultar a las personas antes de tomar decisiones que les afecten.",
    "Usar las ideas y sugerencias de otros.",
    "Mostrar empatía y apoyo cuando alguien esté molesto o ansioso.",
    "Dar ánimos y apoyo cuando haya una tarea difícil y estresante.",
    "Elogiar el rendimiento efectivo y los logros significativos.",
    "Reconocer las contribuciones especiales y la mejora del rendimiento.",
    "Proporcionar asesoramiento y orientación.",
    "Ayudar a las personas para que aprendan a mejorar sus habilidades.",
    "Conceder una gran responsabilidad y discreción en las actividades laborales.",
    "Confiar en la gente para que resuelva problemas y tome decisiones sin aprobación previa.",
    "Describir los resultados atractivos que la unidad puede conseguir.",
    "Describir un cambio propuesto con gran entusiasmo y convicción.",
    "Dar ejemplo de comportamiento ejemplar a los subordinados.",
    "Dar ejemplo de comportamientos que reflejen los valores y las normas del líder.",
    "Animar a la gente a cuestionar sus suposiciones sobre el trabajo.",
    "Pedir a las personas que se atrevan a buscar mejores formas de hacer su trabajo.",
    "Hacer seguimiento de eventos y tendencias externas a la planta que influirán en las operaciones.",
    "Analizar los cambios en el entorno externo en busca de amenazas y oportunidades.",
    // Venían sin escala en el Word (formato dañado): se preguntan con la misma 1–7.
    "Organizar sus oficinas de manera similar a las de los demás.",
    "Utilizar métodos electrónicos de comunicación con los empleados.",
  ]),
];

// --- Sección V: Cultura de planta -----------------------------------------------
const B5 = "V Cultura de planta";
const seccion5 = [
  indicacion(
    "S5", B5, "Sección V: Cultura de planta",
    "Lea: «La cultura de planta es un sistema de normas compartidas que definen las actitudes y comportamientos adecuados para guiar al personal de la planta. Responda a las siguientes preguntas en relación con la mayoría del personal de la planta (operadores, gerentes, ingenieros, etc.).»"
  ),
  ...tabla("FC01", B5, "Las siguientes afirmaciones se enfocan en el uso compartido de la racionalidad frente a la intuición en la planta.", NIVEL, [
    "Los cálculos financieros/numéricos justifican la mayoría de actividades e inversiones.",
    "Se utilizan sobre todo medidas cuantitativas para emitir dictámenes.",
    "Rara vez utilizamos medidas financieras para justificar las actividades.",
    "Las decisiones se basan principalmente en la intuición y en factores cualitativos.",
    "Se usan criterios subjetivos sobre todo para comprender plenamente las situaciones.",
    "Inicialmente, evitamos las decisiones subjetivas siempre que sea posible.",
  ]),
  ...tabla("FC02", B5, "Las siguientes afirmaciones se enfocan en el comportamiento compartido de tener una perspectiva de largo plazo frente a corto plazo en la planta.", NIVEL, [
    "Las decisiones sobre la planta suelen tener una visión a largo plazo.",
    "Existe una gran preocupación por los efectos futuros de todas las actividades.",
    "La perspectiva a largo plazo rara vez está presente en las decisiones de la planta.",
    "Las decisiones operativas siempre se ajustan rápidamente a las necesidades actuales.",
    "Dedicamos la mayor parte de nuestro tiempo a resolver problemas inmediatos y a corto plazo.",
    "No solemos actuar con rapidez para cumplir los objetivos diarios.",
  ]),
  ...tabla("FC03", B5, "Las siguientes afirmaciones se enfocan en el uso compartido de la motivación intrínseca frente a la extrínseca.", NIVEL, [
    "La mayoría del personal se motiva mejor con un trabajo significativo.",
    "Los operadores suelen estar intrínsecamente dispuestos a ayudar a mejorar las operaciones.",
    "Nuestra mano de obra rara vez está motivada por un trabajo significativo.",
    "El personal está motivado principalmente por recompensas y castigos monetarios.",
    "Las metas y los objetivos suelen utilizarse para motivar al personal.",
    "Nuestro personal no suele estar motivado por recompensas extrínsecas.",
  ]),
  ...tabla("FC04", B5, "Las siguientes afirmaciones se enfocan en el comportamiento compartido de estabilidad frente al cambio.", NIVEL, [
    "Los cambios en los procesos suelen introducirse lentamente y con precaución.",
    "Normalmente mantenemos un personal estable y nivelado con pocos cambios.",
    "La mayoría de veces introducimos cambios en los procesos de forma abrupta y sin precaución.",
    "La mayoría de los procedimientos se adapta y cambia continuamente.",
    "Demasiada estabilidad se considera mala y no progresiva.",
    "Los procesos de la planta rara vez se modifican.",
  ]),
  ...tabla("FC05", B5, "Las siguientes afirmaciones se enfocan en el énfasis compartido de la producción frente a actividades sociales.", NIVEL, [
    "La principal prioridad de nuestro personal es la finalización de las tareas y la productividad.",
    "Normalmente dedicamos todos los recursos y el tiempo a las necesidades de producción.",
    "La productividad en el trabajo no suele ser una prioridad.",
    "Se fomentan las amistades y las relaciones informales en la planta.",
    "Las actividades sociales se realizan en horario de trabajo para mostrar su importancia.",
    "Las actividades sociales no suelen valorarse en nuestra planta.",
  ]),
  ...tabla("FC06", B5, "Las siguientes afirmaciones se enfocan en el comportamiento compartido de trabajo colaborativo frente al individual.", NIVEL, [
    "La mayoría de decisiones se toman de forma colaborativa y colectiva.",
    "La colaboración interdepartamental en nuestra planta es común.",
    "Las decisiones de la planta rara vez se toman de forma cooperativa.",
    "El trabajo se lleva a cabo principalmente por personas que actúan solas.",
    "La mayoría de las personas son capaces de hacer las cosas por sí mismas.",
    "La mayor parte del trabajo se realiza en equipo y no individualmente.",
  ]),
  ...tabla("FC07", B5, "Las siguientes afirmaciones se enfocan en el comportamiento compartido de hacer que el trabajo sea controlado centralmente frente a descentralizadamente.", NIVEL, [
    "La mayoría de los planes son elaborados centralmente por los gerentes sin la participación de toda la planta.",
    "Las decisiones operativas son controladas principalmente por ingenieros y gerentes.",
    "Los planes de mejora rara vez son elaborados de forma centralizada por unos pocos directivos.",
    "Las decisiones suelen tomarse de forma autónoma por áreas de trabajo.",
    "El tiempo y los recursos se asignan mayoritariamente en función de decisiones descentralizadas.",
    "Cada área de trabajo rara vez toma decisiones de forma autónoma.",
  ]),
  ...tabla("FC08", B5, "Las siguientes afirmaciones se enfocan en el uso compartido de recursos internos frente a externos para ayudar a la planta.", NIVEL, [
    "Las mejores ideas suelen venir del interior de nuestra planta, de nuestro personal.",
    "Solemos desarrollar experiencia interna para nuevas habilidades y tecnologías.",
    "El desarrollo de las capacidades internas en torno a las nuevas habilidades rara vez es una prioridad.",
    "La mayoría de las innovaciones proviene de la observación a los competidores y/o del uso de proveedores.",
    "Continuamente observamos a otros fuera de nuestra planta en busca de ideas.",
    "Muy pocas innovaciones se originan por parte de otros que no forman parte de nuestra planta.",
  ]),
  ...tabla("FC09", B5, "Las siguientes afirmaciones se enfocan en el método de compensación a los empleados en la planta.", NIVEL, [
    "Solemos pagar a los empleados con cheques físicos en lugar de métodos de pago electrónicos.",
    "La mayoría de los empleados reciben su remuneración puntualmente según un calendario regular.",
  ]),
  ...participacion("FC10", B5, DEPARTAMENTOS),
];

// --- Sección IV: Innovación -----------------------------------------------------
const B4 = "IV Innovación";
const seccion4 = [
  indicacion(
    "S4", B4, "Sección IV: Innovación",
    "Lea: «En esta sección se pregunta por el conjunto de innovaciones de proceso que se han producido en su planta en los últimos 2 años. Las innovaciones de proceso son nuevos métodos de manufactura en su planta.»"
  ),
  ...tabla("IN01", B4, "En los últimos 2 años, indique con qué frecuencia se aplicaron las siguientes afirmaciones al conjunto de innovaciones de proceso en su planta:", FRECUENCIA, [
    "Nueva en nuestra planta, pero utilizada por otros (otras plantas o empresas).",
    "Aprovechamiento de la tecnología existente.",
    "Se compró a proveedores o contratistas.",
    "Se caracteriza mejor por ser incremental.",
    "Nueva en nuestra planta y nueva en nuestra industria.",
    "Los operadores o usuarios tuvieron que aprender habilidades y procedimientos sustancialmente nuevos.",
    "Nos involucramos en la creación y el desarrollo.",
    "Se caracteriza mejor por ser radical.",
  ]),
  ...tabla("IN02", B4, "En los últimos 2 años, indique con qué frecuencia se realizaron innovaciones de proceso en su planta por los siguientes motivos:", FRECUENCIA, [
    "Reducir costos (por ejemplo, reducción o control de costos de material, de mano de obra, de costos fijos, u de otros).",
    "Mejorar la calidad (es decir, conformidad con especificaciones, idoneidad de uso).",
    "Aumentar la puntualidad de las entregas (es decir, cumplir las promesas de entrega).",
    "Incrementar la flexibilidad (es decir, variedad o volumen del producto).",
    "Reducir el impacto ambiental (es decir, reducir la huella de carbono, uso de recursos).",
    "Mejorar la salud y seguridad.",
    "Cumplir con las regulaciones gubernamentales.",
    "Otros motivos.",
  ]),
  {
    codigo: "IN02_OTRO", bloque: B4, tipo: "texto_abierto",
    texto: "IN02. «Otros motivos»: por favor, indique cuáles",
    config: ABIERTA,
    mostrar_si: { pregunta: "IN02_08", op: ">", valor: 1 },
  },
  ...tabla("IN03", B4, "Indique el desempeño de su planta en comparación con una planta de referencia:", COMPARACION, [
    "Cantidad de nuevas innovaciones de proceso.",
    "Eficiencia en nuestra innovación de procesos.",
    "Generación y desarrollo rápido de innovaciones en los procesos.",
    "Aplicación rápida de innovaciones en los procesos.",
  ]),
  ...tabla("IN04", B4, "En los últimos 2 años, indique en qué medida se aplicaron estas actividades centradas en el ámbito interno al conjunto de innovaciones de procesos de su planta:", FRECUENCIA, [
    "Selección inicial de ideas por su relevancia para la estrategia de la planta.",
    "Incentivos para estimular las innovaciones en los procesos.",
    "Rotación regular de los empleados entre las funciones.",
    "Presupuesto para el proceso de innovación.",
    "Mecanismos para compartir información entre funciones.",
    "Plataformas electrónicas internas.",
    "Laboratorios de innovación para coordinar las actividades de innovación.",
  ]),
  ...tabla("IN05", B4, "En los últimos 2 años, indique en qué medida se aplicaron estas actividades centradas en el exterior al conjunto de innovaciones de procesos de su planta:", FRECUENCIA, [
    "Elaborar una visión común de la innovación.",
    "Participación en consorcios.",
    "Reuniones periódicas de intercambio de conocimientos.",
    "Uso de plataformas en línea.",
    "Acuerdos legales formales.",
    "Promoción de normas tecnológicas.",
    "Prácticas y acuerdos de exclusividad.",
  ]),
  ...tabla("IN06", B4, "En los últimos 2 años, indique en qué medida se aplicaron estas actividades al mantenimiento en su planta:", FRECUENCIA, [
    "Medición del tiempo medio entre fallos.",
    "Uso de técnicas de mantenimiento preventivo total (TPM).",
    "Análisis periódicos de mantenimiento predictivo.",
  ]),
  ...tabla("IN07", B4, "En los últimos 2 años, indique con qué frecuencia participaron estas entidades internas en la generación y el desarrollo de la idea de las innovaciones de los procesos (es decir, en el diseño y la especificación):", FRECUENCIA, ENTIDADES_INTERNAS),
  ...tabla("IN08", B4, "En los últimos 2 años, indique con qué frecuencia participaron estas entidades externas en la generación y el desarrollo de la idea de las innovaciones de los procesos (es decir, en el diseño y la especificación):", FRECUENCIA, ENTIDADES_EXTERNAS),
  escalaSola("IN09", B4, "¿La colaboración entre entidades internas y externas fue importante para generar y desarrollar las innovaciones de los procesos?", FRECUENCIA),
  ...tabla("IN10", B4, "En los últimos dos años, indique con qué frecuencia han participado las siguientes entidades internas en la implementación de las innovaciones de los procesos (es decir, hasta lograr el total de la producción o en las pruebas):", FRECUENCIA, ENTIDADES_INTERNAS),
  ...tabla("IN11", B4, "En los últimos dos años, indique con qué frecuencia han participado las siguientes entidades externas en la implementación de las innovaciones de los procesos (es decir, hasta lograr el total de la producción o en las pruebas):", FRECUENCIA, ENTIDADES_EXTERNAS),
  escalaSola("IN12", B4, "¿La colaboración entre entidades INTERNAS y EXTERNAS fue importante para implementar las innovaciones de los procesos?", FRECUENCIA),
  {
    codigo: "IN13", bloque: B4, tipo: "opcion_unica",
    texto: "IN13. Indique cuál de las siguientes entidades describe mejor su función en la planta:",
    config: {
      opciones: [
        op("CONTABILIDAD", "Contabilidad y Finanzas"),
        op("COMPRAS", "Compras/Cadena de Suministro"),
        op("MANUFACTURA", "Gerencia de Manufactura"),
        op("INGENIERIA", "Diseño de Ingeniería"),
        op("DIRECCION", "Dirección de planta"),
        op("MERCADEO", "Mercadeo/Ventas"),
        op("OTRO", "Otros (especifique)", { con_texto: true }),
      ],
      especiales: NS_NR,
    },
  },
  ...tabla("IN14", B4, "En los últimos 2 años, indique con qué frecuencia ha acudido a personas de esta función interna para obtener información o conocimientos sobre temas de trabajo:", FRECUENCIA, [
    "Operadores de planta.",
    "Personal de mantenimiento (es decir, técnicos).",
    "Personal de I+D (es decir, ingenieros de productos y procesos).",
    "Personal de ventas/mercadeo.",
    "Gerente de compras y suministros.",
    "Dirección de la planta.",
  ]),
  ...tabla("IN15", B4, "En los últimos 2 años, indique con qué frecuencia ha acudido a personas de esta entidad externa para obtener información o conocimientos sobre temas de trabajo:", FRECUENCIA, ENTIDADES_EXTERNAS),
  abierta("IN16", B4, "Describa el enfoque en las innovaciones de los procesos adoptado en su planta, tanto en términos absolutos como en comparación con sus principales competidores."),
  abierta("IN17", B4, "Describa la motivación y los resultados de algunas innovaciones de los procesos recientes en su planta."),
  abierta("IN18", B4, "En su planta, describa si los distintos tipos de personas participan en la innovación de procesos, desde la ideación hasta la prueba y la aplicación, y cómo lo hacen."),
  ...participacion("IN19", B4, DEPARTAMENTOS),
];

// --- Sección II: Gestión de la cadena de suministro ------------------------------
const B2 = "II Cadena de suministro";
const DIGITAL = "¿En qué medida se utilizan las tecnologías digitales en el proceso";
const seccion2 = [
  indicacion(
    "S2", B2, "Sección II: Gestión de la cadena de suministro",
    "Lea: «Estas preguntas están relacionadas con el uso de nuevas tecnologías digitales en los procesos de gestión de la cadena de suministro. En este contexto, se consideran como tecnologías digitales novedosas las tecnologías informáticas que son nuevas en la planta (en los últimos tres años) para el almacenamiento, el procesamiento y el intercambio de información en forma digital.»"
  ),
  ...tabla("SC01", B2, `${DIGITAL} de PLAN (es decir, en la planificación de la demanda/oferta para cumplir los objetivos empresariales) con el fin de:`, NIVEL, [
    "Colaborar entre ventas, mercadeo, fabricación, logística y otras funciones en la planificación de nuestra estrategia de operaciones.",
    "Desarrollar nuestro proceso de planificación de la demanda.",
    "Colaborar con clientes y proveedores en la planificación de la cadena de suministro.",
    "Analizar la variabilidad de la demanda de productos.",
    "Definir las prioridades del cliente.",
  ]),
  ...tabla("SC02", B2, `${DIGITAL} SOURCE (es decir, abastecimiento de bienes y servicios para satisfacer la demanda prevista o real), para:`, NIVEL, [
    "Desarrollar nuestro abastecimiento en el proceso de planificación.",
    "Colaborar con los proveedores para desarrollar un plan de abastecimiento.",
    "Promover las relaciones a largo plazo con los proveedores estratégicos.",
    "Promover la reducción del número de proveedores en nuestra base de suministro.",
    "Desarrollar proveedores estratégicos para todos los productos/servicios.",
  ]),
  ...tabla("SC03", B2, `${DIGITAL} MAKE (es decir, transformar los bienes para satisfacer la demanda prevista o real) para:`, NIVEL, [
    "Colaborar con las ventas, mercadeo, manufactura, logística y otras funciones en nuestro proceso de producción de operaciones.",
    "Integrar la programación del taller con nuestro proceso general de programación.",
    "Dar seguimiento de los cambios en nuestra planificación a través de un proceso formal de aprobación de documentos.",
    "Operar procesos de fabricación «justo a tiempo».",
    "Llevar a cabo programas de mantenimiento preventivo total.",
  ]),
  ...tabla("SC04", B2, `${DIGITAL} de DELIVER (es decir, proveer bienes y servicios acabados para satisfacer la demanda prevista o real) para:`, NIVEL, [
    "Promover el seguimiento de las entregas.",
    "Controlar el desempeño de las entregas.",
    "Controlar la exactitud del inventario.",
    "Promover el seguimiento de la satisfacción del cliente.",
    "Dar seguimiento del estado de la entrega del pedido.",
  ]),
  ...tabla("SC05", B2, `${DIGITAL} de RETURN (es decir, el seguimiento de los artículos devueltos o defectuosos desde su origen) para:`, NIVEL, [
    "Rastrear desde la fuente los productos defectuosos devueltos.",
    "Seguir los productos excedentes devueltos hasta la fuente.",
    "Recopilar información sobre los requisitos reglamentarios y su cumplimiento.",
  ]),
  ...tabla("SC06", B2, "Por favor, indique su nivel de acuerdo con las siguientes afirmaciones. Coordinación interna.", ACUERDO, [
    "Integramos las mejoras de los procesos entre las áreas de compras, producción, ventas e I+D.",
    "Integramos las actividades de desarrollo de nuevos productos entre las áreas de compras, producción, ventas e I+D.",
    "Creamos una integración y conexión en tiempo real en todas las funciones internas, desde la gestión de las materias primas hasta la producción, el envío y las ventas.",
    "Creamos una comunicación abierta en todas las funciones internas, desde la gestión de la materia prima hasta la producción, el envío y las ventas.",
  ]),
  ...tabla("SC07", B2, "Por favor, indique su nivel de acuerdo con las siguientes afirmaciones. Planificación de la cadena de suministro.", ACUERDO, [
    "Invertimos una cantidad considerable de tiempo y esfuerzo en la planificación de nuestras actividades de la cadena de suministro.",
    "Utilizamos los pronósticos de nuestros clientes para revisar y actualizar la calidad de nuestras actividades de planificación de la cadena de suministro.",
    "Nos esforzamos por gestionar cada una de nuestras cadenas de suministro como entidades independientes.",
    "Usamos el desempeño (es decir, la calidad, el costo, la capacidad de respuesta, la agilidad, etc.) de los miembros de nuestras cadenas de suministro para ajustar nuestros planes de la cadena de suministro.",
    "Evaluamos constantemente los parámetros de desempeño de nuestra cadena de suministro.",
  ]),
  ...tabla("SC08", B2, "Por favor, indique su nivel de acuerdo con las siguientes afirmaciones. Involucramiento de los proveedores.", ACUERDO, [
    "Compartimos con nuestros proveedores las preocupaciones relacionadas con ellos (por ejemplo, calidad, costo, entrega, etc.).",
    "En el trato con nuestros proveedores, estamos dispuestos a cambiar los supuestos para encontrar soluciones más eficaces.",
    "Creemos que compartir información e ideas con nuestros proveedores es beneficioso.",
    "Conocemos a los proveedores de nuestros proveedores.",
    "Creemos que la cooperación con los proveedores de nuestros proveedores es beneficiosa (es decir, los proveedores de segundo nivel).",
    "Promovemos líneas de comunicación justas, abiertas y libres en la colaboración con nuestros proveedores.",
  ]),
  ...tabla("SC09", B2, "Por favor, indique su nivel de acuerdo con las siguientes afirmaciones. Involucramiento de los clientes.", ACUERDO, [
    "Con frecuencia compartimos con nuestros clientes las preocupaciones relacionadas con ellos (por ejemplo, la entrega, costo, calidad, flexibilidad, etc.).",
    "Nuestros clientes nos dan su opinión sobre nuestro desempeño y calidad de las entregas.",
    "Nuestros clientes participan activamente en el proceso de diseño de nuestros productos.",
    "Mantenemos un alto nivel de capacidad de respuesta a la hora de atender las necesidades de nuestros clientes.",
    "Sondeamos periódicamente las necesidades de nuestros clientes.",
    "Conocemos a los clientes de nuestros clientes.",
    "Creemos que la cooperación con los clientes de nuestros clientes es beneficiosa.",
  ]),
  ...tabla("SC10", B2, "Por favor, indique su nivel de acuerdo con las siguientes afirmaciones. Solidez de la cadena de suministro.", ACUERDO, [
    "Nuestra cadena de suministro sigue siendo efectiva y sostenible incluso cuando se producen interrupciones internas o externas.",
    "Evitamos o minimizamos la aparición de riesgos anticipándonos y preparándonos para ellos.",
    "Absorbemos un nivel significativo de impactos negativos de los riesgos recurrentes.",
    "Tenemos tiempo suficiente para considerar las reacciones más efectivas.",
  ]),
  ...tabla("SC11", B2, "Por favor, indique su nivel de acuerdo con las siguientes afirmaciones. Resiliencia de la cadena de suministro.", ACUERDO, [
    "Somos capaces de hacer frente a los cambios provocados por la interrupción de la cadena de suministro.",
    "Somos capaces de adaptarnos fácilmente a la interrupción de la cadena de suministro.",
    "Somos capaces de dar una respuesta rápida a la interrupción de la cadena de suministro.",
    "Somos capaces de mantener el conocimiento de la situación en todo momento.",
  ]),
  ...tabla("SC12", B2, "Por favor, indique su nivel de acuerdo con las siguientes afirmaciones. Nivelación de la producción de la cadena de suministro.", ACUERDO, [
    "Tenemos mayor producción en los meses de invierno que en los de verano.",
    "Nuestros niveles de producción son similares en todas las estaciones del año.",
  ]),
  {
    codigo: "SC13", bloque: B2, tipo: "opcion_unica",
    texto: "SC13. Por favor, indique qué departamento describe mejor su pertenencia.",
    config: {
      opciones: [
        op("SUMINISTROS", "Gestión de suministros"),
        op("COMPRAS", "Compras"),
        op("LOGISTICA", "Logística"),
        op("MANUFACTURA", "Manufactura"),
        op("CADENA", "Gestión de cadena de suministros"),
        op("CLIENTES", "Relaciones con los clientes"),
        op("MERCADEO", "Mercadeo / Ventas"),
        op("TI", "Tecnología de la Información"),
        op("OTRO", "Otro (especifique)", { con_texto: true }),
      ],
      especiales: NS_NR,
    },
  },
  {
    codigo: "SC14", bloque: B2, tipo: "numero",
    texto: "SC14. Para la línea de productos más importante de su planta, indique un porcentaje del valor anual de las compras a proveedores extranjeros:",
    config: { min: 0, max: 100, unidad: "%", especiales: NS_NR },
  },
  ...participacion("SC15", B2, [
    "Contabilidad y Finanzas",
    "Compras/Cadena de Suministro",
    "Gerente de Manufactura",
    "Diseño de Ingeniería",
    "Ingeniero de Manufactura",
    "Mercadeo/Ventas",
    "Máximos responsables de planta",
    "Sindicato de planta",
  ]),
  abierta("SC16", B2, "Describa su enfoque de digitalización en la planificación."),
  abierta("SC17", B2, "Describa su enfoque de digitalización en el abastecimiento."),
  abierta("SC18", B2, "Describa su enfoque de digitalización en la producción."),
  abierta("SC19", B2, "Describa su enfoque de digitalización en las entregas."),
  abierta("SC20", B2, "Describa su enfoque de digitalización en el proceso de devolución."),
  abierta("SC21", B2, "Describa sus principales fortalezas en las actividades de la cadena de suministro."),
  abierta("SC22", B2, "Describa sus principales oportunidades de mejora en las actividades de la cadena de suministro."),
];

const cuestionario = {
  nombre: "Encuesta a plantas de manufactura — Liderazgo, cultura, innovación y cadena de suministro",
  guion_apertura:
    "Buenos días/tardes, ¿hablo con {{NOMBRE}}? Soy {{ENCUESTADOR}} y le contacto en nombre de Strattos para un estudio sobre las prácticas de gestión de plantas de manufactura. La encuesta tiene cuatro secciones (liderazgo, cultura de planta, innovación y cadena de suministro) y la responde una sola persona de la planta; si lo necesita, podemos continuarla en otro momento. Es voluntaria: puede no responder cualquier pregunta. Sus respuestas son confidenciales y se reportan solo de forma agrupada.",
  guion_cierre: "¡Muchas gracias por su tiempo y su colaboración!",

  preguntas: [
    // --- Contacto ----------------------------------------------------------------
    {
      codigo: "CANAL", bloque: "Contacto", tipo: "opcion_unica",
      texto: "¿Por qué canal se está contactando a la empresa?",
      ayuda: "Lo registra el encuestador antes de empezar. Si en otra gestión se cambia de canal, actualícelo.",
      config: { opciones: [op("LLAMADA", "Llamada"), op("WHATSAPP", "WhatsApp"), op("CORREO", "Correo")] },
    },
    {
      codigo: "CI1", bloque: "Contacto", tipo: "opcion_unica",
      texto: "¿La empresa acepta participar en el estudio?",
      ayuda: "Si no acepta, la encuesta termina y queda como RECHAZO. Si pide responder en otro momento, cierre como «Cita agendada».",
      config: { opciones: [op("SI", "Sí, acepta"), op("NO", "No acepta → agradecer y terminar")], resultado: "rechazo" },
      termina_si: { pregunta: "CI1", op: "=", valor: "NO" },
    },
    {
      codigo: "INF", bloque: "Contacto", tipo: "texto_abierto",
      texto: "Nombre y cargo de la persona que responde la encuesta",
      ayuda: "Una sola persona de la empresa responde toda la encuesta.",
      config: ABIERTA,
    },
    indicacion(
      "IND_GENERAL", "Contacto", "Indicación general",
      "Escala 1 a 7 en todas las tablas (lea los extremos y el punto medio). «No sabe» (NS) y «Prefiere no responder» (NR) se registran aparte, nunca como un número. Las preguntas abiertas se pueden dejar en blanco. Puede cerrar la gestión en cualquier momento (parcial, cita agendada, correo o WhatsApp enviado…): al volver a abrir la empresa, la encuesta se retoma donde quedó."
    ),
    ...seccion6,
    ...seccion5,
    ...seccion4,
    ...seccion2,
  ],
};

module.exports = cuestionario;
