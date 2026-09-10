import { NextResponse } from "next/server";
import { getPool } from "../../../../lib/db";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const q = (searchParams.get("q") || "").trim();
    const mesGestion = (searchParams.get("mes_gestion") || "").trim();

    if (q.length < 3) {
      return NextResponse.json({ results: [] });
    }

    let pool;
    try {
      pool = getPool();
    } catch (err) {
      return NextResponse.json(
        { error: `Error de base de datos: ${err.message}` },
        { status: 500 }
      );
    }

    // Sincronización en vivo con Twenty CRM:
    // Consultar directamente a Twenty CRM para traer altas y cambios de estado en tiempo real
    if (process.env.TWENTY_API_URL && process.env.TWENTY_API_KEY) {
      try {
        const orConditions = [
          `name.firstName[ilike]:%${q}%`,
          `name.lastName[ilike]:%${q}%`,
          `codigoCliente[ilike]:%${q}%`,
          `telefono1[ilike]:%${q}%`,
          `idEdimca[ilike]:%${q}%`,
        ];
        let filterExpr = `or(${orConditions.join(",")})`;
        if (mesGestion && mesGestion !== "TODOS") {
          filterExpr = `and(${filterExpr},mesGestion[ilike]:%${mesGestion}%)`;
        }

        const params = new URLSearchParams({
          limit: "25",
          filter: filterExpr,
        });

        // Timeout defensivo de 3.5 segundos para no degradar la UX si Twenty tiene lentitud
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3500);

        const twentyRes = await fetch(`${process.env.TWENTY_API_URL}/people?${params.toString()}`, {
          headers: {
            Authorization: `Bearer ${process.env.TWENTY_API_KEY}`,
            "Content-Type": "application/json",
          },
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (twentyRes.ok) {
          const twentyData = await twentyRes.json();
          const people = twentyData.data?.people || [];

          for (const person of people) {
            const first = person.name?.firstName ?? "";
            const last = person.name?.lastName ?? "";
            const nombre = [first, last].filter(Boolean).join(" ").trim();

            await pool.query(
              `insert into clientes_cache
                 (id_twenty, codigo_cliente, nombre, pdv, mes_gestion, id_edimca, status, telefono1, total, fecha_atencion, etiqueta, synced_at, raw)
               values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, now(), $12)
               on conflict (id_twenty) do update set
                 codigo_cliente = excluded.codigo_cliente,
                 nombre = excluded.nombre,
                 pdv = excluded.pdv,
                 mes_gestion = excluded.mes_gestion,
                 id_edimca = excluded.id_edimca,
                 status = excluded.status,
                 telefono1 = excluded.telefono1,
                 total = excluded.total,
                 fecha_atencion = excluded.fecha_atencion,
                 etiqueta = excluded.etiqueta,
                 synced_at = now(),
                 raw = excluded.raw`,
              [
                person.id,
                person.codigoCliente ?? null,
                nombre,
                person.nombrePuntoVenta ?? null,
                person.mesGestion ?? null,
                person.idEdimca ?? null,
                person.status ?? null,
                person.telefono1 ?? null,
                person.total ?? null,
                person.djulfechaRpdivj ?? null,
                person.etiqueta ?? null,
                JSON.stringify(person),
              ]
            );
          }
        }
      } catch (twentyErr) {
        console.warn("Aviso en live sync con Twenty CRM:", twentyErr.message);
      }
    }

    // Búsqueda multi-campo en clientes_cache (ya enriquecida y sincronizada en tiempo real)
    const condiciones = [
      "(nombre ilike $1 or codigo_cliente ilike $1 or telefono1 ilike $1 or id_edimca ilike $1)"
    ];
    const valores = [`%${q}%`];

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

    let { rows } = await pool.query(
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

    return NextResponse.json({ results: resultadosUnicos });
  } catch (err) {
    console.error("Error en búsqueda de clientes:", err);
    return NextResponse.json({ error: err.message, results: [] }, { status: 500 });
  }
}
