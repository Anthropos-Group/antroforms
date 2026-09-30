import { NextResponse } from "next/server";
import { getPool } from "../../../../lib/db";
import { fetchPerson, twentyConfigurado } from "../../../../lib/twenty";
import { filaCache, upsertClientes } from "../../../../lib/clientes";
import { esUUID, errorJson, conErrores } from "../../../../lib/http";

export const dynamic = "force-dynamic";

const TIMEOUT_TWENTY_MS = 5000;

// Datos actuales de un cliente, al abrir (o retomar) su encuesta: se traen de
// Twenty en ese momento para que las preguntas que dependen de sus datos (TOTAL →
// corte y laminado) se decidan con la información vigente y no con la foto de la
// búsqueda o del borrador. Si Twenty no responde, se usa la copia local.
export const GET = conErrores("GET /api/clientes/[id]", async (_request, { params }) => {
  const { id } = await params;
  if (!esUUID(id)) return errorJson("Id de cliente inválido");

  const pool = getPool();
  let twentyDisponible = null;
  if (twentyConfigurado()) {
    try {
      const person = await fetchPerson(id, { timeoutMs: TIMEOUT_TWENTY_MS, reintentos: 0 });
      if (person) await upsertClientes(pool, [filaCache(person)]);
      twentyDisponible = true;
    } catch (err) {
      twentyDisponible = false;
      console.warn(`Aviso: no se pudo traer de Twenty el cliente ${id}:`, err.message);
    }
  }

  const { rows } = await pool.query(
    `select id_twenty, nombre, codigo_cliente, pdv, mes_gestion, id_edimca, status, telefono1, total, fecha_atencion, etiqueta
     from clientes_cache where id_twenty = $1`,
    [id]
  );
  if (!rows[0]) return errorJson("Cliente no encontrado", 404);
  return NextResponse.json({ cliente: rows[0], twentyDisponible });
});
