// Aprovisionador de Antroforms: crea y revisa las bases de datos de los clientes
// en el Postgres propio (infra/postgres), sin exponer Postgres a internet.
//
// Es la única puerta de entrada para operar las bases desde fuera del servidor
// (por ejemplo, Claude con la skill «nuevo-cliente»): HTTPS por Cloudflare Tunnel
// con un token. Solo hace operaciones fijas:
//   - crear la base y el usuario de un cliente (af_<slug>), nunca borrarlos;
//   - cambiar la contraseña de ese usuario;
//   - mostrar el estado de una base (migraciones, tablas, conteos);
//   - correr consultas de SOLO LECTURA dentro de la base de un cliente.
// Cada llamada queda registrada en la tabla `auditoria` de la base `aprovisionador`.
//
// Se conecta con el rol `aprovisionador` (CREATEDB + CREATEROLE, sin superusuario).
// Variables: APROVISIONADOR_TOKEN, PGHOST, PGPORT, APROVISIONADOR_DB_PASSWORD,
// HOST_POSTGRES_APPS (host con el que los contenedores de las apps llegan a
// Postgres), PORT.

const http = require("http");
const crypto = require("crypto");
const { Client } = require("pg");

const PUERTO = Number(process.env.PORT) || 8080;
const TOKEN = process.env.APROVISIONADOR_TOKEN || "";
const HOST_APPS = process.env.HOST_POSTGRES_APPS || "antroforms-postgres";
const PG = {
  host: process.env.PGHOST || "antroforms-postgres",
  port: Number(process.env.PGPORT) || 5432,
  user: process.env.PGUSER || "aprovisionador",
  password: process.env.APROVISIONADOR_DB_PASSWORD || process.env.PGPASSWORD,
};
const PREFIJO = "af_";
const SLUG = /^[a-z][a-z0-9]{2,29}$/;
const MAX_FILAS = 500;
const MAX_CUERPO = 64 * 1024;
const PROHIBIDAS =
  /^\s*(set|reset|commit|rollback|begin|start|end|abort|savepoint|release|prepare|execute|deallocate|discard|copy|do|call|listen|notify|lock|vacuum|analyze|checkpoint|load)\b|\b(set_config|pg_terminate_backend|pg_cancel_backend|lo_import|lo_export|pg_read_file|pg_read_binary_file|pg_ls_dir|dblink)\s*\(/i;

// --- utilidades ------------------------------------------------------------
async function conectar(database = "aprovisionador") {
  const c = new Client({ ...PG, database, connectionTimeoutMillis: 10_000, statement_timeout: 30_000 });
  await c.connect();
  return c;
}

async function conBase(database, fn) {
  const c = await conectar(database);
  try {
    return await fn(c);
  } finally {
    await c.end().catch(() => {});
  }
}

const nombreBase = (slug) => `${PREFIJO}${slug}`;

function tokenValido(req) {
  const h = req.headers.authorization || "";
  const dado = Buffer.from(h.startsWith("Bearer ") ? h.slice(7) : "");
  const esperado = Buffer.from(TOKEN);
  return TOKEN.length >= 32 && dado.length === esperado.length && crypto.timingSafeEqual(dado, esperado);
}

function leerCuerpo(req) {
  return new Promise((resolve, reject) => {
    let datos = "";
    req.on("data", (c) => {
      datos += c;
      if (datos.length > MAX_CUERPO) reject(Object.assign(new Error("Cuerpo demasiado grande"), { estado: 413 }));
    });
    req.on("end", () => {
      if (!datos) return resolve({});
      try {
        resolve(JSON.parse(datos));
      } catch {
        reject(Object.assign(new Error("JSON inválido"), { estado: 400 }));
      }
    });
    req.on("error", reject);
  });
}

function error(estado, mensaje) {
  return Object.assign(new Error(mensaje), { estado });
}

function validarSlug(slug) {
  if (typeof slug !== "string" || !SLUG.test(slug)) {
    throw error(400, "slug inválido: minúsculas y números, empieza con letra, 3 a 30 caracteres (p. ej. coop23dejulio)");
  }
  return slug;
}

const clave = () => crypto.randomBytes(24).toString("base64url");

function urlConexion(slug, password) {
  const db = nombreBase(slug);
  return `postgres://${db}:${encodeURIComponent(password)}@${HOST_APPS}:5432/${db}?sslmode=disable`;
}

async function existeBase(c, db) {
  const { rows } = await c.query("select 1 from pg_database where datname = $1", [db]);
  return rows.length > 0;
}

async function auditar(entrada) {
  try {
    await conBase("aprovisionador", (c) =>
      c.query(`insert into auditoria (metodo, ruta, slug, estado, detalle, ip) values ($1, $2, $3, $4, $5, $6)`, [
        entrada.metodo,
        entrada.ruta,
        entrada.slug || null,
        entrada.estado,
        entrada.detalle ? String(entrada.detalle).slice(0, 2000) : null,
        entrada.ip || null,
      ])
    );
  } catch (err) {
    console.error("[auditoria] no se pudo registrar:", err.message);
  }
}

// --- operaciones -----------------------------------------------------------
async function listarClientes() {
  return conBase("aprovisionador", async (c) => {
    const { rows } = await c.query(
      `select d.datname as base, pg_get_userbyid(d.datdba) as dueno,
              pg_size_pretty(pg_database_size(d.datname)) as tamano,
              (select count(*)::int from pg_stat_activity a where a.datname = d.datname) as conexiones
       from pg_database d
       where d.datname like $1 order by d.datname`,
      [`${PREFIJO}%`]
    );
    return rows.map((r) => ({ slug: r.base.slice(PREFIJO.length), ...r }));
  });
}

async function crearCliente(slug) {
  const db = nombreBase(slug);
  const password = clave();
  await conBase("aprovisionador", async (c) => {
    if (await existeBase(c, db)) throw error(409, `La base ${db} ya existe (no se modificó).`);
    const id = c.escapeIdentifier(db);
    const { rows } = await c.query("select 1 from pg_roles where rolname = $1", [db]);
    if (rows.length) await c.query(`alter role ${id} with login password ${c.escapeLiteral(password)}`);
    else await c.query(`create role ${id} with login password ${c.escapeLiteral(password)} connection limit 40`);
    await c.query(`create database ${id} owner ${id} encoding 'UTF8' template template0`);
    // Solo su propio usuario (y el aprovisionador) se conectan a la base.
    await c.query(`revoke all on database ${id} from public`);
    await c.query(`grant connect, temporary on database ${id} to ${id}`);
  });
  return { slug, base: db, usuario: db, url: urlConexion(slug, password) };
}

async function rotarClave(slug) {
  const db = nombreBase(slug);
  const password = clave();
  await conBase("aprovisionador", async (c) => {
    if (!(await existeBase(c, db))) throw error(404, `No existe la base ${db}.`);
    await c.query(`alter role ${c.escapeIdentifier(db)} with password ${c.escapeLiteral(password)}`);
  });
  return { slug, base: db, url: urlConexion(slug, password) };
}

async function estadoCliente(slug) {
  const db = nombreBase(slug);
  const existe = await conBase("aprovisionador", (c) => existeBase(c, db));
  if (!existe) throw error(404, `No existe la base ${db}.`);
  return conBase(db, async (c) => {
    await c.query(`set role ${c.escapeIdentifier(db)}`);
    const { rows: tablas } = await c.query(
      `select count(*)::int as n from information_schema.tables where table_schema = 'public'`
    );
    const r = { slug, base: db, tablas: tablas[0].n, migraciones: [], conteos: {} };
    const { rows: hay } = await c.query(`select to_regclass('public._migrations') is not null as si`);
    if (hay[0].si) {
      const { rows } = await c.query(`select filename, applied_at from _migrations order by filename`);
      r.migraciones = rows;
    }
    for (const t of ["encuestadores", "administradores", "cuestionarios", "preguntas", "clientes_cache", "encuestas"]) {
      const { rows } = await c.query(`select to_regclass($1) is not null as si`, [`public.${t}`]);
      if (rows[0].si) {
        const { rows: n } = await c.query(`select count(*)::int as n from ${c.escapeIdentifier(t)}`);
        r.conteos[t] = n[0].n;
      }
    }
    return r;
  });
}

// Consulta de solo lectura con los permisos del usuario del cliente: la
// transacción READ ONLY rechaza cualquier escritura o DDL.
async function consultar(slug, sql) {
  if (typeof sql !== "string" || !sql.trim()) throw error(400, "Falta `sql`.");
  if (sql.length > 20_000) throw error(400, "Consulta demasiado larga.");
  // Comandos que podrían cerrar la transacción de solo lectura o cambiar de rol.
  if (PROHIBIDAS.test(sql)) throw error(400, "Solo se permiten consultas de lectura (sin SET, RESET, COMMIT, COPY, DO…).");
  const db = nombreBase(slug);
  const existe = await conBase("aprovisionador", (c) => existeBase(c, db));
  if (!existe) throw error(404, `No existe la base ${db}.`);
  return conBase(db, async (c) => {
    await c.query(`set role ${c.escapeIdentifier(db)}`);
    await c.query("begin transaction read only");
    try {
      await c.query("set local statement_timeout = '15s'");
      // Sentencia preparada (protocolo extendido): Postgres rechaza más de un
      // comando, así que no se puede encadenar «; commit; delete …».
      const ultimo = await c.query({ name: `consulta_${crypto.randomBytes(6).toString("hex")}`, text: sql });
      const filas = ultimo.rows || [];
      return {
        columnas: (ultimo.fields || []).map((f) => f.name),
        filas: filas.slice(0, MAX_FILAS),
        total: filas.length,
        recortado: filas.length > MAX_FILAS,
      };
    } finally {
      await c.query("rollback").catch(() => {});
    }
  });
}

async function auditoria(limite) {
  return conBase("aprovisionador", async (c) => {
    const { rows } = await c.query(`select * from auditoria order by id desc limit $1`, [
      Math.min(Math.max(Number(limite) || 50, 1), 500),
    ]);
    return rows;
  });
}

async function prepararAuditoria() {
  await conBase("aprovisionador", (c) =>
    c.query(`create table if not exists auditoria (
      id bigserial primary key,
      creado_en timestamptz not null default now(),
      metodo text not null,
      ruta text not null,
      slug text,
      estado int not null,
      detalle text,
      ip text
    )`)
  );
}

// --- servidor HTTP -----------------------------------------------------------
function responder(res, estado, cuerpo) {
  res.writeHead(estado, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(cuerpo));
}

async function enrutar(req) {
  const url = new URL(req.url, "http://x");
  const partes = url.pathname.split("/").filter(Boolean);
  const m = req.method;

  if (m === "GET" && url.pathname === "/salud") {
    const version = await conBase("aprovisionador", async (c) => (await c.query("show server_version")).rows[0].server_version);
    return { estado: 200, cuerpo: { ok: true, postgres: version } };
  }
  if (!tokenValido(req)) throw error(401, "No autorizado.");

  if (partes[0] === "clientes") {
    if (partes.length === 1 && m === "GET") return { estado: 200, cuerpo: { clientes: await listarClientes() } };
    if (partes.length === 1 && m === "POST") {
      const { slug } = await leerCuerpo(req);
      return { estado: 201, cuerpo: await crearCliente(validarSlug(slug)), slug, secreto: true };
    }
    const slug = validarSlug(partes[1]);
    if (partes.length === 3 && partes[2] === "estado" && m === "GET") return { estado: 200, cuerpo: await estadoCliente(slug), slug };
    if (partes.length === 3 && partes[2] === "clave" && m === "POST") return { estado: 200, cuerpo: await rotarClave(slug), slug, secreto: true };
    if (partes.length === 3 && partes[2] === "consulta" && m === "POST") {
      const { sql } = await leerCuerpo(req);
      return { estado: 200, cuerpo: await consultar(slug, sql), slug, detalle: sql };
    }
  }
  if (m === "GET" && url.pathname === "/auditoria") return { estado: 200, cuerpo: { registros: await auditoria(url.searchParams.get("limite")) } };
  throw error(404, "Ruta no encontrada.");
}

function crearServidor() {
  return http.createServer(async (req, res) => {
    const ruta = new URL(req.url, "http://x").pathname;
    const ip = req.headers["cf-connecting-ip"] || req.socket.remoteAddress;
    let r;
    try {
      r = await enrutar(req);
      responder(res, r.estado, r.cuerpo);
    } catch (err) {
      const estado = err.estado || (err.code && /^(42|22|25)/.test(err.code) ? 400 : 500);
      r = { estado, detalle: err.message };
      if (estado >= 500) console.error(`[${req.method} ${ruta}]`, err);
      responder(res, estado, { error: err.message });
    }
    if (ruta !== "/salud") {
      // Nunca se registra la URL con la contraseña.
      await auditar({ metodo: req.method, ruta, slug: r.slug, estado: r.estado, detalle: r.secreto ? null : r.detalle, ip });
    }
  });
}

if (require.main === module) {
  if (TOKEN.length < 32) {
    console.error("APROVISIONADOR_TOKEN falta o es muy corto (mínimo 32 caracteres).");
    process.exit(1);
  }
  prepararAuditoria()
    .then(() => crearServidor().listen(PUERTO, () => console.log(`Aprovisionador escuchando en :${PUERTO}`)))
    .catch((err) => {
      console.error("No se pudo preparar el aprovisionador:", err.message);
      process.exit(1);
    });
}

module.exports = { crearServidor, prepararAuditoria, SLUG };
