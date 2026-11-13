// Carga (o actualiza) el cuestionario del cliente desde tenants/<TENANT>.cuestionario.js.
//
//   TENANT=coop23dejulio node scripts/cargar-cuestionario.js [--dry-run]
//
// - Valida cada pregunta con las mismas reglas del panel (lib/preguntas.js) y que
//   toda regla de ruta apunte a una pregunta que existe y va antes.
// - Si el cuestionario activo con ese nombre todavía no tiene encuestas, reemplaza
//   sus preguntas. Si ya tiene encuestas, crea una versión nueva y desactiva la
//   anterior (las respuestas ya guardadas siguen apuntando a sus preguntas).
try {
  require("dotenv").config();
} catch {
  // sin dotenv instalado (imagen de producción)
}
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");
const { sslConfig } = require("../lib/db");
const { tenant } = require("../lib/tenant");
const { validarPregunta } = require("../lib/preguntas");

const DRY_RUN = process.argv.includes("--dry-run");

function referencias(regla, salida = []) {
  if (!regla || typeof regla !== "object") return salida;
  if (Array.isArray(regla.todas)) regla.todas.forEach((r) => referencias(r, salida));
  if (Array.isArray(regla.alguna)) regla.alguna.forEach((r) => referencias(r, salida));
  if (regla.no) referencias(regla.no, salida);
  if (typeof regla.pregunta === "string") salida.push(regla.pregunta);
  return salida;
}

function validarCuestionario(def) {
  const errores = [];
  const posicion = new Map();
  def.preguntas.forEach((p, i) => {
    if (!p.codigo) errores.push(`Pregunta #${i + 1} sin código`);
    else if (posicion.has(p.codigo)) errores.push(`Código repetido: ${p.codigo}`);
    else posicion.set(p.codigo, i);
  });
  def.preguntas.forEach((p, i) => {
    const { error } = validarPregunta({ ...p, orden: i + 1 });
    if (error) errores.push(`${p.codigo}: ${error}`);
    const reglas = [
      ["mostrar_si", p.mostrar_si, false],
      ["termina_si", p.termina_si, true],
      ...((p.config?.calculo || []).map((c) => ["calculo", c.si, false])),
    ];
    for (const [campo, regla, propia] of reglas) {
      for (const ref of referencias(regla)) {
        if (!posicion.has(ref)) errores.push(`${p.codigo}.${campo}: la pregunta ${ref} no existe`);
        else if (posicion.get(ref) > i || (posicion.get(ref) === i && !propia)) {
          errores.push(`${p.codigo}.${campo}: depende de ${ref}, que va después`);
        }
      }
    }
  });
  return errores;
}

async function main() {
  const config = tenant();
  const archivo = path.join(__dirname, "..", "tenants", `${config.id}.cuestionario.js`);
  if (!fs.existsSync(archivo)) {
    console.error(`No hay cuestionario definido para ${config.id} (${path.relative(process.cwd(), archivo)}).`);
    process.exit(1);
  }
  const def = require(archivo);
  const errores = validarCuestionario(def);
  if (errores.length) {
    console.error("El cuestionario tiene errores:\n - " + errores.join("\n - "));
    process.exit(1);
  }
  const porTipo = def.preguntas.reduce((acc, p) => ({ ...acc, [p.tipo]: (acc[p.tipo] || 0) + 1 }), {});
  console.log(`Cliente: ${config.nombre}`);
  console.log(`Cuestionario "${def.nombre}": ${def.preguntas.length} preguntas`, porTipo);
  if (DRY_RUN) {
    console.log("--dry-run: validación correcta, no se escribió nada.");
    return;
  }

  const connectionString = process.env.SUPABASE_DB_URL;
  if (!connectionString) {
    console.error("Falta SUPABASE_DB_URL en .env");
    process.exit(1);
  }
  const db = new Client({ connectionString, ssl: sslConfig(connectionString) });
  await db.connect();
  try {
    await db.query("begin");
    const { rows: activos } = await db.query(
      `select c.id, c.nombre, c.version,
              (select count(*)::int from encuestas e where e.cuestionario_id = c.id) as encuestas
       from cuestionarios c where c.activo = true order by c.created_at desc`
    );
    const mismo = activos.find((c) => c.nombre === def.nombre);
    let cuestionarioId;
    if (mismo && mismo.encuestas === 0) {
      cuestionarioId = mismo.id;
      await db.query(`delete from preguntas where cuestionario_id = $1`, [cuestionarioId]);
      await db.query(
        `update cuestionarios set guion_apertura = $2, guion_cierre = $3 where id = $1`,
        [cuestionarioId, def.guion_apertura || null, def.guion_cierre || null]
      );
      console.log(`Se reemplazan las preguntas del cuestionario activo (sin encuestas todavía).`);
    } else {
      const version = (mismo?.version || 0) + 1;
      await db.query(`update cuestionarios set activo = false where activo = true`);
      const { rows } = await db.query(
        `insert into cuestionarios (nombre, version, activo, objeto_twenty, guion_apertura, guion_cierre)
         values ($1, $2, true, 'people', $3, $4) returning id`,
        [def.nombre, version, def.guion_apertura || null, def.guion_cierre || null]
      );
      cuestionarioId = rows[0].id;
      console.log(`Cuestionario nuevo, versión ${version}${activos.length ? " (los anteriores quedan inactivos)" : ""}.`);
    }

    for (const [i, p] of def.preguntas.entries()) {
      await db.query(
        `insert into preguntas (cuestionario_id, orden, numero_reporte, texto, tipo, requiere_justificacion,
                                codigo, bloque, ayuda, config, mostrar_si, termina_si)
         values ($1, $2, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          cuestionarioId,
          i + 1,
          p.texto,
          p.tipo,
          Boolean(p.requiere_justificacion),
          p.codigo,
          p.bloque || null,
          p.ayuda || null,
          JSON.stringify(p.config || {}),
          p.mostrar_si ? JSON.stringify(p.mostrar_si) : null,
          p.termina_si ? JSON.stringify(p.termina_si) : null,
        ]
      );
    }
    await db.query("commit");
    console.log("Listo.");
  } catch (err) {
    await db.query("rollback").catch(() => {});
    throw err;
  } finally {
    await db.end();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { validarCuestionario };
