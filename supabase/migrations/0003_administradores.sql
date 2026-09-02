-- 0003_administradores.sql
-- Usuarios con acceso al panel /admin (preguntas, encuestadores, reportes).
-- Separado de `encuestadores`, que es solo una lista de nombres sin login.

create table administradores (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  email text not null unique,
  password_hash text not null,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
