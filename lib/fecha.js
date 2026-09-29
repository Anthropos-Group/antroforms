const MESES_ES = [
  "ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO",
  "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE",
];

// Ecuador continental es UTC-5 fijo (sin horario de verano).
const OFFSET_ECUADOR_MS = 5 * 60 * 60 * 1000;
const ZONA_ECUADOR = "America/Guayaquil";

// Mes de gestión "actual" según la hora de Ecuador (UTC-5), sin depender de
// la zona horaria del servidor. Trunca a la hora en punto de UTC-5 corriendo
// el reloj 5 horas atrás y leyendo el mes en UTC (evita usar la zona local).
function mesActualUTC5(ahora = new Date()) {
  const desplazado = new Date(ahora.getTime() - OFFSET_ECUADOR_MS);
  return MESES_ES[desplazado.getUTCMonth()];
}

function mesAnteriorUTC5(ahora = new Date()) {
  const desplazado = new Date(ahora.getTime() - OFFSET_ECUADOR_MS);
  const m = desplazado.getUTCMonth();
  const prevM = (m - 1 + 12) % 12;
  return MESES_ES[prevM];
}

// "YYYY-MM" del mes en curso en Ecuador.
function mesISOEcuador(ahora = new Date()) {
  return new Date(ahora.getTime() - OFFSET_ECUADOR_MS).toISOString().slice(0, 7);
}

// "YYYY-MM-DD" de hoy en Ecuador.
function hoyISOEcuador(ahora = new Date()) {
  return new Date(ahora.getTime() - OFFSET_ECUADOR_MS).toISOString().slice(0, 10);
}

// Límites [inicio, fin) de un mes calendario de Ecuador expresados en UTC.
// Antes se usaba medianoche UTC, lo que contaba las encuestas hechas entre las
// 19:00 y 24:00 del último día del mes (hora local) en el mes siguiente.
function rangoMesEcuador(yyyyMm) {
  const match = /^(\d{4})-(\d{2})$/.exec(yyyyMm || "");
  const [anio, mes] = match
    ? [Number(match[1]), Number(match[2])]
    : mesISOEcuador().split("-").map(Number);
  const inicio = new Date(Date.UTC(anio, mes - 1, 1) + OFFSET_ECUADOR_MS).toISOString();
  const fin = new Date(Date.UTC(anio, mes, 1) + OFFSET_ECUADOR_MS).toISOString();
  return { inicio, fin, mes: `${anio}-${String(mes).padStart(2, "0")}` };
}

function formatFechaHoraEcuador(valor) {
  if (!valor) return "";
  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) return String(valor);
  return fecha.toLocaleString("es-EC", { timeZone: ZONA_ECUADOR });
}

module.exports = {
  MESES_ES,
  ZONA_ECUADOR,
  mesActualUTC5,
  mesAnteriorUTC5,
  mesISOEcuador,
  hoyISOEcuador,
  rangoMesEcuador,
  formatFechaHoraEcuador,
};
