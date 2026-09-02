// Cliente mínimo para la API REST de Twenty CRM.
// Paginación y filtro confirmados empíricamente contra la instancia real:
//   - cursor de paginación: query param `starting_after` (no `cursor`/`after`)
//   - filtro por fecha: `filter=updatedAt[gte]:<ISO date>`

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
  return process.env.TWENTY_API_URL;
}

async function fetchPeoplePage({ cursor, limit = 100, updatedSince } = {}) {
  const params = new URLSearchParams();
  params.set("limit", String(limit));
  if (cursor) params.set("starting_after", cursor);
  if (updatedSince) params.set("filter", `updatedAt[gte]:${updatedSince}`);

  const res = await fetch(`${baseUrl()}/people?${params.toString()}`, {
    headers: headers(),
  });
  if (!res.ok) {
    throw new Error(`Twenty GET /people fallo: ${res.status} ${await res.text()}`);
  }
  const body = await res.json();
  return {
    people: body.data.people,
    pageInfo: body.pageInfo,
    totalCount: body.totalCount,
  };
}

async function patchPerson(id, patch) {
  const res = await fetch(`${baseUrl()}/people/${id}`, {
    method: "PATCH",
    headers: headers(),
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    throw new Error(`Twenty PATCH /people/${id} fallo: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

module.exports = { fetchPeoplePage, patchPerson };
