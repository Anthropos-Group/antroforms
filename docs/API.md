# API — Contratos de endpoints (Next.js API Routes)

Todas las rutas viven bajo `/api`. Autenticación de app: sesión compartida (ver `TRD.md` §6). Las rutas de cron requieren header `Authorization: Bearer {CRON_SECRET}`.

## Clientes

### `GET /api/clientes/search`
Busca en `clientes_cache` (nunca en Twenty en vivo).

**Query params:** `q` (texto, mínimo 3 caracteres) — busca por nombre, código, teléfono o id EDIMCA.

Solo devuelve clientes del **mes de gestión en curso y el anterior** (en septiembre: SEPTIEMBRE y AGOSTO), que además vienen en `mesesPermitidos`. `POST /api/encuestas` aplica la misma regla a los encuestadores (422 `MES_NO_PERMITIDO`); los administradores no tienen el límite.

**Response 200:**
```json
{
  "results": [
    {
      "id_twenty": "uuid",
      "nombre": "IZA VILLA LUIS",
      "codigo_cliente": "1455446",
      "pdv": "SAN RAFAEL",
      "mes_gestion": "JUNIO",
      "id_edimca": "1095",
      "status": "PENDIENTE"
    }
  ]
}
```

## Cuestionarios y preguntas

### `GET /api/cuestionarios/activo`
Devuelve el cuestionario activo con sus preguntas ordenadas y su lógica condicional.

**Response 200:**
```json
{
  "id": "uuid",
  "nombre": "Satisfacción EDIMCA",
  "version": 3,
  "preguntas": [
    {
      "id": "uuid",
      "orden": 1,
      "texto": "¿Está usted de acuerdo, y acepta participar del siguiente estudio?",
      "tipo": "aceptacion_si_no",
      "requiere_justificacion": false,
      "condicion": null
    },
    {
      "id": "uuid",
      "orden": 2,
      "texto": "¿Es usted la persona que realizó todo el proceso de compra?",
      "tipo": "aceptacion_si_no",
      "requiere_justificacion": false,
      "condicion": null
    },
    {
      "id": "uuid",
      "orden": 3,
      "texto": "5. ¿Qué tanto recomendaría EDIMCA...?",
      "tipo": "escala_1_10",
      "requiere_justificacion": true,
      "condicion": { "pregunta_id": "<id-pregunta-2>", "valor_esperado": true }
    }
  ]
}
```

### `GET /api/preguntas` (admin)
Lista todas las preguntas del cuestionario activo (incluye inactivas).

### `POST /api/preguntas` (admin)
Crea una pregunta.
```json
{
  "cuestionario_id": "uuid",
  "orden": 4,
  "texto": "...",
  "tipo": "escala_1_10",
  "requiere_justificacion": true,
  "condicion": null
}
```

### `PATCH /api/preguntas/:id` (admin)
Edita cualquier campo de la pregunta (texto, orden, tipo, condición, `activa`).

### `DELETE /api/preguntas/:id` (admin)
Baja lógica (`activa: false`), no borra histórico de respuestas asociadas.

## Encuestadores

### `GET /api/encuestadores` (admin)
Lista todos (`activo` true/false).

### `POST /api/encuestadores` (admin)
```json
{ "nombre": "Juan Pérez" }
```

### `PATCH /api/encuestadores/:id` (admin)
```json
{ "nombre": "Juan Pérez", "activo": false }
```

### `DELETE /api/encuestadores/:id` (admin)
Baja lógica.

## Encuestas

### `POST /api/encuestas`
Registra una encuesta completa (o parcial si se cortó por condición). El servidor **no confía en el navegador**: valida las respuestas con las mismas reglas de la UI (`lib/encuesta-logica.js`) y calcula él mismo si quedó `completada` y qué estado va a Twenty.

**Request:**
```json
{
  "cuestionario_id": "uuid",
  "cliente_twenty_id": "uuid-de-twenty",
  "encuestador_id": "uuid",
  "idempotency_key": "draft_1727...",
  "respuestas": [
    { "pregunta_id": "uuid", "valor": true },
    { "pregunta_id": "uuid", "valor": { "calificacion": 9, "justificacion": "Buena atención" } },
    { "pregunta_id": "uuid", "valor": "N/A" }
  ]
}
```

- `idempotency_key` (recomendado): reintentar con la misma clave devuelve la encuesta ya creada (`duplicada: true`) en vez de duplicarla.
- Escalas: `calificacion` entera 1-10; justificación obligatoria si la pregunta la requiere (máx. 2000 caracteres).
- Preguntas con condición de dato del cliente (P7/TOTAL) sin dato se guardan como `"N/A"` aunque no vengan.

**Efectos:** si queda completada → `status: "EFECTIVA"`; si el cliente no aceptó participar (primera pregunta = No) → `status: "NO_LLAMAR"`. Se actualiza `clientes_cache` en la misma transacción y luego se hace `PATCH` a Twenty con timeout de 8 s; si falla, queda en la cola `pending_twenty_sync` (la encuesta igual queda guardada).

**Respuestas:**

| Código | Cuándo |
|---|---|
| `201` | `{ "id", "completada", "status", "twentyError" }` |
| `200` | Reintento de un envío ya guardado: `{ "id", "completada", "duplicada": true }` |
| `400` | Campos faltantes / ids inválidos / encuestador inexistente |
| `404` | Cliente no existe en `clientes_cache` |
| `409` | `code: "YA_ENCUESTADO"` (el cliente ya tiene una encuesta efectiva) o `code: "CUESTIONARIO_DESACTUALIZADO"` |
| `422` | `code: "RESPUESTAS_INVALIDAS"`, con `errores: [{ preguntaId, mensaje }]` |

### `GET /api/encuestas` (admin)
Lista encuestas con filtros de query: `encuestador_id`, `desde`, `hasta` (fechas en hora de Ecuador), `mes_gestion`, `pdv`, `estado` (`efectiva` | `cortada`). Devuelve hasta 1000 filas (`truncado: true` si hay más) y un `resumen` calculado en SQL sobre todo el universo filtrado: totales, tasa de efectividad y, por pregunta, promedio, promotores/pasivos/detractores, índice neto (NPS) y conteos Sí/No/N/A.

### `GET /api/encuestas/export`
Genera y descarga el Excel. Mismos filtros que el listado.

**Response:** archivo `.xlsx` con dos hojas: "Encuestas" (una fila por encuesta: fecha en hora de Ecuador, encuestador, cliente, código, teléfono, PDV, mes de gestión, etiqueta, completada, y una columna por pregunta y su justificación) y "Resumen" (KPIs y promedio / NPS por pregunta).

## Cron / Sync con Twenty

### `POST /api/cron/sync-twenty`
La sincronización diaria la lanza el propio contenedor (ver `lib/programador.js` y `DEPLOY.md` §6); este endpoint queda para el botón manual del panel y para un cron externo opcional. Requiere `Authorization: Bearer {CRON_SECRET}` o sesión de administrador.

**Body opcional:**
```json
{ "modo": "incremental", "esperar": false }
```
Valores de `modo`: `dry_run` | `incremental` (default) | `backfill_completo`.

**Response 202** (por defecto): la corrida sigue en segundo plano — una corrida grande tarda minutos y Cloudflare corta los requests a los 100 s.
```json
{ "ok": true, "sync_run_id": "uuid", "tipo": "incremental", "estado": "en_progreso" }
```
Con `?esperar=1` (o `"esperar": true`) responde 200 al terminar, con `registros_escaneados`, `registros_modificados`, `errores`, `estado` y `parcial`.

**Response 409:** ya hay una sincronización en curso.

### `GET /api/admin/sync-runs/:id` (admin)
Estado y avance de una corrida (`sync_runs`): `estado`, `registros_escaneados`, `registros_modificados`, `errores`, `parcial`, `detalle` (motivo de los errores). El botón manual la consulta cada 3 s.

## Configuración y operación (nuevo)

### `PATCH /api/cuestionarios/activo` (admin)
Edita `nombre`, `guion_apertura`, `guion_cierre` (variables `{{ENCUESTADOR}}`, `{{SUCURSAL}}`, `{{FECHA}}`) y `meta_mensual_pdv` (entero ≥ 1, usada por el monitoreo).

### `POST /api/preguntas/reordenar` (admin)
`{ "ids": ["uuid", ...] }` con todas las preguntas del cuestionario activo en el nuevo orden. Rechaza órdenes que dejen una pregunta antes de la pregunta de la que depende.

### `GET /api/admin/twenty-pendientes` · `POST /api/admin/twenty-pendientes` (admin)
Lista la cola de cambios de estado que Twenty no aceptó al cerrar encuestas / reintenta todos ahora (incluidos los que agotaron los 5 reintentos automáticos).

### `GET /api/health` (público)
`{ "ok": true, "db": "ok" }` o `503`. Lo usa el `HEALTHCHECK` de Docker.

### Límites de login
`POST /api/admin/login` y `POST /api/encuestador/login` responden `429` (con `Retry-After`) tras demasiados intentos fallidos en 15 minutos.
