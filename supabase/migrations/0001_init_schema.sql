-- 0001_init_schema.sql
-- Esquema inicial: ver docs/DATABASE.md para el diseño completo.

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

-- Encuestadores -------------------------------------------------------------

create table encuestadores (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Cuestionarios / preguntas ---------------------------------------------------

create table cuestionarios (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  version int not null default 1,
  activo boolean not null default true,
  objeto_twenty text not null default 'people',
  created_at timestamptz not null default now()
);

create type tipo_pregunta as enum (
  'aceptacion_si_no',
  'escala_1_10',
  'texto_abierto',
  'opcion_multiple'
);

create table preguntas (
  id uuid primary key default gen_random_uuid(),
  cuestionario_id uuid not null references cuestionarios(id) on delete cascade,
  orden int not null,
  texto text not null,
  tipo tipo_pregunta not null,
  requiere_justificacion boolean not null default false,
  condicion jsonb,
  activa boolean not null default true
);

create index idx_preguntas_cuestionario on preguntas (cuestionario_id, orden);

-- Caché de clientes (espejo normalizado de Twenty `people`) -----------------

create table clientes_cache (
  id_twenty uuid primary key,
  codigo_cliente text,
  nombre text,
  pdv text,
  mes_gestion text,
  id_edimca text,
  status text,
  telefono1 text,
  synced_at timestamptz not null default now(),
  raw jsonb
);

create index idx_clientes_cache_codigo on clientes_cache (codigo_cliente);
create index idx_clientes_cache_nombre_trgm on clientes_cache using gin (nombre gin_trgm_ops);

-- Encuestas / respuestas ------------------------------------------------------

create table encuestas (
  id uuid primary key default gen_random_uuid(),
  cuestionario_id uuid not null references cuestionarios(id),
  cliente_twenty_id uuid references clientes_cache(id_twenty),
  codigo_cliente text,
  encuestador_id uuid not null references encuestadores(id),
  completada boolean not null default false,
  created_at timestamptz not null default now()
);

create index idx_encuestas_encuestador on encuestas (encuestador_id);
create index idx_encuestas_created_at on encuestas (created_at);
create index idx_encuestas_mes_gestion on encuestas (codigo_cliente);

create table respuestas (
  id uuid primary key default gen_random_uuid(),
  encuesta_id uuid not null references encuestas(id) on delete cascade,
  pregunta_id uuid not null references preguntas(id),
  valor jsonb
);

create index idx_respuestas_encuesta on respuestas (encuesta_id);

-- Auditoría del cron de limpieza de Twenty -----------------------------------

create type sync_tipo as enum ('dry_run', 'incremental', 'backfill_completo');
create type sync_estado as enum ('en_progreso', 'completado', 'fallido');

create table sync_runs (
  id uuid primary key default gen_random_uuid(),
  iniciado_en timestamptz not null default now(),
  finalizado_en timestamptz,
  tipo sync_tipo not null,
  registros_escaneados int not null default 0,
  registros_modificados int not null default 0,
  errores int not null default 0,
  estado sync_estado not null default 'en_progreso'
);

create table sync_changes (
  id uuid primary key default gen_random_uuid(),
  sync_run_id uuid not null references sync_runs(id) on delete cascade,
  id_twenty uuid not null,
  campo text not null,
  valor_antes text,
  valor_despues text,
  created_at timestamptz not null default now()
);

create index idx_sync_changes_run on sync_changes (sync_run_id);
