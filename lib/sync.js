const { getPool } = require("./db");
const { fetchPeoplePage, patchPerson } = require("./twenty");
const { computeChanges } = require("./normalize");
const { filaCache, upsertClientes } = require("./clientes");

const VALID_MODES = ["dry_run", "incremental", "backfill_completo"];

async function getUltimoSyncExitoso(pool) {
  // 1. Buscar última corrida incremental o backfill completada
  const { rows } = await pool.query(
    `select iniciado_en from sync_runs
     where estado = 'completado' and not parcial and tipo in ('incremental', 'backfill_completo')
     order by iniciado_en desc limit 1`
  );
  if (rows[0]?.iniciado_en) return rows[0].iniciado_en;

  // 2. Si no hay incremental previa, buscar la última corrida completada (ej. dry_run previo)
  const { rows: anyRows } = await pool.query(
    `select iniciado_en from sync_runs
     where estado = 'completado' and not parcial
     order by iniciado_en desc limit 1`
  );
  if (anyRows[0]?.iniciado_en) return anyRows[0].iniciado_en;

  // 3. Si no hay corridas, buscar el máximo synced_at en clientes_cache
  const { rows: cacheRows } = await pool.query(
    `select max(synced_at) as max_sync from clientes_cache`
  );
  if (cacheRows[0]?.max_sync) return cacheRows[0].max_sync;

  // 4. Fallback defensivo a las últimas 48 horas (evita intentar escanear 20,000 registros por HTTP)
  return new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
}

// Procesa tareas pendientes de actualización de estado en Twenty CRM (resiliencia y reintentos).
// `incluirAgotados` permite al admin forzar de nuevo los que ya superaron 5 intentos.
const MAX_INTENTOS_TWENTY = 5;

async function procesarReintentosTwenty(pool, { incluirAgotados = false, limite = 50 } = {}) {
  const resultado = { procesados: 0, exitosos: 0, fallidos: 0 };
  try {
    const { rows: pendientes } = await pool.query(
      `select id, cliente_twenty_id, status_target, intentos
       from pending_twenty_sync
       where ($1::boolean or intentos < $2)
       order by creado_en asc
       limit $3`,
      [incluirAgotados, MAX_INTENTOS_TWENTY, limite]
    );

    for (const p of pendientes) {
      resultado.procesados++;
      try {
        await patchPerson(p.cliente_twenty_id, { status: p.status_target }, { timeoutMs: 10_000, reintentos: 1 });
        await pool.query(`delete from pending_twenty_sync where id = $1`, [p.id]);
        resultado.exitosos++;
      } catch (err) {
        resultado.fallidos++;
        await pool.query(
          `update pending_twenty_sync
           set intentos = intentos + 1, ultimo_error = $2, actualizado_en = now()
           where id = $1`,
          [p.id, err.message.slice(0, 1000)]
        );
      }
    }
  } catch (err) {
    // Si la tabla no ha sido migrada aún, registrar aviso sin interrumpir el cron
    console.warn("Aviso en cola de reintentos Twenty:", err.message);
  }
  return resultado;
}

// Una corrida que quedó "en_progreso" por más de este tiempo murió a mitad de
// camino (reinicio del contenedor, timeout del request): se marca fallida.
const MINUTOS_CORRIDA_HUERFANA = 15;

async function reservarCorrida(pool, mode) {
  await pool.query(
    `update sync_runs set estado = 'fallido', finalizado_en = now()
     where estado = 'en_progreso' and iniciado_en < now() - make_interval(mins => $1)`,
    [MINUTOS_CORRIDA_HUERFANA]
  );
  // Evita que el cron programado y el botón manual del admin corran a la vez
  // (duplicarían PATCH a Twenty y registros en sync_changes).
  const { rows } = await pool.query(
    `insert into sync_runs (tipo, estado)
     select $1, 'en_progreso'
     where not exists (select 1 from sync_runs where estado = 'en_progreso')
     returning id`,
    [mode]
  );
  if (!rows[0]) {
    const err = new Error("Ya hay una sincronización en curso. Espera a que termine antes de lanzar otra.");
    err.code = "SYNC_EN_CURSO";
    throw err;
  }
  return rows[0].id;
}

// mode: 'dry_run' | 'incremental' | 'backfill_completo'
// onProgress(pageNumber, { escaneados, modificados }) opcional, para logging del caller.
async function runSync({ mode = "dry_run", pageSize = 100, maxPages = null, onProgress } = {}) {
  if (!VALID_MODES.includes(mode)) {
    throw new Error(`Modo inválido: ${mode}. Usa uno de: ${VALID_MODES.join(", ")}`);
  }

  const pool = getPool();

  let updatedSince = null;
  if (mode === "incremental") {
    updatedSince = await getUltimoSyncExitoso(pool);
  }

  const syncRunId = await reservarCorrida(pool, mode);

  let escaneados = 0;
  let modificados = 0;
  let errores = 0;
  let cursor;
  let page = 0;
  let parcial = false;

  try {
    while (true) {
      page++;
      const { people, pageInfo } = await fetchPeoplePage({
        cursor,
        limit: pageSize,
        updatedSince: updatedSince ? new Date(updatedSince).toISOString() : null,
      });

      const filas = [];
      for (const person of people) {
        escaneados++;
        try {
          const { changes, patch } = computeChanges(person);
          const hasChanges = Object.keys(changes).length > 0;

          if (hasChanges) {
            modificados++;
            const entradas = Object.entries(changes);
            const valores = [];
            const placeholders = entradas.map(([campo, { before, after }], i) => {
              valores.push(syncRunId, person.id, campo, before ?? null, after ?? null);
              const b = i * 5;
              return `($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5})`;
            });
            await pool.query(
              `insert into sync_changes (sync_run_id, id_twenty, campo, valor_antes, valor_despues)
               values ${placeholders.join(", ")}`,
              valores
            );
            if (mode !== "dry_run") {
              await patchPerson(person.id, patch);
            }
          }

          // Cachear no escribe en Twenty, así que se hace siempre (incluso en dry_run) —
          // es lo que alimenta el buscador de clientes de la app.
          filas.push(filaCache(person, patch));
        } catch (err) {
          errores++;
          console.error(`  error en registro ${person.id}: ${err.message}`);
        }
      }

      try {
        await upsertClientes(pool, filas);
      } catch (err) {
        // Si el lote falla (ej. un registro con datos inválidos), se reintenta
        // fila por fila para no perder el resto de la página.
        console.error(`  error en upsert por lote, reintentando por fila: ${err.message}`);
        for (const fila of filas) {
          try {
            await upsertClientes(pool, [fila]);
          } catch (filaErr) {
            errores++;
            console.error(`  error cacheando ${fila[0]}: ${filaErr.message}`);
          }
        }
      }

      if (onProgress) onProgress(page, { escaneados, modificados, errores });

      if (!pageInfo.hasNextPage) break;
      if (maxPages && page >= maxPages) {
        // Quedaron registros sin revisar: la corrida no sirve como punto de partida
        // de la próxima incremental (si no, esos registros se saltarían para siempre).
        parcial = true;
        break;
      }
      cursor = pageInfo.endCursor;
    }

    // Si no es dry_run, procesar cualquier actualización pendiente en la cola de contingencia
    if (mode !== "dry_run") {
      await procesarReintentosTwenty(pool);
    }

    await pool.query(
      `update sync_runs set finalizado_en = now(), registros_escaneados = $2,
       registros_modificados = $3, errores = $4, estado = 'completado', parcial = $5 where id = $1`,
      [syncRunId, escaneados, modificados, errores, parcial]
    );

    return { syncRunId, escaneados, modificados, errores, parcial, estado: "completado" };
  } catch (err) {
    await pool.query(
      `update sync_runs set finalizado_en = now(), registros_escaneados = $2,
       registros_modificados = $3, errores = $4, estado = 'fallido' where id = $1`,
      [syncRunId, escaneados, modificados, errores]
    );
    throw err;
  }
}

module.exports = { runSync, VALID_MODES, procesarReintentosTwenty, MAX_INTENTOS_TWENTY };
