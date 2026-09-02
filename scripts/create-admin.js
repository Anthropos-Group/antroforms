// Bootstrap del primer administrador (los siguientes se crean desde /admin/administradores).
// Uso: node scripts/create-admin.js --nombre="Ana Perez" --email=ana@empresa.com --password=algoseguro
require("dotenv").config();
const { getPool } = require("../lib/db");
const { hashPassword } = require("../lib/auth");

const arg = (name) => {
  const found = process.argv.find((a) => a.startsWith(`--${name}=`));
  return found ? found.split("=").slice(1).join("=") : null;
};

const nombre = arg("nombre");
const email = arg("email");
const password = arg("password");

if (!nombre || !email || !password) {
  console.error(
    'Uso: node scripts/create-admin.js --nombre="Ana Perez" --email=ana@empresa.com --password=algoseguro'
  );
  process.exit(1);
}

async function main() {
  const pool = getPool();
  const passwordHash = hashPassword(password);
  const { rows } = await pool.query(
    `insert into administradores (nombre, email, password_hash)
     values ($1, $2, $3)
     on conflict (email) do update set password_hash = excluded.password_hash, nombre = excluded.nombre
     returning id, nombre, email`,
    [nombre, email.toLowerCase(), passwordHash]
  );
  console.log("Administrador listo:", rows[0]);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
