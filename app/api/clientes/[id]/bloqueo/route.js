import { NextResponse } from "next/server";
import { getPool } from "../../../../../lib/db";
import { tomarCliente, liberarCliente, MINUTOS_BLOQUEO } from "../../../../../lib/bloqueos";
import { esUUID, errorJson, leerJson, conErrores } from "../../../../../lib/http";

export const dynamic = "force-dynamic";

// Reserva ("tomar") o suelta ("liberar") un cliente para un encuestador mientras
// tiene su encuesta abierta: otro encuestador no puede tomarlo a la vez, y en
// Twenty el cliente pasa a EN_GESTION. "tomar" también renueva el bloqueo.
export const POST = conErrores("POST /api/clientes/[id]/bloqueo", async (request, { params }) => {
  const { id } = await params;
  const body = await leerJson(request);
  if (!esUUID(id) || !body || !esUUID(body.encuestador_id)) return errorJson("Datos inválidos");

  const pool = getPool();
  if (body.accion === "liberar") {
    await liberarCliente(pool, id, body.encuestador_id);
    return NextResponse.json({ ok: true });
  }

  const { rows } = await pool.query(`select 1 from encuestadores where id = $1 and activo`, [body.encuestador_id]);
  if (!rows[0]) return errorJson("El encuestador no existe o está inactivo");

  const r = await tomarCliente(pool, id, body.encuestador_id);
  if (r.ocupado) {
    return errorJson(`${r.ocupado.encuestador || "Otro encuestador"} ya está gestionando a este cliente.`, 409, {
      code: "EN_GESTION_POR_OTRO",
      encuestador: r.ocupado.encuestador,
      desde: r.ocupado.desde,
    });
  }
  return NextResponse.json({ ok: true, minutos: MINUTOS_BLOQUEO });
});
