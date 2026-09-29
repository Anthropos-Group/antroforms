# Salida a producción — Auditoría, correcciones y checklist

Auditoría completa del sistema de encuestas (septiembre 2026) previa a producción.
Cada hallazgo se corrigió en código y se verificó contra un Postgres real
(escenarios de envío, concurrencia, caída de Twenty, permisos) y en navegador.

## 1. Hallazgos críticos (pérdida o corrupción de datos)

| # | Hallazgo | Impacto | Corrección |
|---|---|---|---|
| C1 | Al enviar la encuesta, la UI no revisaba `res.ok`: ante cualquier error del servidor (500, sesión expirada, BD caída) mostraba "Encuesta completada" **y borraba el borrador local**. | Encuestas perdidas sin que el encuestador lo note. | El borrador solo se borra con confirmación del servidor. Errores muestran el motivo y un botón "Reintentar envío" / "Iniciar sesión" / "Recargar". |
| C2 | El servidor confiaba en el navegador: `completada`, valores de respuesta y la pregunta que dispara `NO_LLAMAR` venían del cliente sin validar. | Encuestas "efectivas" incompletas, calificaciones fuera de 1-10, estados erróneos en Twenty. | Reglas del cuestionario en un módulo compartido (`lib/encuesta-logica.js`) que usan la UI **y** `POST /api/encuestas`. El servidor recalcula el estado, valida tipos/rangos/justificaciones y responde 422 con el detalle. |
| C3 | Dos encuestadores (o dos pestañas) podían registrar una encuesta efectiva para el mismo cliente; la deduplicación solo cubría "mismo encuestador en 5 minutos". | Clientes encuestados dos veces, metas por PDV infladas. | Candado transaccional por cliente (`pg_advisory_xact_lock`) + verificación de encuesta efectiva previa → 409 con quién y cuándo. Probado con 6 envíos simultáneos: se guarda exactamente 1. |
| C4 | Sin idempotencia: un doble clic o un reintento tras corte de red duplicaba la encuesta. | Duplicados. | `idempotency_key` (id del borrador) con índice único; el reintento devuelve la misma encuesta. |
| C5 | El pool de Postgres no tenía handler de `error`: un corte de una conexión inactiva (reinicio del pooler de Supabase) **tumbaba el proceso de Node**. | Caída total de la app. | `pool.on("error")`, límites de conexiones y timeouts. |
| C6 | El `PATCH` a Twenty al cerrar la encuesta no tenía timeout: si Twenty se colgaba, el encuestador quedaba esperando indefinidamente. | Encuestador bloqueado. | Timeout de 8 s; si falla, se encola en `pending_twenty_sync` (la encuesta ya está guardada). Probado con Twenty inaccesible: respuesta inmediata. |

## 2. Seguridad

| # | Hallazgo | Corrección |
|---|---|---|
| S1 | Logins sin límite de intentos (fuerza bruta). | Rate limit en memoria: 10 fallos / 15 min por IP+email (admin) y 30 por IP (equipo encuestador, que suele compartir IP). Responde 429. |
| S2 | Un administrador desactivado seguía entrando hasta 12 h (token sin estado). | El proxy verifica que el admin siga activo (caché de 60 s). |
| S3 | Rotar `ENCUESTADOR_ACCESS_PASSWORD` no cerraba las sesiones abiertas. | El token incluye una huella de la contraseña vigente. |
| S4 | Comparación de contraseña compartida y `CRON_SECRET` con `===` (timing). | Comparación en tiempo constante. |
| S5 | Se podía desactivar al último admin o a uno mismo (bloqueo total del panel). | Bloqueado con 409. |
| S6 | El término de búsqueda se insertaba crudo en el filtro de Twenty (`or(...)`); comas/paréntesis alteraban la expresión. `%`/`_` actuaban como comodines en SQL. | Saneado para Twenty y escape de comodines `LIKE`. |
| S7 | Sin cabeceras de seguridad; `X-Powered-By` expuesto; respuestas de API cacheables por Cloudflare. | `X-Frame-Options`, CSP `frame-ancestors`, `nosniff`, HSTS, `Referrer-Policy`, `Cache-Control: no-store` en `/api`. |
| S8 | Contenedor corriendo como root. | Usuario `nextjs` sin privilegios + `HEALTHCHECK`. |
| S9 | Validación débil en endpoints admin (ids no-UUID o tipos inválidos → 500 sin cuerpo). | Validación de entrada y errores JSON uniformes (`lib/http.js`). |

## 3. Exactitud de datos y reportes

| # | Hallazgo | Corrección |
|---|---|---|
| D1 | Monitoreo cortaba el mes a medianoche **UTC**: encuestas hechas después de las 19:00 del último día caían en el mes siguiente. El Excel mostraba horas 5 h adelantadas (contenedor en UTC). | Todo en hora de Ecuador (`America/Guayaquil`). |
| D2 | KPIs de reportes calculados sobre un listado truncado a 1000 filas sin aviso. | KPIs en SQL sobre todo el universo filtrado + aviso cuando la tabla está truncada. |
| D3 | Un `N/A` en una pregunta Sí/No se reportaba como "No". | Corregido en `valorLegible`. |
| D4 | Filtro por mes de gestión exacto (`= 'SEPTIEMBRE'`) fallaba con datos con espacios o minúsculas. | Comparación normalizada. |
| D5 | La búsqueda en vivo sobrescribía el estado local con el de Twenty: un cliente que pidió `NO_LLAMAR` reaparecía mientras su actualización seguía en cola. | El upsert conserva el estado local si hay un cambio pendiente hacia Twenty. |
| D6 | La búsqueda en vivo guardaba datos sin normalizar (espacios, teléfonos) en la caché. | Mismas reglas de limpieza que el cron (`lib/clientes.js`). |
| D7 | Importador: inventaba el PDV "MATRIZ" y el mes en minúsculas; marcaba EFECTIVA incluso encuestas cortadas; asignaba en silencio un encuestador arbitrario cuando no reconocía el nombre; numeraba mal las filas con error. | PDV vacío si no viene, mes en mayúsculas, estado solo si es efectiva, advertencias por encuestador no reconocido, filas reales, calificaciones validadas 1-10. |
| D8 | Sync incremental cortado por `max_pages` se usaba como punto de partida de la siguiente corrida → registros saltados para siempre. | Corridas marcadas `parcial` y excluidas como ancla. |
| D9 | Cron y botón manual podían correr a la vez; corridas muertas quedaban "en_progreso" para siempre. | Una sola corrida a la vez (409) y limpieza de corridas huérfanas (>15 min). |
| D10 | La barra de progreso nunca llegaba a 100 % si el cliente no tenía servicio de corte (P7 N/A). | Solo cuenta preguntas aplicables. |

## 4. Nuevas funcionalidades

- **Satisfacción por pregunta** en Reportes: promedio 1-10 e índice neto (NPS: % 9-10 − % 1-6) por pregunta; también en una hoja "Resumen" del Excel.
- **Detalle de encuesta**: clic en una fila de Reportes muestra todas las respuestas con justificaciones.
- **Filtro por estado** (efectivas / cortadas) en Reportes y Excel; Excel con teléfono y etiqueta.
- **Configuración del cuestionario** desde el panel: nombre, guiones de apertura/cierre y **meta mensual por PDV** (antes fija en 25 en código).
- **Reordenar preguntas** (▲/▼) con validación de dependencias.
- **Cola de estados pendientes en Twenty** visible en Historial Twenty, con "Reintentar ahora".
- **Cambio de contraseña** de administradores desde el panel.
- **Encuestador recordado** en el dispositivo, borradores con caducidad (14 días) y confirmación al descartar.
- Monitoreo con **auto-refresco** cada minuto.
- **`GET /api/health`** para Docker/Portainer/monitoreo externo.
- **Pruebas automatizadas** (`npm test`, 24 casos) de reglas del cuestionario, normalización, fechas, reportes y autenticación.

## 5. Checklist de salida a producción

1. **Respaldar la BD** en Supabase (Database → Backups) antes de migrar.
2. **Aplicar migraciones** — la `0009_produccion.sql` es obligatoria antes de desplegar el nuevo código:
   `npm run db:migrate` (o dentro del contenedor: `node scripts/migrate.js`).
3. Verificar variables: `ADMIN_SESSION_SECRET` y `CRON_SECRET` largos y distintos (`openssl rand -hex 32`), `ENCUESTADOR_ACCESS_PASSWORD` robusta, `TWENTY_API_URL` / `TWENTY_API_KEY`.
4. **Pull and redeploy** del stack en Portainer. Confirmar que el contenedor queda `healthy` y que `https://<dominio>/api/health` responde `{"ok":true}`.
5. Avisar al equipo: **los encuestadores deben volver a iniciar sesión una vez** (cambió el formato del token). Los borradores en el navegador se conservan.
6. Programar el cron diario con el header `Authorization: Bearer` (preferible al `?secret=` en la URL, que puede quedar en logs).
7. Revisar en el panel: meta mensual por PDV, guiones, y que "Cola de estados pendientes" esté vacía tras el primer día.
8. Configurar un monitor externo (UptimeRobot, Better Stack, etc.) contra `/api/health`.

## 6. Recomendaciones pendientes (fuera de este alcance)

- **Login individual por encuestador**: hoy la identidad del encuestador es auto-declarada (lista de nombres) con una contraseña compartida. Para auditoría fuerte conviene usuarios individuales.
- **Rate limit distribuido**: el límite de intentos es en memoria (válido para un solo contenedor). Si se escala a varias réplicas, moverlo a la BD o a Cloudflare (reglas WAF).
- **Anulación de encuestas** desde el panel (hoy no se editan ni borran encuestas enviadas, según el PRD).
- **Rotación del respaldo**: exportar periódicamente el Excel completo o habilitar PITR en Supabase.
