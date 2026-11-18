import { NextResponse } from "next/server";
import { getPool } from "../../../../lib/db";
import { verifySessionToken, SESSION_COOKIE, safeEqual, adminSigueActivo } from "../../../../lib/auth";
import { excelReporteGestion, datosReporte, resumenReporte } from "../../../../lib/reporte-gestion";
import { excelPorCodigos } from "../../../../lib/excel-rutas";
import { tenant } from "../../../../lib/tenant";
import { hoyISOEcuador } from "../../../../lib/fecha";
import { conErrores } from "../../../../lib/http";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Reporte de gestión histórico. Lo pide n8n cada mañana (Authorization: Bearer
// <CRON_SECRET>) para enviarlo por correo, y el administrador desde el panel.
//   ?formato=json         → números clave (para el cuerpo del correo)
//   ?tipo=respuestas      → Excel de respuestas por código (encuestas y llamadas)
//   (por defecto)         → Excel de gestión: ciudades, estados, productividad…
async function autorizado(request) {
  const secreto = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization") || "";
  if (secreto && auth.startsWith("Bearer ") && safeEqual(auth.slice(7), secreto)) return true;
  const adminId = verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (!adminId) return false;
  try {
    return await adminSigueActivo(adminId, getPool);
  } catch {
    return false;
  }
}

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export const GET = conErrores("GET /api/reportes/gestion", async (request) => {
  if (!(await autorizado(request))) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const { searchParams } = new URL(request.url);
  const pool = getPool();

  if (searchParams.get("formato") === "json") {
    return NextResponse.json(resumenReporte(await datosReporte(pool)));
  }
  if (searchParams.get("tipo") === "respuestas") {
    const buffer = await excelPorCodigos(pool, {});
    if (!buffer) return NextResponse.json({ error: "No hay cuestionario activo" }, { status: 404 });
    return new Response(buffer, {
      headers: {
        "Content-Type": XLSX,
        "Content-Disposition": `attachment; filename="${tenant().id}_respuestas_${hoyISOEcuador()}.xlsx"`,
      },
    });
  }
  const { buffer, nombre } = await excelReporteGestion(pool);
  return new Response(buffer, {
    headers: { "Content-Type": XLSX, "Content-Disposition": `attachment; filename="${nombre}"` },
  });
});
