import { NextResponse } from "next/server";
import { getPool } from "../../../../../lib/db";
import { bloqueoActivo, bloqueosDisponibles, actualizarEnTwenty } from "../../../../../lib/bloqueos";
import { esUUID, errorJson, leerJson, conErrores } from "../../../../../lib/http";

export const dynamic = "force-dynamic";

// Resultados de llamada que el encuestador registra desde la app sin hacer la
// encuesta: cambian el estado del cliente directamente en Twenty (ya no hay que
// moverlo a mano en el CRM).
const RESULTADOS = {
  NO_CONTESTA: { intento: true },
  VOLVER_A_LLAMAR: { intento: true, requiereFecha: true },
  NO_DISPONIBLE: { intento: true },
  INCORRECTO: { intento: false },
  NO_LLAMAR: { intento: false },
};

export const POST = conErrores("POST /api/clientes/[id]/gestion", async (request, { params }) => {
  const { id } = await params;
  const body = await leerJson(request);
  if (!esUUID(id) || !body || !esUUID(body.encuestador_id)) return errorJson("Datos inválidos");

  const regla = RESULTADOS[body.resultado];
  if (!regla) return errorJson(`Resultado inválido. Usa uno de: ${Object.keys(RESULTADOS).join(", ")}`);

  let proxima = null;
  if (body.proxima_llamada) {
    const fecha = new Date(body.proxima_llamada);
    if (Number.isNaN(fecha.getTime())) return errorJson("Fecha de próxima llamada inválida");
    proxima = fecha.toISOString();
  }
  if (regla.requiereFecha && !proxima) return errorJson("Indica cuándo volver a llamar");
  const observacion = typeof body.observacion === "string" ? body.observacion.trim().slice(0, 1000) : "";

  const pool = getPool();
  const [{ rows: encRows }, { rows: cliRows }] = await Promise.all([
    pool.query(`select nombre from encuestadores where id = $1 and activo`, [body.encuestador_id]),
    pool.query(`select status, raw from clientes_cache where id_twenty = $1`, [id]),
  ]);
  if (!encRows[0]) return errorJson("El encuestador no existe o está inactivo");
  if (!cliRows[0]) return errorJson("Cliente no encontrado", 404);

  const bloqueo = await bloqueoActivo(pool, id);
  if (bloqueo && bloqueo.encuestador_id !== body.encuestador_id) {
    return errorJson(`${bloqueo.encuestador || "Otro encuestador"} está gestionando a este cliente.`, 409, {
      code: "EN_GESTION_POR_OTRO",
    });
  }

  // Campos del registro en Twenty.
  const raw = cliRows[0].raw || {};
  const patch = { status: body.resultado };
  if (regla.intento) patch.intentoDeLlamada = (Number(raw.intentoDeLlamada) || 0) + 1;
  if (proxima) patch.proximaLlamada = proxima;
  if (observacion) {
    const fecha = new Date().toLocaleDateString("es-EC", { timeZone: "America/Guayaquil" });
    const previa = typeof raw.observaciones === "string" ? raw.observaciones.trim() : "";
    patch.observaciones = [previa, `${fecha} ${encRows[0].nombre}: ${observacion}`].filter(Boolean).join("\n").slice(-4000);
  }

  // La copia local refleja el cambio de inmediato (incluido el nuevo número de
  // intento, para que una segunda gestión antes del próximo refresco no lo repita).
  await pool.query(
    `update clientes_cache set status = $2, raw = coalesce(raw, '{}'::jsonb) || $3::jsonb, synced_at = now()
     where id_twenty = $1`,
    [id, body.resultado, JSON.stringify(patch)]
  );
  await pool.query(
    `insert into gestiones (cliente_twenty_id, encuestador_id, resultado, proxima_llamada, observacion)
     values ($1, $2, $3, $4, $5)`,
    [id, body.encuestador_id, body.resultado, proxima, observacion || null]
  ).catch((err) => console.warn("No se pudo registrar la gestión:", err.message));
  if (await bloqueosDisponibles(pool)) {
    await pool.query(`delete from clientes_bloqueo where cliente_twenty_id = $1`, [id]);
  }

  const twentyError = await actualizarEnTwenty(pool, id, patch);
  return NextResponse.json({ ok: true, status: body.resultado, twentyError });
});
