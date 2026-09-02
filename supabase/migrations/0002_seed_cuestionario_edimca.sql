-- 0002_seed_cuestionario_edimca.sql
-- Carga el cuestionario vigente de EDIMCA (el que hoy corre en FastField)
-- con su lógica condicional: la pregunta 2 filtra si sigue o no la encuesta,
-- y las preguntas de escala solo aplican si el filtro dio positivo.

do $$
declare
  v_cuestionario_id uuid;
  v_q1_id uuid;
  v_q2_id uuid;
begin
  insert into cuestionarios (nombre, version, activo, objeto_twenty)
  values ('Satisfacción EDIMCA', 1, true, 'people')
  returning id into v_cuestionario_id;

  insert into preguntas (cuestionario_id, orden, texto, tipo, requiere_justificacion, condicion)
  values (
    v_cuestionario_id, 1,
    '¿Está usted de acuerdo, y acepta participar del siguiente estudio?',
    'aceptacion_si_no', false, null
  )
  returning id into v_q1_id;

  insert into preguntas (cuestionario_id, orden, texto, tipo, requiere_justificacion, condicion)
  values (
    v_cuestionario_id, 2,
    '¿Es usted la persona que realizó todo el proceso de compra?',
    'aceptacion_si_no', false,
    jsonb_build_object('pregunta_id', v_q1_id, 'valor_esperado', true)
  )
  returning id into v_q2_id;

  insert into preguntas (cuestionario_id, orden, texto, tipo, requiere_justificacion, condicion)
  values
    (v_cuestionario_id, 3,
     '¿Qué tanto recomendaría EDIMCA a sus clientes, amigos y familiares?',
     'escala_1_10', true,
     jsonb_build_object('pregunta_id', v_q2_id, 'valor_esperado', true)),

    (v_cuestionario_id, 4,
     '¿Qué tan satisfecho se encuentra con la calidad de atención del asesor comercial que lo atendió?',
     'escala_1_10', true,
     jsonb_build_object('pregunta_id', v_q2_id, 'valor_esperado', true)),

    (v_cuestionario_id, 5,
     '¿Qué tan satisfecho se encuentra con la calidad de las piezas, en especial las cortadas y laminadas para su mueble?',
     'escala_1_10', true,
     jsonb_build_object('pregunta_id', v_q2_id, 'valor_esperado', true)),

    (v_cuestionario_id, 6,
     '¿Qué tan satisfecho se encuentra con el cumplimiento de los tiempos de entrega ofrecidos?',
     'escala_1_10', true,
     jsonb_build_object('pregunta_id', v_q2_id, 'valor_esperado', true)),

    (v_cuestionario_id, 7,
     '¿Qué tan satisfecho está con toda su experiencia de compra en el punto de venta al cual visitó?',
     'escala_1_10', true,
     jsonb_build_object('pregunta_id', v_q2_id, 'valor_esperado', true));
end $$;
