-- 0009_produccion.sql
-- Ajustes para salir a producción:
--  1. Idempotencia de envíos de encuesta (reintentos / doble clic no duplican).
--  2. Meta mensual por PDV configurable desde el panel (antes fija en código).
--  3. Marca de corridas de sync parciales (cortadas por max_pages) para que la
--     siguiente incremental no se salte los registros que quedaron sin revisar.
--  4. Índices para el chequeo de "cliente ya encuestado" y los reportes.

alter table encuestas add column if not exists idempotency_key text;
create unique index if not exists uq_encuestas_idempotency_key
  on encuestas (idempotency_key) where idempotency_key is not null;

create index if not exists idx_encuestas_cliente_twenty
  on encuestas (cliente_twenty_id) where completada;
create index if not exists idx_encuestas_codigo_completada
  on encuestas (codigo_cliente) where completada;

create index if not exists idx_respuestas_pregunta on respuestas (pregunta_id);

alter table cuestionarios add column if not exists meta_mensual_pdv int not null default 25;

alter table sync_runs add column if not exists parcial boolean not null default false;
create index if not exists idx_sync_runs_estado on sync_runs (estado, iniciado_en desc);
