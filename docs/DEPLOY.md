# Despliegue en tu servidor (Portainer + Cloudflare Tunnel)

Se despliega como un stack más de Portainer, igual que `core-strattos` —
misma red Docker (`strattos-net`), sin abrir puertos nuevos en el servidor.
El ruteo público y el HTTPS los resuelve tu Cloudflare Tunnel existente, no
hace falta un proxy adicional (Caddy/Nginx) para esta app.

## Cómo funciona

```
Cloudflare Tunnel  →  http://antroforms-web-strattos:3000  →  contenedor de la app
                        (mismo patrón que crm.aiagentrevenue.online → twenty-web-stratos:3000)
```

La app no necesita su propia base de datos en el servidor — usa Supabase
(externo). Por eso no toca nada del stack `core-strattos`; solo se conecta a
la misma red Docker para que el Tunnel la pueda alcanzar por nombre.

## 1. Crear el stack en Portainer

En Portainer: **Stacks → Add stack**.

- **Name:** `antroforms`
- **Build method:** `Repository`
  - **Repository URL:** `https://github.com/Anthropos-Group/antroforms.git`
  - **Repository reference:** `refs/heads/main`
  - **Compose path:** `docker-compose.yml`
  - Si el repositorio es privado, activa **Authentication** y pon un usuario + Personal Access Token de GitHub con permiso de lectura sobre el repo.

## 2. Variables de entorno

En la sección **Environment variables** del formulario del stack, pega el contenido de `.env` (mismas variables que en el [README](../README.md) principal — Supabase, Twenty, `CRON_SECRET`, `ADMIN_SESSION_SECRET`, `ENCUESTADOR_ACCESS_PASSWORD`). Portainer genera el archivo `.env` que usa `env_file: .env` en el `docker-compose.yml`.

## 3. Desplegar

**Deploy the stack**. Portainer clona el repo, construye la imagen con el `Dockerfile` y levanta el contenedor `antroforms-web-strattos` en la red `strattos-net` — se ve junto a `core-strattos` en la lista de stacks.

## 4. Conectar el dominio en Cloudflare Tunnel

En Cloudflare Zero Trust → tu túnel → **Published application routes → Add a route**, igual que las demás:

| Subdomain | Service |
|---|---|
| `encuestas.aiagentrevenue.online` (o el que prefieras) | `http://antroforms-web-strattos:3000` |

## 5. Aplicar el esquema de base de datos

> **Cada actualización que agregue un archivo en `supabase/migrations/` requiere correr las migraciones _antes_ del "Pull and redeploy".** Es seguro correrlas varias veces.

Las migraciones solo necesitan `SUPABASE_DB_URL` — se pueden correr desde cualquier máquina con acceso a internet, no hace falta que sea el servidor:

```bash
npm run db:migrate
```

O, si prefieres correrlo dentro del contenedor ya desplegado, desde la consola de Portainer del contenedor `antroforms-web-strattos`:

```bash
node scripts/migrate.js
node scripts/create-admin.js --nombre="Tu Nombre" --email=tu@correo.com --password=unaClaveSegura
```

## 6. Tareas programadas (sincronización con Twenty y keep-alive)

No hace falta programar nada fuera del contenedor. Al arrancar, la app lanza su
propio programador (`instrumentation.js` → `lib/programador.js`):

| Tarea | Cuándo | Para qué |
|---|---|---|
| Refresco de la copia local de clientes | cada 10 min | Lee de Twenty (solo lectura) los clientes modificados — altas como la carga del mes nuevo, cambios de estado — y los guarda ya normalizados. Reintenta también la cola de estados pendientes hacia Twenty. |
| Limpieza de datos en Twenty | 22:00 hora de Ecuador | Corrige en Twenty espacios, teléfonos y valores sucios (un `PATCH` por registro, lento: de noche para no cargar Twenty en horario de trabajo). Si el contenedor estaba caído a esa hora, se recupera apenas vuelve a levantar (mismo día). |
| Keep-alive de Supabase | cada 60 min | Consulta la base (y la API REST si `NEXT_PUBLIC_SUPABASE_URL` y la anon key están configuradas) para que el plan gratuito no pause el proyecto por inactividad. |

Cómo encajan, y por qué hay una copia local: [SINCRONIZACION.md](./SINCRONIZACION.md).

En los logs del contenedor debe aparecer al arrancar:

```
[programador] Keep-alive cada 60 min; refresco de clientes cada 10 min; limpieza en Twenty a las 22:00 (Ecuador).
```

Variables opcionales (ya declaradas en `docker-compose.yml` con estos valores por defecto):

| Variable | Default | |
|---|---|---|
| `TAREAS_PROGRAMADAS` | `on` | `off` desactiva todo (si algún día se corre más de una réplica, dejarlo en `on` solo en una). |
| `REFRESCO_MINUTOS` | `10` | Frecuencia del refresco de la copia local. `0` lo desactiva. |
| `SYNC_HORAS_ECUADOR` | `22` | Horas de la limpieza en Twenty, separadas por coma. Vacío = sin limpieza automática. |
| `KEEPALIVE_MINUTOS` | `60` | Frecuencia del keep-alive. |

Solo corre una sincronización a la vez: si ya hay una en curso (por ejemplo,
alguien presionó el botón manual) otra llamada responde `409`. El botón del
panel y `POST /api/cron/sync-twenty` responden de inmediato (`202`) y la corrida
sigue en segundo plano; su avance se ve en **Historial Twenty**. Una corrida que
pase 15 minutos sin avanzar (contenedor reiniciado a mitad) se marca como fallida
automáticamente, y el motivo de cualquier error queda en el detalle de la corrida.

**Cron externo (opcional, redundancia).** Si además quieres un disparador fuera
del servidor, cualquier servicio de cron puede llamar:

```
curl -s -X POST https://encuestas.aiagentrevenue.online/api/cron/sync-twenty -H "Authorization: Bearer TU_CRON_SECRET"
```

**Monitor externo (recomendado).** Un monitor gratuito (UptimeRobot, Better Stack…)
contra `https://<dominio>/api/health` cada 5 min avisa si la app o la base se caen,
y es un segundo keep-alive independiente del programador.

## 7. Healthcheck y monitoreo

La imagen trae un `HEALTHCHECK` contra `GET /api/health` (verifica la conexión a la base de datos). En Portainer el contenedor debe aparecer como **healthy**. Conviene apuntar además un monitor externo (UptimeRobot, Better Stack…) a `https://<dominio>/api/health`.

## Actualizar la app

1. Si la actualización trae migraciones nuevas, aplicarlas primero (paso 5).
2. Con un push a `main` en GitHub, en Portainer: **Stacks → antroforms → Pull and redeploy** (o configura un webhook de Portainer para que se redepliegue solo con cada push).

## Dar de baja

**Stacks → antroforms → Stop this stack** (pausa sin borrar) o **Delete this stack** (elimina el contenedor; la base de datos en Supabase no se toca).

## Troubleshooting

### `Error: connect ENETUNREACH ...:5432` en los logs del contenedor

La conexión **directa** de Supabase (`db.<project-ref>.supabase.co`) resuelve por IPv6 en muchas regiones. Si el servidor/contenedor no tiene salida IPv6, falla con este error. Solución: usar el connection string de **"Session pooler"** en `SUPABASE_DB_URL` (Supabase → Settings → Database → Connection string → Session pooler) — usa usuario `postgres.<project-ref>` y funciona por IPv4.

### `env file .../.env not found` al desplegar desde un repositorio en Portainer

Portainer no crea un `.env` físico en el directorio del stack cuando se despliega desde Git. El `docker-compose.yml` de este repo ya usa `environment: VAR: ${VAR}` (no `env_file:`) para evitar este problema — si ves este error, confirma que estás en la versión más reciente del compose (haz "Pull and redeploy" o refresca el repositorio).
