// Carga la base de empresas (estudio de plantas de manufactura) al Twenty del cliente.
//
//   TENANT=<slug> node scripts/cargar-empresas.js --base=base_empresas.xlsx [--hoja=N] [--limite=N] [--aplicar]
//
// Sin --aplicar solo simula: lee, limpia, deduplica y muestra el resumen, los avisos
// (sin teléfono, correo inválido…) y un ejemplo del registro que se enviaría, con
// los datos personales ocultos. Con --aplicar crea en Twenty las empresas que
// todavía no existen (por código): se puede repetir sin duplicar.
// Columnas: ver lib/empresas.js y la plantilla en clientes/<slug>/documentos/.
try {
  require("dotenv").config();
} catch {
  // sin dotenv instalado (imagen de producción)
}
const fs = require("fs");
const path = require("path");
const ExcelJS = require("exceljs");
const { tenant } = require("../lib/tenant");
const { mapearColumnas, empresaDesdeFila, deduplicar, avisos, personaTwenty, OBLIGATORIAS } = require("../lib/empresas");

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, ...v] = a.replace(/^--/, "").split("=");
    return [k, v.length ? v.join("=") : true];
  })
);
const APLICAR = Boolean(args.aplicar);
const LOTE = 50;

// CSV separado por «;» o «,» (se detecta en el encabezado), con comillas.
function leerCsv(archivo) {
  const texto = fs.readFileSync(archivo, "utf8").replace(/^\uFEFF/, "");
  const sep = (texto.split(/\r?\n/)[0].match(/;/g) || []).length >= (texto.split(/\r?\n/)[0].match(/,/g) || []).length ? ";" : ",";
  const filas = [];
  let fila = [], campo = "", comillas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (comillas) {
      if (c === '"' && texto[i + 1] === '"') { campo += '"'; i++; }
      else if (c === '"') comillas = false;
      else campo += c;
    } else if (c === '"') comillas = true;
    else if (c === sep) { fila.push(campo); campo = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && texto[i + 1] === "\n") i++;
      fila.push(campo); campo = "";
      if (fila.some((x) => x.trim())) filas.push(fila);
      fila = [];
    } else campo += c;
  }
  if (campo || fila.length) { fila.push(campo); if (fila.some((x) => x.trim())) filas.push(fila); }
  const encabezados = (filas[0] || []).map((h) => h.trim());
  return { encabezados, filas: filas.slice(1).map((f) => Object.fromEntries(encabezados.map((h, i) => [h, f[i] ?? null]))) };
}

async function leerHoja(archivo, hoja = 0) {
  if (/\.csv$/i.test(archivo)) return leerCsv(archivo);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(archivo);
  const ws = wb.worksheets[hoja];
  if (!ws) throw new Error(`El archivo no tiene la hoja ${hoja + 1}`);
  const filas = [];
  ws.eachRow({ includeEmpty: false }, (row) =>
    filas.push(row.values.slice(1).map((c) => (c && typeof c === "object" ? c.text ?? c.result ?? "" : c)))
  );
  const encabezados = (filas[0] || []).map((h) => String(h ?? "").trim());
  return { encabezados, filas: filas.slice(1).map((f) => Object.fromEntries(encabezados.map((h, i) => [h, f[i] ?? null]))) };
}

function twentyBase() {
  const url = (process.env.TWENTY_API_URL || "").replace(/\/+$/, "");
  if (!url) throw new Error("Falta TWENTY_API_URL (ej. https://tu-twenty/rest)");
  return url;
}

async function twenty(ruta, { method = "GET", body } = {}) {
  for (let intento = 0; ; intento++) {
    const res = await fetch(`${twentyBase()}${ruta}`, {
      method,
      headers: { Authorization: `Bearer ${process.env.TWENTY_API_KEY || ""}`, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (res.ok) return res.json();
    const texto = (await res.text()).slice(0, 400);
    if ((res.status === 429 || res.status >= 500) && intento < 4) {
      await new Promise((r) => setTimeout(r, 1000 * 2 ** intento));
      continue;
    }
    throw new Error(`${method} ${ruta.split("?")[0]} → ${res.status} ${texto}`);
  }
}

async function codigosExistentes(campo) {
  const codigos = new Set();
  let cursor = null;
  do {
    const params = new URLSearchParams({ limit: "200" });
    if (cursor) params.set("starting_after", cursor);
    const body = await twenty(`/people?${params}`);
    for (const p of body.data?.people || []) if (p[campo]) codigos.add(String(p[campo]));
    cursor = body.pageInfo?.hasNextPage ? body.pageInfo.endCursor : null;
  } while (cursor);
  return codigos;
}

async function main() {
  const config = tenant();
  if (config.twenty.campos.codigo_cliente !== "codigoEmpresa") {
    throw new Error(`Este script es para clientes con base de empresas (TENANT actual: ${config.id})`);
  }
  if (!args.base) throw new Error("Falta --base=<archivo de empresas .xlsx o .csv>");

  const { encabezados, filas } = await leerHoja(path.resolve(args.base), args.hoja ? Number(args.hoja) - 1 : 0);
  const mapa = mapearColumnas(encabezados);
  const faltan = OBLIGATORIAS.filter((c) => !mapa[c]);
  const sobran = encabezados.filter((h) => h && !Object.values(mapa).includes(h));
  console.log(`Cliente: ${config.nombre}`);
  console.log("Columnas reconocidas:", mapa);
  if (faltan.length) console.log("⚠ Faltan columnas del proceso de la PMO:", faltan.join(", "));
  if (sobran.length) console.log("Columnas que no se cargan:", sobran.join(", "));
  if (!mapa.codigo && !mapa.ruc) throw new Error("La base necesita una columna CODIGO o RUC para identificar a cada empresa.");

  const { empresas, resumen } = deduplicar(filas.map((f) => empresaDesdeFila(f, mapa)));
  let aCargar = empresas;
  if (args.limite) aCargar = aCargar.slice(0, Number(args.limite));
  console.log(`Filas leídas: ${resumen.filas} · empresas únicas: ${resumen.unicas} · sin código: ${resumen.sinCodigo} · códigos repetidos: ${resumen.duplicadas.length}`);
  if (resumen.duplicadas.length) console.log("  Repetidos (se carga la primera fila):", resumen.duplicadas.slice(0, 20).join(", "));
  console.log("Avisos:", avisos(aCargar));
  const porTipo = aCargar.reduce((acc, e) => ({ ...acc, [e.tipoEmpresa || "SIN_TIPO"]: (acc[e.tipoEmpresa || "SIN_TIPO"] || 0) + 1 }), {});
  console.log("Por tipo de empresa:", porTipo);
  const contar = (campo) => aCargar.reduce((acc, e) => ({ ...acc, [e[campo] ?? "SIN_DATO"]: (acc[e[campo] ?? "SIN_DATO"] || 0) + 1 }), {});
  console.log("Por prioridad:", contar("prioridad"));
  console.log("Por cantón:", contar("ciudad"));
  console.log("Por origen:", contar("origenBase"));
  if (aCargar[0]) {
    const ejemplo = personaTwenty(aCargar[0]);
    console.log("Ejemplo de registro (datos personales ocultos):", {
      ...ejemplo,
      name: { firstName: "***" },
      celular: ejemplo.celular ? "09********" : undefined,
      telefono2: ejemplo.telefono2 ? "0*********" : undefined,
      telefono3: ejemplo.telefono3 ? "0*********" : undefined,
      whatsapp: ejemplo.whatsapp ? "09********" : undefined,
      correo2: ejemplo.correo2 ? "***@***" : undefined,
      representanteLegal: ejemplo.representanteLegal ? "***" : undefined,
      correoContacto: ejemplo.correoContacto ? "***@***" : undefined,
    });
  }
  if (!APLICAR) {
    console.log(`\nSimulación: no se escribió nada. A cargar: ${aCargar.length}. Repite con --aplicar para cargar en Twenty.`);
    return;
  }

  const existentes = await codigosExistentes(config.twenty.campos.codigo_cliente);
  const nuevas = aCargar.filter((e) => !existentes.has(e.codigoEmpresa));
  console.log(`Ya existen en Twenty: ${aCargar.length - nuevas.length} · por crear: ${nuevas.length}`);
  let creadas = 0;
  for (let i = 0; i < nuevas.length; i += LOTE) {
    const lote = nuevas.slice(i, i + LOTE).map(personaTwenty);
    await twenty("/batch/people", { method: "POST", body: lote });
    creadas += lote.length;
    console.log(`  ${creadas}/${nuevas.length}`);
  }
  console.log("Listo. La app las toma en el próximo refresco (cada 3 minutos).");
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
