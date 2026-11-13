// Cliente (tenant) de este despliegue. Cada cliente corre en su propio contenedor
// con su propia base de datos y su propio Twenty; la variable TENANT elige cuál de
// las configuraciones de `tenants/` aplica. Sin TENANT se asume EDIMCA, para que
// el despliegue que ya está en producción siga igual sin tocar sus variables.

const TENANTS = {
  edimca: require("../tenants/edimca"),
  coop23dejulio: require("../tenants/coop23dejulio"),
};

const TENANT_DEFAULT = "edimca";

function idTenant() {
  return (process.env.TENANT || TENANT_DEFAULT).trim().toLowerCase();
}

function tenant(id = idTenant()) {
  const config = TENANTS[id];
  if (!config) {
    throw new Error(`TENANT desconocido: "${id}". Valores válidos: ${Object.keys(TENANTS).join(", ")}`);
  }
  return config;
}

// Lo que el navegador necesita saber del cliente (sin nombres de campos internos).
function tenantPublico(config = tenant()) {
  return {
    id: config.id,
    nombre: config.nombre,
    marca: config.marca,
    etiquetas: config.etiquetas,
    gestionMensual: config.gestionMensual,
    metaPorGrupo: config.metaPorGrupo,
    estados: config.twenty.estados,
    cierres: Object.keys(config.twenty.estadosCierre || {}),
    estadosExcluidos: config.twenty.estadosExcluidos,
  };
}

// Valor de un campo de Twenty, admitiendo rutas con punto ("name.firstName") y los
// campos compuestos de Twenty (teléfonos, montos) que llegan como objeto.
function leerCampo(person, campo) {
  if (!campo || !person) return null;
  let valor = campo.split(".").reduce((obj, k) => (obj == null ? undefined : obj[k]), person);
  if (valor && typeof valor === "object") {
    valor = valor.primaryPhoneNumber ?? valor.amountMicros ?? valor.primaryEmail ?? null;
  }
  return valor === undefined ? null : valor;
}

module.exports = { TENANTS, tenant, tenantPublico, idTenant, leerCampo };
