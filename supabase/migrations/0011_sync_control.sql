-- 0011_sync_control.sql
-- Estado del refresco periódico de la copia local de clientes (clientes_cache).
-- El refresco solo lee de Twenty cada pocos minutos; aquí guarda desde cuándo
-- tiene que volver a leer y el resultado de la última pasada.
create table if not exists sync_control (
  clave text primary key,
  valor timestamptz,
  detalle text,
  actualizado_en timestamptz not null default now()
);
