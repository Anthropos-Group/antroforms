-- 0016_multitenant.sql
-- Antroforms atiende a varios clientes (EDIMCA, Cooperativa 23 de Julio…), cada uno
-- con su propia base. Esta migración generaliza el esquema para todos:
--
-- 1. clientes_cache.datos: datos precargados del cliente que decide cada
--    configuración (tenants/*.js → twenty.datos), p. ej. tipo de persona o
--    actividad económica, que activan o saltan preguntas.
alter table clientes_cache add column if not exists datos jsonb not null default '{}'::jsonb;

-- 2. Preguntas más ricas: código estable (CI1, A2, SM3…) para referirse a ellas
--    en las reglas, configuración por tipo (opciones, rangos, "No sabe") y reglas
--    de ruta: `mostrar_si` (si no se cumple, la pregunta "No aplica por ruta") y
--    `termina_si` (si se cumple tras responderla, la encuesta termina ahí).
alter type tipo_pregunta add value if not exists 'opcion_unica';
alter type tipo_pregunta add value if not exists 'numero';
alter type tipo_pregunta add value if not exists 'escala';
alter type tipo_pregunta add value if not exists 'informativa';

alter table preguntas add column if not exists codigo text;
alter table preguntas add column if not exists bloque text;
alter table preguntas add column if not exists ayuda text;
alter table preguntas add column if not exists config jsonb not null default '{}'::jsonb;
alter table preguntas add column if not exists mostrar_si jsonb;
alter table preguntas add column if not exists termina_si jsonb;
create unique index if not exists idx_preguntas_codigo
  on preguntas (cuestionario_id, codigo) where codigo is not null;

-- 3. Resultado del contacto (completa, parcial, rechazo…) y último bloque
--    contestado. En EDIMCA queda null: se sigue usando `completada`.
alter table encuestas add column if not exists resultado text;
alter table encuestas add column if not exists ultimo_bloque text;
