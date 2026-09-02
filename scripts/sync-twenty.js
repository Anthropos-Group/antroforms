require("dotenv").config();
const { runSync } = require("../lib/sync");
const { getPool } = require("../lib/db");

const arg = (name, def) => {
  const found = process.argv.find((a) => a.startsWith(`--${name}=`));
  return found ? found.split("=")[1] : def;
};

const mode = arg("mode", "dry_run");
const pageSize = Number(arg("page-size", 100));
const maxPages = arg("max-pages") ? Number(arg("max-pages")) : null;

runSync({
  mode,
  pageSize,
  maxPages,
  onProgress: (page, { escaneados, modificados, errores }) => {
    console.log(
      `  página ${page}: acumulado ${escaneados} escaneados, ${modificados} con cambios, ${errores} errores`
    );
  },
})
  .then((result) => {
    console.log(
      `\nSync (${mode}) completo: ${result.escaneados} escaneados, ${result.modificados} con cambios, ${result.errores} errores. sync_run_id=${result.syncRunId}`
    );
  })
  .catch((err) => {
    console.error("Sync fallido:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await getPool().end();
  });
