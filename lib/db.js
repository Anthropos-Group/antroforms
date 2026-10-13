const { Pool } = require("pg");

// Se cachea en globalThis para que el hot-reload de `next dev` no abra un pool
// nuevo en cada recompilación (en producción es un singleton normal).
const GLOBAL_KEY = Symbol.for("antroforms.pgPool");
const STATEMENT_TIMEOUT_DEFAULT_MS = 60_000;

// Supabase exige SSL. Para un Postgres local/interno sin SSL basta con agregar
// `?sslmode=disable` a SUPABASE_DB_URL.
function sslConfig(connectionString) {
  return /[?&]sslmode=disable\b/.test(connectionString || "") ? false : { rejectUnauthorized: false };
}

function getPool() {
  if (!globalThis[GLOBAL_KEY]) {
    if (!process.env.SUPABASE_DB_URL) {
      throw new Error("Falta SUPABASE_DB_URL en .env");
    }
    // Tope por consulta en el servidor: una consulta trabada (base saturada, candado)
    // devuelve error en vez de retener la conexión del pool indefinidamente. Se fija
    // por sesión al abrir cada conexión (compatible con el Session pooler); onConnect
    // se espera antes de entregar la conexión.
    const topeMs = Number(process.env.PG_STATEMENT_TIMEOUT_MS ?? STATEMENT_TIMEOUT_DEFAULT_MS);
    const pool = new Pool({
      connectionString: process.env.SUPABASE_DB_URL,
      ssl: sslConfig(process.env.SUPABASE_DB_URL),
      max: Number(process.env.PG_POOL_MAX) || 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
      // Detecta conexiones muertas por un corte de red o del pooler: sin keep-alive,
      // una consulta sobre una conexión caída queda colgada sin error.
      keepAlive: true,
      keepAliveInitialDelayMillis: 10_000,
      onConnect:
        Number.isInteger(topeMs) && topeMs > 0
          ? (client) =>
              client.query(`set statement_timeout = ${topeMs}`).catch((err) => {
                // Sin tope sigue funcionando: no se bloquea la conexión por esto.
                console.error("No se pudo fijar statement_timeout:", err.message);
              })
          : undefined,
    });
    // Sin este handler, un corte de una conexión inactiva (reinicio del pooler de
    // Supabase, red) emite 'error' sin listener y tumba todo el proceso de Node.
    pool.on("error", (err) => {
      console.error("Error en conexión inactiva de PostgreSQL:", err.message);
    });
    globalThis[GLOBAL_KEY] = pool;
  }
  return globalThis[GLOBAL_KEY];
}

module.exports = { getPool, sslConfig };
