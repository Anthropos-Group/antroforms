import { NextResponse } from "next/server";
import { getPool } from "../../../lib/db";
import { validarPregunta, validarCondicionContraBD } from "../../../lib/preguntas";
import { errorJson, leerJson, conErrores } from "../../../lib/http";

export const dynamic = "force-dynamic";

async function getCuestionarioActivoId(pool) {
  const { rows } = await pool.query(
    `select id from cuestionarios where activo = true order by created_at desc limit 1`
  );
  return rows[0]?.id ?? null;
}

export const GET = conErrores("GET /api/preguntas", async () => {
  const pool = getPool();
  const cuestionarioId = await getCuestionarioActivoId(pool);
  if (!cuestionarioId) {
    return NextResponse.json({ cuestionario_id: null, preguntas: [] });
  }
  const { rows } = await pool.query(
    `select p.id, p.orden, p.numero_reporte, p.texto, p.tipo, p.requiere_justificacion, p.condicion, p.activa,
            (select count(*)::int from respuestas r where r.pregunta_id = p.id) as total_respuestas
     from preguntas p where p.cuestionario_id = $1
     order by p.orden asc`,
    [cuestionarioId]
  );
  return NextResponse.json({ cuestionario_id: cuestionarioId, preguntas: rows });
});

export const POST = conErrores("POST /api/preguntas", async (request) => {
  const body = await leerJson(request);
  if (!body) return errorJson("Cuerpo de la solicitud inválido");
  const { error, datos } = validarPregunta(body);
  if (error) return errorJson(error);

  const pool = getPool();
  const cuestionarioId = await getCuestionarioActivoId(pool);
  if (!cuestionarioId) {
    return errorJson("No hay cuestionario activo");
  }

  let ordenFinal = datos.orden;
  if (ordenFinal === undefined) {
    const { rows } = await pool.query(
      `select coalesce(max(orden), 0) + 1 as siguiente from preguntas where cuestionario_id = $1`,
      [cuestionarioId]
    );
    ordenFinal = rows[0].siguiente;
  }

  const errorCondicion = await validarCondicionContraBD(pool, {
    cuestionarioId,
    orden: ordenFinal,
    condicion: datos.condicion,
  });
  if (errorCondicion) return errorJson(errorCondicion);

  const { rows } = await pool.query(
    `insert into preguntas (cuestionario_id, orden, numero_reporte, texto, tipo, requiere_justificacion, condicion)
     values ($1, $2, $3, $4, $5, $6, $7)
     returning id, orden, numero_reporte, texto, tipo, requiere_justificacion, condicion, activa`,
    [
      cuestionarioId,
      ordenFinal,
      datos.numero_reporte ?? ordenFinal,
      datos.texto,
      datos.tipo,
      Boolean(datos.requiere_justificacion),
      datos.condicion ? JSON.stringify(datos.condicion) : null,
    ]
  );
  return NextResponse.json(rows[0], { status: 201 });
});
