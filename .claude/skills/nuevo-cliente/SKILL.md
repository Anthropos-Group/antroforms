---
name: nuevo-cliente
description: Integra un cliente nuevo a Antroforms (encuestas CATI + Twenty) de punta a punta — documentos de negocio, configuración, cuestionario, base de datos en el Postgres propio, Twenty, despliegue en Portainer, pruebas y resumen final. Úsala cuando el usuario diga "nuevo cliente", "integrar a <cliente>", "dar de alta un cliente", suba documentos de un cliente nuevo o pida crear su base o su stack.
---

# Alta de un cliente nuevo en Antroforms

El objetivo es que el usuario solo entregue documentos y tome decisiones de negocio;
todo lo técnico lo haces tú y al final entregas **un solo resumen**. Responde en español.

## Reglas que no se rompen

1. **Nunca toques a otro cliente.** Ni su base, ni su Twenty, ni su stack. EDIMCA y
   Cooperativa 23 de Julio siguen en Supabase: esta skill no los modifica.
2. **Bases de datos solo a través del aprovisionador** (`https://aprovisionador.aiagentrevenue.online`,
   credencial inyectada por el proxy; nunca pidas ni muestres el token). Puede crear la base de un
   cliente, cambiar su contraseña, ver su estado y hacer consultas de **solo lectura**. No borra
   nada: si algo debe borrarse o corregirse con escritura, se lo pides al usuario con el SQL exacto.
3. **Twenty real del cliente:** primero en modo prueba (`--dry-run` / sin `--aplicar`); cargar o
   cambiar registros reales solo con el OK explícito del usuario en ese momento.
4. **Datos personales** (bases de socios/clientes, cédulas, teléfonos) **nunca** se suben al
   repositorio. Viven en el scratchpad y van directo a Twenty. En el repo solo van reglas de
   negocio, cuestionarios y configuración.
5. **Secretos:** la URL de la base (con contraseña), la contraseña inicial del admin y los
   secretos de sesión se muestran **una sola vez**, en el bloque de variables para Portainer.
   Nunca en commits, PRs, FICHA.md ni registros.
6. PRs: no abrir ni fusionar sin el OK del usuario (puede darlo una vez para toda el alta).

## Convenciones de nombres

| Cosa | Formato | Ejemplo |
|---|---|---|
| slug (TENANT) | minúsculas y números, 3–30, empieza con letra | `coop23dejulio` |
| Base y usuario Postgres | `af_<slug>` | `af_coop23dejulio` |
| Stack de Portainer | `antroforms-<slug>` | `antroforms-coop23dejulio` |
| Contenedor (CONTAINER_NAME) | `antroforms-web-<slug>` | `antroforms-web-coop23dejulio` |
| URL de encuestas | `encuestas-<slug>.aiagentrevenue.online` | |
| Configuración | `tenants/<slug>.js` | |
| Cuestionario | `tenants/<slug>.cuestionario.js` | |
| Ficha del cliente | `clientes/<slug>/FICHA.md` | |
| Documentos de negocio | `clientes/<slug>/documentos/` | cuestionario.pdf, reglas.docx |

Pregunta al usuario el nombre comercial y propón el slug; confírmalo antes de crear nada
(el slug no se cambia después: es el nombre de la base y del stack).

## Flujo

Lleva una lista de tareas (TaskCreate) con estas fases y avísale al usuario en una línea
cuando pases de una a otra.

### 1. Recopilar (una sola ronda de preguntas)
Pide en un solo mensaje lo que falte:
- Nombre comercial, slug propuesto, correo del administrador.
- URL de su Twenty. Para operar ese Twenty, pide la credencial con `request_credential`
  (host del Twenty, Bearer); no pidas la API key por chat.
- Documentos: cuestionario, reglas de negocio (rutas, cuotas, reemplazos, quién no se
  encuesta), base de la muestra, asignación de ciudades/oficinas a encuestadores.
- Fechas: inicio de campo y si hay reporte diario (a quién, a qué hora).

Guarda los documentos de negocio en `clientes/<slug>/documentos/` (no las bases de datos personales).

### 2. Analizar y fichar
Lee todos los documentos y escribe `clientes/<slug>/FICHA.md` con: datos del cliente,
campos que vienen en la base y a qué campo de Twenty van, estados de gestión, reglas
(rutas, saltos, preguntas solo-si-falta, reemplazos, exclusiones como menores de edad),
cuotas, encuestadores y zonas, reporte, **decisiones tomadas** y **preguntas abiertas**.
Si hay preguntas abiertas que bloquean, hazlas todas juntas y espera.

### 3. Configuración y cuestionario
- Parte del cliente existente más parecido: `tenants/coop23dejulio.js` (muestra por sorteo,
  reemplazos, rutas, sin mes de gestión) o `tenants/edimca.js` (gestión mensual, metas por PDV).
- Crea `tenants/<slug>.js` y `tenants/<slug>.cuestionario.js`; regístralo en `TENANTS` de `lib/tenant.js`.
- `migracionesOmitidas: ["0002_seed_cuestionario_edimca.sql"]` (esa migración es de EDIMCA).
- Si la base del cliente trae columnas nuevas, agrega su transformación (como
  `socioDesdeSorteo` en `lib/socios.js`) con pruebas en `tests/`.
- Agrega pruebas de las rutas del cuestionario que dicten los documentos (ver `tests/rutas.test.js`, `tests/variantes.test.js`).
- `npm test` (incluye `tests/tenants.test.js`, que valida la configuración y el cuestionario de
  **todos** los clientes) y `npx next build`. Todo debe pasar.
- Commit en la rama de trabajo, PR y merge (con el OK del usuario).

### 4. Base de datos (aprovisionador)
```bash
A=https://aprovisionador.aiagentrevenue.online
curl -s $A/salud
curl -s -X POST $A/clientes -H 'content-type: application/json' -d '{"slug":"<slug>"}'   # crea af_<slug>
```
La respuesta trae `url` (con contraseña): guárdala solo en una variable de shell / archivo
del scratchpad para el bloque de Portainer; no la imprimas en otros mensajes.
Si la base ya existía (409), no se tocó: usa `POST /clientes/<slug>/clave` solo si el usuario
perdió la URL (cambia la contraseña; el stack debe actualizarse).
Si el `curl` falla por red o 401/403, lee `docs/POSTGRES.md` (configuración única) y dile al usuario qué falta.

### 5. Twenty
- `TENANT=<slug> TWENTY_API_URL=... TWENTY_API_KEY=proxy-injected node scripts/twenty-esquema.js`
  (con `NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt`): crea los campos que falten.
- Carga de la muestra: primero sin `--aplicar` (muestra el resumen), luego con el OK del usuario.
- Vista de gestión (kanban por estado) y menú como en 23 de Julio si el usuario lo quiere.

### 6. Despliegue (lo hace el usuario en Portainer)
Entrega un bloque listo para copiar:
- Stack `antroforms-<slug>` → Repository `anthropos-group/antroforms`, rama `main`,
  compose `docker-compose.yml`.
- Variables: `TENANT`, `CONTAINER_NAME`, `SUPABASE_DB_URL` (la URL del aprovisionador),
  `TWENTY_API_URL`, `TWENTY_API_KEY` (el usuario la pega; tú no la ves), `CRON_SECRET`,
  `ADMIN_SESSION_SECRET`, `ENCUESTADOR_ACCESS_PASSWORD` (genera los secretos con
  `openssl rand -hex 32`), `ADMIN_EMAIL`, `ADMIN_PASSWORD` (temporal, fuerte), `AUTO_SETUP=on`.
  `NEXT_PUBLIC_SUPABASE_*` y `SUPABASE_SERVICE_ROLE_KEY` quedan vacías.
- Cloudflare Tunnel: hostname `encuestas-<slug>.aiagentrevenue.online` → `http://antroforms-web-<slug>:3000`.

### 7. Verificar
- `GET $A/clientes/<slug>/estado`: todas las migraciones, cuestionario activo, administrador creado.
- `https://encuestas-<slug>.aiagentrevenue.online/api/health` → 200 con `db: ok`.
- Login del admin, lista de encuestadores, `/api/reportes/gestion?formato=json`.
- Consultas de revisión con `POST $A/clientes/<slug>/consulta {"sql": "..."}` (solo lectura).
- Si pidió reporte diario: clonar en n8n Strattos el flujo «Antroforms · Reporte diario 23 de Julio»
  cambiando URL, CRON_SECRET (credencial nueva) y destinatarios; probar el envío al usuario antes
  que al cliente; publicar.

### 8. Resumen final (único mensaje largo)
- Qué quedó funcionando (URLs, base, Twenty, reporte) y cómo se verificó.
- Decisiones tomadas a partir de los documentos.
- Lo que hizo falta del usuario y lo que sigue pendiente (preguntas abiertas, carga de
  encuestadores, revisión del cuestionario por el cliente).
- Credenciales de un solo uso (contraseña temporal del admin), si no se entregaron ya.
