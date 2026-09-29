import ExcelJS from "exceljs";
import { getPool } from "../../../../lib/db";
import { obtenerReporte, obtenerResumen, leerFiltros } from "../../../../lib/reportes";
import { formatFechaHoraEcuador, hoyISOEcuador } from "../../../../lib/fecha";
import { conErrores } from "../../../../lib/http";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export const GET = conErrores("GET /api/encuestas/export", async (request) => {
  const { searchParams } = new URL(request.url);
  const filtros = leerFiltros(searchParams);

  const pool = getPool();
  const [reporte, resumen] = await Promise.all([obtenerReporte(pool, filtros), obtenerResumen(pool, filtros)]);
  if (!reporte) {
    return Response.json({ error: "No hay cuestionario activo" }, { status: 404 });
  }
  const { cuestionario, encuestas } = reporte;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Sistema de Encuestas EDIMCA";
  workbook.created = new Date();
  const sheet = workbook.addWorksheet("Encuestas", { views: [{ state: "frozen", ySplit: 1 }] });

  const columnasBase = [
    { header: "Submission Id", key: "submission_id", width: 38 },
    { header: "Fecha", key: "fecha", width: 20 },
    { header: "Encuestador", key: "encuestador", width: 20 },
    { header: "Cliente", key: "cliente", width: 28 },
    { header: "Código", key: "codigo", width: 12 },
    { header: "Teléfono", key: "telefono", width: 14 },
    { header: "PDV", key: "pdv", width: 18 },
    { header: "Mes de Gestión", key: "mes_gestion", width: 14 },
    { header: "Etiqueta", key: "etiqueta", width: 30 },
    { header: "Completada", key: "completada", width: 12 },
  ];

  // Mismo estilo de numeración que el cuestionario original del cliente:
  // "5. ¿Pregunta...?" y "5.1. ¿Porqué? (...)" — no "P5"/"Justificación".
  const columnasPreguntas = [];
  for (const p of cuestionario.preguntas) {
    const n = p.numero_reporte ?? p.orden;
    columnasPreguntas.push({ header: `${n}. ${p.texto}`, key: `p_${p.id}`, width: 42 });
    if (p.requiere_justificacion) {
      columnasPreguntas.push({
        header: `${n}.1. ¿Porqué? (Indíquenos el motivo de su calificación)`,
        key: `p_${p.id}_just`,
        width: 40,
      });
    }
  }

  sheet.columns = [...columnasBase, ...columnasPreguntas];
  sheet.getRow(1).font = { bold: true };
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sheet.columns.length } };

  for (const e of encuestas) {
    const fila = {
      submission_id: e.id,
      // El contenedor corre en UTC: sin la zona explícita las horas salían 5 h adelantadas.
      fecha: formatFechaHoraEcuador(e.created_at),
      encuestador: e.encuestador_nombre || "",
      cliente: e.cliente_nombre || "",
      codigo: e.codigo_cliente || "",
      telefono: e.telefono1 || "",
      pdv: e.pdv || "",
      mes_gestion: e.mes_gestion || "",
      etiqueta: e.etiqueta || "",
      completada: e.completada ? "Sí" : "No",
    };
    for (const p of cuestionario.preguntas) {
      const { principal, justificacion } = e.respuestas[p.id];
      fila[`p_${p.id}`] = principal;
      if (p.requiere_justificacion) {
        fila[`p_${p.id}_just`] = justificacion;
      }
    }
    sheet.addRow(fila);
  }

  // Hoja de resumen: KPIs del universo filtrado + promedio / NPS por pregunta.
  const hoja = workbook.addWorksheet("Resumen");
  hoja.columns = [
    { header: "Indicador", key: "k", width: 60 },
    { header: "Valor", key: "v", width: 16 },
    { header: "Promotores (9-10)", key: "pro", width: 18 },
    { header: "Pasivos (7-8)", key: "pas", width: 14 },
    { header: "Detractores (1-6)", key: "det", width: 18 },
    { header: "Índice neto (NPS)", key: "nps", width: 18 },
    { header: "Respuestas", key: "n", width: 12 },
  ];
  hoja.getRow(1).font = { bold: true };
  const filtrosTexto = [
    filtros.desde && `desde ${filtros.desde}`,
    filtros.hasta && `hasta ${filtros.hasta}`,
    filtros.mesGestion && `mes de gestión ${filtros.mesGestion}`,
    filtros.pdv && `PDV ${filtros.pdv}`,
    filtros.estado && `estado ${filtros.estado}`,
    filtros.encuestadorId && encuestas[0]?.encuestador_nombre && `encuestador ${encuestas[0].encuestador_nombre}`,
  ].filter(Boolean);
  hoja.addRows([
    { k: "Filtros aplicados", v: filtrosTexto.join(", ") || "ninguno" },
    { k: "Generado", v: formatFechaHoraEcuador(new Date()) },
    { k: "Total de encuestas", v: resumen.total },
    { k: "Efectivas (completadas)", v: resumen.completadas },
    { k: "Cortadas", v: resumen.cortadas },
    { k: "Tasa de efectividad (%)", v: resumen.tasa_efectiva },
    { k: "Encuestadores", v: resumen.encuestadores },
    { k: "Sucursales (PDV)", v: resumen.pdvs },
    {},
  ]);
  const encabezado = hoja.addRow({ k: "Pregunta", v: "Promedio / Sí-No" });
  encabezado.font = { bold: true };
  for (const p of cuestionario.preguntas) {
    const st = resumen.preguntas[p.id];
    const n = p.numero_reporte ?? p.orden;
    if (p.tipo === "escala_1_10") {
      hoja.addRow({
        k: `${n}. ${p.texto}`,
        v: st?.promedio ?? "",
        pro: st?.promotores ?? 0,
        pas: st?.pasivos ?? 0,
        det: st?.detractores ?? 0,
        nps: st?.nps ?? "",
        n: st?.n ?? 0,
      });
    } else if (p.tipo === "aceptacion_si_no") {
      hoja.addRow({ k: `${n}. ${p.texto}`, v: `Sí ${st?.si ?? 0} / No ${st?.no ?? 0}`, n: (st?.si ?? 0) + (st?.no ?? 0) });
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const filename = `encuestas_${filtros.desde || "inicio"}_a_${filtros.hasta || hoyISOEcuador()}.xlsx`;

  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
});
