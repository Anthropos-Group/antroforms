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
const fs = require("fs");
const path = require("path");
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
const DIR_LOGS = process.env.DIR_LOGS || "/pglogs";
const DIR_RESPALDOS = process.env.DIR_RESPALDOS || "/respaldos";
const MAX_VENTANA_MS = 12 * 60 * 60 * 1000;
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


// Nunca devolver contraseñas que aparezcan en un texto de consulta o del log.
function ocultarClaves(texto) {
  return String(texto ?? "")
    .replace(/(password\s+)'[^']*'/gi, "$1'***'")
    .replace(/(postgres(?:ql)?:\/\/[^:\s/]+:)[^@\s]+@/gi, "$1***@");
}

// --- diagnóstico (solo lectura; rol pg_monitor) -----------------------------
function espacioEnDisco(dir) {
  try {
    const st = fs.statfsSync(dir);
    const gb = (n) => Math.round((n / 1024 ** 3) * 10) / 10;
    return { total_gb: gb(st.blocks * st.bsize), libre_gb: gb(st.bavail * st.bsize), uso_pct: Math.round((1 - st.bavail / st.blocks) * 100) };
  } catch {
    return null;
  }
}

function listarRespaldos() {
  const archivos = [];
  const recorrer = (dir, nivel = 0) => {
    let entradas = [];
    try {
      entradas = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entradas) {
      const ruta = path.join(dir, e.name);
      if (e.isDirectory() && nivel < 2) recorrer(ruta, nivel + 1);
      else if (e.isFile()) {
        const st = fs.statSync(ruta);
        archivos.push({ archivo: path.relative(DIR_RESPALDOS, ruta), mb: Math.round((st.size / 1024 ** 2) * 10) / 10, fecha: st.mtime.toISOString() });
      }
    }
  };
  recorrer(DIR_RESPALDOS);
  archivos.sort((a, b) => b.fecha.localeCompare(a.fecha));
  const ultimo = archivos[0] || null;
  const horas = ultimo ? Math.round(((Date.now() - Date.parse(ultimo.fecha)) / 3_600_000) * 10) / 10 : null;
  return {
    ultimo,
    horas_desde_ultimo: horas,
    // Corre a diario a las 03:00: más de 26 h sin respaldo es una alerta.
    alerta: ultimo === null ? "No hay respaldos todavía." : horas > 26 ? `El último respaldo tiene ${horas} h.` : null,
    total: archivos.length,
    recientes: archivos.slice(0, 15),
  };
}

async function diagnostico() {
  return conBase("aprovisionador", async (c) => {
    const q = async (sql, p) => (await c.query(sql, p)).rows;
    const [general] = await q(
      `select version() as version, now() - pg_postmaster_start_time() as tiempo_encendido,
              current_setting('max_connections')::int as max_conexiones,
              (select count(*)::int from pg_stat_activity where backend_type = 'client backend') as conexiones`
    );
    general.tiempo_encendido = String(general.tiempo_encendido?.toPostgres?.() ?? JSON.stringify(general.tiempo_encendido));
    const conexiones = await q(
      `select coalesce(datname, '(servidor)') as base, usename as usuario, coalesce(state, '-') as estado, count(*)::int as n
       from pg_stat_activity where backend_type = 'client backend'
       group by 1, 2, 3 order by n desc`
    );
    const largas = await q(
      `select pid, datname as base, usename as usuario, state as estado,
              round(extract(epoch from now() - query_start))::int as segundos,
              wait_event_type, wait_event, left(query, 300) as consulta
       from pg_stat_activity
       where backend_type = 'client backend' and state <> 'idle' and pid <> pg_backend_pid()
         and now() - query_start > interval '30 seconds'
       order by query_start limit 20`
    );
    const bloqueos = await q(
      `select a.pid, a.datname as base, a.usename as usuario, pg_blocking_pids(a.pid) as bloqueado_por,
              round(extract(epoch from now() - a.query_start))::int as segundos, left(a.query, 300) as consulta
       from pg_stat_activity a where cardinality(pg_blocking_pids(a.pid)) > 0 limit 20`
    );
    const inactivasEnTransaccion = await q(
      `select pid, datname as base, usename as usuario, round(extract(epoch from now() - state_change))::int as segundos
       from pg_stat_activity where state = 'idle in transaction' and now() - state_change > interval '1 minute' limit 20`
    );
    const bases = await q(
      `select datname as base, pg_size_pretty(pg_database_size(datname)) as tamano, pg_database_size(datname) as bytes
       from pg_database where not datistemplate order by bytes desc`
    );
    let lentas = null;
    try {
      lentas = await q(
        `select d.datname as base, s.calls as llamadas, round(s.mean_exec_time)::int as ms_promedio,
                round(s.max_exec_time)::int as ms_maximo, left(s.query, 300) as consulta
         from pg_stat_statements s join pg_database d on d.oid = s.dbid
         order by s.mean_exec_time desc limit 10`
      );
    } catch {
      lentas = "pg_stat_statements no está disponible";
    }
    const limpiar = (filas) => (Array.isArray(filas) ? filas.map((f) => ({ ...f, consulta: f.consulta && ocultarClaves(f.consulta) })) : filas);
    return {
      fecha: new Date().toISOString(),
      general,
      conexiones,
      consultas_de_mas_de_30s: limpiar(largas),
      bloqueos: limpiar(bloqueos),
      transacciones_abiertas_inactivas: inactivasEnTransaccion,
      bases: bases.map(({ bytes, ...b }) => b),
      consultas_mas_lentas: limpiar(lentas),
      disco: espacioEnDisco(DIR_LOGS),
      respaldos: listarRespaldos(),
      escritura: estadoVentana(),
    };
  });
}

// Últimas líneas del log de Postgres (archivo del día y el anterior), con filtro opcional.
function registros(lineas, filtro) {
  let archivos = [];
  try {
    archivos = fs
      .readdirSync(DIR_LOGS)
      .filter((f) => f.endsWith(".log"))
      .map((f) => ({ f, t: fs.statSync(path.join(DIR_LOGS, f)).mtimeMs }))
      .sort((a, b) => b.t - a.t)
      .slice(0, 2)
      .reverse();
  } catch {
    throw error(503, "No se puede leer la carpeta del log de Postgres.");
  }
  let todas = [];
  for (const { f } of archivos) todas = todas.concat(fs.readFileSync(path.join(DIR_LOGS, f), "utf8").split("\n").filter(Boolean));
  if (filtro) {
    const f = String(filtro).toLowerCase();
    todas = todas.filter((l) => l.toLowerCase().includes(f));
  }
  const n = Math.min(Math.max(Number(lineas) || 200, 1), 2000);
  return { archivos: archivos.map((a) => a.f), lineas: todas.slice(-n).map(ocultarClaves) };
}

// --- ventana de mantenimiento (opción B) -------------------------------------
// Las escrituras solo se permiten si quien opera el servidor abrió la ventana en
// Portainer (ESCRITURA_HABILITADA_HASTA, máx. 12 h) y para el cliente indicado.
function estadoVentana(ahora = Date.now()) {
  const hasta = process.env.ESCRITURA_HABILITADA_HASTA ? Date.parse(process.env.ESCRITURA_HABILITADA_HASTA) : NaN;
  const cliente = (process.env.ESCRITURA_CLIENTE || "").trim() || null;
  if (!process.env.ESCRITURA_HABILITADA_HASTA) return { abierta: false, motivo: "Cerrada (sin ESCRITURA_HABILITADA_HASTA)." };
  if (Number.isNaN(hasta)) return { abierta: false, motivo: "ESCRITURA_HABILITADA_HASTA no es una fecha válida." };
  if (!cliente) return { abierta: false, motivo: "Falta ESCRITURA_CLIENTE: la ventana es para un solo cliente." };
  if (hasta - ahora > MAX_VENTANA_MS) return { abierta: false, motivo: "La ventana no puede durar más de 12 horas." };
  if (hasta <= ahora) return { abierta: false, motivo: `Venció el ${new Date(hasta).toISOString()}.`, cliente };
  return { abierta: true, cliente, hasta: new Date(hasta).toISOString(), minutos_restantes: Math.floor((hasta - ahora) / 60_000) };
}

const SOLO_DML = /^\s*(insert|update|delete|with)\b/i;
const PROHIBIDAS_ESCRITURA = /\b(drop|truncate|alter|create|grant|revoke|vacuum|reindex|cluster)\b|\b(set_config|pg_terminate_backend|pg_cancel_backend|lo_import|lo_export|pg_read_file|dblink)\s*\(/i;

// Una sentencia DML (insert/update/delete) con los permisos del usuario del cliente.
// `probar: true` la ejecuta y deshace los cambios: devuelve cuántas filas tocaría.
async function escribir(slug, { sql, motivo, probar }) {
  const v = estadoVentana();
  if (!v.abierta) throw error(403, `Escritura no permitida: ${v.motivo}`);
  if (v.cliente !== slug) throw error(403, `La ventana abierta es para «${v.cliente}», no para «${slug}».`);
  if (typeof motivo !== "string" || motivo.trim().length < 10) throw error(400, "Indica el motivo del cambio (`motivo`, mínimo 10 caracteres).");
  if (typeof sql !== "string" || !SOLO_DML.test(sql)) throw error(400, "Solo se permiten INSERT, UPDATE, DELETE (o WITH … de esos).");
  if (PROHIBIDAS.test(sql) || PROHIBIDAS_ESCRITURA.test(sql)) throw error(400, "La sentencia incluye comandos no permitidos (DDL, permisos, control de transacción).");
  if (/^\s*(update|delete)\b/i.test(sql) && !/\bwhere\b/i.test(sql)) throw error(400, "UPDATE y DELETE necesitan WHERE (no se cambia una tabla completa).");
  const db = nombreBase(slug);
  return conBase(db, async (c) => {
    await c.query(`set role ${c.escapeIdentifier(db)}`);
    await c.query("begin");
    try {
      await c.query("set local statement_timeout = '30s'");
      const r = await c.query({ name: `escritura_${crypto.randomBytes(6).toString("hex")}`, text: sql });
      if (probar) {
        await c.query("rollback");
        return { probado: true, filas_afectadas: r.rowCount, devueltas: (r.rows || []).slice(0, 50) };
      }
      await c.query("commit");
      return { aplicado: true, filas_afectadas: r.rowCount, devueltas: (r.rows || []).slice(0, 50) };
    } catch (err) {
      await c.query("rollback").catch(() => {});
      throw err;
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
    if (partes.length === 3 && partes[2] === "escritura" && m === "POST") {
      const cuerpo = await leerCuerpo(req);
      const detalle = `${cuerpo.probar ? "[PRUEBA] " : ""}motivo: ${cuerpo.motivo} | sql: ${cuerpo.sql}`;
      try {
        const r = await escribir(slug, cuerpo);
        return { estado: 200, cuerpo: r, slug, detalle: `${detalle} | filas: ${r.filas_afectadas}` };
      } catch (err) {
        err.detalle = `${detalle} | error: ${err.message}`;
        throw err;
      }
    }
  }
  if (m === "GET" && url.pathname === "/diagnostico") return { estado: 200, cuerpo: await diagnostico() };
  if (m === "GET" && url.pathname === "/registros") {
    const filtro = url.searchParams.get("filtro");
    return { estado: 200, cuerpo: registros(url.searchParams.get("lineas"), filtro), detalle: filtro ? `filtro: ${filtro}` : null };
  }
  if (m === "GET" && url.pathname === "/respaldos") return { estado: 200, cuerpo: listarRespaldos() };
  if (m === "GET" && url.pathname === "/escritura") return { estado: 200, cuerpo: estadoVentana() };
  if (m === "GET" && url.pathname === "/auditoria") return { estado: 200, cuerpo: { registros: await auditoria(url.searchParams.get("limite")) } };
  throw error(404, "Ruta no encontrada.");
}

function partesSlug(ruta) {
  const p = ruta.split("/").filter(Boolean);
  return p[0] === "clientes" && p[1] && SLUG.test(p[1]) ? p[1] : null;
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
      r = { estado, detalle: err.detalle || err.message, slug: partesSlug(ruta) };
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

module.exports = { crearServidor, prepararAuditoria, estadoVentana, ocultarClaves, SLUG, PROHIBIDAS };
