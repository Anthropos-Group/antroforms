// Base de empresas (estudio de plantas) → registros de Twenty.
const test = require("node:test");
const assert = require("node:assert/strict");
const { mapearColumnas, empresaDesdeFila, deduplicar, avisos, personaTwenty, ruc, correo } = require("../lib/empresas");
const { tenant } = require("../lib/tenant");

test("reconoce las columnas de la plantilla y variantes comunes", () => {
  const plantilla = ["CODIGO", "RAZON_SOCIAL", "RUC", "CIUDAD", "SECTOR", "CONTACTO", "CARGO", "TELEFONO", "CORREO"];
  assert.deepEqual(Object.keys(mapearColumnas(plantilla)).sort(), ["cargo", "ciudad", "codigo", "contacto", "correo", "razonSocial", "ruc", "sector", "telefono"].sort());
  const variantes = mapearColumnas(["Código", "Razón social", "R.U.C", "Ciudad", "Nombre del contacto", "Teléfono celular", "E-mail"]);
  assert.equal(variantes.codigo, "Código");
  assert.equal(variantes.razonSocial, "Razón social");
  assert.equal(variantes.contacto, "Nombre del contacto");
  assert.equal(variantes.telefono, "Teléfono celular");
  assert.equal(variantes.correo, "E-mail");
});

test("limpia RUC, teléfono y correo", () => {
  assert.equal(ruc(1790000000001), "1790000000001");
  assert.equal(ruc("990000000001"), "0990000000001", "Excel quita el 0 inicial");
  assert.equal(correo(" Ana@Ejemplo.COM "), "ana@ejemplo.com");
  assert.equal(correo("ana arroba ejemplo"), null);
  const mapa = mapearColumnas(["CODIGO", "RAZON_SOCIAL", "TELEFONO", "CORREO"]);
  const e = empresaDesdeFila({ CODIGO: "emp001", RAZON_SOCIAL: " Ejemplo  S.A. ", TELEFONO: "+593 99 000 0000", CORREO: "malo" }, mapa);
  assert.equal(e.codigoEmpresa, "EMP001");
  assert.equal(e.razonSocial, "Ejemplo S.A.");
  assert.equal(e.celular, "0990000000");
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

test("el registro de Twenty usa solo campos del esquema del cliente", () => {
  const mapa = mapearColumnas(["CODIGO", "RAZON_SOCIAL", "RUC", "CIUDAD", "SECTOR", "CONTACTO", "CARGO", "TELEFONO", "CORREO"]);
  const p = personaTwenty(empresaDesdeFila({ CODIGO: "E1", RAZON_SOCIAL: "Ejemplo", RUC: "1790000000001", CIUDAD: "Quito", SECTOR: "Alimentos", CONTACTO: "Ana", CARGO: "Gerente", TELEFONO: "0990000000", CORREO: "a@b.ec" }, mapa));
  assert.deepEqual(p.name, { firstName: "Ana", lastName: "" });
  assert.equal(p.estadoGestion, "PENDIENTE");
  const campos = new Set(tenant("plantas").esquemaTwenty.map((c) => c.name));
  for (const k of Object.keys(p)) if (k !== "name") assert.ok(campos.has(k), `${k} no está en esquemaTwenty`);
  // Sin contacto, el nombre es la razón social.
  assert.equal(personaTwenty(empresaDesdeFila({ CODIGO: "E2", RAZON_SOCIAL: "Otra S.A." }, mapa)).name.firstName, "Otra S.A.");
});
