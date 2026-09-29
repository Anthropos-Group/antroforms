import { NextResponse } from "next/server";
import { getPool } from "../../../../lib/db";
import { esUUID, errorJson, leerJson, conErrores } from "../../../../lib/http";

export const dynamic = "force-dynamic";

// Recibe la lista completa de ids de preguntas del cuestionario activo en el
// nuevo orden y reasigna `orden` 1..N en una sola transacción.
export const POST = conErrores("POST /api/preguntas/reordenar", async (request) => {
  const body = await leerJson(request);
  const ids = body?.ids;
  if (!Array.isArray(ids) || ids.length === 0 || !ids.every(esUUID) || new Set(ids).size !== ids.length) {
    return errorJson("Lista de preguntas inválida");
  }

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("begin");
    const { rows: preguntas } = await client.query(
      `select p.id, p.condicion from preguntas p
       where p.cuestionario_id = (select id from cuestionarios where activo = true order by created_at desc limit 1)
       for update`
    );
    const existentes = new Set(preguntas.map((p) => p.id));
    if (preguntas.length !== ids.length || !ids.every((id) => existentes.has(id))) {
      await client.query("rollback");
      return errorJson("La lista no coincide con las preguntas actuales. Recarga la página.", 409);
    }

    // Una pregunta condicionada debe seguir quedando después de la pregunta de la que depende.
    const posicion = new Map(ids.map((id, i) => [id, i]));
    for (const p of preguntas) {
      const base = p.condicion?.pregunta_id;
      if (base && posicion.has(base) && posicion.get(base) >= posicion.get(p.id)) {
        await client.query("rollback");
        return errorJson("Ese orden deja una pregunta antes de la pregunta de la que depende.", 400);
      }
    }

    await client.query(
      `update preguntas p set orden = n.orden
       from unnest($1::uuid[]) with ordinality as n(id, orden)
       where p.id = n.id`,
      [ids]
    );
    await client.query("commit");
  } catch (err) {
    await client.query("rollback").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
  return NextResponse.json({ ok: true });
});
