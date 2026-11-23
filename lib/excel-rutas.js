// Excel para análisis de cuestionarios con códigos (Cooperativa 23 de Julio): una
// fila por llamada, una columna por código y el diccionario de valores. Ver
// lib/exportacion-rutas.js para la codificación.
const ExcelJS = require("exceljs");
const { tenant } = require("./tenant");
const { construirFiltro } = require("./reportes");
const { formatFechaHoraEcuador } = require("./fecha");
const { columnasRespuestas, filasRespuestas, filasDiccionario } = require("./exportacion-rutas");

const ETIQUETA_RESULTADO = {
  completa: "Completa",
  rechazo: "Rechazo",
  parcial: "Parcial",
  cita: "Cita",
  no_contesta: "No contesta",
  no_contacto: "No contacto",
  no_interesado: "No interesado",
  numero_incorrecto: "Número incorrecto",
  informante_no_autorizado: "Informante no autorizado",
  fuera_universo: "Fuera del universo",
};

// Devuelve el buffer del Excel, o null si no hay cuestionario activo.
async function excelPorCodigos(pool, filtros) {
  const { rows: cu } = await pool.query(
    `select id, nombre from cuestionarios where activo = true order by created_at desc limit 1`
  );
  if (!cu[0]) return null;
  const { rows: preguntas } = await pool.query(
    `select id, orden, codigo, bloque, texto, tipo, requiere_justificacion, config, mostrar_si
     from preguntas where cuestionario_id = $1 and activa = true order by orden`,
    [cu[0].id]
  );

  // Todas las versiones del cuestionario: al cambiarlo con encuestas ya hechas se
  // crea una versión nueva y las encuestas anteriores siguen en la suya. Las columnas
  // son las de la versión activa; las respuestas de otras versiones se ubican por
  // código de pregunta (una pregunta que ya no existe no tiene columna).
  const { where, valores } = construirFiltro(filtros);
  const { rows: encuestas } = await pool.query(
    `select e.id, e.created_at, e.completada, e.resultado, e.ultimo_bloque, e.codigo_cliente,
            enc.nombre as encuestador, cc.pdv, cc.datos as datos_cliente, c.version,
            (select count(*) from encuestas e2
              where e2.cliente_twenty_id = e.cliente_twenty_id and e2.created_at <= e.created_at) as intento
     from encuestas e
     left join encuestadores enc on enc.id = e.encuestador_id
     left join clientes_cache cc on cc.id_twenty = e.cliente_twenty_id
     left join cuestionarios c on c.id = e.cuestionario_id
     ${where}
     order by e.created_at`,
    valores
  );
  const activaPorCodigo = new Map(preguntas.filter((p) => p.codigo).map((p) => [p.codigo, p.id]));
  const { rows: todas } = await pool.query(`select id, codigo from preguntas where codigo is not null`);
  const equivalente = new Map(todas.map((p) => [p.id, activaPorCodigo.get(p.codigo) || p.id]));

  const respuestas = {};
  if (encuestas.length) {
    const { rows } = await pool.query(
      `select encuesta_id, pregunta_id, valor from respuestas where encuesta_id = any($1::uuid[])`,
      [encuestas.map((e) => e.id)]
    );
    for (const r of rows) {
      if (!respuestas[r.encuesta_id]) respuestas[r.encuesta_id] = {};
      respuestas[r.encuesta_id][equivalente.get(r.pregunta_id) || r.pregunta_id] = r.valor;
    }
  }
  const datos = filasRespuestas(preguntas, encuestas.map((e) => ({ respuestas: respuestas[e.id] || {} })));

  const wb = new ExcelJS.Workbook();
  wb.creator = `Sistema de Encuestas ${tenant().nombre}`;
  wb.created = new Date();

  // Datos del listado que acompañan a cada encuesta (por cliente; sin configurar,
  // los de Cooperativa 23 de Julio).
  const exportacion = tenant().exportacion || {};
  const datosListado = exportacion.datos || [
    { header: "CIUDAD", dato: "ciudad_oficina" },
    { header: "TIPO_PERSONA_LISTADO", dato: "tipo_persona" },
  ];
  const hoja = wb.addWorksheet("Respuestas", { views: [{ state: "frozen", ySplit: 1, xSplit: 2 }] });
  hoja.columns = [
    { header: "ID_LLAMADA", key: "id", width: 38 },
    { header: exportacion.codigo || "CODIGO_SOCIO", key: "codigo", width: 14 },
    { header: "FECHA", key: "fecha", width: 20 },
    { header: "ENCUESTADOR", key: "encuestador", width: 20 },
    { header: tenant().etiquetas.grupo.toUpperCase(), key: "grupo", width: 16 },
    ...datosListado.map((d, i) => ({ header: d.header, key: `listado_${i}`, width: Math.max(12, d.header.length + 2) })),
    { header: "INTENTO", key: "intento", width: 9 },
    { header: "RESULTADO", key: "resultado", width: 16 },
    { header: "ULTIMO_BLOQUE", key: "ultimo_bloque", width: 20 },
    { header: "VERSION_CUESTIONARIO", key: "version", width: 12 },
    ...columnasRespuestas(preguntas).map((c) => ({ header: c.header, key: c.key, width: Math.max(8, c.header.length + 2) })),
  ];
  hoja.getRow(1).font = { bold: true };
  encuestas.forEach((e, i) => {
    hoja.addRow({
      id: e.id,
      codigo: e.codigo_cliente || "",
      fecha: formatFechaHoraEcuador(e.created_at),
      encuestador: e.encuestador || "",
      grupo: e.pdv || "",
      ...Object.fromEntries(datosListado.map((d, j) => [`listado_${j}`, e.datos_cliente?.[d.dato] ?? ""])),
      intento: Number(e.intento),
      resultado: e.resultado || (e.completada ? "completa" : "cortada"),
      ultimo_bloque: e.ultimo_bloque || "",
      version: e.version ?? "",
      ...datos[i],
    });
  });
  hoja.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: hoja.columns.length } };

  const dic = wb.addWorksheet("Diccionario", { views: [{ state: "frozen", ySplit: 1 }] });
  dic.columns = [
    { header: "Código", key: "codigo", width: 10 },
    { header: "Bloque", key: "bloque", width: 18 },
    { header: "Columna", key: "columna", width: 24 },
    { header: "Valor", key: "valor", width: 18 },
    { header: "Etiqueta", key: "etiqueta", width: 60 },
    { header: "Tipo", key: "tipo", width: 16 },
    { header: "Pregunta", key: "pregunta", width: 90 },
  ];
  dic.getRow(1).font = { bold: true };
  dic.addRow({
    codigo: "RESULTADO",
    columna: "RESULTADO",
    etiqueta: Object.entries(ETIQUETA_RESULTADO).map(([k, v]) => `${k} = ${v}`).join(" · "),
  });
  dic.addRow({ codigo: "—", columna: "(todas)", valor: "vacío", etiqueta: "No se llegó a preguntar (llamada cerrada antes)" });
  dic.addRows(filasDiccionario(preguntas));

  return wb.xlsx.writeBuffer();
}

module.exports = { excelPorCodigos };
