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

// Una corrida que lleva este tiempo "en_progreso" sin latido (sin terminar una
// página) murió a mitad de camino (reinicio del contenedor): se marca fallida.
const MINUTOS_CORRIDA_HUERFANA = 15;

// La migración 0010 agrega sync_runs.detalle y sync_runs.actualizado_en. Mientras
// no se aplique, la sincronización sigue funcionando sin esas columnas.
const COLUMNA_INEXISTENTE = "42703";

async function reservarCorrida(pool, mode) {
  try {
    await pool.query(
      `update sync_runs set estado = 'fallido', finalizado_en = now()
       where estado = 'en_progreso'
         and coalesce(actualizado_en, iniciado_en) < now() - make_interval(mins => $1)`,
      [MINUTOS_CORRIDA_HUERFANA]
    );
  } catch (err) {
    if (err.code !== COLUMNA_INEXISTENTE) throw err;
    await pool.query(
      `update sync_runs set estado = 'fallido', finalizado_en = now()
       where estado = 'en_progreso' and iniciado_en < now() - make_interval(mins => $1)`,
      [MINUTOS_CORRIDA_HUERFANA]
    );
  }
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

// Máximo de mensajes de error por registro que se guardan en sync_runs.detalle.
const MAX_ERRORES_DETALLE = 10;

// Reserva la corrida (una sola a la vez) y calcula el punto de partida.
async function prepararCorrida(mode) {
  if (!VALID_MODES.includes(mode)) {
    throw new Error(`Modo inválido: ${mode}. Usa uno de: ${VALID_MODES.join(", ")}`);
  }
  const pool = getPool();
  const updatedSince = mode === "incremental" ? await getUltimoSyncExitoso(pool) : null;
  const syncRunId = await reservarCorrida(pool, mode);
  return { pool, syncRunId, updatedSince };
}

// mode: 'dry_run' | 'incremental' | 'backfill_completo'
// onProgress(pageNumber, { escaneados, modificados }) opcional, para logging del caller.
async function runSync({ mode = "dry_run", pageSize = 100, maxPages = null, onProgress } = {}) {
  const corrida = await prepararCorrida(mode);
  return procesarCorrida({ ...corrida, mode, pageSize, maxPages, onProgress });
}

// Igual que runSync pero sin esperar a que termine: devuelve el id de la corrida
// en cuanto queda reservada. Una corrida grande tarda varios minutos y el request
// HTTP que la dispara (botón del panel, cron externo) se cortaría antes — Cloudflare
// corta a los 100 s —, así que el avance se consulta en sync_runs.
async function iniciarSync({ mode = "incremental", pageSize = 100, maxPages = null } = {}) {
  const corrida = await prepararCorrida(mode);
  procesarCorrida({ ...corrida, mode, pageSize, maxPages }).catch((err) => {
    console.error(`Sincronización ${corrida.syncRunId} (${mode}) falló:`, err.message);
  });
  return { syncRunId: corrida.syncRunId };
}

async function cerrarCorrida(pool, syncRunId, { estado, escaneados, modificados, errores, parcial, detalle }) {
  const valores = [syncRunId, escaneados, modificados, errores, estado, parcial];
  try {
    await pool.query(
      `update sync_runs set finalizado_en = now(), registros_escaneados = $2, registros_modificados = $3,
       errores = $4, estado = $5, parcial = $6, detalle = $7 where id = $1`,
      [...valores, detalle]
    );
  } catch (err) {
    if (err.code !== COLUMNA_INEXISTENTE) throw err;
    await pool.query(
      `update sync_runs set finalizado_en = now(), registros_escaneados = $2, registros_modificados = $3,
       errores = $4, estado = $5, parcial = $6 where id = $1`,
      valores
    );
  }
}

async function procesarCorrida({ pool, syncRunId, updatedSince, mode, pageSize, maxPages, onProgress }) {
  let escaneados = 0;
  let modificados = 0;
  let errores = 0;
  let cursor;
  let page = 0;
  let parcial = false;
  const detalleErrores = [];
  const anotarError = (id, err) => {
    errores++;
    if (detalleErrores.length < MAX_ERRORES_DETALLE) detalleErrores.push(`${id}: ${err.message}`.slice(0, 300));
  };

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
          anotarError(person.id, err);
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
            anotarError(fila[0], filaErr);
            console.error(`  error cacheando ${fila[0]}: ${filaErr.message}`);
          }
        }
      }

      await pool
        .query(
          `update sync_runs set registros_escaneados = $2, registros_modificados = $3, errores = $4,
           actualizado_en = now() where id = $1`,
          [syncRunId, escaneados, modificados, errores]
        )
        .catch((err) =>
          pool.query(
            `update sync_runs set registros_escaneados = $2, registros_modificados = $3, errores = $4 where id = $1`,
            [syncRunId, escaneados, modificados, errores]
          ).catch(() => console.warn("No se pudo registrar el avance de la sincronización:", err.message))
        );

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

    await cerrarCorrida(pool, syncRunId, {
      estado: "completado",
      escaneados,
      modificados,
      errores,
      parcial,
      detalle: detalleErrores.join("\n") || null,
    });

    return { syncRunId, escaneados, modificados, errores, parcial, estado: "completado" };
  } catch (err) {
    await cerrarCorrida(pool, syncRunId, {
      estado: "fallido",
      escaneados,
      modificados,
      errores,
      parcial: false,
      detalle: [err.message, ...detalleErrores].join("\n").slice(0, 4000),
    }).catch((qErr) => console.error("No se pudo registrar el fallo de la sincronización:", qErr.message));
    throw err;
  }
}

module.exports = { runSync, iniciarSync, VALID_MODES, procesarReintentosTwenty, MAX_INTENTOS_TWENTY };
