import { NextResponse } from "next/server";
import { getPool } from "../../../lib/db";
import { patchPerson } from "../../../lib/twenty";
import { obtenerReporte } from "../../../lib/reportes";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const desde = searchParams.get("desde");
    const hasta = searchParams.get("hasta");
    const encuestadorId = searchParams.get("encuestador_id");
    const mesGestion = searchParams.get("mes_gestion");
    const pdv = searchParams.get("pdv");

    let pool;
    try {
      pool = getPool();
    } catch (err) {
      return NextResponse.json({ error: `Error de BD: ${err.message}` }, { status: 500 });
    }

    const reporte = await obtenerReporte(pool, { desde, hasta, encuestadorId, mesGestion, pdv, limit: 1000 });
    if (!reporte) {
      return NextResponse.json({ preguntas: [], encuestas: [] });
    }

    return NextResponse.json({
      preguntas: reporte.cuestionario.preguntas.map((p) => ({
        id: p.id,
        orden: p.orden,
        numero_reporte: p.numero_reporte ?? p.orden,
        texto: p.texto,
        requiere_justificacion: p.requiere_justificacion,
      })),
      encuestas: reporte.encuestas.map((e) => ({
        id: e.id,
        created_at: e.created_at,
        completada: e.completada,
        codigo_cliente: e.codigo_cliente,
        encuestador_nombre: e.encuestador_nombre,
        cliente_nombre: e.cliente_nombre,
        pdv: e.pdv,
        mes_gestion: e.mes_gestion,
        respuestas: e.respuestas,
      })),
    });
  } catch (err) {
    console.error("Error en GET /api/encuestas:", err);
    return NextResponse.json({ error: err.message, preguntas: [], encuestas: [] }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const {
      cuestionario_id,
      cliente_twenty_id,
      codigo_cliente,
      encuestador_id,
      completada,
      respuestas,
    } = body;

    if (!cuestionario_id || !cliente_twenty_id || !encuestador_id || !Array.isArray(respuestas)) {
      return NextResponse.json({ error: "Faltan campos requeridos para registrar la encuesta" }, { status: 400 });
    }

    let pool;
    try {
      pool = getPool();
    } catch (err) {
      return NextResponse.json({ error: `Error de configuración de BD: ${err.message}` }, { status: 500 });
    }

    const client = await pool.connect();
    let encuestaId;

    try {
      await client.query("begin");

      // Idempotencia: Verificar si este cliente ya fue encuestado en los últimos 5 minutos por el mismo encuestador
      const { rows: dups } = await client.query(
        `select id from encuestas
         where cliente_twenty_id = $1
           and encuestador_id = $2
           and created_at > now() - interval '5 minutes'
         order by created_at desc
         limit 1`,
        [cliente_twenty_id, encuestador_id]
      );

      if (dups.length > 0) {
        await client.query("rollback");
        return NextResponse.json({
          id: dups[0].id,
          duplicada: true,
          mensaje: "Esta encuesta ya fue guardada recientemente.",
        });
      }

      const { rows } = await client.query(
        `insert into encuestas (cuestionario_id, cliente_twenty_id, codigo_cliente, encuestador_id, completada)
         values ($1, $2, $3, $4, $5)
         returning id`,
        [cuestionario_id, cliente_twenty_id, codigo_cliente ?? null, encuestador_id, !!completada]
      );
      encuestaId = rows[0].id;

      // Inserción multi-fila optimizada de respuestas en una sola llamada SQL
      if (respuestas.length > 0) {
        const placeholders = [];
        const params = [];
        let pIdx = 1;

        for (const r of respuestas) {
          if (!r.pregunta_id) continue;
          placeholders.push(`($${pIdx}, $${pIdx + 1}, $${pIdx + 2})`);
          params.push(encuestaId, r.pregunta_id, JSON.stringify(r.valor));
          pIdx += 3;
        }

        if (placeholders.length > 0) {
          await client.query(
            `insert into respuestas (encuesta_id, pregunta_id, valor) values ${placeholders.join(", ")}`,
            params
          );
        }
      }

      await client.query("commit");
    } catch (err) {
      await client.query("rollback");
      console.error("Error en transacción de encuesta:", err);
      return NextResponse.json({ error: `Error guardando encuesta: ${err.message}` }, { status: 500 });
    } finally {
      client.release();
    }

    // Sincronización con Twenty CRM con cola de contingencia
    let twentyError = null;
    if (completada) {
      try {
        await patchPerson(cliente_twenty_id, { status: "EFECTIVA" });
      } catch (err) {
        twentyError = err.message;
        console.error(`Twenty CRM no respondió para ${cliente_twenty_id}. Encolando reintento:`, err.message);

        // Guardar en cola de contingencia de reintentos
        try {
          await pool.query(
            `insert into pending_twenty_sync (cliente_twenty_id, status_target, ultimo_error)
             values ($1, 'EFECTIVA', $2)`,
            [cliente_twenty_id, err.message]
          );
        } catch (qErr) {
          // No romper si la tabla aún no se ha migrado
          console.warn("No se pudo registrar en pending_twenty_sync:", qErr.message);
        }
      }
    }

    return NextResponse.json({ id: encuestaId, twentyError });
  } catch (err) {
    console.error("Error general en POST /api/encuestas:", err);
    return NextResponse.json({ error: `Error en servidor: ${err.message}` }, { status: 500 });
  }
}
