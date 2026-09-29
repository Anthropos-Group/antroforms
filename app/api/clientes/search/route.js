import { NextResponse } from "next/server";
import { getPool } from "../../../../lib/db";
import { fetchPeoplePage, twentyConfigurado } from "../../../../lib/twenty";
import { filaCache, upsertClientes } from "../../../../lib/clientes";

export const dynamic = "force-dynamic";

// Timeout defensivo para no degradar la UX si Twenty tiene lentitud: si no
// responde a tiempo, se busca igual en la caché local.
const TIMEOUT_TWENTY_MS = 3500;

// El término va dentro de la sintaxis de filtros de Twenty (`or(campo[ilike]:%q%,...)`):
// comas, paréntesis y dos puntos romperían o alterarían la expresión.
function terminoParaTwenty(q) {
  return q.replace(/[(),:%\\]/g, " ").replace(/\s+/g, " ").trim();
}

// Escapa comodines de LIKE para que "%" o "_" tecleados se busquen literalmente.
function terminoParaLike(q) {
  return q.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const q = (searchParams.get("q") || "").trim().slice(0, 100);
    const mesGestion = (searchParams.get("mes_gestion") || "").trim();

    if (q.length < 3) {
      return NextResponse.json({ results: [] });
    }

    const pool = getPool();
    let twentyDisponible = null;

    // Sincronización en vivo con Twenty CRM: trae altas y cambios de estado en
    // tiempo real antes de buscar en la caché.
    const qTwenty = terminoParaTwenty(q);
    if (twentyConfigurado() && qTwenty.length >= 3) {
      try {
        const orConditions = [
          `name.firstName[ilike]:%${qTwenty}%`,
          `name.lastName[ilike]:%${qTwenty}%`,
          `codigoCliente[ilike]:%${qTwenty}%`,
          `telefono1[ilike]:%${qTwenty}%`,
          `idEdimca[ilike]:%${qTwenty}%`,
        ];
        let filter = `or(${orConditions.join(",")})`;
        const mesTwenty = terminoParaTwenty(mesGestion);
        if (mesTwenty && mesTwenty !== "TODOS") {
          filter = `and(${filter},mesGestion[ilike]:%${mesTwenty}%)`;
        }

        const { people } = await fetchPeoplePage({
          limit: 25,
          filter,
          timeoutMs: TIMEOUT_TWENTY_MS,
          reintentos: 0,
        });
        await upsertClientes(pool, people.map((p) => filaCache(p)));
        twentyDisponible = true;
      } catch (twentyErr) {
        twentyDisponible = false;
        console.warn("Aviso en live sync con Twenty CRM:", twentyErr.message);
      }
    }

    // Búsqueda multi-campo en clientes_cache (ya enriquecida y sincronizada en tiempo real)
    const valores = [`%${terminoParaLike(q)}%`];
    const condiciones = [
      "(nombre ilike $1 or codigo_cliente ilike $1 or telefono1 ilike $1 or id_edimca ilike $1)",
    ];

    if (mesGestion && mesGestion !== "TODOS") {
      valores.push(mesGestion);
      condiciones.push(`upper(trim(mes_gestion)) = upper($${valores.length})`);
    }

    // Excluir clientes ya gestionados (EFECTIVA) o que solicitaron no ser contactados (NO_LLAMAR)
    condiciones.push(`(
      status is null
      or upper(replace(trim(status), ' ', '_')) not in ('EFECTIVA', 'NO_LLAMAR', 'YA_LE_REALIZARON_LA_ENCUESTA')
    )`);

    // Excluir de raíz cualquier cliente que ya tenga una encuesta completada en el sistema
    condiciones.push(`not exists (
      select 1 from encuestas e
      where (e.cliente_twenty_id = clientes_cache.id_twenty or (e.codigo_cliente = clientes_cache.codigo_cliente and clientes_cache.codigo_cliente is not null))
        and e.completada = true
    )`);

    const { rows } = await pool.query(
      `select id_twenty, nombre, codigo_cliente, pdv, mes_gestion, id_edimca, status, telefono1, total, fecha_atencion, etiqueta
       from clientes_cache
       where ${condiciones.join(" and ")}
       order by nombre asc
       limit 15`,
      valores
    );

    // Deduplicar defensivamente por codigo_cliente
    const vistos = new Set();
    const resultadosUnicos = [];
    for (const r of rows) {
      const key = r.codigo_cliente || r.id_twenty;
      if (!vistos.has(key)) {
        vistos.add(key);
        resultadosUnicos.push(r);
      }
    }

    return NextResponse.json({ results: resultadosUnicos, twentyDisponible });
  } catch (err) {
    console.error("Error en búsqueda de clientes:", err);
    return NextResponse.json({ error: "No se pudo completar la búsqueda", results: [] }, { status: 500 });
  }
}
