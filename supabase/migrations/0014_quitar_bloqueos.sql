-- 0014_quitar_bloqueos.sql
-- Se descartó el bloqueo "en gestión" y el registro de resultados de llamada desde
-- la app (0013): los encuestadores mueven los leads a EN_GESTION en lotes desde
-- Twenty, sin asignárselos, y gestionan las llamadas en el CRM. Las tablas nunca
-- se usaron en producción (estaban vacías). pdv_config (0013) se mantiene.
drop table if exists clientes_bloqueo;
drop table if exists gestiones;
