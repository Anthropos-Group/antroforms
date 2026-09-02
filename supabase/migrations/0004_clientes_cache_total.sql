-- 0004_clientes_cache_total.sql
-- Necesario para la regla de negocio: la pregunta de "calidad de piezas cortadas
-- y laminadas" solo se activa si el cliente tiene dato en TOTAL; si no, va como N/A.

alter table clientes_cache add column if not exists total text;
