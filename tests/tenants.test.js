// Revisión de la configuración de TODOS los clientes: un cambio pensado para uno
// no debe dejar inválida la de otro. Corre en cada cambio (npm test).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { tenant, TENANTS } = require("../lib/tenant");
const { validarCuestionario } = require("../scripts/cargar-cuestionario");

const ids = Object.keys(TENANTS);

for (const id of ids) {
  test(`cliente ${id}: configuración completa y coherente`, () => {
    const c = tenant(id);
    assert.equal(c.id, id, "el id del archivo debe coincidir con la clave en lib/tenant.js");
    assert.ok(/^[a-z][a-z0-9]{2,29}$/.test(id), "slug: minúsculas y números, 3 a 30 caracteres");
    assert.ok(c.nombre && c.marca?.inicial, "nombre y marca");
    assert.ok(c.twenty?.campos?.codigo_cliente, "campo de código de cliente en Twenty");
    assert.ok(c.twenty.campos.status, "campo de estado en Twenty");
    assert.ok(c.twenty.estados?.completada, "estado de encuesta completada");
    assert.ok(Array.isArray(c.twenty.estadosExcluidos), "estados excluidos");

    // Con esquema propio en Twenty, todo estado que usa la app debe existir como opción.
    const campoEstado = (c.esquemaTwenty || []).find((f) => f.name === c.twenty.campos.status);
    if (campoEstado?.opciones) {
      const opciones = new Set(campoEstado.opciones.map((o) => o[0]));
      const usados = [
        ...Object.values(c.twenty.estados),
        ...Object.values(c.twenty.estadosCierre || {}),
        ...c.twenty.estadosExcluidos,
        ...(c.reemplazos ? [c.reemplazos.estadoAgotado, c.reemplazos.estadoReserva, c.reemplazos.estadoActivo, ...(c.reemplazos.estadosQueActivan || [])] : []),
      ];
      for (const e of usados) assert.ok(opciones.has(e), `el estado ${e} no está entre las opciones de ${campoEstado.name}`);
    }
  });

  const archivo = path.join(__dirname, "..", "tenants", `${id}.cuestionario.js`);
  if (fs.existsSync(archivo)) {
    test(`cliente ${id}: el cuestionario es válido`, () => {
      // La validación usa los datos de cliente de la configuración activa (TENANT).
      const previo = process.env.TENANT;
      process.env.TENANT = id;
      try {
        assert.deepEqual(validarCuestionario(require(archivo)), []);
      } finally {
        if (previo === undefined) delete process.env.TENANT;
        else process.env.TENANT = previo;
      }
    });
  }
}
