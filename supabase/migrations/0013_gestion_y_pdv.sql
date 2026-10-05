-- 0013_gestion_y_pdv.sql
-- 1. Bloqueo de clientes "en gestión": cuando un encuestador abre la encuesta de
--    un cliente, queda reservado para él (y en Twenty pasa a EN_GESTION) hasta que
--    la termina, registra el resultado de la llamada o el bloqueo vence.
create table if not exists clientes_bloqueo (
  cliente_twenty_id uuid primary key,
  encuestador_id uuid not null references encuestadores(id) on delete cascade,
  status_previo text,
  tomado_en timestamptz not null default now(),
  expira_en timestamptz not null
);
create index if not exists idx_clientes_bloqueo_expira on clientes_bloqueo (expira_en);

-- 2. Resultado de cada llamada registrado desde la app (no contesta, volver a
--    llamar…): auditoría de lo que se cambió en Twenty y quién lo hizo.
create table if not exists gestiones (
  id uuid primary key default gen_random_uuid(),
  cliente_twenty_id uuid not null,
  encuestador_id uuid references encuestadores(id) on delete set null,
  resultado text not null,
  proxima_llamada timestamptz,
  observacion text,
  creado_en timestamptz not null default now()
);
create index if not exists idx_gestiones_cliente on gestiones (cliente_twenty_id, creado_en desc);

-- 3. Configuración por punto de venta: PDVs donde probablemente no se llegue a la
--    meta mensual (se marcan en naranja en el monitoreo). Editable desde el panel.
create table if not exists pdv_config (
  pdv text primary key,
  meta_improbable boolean not null default false,
  actualizado_en timestamptz not null default now()
);

insert into pdv_config (pdv, meta_improbable) values
  ('SHOWROOM CIUDAD CELESTE', true),
  ('SHOWROOM BLUE COAST', true),
  ('SHOWROOM CARAPUNGO', true),
  ('SHOWROOM AVALON PLAZA', true),
  ('SHOWROOM GONZALEZ SUAREZ', true),
  ('SHOWROOM GRANADOS', true),
  ('SHOWROOM PROMART GYE NORTE', true)
on conflict (pdv) do nothing;
