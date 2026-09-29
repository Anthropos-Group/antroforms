// Cliente mínimo para la API REST de Twenty CRM.
// Paginación y filtro confirmados empíricamente contra la instancia real:
//   - cursor de paginación: query param `starting_after` (no `cursor`/`after`)
//   - filtro por fecha: `filter=updatedAt[gte]:<ISO date>`

const TIMEOUT_DEFAULT_MS = 20_000;
const REINTENTOS_DEFAULT = 2;

function headers() {
  return {
    Authorization: `Bearer ${process.env.TWENTY_API_KEY}`,
    "Content-Type": "application/json",
  };
}

function baseUrl() {
  if (!process.env.TWENTY_API_URL) {
    throw new Error("Falta TWENTY_API_URL en .env");
  }
  return process.env.TWENTY_API_URL.replace(/\/+$/, "");
}

function twentyConfigurado() {
  return Boolean(process.env.TWENTY_API_URL && process.env.TWENTY_API_KEY);
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

// fetch con timeout y reintentos con backoff exponencial ante 429 / 5xx / red
// (TRD §4: "backoff ante respuestas 429"). Los 4xx restantes no se reintentan.
async function twentyFetch(path, { method = "GET", body, timeoutMs = TIMEOUT_DEFAULT_MS, reintentos = REINTENTOS_DEFAULT } = {}) {
  let ultimoError;
  for (let intento = 0; intento <= reintentos; intento++) {
    try {
      const res = await fetch(`${baseUrl()}${path}`, {
        method,
        headers: headers(),
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.ok) return res.json();

      const texto = (await res.text()).slice(0, 500);
      const err = new Error(`Twenty ${method} ${path.split("?")[0]} fallo: ${res.status} ${texto}`);
      err.status = res.status;
      if (res.status !== 429 && res.status < 500) throw err;
      ultimoError = err;
      const retryAfter = Number(res.headers.get("retry-after"));
      if (intento < reintentos) {
        await esperar(retryAfter > 0 ? Math.min(retryAfter, 30) * 1000 : 500 * 2 ** intento);
      }
    } catch (err) {
      if (err.status && err.status !== 429 && err.status < 500) throw err;
      ultimoError =
        err.name === "TimeoutError" || err.name === "AbortError"
          ? new Error(`Twenty ${method} ${path.split("?")[0]} no respondió en ${timeoutMs / 1000}s`)
          : err.message === "fetch failed"
            ? new Error(`Sin conexión con Twenty (${method} ${path.split("?")[0]}): ${err.cause?.code || err.cause?.message || "error de red"}`)
            : err;
      if (intento < reintentos) await esperar(500 * 2 ** intento);
    }
  }
  throw ultimoError;
}

async function fetchPeoplePage({ cursor, limit = 100, updatedSince, filter, timeoutMs, reintentos } = {}) {
  const params = new URLSearchParams();
  params.set("limit", String(limit));
  if (cursor) params.set("starting_after", cursor);
  if (filter) params.set("filter", filter);
  else if (updatedSince) params.set("filter", `updatedAt[gte]:${updatedSince}`);

  const body = await twentyFetch(`/people?${params.toString()}`, { timeoutMs, reintentos });
  return {
    people: body.data?.people || [],
    pageInfo: body.pageInfo || { hasNextPage: false },
    totalCount: body.totalCount,
  };
}

async function patchPerson(id, patch, opts = {}) {
  return twentyFetch(`/people/${id}`, { method: "PATCH", body: patch, ...opts });
}

module.exports = { fetchPeoplePage, patchPerson, twentyConfigurado };
