import { NextResponse } from "next/server";
import { getPool } from "../../../../lib/db";
import { hashPassword, verifySessionToken, SESSION_COOKIE, invalidarCacheAdmin } from "../../../../lib/auth";
import { esUUID, errorJson, leerJson, conErrores } from "../../../../lib/http";

export const dynamic = "force-dynamic";

// Evita dejar el panel sin nadie que pueda entrar: no se puede desactivar al
// último administrador activo ni a uno mismo.
async function validarDesactivacion(pool, request, id) {
  if (verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value) === id) {
    return "No puedes desactivar tu propia cuenta.";
  }
  const { rows } = await pool.query(
    `select count(*)::int as activos from administradores where activo = true and id <> $1`,
    [id]
  );
  if (rows[0].activos === 0) return "Debe quedar al menos un administrador activo.";
  return null;
}

export const PATCH = conErrores("PATCH /api/administradores/[id]", async (request, { params }) => {
  const { id } = await params;
  if (!esUUID(id)) return errorJson("No encontrado", 404);
  const body = await leerJson(request);
  if (!body) return errorJson("Cuerpo de la solicitud inválido");
  const pool = getPool();

  const sets = [];
  const valores = [];
  if (typeof body.nombre === "string") {
    if (!body.nombre.trim()) return errorJson("El nombre no puede estar vacío");
    valores.push(body.nombre.trim());
    sets.push(`nombre = $${valores.length}`);
  }
  if (typeof body.activo === "boolean") {
    if (body.activo === false) {
      const error = await validarDesactivacion(pool, request, id);
      if (error) return errorJson(error, 409);
    }
    valores.push(body.activo);
    sets.push(`activo = $${valores.length}`);
  }
  if (typeof body.password === "string" && body.password.length > 0) {
    if (body.password.length < 8) {
      return errorJson("La contraseña debe tener al menos 8 caracteres");
    }
    valores.push(hashPassword(body.password));
    sets.push(`password_hash = $${valores.length}`);
  }
  if (sets.length === 0) {
    return errorJson("Nada que actualizar");
  }

  valores.push(id);
  const { rows } = await pool.query(
    `update administradores set ${sets.join(", ")}, updated_at = now() where id = $${valores.length}
     returning id, nombre, email, activo`,
    valores
  );
  if (rows.length === 0) {
    return errorJson("No encontrado", 404);
  }
  invalidarCacheAdmin(id);
  return NextResponse.json(rows[0]);
});

export const DELETE = conErrores("DELETE /api/administradores/[id]", async (request, { params }) => {
  const { id } = await params;
  if (!esUUID(id)) return errorJson("No encontrado", 404);
  const pool = getPool();
  const error = await validarDesactivacion(pool, request, id);
  if (error) return errorJson(error, 409);
  const { rows } = await pool.query(
    `update administradores set activo = false, updated_at = now() where id = $1 returning id`,
    [id]
  );
  if (rows.length === 0) {
    return errorJson("No encontrado", 404);
  }
  invalidarCacheAdmin(id);
  return NextResponse.json({ ok: true });
});
