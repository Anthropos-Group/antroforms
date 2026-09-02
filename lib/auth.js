const crypto = require("crypto");

const SCRYPT_KEYLEN = 64;
const SESSION_COOKIE = "admin_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 12; // 12 horas

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

function sign(value) {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) throw new Error("Falta ADMIN_SESSION_SECRET en .env");
  return crypto.createHmac("sha256", secret).update(value).digest("hex");
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
  const payload = `${adminId}.${expires}`;
  let expected;
  try {
    expected = sign(payload);
  } catch {
    return null;
  }
  const sigBuf = Buffer.from(sig, "hex");
  const expBuf = Buffer.from(expected, "hex");
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) return null;
  if (Date.now() > Number(expires)) return null;
  return adminId;
}

// Sesión de encuestador: una sola contraseña compartida (sin tabla de usuarios),
// a diferencia de administradores que tienen cuenta individual con email.
const ENCUESTADOR_SESSION_COOKIE = "encuestador_session";
const ENCUESTADOR_MARKER = "encuestador";

function createEncuestadorSessionToken() {
  const expires = Date.now() + SESSION_TTL_MS;
  const payload = `${ENCUESTADOR_MARKER}.${expires}`;
  return `${payload}.${sign(payload)}`;
}

function verifyEncuestadorSessionToken(token) {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [marker, expires, sig] = parts;
  if (marker !== ENCUESTADOR_MARKER) return false;
  const payload = `${marker}.${expires}`;
  let expected;
  try {
    expected = sign(payload);
  } catch {
    return false;
  }
  const sigBuf = Buffer.from(sig, "hex");
  const expBuf = Buffer.from(expected, "hex");
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) return false;
  if (Date.now() > Number(expires)) return false;
  return true;
}

module.exports = {
  hashPassword,
  verifyPassword,
  createSessionToken,
  verifySessionToken,
  SESSION_COOKIE,
  SESSION_TTL_MS,
  createEncuestadorSessionToken,
  verifyEncuestadorSessionToken,
  ENCUESTADOR_SESSION_COOKIE,
};
