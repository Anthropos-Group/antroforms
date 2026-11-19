// Reemplazos de la muestra (Cooperativa 23 de Julio, base del sorteo).
//
// Cada principal tiene un reemplazo vinculado que se carga en RESERVA (el
// encuestador no lo ve). Cuando un socio acumula N llamadas cerradas como «No
// contesta» (tenant().reemplazos.intentosSinContacto, 3), queda AGOTADO (sale de
// la lista) y, si es principal, su reemplazo pasa a PENDIENTE.
//
// La activación se intenta enseguida al guardar la llamada y, si Twenty no
// respondió, la repite el refresco (barrerReemplazos): es idempotente.
const { tenant } = require("./tenant");
const { patchEstado, twentyConfigurado } = require("./twenty");

// Llamadas en las que no se logró hablar con el socio: cuentan para agotarlo.
const SIN_CONTACTO = ["no_contesta", "no_contacto"];

function configReemplazos() {
  return tenant().reemplazos || null;
}

// ¿Esta llamada agota al socio? `noContactos` incluye la llamada que se guarda.
function agotaAlSocio(resultado, noContactos, config = configReemplazos()) {
  if (!config) return false;
  return SIN_CONTACTO.includes(resultado) && noContactos >= config.intentosSinContacto;
}

// Principales agotados (o bloqueados, p. ej. menores de edad) cuyo reemplazo sigue
// en reserva (en la copia local, que guarda el registro completo de Twenty en
// `raw`). Con `principalId` solo ese.
async function reemplazosPorActivar(db, { principalId = null, limite = 50 } = {}) {
  const config = configReemplazos();
  if (!config) return [];
  const activan = [config.estadoAgotado, ...(config.estadosQueActivan || [])];
  const { rows } = await db.query(
    `select p.id_twenty as principal, p.codigo_cliente as codigo_principal,
            r.id_twenty as reemplazo, r.id_edimca as codigo_muestra
     from clientes_cache p
     join clientes_cache r on r.id_edimca = p.raw->>'idVinculado'
     where upper(p.status) = any($1::text[])
       and p.raw->>'condicion' = 'PRINCIPAL'
       and upper(r.status) = $2
       and ($3::uuid is null or p.id_twenty = $3)
     limit $4`,
    [activan, config.estadoReserva, principalId, limite]
  );
  return rows;
}

// Pasa a PENDIENTE (en Twenty y en la copia local) los reemplazos por activar.
async function activarReemplazos(db, opciones = {}) {
  const config = configReemplazos();
  const resultado = { activados: 0, fallidos: 0 };
  if (!config || !twentyConfigurado()) return resultado;
  for (const r of await reemplazosPorActivar(db, opciones)) {
    try {
      await patchEstado(r.reemplazo, config.estadoActivo, { timeoutMs: 10_000, reintentos: 1 });
      await db.query(`update clientes_cache set status = $1, synced_at = now() where id_twenty = $2`, [
        config.estadoActivo,
        r.reemplazo,
      ]);
      resultado.activados++;
      console.log(`[reemplazos] ${r.codigo_muestra} activado (principal ${r.codigo_principal} agotado)`);
    } catch (err) {
      resultado.fallidos++;
      console.error(`[reemplazos] No se pudo activar ${r.codigo_muestra}: ${err.message}`);
    }
  }
  return resultado;
}

module.exports = {
  SIN_CONTACTO,
  agotaAlSocio,
  reemplazosPorActivar,
  activarReemplazos,
  configReemplazos,
};
