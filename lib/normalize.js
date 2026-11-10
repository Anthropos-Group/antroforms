// Reglas de limpieza fijas — ver docs/TRD.md §4.
// Cada función es pura: recibe el valor crudo, devuelve el valor limpio.

function normalizeText(value) {
  if (typeof value !== "string") return value;
  return value.trim().replace(/\s+/g, " ");
}

// Campos de texto que a veces traen el string literal "NULL" o "N/A" en vez de
// estar realmente vacíos (herencia de la carga de ancho fijo). "total" importa
// especialmente porque de él depende una regla de negocio (ver pregunta de
// "piezas cortadas y laminadas" — solo se activa si el cliente tiene dato ahí).
function normalizeNullable(value) {
  if (typeof value !== "string") return value;
  const upper = value.trim().toUpperCase();
  if (upper === "NULL" || upper === "N/A" || upper === "NA") return "";
  return value;
}

// "total" es un número. Excel guarda las fechas como el número de días desde el
// 30/12/1899; si en el archivo de carga la celda quedó con formato fecha, el número
// llega a Twenty escrito como fecha ("4" → "3/01/1900", "1" → "31/12/1899"). Una fecha
// de esos años no es una fecha real de cliente: se devuelve al número original.
// Más allá de 1930 (serial ~11 000) se deja tal cual: ahí ya podría ser una fecha real.
const DIA_MS = 86_400_000;
const BASE_SERIAL_EXCEL_MS = Date.UTC(1899, 11, 30);
const ANIO_MAX_SERIAL = 1930;

function normalizeTotal(value) {
  const limpio = normalizeNullable(value);
  if (typeof limpio !== "string") return limpio;
  const m = /^\s*(\d{1,2})[/-](\d{1,2})[/-](\d{4})\s*$/.exec(limpio);
  if (!m) return limpio;
  const [dia, mes, anio] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (anio < 1899 || anio > ANIO_MAX_SERIAL) return limpio;
  const ms = Date.UTC(anio, mes - 1, dia);
  const fecha = new Date(ms);
  // Descarta fechas imposibles como 31/02.
  if (fecha.getUTCFullYear() !== anio || fecha.getUTCMonth() !== mes - 1 || fecha.getUTCDate() !== dia) return limpio;
  return String(Math.round((ms - BASE_SERIAL_EXCEL_MS) / DIA_MS));
}

// Normalización de números telefónicos (Ecuador: celulares 09XXXXXXXX, fijos con código de provincia)
function normalizePhone(value) {
  if (typeof value !== "string") return value;
  const nullable = normalizeNullable(value);
  if (!nullable) return "";

  // Extraer únicamente los dígitos numéricos
  let digits = nullable.replace(/\D/g, "");
  if (!digits) return "";

  // Si incluye código de país 593 al inicio
  if (digits.startsWith("593")) {
    digits = digits.slice(3);
    if (!digits.startsWith("0")) {
      digits = "0" + digits;
    }
  } else if (digits.length === 9 && digits.startsWith("9")) {
    // Si viene como 9XXXXXXXX (sin el 0 inicial), anteponer el 0
    digits = "0" + digits;
  }

  return digits;
}

const TEXT_FIELDS = ["nombrePuntoVenta", "etiqueta", "mcuServicios"];
const PHONE_FIELDS = [
  "telefono1",
  "telefono2",
  "telefono3",
  "telefono4",
  "telefono5",
  "telefono6",
];
const NUMERIC_FIELDS = ["total"];

// Devuelve { changes, patch }:
//  - changes: { "campo": { before, after } } para auditoría (sync_changes)
//  - patch: objeto listo para mandar en el PATCH a Twenty (solo campos que cambiaron)
function computeChanges(person) {
  const changes = {};
  const patch = {};

  const firstBefore = person.name?.firstName ?? "";
  const lastBefore = person.name?.lastName ?? "";
  const firstAfter = normalizeText(firstBefore);
  const lastAfter = normalizeText(lastBefore);

  if (firstAfter !== firstBefore || lastAfter !== lastBefore) {
    if (firstAfter !== firstBefore) {
      changes["name.firstName"] = { before: firstBefore, after: firstAfter };
    }
    if (lastAfter !== lastBefore) {
      changes["name.lastName"] = { before: lastBefore, after: lastAfter };
    }
    patch.name = { firstName: firstAfter, lastName: lastAfter };
  }

  for (const field of TEXT_FIELDS) {
    const before = person[field];
    const after = normalizeText(before);
    if (after !== before) {
      changes[field] = { before, after };
      patch[field] = after;
    }
  }

  for (const field of PHONE_FIELDS) {
    const before = person[field];
    const after = normalizePhone(before);
    if (after !== before) {
      changes[field] = { before, after };
      patch[field] = after;
    }
  }

  for (const field of NUMERIC_FIELDS) {
    const before = person[field];
    const after = normalizeTotal(before);
    if (after !== before) {
      changes[field] = { before, after };
      patch[field] = after;
    }
  }

  return { changes, patch };
}

module.exports = { normalizeText, normalizeNullable, normalizeTotal, normalizePhone, computeChanges };
