import { NextResponse } from "next/server";
import { getPool } from "../../../lib/db";
import { errorJson, leerJson, conErrores } from "../../../lib/http";

export const dynamic = "force-dynamic";

export const GET = conErrores("GET /api/encuestadores", async () => {
  const pool = getPool();
  const { rows } = await pool.query(
    `select id, nombre, activo from encuestadores order by activo desc, nombre asc`
  );
  return NextResponse.json({ encuestadores: rows });
});

export const POST = conErrores("POST /api/encuestadores", async (request) => {
  const body = await leerJson(request);
  const nombre = typeof body?.nombre === "string" ? body.nombre.trim().replace(/\s+/g, " ") : "";
  if (!nombre) {
    return errorJson("Falta el nombre");
  }
  if (nombre.length > 120) return errorJson("El nombre es demasiado largo");
  const pool = getPool();
  // Nombres duplicados confunden la selección y parten los reportes por encuestador.
  const { rows: existentes } = await pool.query(
    `select id, activo from encuestadores where lower(nombre) = lower($1) limit 1`,
    [nombre]
  );
  if (existentes[0]) {
    return errorJson(
      existentes[0].activo ? "Ya existe un encuestador con ese nombre" : "Ya existe un encuestador inactivo con ese nombre: actívalo en lugar de crear otro",
      409
    );
  }
  const { rows } = await pool.query(
    `insert into encuestadores (nombre) values ($1) returning id, nombre, activo`,
    [nombre]
  );
  return NextResponse.json(rows[0], { status: 201 });
});
