-- 0008_performance_indexes.sql
-- Índices para optimizar monitoreo, búsqueda de clientes y cola de resiliencia Twenty.

create index if not exists idx_encuestas_completada_created_at
  on encuestas (completada, created_at);

create index if not exists idx_clientes_cache_search
  on clientes_cache (codigo_cliente, telefono1, id_edimca);

create index if not exists idx_clientes_cache_pdv
  on clientes_cache (pdv);

-- Cola de reintentos para actualizaciones pendientes en Twenty CRM
create table if not exists pending_twenty_sync (
  id uuid primary key default gen_random_uuid(),
  cliente_twenty_id uuid not null,
  status_target text not null default 'EFECTIVA',
  intentos int not null default 0,
  ultimo_error text,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create index if not exists idx_pending_twenty_sync_cliente
  on pending_twenty_sync (cliente_twenty_id);
