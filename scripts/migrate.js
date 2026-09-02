require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

async function main() {
  const connectionString = process.env.SUPABASE_DB_URL;
  if (!connectionString) {
    console.error("Falta SUPABASE_DB_URL en .env");
    process.exit(1);
  }

  const dir = path.join(__dirname, "..", "supabase", "migrations");
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
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
        console.log(`skip (ya aplicada): ${file}`);
        continue;
      }

      const sql = fs.readFileSync(path.join(dir, file), "utf8");
      console.log(`aplicando: ${file}`);
      await client.query("begin");
      try {
        await client.query(sql);
        await client.query("insert into _migrations (filename) values ($1)", [file]);
        await client.query("commit");
        console.log(`  ok`);
      } catch (err) {
        await client.query("rollback");
        throw new Error(`fallo en ${file}: ${err.message}`);
      }
    }

    console.log("Migraciones al día.");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
