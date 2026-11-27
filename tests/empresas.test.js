// Base de empresas (PUCE, proceso de la PMO) → registros de Twenty.
const test = require("node:test");
const assert = require("node:assert/strict");
const { mapearColumnas, empresaDesdeFila, deduplicar, avisos, personaTwenty, ruc, correo, separarTelefonos, OBLIGATORIAS } = require("../lib/empresas");
const { tenant } = require("../lib/tenant");

const PLANTILLA = ["CODIGO", "NOMBRE_EMPRESA", "RAZON_SOCIAL", "RUC", "TIPO_EMPRESA", "TELEFONO_1", "TELEFONO_2", "CORREO"];

test("reconoce las columnas del proceso de la PMO y variantes comunes", () => {
  const mapa = mapearColumnas(PLANTILLA);
  for (const c of OBLIGATORIAS) assert.ok(mapa[c], c);
  const variantes = mapearColumnas(["Nombre de la empresa", "Ruc de la empresa", "Razón social", "Tipo de empresa", "Números de contacto", "Correo electrónico de contacto de la empresa"]);
  assert.equal(variantes.nombreEmpresa, "Nombre de la empresa");
  assert.equal(variantes.ruc, "Ruc de la empresa");
  assert.equal(variantes.razonSocial, "Razón social");
  assert.equal(variantes.tipoEmpresa, "Tipo de empresa");
  assert.equal(variantes.telefono, "Números de contacto");
  assert.equal(variantes.correo, "Correo electrónico de contacto de la empresa");
});

test("limpia RUC, teléfonos y correo", () => {
  assert.equal(ruc(1790000000001), "1790000000001");
  assert.equal(ruc("990000000001"), "0990000000001", "Excel quita el 0 inicial");
  assert.equal(correo(" Ana@Ejemplo.COM "), "ana@ejemplo.com");
  assert.equal(correo("ana arroba ejemplo"), null);
  assert.deepEqual(separarTelefonos("0991234567 / 02-2345678"), ["0991234567", "022345678"]);
  assert.deepEqual(separarTelefonos("+593 99 123 4567"), ["0991234567"]);
});

test("varios números en una celda: 1.º a Teléfono 1, 2.º a Teléfono 2 y el resto a Otros teléfonos", () => {
  const mapa = mapearColumnas(["CODIGO", "NOMBRE_EMPRESA", "Números de contacto", "CORREO"]);
  const e = empresaDesdeFila({ CODIGO: "emp001", NOMBRE_EMPRESA: " Planta  Uno ", "Números de contacto": "0991234567; 022345678; 0987654321", CORREO: "malo" }, mapa);
  assert.equal(e.codigoEmpresa, "EMP001");
  assert.equal(e.nombreEmpresa, "Planta Uno");
  assert.equal(e.celular, "0991234567");
  assert.equal(e.telefono2, "022345678");
  assert.equal(e.telefono3, "0987654321");
  assert.equal(e.correoContacto, null);
  assert.equal(e.correoInvalido, true);
});

test("sin columna de código usa el RUC; deduplica por código", () => {
  const mapa = mapearColumnas(["RUC", "EMPRESA"]);
  const filas = [{ RUC: "1790000000001", EMPRESA: "A" }, { RUC: "1790000000001", EMPRESA: "A bis" }, { RUC: null, EMPRESA: "Sin RUC" }];
  const { empresas, resumen } = deduplicar(filas.map((f) => empresaDesdeFila(f, mapa)));
  assert.equal(empresas.length, 1);
  assert.equal(empresas[0].codigoEmpresa, "1790000000001");
  assert.equal(resumen.sinCodigo, 1);
  assert.deepEqual(resumen.duplicadas, ["1790000000001"]);
  assert.equal(avisos(empresas).sinTelefonoNiCorreo, 1);
});

test("el registro de Twenty usa el nombre de la empresa y solo campos del esquema", () => {
  const mapa = mapearColumnas(PLANTILLA);
  const p = personaTwenty(empresaDesdeFila({ CODIGO: "E1", NOMBRE_EMPRESA: "Planta Uno", RAZON_SOCIAL: "Planta Uno S.A.", RUC: "1790000000001", TIPO_EMPRESA: "Grande", TELEFONO_1: "0990000000", TELEFONO_2: "022000000", CORREO: "info@planta.ec" }, mapa));
  assert.deepEqual(p.name, { firstName: "Planta Uno", lastName: "" });
  assert.equal(p.tipoEmpresa, "Grande");
  assert.equal(p.telefono2, "022000000");
  assert.equal(p.estadoGestion, "PENDIENTE");
  const campos = new Set(tenant("puce").esquemaTwenty.map((c) => c.name));
  for (const k of Object.keys(p)) if (k !== "name") assert.ok(campos.has(k), `${k} no está en esquemaTwenty`);
  // Sin nombre de empresa, se usa la razón social.
  assert.equal(personaTwenty(empresaDesdeFila({ CODIGO: "E2", RAZON_SOCIAL: "Otra S.A." }, mapa)).name.firstName, "Otra S.A.");
});

test("formato de la base de Strattos (base_contacto_AAAAMMDD.csv)", () => {
  const enc = ["CODIGO_EMPRESA", "RUC", "NOMBRE_EMPRESA", "NOMBRE_COMERCIAL", "CANTON", "DIRECCION", "Fecha", "Segmento", "TAMANO", "PRIORIDAD", "ELEGIBILIDAD", "ORIGEN_BASE", "REPRESENTANTE_LEGAL", "CORREO", "CORREO2", "WHATSAPP_CONFIRMADO", "SITIO_WEB", "TELEFONO1", "TELEFONO2", "TELEFONO3", "TELEFONO4", "TELEFONO5", "TELEFONO6", "ETIQUETA", "MES_GESTION"];
  const mapa = mapearColumnas(enc);
  const fila = Object.fromEntries(enc.map((h) => [h, ""]));
  Object.assign(fila, {
    CODIGO_EMPRESA: "EMP-1790000000001", RUC: "1790000000001", NOMBRE_EMPRESA: "PLANTA EJEMPLO S.A.", NOMBRE_COMERCIAL: "PLANTA EJEMPLO",
    CANTON: "QUITO", Segmento: "C10,Alimentos", TAMANO: "GRANDE", PRIORIDAD: "1", ELEGIBILIDAD: "Por validar: CIIU SRI sección G",
    WHATSAPP_CONFIRMADO: "098-000-0000", TELEFONO1: "098-000-0000", TELEFONO2: "02-200-0000", TELEFONO3: "02-300-0000", TELEFONO4: "02-200-0000",
  });
  const e = empresaDesdeFila(fila, mapa);
  assert.equal(e.nombreEmpresa, "PLANTA EJEMPLO", "nombre comercial para mostrar");
  assert.equal(e.razonSocial, "PLANTA EJEMPLO S.A.", "NOMBRE_EMPRESA es la razón social");
  assert.equal(e.tipoEmpresa, "GRANDE");
  assert.equal(e.prioridad, 1);
  assert.equal(e.sector, "C10,Alimentos");
  assert.equal(e.celular, "0980000000");
  assert.equal(e.telefono2, "022000000");
  assert.equal(e.telefono3, "023000000", "sin repetir números");
  assert.equal(e.whatsapp, "0980000000");
  assert.equal(avisos([e]).porValidarElegibilidad, 1);
  const p = personaTwenty(e);
  const campos = new Set(tenant("puce").esquemaTwenty.map((c) => c.name));
  for (const k of Object.keys(p)) if (k !== "name") assert.ok(campos.has(k), `${k} no está en esquemaTwenty`);
});
