// Reporte de gestión histórico (todo el proyecto, no solo el mes): avance por
// ciudad frente a la cuota, estados de los socios, resultados de las llamadas,
// productividad por encuestador (total y por día) y el detalle de cada llamada.
// Lo descarga el administrador desde el panel y n8n lo envía por correo cada día
// (GET /api/reportes/gestion).
const ExcelJS = require("exceljs");
const { tenant } = require("./tenant");
const { formatFechaHoraEcuador, hoyISOEcuador } = require("./fecha");

const TZ = "America/Guayaquil";

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
  cortada: "Cortada",
};
const RESULTADOS = Object.keys(ETIQUETA_RESULTADO);

// Etiquetas de los estados de Twenty según el esquema del cliente (si lo tiene).
function etiquetasEstado() {
  const campo = (tenant().esquemaTwenty || []).find((c) => c.name === tenant().twenty.campos.status);
  return Object.fromEntries((campo?.opciones || []).map(([valor, etiqueta]) => [valor, etiqueta]));
}

const resultadoSql = `coalesce(e.resultado, case when e.completada then 'completa' else 'cortada' end)`;

async function datosReporte(pool) {
  const [ciudades, estados, resultados, productividad, diaria, llamadas, totales] = await Promise.all([
    // Cuota = principales del sorteo (o toda la base si el cliente no tiene sorteo).
    pool.query(
      `with socios as (
         select cc.id_twenty, cc.status,
                coalesce(nullif(cc.datos->>'ciudad_oficina', ''), nullif(trim(cc.pdv), ''), '(sin ciudad)') as ciudad,
                cc.raw->>'condicion' as condicion
         from clientes_cache cc
       ),
       por_socio as (
         select cliente_twenty_id, count(*)::int as llamadas, bool_or(completada) as efectiva
         from encuestas group by cliente_twenty_id
       )
       select s.ciudad,
              count(*) filter (where coalesce(s.condicion, 'PRINCIPAL') = 'PRINCIPAL')::int as cuota,
              count(*) filter (where s.condicion = 'REEMPLAZO' and upper(coalesce(s.status, '')) <> 'RESERVA')::int as reemplazos_activados,
              count(*) filter (where p.efectiva)::int as efectivas,
              coalesce(sum(p.llamadas), 0)::int as llamadas,
              count(p.cliente_twenty_id)::int as socios_llamados,
              count(*) filter (where p.cliente_twenty_id is null and upper(coalesce(s.status, '')) <> 'RESERVA')::int as sin_llamar,
              count(*) filter (where upper(coalesce(s.status, '')) = 'AGOTADO')::int as agotados
       from socios s
       left join por_socio p on p.cliente_twenty_id = s.id_twenty
       group by s.ciudad
       order by efectivas desc, s.ciudad`
    ),
    pool.query(
      `select coalesce(nullif(upper(trim(status)), ''), '(sin estado)') as estado,
              count(*) filter (where coalesce(raw->>'condicion', 'PRINCIPAL') = 'PRINCIPAL')::int as principales,
              count(*) filter (where raw->>'condicion' = 'REEMPLAZO')::int as reemplazos,
              count(*)::int as total
       from clientes_cache group by 1 order by total desc`
    ),
    pool.query(`select ${resultadoSql} as resultado, count(*)::int as llamadas from encuestas e group by 1 order by 2 desc`),
    pool.query(
      `select coalesce(enc.nombre, '(sin nombre)') as encuestador, coalesce(enc.activo, false) as activo,
              count(*)::int as llamadas,
              count(*) filter (where e.completada)::int as efectivas,
              count(distinct (e.created_at at time zone '${TZ}')::date)::int as dias,
              min(e.created_at) as primera, max(e.created_at) as ultima,
              ${RESULTADOS.map((r) => `count(*) filter (where ${resultadoSql} = '${r}')::int as "r_${r}"`).join(",\n              ")}
       from encuestas e
       left join encuestadores enc on enc.id = e.encuestador_id
       group by 1, 2
       order by efectivas desc, llamadas desc`
    ),
    pool.query(
      `select (e.created_at at time zone '${TZ}')::date::text as fecha,
              coalesce(enc.nombre, '(sin nombre)') as encuestador,
              count(*)::int as llamadas,
              count(*) filter (where e.completada)::int as efectivas,
              count(*) filter (where ${resultadoSql} in ('no_contesta', 'no_contacto'))::int as sin_contacto
       from encuestas e
       left join encuestadores enc on enc.id = e.encuestador_id
       group by 1, 2
       order by 1 desc, 4 desc`
    ),
    pool.query(
      `select e.created_at, coalesce(enc.nombre, '') as encuestador, e.codigo_cliente,
              cc.id_edimca as codigo_muestra, cc.nombre, cc.pdv as oficina, cc.datos->>'ciudad_oficina' as ciudad,
              cc.raw->>'condicion' as condicion, e.completada, ${resultadoSql} as resultado, e.ultimo_bloque,
              row_number() over (partition by e.cliente_twenty_id order by e.created_at)::int as intento
       from encuestas e
       left join encuestadores enc on enc.id = e.encuestador_id
       left join clientes_cache cc on cc.id_twenty = e.cliente_twenty_id
       order by e.created_at desc`
    ),
    pool.query(
      `select count(*)::int as llamadas,
              count(*) filter (where completada)::int as efectivas,
              count(distinct encuestador_id)::int as encuestadores,
              count(*) filter (where (created_at at time zone '${TZ}')::date = (now() at time zone '${TZ}')::date - 1)::int as llamadas_ayer,
              count(*) filter (where completada and (created_at at time zone '${TZ}')::date = (now() at time zone '${TZ}')::date - 1)::int as efectivas_ayer,
              count(*) filter (where (created_at at time zone '${TZ}')::date = (now() at time zone '${TZ}')::date)::int as llamadas_hoy,
              count(*) filter (where completada and (created_at at time zone '${TZ}')::date = (now() at time zone '${TZ}')::date)::int as efectivas_hoy,
              min(created_at) as inicio
       from encuestas`
    ),
  ]);
  return {
    ciudades: ciudades.rows,
    estados: estados.rows,
    resultados: resultados.rows,
    productividad: productividad.rows,
    diaria: diaria.rows,
    llamadas: llamadas.rows,
    totales: totales.rows[0],
  };
}

const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : 0);

// Números clave para el cuerpo del correo (y para revisar sin abrir el Excel).
function resumenReporte(d) {
  const cuota = d.ciudades.reduce((s, c) => s + c.cuota, 0);
  const t = d.totales;
  return {
    cliente: tenant().nombre,
    corte: formatFechaHoraEcuador(new Date()),
    inicio: t.inicio ? formatFechaHoraEcuador(t.inicio) : null,
    cuota,
    efectivas: t.efectivas,
    avance_pct: pct(t.efectivas, cuota),
    llamadas: t.llamadas,
    llamadas_por_efectiva: t.efectivas ? Math.round((t.llamadas / t.efectivas) * 10) / 10 : null,
    encuestadores: t.encuestadores,
    ayer: { llamadas: t.llamadas_ayer, efectivas: t.efectivas_ayer },
    hoy: { llamadas: t.llamadas_hoy, efectivas: t.efectivas_hoy },
    ciudades: d.ciudades.map((c) => ({ ciudad: c.ciudad, cuota: c.cuota, efectivas: c.efectivas, avance_pct: pct(c.efectivas, c.cuota) })),
    encuestadores_detalle: d.productividad.map((p) => ({
      encuestador: p.encuestador,
      llamadas: p.llamadas,
      efectivas: p.efectivas,
      efectividad_pct: pct(p.efectivas, p.llamadas),
    })),
  };
}

function hoja(wb, nombre, columnas, filas) {
  const ws = wb.addWorksheet(nombre, { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = columnas.map(([header, key, width = 14]) => ({ header, key, width }));
  ws.getRow(1).font = { bold: true };
  for (const f of filas) ws.addRow(f);
  if (filas.length) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columnas.length } };
  return ws;
}

async function excelReporteGestion(pool) {
  const d = await datosReporte(pool);
  const r = resumenReporte(d);
  const estados = etiquetasEstado();
  const wb = new ExcelJS.Workbook();
  wb.creator = `Sistema de Encuestas ${tenant().nombre}`;
  wb.created = new Date();

  const res = wb.addWorksheet("Resumen");
  res.columns = [{ width: 34 }, { width: 18 }];
  res.addRow([`Reporte de gestión · ${r.cliente}`]).font = { bold: true, size: 14 };
  for (const [k, v] of [
    ["Corte", r.corte],
    ["Primera llamada registrada", r.inicio || "—"],
    ["Cuota (principales del sorteo)", r.cuota],
    ["Encuestas efectivas", r.efectivas],
    ["Avance sobre la cuota (%)", r.avance_pct],
    ["Llamadas realizadas", r.llamadas],
    ["Llamadas por encuesta efectiva", r.llamadas_por_efectiva ?? "—"],
    ["Encuestadores con llamadas", r.encuestadores],
    ["Llamadas de ayer", r.ayer.llamadas],
    ["Efectivas de ayer", r.ayer.efectivas],
    ["Llamadas de hoy (hasta el corte)", r.hoy.llamadas],
    ["Efectivas de hoy (hasta el corte)", r.hoy.efectivas],
  ]) {
    res.addRow([k, v]);
  }
  res.getColumn(1).font = { bold: true };

  hoja(wb, "Por ciudad", [
    ["Ciudad", "ciudad", 20], ["Cuota", "cuota", 9], ["Efectivas", "efectivas", 10], ["Avance %", "avance", 10],
    ["Faltan", "faltan", 9], ["Llamadas", "llamadas", 10], ["Socios llamados", "socios_llamados", 15],
    ["Sin llamar", "sin_llamar", 11], ["Agotados (3 sin contacto)", "agotados", 22], ["Reemplazos activados", "reemplazos_activados", 20],
  ], d.ciudades.map((c) => ({ ...c, avance: pct(c.efectivas, c.cuota), faltan: Math.max(0, c.cuota - c.efectivas) })));

  hoja(wb, "Estados", [
    ["Estado", "etiqueta", 30], ["Código", "estado", 22], ["Principales", "principales", 12], ["Reemplazos", "reemplazos", 12], ["Total", "total", 10],
  ], d.estados.map((e) => ({ ...e, etiqueta: estados[e.estado] || e.estado })));

  const totalLlamadas = d.resultados.reduce((s, x) => s + x.llamadas, 0);
  hoja(wb, "Resultados de llamadas", [
    ["Resultado", "etiqueta", 26], ["Llamadas", "llamadas", 10], ["% de llamadas", "porcentaje", 14],
  ], d.resultados.map((x) => ({ etiqueta: ETIQUETA_RESULTADO[x.resultado] || x.resultado, llamadas: x.llamadas, porcentaje: pct(x.llamadas, totalLlamadas) })));

  hoja(wb, "Productividad", [
    ["Encuestador", "encuestador", 30], ["Activo", "activo_txt", 8], ["Llamadas", "llamadas", 10], ["Efectivas", "efectivas", 10],
    ["Efectividad %", "efectividad", 13], ["Días trabajados", "dias", 14], ["Llamadas por día", "llamadas_dia", 15],
    ["Efectivas por día", "efectivas_dia", 15], ["Primera llamada", "primera_txt", 18], ["Última llamada", "ultima_txt", 18],
    ...RESULTADOS.map((x) => [ETIQUETA_RESULTADO[x], `r_${x}`, Math.max(10, ETIQUETA_RESULTADO[x].length + 2)]),
  ], d.productividad.map((p) => ({
    ...p,
    activo_txt: p.activo ? "Sí" : "No",
    efectividad: pct(p.efectivas, p.llamadas),
    llamadas_dia: p.dias ? Math.round((p.llamadas / p.dias) * 10) / 10 : 0,
    efectivas_dia: p.dias ? Math.round((p.efectivas / p.dias) * 10) / 10 : 0,
    primera_txt: p.primera ? formatFechaHoraEcuador(p.primera) : "",
    ultima_txt: p.ultima ? formatFechaHoraEcuador(p.ultima) : "",
  })));

  hoja(wb, "Productividad diaria", [
    ["Fecha", "fecha", 12], ["Encuestador", "encuestador", 30], ["Llamadas", "llamadas", 10],
    ["Efectivas", "efectivas", 10], ["Efectividad %", "efectividad", 13], ["Sin contacto", "sin_contacto", 13],
  ], d.diaria.map((x) => ({ ...x, efectividad: pct(x.efectivas, x.llamadas) })));

  hoja(wb, "Llamadas", [
    ["Fecha y hora", "fecha", 18], ["Encuestador", "encuestador", 28], ["Código socio", "codigo_cliente", 13],
    ["Código muestra", "codigo_muestra", 14], ["Nombre", "nombre", 34], ["Ciudad", "ciudad", 16], ["Oficina", "oficina", 18],
    ["Condición", "condicion", 12], ["N.º intento", "intento", 11], ["Resultado", "resultado_txt", 22],
    ["Efectiva", "efectiva_txt", 9], ["Último bloque", "ultimo_bloque", 20],
  ], d.llamadas.map((x) => ({
    ...x,
    fecha: formatFechaHoraEcuador(x.created_at),
    resultado_txt: ETIQUETA_RESULTADO[x.resultado] || x.resultado,
    efectiva_txt: x.completada ? "Sí" : "No",
    condicion: x.condicion ? x.condicion.charAt(0) + x.condicion.slice(1).toLowerCase() : "",
  })));

  return { buffer: await wb.xlsx.writeBuffer(), resumen: r, nombre: `${tenant().id}_gestion_${hoyISOEcuador()}.xlsx` };
}

module.exports = { excelReporteGestion, datosReporte, resumenReporte };
