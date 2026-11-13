// Arranque del contenedor: prepara la base y luego levanta la app (server.js).
//
// En cada arranque, y sin borrar nada:
//   1. Aplica las migraciones pendientes (las ya aplicadas se saltan).
//   2. Si el cliente tiene cuestionario propio (tenants/<TENANT>.cuestionario.js)
//      y todavía no está cargado, lo carga. Si ya está, no lo toca.
//   3. Si vienen ADMIN_EMAIL y ADMIN_PASSWORD y ese administrador no existe, lo
//      crea. Si ya existe, no cambia su contraseña (la que puso desde el panel manda).
//   4. Si no hay ningún encuestador, crea "Encuestador de prueba".
//
// Si algo falla se registra y la app arranca igual (no se tumba un cliente que ya
// funciona por un problema de la base). AUTO_SETUP=off lo desactiva.
const fs = require("fs");
const path = require("path");

const log = (...a) => console.log("[arranque]", ...a);

async function prepararBase() {
  const { getPool } = require("../lib/db");
  const { migrar } = require("./migrate");
  const { cargarCuestionario, archivoCuestionario } = require("./cargar-cuestionario");

  await migrar({ log });

  if (fs.existsSync(archivoCuestionario())) {
    await cargarCuestionario({ soloSiFalta: true, log });
  }

  const pool = getPool();
  const email = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || "";
  if (email && password) {
    const { hashPassword } = require("../lib/auth");
    const { rowCount } = await pool.query(
      `insert into administradores (nombre, email, password_hash)
       values ($1, $2, $3)
       on conflict (email) do nothing`,
      [process.env.ADMIN_NOMBRE || "Administrador", email, hashPassword(password)]
    );
    log(rowCount ? `administrador creado: ${email}` : `administrador ${email} ya existe; no se cambia.`);
  }

  const { rows } = await pool.query("select count(*)::int as n from encuestadores");
  if (rows[0].n === 0) {
    await pool.query(`insert into encuestadores (nombre) values ('Encuestador de prueba')`);
    log('encuestador creado: "Encuestador de prueba"');
  }
}

async function main() {
  if (process.env.AUTO_SETUP === "off") {
    log("AUTO_SETUP=off: no se prepara la base.");
  } else if (!process.env.SUPABASE_DB_URL) {
    log("falta SUPABASE_DB_URL: no se prepara la base.");
  } else {
    try {
      await prepararBase();
      log("base lista.");
    } catch (err) {
      console.error("[arranque] No se pudo preparar la base:", err.message);
    }
  }
  require(path.join(__dirname, "..", "server.js"));
}

main();
