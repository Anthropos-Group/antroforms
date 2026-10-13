const { computeChanges } = require("./normalize");

function normalizedNombre(person, patch) {
  const first = patch.name?.firstName ?? person.name?.firstName ?? "";
  const last = patch.name?.lastName ?? person.name?.lastName ?? "";
  return [first, last].filter(Boolean).join(" ").trim();
}

// Convierte un registro `people` de Twenty en la fila de clientes_cache, aplicando
// las mismas reglas de limpieza que el cron (así la búsqueda en vivo no mete
// datos "sucios" en la caché aunque el cron todavía no haya corrido).
function filaCache(person, patch = computeChanges(person).patch) {
  return [
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
  ];
}

// Upsert en lote. Si el cliente tiene un cambio de estado pendiente de enviar a
// Twenty (cola pending_twenty_sync), se conserva el estado local: de lo contrario
// la próxima búsqueda/sync traería el estado viejo de Twenty y, por ejemplo, un
// cliente que pidió NO_LLAMAR volvería a aparecer en el buscador.
//
// Concurrencia: el refresco, la limpieza nocturna y la apertura de clientes escriben
// a la vez. Las filas van ordenadas por id para que dos lotes que se cruzan tomen
// los candados en el mismo orden (sin el orden, Postgres aborta uno por deadlock).
// Una fila que no cambió no se reescribe: el refresco relee cada pasada lo
// modificado en el solape, y reescribir el JSON completo gasta disco sin motivo.
async function upsertClientes(db, filas) {
  if (!filas.length) return;
  // Un mismo id no puede aparecer dos veces en un INSERT ... ON CONFLICT.
  const unicas = [...new Map(filas.map((f) => [f[0], f])).values()].sort((a, b) =>
    String(a[0]).localeCompare(String(b[0]))
  );

  const valores = [];
  const placeholders = unicas.map((fila) => {
    const base = valores.length;
    valores.push(...fila);
    const ps = fila.map((_, i) => `$${base + i + 1}`);
    return `(${ps.slice(0, 11).join(",")}, now(), ${ps[11]})`;
  });

  await db.query(
    `insert into clientes_cache
       (id_twenty, codigo_cliente, nombre, pdv, mes_gestion, id_edimca, status, telefono1, total, fecha_atencion, etiqueta, synced_at, raw)
     values ${placeholders.join(", ")}
     on conflict (id_twenty) do update set
       codigo_cliente = excluded.codigo_cliente,
       nombre = excluded.nombre,
       pdv = excluded.pdv,
       mes_gestion = excluded.mes_gestion,
       id_edimca = excluded.id_edimca,
       status = case
         when exists (select 1 from pending_twenty_sync p where p.cliente_twenty_id = excluded.id_twenty)
           then clientes_cache.status
         else excluded.status
       end,
       telefono1 = excluded.telefono1,
       total = excluded.total,
       fecha_atencion = excluded.fecha_atencion,
       etiqueta = excluded.etiqueta,
       synced_at = now(),
       raw = excluded.raw
     where (clientes_cache.codigo_cliente, clientes_cache.nombre, clientes_cache.pdv, clientes_cache.mes_gestion,
            clientes_cache.id_edimca, clientes_cache.status, clientes_cache.telefono1, clientes_cache.total,
            clientes_cache.fecha_atencion, clientes_cache.etiqueta, clientes_cache.raw)
       is distinct from
           (excluded.codigo_cliente, excluded.nombre, excluded.pdv, excluded.mes_gestion,
            excluded.id_edimca, excluded.status, excluded.telefono1, excluded.total,
            excluded.fecha_atencion, excluded.etiqueta, excluded.raw)`,
    valores
  );
}

module.exports = { filaCache, upsertClientes, normalizedNombre };
