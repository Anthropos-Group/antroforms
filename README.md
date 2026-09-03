# Sistema de Encuestas — EDIMCA

Encuestas de satisfacción integradas con Twenty CRM: cuestionario dinámico,
cron de limpieza automática de datos, panel de administración, reportes en
Excel y monitoreo de avance por sucursal.

Documentación de diseño completa en [`docs/`](docs/README.md) (producto, arquitectura, base de datos, API).

## Requisitos

- Node.js 20.9 o superior
- Una cuenta de [Supabase](https://supabase.com) (proyecto Postgres)
- Acceso a la instancia de Twenty CRM (URL + API Key)

## 1. Clonar e instalar

```bash
git clone https://github.com/Anthropos-Group/antroforms.git
cd antroforms
npm install
```

## 2. Configurar variables de entorno

Copia la plantilla y complétala:

```bash
cp .env.example .env
```

| Variable | Dónde conseguirla |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API → "Project URL" |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project Settings → API → clave "anon public" |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API → clave "service_role" (secreta) |
| `SUPABASE_DB_URL` | Supabase → Project Settings → Database → Connection string → modo **URI** (conexión directa, puerto 5432, con el password de la base) |
| `TWENTY_API_URL` | URL de tu instancia de Twenty + `/rest`, ej. `https://tu-dominio/rest` |
| `TWENTY_API_KEY` | Twenty → Settings → APIs & Webhooks → Crear clave API |
| `CRON_SECRET` | Cualquier string aleatorio largo (protege el endpoint del cron) — genera uno con `openssl rand -hex 32` |
| `ADMIN_SESSION_SECRET` | Otro string aleatorio largo, distinto al anterior (firma las sesiones del panel admin) |
| `ENCUESTADOR_ACCESS_PASSWORD` | La contraseña que va a compartir el equipo de encuestadores para entrar a `/encuesta` |

**Nunca subas `.env` a git** — ya está en `.gitignore`.

## 3. Aplicar el esquema de base de datos

Corre las migraciones (crea las tablas en Supabase y carga el cuestionario inicial):

```bash
npm run db:migrate
```

Esto es seguro de correr varias veces: cada migración se aplica una sola vez (queda registrada en la tabla `_migrations`).

## 4. Crear el primer administrador

El panel `/admin` necesita al menos un administrador para poder entrar:

```bash
node scripts/create-admin.js --nombre="Tu Nombre" --email=tu@correo.com --password=unaClaveSegura
```

## 5. Levantar el proyecto

```bash
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000) (o el puerto que uses). El login (`/login`) es el punto de entrada único: pestaña "Administrador" (usuario/contraseña) o "Encuestador" (contraseña compartida).

## 6. Traer datos de clientes desde Twenty

La app busca clientes contra una caché propia (`clientes_cache`), no contra Twenty en vivo. Para poblarla:

```bash
# Prueba segura: no escribe nada en Twenty, solo muestra qué cambiaría
npm run sync:twenty -- --mode=dry_run

# Backfill real: limpia los datos en Twenty y llena la caché completa
npm run sync:twenty -- --mode=backfill_completo
```

En producción, la corrida diaria (`--mode=incremental`) se dispara vía `POST /api/cron/sync-twenty` con el header `Authorization: Bearer {CRON_SECRET}` — hay que programarla con un scheduler externo (Cloud Scheduler, cron del servidor, etc.), apuntando idealmente a un par de horas después de la carga diaria de datos.

## Scripts disponibles

| Comando | Qué hace |
|---|---|
| `npm run dev` | Levanta el servidor de desarrollo |
| `npm run build` | Build de producción |
| `npm run start` | Sirve el build de producción |
| `npm run db:migrate` | Aplica las migraciones pendientes de `supabase/migrations/` |
| `npm run sync:twenty -- --mode=<dry_run\|incremental\|backfill_completo>` | Corre el cron de limpieza/sincronización manualmente |

## Estructura del proyecto

```
app/            Páginas y API routes (Next.js App Router)
components/     Componentes compartidos (navegación)
lib/            Lógica de negocio (auth, sync con Twenty, normalización, reportes)
scripts/        CLIs de mantenimiento (migraciones, sync, alta de admin)
supabase/       Migraciones SQL versionadas
docs/           Documentación de diseño (PRD, arquitectura, base de datos, API)
proxy.js        Protección de rutas por rol (admin / encuestador)
```

## Despliegue

Para producción, la forma más simple hoy es en un servidor propio con Docker — ver [docs/DEPLOY.md](docs/DEPLOY.md) (incluye `Dockerfile`, `docker-compose.yml` y `Caddyfile` ya listos en la raíz del repo).
