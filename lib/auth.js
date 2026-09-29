const crypto = require("crypto");

const SCRYPT_KEYLEN = 64;
const SESSION_COOKIE = "admin_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 12; // 12 horas
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, SCRYPT_KEYLEN).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = (stored || "").split(":");
  if (!salt || !hash) return false;
  const hashBuffer = Buffer.from(hash, "hex");
  const candidate = crypto.scryptSync(password, salt, SCRYPT_KEYLEN);
  if (candidate.length !== hashBuffer.length) return false;
  return crypto.timingSafeEqual(candidate, hashBuffer);
}

// Comparación de strings en tiempo constante (se comparan hashes para que la
// longitud del secreto tampoco se filtre por tiempo de respuesta).
function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const ha = crypto.createHash("sha256").update(a).digest();
  const hb = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(ha, hb) && a.length === b.length;
}

function sign(value) {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) throw new Error("Falta ADMIN_SESSION_SECRET en .env");
  return crypto.createHmac("sha256", secret).update(value).digest("hex");
}

function verificarFirma(payload, sig) {
  let expected;
  try {
    expected = sign(payload);
  } catch {
    return false;
  }
  if (!/^[0-9a-f]+$/i.test(sig || "")) return false;
  const sigBuf = Buffer.from(sig, "hex");
  const expBuf = Buffer.from(expected, "hex");
  return sigBuf.length === expBuf.length && crypto.timingSafeEqual(sigBuf, expBuf);
}

function createSessionToken(adminId) {
  const expires = Date.now() + SESSION_TTL_MS;
  const payload = `${adminId}.${expires}`;
  return `${payload}.${sign(payload)}`;
}

function verifySessionToken(token) {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [adminId, expires, sig] = parts;
  if (!UUID_REGEX.test(adminId)) return null;
  if (!verificarFirma(`${adminId}.${expires}`, sig)) return null;
  if (Date.now() > Number(expires)) return null;
  return adminId;
}

// Sesión de encuestador: una sola contraseña compartida (sin tabla de usuarios),
// a diferencia de administradores que tienen cuenta individual con email.
// El token incluye una huella de la contraseña vigente: al rotar
// ENCUESTADOR_ACCESS_PASSWORD se invalidan todas las sesiones abiertas.
const ENCUESTADOR_SESSION_COOKIE = "encuestador_session";
const ENCUESTADOR_MARKER = "encuestador";

function huellaPasswordEncuestador() {
  return crypto
    .createHash("sha256")
    .update(process.env.ENCUESTADOR_ACCESS_PASSWORD || "")
    .digest("hex")
    .slice(0, 12);
}

function createEncuestadorSessionToken() {
  const expires = Date.now() + SESSION_TTL_MS;
  const payload = `${ENCUESTADOR_MARKER}-${huellaPasswordEncuestador()}.${expires}`;
  return `${payload}.${sign(payload)}`;
}

function verifyEncuestadorSessionToken(token) {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [marker, expires, sig] = parts;
  if (marker !== `${ENCUESTADOR_MARKER}-${huellaPasswordEncuestador()}`) return false;
  if (!verificarFirma(`${marker}.${expires}`, sig)) return false;
  if (Date.now() > Number(expires)) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Revocación de sesiones de administrador: el token es stateless (12 h), así que
// sin esto un admin desactivado seguiría entrando hasta que expire. Se consulta
// la BD con una caché corta para no pegarle en cada request.
const CACHE_ADMIN_MS = 60_000;
const cacheAdminActivo = new Map();

async function adminSigueActivo(adminId, getPool) {
  const hit = cacheAdminActivo.get(adminId);
  if (hit && hit.expira > Date.now()) return hit.activo;
  const { rows } = await getPool().query(`select activo from administradores where id = $1`, [adminId]);
  const activo = rows[0]?.activo === true;
  cacheAdminActivo.set(adminId, { activo, expira: Date.now() + CACHE_ADMIN_MS });
  return activo;
}

function invalidarCacheAdmin(adminId) {
  if (adminId) cacheAdminActivo.delete(adminId);
  else cacheAdminActivo.clear();
}

// ---------------------------------------------------------------------------
// Rate limiting en memoria para los logins (el despliegue es un solo contenedor).
// Máximo N intentos fallidos por clave (IP + usuario) en la ventana.
const VENTANA_LOGIN_MS = 15 * 60 * 1000;
const MAX_INTENTOS_LOGIN = 10;
const intentosLogin = new Map();

function ipDe(request) {
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    request.headers.get("x-real-ip") ||
    "desconocida"
  );
}

function loginBloqueado(clave, max = MAX_INTENTOS_LOGIN) {
  const entrada = intentosLogin.get(clave);
  if (!entrada) return 0;
  if (entrada.reinicia < Date.now()) {
    intentosLogin.delete(clave);
    return 0;
  }
  return entrada.fallos >= max ? Math.ceil((entrada.reinicia - Date.now()) / 1000) : 0;
}

function registrarLoginFallido(clave) {
  const ahora = Date.now();
  const entrada = intentosLogin.get(clave);
  if (!entrada || entrada.reinicia < ahora) {
    intentosLogin.set(clave, { fallos: 1, reinicia: ahora + VENTANA_LOGIN_MS });
  } else {
    entrada.fallos++;
  }
  // Limpieza oportunista para que el mapa no crezca sin límite.
  if (intentosLogin.size > 5000) {
    for (const [k, v] of intentosLogin) if (v.reinicia < ahora) intentosLogin.delete(k);
  }
}

function limpiarLoginFallido(clave) {
  intentosLogin.delete(clave);
}

module.exports = {
  UUID_REGEX,
  hashPassword,
  verifyPassword,
  safeEqual,
  createSessionToken,
  verifySessionToken,
  SESSION_COOKIE,
  SESSION_TTL_MS,
  createEncuestadorSessionToken,
  verifyEncuestadorSessionToken,
  ENCUESTADOR_SESSION_COOKIE,
  adminSigueActivo,
  invalidarCacheAdmin,
  ipDe,
  loginBloqueado,
  registrarLoginFallido,
  limpiarLoginFallido,
};
