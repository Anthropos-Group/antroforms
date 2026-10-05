// Tareas programadas dentro del propio contenedor (arrancan desde instrumentation.js).
// No dependen de un cron externo: con "Pull and redeploy" en Portainer basta.
//
//  1. Keep-alive: consulta la base (y la API REST de Supabase, si está configurada)
//     cada KEEPALIVE_MINUTOS para que el plan gratuito no pause el proyecto por
//     inactividad.
//  2. Refresco de la copia local de clientes cada REFRESCO_MINUTOS: solo lee de
//     Twenty lo modificado (rápido) — así una carga nueva aparece en minutos.
//  3. Limpieza de datos en Twenty (PATCH por registro, lenta) en las horas de
//     SYNC_HORAS_ECUADOR, de noche para no cargar Twenty en horario de trabajo.
//     Si el contenedor estaba caído a esa hora, se recupera al volver (mismo día).
//
// Variables (todas opcionales):
//   TAREAS_PROGRAMADAS=off       desactiva todo (p. ej. si hay varias réplicas)
//   REFRESCO_MINUTOS=10          frecuencia del refresco de clientes (0 = desactivado)
//   SYNC_HORAS_ECUADOR=22        horas de la limpieza ("" = sin limpieza automática)
//   KEEPALIVE_MINUTOS=60
const { getPool } = require("./db");
const { iniciarSync } = require("./sync");
const { refrescarCache } = require("./refresco");
const { twentyConfigurado } = require("./twenty");
const { relojEcuador } = require("./fecha");

const CLAVE_GLOBAL = Symbol.for("antroforms.programador");
const HORAS_SYNC_DEFAULT = "22";
const REFRESCO_MINUTOS_DEFAULT = 10;
const KEEPALIVE_MINUTOS_DEFAULT = 60;
const OFFSET_ECUADOR_MS = 5 * 60 * 60 * 1000;

function parsearHoras(valor) {
  return [
    ...new Set(
      String(valor ?? "")
        .split(",")
        .map((h) => h.trim())
        .filter((h) => /^\d{1,2}$/.test(h))
        .map(Number)
        .filter((h) => h >= 0 && h <= 23)
    ),
  ].sort((a, b) => a - b);
}

// Último turno de sincronización de hoy (hora de Ecuador) que ya debió correr,
// o null si todavía no llega el primero del día.
function turnoVigente(horas, ahora = new Date()) {
  const { fecha, hora } = relojEcuador(ahora);
  const pasadas = horas.filter((h) => h <= hora);
  if (!pasadas.length) return null;
  const h = pasadas[pasadas.length - 1];
  const [anio, mes, dia] = fecha.split("-").map(Number);
  return {
    clave: `${fecha} ${String(h).padStart(2, "0")}:00`,
    desde: new Date(Date.UTC(anio, mes - 1, dia, h) + OFFSET_ECUADOR_MS),
  };
}

async function keepAlive() {
  await getPool().query("select 1");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && key) {
    const res = await fetch(`${url.replace(/\/+$/, "")}/rest/v1/`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (res.status >= 500) throw new Error(`API REST de Supabase respondió ${res.status}`);
  }
}

async function sincronizarSiToca(estado) {
  const turno = turnoVigente(estado.horas);
  if (!turno || turno.clave === estado.ultimoTurno) return;

  // Si ya hubo una corrida desde el inicio del turno (botón manual, otra réplica,
  // o el contenedor se reinició después de lanzarla), no se duplica.
  const { rows } = await getPool().query(`select 1 from sync_runs where iniciado_en >= $1 limit 1`, [
    turno.desde.toISOString(),
  ]);
  if (!rows[0]) {
    try {
      const { syncRunId } = await iniciarSync({ mode: "incremental", maxPages: 50 });
      console.log(`[programador] Sincronización ${turno.clave} iniciada (${syncRunId}).`);
    } catch (err) {
      if (err.code !== "SYNC_EN_CURSO") throw err;
    }
  }
  estado.ultimoTurno = turno.clave;
}

function iniciarTareasProgramadas() {
  if (globalThis[CLAVE_GLOBAL]) return;
  if (process.env.TAREAS_PROGRAMADAS === "off") return;
  // En `next dev` no se programan tareas salvo que se pida explícitamente.
  if (process.env.NODE_ENV !== "production" && process.env.TAREAS_PROGRAMADAS !== "on") return;
  if (!process.env.SUPABASE_DB_URL) return;

  const minutosRefresco = Number(process.env.REFRESCO_MINUTOS ?? REFRESCO_MINUTOS_DEFAULT);
  const estado = {
    horas: twentyConfigurado() ? parsearHoras(process.env.SYNC_HORAS_ECUADOR ?? HORAS_SYNC_DEFAULT) : [],
    refrescoMs: twentyConfigurado() && minutosRefresco > 0 ? minutosRefresco * 60_000 : 0,
    ultimoTurno: null,
    ultimoKeepAlive: 0,
    ultimoRefresco: 0,
    ocupado: false,
  };
  const keepAliveMs = (Number(process.env.KEEPALIVE_MINUTOS) || KEEPALIVE_MINUTOS_DEFAULT) * 60_000;
  globalThis[CLAVE_GLOBAL] = estado;

  async function tick() {
    if (estado.ocupado) return;
    estado.ocupado = true;
    try {
      if (Date.now() - estado.ultimoKeepAlive >= keepAliveMs) {
        try {
          await keepAlive();
          estado.ultimoKeepAlive = Date.now();
        } catch (err) {
          console.error("[programador] Keep-alive de Supabase falló:", err.message);
        }
      }
      if (estado.refrescoMs && Date.now() - estado.ultimoRefresco >= estado.refrescoMs) {
        estado.ultimoRefresco = Date.now();
        try {
          const r = await refrescarCache();
          if (r.leidos) console.log(`[programador] Copia local de clientes: ${r.leidos} actualizados en ${r.segundos}s.`);
        } catch (err) {
          console.error("[programador] No se pudo refrescar la copia local de clientes:", err.message);
        }
      }
      if (estado.horas.length) {
        try {
          await sincronizarSiToca(estado);
        } catch (err) {
          console.error("[programador] No se pudo lanzar la sincronización programada:", err.message);
        }
      }
    } finally {
      estado.ocupado = false;
    }
  }

  setTimeout(tick, 15_000).unref();
  setInterval(tick, 60_000).unref();
  console.log(
    `[programador] Keep-alive cada ${keepAliveMs / 60_000} min; refresco de clientes ${
      estado.refrescoMs ? `cada ${estado.refrescoMs / 60_000} min` : "desactivado"
    }; limpieza en Twenty ${
      estado.horas.length ? `a las ${estado.horas.map((h) => `${h}:00`).join(" y ")} (Ecuador)` : "desactivada"
    }.`
  );
}

module.exports = { iniciarTareasProgramadas, parsearHoras, turnoVigente };
