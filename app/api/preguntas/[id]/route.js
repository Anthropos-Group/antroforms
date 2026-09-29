import { NextResponse } from "next/server";
import { getPool } from "../../../../lib/db";
import { validarPregunta, validarCondicionContraBD } from "../../../../lib/preguntas";
import { esUUID, errorJson, leerJson, conErrores } from "../../../../lib/http";

export const dynamic = "force-dynamic";

export const PATCH = conErrores("PATCH /api/preguntas/[id]", async (request, { params }) => {
  const { id } = await params;
  if (!esUUID(id)) return errorJson("Pregunta no encontrada", 404);
  const body = await leerJson(request);
  if (!body) return errorJson("Cuerpo de la solicitud inválido");

  const { error, datos } = validarPregunta(body, { parcial: true });
  if (error) return errorJson(error);
  if (Object.keys(datos).length === 0) return errorJson("Nada que actualizar");

  const pool = getPool();
  const { rows: actuales } = await pool.query(
    `select cuestionario_id, orden from preguntas where id = $1`,
    [id]
  );
  if (!actuales[0]) return errorJson("No encontrada", 404);

  if ("condicion" in datos) {
    const errorCondicion = await validarCondicionContraBD(pool, {
      cuestionarioId: actuales[0].cuestionario_id,
      preguntaId: id,
      orden: datos.orden ?? actuales[0].orden,
      condicion: datos.condicion,
    });
    if (errorCondicion) return errorJson(errorCondicion);
  }

  const sets = [];
  const valores = [];
  for (const [campo, valor] of Object.entries(datos)) {
    valores.push(campo === "condicion" ? (valor === null ? null : JSON.stringify(valor)) : valor);
    sets.push(`${campo} = $${valores.length}`);
  }

  valores.push(id);
  const { rows } = await pool.query(
    `update preguntas set ${sets.join(", ")} where id = $${valores.length}
     returning id, orden, numero_reporte, texto, tipo, requiere_justificacion, condicion, activa`,
    valores
  );
  return NextResponse.json(rows[0]);
});

export const DELETE = conErrores("DELETE /api/preguntas/[id]", async (request, { params }) => {
  const { id } = await params;
  if (!esUUID(id)) return errorJson("Pregunta no encontrada", 404);
  const pool = getPool();
  const { rows } = await pool.query(
    `update preguntas set activa = false where id = $1 returning id`,
    [id]
  );
  if (rows.length === 0) {
    return errorJson("No encontrada", 404);
  }
  return NextResponse.json({ ok: true });
});
