# Varios clientes (multi-tenant)

Antroforms atiende a varios clientes con **un solo código** y **un despliegue por
cliente**. Cada cliente tiene:

| | EDIMCA | Cooperativa 23 de Julio |
|---|---|---|
| `TENANT` | `edimca` (por defecto) | `coop23dejulio` |
| Twenty CRM | instancia de EDIMCA | `cooperativa-23-de-julio.aiagentrevenue.online` |
| Base de datos | su proyecto de Supabase | base propia (Supabase u otro Postgres) |
| Contenedor | `antroforms-web-strattos` | p. ej. `antroforms-web-23dejulio` |
| Gestión | mes de gestión + meta por PDV | levantamiento único, por oficina, con rutas A/B/C/U |

Las bases van separadas a propósito: los datos de un cliente nunca comparten
tablas con los de otro, y cada uno puede respaldarse o borrarse por su cuenta.

## Dónde vive cada cosa

- `tenants/<id>.js` — configuración del cliente: campos de Twenty que alimentan la
  copia local, datos precargados que usan las reglas (`twenty.datos`), estados que
  se escriben al cerrar una encuesta, estados excluidos del buscador, campos de la
  limpieza nocturna, etiquetas ("PDV" / "Oficina"), si hay mes de gestión y meta, y
  migraciones que no se aplican (p. ej. el cuestionario de EDIMCA).
- `tenants/<id>.cuestionario.js` — cuestionario como datos (opcional; EDIMCA lo
  tiene en la migración 0002). Se carga con `scripts/cargar-cuestionario.js`.
- `lib/tenant.js` — lee `TENANT` en cada solicitud (no al compilar): la misma
  imagen de Docker sirve a cualquier cliente.

## Motor de rutas (cuestionarios con saltos)

Cada pregunta puede tener (ver `lib/encuesta-logica.js`):

- `codigo` (CI1, A2, SM3…) y `bloque` — para referirse a ella y para reportar el
  último bloque contestado.
- `tipo`: además de los de EDIMCA, `opcion_unica`, `opcion_multiple` (con opciones
  `excluyente` como "Ninguna"), `numero`, `escala` (0–10, Likert 1–5…) e
  `informativa` (indicación que solo se lee).
- `config.especiales: ["NS", "NR"]` — "No sabe" y "Prefiere no responder" se
  guardan como `{ "especial": "NS" }`, nunca como cero.
- `mostrar_si` — regla; si no se cumple, la pregunta queda "No aplica por ruta"
  (`N/A`) y la navegación la salta.
- `termina_si` — regla; si se cumple tras responderla, la encuesta termina ahí con
  `config.resultado` (p. ej. CI1 = No → `rechazo`).
- `config.calculo` — pregunta calculada (tipo de persona confirmado, ruta A/B/C/U).
- `{{dato}}` en el texto se reemplaza por el dato precargado del socio (A1).

Reglas: `{ "pregunta": "RUTA", "op": "en", "valor": ["A","C"] }`,
`{ "cliente": "edad", "op": "vacio" }`, combinadas con `todas` / `alguna` / `no`.

El encuestador además puede **cerrar la llamada sin terminar** (parcial, cita, no
contacto, número incorrecto, informante no autorizado, fuera del universo) si el
cliente lo tiene configurado (`twenty.estadosCierre`). Se guarda lo respondido,
`encuestas.resultado` y `encuestas.ultimo_bloque`, y el estado va a Twenty.

## Levantar un cliente nuevo (ej. Cooperativa 23 de Julio)

1. **Base de datos**: crear la base y correr las migraciones con su `TENANT`:

   ```bash
   TENANT=coop23dejulio SUPABASE_DB_URL=... npm run db:migrate
   ```

2. **Cuestionario**:

   ```bash
   TENANT=coop23dejulio SUPABASE_DB_URL=... node scripts/cargar-cuestionario.js
   ```

   Con `--dry-run` solo valida. Si el cuestionario ya tiene encuestas, crea una
   versión nueva en lugar de pisarlo.

3. **Administrador**: `node scripts/create-admin.js ...` (igual que EDIMCA).

4. **Twenty**: crear en `person` los campos personalizados de `tenants/coop23dejulio.js`
   (`codigoCliente`, `nombreOficina`, `ciudadOficina`, `codigoMuestra`, `celular`,
   `estadoGestion`, `tipoPersona`, `actividadEconomica`, `profesion`, `edad`, `sexo`,
   `cantonDomicilio`, `cantonActividad`, `antiguedadActividad`, `tieneRuc`) y cargar
   los socios. `tipoPersona` va normalizado a `NATURAL` / `JURIDICA`.

5. **Stack en Portainer**: el mismo repositorio con estas variables propias:

   ```
   TENANT=coop23dejulio
   CONTAINER_NAME=antroforms-web-23dejulio
   SUPABASE_DB_URL=<base de 23 de Julio>
   TWENTY_API_URL=https://cooperativa-23-de-julio.aiagentrevenue.online/rest
   TWENTY_API_KEY=<clave de ese Twenty>
   ENCUESTADOR_ACCESS_PASSWORD=<propia>
   ADMIN_SESSION_SECRET=<propio>
   CRON_SECRET=<propio>
   ```

   Y en Cloudflare Tunnel, un subdominio propio que apunte a
   `http://antroforms-web-23dejulio:3000`.

## Pendiente para 23 de Julio

- Datos que el instrumento deja en blanco: teléfono de verificación y correo del
  responsable (guion de apertura), lista de cooperativas de SM0 por ciudad y
  catálogo de productos de SM5.
- Cuotas por oficina/ciudad (`metaPorGrupo`), cuando llegue el diseño muestral.
- L8 / L4: hoy el cantón se anota como texto; falta un selector con el catálogo DPA.
- Monitoreo y reportes siguen pensados para el mes de gestión de EDIMCA; para 23 de
  Julio hace falta una vista de avance por oficina y por resultado de contacto.
