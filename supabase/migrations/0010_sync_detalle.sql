-- 0010_sync_detalle.sql
-- Motivo de los errores de cada corrida de sincronización con Twenty.
-- Antes solo quedaba el número de errores; el detalle se perdía en los logs del contenedor.
alter table sync_runs add column if not exists detalle text;

-- Latido de la corrida: se actualiza en cada página procesada. Permite ver el
-- avance en vivo y distinguir una corrida larga (sigue avanzando) de una muerta
-- (reinicio del contenedor), que se marca fallida tras 15 min sin latido.
alter table sync_runs add column if not exists actualizado_en timestamptz;
