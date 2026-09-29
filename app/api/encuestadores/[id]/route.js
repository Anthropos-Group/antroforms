import { NextResponse } from "next/server";
import { getPool } from "../../../../lib/db";
import { esUUID, errorJson, leerJson, conErrores } from "../../../../lib/http";

export const dynamic = "force-dynamic";

export const PATCH = conErrores("PATCH /api/encuestadores/[id]", async (request, { params }) => {
  const { id } = await params;
  if (!esUUID(id)) return errorJson("No encontrado", 404);
  const body = await leerJson(request);
  if (!body) return errorJson("Cuerpo de la solicitud inválido");
  const pool = getPool();

  const campos = [];
  const valores = [];
  if (typeof body.nombre === "string") {
    const nombre = body.nombre.trim().replace(/\s+/g, " ");
    if (!nombre) return errorJson("El nombre no puede estar vacío");
    const { rows: dup } = await pool.query(
      `select 1 from encuestadores where lower(nombre) = lower($1) and id <> $2 limit 1`,
      [nombre, id]
    );
    if (dup[0]) return errorJson("Ya existe otro encuestador con ese nombre", 409);
    valores.push(nombre);
    campos.push(`nombre = $${valores.length}`);
  }
  if (typeof body.activo === "boolean") {
    valores.push(body.activo);
    campos.push(`activo = $${valores.length}`);
  }
  if (campos.length === 0) {
    return NextResponse.json({ error: "Nada que actualizar" }, { status: 400 });
  }

  valores.push(id);
  const { rows } = await pool.query(
    `update encuestadores set ${campos.join(", ")}, updated_at = now() where id = $${valores.length} returning id, nombre, activo`,
    valores
  );
  if (rows.length === 0) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }
  return NextResponse.json(rows[0]);
});

export const DELETE = conErrores("DELETE /api/encuestadores/[id]", async (request, { params }) => {
  const { id } = await params;
  if (!esUUID(id)) return errorJson("No encontrado", 404);
  const pool = getPool();
  const { rows } = await pool.query(
    `update encuestadores set activo = false, updated_at = now() where id = $1 returning id`,
    [id]
  );
  if (rows.length === 0) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
});
