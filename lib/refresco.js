// Refresco de la copia local de clientes (clientes_cache) desde Twenty.
//
// Es la parte rápida de la sincronización: solo LEE de Twenty lo modificado desde
// la última pasada y lo guarda ya normalizado (mismas reglas que la limpieza), sin
// escribir en Twenty. Leer 100 registros por página toma ~1 s, así que una carga de
// miles de clientes entra en uno o dos minutos. La corrección de datos en Twenty
// (un PATCH por registro, lenta) queda en lib/sync.js y corre de noche.
const { getPool } = require("./db");
const { fetchPeoplePage } = require("./twenty");
const { filaCache, upsertClientes } = require("./clientes");
const { procesarReintentosTwenty } = require("./sync");

const CLAVE = "refresco_cache";
// Solape con la pasada anterior, por diferencias de reloj entre la app y Twenty.
const SOLAPE_MS = 2 * 60 * 1000;
// Tope de seguridad (50 000 clientes). Si se alcanza, el ancla no avanza y la
// próxima pasada vuelve a empezar desde el mismo punto.
const MAX_PAGINAS = 500;
const TABLA_INEXISTENTE = "42P01";

// Respaldo en memoria mientras la migración 0011 no esté aplicada.
const memoria = { valor: null, detalle: null, actualizado_en: null };
let enCurso = null;

async function leerEstado(pool) {
  try {
    const { rows } = await pool.query(`select valor, detalle, actualizado_en from sync_control where clave = $1`, [CLAVE]);
    return rows[0] || null;
  } catch (err) {
    if (err.code !== TABLA_INEXISTENTE) throw err;
    return memoria.actualizado_en ? { ...memoria } : null;
  }
}

async function guardarEstado(pool, valor, detalle) {
  try {
    await pool.query(
      `insert into sync_control (clave, valor, detalle, actualizado_en) values ($1, $2, $3, now())
       on conflict (clave) do update set
         valor = coalesce(excluded.valor, sync_control.valor),
         detalle = excluded.detalle,
         actualizado_en = now()`,
      [CLAVE, valor, detalle]
    );
  } catch (err) {
    if (err.code !== TABLA_INEXISTENTE) throw err;
    if (valor) memoria.valor = valor;
    memoria.detalle = detalle;
    memoria.actualizado_en = new Date().toISOString();
  }
}

// Punto de partida si nunca hubo un refresco: el inicio de la última limpieza
// completa (que también llenó la caché) o, en su defecto, las últimas 48 h.
async function anclaInicial(pool) {
  const { rows } = await pool.query(
    `select iniciado_en from sync_runs
     where estado = 'completado' and not parcial and tipo in ('incremental', 'backfill_completo')
     order by iniciado_en desc limit 1`
  );
  return rows[0]?.iniciado_en || new Date(Date.now() - 48 * 60 * 60 * 1000);
}

async function refrescar() {
  const pool = getPool();
  const inicio = new Date();
  const estado = await leerEstado(pool);
  const ancla = estado?.valor || (await anclaInicial(pool));
  const updatedSince = new Date(new Date(ancla).getTime() - SOLAPE_MS).toISOString();

  let cursor;
  let paginas = 0;
  let leidos = 0;
  let completo = true;
  try {
    while (true) {
      const { people, pageInfo } = await fetchPeoplePage({ cursor, limit: 100, updatedSince });
      paginas++;
      leidos += people.length;
      const filas = people.map((p) => filaCache(p));
      try {
        await upsertClientes(pool, filas);
      } catch {
        // Un registro con datos inválidos no debe tumbar la página entera.
        for (const fila of filas) {
          await upsertClientes(pool, [fila]).catch((err) =>
            console.error(`[refresco] No se pudo guardar ${fila[0]}: ${err.message}`)
          );
        }
      }
      if (!pageInfo.hasNextPage) break;
      if (paginas >= MAX_PAGINAS) {
        completo = false;
        break;
      }
      cursor = pageInfo.endCursor;
    }
  } catch (err) {
    await guardarEstado(
      pool,
      null,
      JSON.stringify({ ok: false, error: err.message, leidos, inicio: inicio.toISOString() })
    ).catch(() => {});
    throw err;
  }

  // Estados de encuestas que no llegaron a Twenty (Twenty caído al cerrar la encuesta).
  const cola = await procesarReintentosTwenty(pool);

  const resumen = {
    ok: true,
    leidos,
    completo,
    inicio: inicio.toISOString(),
    segundos: Math.round((Date.now() - inicio.getTime()) / 1000),
    cola_twenty: cola.procesados ? cola : undefined,
  };
  await guardarEstado(pool, completo ? inicio.toISOString() : null, JSON.stringify(resumen));
  return resumen;
}

// Una sola pasada a la vez en este proceso: si ya hay una en curso, se reutiliza.
function refrescarCache() {
  if (!enCurso) {
    enCurso = refrescar().finally(() => {
      enCurso = null;
    });
  }
  return enCurso;
}

async function estadoRefresco() {
  const estado = await leerEstado(getPool());
  if (!estado) return { enCurso: Boolean(enCurso), ultimo: null };
  let detalle = null;
  try {
    detalle = estado.detalle ? JSON.parse(estado.detalle) : null;
  } catch {
    detalle = { ok: false, error: estado.detalle };
  }
  return { enCurso: Boolean(enCurso), ancla: estado.valor, actualizado_en: estado.actualizado_en, ultimo: detalle };
}

module.exports = { refrescarCache, estadoRefresco };
