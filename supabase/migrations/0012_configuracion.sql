-- 0012_configuracion.sql
-- Parámetros de operación editables desde el panel (clave → JSON).
-- Primer uso: 'mes_gestion', que define qué mes de gestión ven los encuestadores
-- (automático al detectar la carga de la base del mes siguiente, o manual).
create table if not exists configuracion (
  clave text primary key,
  valor jsonb not null,
  actualizado_en timestamptz not null default now()
);
