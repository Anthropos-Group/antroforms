import { NextResponse } from "next/server";
import { getPool } from "../../../../lib/db";
import { errorJson, leerJson, conErrores } from "../../../../lib/http";

export const dynamic = "force-dynamic";

export const GET = conErrores("GET /api/cuestionarios/activo", async () => {
  const pool = getPool();

  const { rows: cuestionarios } = await pool.query(
    `select id, nombre, version, guion_apertura, guion_cierre, meta_mensual_pdv
     from cuestionarios where activo = true order by created_at desc limit 1`
  );
  const cuestionario = cuestionarios[0];
  if (!cuestionario) {
    return NextResponse.json({ error: "No hay cuestionario activo" }, { status: 404 });
  }

  const { rows: preguntas } = await pool.query(
    `select id, orden, numero_reporte, texto, tipo, requiere_justificacion, condicion
     from preguntas
     where cuestionario_id = $1 and activa = true
     order by orden asc`,
    [cuestionario.id]
  );

  return NextResponse.json({ ...cuestionario, preguntas });
});

// Solo admin (ver proxy.js): edita nombre, guiones de apertura/cierre y la meta
// mensual por PDV sin tener que tocar la base de datos a mano.
export const PATCH = conErrores("PATCH /api/cuestionarios/activo", async (request) => {
  const body = await leerJson(request);
  if (!body) return errorJson("Cuerpo de la solicitud inválido");

  const sets = [];
  const valores = [];
  const set = (campo, valor) => {
    valores.push(valor);
    sets.push(`${campo} = $${valores.length}`);
  };

  if ("nombre" in body) {
    const nombre = typeof body.nombre === "string" ? body.nombre.trim() : "";
    if (!nombre || nombre.length > 200) return errorJson("El nombre es obligatorio (máx. 200 caracteres)");
    set("nombre", nombre);
  }
  for (const campo of ["guion_apertura", "guion_cierre"]) {
    if (campo in body) {
      if (body[campo] !== null && typeof body[campo] !== "string") return errorJson(`${campo} inválido`);
      const texto = (body[campo] || "").trim();
      if (texto.length > 5000) return errorJson(`${campo} es demasiado largo (máx. 5000 caracteres)`);
      set(campo, texto || null);
    }
  }
  if ("meta_mensual_pdv" in body) {
    const meta = Number(body.meta_mensual_pdv);
    if (!Number.isInteger(meta) || meta < 1 || meta > 10000) {
      return errorJson("La meta mensual debe ser un número entero entre 1 y 10000");
    }
    set("meta_mensual_pdv", meta);
  }
  if (sets.length === 0) return errorJson("Nada que actualizar");

  const pool = getPool();
  const { rows } = await pool.query(
    `update cuestionarios set ${sets.join(", ")}
     where id = (select id from cuestionarios where activo = true order by created_at desc limit 1)
     returning id, nombre, version, guion_apertura, guion_cierre, meta_mensual_pdv`,
    valores
  );
  if (!rows[0]) return errorJson("No hay cuestionario activo", 404);
  return NextResponse.json(rows[0]);
});
