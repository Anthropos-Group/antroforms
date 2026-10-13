// Caché en memoria de resultados caros y muy pedidos (el despliegue es un solo
// contenedor). Con N pantallas de monitoreo refrescando cada minuto, el cálculo
// corre una vez por ventana en vez de N; y las peticiones que llegan mientras se
// calcula esperan ese mismo cálculo en vez de lanzar otro.
const CLAVE_GLOBAL = Symbol.for("antroforms.cache");
const entradas = (globalThis[CLAVE_GLOBAL] ??= new Map());

function memo(clave, ttlMs, calcular) {
  const hit = entradas.get(clave);
  if (hit && hit.expira > Date.now()) return hit.promesa;
  const promesa = Promise.resolve().then(calcular);
  entradas.set(clave, { promesa, expira: Date.now() + ttlMs });
  // Un error no queda guardado: la próxima petición vuelve a intentar.
  promesa.catch(() => {
    if (entradas.get(clave)?.promesa === promesa) entradas.delete(clave);
  });
  return promesa;
}

// Descarta las entradas cuya clave empieza con `prefijo` (p. ej. tras un cambio
// en el panel que afecta lo calculado).
function invalidar(prefijo = "") {
  for (const clave of entradas.keys()) if (clave.startsWith(prefijo)) entradas.delete(clave);
}

module.exports = { memo, invalidar };
