-- 0005_guiones_y_monitoreo.sql
-- Guion de apertura/cierre para que el encuestador no tenga que memorizar el
-- speech, y la fecha de atención del cliente (para autocompletar el guion).

alter table cuestionarios add column if not exists guion_apertura text;
alter table cuestionarios add column if not exists guion_cierre text;
alter table clientes_cache add column if not exists fecha_atencion text;

update cuestionarios set
  guion_apertura = 'Buenos días/tardes, mi nombre es {{ENCUESTADOR}} y trabajo para la empresa ANTROPROYECTOS. Nos dedicamos a conocer, a través de encuestas, la opinión de personas como usted sobre diversos temas. Actualmente, estamos llevando a cabo un estudio de satisfacción de clientes de EDIMCA que realizaron la compra en la sucursal de {{SUCURSAL}} el día {{FECHA}}. Queremos informarle que esta llamada será grabada para garantizar la calidad de los datos recopilados. Además, todos los datos proporcionados serán utilizados únicamente para este estudio en particular. Al continuar con esta llamada, usted nos autoriza a utilizar su información con este fin específico.',
  guion_cierre = 'A nombre de Antroproyectos y EDIMCA, agradecemos su participación en esta encuesta.'
where nombre = 'Satisfacción EDIMCA';
