// Meta mensual por punto de venta (PDV): cuando un PDV llega a la meta de encuestas
// efectivas del mes de gestión (25/25 por defecto), sus clientes siguen apareciendo
// en el buscador pero marcados "Meta alcanzada" y ya no se pueden encuestar.
//
// El conteo es el MISMO del monitoreo (una encuesta completada cuenta para el mes de
// gestión de su cliente), así lo que ve el encuestador coincide con la pantalla.
const { getPool } = require("./db");
const { memo, invalidar } = require("./cache");
const {
  MESES_ES,
  rangoMesEcuador,
  periodoAnterior,
  nombreMesDePeriodo,
} = require("./fecha");

// Valor por defecto si la migración 0009 (meta configurable) aún no se aplicó.
const META_MENSUAL_POR_PDV_DEFAULT = 25;
// La búsqueda consulta esto en cada pausa al teclear: se comparte por unos segundos.
// Al guardar una encuesta se invalida, y el guardado vuelve a contar dentro de su
// transacción, así que este margen nunca deja pasar de la meta.
const CACHE_META_MS = 15_000;
const PREFIJO_CACHE = "meta:";

async function metaMensual(db = getPool()) {
  try {
    const { rows } = await db.query(
      `select meta_mensual_pdv from cuestionarios where activo = true order by created_at desc limit 1`
    );
    return rows[0]?.meta_mensual_pdv || META_MENSUAL_POR_PDV_DEFAULT;
  } catch {
    return META_MENSUAL_POR_PDV_DEFAULT;
  }
}

// Condición SQL (alias `e` = encuestas, `cc` = clientes_cache, con $1..$6) de las
// encuestas completadas que cuentan para el mes de gestión `mes` ("AAAA-MM").
function filtroEncuestasDelMes(mes) {
  const nombreMes = nombreMesDePeriodo(mes);
  const siguiente = rangoMesEcuador(rangoMesEcuador(mes).fin.slice(0, 7)).mes;
  // Ventana amplia para distinguir el año (el mes de gestión del cliente no lo trae):
  // desde el mes anterior hasta el siguiente.
  const ventanaInicio = rangoMesEcuador(periodoAnterior(mes)).inicio;
  const ventanaFin = rangoMesEcuador(siguiente).fin;
  // Clientes sin mes reconocible: cuentan en el mes calendario de la encuesta.
  const { inicio: sinMesInicio, fin: sinMesFin } = rangoMesEcuador(mes);
  return {
    sql: `e.completada = true
    and (
      (upper(trim(cc.mes_gestion)) = $1 and e.created_at >= $2 and e.created_at < $3)
      or (coalesce(upper(trim(cc.mes_gestion)), '') <> all($4::text[]) and e.created_at >= $5 and e.created_at < $6)
    )`,
    valores: [nombreMes, ventanaInicio, ventanaFin, MESES_ES, sinMesInicio, sinMesFin],
  };
}

// Encuestas completadas del mes en un PDV. Acepta el cliente de una transacción
// abierta (el guardado cuenta dentro de ella).
async function completadasDelPdv(db, pdv, mes) {
  const { sql, valores } = filtroEncuestasDelMes(mes);
  const { rows } = await db.query(
    `select count(*)::int as n
     from encuestas e
     join clientes_cache cc on cc.id_twenty = e.cliente_twenty_id
     where trim(cc.pdv) = $7 and ${sql}`,
    [...valores, String(pdv).trim()]
  );
  return rows[0].n;
}

// PDVs (nombre sin espacios sobrantes) que ya cumplieron la meta del mes.
function pdvsConMetaAlcanzada(mes, db = getPool()) {
  return memo(`${PREFIJO_CACHE}${mes}`, CACHE_META_MS, async () => {
    const { sql, valores } = filtroEncuestasDelMes(mes);
    const [meta, { rows }] = await Promise.all([
      metaMensual(db),
      db.query(
        `select trim(cc.pdv) as pdv, count(*)::int as completadas
         from encuestas e
         join clientes_cache cc on cc.id_twenty = e.cliente_twenty_id
         where cc.pdv is not null and trim(cc.pdv) != '' and ${sql}
         group by 1`,
        valores
      ),
    ]);
    return {
      meta,
      pdvs: new Set(rows.filter((r) => r.completadas >= meta).map((r) => r.pdv)),
    };
  });
}

// Marca cada cliente con `meta_alcanzada` según su PDV (función pura, para pruebas).
function marcarMetaAlcanzada(clientes, pdvs) {
  return clientes.map((c) => ({ ...c, meta_alcanzada: Boolean(c.pdv) && pdvs.has(String(c.pdv).trim()) }));
}

function invalidarMeta() {
  invalidar(PREFIJO_CACHE);
  // El monitoreo muestra el mismo avance: se recalcula con la encuesta nueva.
  invalidar("monitoreo:");
}

module.exports = {
  META_MENSUAL_POR_PDV_DEFAULT,
  metaMensual,
  filtroEncuestasDelMes,
  completadasDelPdv,
  pdvsConMetaAlcanzada,
  marcarMetaAlcanzada,
  invalidarMeta,
};
