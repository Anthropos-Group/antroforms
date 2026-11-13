// Transformación de la base de socios de la Cooperativa 23 de Julio
// (BASE_SOCIOS_depurada_*.xlsx, columnas como CATI_estructura.xlsx) a registros
// `person` de su Twenty. Módulo puro: sin red ni base de datos.
//
// Minimización de datos (el consentimiento promete "no le pediremos cédula ni
// números de cuenta" y resultados agrupados): NO se cargan CEDULA, ACTIVOS,
// PASIVOS, PATRIMONIO, INGRESOS, GASTOS ni TIPO PERSONA (incluye la marca PEP).

const { normalizePhone, normalizeText } = require("./normalize");

const VACIOS = new Set(["", "NULL", "N/A", "NA", "NONE", "-"]);

function limpio(v) {
  if (v === null || v === undefined) return null;
  const t = normalizeText(String(v));
  return VACIOS.has(t.toUpperCase()) ? null : t;
}

// TIPO: P = persona natural, C = compañía (persona jurídica).
function tipoPersona(tipo) {
  const t = limpio(tipo)?.toUpperCase();
  if (t === "P") return "NATURAL";
  if (t === "C") return "JURIDICA";
  return null;
}

function edad(v) {
  const n = Number(limpio(v));
  return Number.isInteger(n) && n >= 0 && n <= 120 ? n : null;
}

// Fila de la base (objeto columna → valor) → datos del socio.
// `oficinas`: Map código de oficina → { nombre, ciudad } (base_de_oficinas).
function socioDesdeFila(fila, oficinas = new Map()) {
  const codigo = limpio(fila["CLIENTE"]);
  const codOficina = limpio(fila["OFICINA"]);
  const oficina = oficinas.get(String(Number(codOficina))) || null;
  const celular = limpio(fila["CELULAR"]);
  return {
    codigoCliente: codigo,
    nombre: limpio(fila["NOMBRE"]),
    codigoOficina: codOficina,
    nombreOficina: limpio(fila["NOMBRE OFICINA"]) || oficina?.nombre || null,
    ciudadOficina: oficina?.ciudad || null,
    celular: celular ? normalizePhone(celular) || null : null,
    tipoPersona: tipoPersona(fila["TIPO"]),
    actividadEconomica: limpio(fila["ACTIVIDAD ECONOMICA"]),
    profesion: limpio(fila["PROFESION"]),
    edad: edad(fila["EDAD"]),
    cantonDomicilio: limpio(fila["CANTON DOM"]),
    provinciaDomicilio: limpio(fila["PROVINCIA DOM"])?.replace(/^DE /, "") || null,
  };
}

// Un socio por código de cliente. La base trae filas exactamente duplicadas y el
// mismo código con el nombre escrito al revés: se queda la primera fila y se
// cuentan los casos para revisarlos.
function deduplicar(socios) {
  const porCodigo = new Map();
  const resumen = { filas: socios.length, sinCodigo: 0, duplicadasIguales: 0, duplicadasDistintas: [] };
  for (const s of socios) {
    if (!s.codigoCliente) {
      resumen.sinCodigo++;
      continue;
    }
    const previo = porCodigo.get(s.codigoCliente);
    if (!previo) {
      porCodigo.set(s.codigoCliente, s);
    } else if (JSON.stringify(previo) === JSON.stringify(s)) {
      resumen.duplicadasIguales++;
    } else {
      resumen.duplicadasDistintas.push(s.codigoCliente);
      // Completa con la fila repetida los datos que la primera no traía.
      for (const [k, v] of Object.entries(s)) if (previo[k] == null && v != null) previo[k] = v;
    }
  }
  resumen.unicos = porCodigo.size;
  return { socios: [...porCodigo.values()], resumen };
}

// Socio → cuerpo para POST /rest/people de Twenty. El nombre completo va en
// firstName: la base mezcla "APELLIDOS NOMBRES" y "NOMBRES APELLIDOS" y partirlo
// adivinando lo dañaría.
function personaTwenty(s, { codigoMuestra = null } = {}) {
  const p = {
    name: { firstName: s.nombre || `SOCIO ${s.codigoCliente}`, lastName: "" },
    codigoCliente: s.codigoCliente,
    nombreOficina: s.nombreOficina,
    ciudadOficina: s.ciudadOficina,
    celular: s.celular,
    tipoPersona: s.tipoPersona,
    actividadEconomica: s.actividadEconomica,
    profesion: s.profesion,
    edad: s.edad,
    cantonDomicilio: s.cantonDomicilio,
    estadoGestion: "PENDIENTE",
  };
  if (codigoMuestra) p.codigoMuestra = codigoMuestra;
  // Twenty rechaza null en algunos tipos (SELECT, NUMBER): se omiten los vacíos.
  return Object.fromEntries(Object.entries(p).filter(([, v]) => v !== null && v !== undefined));
}

module.exports = { socioDesdeFila, deduplicar, personaTwenty, tipoPersona, limpio };
