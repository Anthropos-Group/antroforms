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

## 5. Aplicar el esquema de base de datos (una sola vez)

Las migraciones solo necesitan `SUPABASE_DB_URL` — se pueden correr desde cualquier máquina con acceso a internet, no hace falta que sea el servidor:

```bash
npm run db:migrate
```

O, si prefieres correrlo dentro del contenedor ya desplegado, desde la consola de Portainer del contenedor `antroforms-web-strattos`:

```bash
node scripts/migrate.js
node scripts/create-admin.js --nombre="Tu Nombre" --email=tu@correo.com --password=unaClaveSegura
```

## 6. Programar el cron diario de limpieza de Twenty

Desde cualquier máquina con acceso al dominio público (no tiene que ser el servidor — puede ser tu propia PC, un servicio de cron externo, o un cronjob en el mismo servidor):

```bash
crontab -e
```

```
0 16 * * * curl -s -X POST https://encuestas.aiagentrevenue.online/api/cron/sync-twenty -H "Authorization: Bearer TU_CRON_SECRET" >> /var/log/sync-twenty.log 2>&1
```

(11:00 hora Ecuador = 16:00 UTC)

## Actualizar la app

Con un push a `main` en GitHub, en Portainer: **Stacks → antroforms → Pull and redeploy** (o configura un webhook de Portainer para que se redepliegue solo con cada push).

## Dar de baja

**Stacks → antroforms → Stop this stack** (pausa sin borrar) o **Delete this stack** (elimina el contenedor; la base de datos en Supabase no se toca).

## Troubleshooting

### `Error: connect ENETUNREACH ...:5432` en los logs del contenedor

La conexión **directa** de Supabase (`db.<project-ref>.supabase.co`) resuelve por IPv6 en muchas regiones. Si el servidor/contenedor no tiene salida IPv6, falla con este error. Solución: usar el connection string de **"Session pooler"** en `SUPABASE_DB_URL` (Supabase → Settings → Database → Connection string → Session pooler) — usa usuario `postgres.<project-ref>` y funciona por IPv4.

### `env file .../.env not found` al desplegar desde un repositorio en Portainer

Portainer no crea un `.env` físico en el directorio del stack cuando se despliega desde Git. El `docker-compose.yml` de este repo ya usa `environment: VAR: ${VAR}` (no `env_file:`) para evitar este problema — si ves este error, confirma que estás en la versión más reciente del compose (haz "Pull and redeploy" o refresca el repositorio).
