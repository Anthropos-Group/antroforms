const { getPool } = require("./db");
const { fetchPeoplePage, patchPerson } = require("./twenty");
const { computeChanges } = require("./normalize");

const VALID_MODES = ["dry_run", "incremental", "backfill_completo"];

async function getUltimoSyncExitoso(pool) {
  const { rows } = await pool.query(
    `select iniciado_en from sync_runs
     where estado = 'completado' and tipo in ('incremental', 'backfill_completo')
     order by iniciado_en desc limit 1`
  );
  return rows[0]?.iniciado_en ?? null;
}

function normalizedNombre(person, patch) {
  const first = patch.name?.firstName ?? person.name?.firstName ?? "";
  const last = patch.name?.lastName ?? person.name?.lastName ?? "";
  return [first, last].filter(Boolean).join(" ").trim();
}

async function upsertCache(pool, person, patch) {
  await pool.query(
    `insert into clientes_cache
       (id_twenty, codigo_cliente, nombre, pdv, mes_gestion, id_edimca, status, telefono1, total, fecha_atencion, etiqueta, synced_at, raw)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, now(), $12)
     on conflict (id_twenty) do update set
       codigo_cliente = excluded.codigo_cliente,
       nombre = excluded.nombre,
       pdv = excluded.pdv,
       mes_gestion = excluded.mes_gestion,
       id_edimca = excluded.id_edimca,
       status = excluded.status,
       telefono1 = excluded.telefono1,
       total = excluded.total,
       fecha_atencion = excluded.fecha_atencion,
       etiqueta = excluded.etiqueta,
       synced_at = now(),
       raw = excluded.raw`,
    [
      person.id,
      person.codigoCliente ?? null,
      normalizedNombre(person, patch),
      patch.nombrePuntoVenta ?? person.nombrePuntoVenta ?? null,
      person.mesGestion ?? null,
      person.idEdimca ?? null,
      person.status ?? null,
      patch.telefono1 ?? person.telefono1 ?? null,
      patch.total ?? person.total ?? null,
      person.djulfechaRpdivj ?? null,
      patch.etiqueta ?? person.etiqueta ?? null,
      JSON.stringify(person),
    ]
  );
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

  const { rows: runRows } = await pool.query(
    `insert into sync_runs (tipo, estado) values ($1, 'en_progreso') returning id`,
    [mode]
  );
  const syncRunId = runRows[0].id;

  let escaneados = 0;
  let modificados = 0;
  let errores = 0;
  let cursor;
  let page = 0;

  try {
    while (true) {
      page++;
      const { people, pageInfo } = await fetchPeoplePage({
        cursor,
        limit: pageSize,
        updatedSince: updatedSince ? new Date(updatedSince).toISOString() : null,
      });

      for (const person of people) {
        escaneados++;
        try {
          const { changes, patch } = computeChanges(person);
          const hasChanges = Object.keys(changes).length > 0;

          if (hasChanges) {
            modificados++;
            for (const [campo, { before, after }] of Object.entries(changes)) {
              await pool.query(
                `insert into sync_changes (sync_run_id, id_twenty, campo, valor_antes, valor_despues)
                 values ($1, $2, $3, $4, $5)`,
                [syncRunId, person.id, campo, before ?? null, after ?? null]
              );
            }
            if (mode !== "dry_run") {
              await patchPerson(person.id, patch);
            }
          }

          // Cachear no escribe en Twenty, así que se hace siempre (incluso en dry_run) —
          // es lo que alimenta el buscador de clientes de la app.
          await upsertCache(pool, person, patch);
        } catch (err) {
          errores++;
          console.error(`  error en registro ${person.id}: ${err.message}`);
        }
      }

      if (onProgress) onProgress(page, { escaneados, modificados, errores });

      if (!pageInfo.hasNextPage) break;
      if (maxPages && page >= maxPages) break;
      cursor = pageInfo.endCursor;
    }

    await pool.query(
      `update sync_runs set finalizado_en = now(), registros_escaneados = $2,
       registros_modificados = $3, errores = $4, estado = 'completado' where id = $1`,
      [syncRunId, escaneados, modificados, errores]
    );

    return { syncRunId, escaneados, modificados, errores, estado: "completado" };
  } catch (err) {
    await pool.query(
      `update sync_runs set finalizado_en = now(), registros_escaneados = $2,
       registros_modificados = $3, errores = $4, estado = 'fallido' where id = $1`,
      [syncRunId, escaneados, modificados, errores]
    );
    throw err;
  }
}

module.exports = { runSync, VALID_MODES };
