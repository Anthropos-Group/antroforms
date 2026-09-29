# Arranque de la gestión de octubre 2026

Checklist para dejar el sistema listo antes del 1 de octubre. Los pasos 1 y 2 van
en ese orden; el resto se puede hacer en cualquier momento.

## 1. Aplicar la migración 0010

Agrega dos columnas a `sync_runs` (`detalle` y `actualizado_en`). Solo agrega
columnas y no toca datos. El código nuevo también funciona si todavía no se
aplicó, pero sin el motivo de los errores ni el avance en vivo.

Desde cualquier máquina con el repo y el token de Supabase:

```bash
npm run db:migrate:api -- --dry-run   # debe listar solo 0010_sync_detalle.sql como pendiente
npm run db:migrate:api
```

O desde la consola del contenedor en Portainer: `node scripts/migrate.js`.

## 2. Desplegar

Fusionar el PR a `main` y en Portainer: **Stacks → antroforms → Pull and redeploy**.

Verificar:

- El contenedor queda **healthy** y `https://<dominio>/api/health` responde `{"ok":true,...}`.
- En los logs del contenedor aparece:
  `[programador] Keep-alive cada 60 min; sincronización con Twenty a las 7:00 y 13:00 (Ecuador).`
- En **Admin → Historial Twenty**, presionar **Ejecutar Limpieza Incremental**. La primera
  corrida trae todo lo modificado en Twenty desde el 14/09 (la última sincronización que
  corrió), así que puede tardar varios minutos. El botón muestra el avance y ya no se corta.

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

- con la sincronización automática de las 07:00 y 13:00, o con el botón manual del panel;
- y además en vivo: cada búsqueda del encuestador consulta Twenty antes de buscar en la caché.

## 5. Qué cambia el 1 de octubre (automático)

- El encuestador ve y puede registrar clientes de **OCTUBRE y SEPTIEMBRE**. Agosto
  deja de aparecer, y si alguien intenta enviar una encuesta de agosto el servidor la
  rechaza con un mensaje claro. Los borradores de meses cerrados se marcan
  "mes cerrado" en la lista de borradores.
- El monitoreo del encuestador y del admin pasa a contar octubre (mes calendario en
  hora de Ecuador). Septiembre sigue disponible en Reportes y en el Excel.
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
