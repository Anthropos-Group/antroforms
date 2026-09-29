# Arranque de la gestión de octubre 2026

Checklist de arranque de la gestión de octubre. Los pasos 1 y 2 van en ese orden;
el resto se puede hacer en cualquier momento.

## 1. Aplicar las migraciones

- **0010** (aplicada el 29/09): columnas `detalle` y `actualizado_en` en `sync_runs`.
- **0011**: tabla `sync_control` para el refresco de la copia local de clientes.

Las dos solo agregan estructura y no tocan datos. El código funciona aunque todavía
no estén aplicadas, pero con menos información en el panel. Desde cualquier máquina
con el repo y el token de Supabase:

```bash
npm run db:migrate:api -- --dry-run   # lista las pendientes
npm run db:migrate:api
```

O desde la consola del contenedor en Portainer: `node scripts/migrate.js`.

## 2. Desplegar

Fusionar el PR a `main` y en Portainer: **Stacks → antroforms → Pull and redeploy**.

Verificar:

- El contenedor queda **healthy** y `https://<dominio>/api/health` responde `{"ok":true,...}`.
- En los logs del contenedor aparece:
  `[programador] Keep-alive cada 60 min; refresco de clientes cada 10 min; limpieza en Twenty a las 22:00 (Ecuador).`
- En **Admin → Historial Twenty**, "Copia local de clientes" muestra la última
  actualización (la primera corre a los pocos segundos de arrancar). Con **Actualizar
  clientes ahora** se fuerza una pasada.

## 3. Limpiar la base (solo gestión de septiembre en adelante)

Todas las encuestas registradas son de septiembre y se conservan. La limpieza quita:

- **Clientes en caché de junio, julio y agosto** que no tienen encuesta. La caché se
  vuelve a llenar sola desde Twenty, y los clientes con encuesta se conservan para que
  los reportes sigan mostrando su nombre y PDV.
- **Corridas de prueba de la sincronización** (`dry_run` y la fallida del 08/09) con sus
  cambios registrados. Se conservan las corridas incrementales, que registran lo que el
  sistema cambió realmente en Twenty y marcan el punto de partida de la próxima corrida.

Hacer un respaldo antes. Luego, en **Supabase → SQL Editor**, primero la vista previa:

```sql
select 'clientes_cache' as tabla, upper(trim(mes_gestion)) as detalle, count(*)
from clientes_cache c
where coalesce(upper(trim(c.mes_gestion)), '') not in ('SEPTIEMBRE', 'OCTUBRE')
  and not exists (select 1 from encuestas e
                  where e.cliente_twenty_id = c.id_twenty
                     or (c.codigo_cliente is not null and e.codigo_cliente = c.codigo_cliente))
  and not exists (select 1 from pending_twenty_sync p where p.cliente_twenty_id = c.id_twenty)
group by 2
union all
select 'sync_runs', tipo || '/' || estado, count(*)
from sync_runs where tipo = 'dry_run' or estado = 'fallido' group by 2
union all
select 'sync_changes', null, count(*)
from sync_changes
where sync_run_id in (select id from sync_runs where tipo = 'dry_run' or estado = 'fallido');
```

Al 29/09 daba: 948 clientes en caché (297 de agosto, 356 de julio, 295 de junio),
8 corridas de prueba y 20 080 cambios de esas corridas. Si coincide, ejecutar:

```sql
begin;

delete from clientes_cache c
where coalesce(upper(trim(c.mes_gestion)), '') not in ('SEPTIEMBRE', 'OCTUBRE')
  and not exists (select 1 from encuestas e
                  where e.cliente_twenty_id = c.id_twenty
                     or (c.codigo_cliente is not null and e.codigo_cliente = c.codigo_cliente))
  and not exists (select 1 from pending_twenty_sync p where p.cliente_twenty_id = c.id_twenty);

delete from sync_changes
where sync_run_id in (select id from sync_runs where tipo = 'dry_run' or estado = 'fallido');

delete from sync_runs where tipo = 'dry_run' or estado = 'fallido';

commit;
```

> Hasta el 30/09 el encuestador todavía puede registrar clientes de agosto (mes anterior).
> Si busca uno que se borró de la caché, la búsqueda en vivo lo vuelve a traer de Twenty.

## 4. Cargar los clientes de octubre en Twenty

Los clientes de la gestión de octubre deben tener `mesGestion` = `OCTUBRE` en Twenty
(no importan mayúsculas ni espacios). Entran a la app:

- con el refresco automático de la copia local, cada 10 minutos, o con **Actualizar
  clientes ahora** justo después de subirlos;
- y además en vivo: cada búsqueda del encuestador consulta Twenty antes de buscar en la caché.

## 5. Mes de gestión con una semana de anticipación (automático)

Desde el **24/09** la gestión en curso es **octubre** (ver [SINCRONIZACION.md](./SINCRONIZACION.md#mes-de-gestión)):

- El encuestador ve y puede registrar clientes de **OCTUBRE y SEPTIEMBRE**. Agosto deja
  de aparecer. Si alguien intenta enviar una encuesta de agosto, el servidor la rechaza
  con un mensaje claro, y los borradores de meses cerrados se marcan "mes cerrado".
- El monitoreo cuenta cada encuesta en el **mes de gestión de su cliente**: las de octubre
  hechas desde el 24/09 suman a octubre, y las de septiembre hechas en octubre suman a
  septiembre. Septiembre sigue disponible en el monitoreo (selector de mes), en Reportes y
  en el Excel.
- El 25/10 pasa sola a NOVIEMBRE + OCTUBRE, y así cada mes.
- Revisar en **Admin → Preguntas** la **meta mensual por PDV** (hoy 25).

## Diagnóstico al 29/09 (para referencia)

- **Crons:** la última sincronización corrió el 14/09. Desde entonces nada la disparó:
  el cron externo de `DEPLOY.md` nunca se programó en el servidor. Tampoco había nada
  que mantuviera activa la base, por eso Supabase pausó el proyecto. Las dos tareas
  ahora corren dentro del contenedor (`DEPLOY.md` §6).
- **Error de sincronización:** una corrida incremental con cientos de registros tarda
  5-7 minutos (un `PATCH` a Twenty por registro), pero el botón manual esperaba la
  respuesta y Cloudflare corta cualquier request a los 100 s, así que el panel mostraba
  "Falló la sincronización" aunque la corrida siguiera en el servidor. Ahora la corrida
  sigue en segundo plano y el botón muestra el avance. Además se guarda el motivo de
  cada error en el detalle de la corrida (antes solo quedaba el número).
- **Twenty vs. app:** según la caché (el reflejo de Twenty en la app), 852 clientes de
  septiembre están en estado `EFECTIVA`, y en la app hay 644 encuestas efectivas de clientes
  de septiembre. La diferencia son clientes marcados
  `EFECTIVA` directamente en Twenty, o encuestas hechas fuera de la app y todavía no
  importadas. No es un fallo de la sincronización: las 650 encuestas de la app
  están en `EFECTIVA` en Twenty.
