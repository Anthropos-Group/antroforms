# TRD — Requisitos Técnicos

## 1. Stack

| Capa | Elección | Motivo |
|---|---|---|
| Frontend + Backend | **Next.js** (App Router) | Un solo proyecto para app de encuestador, panel admin y API routes (incluida la del cron). |
| Base de datos propia | **Supabase (Postgres)** | Hosting gestionado, auth disponible si se necesita más adelante, buen soporte para jobs vía Edge Functions si no se usa Vercel Cron. |
| CRM fuente de clientes | **Twenty CRM (self-hosted)** | Ya en uso por el equipo de gestión de llamadas. Se integra vía su API REST (`/rest/people`), autenticada con API Key. |
| Exportación de reportes | Librería de generación de `.xlsx` en Node (ej. `exceljs`) desde una API route | Evita depender de herramientas externas para el export. |
| Cron | Vercel Cron Job (si se hostea en Vercel) o Supabase Scheduled Edge Function | Dispara diariamente la limpieza de Twenty y el refresco de caché. |

## 2. Integración con Twenty CRM

- Objeto fuente: **`people`** (objeto estándar de Twenty, reetiquetado en la UI como "Gestión Llamadas", extendido con campos custom).
- Autenticación: API Key generada en Settings → API y Webhooks, con scope de lectura/escritura sobre `people`. Se guarda como variable de entorno (`TWENTY_API_KEY`), nunca en código ni en base de datos en texto plano.
- Endpoint base: `https://{dominio-twenty}/rest`.
- Filtros soportados confirmados: `filter=campo[operador]:valor` (`ilike`, `eq` verificados en pruebas), con wildcards `%texto%` para búsqueda parcial.
- Paginación: cursor-based (`pageInfo.startCursor` / `endCursor`, `hasNextPage`). Nunca traer el dataset completo (~20,700+ registros y creciendo) en una sola llamada.
- Campos relevantes y su nombre real en la API:

  | Campo UI | Campo API |
  |---|---|
  | Nombre | `name.firstName` (nombre completo va aquí; `lastName` normalmente vacío) |
  | Código de cliente | `codigoCliente` |
  | Mes de Gestión | `mesGestion` |
  | PDV | `nombrePuntoVenta` / `etiqueta` / `mcuServicios` |
  | Estado de gestión | `status` (enum) |
  | ID Edimca | `idEdimca` |
  | Teléfonos | `telefono1` … `telefono6` |
  | Observaciones | `observaciones` |

- Valores del enum `status`: `PENDIENTE`, `EN_GESTION`, `EFECTIVA`, `NO_CONTESTA`, `NO_LLAMAR`, `VOLVER_A_LLAMAR`, `YA_LE_REALIZARON_LA_ENCUESTA`, `NO_DISPONIBLE`, `CUOTA_CUMPLIDA`.
- Escritura: `PATCH /rest/people/{id}` — usada en dos flujos distintos:
  1. Cron de limpieza (corrige campos de texto).
  2. Cierre de encuesta (setea `status: "EFECTIVA"`).

## 3. Problema de calidad de datos (motivación del cron)

Los campos de texto en Twenty vienen de cargas de ancho fijo (mainframe) y presentan:
- Relleno de espacios al final/dentro del valor (`"ZONA 1            "`).
- Strings literales `"NULL"` en vez de valor vacío real (ej. `telefono2: "NULL"`).

Esto se corrige **en la fuente** (Twenty), no solo en una copia local, porque otros equipos también consultan Twenty directamente.

## 4. Cron de limpieza — reglas técnicas

- Horario: `0 16 * * *` (UTC) = 11:00 UTC-5, diario. Corre 2 horas después de la carga diaria de datos (9:00 UTC-5).
- Reglas de normalización (fijas en código, no configurables desde UI en esta fase):
  - `trim()` + colapsar espacios internos múltiples a uno solo, aplicado a: `name.firstName`, `nombrePuntoVenta`, `etiqueta`, `mcuServicios`.
  - Reemplazo del string literal `"NULL"` por valor vacío real en `telefono1`…`telefono6`.
- Primera corrida: backfill completo de todos los registros existentes, en **modo dry-run** primero (calcula y loguea los cambios sin ejecutar `PATCH`) para validar antes de dejarlo autónomo.
- Corridas siguientes: solo registros con `updatedAt` posterior a la última corrida exitosa registrada. Reconciliación completa periódica (ej. semanal) como red de seguridad.
- Toda corrida queda registrada (ver `DATABASE.md`: `sync_runs`, `sync_changes`) con el detalle campo por campo de qué cambió.
- Rate limiting: escritura secuencial o con concurrencia limitada (ej. máx. 5 requests simultáneos) con backoff ante respuestas 429.

## 5. Caché de clientes para búsqueda

- Se mantiene `clientes_cache` en Supabase, espejo normalizado de los campos relevantes de `people`.
- Se refresca: (a) al final de cada corrida del cron de limpieza, y (b) opcionalmente vía webhook de Twenty (`person.created`/`person.updated`) para altas intradía.
- La app de encuestador **nunca** consulta Twenty en vivo para buscar clientes — siempre contra esta caché, por performance y resiliencia ante caídas/lentitud de Twenty.

## 6. Seguridad

- `TWENTY_API_KEY` y credenciales de Supabase (service role) solo como variables de entorno del servidor, nunca expuestas al cliente.
- Las API routes que ejecutan el cron o el `PATCH` a Twenty deben validar un secreto compartido (`CRON_SECRET`) para no ser invocables públicamente.
- El panel admin y la app de encuestador comparten una única cuenta de acceso (sin roles individuales en esta fase) — protegida al menos con autenticación básica a nivel de aplicación.

## 7. No-objetivos técnicos

- No se construye un motor de reglas de limpieza configurable en esta fase (reglas fijas en código).
- No se implementa reintento automático de encuestas fallidas a mitad de flujo.
- No se sincroniza nada más allá de `people` en esta fase (sin tocar `companies`, `opportunities`, etc.).
