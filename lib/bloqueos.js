// Clientes "en gestión": cuando un encuestador abre la encuesta de un cliente, el
// cliente queda reservado para él (tabla clientes_bloqueo) y en Twenty pasa a
// EN_GESTION, para que otro encuestador no lo tome a la vez. El bloqueo se renueva
// mientras la encuesta está abierta y se libera al terminarla, al registrar el
// resultado de la llamada, al descartarla o al vencer (MINUTOS_BLOQUEO sin uso):
// en esos dos últimos casos el cliente vuelve al estado que tenía.
const { patchPerson, fetchPerson, twentyConfigurado } = require("./twenty");

const MINUTOS_BLOQUEO = 20;
const ESTADO_EN_GESTION = "EN_GESTION";

// La tabla llega con la migración 0013; sin ella la función queda apagada.
let tablaLista = false;
async function bloqueosDisponibles(db) {
  if (tablaLista) return true;
  const { rows } = await db.query(`select to_regclass('public.clientes_bloqueo') is not null as ok`);
  tablaLista = rows[0].ok;
  return tablaLista;
}

// Cambia campos de un cliente en Twenty sin hacer esperar al encuestador más de
// unos segundos. Si Twenty falla, el estado queda en la cola de reintentos. Antes
// se descartan los estados pendientes viejos de ese cliente: si no, un reintento
// tardío podría pisar el estado nuevo.
async function actualizarEnTwenty(pool, clienteId, patch) {
  if (!twentyConfigurado()) return null;
  if (patch.status) {
    await pool.query(`delete from pending_twenty_sync where cliente_twenty_id = $1`, [clienteId]).catch(() => {});
  }
  try {
    await patchPerson(clienteId, patch, { timeoutMs: 8000, reintentos: 0 });
    return null;
  } catch (err) {
    console.error(`Twenty no aceptó el cambio de ${clienteId}:`, err.message);
    if (patch.status) {
      await pool
        .query(`insert into pending_twenty_sync (cliente_twenty_id, status_target, ultimo_error) values ($1, $2, $3)`, [
          clienteId,
          patch.status,
          err.message.slice(0, 1000),
        ])
        .catch((qErr) => console.warn("No se pudo encolar el estado para Twenty:", qErr.message));
    }
    return err.message;
  }
}

async function bloqueoActivo(db, clienteId) {
  if (!(await bloqueosDisponibles(db))) return null;
  const { rows } = await db.query(
    `select b.cliente_twenty_id, b.encuestador_id, enc.nombre as encuestador, b.tomado_en, b.expira_en, b.status_previo
     from clientes_bloqueo b left join encuestadores enc on enc.id = b.encuestador_id
     where b.cliente_twenty_id = $1 and b.expira_en > now()`,
    [clienteId]
  );
  return rows[0] || null;
}

// Toma (o renueva) el cliente para el encuestador.
// → { ok: true, nuevo } | { ocupado: { encuestador, desde } }
async function tomarCliente(pool, clienteId, encuestadorId) {
  if (!(await bloqueosDisponibles(pool))) return { ok: true, nuevo: false };
  const client = await pool.connect();
  let nuevo = false;
  try {
    await client.query("begin");
    await client.query(`select pg_advisory_xact_lock(hashtext($1))`, [clienteId]);
    const { rows } = await client.query(
      `select b.encuestador_id, enc.nombre as encuestador, b.tomado_en, b.expira_en > now() as activo, b.status_previo
       from clientes_bloqueo b left join encuestadores enc on enc.id = b.encuestador_id
       where b.cliente_twenty_id = $1`,
      [clienteId]
    );
    const actual = rows[0];
    if (actual?.activo && actual.encuestador_id !== encuestadorId) {
      await client.query("rollback");
      return { ocupado: { encuestador: actual.encuestador, desde: actual.tomado_en } };
    }
    if (actual?.activo) {
      await client.query(
        `update clientes_bloqueo set expira_en = now() + make_interval(mins => $2) where cliente_twenty_id = $1`,
        [clienteId, MINUTOS_BLOQUEO]
      );
    } else {
      // Un bloqueo vencido que aún no se liberó conserva el estado original
      // (el de la caché ya dice EN_GESTION).
      const { rows: cli } = await client.query(`select status from clientes_cache where id_twenty = $1`, [clienteId]);
      const previo = actual ? actual.status_previo : cli[0]?.status ?? null;
      await client.query(
        `insert into clientes_bloqueo (cliente_twenty_id, encuestador_id, status_previo, tomado_en, expira_en)
         values ($1, $2, $3, now(), now() + make_interval(mins => $4))
         on conflict (cliente_twenty_id) do update set
           encuestador_id = excluded.encuestador_id, status_previo = excluded.status_previo,
           tomado_en = excluded.tomado_en, expira_en = excluded.expira_en`,
        [clienteId, encuestadorId, previo, MINUTOS_BLOQUEO]
      );
      await client.query(`update clientes_cache set status = $2 where id_twenty = $1`, [clienteId, ESTADO_EN_GESTION]);
      nuevo = true;
    }
    await client.query("commit");
  } catch (err) {
    await client.query("rollback").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
  // Twenty se actualiza sin hacer esperar la apertura de la encuesta.
  if (nuevo) actualizarEnTwenty(pool, clienteId, { status: ESTADO_EN_GESTION }).catch(() => {});
  return { ok: true, nuevo };
}

// Quita el bloqueo y devuelve al cliente al estado que tenía antes de tomarlo,
// solo si sigue en EN_GESTION: si mientras tanto alguien le puso otro estado en
// Twenty (p. ej. EFECTIVA a mano), se respeta. Se consulta Twenty porque la copia
// local puede ir unos minutos atrasada.
async function restaurarYLiberar(pool, clienteId, statusPrevio) {
  await pool.query(`delete from clientes_bloqueo where cliente_twenty_id = $1`, [clienteId]);
  const restaurar = statusPrevio && statusPrevio !== ESTADO_EN_GESTION ? statusPrevio : "PENDIENTE";
  let estadoActual = null;
  if (twentyConfigurado()) {
    try {
      estadoActual = (await fetchPerson(clienteId, { timeoutMs: 5000, reintentos: 0 }))?.status ?? null;
    } catch {
      // Twenty no responde: se decide con la copia local.
    }
  }
  if (estadoActual === null) {
    const { rows } = await pool.query(`select status from clientes_cache where id_twenty = $1`, [clienteId]);
    estadoActual = rows[0]?.status ?? null;
  }
  if (estadoActual !== ESTADO_EN_GESTION) return;
  await pool.query(`update clientes_cache set status = $2 where id_twenty = $1`, [clienteId, restaurar]);
  await actualizarEnTwenty(pool, clienteId, { status: restaurar });
}

// Libera un cliente que el encuestador abrió y no terminó (descartó la encuesta,
// volvió al buscador o cerró la página).
async function liberarCliente(pool, clienteId, encuestadorId) {
  if (!(await bloqueosDisponibles(pool))) return;
  const { rows } = await pool.query(
    `select encuestador_id, status_previo, expira_en > now() as activo from clientes_bloqueo where cliente_twenty_id = $1`,
    [clienteId]
  );
  const b = rows[0];
  if (!b || (b.activo && b.encuestador_id !== encuestadorId)) return;
  await restaurarYLiberar(pool, clienteId, b.status_previo);
}

// Bloqueos vencidos (encuesta abandonada): se liberan y el cliente vuelve a su estado.
async function liberarVencidos(pool) {
  if (!(await bloqueosDisponibles(pool))) return 0;
  const { rows } = await pool.query(
    `select cliente_twenty_id, status_previo from clientes_bloqueo where expira_en <= now() limit 50`
  );
  for (const b of rows) {
    await restaurarYLiberar(pool, b.cliente_twenty_id, b.status_previo).catch((err) =>
      console.error(`No se pudo liberar el bloqueo de ${b.cliente_twenty_id}:`, err.message)
    );
  }
  return rows.length;
}

module.exports = {
  MINUTOS_BLOQUEO,
  ESTADO_EN_GESTION,
  bloqueosDisponibles,
  bloqueoActivo,
  tomarCliente,
  liberarCliente,
  liberarVencidos,
  restaurarYLiberar,
  actualizarEnTwenty,
};
