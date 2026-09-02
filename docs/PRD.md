# PRD — Sistema de Encuestas de Satisfacción

## 1. Problema

El equipo levanta encuestas de satisfacción de clientes de EDIMCA usando **FastField**, con datos de contacto capturados por Twenty CRM (self-hosted). FastField permite texto libre en nombre y código de cliente, lo que produce:

- Datos no estructurados y difíciles de analizar (~8,000 celdas de texto libre en la última exportación).
- Imposibilidad de confirmar con certeza qué registro real de Twenty corresponde a cada encuesta respondida.
- Ningún cierre de ciclo entre "se hizo la llamada" (Twenty) y "se completó la encuesta" (FastField).

Adicionalmente, la base de clientes en Twenty (objeto `people`, ~20,700+ registros y creciendo con cargas diarias) tiene problemas de formato (espacios de relleno, valores `"NULL"` como texto en vez de vacío real) heredados de las cargas de datos de ancho fijo.

## 2. Objetivo

Construir un sistema interno de encuestas que:

1. Elimine el texto libre en la identificación del cliente, seleccionando siempre de un registro real de Twenty.
2. Permita a un administrador editar el cuestionario (preguntas, tipo, orden, lógica condicional) sin tocar código.
3. Cierre el ciclo con Twenty: al completar una encuesta, refleja el resultado (`status → EFECTIVA`).
4. Limpie de forma autónoma y recurrente los problemas de formato de la base de Twenty, ya que las cargas siguen llegando.
5. Sea la base para más formularios/encuestas a futuro, no solo el cuestionario actual de EDIMCA.

## 3. Usuarios

- **Encuestador**: hace la llamada, selecciona su nombre de una lista, busca al cliente, completa el cuestionario. No tiene login individual (una sola cuenta compartida de acceso a la app).
- **Administrador**: edita preguntas del cuestionario, gestiona el listado de encuestadores (alta/edición/baja), revisa el historial del proceso de limpieza de Twenty, descarga el reporte de encuestas en Excel.

## 4. Alcance (Fase 1)

- Búsqueda de cliente contra Twenty (vía caché propia normalizada) con autocompletado por nombre.
- Autocompletado de Código de cliente, PDV y Mes de Gestión al seleccionar el cliente (solo lectura).
- Cuestionario dinámico con las preguntas actuales de EDIMCA (aceptación, filtro de comprador, 5 preguntas de escala 1–10 con justificación abierta), con lógica condicional para cortar la encuesta si el filtro de comprador es "No".
- CRUD de preguntas del cuestionario (texto, tipo, orden, si requiere justificación, condición de salto).
- CRUD de encuestadores.
- Al completar una encuesta: `PATCH` a Twenty (`status: "EFECTIVA"`).
- Cron diario de limpieza de Twenty (11:00 UTC-5), corrige formato de campos de texto directamente en la fuente.
- Exportación a Excel de las encuestas levantadas, filtrable por encuestador/fecha/mes de gestión.

## 5. Fuera de alcance (por ahora)

- Autenticación individual por encuestador (login/contraseña por persona).
- Reescritura de datos que no sean de texto/formato (no se tocan relaciones, montos, fechas de negocio).
- Formularios adicionales fuera del cuestionario EDIMCA (el modelo debe soportarlo, pero no se construye en esta fase).
- Reintentos o edición de encuestas ya enviadas.

## 6. Criterios de éxito

- 0% de encuestas sin match verificable contra un registro de Twenty (vs. el problema actual con FastField).
- El cron de limpieza corre diariamente sin intervención manual y dejahistorial auditable de cada cambio.
- El admin puede agregar/editar una pregunta sin requerir un despliegue de código.
- El reporte Excel reemplaza por completo la necesidad de exportar manualmente desde FastField.
