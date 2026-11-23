// Transformación de la base de empresas (estudio de plantas de manufactura) a
// registros `person` de su Twenty: cada registro es el contacto de una empresa.
// Módulo puro: sin red ni base de datos.
//
// Columnas esperadas (proceso de la PMO; plantilla clientes/puce/documentos/plantilla_base_empresas.xlsx);
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

// Columnas de la base según el proceso de la PMO (nombre de la empresa, RUC, razón
// social, tipo de empresa, números y correo de contacto). Ciudad, sector, contacto
// y cargo son opcionales.
const ALIAS = {
  codigo: ["CODIGO", "CODIGO EMPRESA", "COD EMPRESA", "ID EMPRESA", "ID"],
  nombreEmpresa: ["NOMBRE EMPRESA", "NOMBRE DE LA EMPRESA", "EMPRESA", "NOMBRE COMERCIAL"],
  razonSocial: ["RAZON SOCIAL"],
  ruc: ["RUC", "R U C", "RUC DE LA EMPRESA"],
  tipoEmpresa: ["TIPO EMPRESA", "TIPO DE EMPRESA", "TAMANO", "TAMANO EMPRESA", "TAMANO DE EMPRESA"],
  telefono: ["TELEFONO 1", "TELEFONO", "NUMEROS DE CONTACTO", "NUMERO DE CONTACTO", "TELEFONOS", "CELULAR", "TELEFONO CONTACTO", "TELEFONO CELULAR", "WHATSAPP"],
  telefono2: ["TELEFONO 2", "TELEFONO2", "OTRO TELEFONO"],
  correo: ["CORREO", "CORREO ELECTRONICO", "CORREO ELECTRONICO DE CONTACTO", "CORREO DE CONTACTO", "CORREO DE LA EMPRESA", "EMAIL", "E MAIL", "MAIL"],
  ciudad: ["CIUDAD", "CANTON"],
  sector: ["SECTOR", "SECTOR ECONOMICO", "ACTIVIDAD", "ACTIVIDAD ECONOMICA", "CIIU"],
  contacto: ["CONTACTO", "NOMBRE CONTACTO", "NOMBRE DEL CONTACTO", "PERSONA DE CONTACTO"],
  cargo: ["CARGO", "CARGO CONTACTO", "CARGO DEL CONTACTO"],
};
// Columnas que la base debe traer (el resto es opcional).
const OBLIGATORIAS = ["nombreEmpresa", "razonSocial", "ruc", "tipoEmpresa", "telefono", "correo"];

// Si ningún alias coincide exacto, se acepta una columna que empiece así
// (p. ej. «Correo electrónico de contacto de la empresa»).
const PREFIJOS = {
  nombreEmpresa: ["NOMBRE DE LA EMPRESA", "NOMBRE EMPRESA"],
  razonSocial: ["RAZON SOCIAL"],
  ruc: ["RUC"],
  tipoEmpresa: ["TIPO DE EMPRESA", "TIPO EMPRESA"],
  telefono: ["NUMEROS DE CONTACTO", "NUMERO DE CONTACTO", "TELEFONO"],
  correo: ["CORREO", "EMAIL", "E MAIL"],
};

// Columnas reconocidas de un encabezado: { campo: nombre original de la columna }.
function mapearColumnas(encabezados) {
  const porClave = new Map(encabezados.map((h) => [claveColumna(h), h]));
  const mapa = {};
  for (const [campo, alias] of Object.entries(ALIAS)) {
    const encontrado = alias.find((a) => porClave.has(a));
    if (encontrado) mapa[campo] = porClave.get(encontrado);
  }
  const usadas = new Set(Object.values(mapa));
  for (const [campo, prefijos] of Object.entries(PREFIJOS)) {
    if (mapa[campo]) continue;
    const clave = [...porClave.keys()].find((k) => !usadas.has(porClave.get(k)) && prefijos.some((p) => k.startsWith(p)));
    if (clave) {
      mapa[campo] = porClave.get(clave);
      usadas.add(mapa[campo]);
    }
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

function telefono(v) {
  const t = limpio(v);
  return t ? normalizePhone(t) || t : null;
}

// «Números de contacto» puede traer varios números en una celda (separados por
// «/», «,», «;», «y» o salto de línea): el primero va a Teléfono 1 y el resto a Teléfono 2.
function separarTelefonos(v) {
  const t = limpio(v);
  if (!t) return [];
  return t.split(/\s*(?:[\/,;|\n]|\by\b)\s*/i).map(telefono).filter(Boolean);
}

// Fila (objeto columna → valor) → empresa. `mapa` sale de mapearColumnas.
// Sin columna de código se usa el RUC como código.
function empresaDesdeFila(fila, mapa) {
  const v = (campo) => (mapa[campo] ? fila[mapa[campo]] : null);
  const rucEmpresa = ruc(v("ruc"));
  const telefonos = [...separarTelefonos(v("telefono")), ...separarTelefonos(v("telefono2"))];
  const correoCrudo = limpio(v("correo"));
  return {
    codigoEmpresa: limpio(v("codigo"))?.toUpperCase() || rucEmpresa,
    nombreEmpresa: limpio(v("nombreEmpresa")),
    razonSocial: limpio(v("razonSocial")),
    ruc: rucEmpresa,
    tipoEmpresa: limpio(v("tipoEmpresa")),
    ciudad: limpio(v("ciudad")),
    sector: limpio(v("sector")),
    contacto: limpio(v("contacto")),
    cargoContacto: limpio(v("cargo")),
    celular: telefonos[0] || null,
    telefono2: telefonos.slice(1).join(" / ") || null,
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
    sinNombre: empresas.filter((e) => !e.nombreEmpresa && !e.razonSocial).length,
    sinRazonSocial: empresas.filter((e) => !e.razonSocial).length,
    sinRuc: empresas.filter((e) => !e.ruc).length,
    rucNo13Digitos: empresas.filter((e) => e.ruc && e.ruc.length !== 13).length,
    sinTipoEmpresa: empresas.filter((e) => !e.tipoEmpresa).length,
    sinTelefono: empresas.filter((e) => !e.celular).length,
    sinCorreo: empresas.filter((e) => !e.correoContacto).length,
    correoInvalido: empresas.filter((e) => e.correoInvalido).length,
    sinTelefonoNiCorreo: empresas.filter((e) => !e.celular && !e.correoContacto).length,
  };
}

// Empresa → cuerpo para POST /rest/people. El nombre del registro es el nombre de
// la empresa (o la razón social si no viene), entero en firstName.
function personaTwenty(e) {
  const p = {
    name: { firstName: e.nombreEmpresa || e.razonSocial || `EMPRESA ${e.codigoEmpresa}`, lastName: "" },
    codigoEmpresa: e.codigoEmpresa,
    razonSocial: e.razonSocial,
    ruc: e.ruc,
    tipoEmpresa: e.tipoEmpresa,
    celular: e.celular,
    telefono2: e.telefono2,
    correoContacto: e.correoContacto,
    ciudad: e.ciudad,
    sector: e.sector,
    cargoContacto: e.cargoContacto,
    estadoGestion: "PENDIENTE",
  };
  // Twenty rechaza null en algunos tipos: se omiten los vacíos.
  return Object.fromEntries(Object.entries(p).filter(([, v]) => v !== null && v !== undefined));
}

module.exports = { ALIAS, OBLIGATORIAS, separarTelefonos, claveColumna, mapearColumnas, empresaDesdeFila, deduplicar, avisos, personaTwenty, ruc, correo };
