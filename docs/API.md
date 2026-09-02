# API — Contratos de endpoints (Next.js API Routes)

Todas las rutas viven bajo `/api`. Autenticación de app: sesión compartida (ver `TRD.md` §6). Las rutas de cron requieren header `Authorization: Bearer {CRON_SECRET}`.

## Clientes

### `GET /api/clientes/search`
Busca en `clientes_cache` (nunca en Twenty en vivo).

**Query params:** `q` (texto, mínimo 3 caracteres) — busca por `nombre` normalizado.

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
Crea una encuesta completa (o parcial si se cortó por condición).

**Request:**
```json
{
  "cuestionario_id": "uuid",
  "cliente_twenty_id": "uuid-de-twenty",
  "codigo_cliente": "1455446",
  "encuestador_id": "uuid",
  "completada": true,
  "respuestas": [
    { "pregunta_id": "uuid", "valor": true },
    { "pregunta_id": "uuid", "valor": 9 },
    { "pregunta_id": "uuid", "valor": "Buena atención" }
  ]
}
```

**Efecto secundario:** si `completada: true`, dispara `PATCH` a Twenty (`status: "EFECTIVA"`) sobre `cliente_twenty_id`. Si ese `PATCH` falla, la encuesta igual se guarda (no se pierde el trabajo del encuestador) y el error queda logueado para reintento manual desde el admin.

**Response 201:** `{ "id": "uuid" }`

### `GET /api/encuestas` (admin)
Lista encuestas con filtros de query: `encuestador_id`, `desde`, `hasta`, `mes_gestion`. Usado por la vista de reportes antes de exportar.

### `GET /api/encuestas/export`
Genera y descarga el Excel. Mismos filtros que el listado.

**Response:** archivo `.xlsx` (una fila por encuesta, columnas: encuestador, cliente, código, PDV, mes de gestión, fecha, completada, y una columna por pregunta con su respuesta).

## Cron / Sync con Twenty

### `POST /api/cron/sync-twenty`
Disparado por el scheduler (Vercel Cron / Supabase Scheduled Function) diariamente a las 16:00 UTC. Requiere `Authorization: Bearer {CRON_SECRET}`.

**Body opcional:**
```json
{ "modo": "incremental" }
```
Valores de `modo`: `dry_run` | `incremental` (default) | `backfill_completo`.

**Response 200:**
```json
{
  "sync_run_id": "uuid",
  "registros_escaneados": 412,
  "registros_modificados": 37,
  "errores": 0
}
```

### `GET /api/cron/sync-twenty/runs` (admin)
Historial de corridas (`sync_runs`), paginado.

### `GET /api/cron/sync-twenty/runs/:id/changes` (admin)
Detalle de cambios de una corrida específica (`sync_changes`) — para auditar qué se modificó en Twenty.
