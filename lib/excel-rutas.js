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
  no_contacto: "No contacto",
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

  const { where, valores } = construirFiltro(filtros);
  valores.push(cu[0].id);
  const condicion = `${where ? `${where} and` : "where"} e.cuestionario_id = $${valores.length}`;
  const { rows: encuestas } = await pool.query(
    `select e.id, e.created_at, e.completada, e.resultado, e.ultimo_bloque, e.codigo_cliente,
            enc.nombre as encuestador, cc.pdv, cc.datos->>'ciudad_oficina' as ciudad,
            cc.datos->>'tipo_persona' as tipo_persona_listado,
            row_number() over (partition by e.cliente_twenty_id order by e.created_at) as intento
     from encuestas e
     left join encuestadores enc on enc.id = e.encuestador_id
     left join clientes_cache cc on cc.id_twenty = e.cliente_twenty_id
     ${condicion}
     order by e.created_at`,
    valores
  );

  const respuestas = {};
  if (encuestas.length) {
    const { rows } = await pool.query(
      `select encuesta_id, pregunta_id, valor from respuestas where encuesta_id = any($1::uuid[])`,
      [encuestas.map((e) => e.id)]
    );
    for (const r of rows) {
      if (!respuestas[r.encuesta_id]) respuestas[r.encuesta_id] = {};
      respuestas[r.encuesta_id][r.pregunta_id] = r.valor;
    }
  }
  const datos = filasRespuestas(preguntas, encuestas.map((e) => ({ respuestas: respuestas[e.id] || {} })));

  const wb = new ExcelJS.Workbook();
  wb.creator = `Sistema de Encuestas ${tenant().nombre}`;
  wb.created = new Date();

  const hoja = wb.addWorksheet("Respuestas", { views: [{ state: "frozen", ySplit: 1, xSplit: 2 }] });
  hoja.columns = [
    { header: "ID_LLAMADA", key: "id", width: 38 },
    { header: "CODIGO_SOCIO", key: "codigo", width: 14 },
    { header: "FECHA", key: "fecha", width: 20 },
    { header: "ENCUESTADOR", key: "encuestador", width: 20 },
    { header: tenant().etiquetas.grupo.toUpperCase(), key: "grupo", width: 16 },
    { header: "CIUDAD", key: "ciudad", width: 14 },
    { header: "TIPO_PERSONA_LISTADO", key: "tipo_listado", width: 14 },
    { header: "INTENTO", key: "intento", width: 9 },
    { header: "RESULTADO", key: "resultado", width: 16 },
    { header: "ULTIMO_BLOQUE", key: "ultimo_bloque", width: 20 },
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
      ciudad: e.ciudad || "",
      tipo_listado: e.tipo_persona_listado || "",
      intento: Number(e.intento),
      resultado: e.resultado || (e.completada ? "completa" : "cortada"),
      ultimo_bloque: e.ultimo_bloque || "",
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
