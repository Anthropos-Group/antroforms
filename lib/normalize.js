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

const TEXT_FIELDS = ["nombrePuntoVenta", "etiqueta", "mcuServicios"];
const NULLABLE_FIELDS = [
  "telefono1",
  "telefono2",
  "telefono3",
  "telefono4",
  "telefono5",
  "telefono6",
  "total",
];

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

  for (const field of NULLABLE_FIELDS) {
    const before = person[field];
    const after = normalizeNullable(before);
    if (after !== before) {
      changes[field] = { before, after };
      patch[field] = after;
    }
  }

  return { changes, patch };
}

module.exports = { normalizeText, normalizeNullable, computeChanges };
