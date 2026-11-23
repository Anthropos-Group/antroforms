# Ficha — PUCE · Estudio de plantas de manufactura (Strattos)

> Slug: **`puce`** · base `af_puce` · stack `antroforms-puce` ·
> `encuestas-puce.aiagentrevenue.online`

## Cliente

| Dato | Valor |
|---|---|
| Nombre comercial | PUCE |
| Contratante | Strattos (administradora de proyectos) |
| Tipo de estudio | Encuesta a empresas (plantas de manufactura) |
| Modalidad | Híbrida: el encuestador contacta por **llamada, WhatsApp o correo** y registra la encuesta en Antroforms, igual que en 23 de Julio |
| Administrador de la plataforma | info@strattos.io |
| Twenty | `https://puce.aiagentrevenue.online` (campos creados el 23/11/2026) |
| URL de encuestas | `encuestas-<slug>.aiagentrevenue.online` |
| Inicio de campo | Entre el 23 y el 24 de noviembre de 2026 (urgente) |
| Reporte | Sí, el más simple posible al inicio (avance, efectivas, estados por encuestador y ciudad); se mejora después |

## Instrumento (documentos/)

Cuatro segmentos de **una sola encuesta**, en el orden **6 → 5 → 4 → 2**:

| Sección | Archivo | Contenido | Preguntas |
|---|---|---|---|
| VI Liderazgo | `6_Leadership.docx` | LM01 (26 afirmaciones, 1–7) | 26 |
| V Cultura de planta | `5_Plant_Culture.docx` | FC01–FC09 (tablas 1–7), FC10 participación por departamento | 50 + 9 |
| IV Innovación | `4_Innovation.docx` | IN01–IN15 (tablas 1–7), IN13 función, IN16–18 abiertas, IN19 participación | 75 + 1 + 3 + 9 |
| II Cadena de suministro | `2_Supply_Chain.docx` | SC01–SC12 (tablas 1–7), SC13 departamento, SC14 %, SC15 participación, SC16–22 abiertas | 55 + 1 + 1 + 9 + 7 |

Digitalizado en `tenants/puce.cuestionario.js`: 258 preguntas (233 de escala en 37 tablas,
15 abiertas, 4 de opción única, 1 numérica, 5 indicaciones). Duración estimada: 50–70 min.

## Campos de la muestra → Twenty (`person`)

Cada registro de Twenty es **el contacto de una empresa**.

| Columna de la muestra | Campo en Twenty | Uso en la app |
|---|---|---|
| Código de empresa | `codigoEmpresa` | código (obligatorio para encuestar) |
| Razón social | `razonSocial` | «Empresa»: se muestra y se busca |
| RUC | `ruc` | dato del listado (exportación) |
| Ciudad | `ciudad` | grupo de reportes y monitoreo |
| Sector | `sector` | dato del listado (exportación) |
| Nombre del contacto | `name` | nombre en el buscador y el guion |
| Cargo del contacto | `cargoContacto` | dato del listado |
| Teléfono | `celular` | teléfono |
| Correo | `correoContacto` | dato del listado |
| — | `estadoGestion` | estado (Pendiente, Completa, Parcial, Cita…) |
| — | `intentosContacto` | número de gestiones registradas |

Plantilla para la PMO: `documentos/plantilla_base_empresas.xlsx` (hoja «Empresas» + instrucciones).
Carga: `TENANT=<slug> node scripts/cargar-empresas.js --base=<archivo>` (simula; `--aplicar` carga).
Acepta variantes de nombres de columna (`lib/empresas.js`); sin CODIGO usa el RUC.
Las respuestas de la encuesta **no** van a Twenty: quedan en la base de Antroforms.

## Estados de gestión

PENDIENTE · PRIMERA_LLAMADA · CORREO_ENVIADO · ESPERANDO_CORREO · WHATSAPP_ENVIADO ·
CITA (cita agendada) · COMPLETA · PARCIAL · NO_CONTACTO · NO_CONTESTA · RECHAZO ·
NO_INTERESADO · NUMERO_INCORRECTO (incluye correo incorrecto) · INFORMANTE_NO_AUTORIZADO ·
FUERA_UNIVERSO. Salen del buscador: RECHAZO, NO_INTERESADO, NUMERO_INCORRECTO,
FUERA_UNIVERSO y COMPLETA.

## Reglas

- **CANAL** (primera pregunta): llamada, WhatsApp o correo. Solo se registra; no hay
  envíos automáticos ni integración con WhatsApp/correo (no es parte del alcance).
- **CI1** consentimiento: «No acepta» termina la encuesta como RECHAZO.
- **Cerradas: obligatorias con NS/NR** (exigencia legal), excepto canal y consentimiento.
  NS/NR se registran aparte, nunca como número; no se avanza sin responder.
- **Abiertas: opcionales** (PMO): se pueden dejar en blanco y no llevan NS/NR.
- **Una sola persona** de la empresa responde toda la encuesta (PMO): nombre y cargo al inicio (INF).
- **Gestión por canal**: el encuestador cierra sin empezar o a medias con Primera llamada,
  Correo enviado, Esperando respuesta de correo, WhatsApp enviado, Cita agendada, Parcial,
  No contesta, No contacto, No interesado, Número incorrecto, Informante no autorizado o
  Fuera del universo. Cada gestión cuenta como un intento.
- **Tablas 1–7**: cada enunciado (LM01, FC01…) se muestra en una pantalla con todas sus
  afirmaciones; cada afirmación es una columna en la exportación (`LM01_01`…).
- **Participación de departamentos** (FC10, IN19, SC15): 1–5 de menor a mayor aporte;
  **0 = sin información** (el «en blanco» del papel). «Otros» con 1–5 pide especificar.
- **IN02 «Otros motivos»**: si la frecuencia es mayor que 1 (Nunca), pide especificar.
- **Retoma**: cualquier cierre sin terminar guarda lo respondido; al abrir de nuevo la
  empresa (cualquier encuestador, cualquier dispositivo) se carga y sigue donde quedó.

## Decisiones tomadas

1. Las dos últimas afirmaciones de LM01 («Organizar sus oficinas…», «Utilizar métodos
   electrónicos…») venían sin escala en el Word (formato dañado): van con 1–7 (OK del usuario).
2. Una sola persona responde toda la encuesta (PMO); se registra una vez al inicio (INF).
6. Abiertas opcionales; cerradas obligatorias con NS/NR (PMO).
7. «Primera llamada» se interpretó como resultado de gestión: se presentó el estudio y queda
   pendiente responder (junto con los estados de llamada existentes).
3. FC09 (forma de pago) y SC12 (invierno/verano) se preguntan tal cual el documento.
4. Erratas corregidas: «Always» → «Siempre» (IN10), «Alredor» → «Alrededor» (IN12),
   «Nivel moderada» → «Nivel moderado» (FC05).
5. Muestra en el objeto `person` de Twenty (contacto de la empresa), no en `company`:
   reutiliza toda la integración existente.

## Preguntas abiertas

- Base de empresas (la PMO la arma con la plantilla).
- Borrar los registros de ejemplo de fábrica del Twenty.
- ¿Cuotas por ciudad o sector? (por ahora la cuota del reporte = tamaño de la muestra).
- Destinatarios y hora del reporte, si se envía por correo.
