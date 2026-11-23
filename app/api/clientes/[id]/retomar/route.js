import { NextResponse } from "next/server";
import { getPool } from "../../../../../lib/db";
import { esUUID, errorJson, conErrores } from "../../../../../lib/http";
import { tenant } from "../../../../../lib/tenant";

export const dynamic = "force-dynamic";

// Última encuesta a medias de un cliente (cerrada como «parcial» o «cita»), para
// retomarla donde quedó: otro día, con otra persona de la empresa o desde otro
// dispositivo. Solo para clientes con `retomarParciales` en su configuración.
// Cada cierre guarda todo lo respondido hasta ese momento, así que basta la última.
export const GET = conErrores("GET /api/clientes/[id]/retomar", async (_request, { params }) => {
  const { id } = await params;
  if (!esUUID(id)) return errorJson("Id de cliente inválido");
  if (!tenant().retomarParciales) return NextResponse.json({ encuesta: null });

  const pool = getPool();
  const { rows } = await pool.query(
    `select e.id, e.created_at, e.resultado, e.ultimo_bloque, enc.nombre as encuestador
     from encuestas e
     join cuestionarios c on c.id = e.cuestionario_id and c.activo = true
     left join encuestadores enc on enc.id = e.encuestador_id
     where e.cliente_twenty_id = $1
     order by e.created_at desc
     limit 1`,
    [id]
  );
  const ultima = rows[0];
  if (!ultima || !["parcial", "cita"].includes(ultima.resultado)) return NextResponse.json({ encuesta: null });

  const { rows: resp } = await pool.query(`select pregunta_id, valor from respuestas where encuesta_id = $1`, [ultima.id]);
  return NextResponse.json({
    encuesta: {
      id: ultima.id,
      fecha: ultima.created_at,
      resultado: ultima.resultado,
      ultimo_bloque: ultima.ultimo_bloque,
      encuestador: ultima.encuestador,
      respuestas: Object.fromEntries(resp.map((r) => [r.pregunta_id, r.valor])),
    },
  });
});
