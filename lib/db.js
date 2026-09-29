const { Pool } = require("pg");

// Se cachea en globalThis para que el hot-reload de `next dev` no abra un pool
// nuevo en cada recompilación (en producción es un singleton normal).
const GLOBAL_KEY = Symbol.for("antroforms.pgPool");

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
    const pool = new Pool({
      connectionString: process.env.SUPABASE_DB_URL,
      ssl: sslConfig(process.env.SUPABASE_DB_URL),
      max: Number(process.env.PG_POOL_MAX) || 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
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
