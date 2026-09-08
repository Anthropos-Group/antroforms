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

    // Búsqueda multi-campo: Nombre, Código de cliente, Teléfono o ID Edimca / Cédula
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

    let { rows } = await pool.query(
      `select id_twenty, nombre, codigo_cliente, pdv, mes_gestion, id_edimca, status, telefono1, total, fecha_atencion, etiqueta
       from clientes_cache
       where ${condiciones.join(" and ")}
       order by nombre asc
       limit 15`,
      valores
    );

    // Si no se encontraron resultados en caché, buscar directamente en Twenty CRM (Live Fallback)
    if (rows.length === 0 && process.env.TWENTY_API_URL && process.env.TWENTY_API_KEY) {
      try {
        const isNumeric = /^\d+$/.test(q);
        const searchField = isNumeric
          ? (q.startsWith("09") ? "telefono1" : "codigoCliente")
          : "name.firstName";
        const filterParts = [`${searchField}[ilike]:%${q}%`];
        if (mesGestion && mesGestion !== "TODOS") {
          filterParts.push(`mesGestion[ilike]:%${mesGestion}%`);
        }

        const params = new URLSearchParams({
          limit: "15",
          filter: filterParts.join(","),
        });

        const twentyRes = await fetch(`${process.env.TWENTY_API_URL}/people?${params.toString()}`, {
          headers: {
            Authorization: `Bearer ${process.env.TWENTY_API_KEY}`,
            "Content-Type": "application/json",
          },
        });

        if (twentyRes.ok) {
          const twentyData = await twentyRes.json();
          const people = twentyData.data?.people || [];

          const EXCLUDED_STATUSES = ["EFECTIVA", "NO_LLAMAR", "YA_LE_REALIZARON_LA_ENCUESTA"];

          const validPeople = people.filter((p) => {
            const st = (p.status || "").toUpperCase().replace(/\s+/g, "_").trim();
            return !EXCLUDED_STATUSES.includes(st);
          });

          for (const person of validPeople) {
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

            rows.push({
              id_twenty: person.id,
              nombre,
              codigo_cliente: person.codigoCliente ?? null,
              pdv: person.nombrePuntoVenta ?? null,
              mes_gestion: person.mesGestion ?? null,
              id_edimca: person.idEdimca ?? null,
              status: person.status ?? null,
              telefono1: person.telefono1 ?? null,
              total: person.total ?? null,
              fecha_atencion: person.djulfechaRpdivj ?? null,
              etiqueta: person.etiqueta ?? null,
            });
          }
        }
      } catch (twentyErr) {
        console.warn("Aviso en live fallback Twenty CRM:", twentyErr.message);
      }
    }

    return NextResponse.json({ results: rows });
  } catch (err) {
    console.error("Error en búsqueda de clientes:", err);
    return NextResponse.json({ error: err.message, results: [] }, { status: 500 });
  }
}
