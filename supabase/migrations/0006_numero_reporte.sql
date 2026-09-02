-- 0006_numero_reporte.sql
-- El cliente numera sus preguntas 1-9 en su propio documento (incluyendo Nombre
-- y Código, que en nuestro sistema no son "preguntas" sino autocompletado).
-- Por eso el orden interno (1-7, consecutivo) no coincide con la numeración
-- que el cliente reconoce. Agregamos un número de reporte independiente para
-- que "P5", "P8", etc. en el Excel/preview coincidan con SU documento original.

alter table preguntas add column if not exists numero_reporte integer;

update preguntas p set numero_reporte = m.numero
from (values (1, 1), (2, 2), (3, 5), (4, 6), (5, 7), (6, 8), (7, 9)) as m(orden, numero)
where p.orden = m.orden
  and p.cuestionario_id = (select id from cuestionarios where nombre = 'Satisfacción EDIMCA' limit 1);
