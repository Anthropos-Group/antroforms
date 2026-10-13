-- 0015_indice_mes_gestion.sql
-- Índice por mes de gestión normalizado. Casi todas las consultas del encuestador
-- filtran por `upper(trim(mes_gestion))` (buscador, mes activo, monitoreo) y, sin
-- este índice, cada búsqueda recorría la copia local de clientes completa, con el
-- JSON de Twenty de cada registro. Con el índice solo se lee la base del mes activo.
create index if not exists idx_clientes_cache_mes on clientes_cache ((upper(trim(mes_gestion))));

analyze clientes_cache;
