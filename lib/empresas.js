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
//
// Base real de Strattos (base_contacto_AAAAMMDD.csv): CODIGO_EMPRESA, RUC,
// NOMBRE_EMPRESA (= razón social), NOMBRE_COMERCIAL, CANTON, DIRECCION, Segmento,
// TAMANO, PRIORIDAD, ELEGIBILIDAD, ORIGEN_BASE, REPRESENTANTE_LEGAL, CORREO,
// CORREO2, WHATSAPP_CONFIRMADO, SITIO_WEB, TELEFONO1…6. No se cargan Fecha,
// ETIQUETA ni MES_GESTION (el estudio no tiene mes de gestión).
const ALIAS = {
  codigo: ["CODIGO", "CODIGO EMPRESA", "COD EMPRESA", "ID EMPRESA", "ID"],
  nombreEmpresa: ["NOMBRE EMPRESA", "NOMBRE DE LA EMPRESA", "EMPRESA"],
  nombreComercial: ["NOMBRE COMERCIAL"],
  razonSocial: ["RAZON SOCIAL"],
  ruc: ["RUC", "R U C", "RUC DE LA EMPRESA"],
  tipoEmpresa: ["TIPO EMPRESA", "TIPO DE EMPRESA", "TAMANO", "TAMANO EMPRESA", "TAMANO DE EMPRESA"],
  telefono: ["TELEFONO 1", "TELEFONO1", "TELEFONO", "NUMEROS DE CONTACTO", "NUMERO DE CONTACTO", "TELEFONOS", "CELULAR", "TELEFONO CONTACTO", "TELEFONO CELULAR"],
  telefono2: ["TELEFONO 2", "TELEFONO2", "OTRO TELEFONO"],
  telefono3: ["TELEFONO 3", "TELEFONO3"],
  telefono4: ["TELEFONO 4", "TELEFONO4"],
  telefono5: ["TELEFONO 5", "TELEFONO5"],
  telefono6: ["TELEFONO 6", "TELEFONO6"],
  whatsapp: ["WHATSAPP CONFIRMADO", "WHATSAPP"],
  correo: ["CORREO", "CORREO ELECTRONICO", "CORREO ELECTRONICO DE CONTACTO", "CORREO DE CONTACTO", "CORREO DE LA EMPRESA", "EMAIL", "E MAIL", "MAIL"],
  correo2: ["CORREO2", "CORREO 2", "OTRO CORREO"],
  ciudad: ["CIUDAD", "CANTON"],
  direccion: ["DIRECCION"],
  sector: ["SEGMENTO", "SECTOR", "SECTOR ECONOMICO", "ACTIVIDAD", "ACTIVIDAD ECONOMICA", "CIIU"],
  prioridad: ["PRIORIDAD"],
  elegibilidad: ["ELEGIBILIDAD"],
  origenBase: ["ORIGEN BASE", "ORIGEN"],
  representanteLegal: ["REPRESENTANTE LEGAL"],
  sitioWeb: ["SITIO WEB", "WEB", "PAGINA WEB"],
  contacto: ["CONTACTO", "NOMBRE CONTACTO", "NOMBRE DEL CONTACTO", "PERSONA DE CONTACTO"],
  cargo: ["CARGO", "CARGO CONTACTO", "CARGO DEL CONTACTO"],
};
// Columnas que la base debe traer (el resto es opcional).
const OBLIGATORIAS = ["nombreEmpresa", "ruc", "tipoEmpresa", "telefono", "correo"];

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
// El nombre que se muestra es el comercial; si no hay, el de la empresa. La razón
// social es la columna RAZON_SOCIAL o, si no viene, NOMBRE_EMPRESA (en la base de
// Strattos NOMBRE_EMPRESA es el nombre legal y NOMBRE_COMERCIAL el comercial).
function empresaDesdeFila(fila, mapa) {
  const v = (campo) => (mapa[campo] ? fila[mapa[campo]] : null);
  const rucEmpresa = ruc(v("ruc"));
  // Teléfonos únicos y en orden: 1 y 2 en sus campos; del 3 en adelante, juntos.
  const telefonos = [...new Set(["telefono", "telefono2", "telefono3", "telefono4", "telefono5", "telefono6"].flatMap((c) => separarTelefonos(v(c))))];
  const correoCrudo = limpio(v("correo"));
  const nombreLegal = limpio(v("nombreEmpresa"));
  const prioridad = Number(limpio(v("prioridad")));
  return {
    codigoEmpresa: limpio(v("codigo"))?.toUpperCase() || rucEmpresa,
    nombreEmpresa: limpio(v("nombreComercial")) || nombreLegal,
    razonSocial: limpio(v("razonSocial")) || nombreLegal,
    ruc: rucEmpresa,
    tipoEmpresa: limpio(v("tipoEmpresa")),
    ciudad: limpio(v("ciudad")),
    direccion: limpio(v("direccion")),
    sector: limpio(v("sector")),
    prioridad: Number.isInteger(prioridad) && prioridad > 0 ? prioridad : null,
    elegibilidad: limpio(v("elegibilidad")),
    origenBase: limpio(v("origenBase")),
    representanteLegal: limpio(v("representanteLegal")),
    sitioWeb: limpio(v("sitioWeb")),
    contacto: limpio(v("contacto")),
    cargoContacto: limpio(v("cargo")),
    celular: telefonos[0] || null,
    telefono2: telefonos[1] || null,
    telefono3: telefonos.slice(2).join(" / ") || null,
    whatsapp: telefono(v("whatsapp")),
    correoContacto: correo(correoCrudo),
    correo2: correo(v("correo2")),
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
    sinTelefonoNiCorreo: empresas.filter((e) => !e.celular && !e.correoContacto && !e.whatsapp).length,
    porValidarElegibilidad: empresas.filter((e) => e.elegibilidad && !/^elegible$/i.test(e.elegibilidad)).length,
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
    prioridad: e.prioridad,
    elegibilidad: e.elegibilidad,
    celular: e.celular,
    telefono2: e.telefono2,
    telefono3: e.telefono3,
    whatsapp: e.whatsapp,
    correoContacto: e.correoContacto,
    correo2: e.correo2,
    ciudad: e.ciudad,
    direccion: e.direccion,
    sector: e.sector,
    origenBase: e.origenBase,
    representanteLegal: e.representanteLegal,
    sitioWeb: e.sitioWeb,
    cargoContacto: e.cargoContacto,
    estadoGestion: "PENDIENTE",
  };
  // Twenty rechaza null en algunos tipos: se omiten los vacíos.
  return Object.fromEntries(Object.entries(p).filter(([, v]) => v !== null && v !== undefined));
}

module.exports = { ALIAS, OBLIGATORIAS, separarTelefonos, claveColumna, mapearColumnas, empresaDesdeFila, deduplicar, avisos, personaTwenty, ruc, correo };
