// Transformación de la base de empresas (estudio de plantas de manufactura) a
// registros `person` de su Twenty: cada registro es el contacto de una empresa.
// Módulo puro: sin red ni base de datos.
//
// Columnas esperadas (plantilla clientes/puce/documentos/plantilla_base_empresas.xlsx);
// se aceptan variantes comunes del nombre (con o sin tildes, espacios o guiones bajos).

const { normalizePhone, normalizeText } = require("./normalize");

const VACIOS = new Set(["", "NULL", "N/A", "NA", "NONE", "-"]);

function limpio(v) {
  if (v === null || v === undefined) return null;
  const t = normalizeText(String(v));
  return VACIOS.has(t.toUpperCase()) ? null : t;
}

// "Razón social" → "RAZON SOCIAL" (sin tildes, espacios simples, mayúsculas).
function claveColumna(h) {
  return String(h ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[_\-.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

const ALIAS = {
  codigo: ["CODIGO", "CODIGO EMPRESA", "COD EMPRESA", "ID EMPRESA", "ID"],
  razonSocial: ["RAZON SOCIAL", "EMPRESA", "NOMBRE EMPRESA", "NOMBRE DE LA EMPRESA"],
  ruc: ["RUC"],
  ciudad: ["CIUDAD", "CANTON"],
  sector: ["SECTOR", "SECTOR ECONOMICO", "ACTIVIDAD", "ACTIVIDAD ECONOMICA", "CIIU"],
  contacto: ["CONTACTO", "NOMBRE CONTACTO", "NOMBRE DEL CONTACTO", "PERSONA DE CONTACTO", "NOMBRE"],
  cargo: ["CARGO", "CARGO CONTACTO", "CARGO DEL CONTACTO"],
  telefono: ["TELEFONO", "CELULAR", "TELEFONO CONTACTO", "TELEFONO CELULAR", "WHATSAPP"],
  correo: ["CORREO", "EMAIL", "E MAIL", "CORREO ELECTRONICO", "MAIL"],
};

// Columnas reconocidas de un encabezado: { campo: nombre original de la columna }.
function mapearColumnas(encabezados) {
  const porClave = new Map(encabezados.map((h) => [claveColumna(h), h]));
  const mapa = {};
  for (const [campo, alias] of Object.entries(ALIAS)) {
    const encontrado = alias.find((a) => porClave.has(a));
    if (encontrado) mapa[campo] = porClave.get(encontrado);
  }
  return mapa;
}

// El RUC de Ecuador tiene 13 dígitos; Excel le quita el 0 inicial si la celda es número.
function ruc(v) {
  const t = limpio(v)?.replace(/\D/g, "");
  if (!t) return null;
  return t.length === 12 ? `0${t}` : t;
}

const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function correo(v) {
  const t = limpio(v)?.toLowerCase().replace(/^mailto:/, "");
  return t && CORREO.test(t) ? t : null;
}

// Fila (objeto columna → valor) → empresa. `mapa` sale de mapearColumnas.
// Sin columna de código se usa el RUC como código.
function empresaDesdeFila(fila, mapa) {
  const v = (campo) => (mapa[campo] ? fila[mapa[campo]] : null);
  const rucEmpresa = ruc(v("ruc"));
  const telefono = limpio(v("telefono"));
  const correoCrudo = limpio(v("correo"));
  return {
    codigoEmpresa: limpio(v("codigo"))?.toUpperCase() || rucEmpresa,
    razonSocial: limpio(v("razonSocial")),
    ruc: rucEmpresa,
    ciudad: limpio(v("ciudad")),
    sector: limpio(v("sector")),
    contacto: limpio(v("contacto")),
    cargoContacto: limpio(v("cargo")),
    celular: telefono ? normalizePhone(telefono) || telefono : null,
    correoContacto: correo(correoCrudo),
    correoInvalido: Boolean(correoCrudo && !correo(correoCrudo)),
  };
}

// Una empresa por código: se queda la primera fila y se cuentan los casos.
function deduplicar(empresas) {
  const porCodigo = new Map();
  const resumen = { filas: empresas.length, sinCodigo: 0, duplicadas: [] };
  for (const e of empresas) {
    if (!e.codigoEmpresa) {
      resumen.sinCodigo++;
      continue;
    }
    if (porCodigo.has(e.codigoEmpresa)) resumen.duplicadas.push(e.codigoEmpresa);
    else porCodigo.set(e.codigoEmpresa, e);
  }
  const lista = [...porCodigo.values()];
  return { empresas: lista, resumen: { ...resumen, unicas: lista.length } };
}

// Avisos para revisar antes de cargar (no impiden la carga).
function avisos(empresas) {
  return {
    sinRazonSocial: empresas.filter((e) => !e.razonSocial).length,
    sinContacto: empresas.filter((e) => !e.contacto).length,
    sinTelefono: empresas.filter((e) => !e.celular).length,
    sinCorreo: empresas.filter((e) => !e.correoContacto).length,
    correoInvalido: empresas.filter((e) => e.correoInvalido).length,
    sinTelefonoNiCorreo: empresas.filter((e) => !e.celular && !e.correoContacto).length,
    sinCiudad: empresas.filter((e) => !e.ciudad).length,
  };
}

// Empresa → cuerpo para POST /rest/people. El nombre es el del contacto (o la razón
// social si no hay contacto), entero en firstName.
function personaTwenty(e) {
  const p = {
    name: { firstName: e.contacto || e.razonSocial || `EMPRESA ${e.codigoEmpresa}`, lastName: "" },
    codigoEmpresa: e.codigoEmpresa,
    razonSocial: e.razonSocial,
    ruc: e.ruc,
    ciudad: e.ciudad,
    sector: e.sector,
    cargoContacto: e.cargoContacto,
    celular: e.celular,
    correoContacto: e.correoContacto,
    estadoGestion: "PENDIENTE",
  };
  // Twenty rechaza null en algunos tipos: se omiten los vacíos.
  return Object.fromEntries(Object.entries(p).filter(([, v]) => v !== null && v !== undefined));
}

module.exports = { ALIAS, claveColumna, mapearColumnas, empresaDesdeFila, deduplicar, avisos, personaTwenty, ruc, correo };
