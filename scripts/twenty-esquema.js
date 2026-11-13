// Crea en el Twenty del cliente los campos personalizados de `person` que pide su
// configuración (tenants/<TENANT>.js → esquemaTwenty). Solo agrega los que faltan:
// no modifica ni borra campos existentes.
//
//   TENANT=coop23dejulio node scripts/twenty-esquema.js            (solo muestra el plan)
//   TENANT=coop23dejulio node scripts/twenty-esquema.js --aplicar  (crea los campos)
//
// Requiere TWENTY_API_URL (…/rest) y TWENTY_API_KEY.
try {
  require("dotenv").config();
} catch {
  // sin dotenv instalado (imagen de producción)
}
const { tenant } = require("../lib/tenant");

const APLICAR = process.argv.includes("--aplicar");

function base() {
  const url = (process.env.TWENTY_API_URL || "").replace(/\/+$/, "");
  if (!url) throw new Error("Falta TWENTY_API_URL (ej. https://tu-twenty/rest)");
  return url;
}

async function api(path, { method = "GET", body } = {}) {
  const res = await fetch(`${base()}${path}`, {
    method,
    headers: { Authorization: `Bearer ${process.env.TWENTY_API_KEY || ""}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const texto = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${texto.slice(0, 300)}`);
  return texto ? JSON.parse(texto) : {};
}

function cuerpoCampo(objectMetadataId, c) {
  const cuerpo = {
    objectMetadataId,
    type: c.type,
    name: c.name,
    label: c.label,
    icon: c.icon,
    isNullable: true,
  };
  if (c.type === "SELECT") {
    cuerpo.options = c.opciones.map(([value, label, color], position) => ({ value, label, color, position }));
  }
  if (c.defaultValue !== undefined) cuerpo.defaultValue = c.defaultValue;
  return cuerpo;
}

async function main() {
  const config = tenant();
  const esquema = config.esquemaTwenty || [];
  console.log(`Cliente: ${config.nombre} · Twenty: ${base()}`);
  if (!esquema.length) {
    console.log("Este cliente no define campos para Twenty. Nada que hacer.");
    return;
  }
  const { data } = await api("/metadata/objects?limit=200");
  const objetos = Array.isArray(data) ? data : data?.objects || [];
  const person = objetos.find((o) => o.nameSingular === "person");
  if (!person) throw new Error("No se encontró el objeto person en Twenty");
  const existentes = new Map((person.fields || []).map((f) => [f.name, f]));

  const faltan = [];
  for (const c of esquema) {
    const actual = existentes.get(c.name);
    if (!actual) faltan.push(c);
    else if (actual.type !== c.type) console.warn(`⚠ ${c.name} existe como ${actual.type}, se esperaba ${c.type} (no se toca)`);
    else console.log(`= ${c.name} ya existe`);
  }
  for (const c of faltan) console.log(`+ ${c.name} (${c.type}) — ${c.label}`);
  if (!faltan.length) return console.log("Todos los campos ya existen.");
  if (!APLICAR) return console.log(`\n${faltan.length} campos por crear. Repite con --aplicar para crearlos.`);

  for (const c of faltan) {
    await api("/metadata/fields", { method: "POST", body: cuerpoCampo(person.id, c) });
    console.log(`✓ creado ${c.name}`);
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
