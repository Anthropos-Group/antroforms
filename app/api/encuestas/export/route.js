import ExcelJS from "exceljs";
import { getPool } from "../../../../lib/db";
import { obtenerReporte } from "../../../../lib/reportes";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const desde = searchParams.get("desde");
  const hasta = searchParams.get("hasta");
  const encuestadorId = searchParams.get("encuestador_id");

  const pool = getPool();
  const reporte = await obtenerReporte(pool, { desde, hasta, encuestadorId });
  if (!reporte) {
    return Response.json({ error: "No hay cuestionario activo" }, { status: 404 });
  }
  const { cuestionario, encuestas } = reporte;

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Encuestas");

  const columnasBase = [
    { header: "Submission Id", key: "submission_id", width: 38 },
    { header: "Fecha", key: "fecha", width: 20 },
    { header: "Encuestador", key: "encuestador", width: 20 },
    { header: "Cliente", key: "cliente", width: 28 },
    { header: "Código", key: "codigo", width: 12 },
    { header: "PDV", key: "pdv", width: 18 },
    { header: "Mes de Gestión", key: "mes_gestion", width: 14 },
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

  for (const e of encuestas) {
    const fila = {
      submission_id: e.id,
      fecha: new Date(e.created_at).toLocaleString("es-EC"),
      encuestador: e.encuestador_nombre || "",
      cliente: e.cliente_nombre || "",
      codigo: e.codigo_cliente || "",
      pdv: e.pdv || "",
      mes_gestion: e.mes_gestion || "",
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

  const buffer = await workbook.xlsx.writeBuffer();
  const filename = `encuestas_${desde || "inicio"}_a_${hasta || "hoy"}.xlsx`;

  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
