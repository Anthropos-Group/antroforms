import { NextResponse } from "next/server";
import { getPool } from "../../../../lib/db";
import { fetchPerson, twentyConfigurado, twentyEnVivoDisponible, registrarFalloEnVivo } from "../../../../lib/twenty";
import { filaCache, upsertClientes } from "../../../../lib/clientes";
import { esUUID, errorJson, conErrores } from "../../../../lib/http";
import { mesGestionActivo, esMesActivo } from "../../../../lib/gestion";
import { pdvsConMetaAlcanzada, marcarMetaAlcanzada } from "../../../../lib/meta";

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
  if (twentyConfigurado() && !twentyEnVivoDisponible()) {
    twentyDisponible = false;
  } else if (twentyConfigurado()) {
    try {
      const person = await fetchPerson(id, { timeoutMs: TIMEOUT_TWENTY_MS, reintentos: 0 });
      // Solo un registro completo reemplaza la copia local.
      if (person?.id && (person.name || person.codigoCliente)) await upsertClientes(pool, [filaCache(person)]);
      twentyDisponible = true;
    } catch (err) {
      registrarFalloEnVivo(err);
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

  // ¿Su PDV ya cumplió la meta del mes? Se revisa al abrir o retomar un borrador, para
  // no dejar llenar una encuesta que el guardado va a rechazar. Solo aplica al mes de
  // gestión activo, que es el único que se encuesta.
  let [cliente] = rows;
  try {
    const { nombre, periodo } = await mesGestionActivo(pool);
    if (esMesActivo(cliente.mes_gestion, nombre)) {
      const { pdvs } = await pdvsConMetaAlcanzada(periodo, pool);
      [cliente] = marcarMetaAlcanzada([cliente], pdvs);
    }
  } catch (err) {
    console.error(`No se pudo calcular la meta por PDV del cliente ${id}:`, err);
  }
  return NextResponse.json({ cliente, twentyDisponible });
});
