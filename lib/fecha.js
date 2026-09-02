const MESES_ES = [
  "ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO",
  "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE",
];

// Mes de gestión "actual" según la hora de Ecuador (UTC-5), sin depender de
// la zona horaria del servidor. Trunca a la hora en punto de UTC-5 corriendo
// el reloj 5 horas atrás y leyendo el mes en UTC (evita usar la zona local).
function mesActualUTC5(ahora = new Date()) {
  const desplazado = new Date(ahora.getTime() - 5 * 60 * 60 * 1000);
  return MESES_ES[desplazado.getUTCMonth()];
}

module.exports = { MESES_ES, mesActualUTC5 };
