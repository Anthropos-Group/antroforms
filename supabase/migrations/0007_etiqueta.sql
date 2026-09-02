-- 0007_etiqueta.sql
-- El encuestador necesita copiar la ETIQUETA (PDV-código-nombre) de Twenty al
-- terminar la llamada para pegarla en otro sistema. Antes tenía que copiarla
-- a mano desde Twenty y se cortaba. La cacheamos para mostrarla con un botón
-- de copiar al final de la encuesta.

alter table clientes_cache add column if not exists etiqueta text;
