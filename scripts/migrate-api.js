// Aplica las migraciones vía la Management API de Supabase (HTTPS), para
// entornos donde el puerto 5432 de Postgres está bloqueado.
// Misma semántica que scripts/migrate.js: cada archivo se aplica una sola vez
// y queda registrado en la tabla _migrations, dentro de una transacción.
//
// Uso: SUPABASE_ACCESS_TOKEN=sbp_... SUPABASE_PROJECT_REF=abcd... node scripts/migrate-api.js [--dry-run]
try {
  require("dotenv").config();
} catch {
  // sin dotenv instalado (imagen de producción)
}
const fs = require("fs");
const path = require("path");

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const REF = process.env.SUPABASE_PROJECT_REF;
const DRY_RUN = process.argv.includes("--dry-run");

async function query(sql) {
  const res = await fetch(`${process.env.SUPABASE_API_URL || "https://api.supabase.com"}/v1/projects/${REF}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });
  const texto = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${texto.slice(0, 500)}`);
  return texto ? JSON.parse(texto) : [];
}

const literal = (s) => `'${String(s).replace(/'/g, "''")}'`;

async function main() {
  if (!TOKEN || !REF) {
    console.error("Faltan SUPABASE_ACCESS_TOKEN y/o SUPABASE_PROJECT_REF en el entorno.");
    process.exit(1);
  }

  const dir = path.join(__dirname, "..", "supabase", "migrations");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();

  await query(`create table if not exists _migrations (
    filename text primary key,
    applied_at timestamptz not null default now()
  );`);
  const aplicadas = new Set((await query("select filename from _migrations")).map((r) => r.filename));

  const pendientes = files.filter((f) => !aplicadas.has(f));
  for (const f of files) if (aplicadas.has(f)) console.log(`skip (ya aplicada): ${f}`);
  if (pendientes.length === 0) {
    console.log("Migraciones al día.");
    return;
  }

  for (const file of pendientes) {
    if (DRY_RUN) {
      console.log(`pendiente: ${file}`);
      continue;
    }
    const sql = fs.readFileSync(path.join(dir, file), "utf8");
    console.log(`aplicando: ${file}`);
    // Un solo request = una transacción: si algo falla, no queda a medias ni registrada.
    await query(`begin;\n${sql}\n;\ninsert into _migrations (filename) values (${literal(file)});\ncommit;`);
    console.log("  ok");
  }
  console.log(DRY_RUN ? "(dry-run: no se aplicó nada)" : "Migraciones al día.");
}

main().catch((err) => {
  console.error("Fallo:", err.message);
  process.exit(1);
});
