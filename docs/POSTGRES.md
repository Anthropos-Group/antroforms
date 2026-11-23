# Postgres propio para clientes nuevos

Desde el cliente 3, cada cliente nuevo tiene su base en un Postgres que corre en el
mismo servidor (VM 104, red `strattos-net`) en vez de un proyecto de Supabase:

- **Una base y un usuario por cliente** (`af_<slug>`): un cliente no puede leer la base de otro.
- **Sin costo por cliente** y **sin depender de la red hacia AWS** (causa de las caídas de nov. 2026).
- **Postgres no se publica a internet.** Desde fuera solo se llega al **aprovisionador**
  (`aprovisionador/server.js`), por Cloudflare Tunnel y con token. Puede crear la base de un
  cliente, cambiar su contraseña, ver su estado y hacer consultas de solo lectura. No borra nada.
  Cada llamada queda en la tabla `auditoria` (`GET /auditoria`).
- **Respaldo diario** de todo el servidor a las 03:00 (7 diarios, 4 semanales, 6 mensuales) en el
  volumen `antroforms-respaldos`.

EDIMCA y Cooperativa 23 de Julio siguen en Supabase.

## Configuración (una sola vez)

1. **Secretos.** En la consola de la VM genera tres valores y guárdalos en el gestor de contraseñas:
   ```bash
   for v in POSTGRES_PASSWORD APROVISIONADOR_DB_PASSWORD APROVISIONADOR_TOKEN; do echo "$v=$(openssl rand -hex 32)"; done
   ```
2. **Stack en Portainer.** Stacks → Add stack → nombre `antroforms-postgres` → Repository:
   `anthropos-group/antroforms`, rama `refs/heads/main`, compose path
   `infra/postgres/docker-compose.yml`. En *Environment variables* pega las tres variables del
   paso 1. Deploy. Deben quedar corriendo `antroforms-postgres`, `antroforms-aprovisionador` y
   `antroforms-respaldos`.
3. **Cloudflare Tunnel.** Public hostname `aprovisionador.aiagentrevenue.online` →
   service `http://antroforms-aprovisionador:8080`.
4. **Acceso de Claude.** En la sesión de Claude Code, Claude pide la credencial del host
   `aprovisionador.aiagentrevenue.online` (tipo Bearer) con un formulario seguro: ahí pegas
   `APROVISIONADOR_TOKEN`. Claude nunca ve el valor; el proxy lo agrega a cada llamada.
5. **Prueba:** `https://aprovisionador.aiagentrevenue.online/salud` → `{"ok":true,"postgres":"17…"}`.

## Respaldos fuera del servidor (recomendado)

Los respaldos quedan en el mismo servidor: si el servidor se pierde, se pierden con él.
Copia la carpeta del volumen a otro lugar (Backblaze B2, S3 o Google Drive) cada día, por
ejemplo con un flujo de n8n o `rclone` en cron. Para restaurar un cliente:
```bash
docker exec -i antroforms-postgres psql -U postgres -d af_<slug> < respaldo.sql
```

## Operación

| Necesito… | Cómo |
|---|---|
| Crear la base de un cliente | `POST /clientes {"slug":"<slug>"}` (skill `nuevo-cliente`) |
| Ver bases, tamaño y conexiones | `GET /clientes` |
| Ver migraciones y conteos de un cliente | `GET /clientes/<slug>/estado` |
| Consultar datos (solo lectura) | `POST /clientes/<slug>/consulta {"sql":"select …"}` |
| Cambiar la contraseña de un cliente | `POST /clientes/<slug>/clave` y actualizar su stack |
| Corregir o borrar datos | Una persona, desde la consola: `docker exec -it antroforms-postgres psql -U postgres -d af_<slug>` |
