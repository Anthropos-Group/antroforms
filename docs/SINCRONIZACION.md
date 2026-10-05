# Sincronización con Twenty CRM

Twenty es la fuente de verdad de los clientes. La app guarda una **copia local**
(`clientes_cache` en Supabase) y trabaja sobre ella: el buscador del encuestador,
los reportes y el monitoreo leen la copia local, y las encuestas se guardan en
Supabase.

```
                 ┌── refresco cada 10 min (solo lectura) ──┐
Twenty CRM ──────┼── búsqueda en vivo (cada búsqueda) ─────┼──► copia local ──► buscador, reportes, monitoreo
    ▲            └── limpieza nocturna 22:00 (lee y corrige)┘
    │
    └── estado EFECTIVA / NO_LLAMAR al cerrar cada encuesta (con cola de reintentos)
```

## Los cuatro mecanismos

| Mecanismo | Cuándo | Qué hace | Escribe en Twenty |
|---|---|---|---|
| **Refresco de la copia local** (`lib/refresco.js`) | Cada 10 min, y con el botón "Actualizar clientes ahora" en Admin → Historial Twenty | Lee de Twenty los clientes modificados desde la pasada anterior y los guarda ya normalizados. Una carga de miles de clientes entra en 1–2 min. También reintenta los estados de encuesta pendientes. | Solo la cola de estados |
| **Búsqueda en vivo** (`/api/clientes/search`) | En cada búsqueda del encuestador | Consulta Twenty (máx. 6 s) con lo tecleado y guarda lo encontrado antes de buscar en la copia local. Si Twenty está lento, busca solo en la copia local. | No |
| **Limpieza de datos** (`lib/sync.js`) | 22:00 hora de Ecuador, y con el botón "Ejecutar Limpieza Incremental" | Corrige en Twenty espacios, teléfonos, totales y nombres sucios: un `PATCH` por registro, unos 100 por minuto. Deja auditoría en `sync_changes`. | Sí |
| **Cierre de encuesta** (`POST /api/encuestas`) | Al enviar cada encuesta | Envía el estado `EFECTIVA` o `NO_LLAMAR`. Si Twenty falla, queda en `pending_twenty_sync` y lo reintenta el refresco. | Sí |

Antes, el refresco de la copia local iba atado a la limpieza, que es lenta. Una carga
nueva de ~1 350 clientes tardaba casi una hora en aparecer y dejaba a Twenty cargado
en horario de trabajo. Ahora la copia local se refresca por separado y la limpieza
corre de noche. La app no depende de la limpieza para ver datos limpios, porque el
refresco aplica las mismas reglas de normalización al guardar.

## ¿Por qué una copia local y no consultar Twenty directamente?

1. **Excluir a los ya encuestados.** Las encuestas viven en Supabase: Twenty no puede
   filtrar "clientes sin encuesta efectiva". Se traerían resultados de Twenty para
   descartarlos después, y la lista podría quedar vacía aunque haya más clientes.
2. **Reportes y monitoreo.** Cruzan cientos de encuestas con PDV, mes y encuestador en
   SQL. Sin copia local habría que descargar miles de registros de Twenty cada vez que
   alguien abre el panel.
3. **Disponibilidad.** Si Twenty está lento o caído, el encuestador sigue trabajando.
4. **Límites de la API de Twenty.** Cada tecla de tres encuestadores más los reportes
   serían muchas consultas por minuto.

La búsqueda en vivo complementa la copia local para cubrir los minutos entre dos
refrescos.

## Mes de gestión activo

El encuestador ve y encuesta **un solo mes de gestión a la vez**: el mes activo. Una
misma persona puede estar en la base de dos meses con códigos distintos (al 30/09, 35
clientes de octubre comparten teléfono con uno de septiembre). Si se vieran los dos
meses, se podría encuestar el registro viejo, dejar vacío el nuevo y luego duplicar
la encuesta.

Cómo se decide (`lib/gestion.js`), en **Admin → Monitoreo → Mes de gestión activo**:

| Modo | Cómo cambia de mes |
|---|---|
| **Automático** (por defecto) | El mes siguiente se activa solo en cuanto su base está cargada: cuando la copia local tiene al menos N clientes (100 por defecto) de ese mes creados en Twenty desde unos días antes del mes en curso. Como la base se sube el lunes previo, el cambio ocurre ese mismo lunes, a los ~10 minutos de subirla. |
| **Manual** | El admin elige el mes y, si quiere, la fecha y hora exactas del cambio. |

En ambos modos el día 1 de cada mes se pasa al mes nuevo aunque nadie haga nada: el
mes activo nunca es anterior al mes calendario.

- El buscador, el envío de encuestas (`MES_NO_PERMITIDO`) y el monitoreo del encuestador
  usan solo el mes activo. Los borradores de otro mes se marcan "mes cerrado". Los
  administradores no tienen el límite: el monitoreo del admin permite elegir cualquier
  mes, y Reportes y el Excel tienen todo el histórico.
- El **monitoreo cuenta cada encuesta en el mes de gestión de su cliente**, no en el mes
  de la fecha. Una encuesta a un cliente de OCTUBRE hecha el 30/09 cuenta para octubre.

## Qué mirar si "no aparece" un cliente

1. **Mes de gestión.** ¿El `MES_GESTION` del cliente en Twenty es el mes activo (Admin →
   Monitoreo)?
2. **Estado.** Los clientes en `EFECTIVA`, `NO_LLAMAR` o `YA_LE_REALIZARON_LA_ENCUESTA`, o
   con una encuesta efectiva en la app, no se muestran.
3. **Copia local.** En Admin → Historial Twenty, "Copia local de clientes" dice cuándo fue
   la última actualización. "Actualizar clientes ahora" la fuerza.
