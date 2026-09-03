# Despliegue en tu propio servidor (Docker)

Alternativa a Firebase Hosting/Vercel: corre en cualquier servidor Linux con
Docker instalado — el mismo patrón que probablemente ya usas para Twenty CRM.

## Requisitos en el servidor

- Docker y Docker Compose (`docker compose version` debe funcionar)
- Un dominio o subdominio apuntando a la IP del servidor (registro DNS tipo A) — necesario para que Caddy emita el certificado HTTPS automáticamente
- Puertos **80** y **443** abiertos en el firewall

## 1. Clonar el proyecto en el servidor

```bash
git clone https://github.com/Anthropos-Group/antroforms.git
cd antroforms
```

## 2. Configurar variables de entorno

```bash
cp .env.example .env
nano .env   # completa con tus valores reales (ver README.md principal)
```

## 3. Configurar el dominio en Caddy

Edita [`Caddyfile`](../Caddyfile) y reemplaza `encuestas.tudominio.com` por tu dominio real:

```
encuestas.tudominio.com {
	reverse_proxy app:3000
}
```

## 4. Levantar todo

```bash
docker compose up -d --build
```

Esto construye la imagen de la app y levanta dos contenedores: `app` (Next.js) y `caddy` (proxy reverso + HTTPS automático vía Let's Encrypt). La primera vez puede tardar unos minutos en emitir el certificado.

Verifica que ambos estén corriendo:

```bash
docker compose ps
docker compose logs -f app
```

## 5. Aplicar el esquema de base de datos (una sola vez)

Las migraciones solo necesitan `SUPABASE_DB_URL` — puedes correrlas desde el servidor o desde cualquier máquina con acceso a internet, no tiene que ser el mismo contenedor:

```bash
docker compose exec app node scripts/migrate.js
```

Y crear el primer administrador si no existe:

```bash
docker compose exec app node scripts/create-admin.js --nombre="Tu Nombre" --email=tu@correo.com --password=unaClaveSegura
```

## 6. Programar el cron diario de limpieza de Twenty

Este endpoint hace el `PATCH` real a Twenty y refresca la caché — se dispara con una petición HTTP protegida por `CRON_SECRET`. En el servidor, agrégalo al crontab del sistema (no dentro del contenedor):

```bash
crontab -e
```

Agrega (11:00 hora Ecuador = 16:00 UTC):

```
0 16 * * * curl -s -X POST https://encuestas.tudominio.com/api/cron/sync-twenty -H "Authorization: Bearer TU_CRON_SECRET" >> /var/log/sync-twenty.log 2>&1
```

## 7. Actualizar la app cuando haya cambios nuevos

```bash
cd antroforms
git pull
docker compose up -d --build
```

Docker reconstruye solo lo que cambió; los contenedores se reinician con la versión nueva sin perder datos (la base vive en Supabase, no en el servidor).

## Si prefieres no usar Caddy

Si el servidor ya tiene Nginx u otro proxy con su propio manejo de TLS, comenta el servicio `caddy` en `docker-compose.yml`, descomenta el bloque `ports: ["3000:3000"]` del servicio `app`, y apunta tu proxy existente a `http://localhost:3000`.
