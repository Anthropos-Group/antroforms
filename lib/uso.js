// Uso del proyecto de Supabase frente a los límites del plan, para saber con
// tiempo cuándo hay que pasar de plan. Se mide desde la propia base (lo que no se
// puede medir desde SQL, como el tráfico de salida, se revisa en el panel de Supabase).

// Límites del plan Free de Supabase (por proyecto).
const PLAN = {
  nombre: "Free",
  baseDatosBytes: 500 * 1024 * 1024,
  egresoBytesMes: 5 * 1024 * 1024 * 1024,
  diasInactividadPausa: 7,
};

// Tablas que crecen con la operación y qué guardan.
const DESCRIPCION_TABLAS = {
  clientes_cache: "Copia local de clientes de Twenty (incluye el registro completo)",
  sync_changes: "Auditoría de cada corrección hecha en Twenty por la limpieza",
  respuestas: "Respuestas de cada encuesta",
  encuestas: "Encuestas registradas",
  sync_runs: "Historial de corridas de sincronización",
  pending_twenty_sync: "Cola de estados pendientes hacia Twenty",
};

function nivel(porcentaje) {
  if (porcentaje >= 80) return "critico";
  if (porcentaje >= 60) return "atencion";
  return "ok";
}

async function usoSupabase(pool) {
  const [{ rows: base }, { rows: tablas }, { rows: crecimiento }] = await Promise.all([
    pool.query(
      `select pg_database_size(current_database())::bigint as bytes,
              current_setting('max_connections')::int as max_conexiones,
              (select count(*)::int from pg_stat_activity where datname = current_database()) as conexiones,
              (select xact_commit::bigint from pg_stat_database where datname = current_database()) as transacciones`
    ),
    pool.query(
      // Conteo exacto por tabla (las estadísticas de Postgres no existen en tablas chicas
      // nunca analizadas).
      `select c.relname as tabla, pg_total_relation_size(c.oid)::bigint as bytes,
              (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from public.%I', c.relname), false, true, '')))[1]::text::bigint as filas
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r'
       order by pg_total_relation_size(c.oid) desc
       limit 10`
    ),
    // Lo que entró en los últimos 30 días, para proyectar el crecimiento mensual.
    pool.query(
      `select
         (select count(*)::int from encuestas where created_at > now() - interval '30 days') as encuestas,
         (select count(*)::int from encuestas) as encuestas_total,
         (select count(*)::int from sync_changes where created_at > now() - interval '30 days') as cambios,
         (select count(*)::int from sync_changes) as cambios_total,
         (select count(*)::int from clientes_cache
          where coalesce(case when raw->>'createdAt' ~ '^\\d{4}-\\d{2}-\\d{2}' then (raw->>'createdAt')::timestamptz end, synced_at)
                > now() - interval '30 days') as clientes,
         (select count(*)::int from clientes_cache) as clientes_total`
    ),
  ]);

  const b = base[0];
  const c = crecimiento[0];
  const tamano = (nombre) => Number(tablas.find((t) => t.tabla === nombre)?.bytes || 0);
  const porFila = (bytes, filas) => (filas > 0 ? bytes / filas : 0);

  // Crecimiento estimado por mes = lo que entró en 30 días × lo que pesa cada fila hoy.
  const bytesMes = Math.round(
    c.encuestas * porFila(tamano("encuestas") + tamano("respuestas"), c.encuestas_total) +
      c.clientes * porFila(tamano("clientes_cache"), c.clientes_total) +
      c.cambios * porFila(tamano("sync_changes"), c.cambios_total)
  );
  const bytesUsados = Number(b.bytes);
  const porcentajeBase = Math.round((bytesUsados / PLAN.baseDatosBytes) * 1000) / 10;
  const mesesRestantes = bytesMes > 0 ? Math.max(0, (PLAN.baseDatosBytes - bytesUsados) / bytesMes) : null;
  const porcentajeConexiones = Math.round((b.conexiones / b.max_conexiones) * 1000) / 10;

  const keepAlive = globalThis[Symbol.for("antroforms.programador")]?.ultimoKeepAlive || null;

  return {
    plan: PLAN,
    baseDatos: {
      bytes: bytesUsados,
      limite: PLAN.baseDatosBytes,
      porcentaje: porcentajeBase,
      nivel: nivel(porcentajeBase),
      crecimientoMensualBytes: bytesMes,
      mesesRestantes: mesesRestantes === null ? null : Math.round(mesesRestantes * 10) / 10,
    },
    conexiones: {
      usadas: b.conexiones,
      maximo: b.max_conexiones,
      porcentaje: porcentajeConexiones,
      nivel: nivel(porcentajeConexiones),
      poolApp: Number(process.env.PG_POOL_MAX) || 10,
    },
    actividad: {
      transacciones: Number(b.transacciones),
      ultimos30Dias: { encuestas: c.encuestas, clientesNuevos: c.clientes, correccionesTwenty: c.cambios },
      ultimoKeepAlive: keepAlive ? new Date(keepAlive).toISOString() : null,
    },
    tablas: tablas.map((t) => ({
      tabla: t.tabla,
      bytes: Number(t.bytes),
      filas: Number(t.filas),
      descripcion: DESCRIPCION_TABLAS[t.tabla] || "",
    })),
  };
}

module.exports = { usoSupabase, PLAN };
