import { NextResponse } from "next/server";
import { getPool } from "../../../../lib/db";
import { fetchPeoplePage, twentyConfigurado } from "../../../../lib/twenty";
import { filaCache, upsertClientes } from "../../../../lib/clientes";
import { mesGestionActivo } from "../../../../lib/gestion";

export const dynamic = "force-dynamic";

// Timeout defensivo para no degradar la UX si Twenty tiene lentitud: si no
// responde a tiempo, se busca igual en la caché local (que se refresca sola cada
// pocos minutos, así que igual incluye las altas recientes).
const TIMEOUT_TWENTY_MS = 6000;

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
    const pool = getPool();
    // Solo el mes de gestión activo (ver lib/gestion.js): con un cliente repetido en
    // dos meses, el encuestador solo ve el registro del mes que se está trabajando.
    const { nombre: mesActivo } = await mesGestionActivo(pool);
    const mesesPermitidos = [mesActivo];
    const meses = mesesPermitidos;

    if (q.length < 3) {
      return NextResponse.json({ results: [], mesesPermitidos });
    }

    let twentyDisponible = null;
    let twentyMotivo = null;

    // Sincronización en vivo con Twenty CRM: trae altas y cambios de estado en
    // tiempo real antes de buscar en la caché.
    const qTwenty = terminoParaTwenty(q);
    if (twentyConfigurado() && qTwenty.length >= 3) {
      try {
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
        await upsertClientes(pool, people.map((p) => filaCache(p)));
        twentyDisponible = true;
      } catch (twentyErr) {
        twentyDisponible = false;
        twentyMotivo = /no respondió/.test(twentyErr.message) ? "lento" : "error";
        console.warn("Aviso en live sync con Twenty CRM:", twentyErr.message);
      }
    }

    // Búsqueda multi-campo en clientes_cache (ya enriquecida y sincronizada en tiempo real)
    const valores = [`%${terminoParaLike(q)}%`];
    const condiciones = [
      "(nombre ilike $1 or codigo_cliente ilike $1 or telefono1 ilike $1 or id_edimca ilike $1)",
    ];

    // Solo el mes de gestión activo: el histórico no se encuesta.
    valores.push(meses);
    condiciones.push(`upper(trim(mes_gestion)) = any($${valores.length}::text[])`);

    // Excluir a quienes pidieron no ser contactados (NO_LLAMAR) o dicen que ya los
    // encuestaron (YA_LE_REALIZARON_LA_ENCUESTA). EFECTIVA en Twenty NO excluye: el
    // encuestador a veces lo marca a mano en Twenty al terminar la llamada y recién
    // después registra la encuesta aquí; si se ocultara, no podría registrarla. Lo que
    // decide "ya encuestado" es la encuesta guardada en la app (condición de abajo).
    condiciones.push(`(
      status is null
      or upper(replace(trim(status), ' ', '_')) not in ('NO_LLAMAR', 'YA_LE_REALIZARON_LA_ENCUESTA')
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

    return NextResponse.json({ results: resultadosUnicos, twentyDisponible, twentyMotivo, mesesPermitidos });
  } catch (err) {
    console.error("Error en búsqueda de clientes:", err);
    return NextResponse.json({ error: "No se pudo completar la búsqueda", results: [] }, { status: 500 });
  }
}
