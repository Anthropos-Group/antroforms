// dotenv es opcional: dentro del contenedor las variables ya vienen del entorno.
try {
  require("dotenv").config();
} catch {
  // sin dotenv instalado (imagen de producción)
}
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");
const { sslConfig } = require("../lib/db");
const { tenant } = require("../lib/tenant");

async function migrar({ log = console.log } = {}) {
  const connectionString = process.env.SUPABASE_DB_URL;
  if (!connectionString) throw new Error("Falta SUPABASE_DB_URL en .env");

  const dir = path.join(__dirname, "..", "supabase", "migrations");
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  // Migraciones con datos de otro cliente (p. ej. el cuestionario de EDIMCA).
  const omitidas = new Set(tenant().migracionesOmitidas || []);
  log(`Cliente: ${tenant().nombre}`);

  const client = new Client({ connectionString, ssl: sslConfig(connectionString) });
  await client.connect();

  try {
    await client.query(`
      create table if not exists _migrations (
        filename text primary key,
        applied_at timestamptz not null default now()
      );
    `);

    for (const file of files) {
      const { rows } = await client.query(
        "select 1 from _migrations where filename = $1",
        [file]
      );
      if (rows.length > 0) {
        log(`skip (ya aplicada): ${file}`);
        continue;
      }

      if (omitidas.has(file)) {
        log(`omitida para ${tenant().id}: ${file}`);
        continue;
      }

      const sql = fs.readFileSync(path.join(dir, file), "utf8");
      log(`aplicando: ${file}`);
      await client.query("begin");
      try {
        await client.query(sql);
        await client.query("insert into _migrations (filename) values ($1)", [file]);
        await client.query("commit");
        log(`  ok`);
      } catch (err) {
        await client.query("rollback");
        throw new Error(`fallo en ${file}: ${err.message}`);
      }
    }

    log("Migraciones al día.");
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  migrar().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { migrar };
