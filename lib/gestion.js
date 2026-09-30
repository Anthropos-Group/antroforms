// Mes de gestión activo: el ÚNICO mes cuyos clientes ve y puede encuestar el
// encuestador. Un solo mes a la vez evita que, con un cliente repetido en dos
// meses (misma persona, otro código), se encueste el registro del mes viejo y el
// del mes nuevo quede vacío, o que después se duplique la encuesta.
//
// Parámetro 'mes_gestion' (tabla configuracion), editable en Admin → Monitoreo:
//   { modo: "automatico", umbral: 100 }  (por defecto)
//       El mes siguiente se activa solo en cuanto su base está cargada: cuando
//       la copia local tiene al menos `umbral` clientes de ese mes creados en
//       Twenty en las últimas semanas (la base se sube el lunes previo).
//   { modo: "manual", periodo: "2026-11", desde: "2026-10-26T13:00:00Z" | null }
//       El admin fija el mes; con `desde` se programa la hora del cambio.
// En ambos modos el mes activo nunca es anterior al mes calendario: el día 1 se
// pasa al mes nuevo aunque nadie haya hecho nada.
const { getPool } = require("./db");
const { mesISOEcuador, rangoMesEcuador, nombreMesDePeriodo, periodoSiguiente } = require("./fecha");

const CLAVE = "mes_gestion";
const CONFIG_DEFAULT = { modo: "automatico", umbral: 100 };
const TABLA_INEXISTENTE = "42P01";
const CACHE_MS = 60_000;
// Ventana para considerar "base nueva" a los clientes del mes siguiente: creados
// en Twenty desde unos días antes del inicio del mes calendario en curso.
const DIAS_VENTANA_CARGA = 10;

let cache = null;

function validarConfig(entrada) {
  const modo = entrada?.modo === "manual" ? "manual" : "automatico";
  if (modo === "automatico") {
    const umbral = Number(entrada?.umbral ?? CONFIG_DEFAULT.umbral);
    if (!Number.isInteger(umbral) || umbral < 1 || umbral > 100000) {
      return { error: "El umbral debe ser un número entero entre 1 y 100000" };
    }
    return { config: { modo, umbral } };
  }
  const periodo = String(entrada?.periodo || "");
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(periodo)) return { error: "Mes inválido (formato AAAA-MM)" };
  let desde = null;
  if (entrada?.desde) {
    const fecha = new Date(entrada.desde);
    if (Number.isNaN(fecha.getTime())) return { error: "Fecha de activación inválida" };
    desde = fecha.toISOString();
  }
  return { config: { modo, periodo, desde } };
}

async function leerConfig(pool) {
  try {
    const { rows } = await pool.query(`select valor from configuracion where clave = $1`, [CLAVE]);
    return rows[0] ? validarConfig(rows[0].valor).config || CONFIG_DEFAULT : CONFIG_DEFAULT;
  } catch (err) {
    if (err.code === TABLA_INEXISTENTE) return CONFIG_DEFAULT;
    throw err;
  }
}

async function guardarConfig(entrada, pool = getPool()) {
  const { config, error } = validarConfig(entrada);
  if (error) return { error };
  await pool.query(
    `insert into configuracion (clave, valor, actualizado_en) values ($1, $2, now())
     on conflict (clave) do update set valor = excluded.valor, actualizado_en = now()`,
    [CLAVE, JSON.stringify(config)]
  );
  cache = null;
  return { config };
}

// Clientes del mes `nombreMes` recién cargados (base del mes siguiente).
async function contarBaseCargada(pool, nombreMes, desde) {
  const { rows } = await pool.query(
    `select count(*)::int as n from clientes_cache
     where upper(trim(mes_gestion)) = $1
       and coalesce(
             case when raw->>'createdAt' ~ '^\\d{4}-\\d{2}-\\d{2}' then (raw->>'createdAt')::timestamptz end,
             synced_at
           ) >= $2`,
    [nombreMes, desde]
  );
  return rows[0].n;
}

// Decide el mes activo a partir de la configuración (función pura, para pruebas).
function resolverPeriodo({ config, calendario, cargadosSiguiente, ahora = new Date() }) {
  const siguiente = periodoSiguiente(calendario);
  if (config.modo === "manual") {
    const vigente = !config.desde || ahora >= new Date(config.desde);
    if (vigente && config.periodo > calendario) return { periodo: config.periodo, origen: "manual" };
    return { periodo: calendario, origen: "calendario" };
  }
  if (cargadosSiguiente >= config.umbral) return { periodo: siguiente, origen: "automatico" };
  return { periodo: calendario, origen: "calendario" };
}

async function estadoMesGestion(pool = getPool(), ahora = new Date()) {
  if (cache && Date.now() - cache.t < CACHE_MS) return cache.valor;
  const config = await leerConfig(pool);
  const calendario = mesISOEcuador(ahora);
  const siguiente = periodoSiguiente(calendario);
  const desdeCarga = new Date(new Date(rangoMesEcuador(calendario).inicio).getTime() - DIAS_VENTANA_CARGA * 86_400_000);
  const cargadosSiguiente = await contarBaseCargada(pool, nombreMesDePeriodo(siguiente), desdeCarga.toISOString());
  const { periodo, origen } = resolverPeriodo({ config, calendario, cargadosSiguiente, ahora });
  const valor = {
    periodo,
    nombre: nombreMesDePeriodo(periodo),
    origen,
    calendario,
    siguiente: { periodo: siguiente, nombre: nombreMesDePeriodo(siguiente), cargados: cargadosSiguiente },
    config,
  };
  cache = { t: Date.now(), valor };
  return valor;
}

async function mesGestionActivo(pool = getPool()) {
  const { periodo, nombre } = await estadoMesGestion(pool);
  return { periodo, nombre };
}

function esMesActivo(mesGestionCliente, nombreActivo) {
  return String(mesGestionCliente || "").trim().toUpperCase() === nombreActivo;
}

module.exports = {
  CONFIG_DEFAULT,
  validarConfig,
  resolverPeriodo,
  estadoMesGestion,
  mesGestionActivo,
  guardarConfig,
  esMesActivo,
};
