const { NextResponse } = require("next/server");
const { UUID_REGEX } = require("./auth");

function esUUID(valor) {
  return typeof valor === "string" && UUID_REGEX.test(valor);
}

function errorJson(mensaje, status = 400, extra = {}) {
  return NextResponse.json({ error: mensaje, ...extra }, { status });
}

async function leerJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

// Envuelve un handler para que cualquier excepción no controlada devuelva JSON
// (antes Next respondía un 500 sin cuerpo y el `r.json()` del cliente reventaba).
function conErrores(nombre, handler) {
  return async (...args) => {
    try {
      return await handler(...args);
    } catch (err) {
      console.error(`Error en ${nombre}:`, err);
      let mensaje = "Error interno del servidor";
      if (/relation .* does not exist|column .* does not exist/.test(err.message || "")) {
        mensaje = "La base de datos no está al día. Ejecuta 'npm run db:migrate'.";
      }
      return errorJson(mensaje, 500);
    }
  };
}

module.exports = { esUUID, errorJson, leerJson, conErrores };
