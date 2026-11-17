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
  const t = limpio(v);
  if (t === null) return null; // Number(null) daría 0
  const n = Number(t);
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

// --- Base del sorteo (Entrega_Sorteo_23deJulio_*.xlsx) --------------------------
// Hoja 1 «Sorteo» (principales) y hoja 2 «Reemplazos», un reemplazo por principal
// en la misma ciudad. Encabezados en mayúsculas (como los deja leerHoja). Tampoco
// se cargan Identificación, Tipo de identificación (solo decide jurídica), PEP,
// provincia, parroquia ni las columnas del marco muestral.
const LARGO_CORTADO = 64; // la base trae la actividad recortada a 64 caracteres

function tipoPersonaSorteo(tipo, tipoId) {
  const t = limpio(tipo)?.toUpperCase();
  if (limpio(tipoId)?.toUpperCase() === "RUC" || t === "J") return "JURIDICA";
  return "NATURAL"; // N, PN, F, PEP y vacío con cédula o pasaporte
}

function socioDesdeSorteo(f) {
  const condicion = limpio(f["CONDICIÓN"])?.toUpperCase() === "REEMPLAZO" ? "REEMPLAZO" : "PRINCIPAL";
  const actividad = limpio(f["ACTIVIDAD ECONÓMICA"]);
  const orden = Number(f["ORDEN DE GESTIÓN"] ?? f["ORDEN DE ACTIVACIÓN"]);
  const celular = limpio(f["CELULAR (NORMALIZADO)"]);
  return {
    codigoCliente: limpio(f["ID ORIGINAL (CLIENTE)"]),
    codigoMuestra: limpio(f["ID SELECCIÓN"]),
    // La exportación cambió la Ñ por «¥» (MU¥OZ).
    nombre: limpio(f["NOMBRE"])?.replace(/¥/g, "Ñ") || null,
    nombreOficina: limpio(f["SUCURSAL"]),
    ciudadOficina: limpio(f["ESTRATO (CIUDAD)"]),
    celular: celular ? normalizePhone(celular) || null : null,
    tipoPersona: tipoPersonaSorteo(f["TIPO DE PERSONA"], f["TIPO DE IDENTIFICACIÓN"]),
    actividadEconomica: actividad && actividad.length >= LARGO_CORTADO ? `${actividad}…` : actividad,
    edad: edad(f["EDAD"]),
    cantonDomicilio: limpio(f["CANTÓN DOMICILIO"]),
    cantonActividad: limpio(f["CANTÓN EMPLEO"]),
    condicion,
    idVinculado: limpio(f["ID REEMPLAZO VINCULADO"] ?? f["ID DEL REGISTRO PRINCIPAL"]),
    ordenGestion: Number.isInteger(orden) && orden > 0 ? orden : null,
    // El reemplazo queda en reserva (invisible al encuestador) hasta activarse.
    estadoGestion: condicion === "REEMPLAZO" ? "RESERVA" : "PENDIENTE",
  };
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
    cantonActividad: s.cantonActividad,
    condicion: s.condicion,
    idVinculado: s.idVinculado,
    ordenGestion: s.ordenGestion,
    estadoGestion: s.estadoGestion || "PENDIENTE",
  };
  if (codigoMuestra || s.codigoMuestra) p.codigoMuestra = codigoMuestra || s.codigoMuestra;
  // Twenty rechaza null en algunos tipos (SELECT, NUMBER): se omiten los vacíos.
  return Object.fromEntries(Object.entries(p).filter(([, v]) => v !== null && v !== undefined));
}

module.exports = { socioDesdeFila, socioDesdeSorteo, tipoPersonaSorteo, deduplicar, personaTwenty, tipoPersona, limpio };
