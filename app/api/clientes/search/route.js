import { NextResponse } from "next/server";
import { getPool } from "../../../../lib/db";
import {
  fetchPeoplePage,
  twentyConfigurado,
  twentyEnVivoDisponible,
  registrarFalloEnVivo,
} from "../../../../lib/twenty";
import { filaCache, upsertClientes } from "../../../../lib/clientes";
import { mesGestionActivo } from "../../../../lib/gestion";
import { pdvsConMetaAlcanzada, marcarMetaAlcanzada } from "../../../../lib/meta";

export const dynamic = "force-dynamic";

// Timeout defensivo para no degradar la UX si Twenty tiene lentitud: si no
// responde a tiempo, se responde con lo que haya en la caché local.
const TIMEOUT_TWENTY_MS = 6000;
const LIMITE_RESULTADOS = 15;

// El término va dentro de la sintaxis de filtros de Twenty (`or(campo[ilike]:%q%,...)`):
// comas, paréntesis y dos puntos romperían o alterarían la expresión.
function terminoParaTwenty(q) {
  return q.replace(/[(),:%\\]/g, " ").replace(/\s+/g, " ").trim();
}

// Escapa comodines de LIKE para que "%" o "_" tecleados se busquen literalmente.
function terminoParaLike(q) {
  return q.replace(/[\\%_]/g, (c) => `\\${c}`);
}

// Búsqueda multi-campo en clientes_cache, solo del mes de gestión activo (el
// histórico no se encuesta).
//
// Se excluye a quien pidió no ser contactado (NO_LLAMAR) o dice que ya lo
// encuestaron (YA_LE_REALIZARON_LA_ENCUESTA). EFECTIVA en Twenty NO excluye: el
// encuestador a veces lo marca a mano en Twenty al terminar la llamada y recién
// después registra la encuesta aquí; si se ocultara, no podría registrarla. Lo que
// decide "ya encuestado" es la encuesta guardada en la app: en este mismo registro,
// o con el mismo código en el MISMO mes de gestión (un cliente que vuelve a comprar
// entra otra vez en la base del mes siguiente con registro nuevo y debe poder
// encuestarse). Son dos NOT EXISTS y no uno con OR: así cada uno usa su índice
// parcial de encuestas en vez de recorrer la copia local completa.
async function buscarEnCache(pool, q, meses) {
  const { rows } = await pool.query(
    `select id_twenty, nombre, codigo_cliente, pdv, mes_gestion, id_edimca, status, telefono1, total, fecha_atencion, etiqueta
     from clientes_cache
     where (nombre ilike $1 or codigo_cliente ilike $1 or telefono1 ilike $1 or id_edimca ilike $1)
       and upper(trim(mes_gestion)) = any($2::text[])
       and (
         status is null
         or upper(replace(trim(status), ' ', '_')) not in ('NO_LLAMAR', 'YA_LE_REALIZARON_LA_ENCUESTA')
       )
       and not exists (
         select 1 from encuestas e
         where e.completada and e.cliente_twenty_id = clientes_cache.id_twenty
       )
       and not exists (
         select 1 from encuestas e
         left join clientes_cache ce on ce.id_twenty = e.cliente_twenty_id
         where e.completada
           and clientes_cache.codigo_cliente is not null
           and e.codigo_cliente = clientes_cache.codigo_cliente
           and (ce.id_twenty is null or upper(trim(ce.mes_gestion)) = upper(trim(clientes_cache.mes_gestion)))
       )
     order by nombre asc
     limit ${LIMITE_RESULTADOS}`,
    [`%${terminoParaLike(q)}%`, meses]
  );

  // Deduplicar defensivamente por codigo_cliente
  const vistos = new Set();
  return rows.filter((r) => {
    const key = r.codigo_cliente || r.id_twenty;
    if (vistos.has(key)) return false;
    vistos.add(key);
    return true;
  });
}

// Trae de Twenty los clientes que coinciden con lo tecleado y los guarda en la copia
// local. Lanza el error de Twenty; un fallo al guardar no se confunde con Twenty caído.
async function traerDeTwenty(pool, qTwenty, meses) {
  // Si se tecleó un número (código de cliente, id EDIMCA o teléfono) no hace
  // falta buscar en los nombres, y el código se busca exacto: consulta más liviana.
  const esNumero = /^\d{4,}$/.test(qTwenty);
  const orConditions = esNumero
    ? [`codigoCliente[eq]:${qTwenty}`, `idEdimca[eq]:${qTwenty}`, `telefono1[ilike]:%${qTwenty}%`]
    : [
        `name.firstName[ilike]:%${qTwenty}%`,
        `name.lastName[ilike]:%${qTwenty}%`,
        `codigoCliente[ilike]:%${qTwenty}%`,
        `telefono1[ilike]:%${qTwenty}%`,
        `idEdimca[ilike]:%${qTwenty}%`,
      ];
  const condMeses = meses.map((m) => `mesGestion[ilike]:%${m}%`);
  const filtroMeses = condMeses.length === 1 ? condMeses[0] : `or(${condMeses.join(",")})`;
  const filter = `and(or(${orConditions.join(",")}),${filtroMeses})`;

  const { people } = await fetchPeoplePage({
    limit: 25,
    filter,
    timeoutMs: TIMEOUT_TWENTY_MS,
    reintentos: 0,
  });
  try {
    await upsertClientes(pool, people.map((p) => filaCache(p)));
  } catch (err) {
    console.error("No se pudo guardar en la copia local lo traído de Twenty:", err.message);
  }
}

// La búsqueda va primero contra la copia local, que el refresco mantiene al día cada
// pocos minutos: responde al instante y no gasta una consulta a Twenty por cada
// pausa al teclear (con varios encuestadores eso saturaba la API de Twenty y cada
// búsqueda esperaba su respuesta). Solo si la copia local no tiene coincidencias se
// pregunta a Twenty, para el cliente cargado hace instantes que aún no llegó. Los
// datos vigentes del cliente elegido se traen de Twenty al abrirlo
// (/api/clientes/[id]).
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const q = (searchParams.get("q") || "").trim().slice(0, 100);
    const pool = getPool();
    // Solo el mes de gestión activo (ver lib/gestion.js): con un cliente repetido en
    // dos meses, el encuestador solo ve el registro del mes que se está trabajando.
    const { nombre: mesActivo, periodo } = await mesGestionActivo(pool);
    const mesesPermitidos = [mesActivo];

    if (q.length < 3) {
      return NextResponse.json({ results: [], mesesPermitidos });
    }

    let results = await buscarEnCache(pool, q, mesesPermitidos);
    let twentyDisponible = null;
    let twentyMotivo = null;

    const qTwenty = terminoParaTwenty(q);
    if (!results.length && twentyConfigurado() && qTwenty.length >= 3) {
      if (!twentyEnVivoDisponible()) {
        // Twenty no respondió hace poco: no se le vuelve a esperar en cada búsqueda.
        twentyDisponible = false;
        twentyMotivo = "lento";
      } else {
        try {
          await traerDeTwenty(pool, qTwenty, mesesPermitidos);
          twentyDisponible = true;
          results = await buscarEnCache(pool, q, mesesPermitidos);
        } catch (twentyErr) {
          registrarFalloEnVivo(twentyErr);
          twentyDisponible = false;
          twentyMotivo = /no respondió/.test(twentyErr.message) ? "lento" : "error";
          console.warn("Aviso en búsqueda en vivo con Twenty CRM:", twentyErr.message);
        }
      }
    }

    // Los clientes de un PDV que ya cumplió la meta del mes se siguen mostrando, pero
    // marcados para que no se encuesten (el guardado también lo rechaza).
    try {
      const { pdvs } = await pdvsConMetaAlcanzada(periodo, pool);
      results = marcarMetaAlcanzada(results, pdvs);
    } catch (metaErr) {
      console.error("No se pudo calcular la meta por PDV en la búsqueda:", metaErr);
    }

    return NextResponse.json({ results, twentyDisponible, twentyMotivo, mesesPermitidos });
  } catch (err) {
    console.error("Error en búsqueda de clientes:", err);
    return NextResponse.json({ error: "No se pudo completar la búsqueda", results: [] }, { status: 500 });
  }
}
