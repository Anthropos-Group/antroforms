const { Pool } = require("pg");

let pool;

function getPool() {
  if (!pool) {
    if (!process.env.SUPABASE_DB_URL) {
      throw new Error("Falta SUPABASE_DB_URL en .env");
    }
    pool = new Pool({
      connectionString: process.env.SUPABASE_DB_URL,
      ssl: { rejectUnauthorized: false },
    });
  }
  return pool;
}

module.exports = { getPool };
