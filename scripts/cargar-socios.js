// Carga la base de socios de la Cooperativa 23 de Julio a su Twenty.
//
//   TENANT=coop23dejulio node scripts/cargar-socios.js --base=BASE_SOCIOS.xlsx \
//     [--oficinas=base_de_oficinas.xlsx] [--muestra=muestra.xlsx] [--limite=N] [--aplicar]
//
// Sin --aplicar solo simula: lee, limpia, deduplica y muestra el resumen y un
// ejemplo del registro que se enviaría. Con --aplicar crea en Twenty los socios
// que todavía no existen (por código de cliente): se puede repetir sin duplicar.
//
// --muestra: Excel/CSV con la columna CLIENTE (y opcional CODIGO_MUESTRA); si se
// da, solo se cargan esos socios. Ver lib/socios.js (qué columnas NO se cargan).
try {
  require("dotenv").config();
} catch {
  // sin dotenv instalado (imagen de producción)
}
const path = require("path");
const ExcelJS = require("exceljs");
const { tenant } = require("../lib/tenant");
const { socioDesdeFila, deduplicar, personaTwenty, limpio } = require("../lib/socios");

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, ...v] = a.replace(/^--/, "").split("=");
    return [k, v.length ? v.join("=") : true];
  })
);
const APLICAR = Boolean(args.aplicar);
const LOTE = 50;

async function leerHoja(archivo, { encabezadoEn } = {}) {
  const wb = new ExcelJS.Workbook();
  if (/\.csv$/i.test(archivo)) await wb.csv.readFile(archivo);
  else await wb.xlsx.readFile(archivo);
  const ws = wb.worksheets[0];
  const filas = [];
  ws.eachRow({ includeEmpty: false }, (row) => filas.push(row.values.slice(1).map((c) => (c && typeof c === "object" ? c.text ?? c.result ?? "" : c))));
  const idxEnc = encabezadoEn ? filas.findIndex(encabezadoEn) : 0;
  const enc = filas[idxEnc].map((h) => String(h ?? "").trim().toUpperCase());
  return filas.slice(idxEnc + 1).map((f) => Object.fromEntries(enc.map((h, i) => [h, f[i] ?? null])));
}

async function leerOficinas(archivo) {
  const mapa = new Map();
  if (!archivo) return mapa;
  const filas = await leerHoja(archivo, { encabezadoEn: (f) => f.some((c) => /SUCURSAL/i.test(String(c))) });
  for (const f of filas) {
    const cod = limpio(f["CÓD SUCURSAL"] ?? f["COD SUCURSAL"]);
    if (cod) mapa.set(String(Number(cod)), { nombre: limpio(f["SUCURSAL"]), ciudad: limpio(f["CIUDAD"]) });
  }
  return mapa;
}

async function leerMuestra(archivo) {
  if (!archivo) return null;
  const filas = await leerHoja(archivo);
  const mapa = new Map();
  for (const f of filas) {
    const cod = limpio(f["CLIENTE"]);
    if (cod) mapa.set(cod, limpio(f["CODIGO_MUESTRA"] ?? f["CÓDIGO DE MUESTRA"] ?? f["CODIGO MUESTRA"]));
  }
  return mapa;
}

function twentyBase() {
  const url = (process.env.TWENTY_API_URL || "").replace(/\/+$/, "");
  if (!url) throw new Error("Falta TWENTY_API_URL (ej. https://tu-twenty/rest)");
  return url;
}

async function twenty(path, { method = "GET", body } = {}) {
  for (let intento = 0; ; intento++) {
    const res = await fetch(`${twentyBase()}${path}`, {
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
    throw new Error(`${method} ${path.split("?")[0]} → ${res.status} ${texto}`);
  }
}

async function codigosExistentes() {
  const codigos = new Set();
  let cursor = null;
  do {
    const params = new URLSearchParams({ limit: "200" });
    if (cursor) params.set("starting_after", cursor);
    const body = await twenty(`/people?${params}`);
    for (const p of body.data?.people || []) if (p.codigoCliente) codigos.add(String(p.codigoCliente));
    cursor = body.pageInfo?.hasNextPage ? body.pageInfo.endCursor : null;
  } while (cursor);
  return codigos;
}

async function main() {
  const config = tenant();
  if (config.id !== "coop23dejulio") throw new Error("Este script es para TENANT=coop23dejulio");
  if (!args.base) throw new Error("Falta --base=<archivo de socios .xlsx o .csv>");

  const [filas, oficinas, muestra] = await Promise.all([
    leerHoja(path.resolve(args.base)),
    leerOficinas(args.oficinas && path.resolve(args.oficinas)),
    leerMuestra(args.muestra && path.resolve(args.muestra)),
  ]);
  const { socios, resumen } = deduplicar(filas.map((f) => socioDesdeFila(f, oficinas)));
  let aCargar = muestra ? socios.filter((s) => muestra.has(s.codigoCliente)) : socios;
  if (args.limite) aCargar = aCargar.slice(0, Number(args.limite));

  const cuenta = (campo) => aCargar.filter((s) => s[campo] != null).length;
  console.log(`Cliente: ${config.nombre}`);
  console.log(`Filas leídas: ${resumen.filas} · socios únicos: ${resumen.unicos} · sin código: ${resumen.sinCodigo}`);
  console.log(`Duplicadas idénticas: ${resumen.duplicadasIguales} · mismo código con datos distintos: ${resumen.duplicadasDistintas.length}`);
  if (muestra) console.log(`Muestra: ${muestra.size} códigos · encontrados en la base: ${aCargar.length}`);
  console.log(
    `A cargar: ${aCargar.length} · con celular: ${cuenta("celular")} · tipo de persona: ${cuenta("tipoPersona")} · actividad: ${cuenta("actividadEconomica")} · ciudad de oficina: ${cuenta("ciudadOficina")}`
  );
  const porTipo = aCargar.reduce((acc, s) => ({ ...acc, [s.tipoPersona || "SIN_DATO"]: (acc[s.tipoPersona || "SIN_DATO"] || 0) + 1 }), {});
  console.log("Por tipo de persona:", porTipo);
  if (aCargar[0]) {
    const ejemplo = personaTwenty(aCargar[0], { codigoMuestra: muestra?.get(aCargar[0].codigoCliente) });
    console.log("Ejemplo de registro (datos personales ocultos):", {
      ...ejemplo,
      name: { firstName: "***" },
      celular: ejemplo.celular ? "09********" : undefined,
    });
  }
  if (!APLICAR) {
    console.log("\nSimulación: no se escribió nada. Repite con --aplicar para cargar en Twenty.");
    return;
  }

  const existentes = await codigosExistentes();
  const nuevos = aCargar.filter((s) => !existentes.has(s.codigoCliente));
  console.log(`Ya existen en Twenty: ${aCargar.length - nuevos.length} · por crear: ${nuevos.length}`);
  let creados = 0;
  for (let i = 0; i < nuevos.length; i += LOTE) {
    const lote = nuevos.slice(i, i + LOTE).map((s) => personaTwenty(s, { codigoMuestra: muestra?.get(s.codigoCliente) }));
    await twenty("/batch/people", { method: "POST", body: lote });
    creados += lote.length;
    if (creados % 1000 < LOTE || creados === nuevos.length) console.log(`  ${creados}/${nuevos.length}`);
  }
  console.log("Listo. La app los toma en el próximo refresco (cada 3 minutos).");
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
