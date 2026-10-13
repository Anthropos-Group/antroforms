# Rendimiento, concurrencia y red — Auditoría de octubre 2026

A raíz de un reporte de encuestadores ("la plataforma está muy lenta y en algunas
encuestas no guarda; tengo que salir e ingresar nuevamente"), se revisó el sistema
completo buscando qué se degrada con más datos, más encuestadores a la vez, una red
inestable o un Twenty lento. Cada corrección se verificó contra un Postgres 16 real
con volumen de producción (40 000 clientes, 4 000 encuestas) y con la app corriendo
y Twenty inaccesible.

## 1. Guardado de encuestas

| # | Problema | Impacto | Corrección |
|---|---|---|---|
| G1 | El navegador esperaba la respuesta del guardado sin límite. Con el servidor lento, la pantalla quedaba en "Guardando respuesta…" para siempre. | El encuestador tenía que salir y volver a entrar (el reporte original). | Límite de 30 s y botón "Reintentar envío". El reintento es seguro: el `idempotency_key` evita duplicados. |
| G2 | El guardado esperaba el `PATCH` a Twenty (hasta 8 s) antes de responder. | Cada encuesta tardaba lo que tardara Twenty. | La respuesta sale apenas la encuesta queda en la base; Twenty se actualiza después con `after()`. |
| G3 | Si el contenedor se reiniciaba (despliegue, caída) justo después de guardar, el cambio de estado hacia Twenty se perdía; y el refresco podía pisar el estado local con el viejo de Twenty mientras tanto. | Clientes `NO_LLAMAR` o `EFECTIVA` que en Twenty seguían como antes. | El pendiente hacia Twenty se registra **en la misma transacción** que la encuesta; el envío en segundo plano lo borra cuando Twenty confirma. Si no llega, lo reintenta el refresco. |
| G4 | El candado de concurrencia era por registro de Twenty, pero el chequeo de "ya encuestado" también cuenta otro registro con el mismo código. | Dos registros con el mismo código podían quedar encuestados a la vez. | Candado por código de cliente. Probado: 5 rondas de envíos simultáneos sobre dos registros con el mismo código → siempre 1 guardada y 1 "ya encuestado". |
| G5 | Ninguna consulta tenía tope de tiempo. | Una consulta trabada retenía una conexión del pool indefinidamente. | `statement_timeout` de 15 s en la transacción de guardado y de 60 s por defecto en toda la app (`PG_STATEMENT_TIMEOUT_MS`). |

## 2. Búsqueda de clientes

| # | Problema | Impacto | Corrección |
|---|---|---|---|
| B1 | Cada búsqueda (cada pausa al teclear) consultaba primero a Twenty y esperaba su respuesta, hasta 6 s, antes de buscar en la copia local. Con varios encuestadores, eran decenas de consultas por minuto contra la API de Twenty. | Buscador lento siempre que Twenty lo estuviera, y Twenty saturado por la propia app. | La búsqueda va primero contra la copia local y responde al instante. Solo si no hay coincidencias se pregunta a Twenty (el cliente cargado hace instantes). Así era el diseño original (TRD §5). |
| B2 | La consulta recorría la tabla de clientes completa **dos veces** por búsqueda (con el JSON de Twenty de cada registro): sin índice por mes de gestión y con un `NOT EXISTS` con `OR` que impedía usar los índices de encuestas. | Muchas lecturas de disco por tecla; en el plan Free de Supabase eso agota el presupuesto de I/O y la base se pone lenta para todos. | Índice `upper(trim(mes_gestion))` (migración 0015) y el `NOT EXISTS` dividido en dos. Medido: de ~3 200 páginas leídas por búsqueda a 410–1 130 (3 a 8 veces menos). |
| B3 | Con Twenty caído, cada búsqueda y cada apertura de cliente esperaban el timeout completo. | Varios segundos de espera en cada paso. | Disyuntor: tras una falla de Twenty por lentitud, red o error del servidor, durante 60 s se usa directo la copia local. Un error de la base ya no se confunde con Twenty caído. |
| B4 | Con la búsqueda contra la copia local, un cliente marcado `NO_LLAMAR` en Twenty hace instantes podría aparecer hasta el próximo refresco. | Llamada a quien pidió no ser contactado. | El refresco pasa de 10 a 3 min y, al abrir el cliente (que siempre trae sus datos vigentes de Twenty), la pantalla avisa si figura como `NO_LLAMAR` o `YA_LE_REALIZARON_LA_ENCUESTA`. |

## 3. Sincronización con Twenty

| # | Problema | Impacto | Corrección |
|---|---|---|---|
| S1 | El refresco, la limpieza nocturna y la búsqueda escribían lotes de clientes que se cruzan, cada uno en distinto orden. | Postgres abortaba lotes por *deadlock*. Reproducido: con la versión anterior, **28 de 30** lotes concurrentes fallaron; con la nueva, 0. | Filas ordenadas por id antes del upsert (mismo orden de candados). |
| S2 | El upsert reescribía el registro completo (con su JSON) aunque nada hubiera cambiado; el refresco relee cada pasada lo del solape. | Escrituras y uso de disco innecesarios en Supabase. | Solo se reescribe la fila si algún dato cambió (verificado: un lote idéntico no modifica ninguna fila). |
| S3 | La limpieza nocturna revisaba como máximo 50 páginas (5 000 registros). Si había más cambios desde la última corrida completa, quedaba "parcial" todas las noches sin avanzar. | Registros sin limpiar para siempre. | Tope de 500 páginas (50 000 registros), el mismo del refresco. |
| S4 | Con Twenty caído, la cola de reintentos intentaba sus 50 pendientes uno por uno, con 10 s de espera cada uno. | Hasta ~16 min de bloqueo del programador, que retrasaba el refresco de clientes. | La cola se detiene en la primera falla de Twenty y sigue en la próxima pasada. |

## 4. Carga de las pantallas y sesión

| # | Problema | Impacto | Corrección |
|---|---|---|---|
| P1 | Cada pantalla de monitoreo abierta (encuestadores y admins) recalculaba cada minuto consultas pesadas, aunque la pestaña estuviera en segundo plano. | N encuestadores = N cálculos pesados por minuto. | Caché compartida de 30 s en el servidor (se invalida al cambiar la meta o los PDVs), consultas en paralelo y sin subconsulta por PDV (de 3 a 5 veces más rápida, mismo resultado verificado). Las pantallas no consultan mientras la pestaña está oculta y se actualizan al volver. |
| P2 | La sesión vencía a las 12 h exactas del login, aunque se estuviera trabajando. | A mitad de turno, "no me deja guardar" hasta volver a iniciar sesión. | Renovación deslizante: con actividad, la sesión se extiende sola cuando le queda menos de la mitad. Una sesión ya vencida se sigue rechazando. |
| P3 | Las cargas iniciales (encuestadores, cuestionario, mes activo) no tenían límite de espera ni reintentos; el monitoreo del encuestador se vaciaba ante un error pasajero. | Pantallas vacías o colgadas ante un corte breve de red. | Límite de 15 s, 2 reintentos con espera creciente y el monitoreo conserva lo último mostrado. Aviso visible de "sin conexión" en la encuesta. |
| P4 | Las conexiones a la base no tenían keep-alive TCP. | Una conexión cortada por la red o el pooler podía colgar la consulta sin error. | `keepAlive` en el pool. |

## 5. Despliegue

1. Aplicar la migración **0015** (crea un índice; no bloquea lecturas, toma segundos):
   `node scripts/migrate.js` dentro del contenedor, o `npm run db:migrate:api`.
2. **Pull and redeploy** del stack. Si en Portainer está fijado `REFRESCO_MINUTOS=10`,
   cambiarlo a `3` (o quitarlo para usar el valor por defecto).
3. Nada que hacer en los navegadores: los borradores y las sesiones abiertas se conservan.

## 6. Qué vigilar después del despliegue

- **Supabase → Reports**: uso de CPU y de disco (Disk IO). Si el presupuesto de I/O
  estaba agotado, debería recuperarse en horas.
- **Admin → Historial Twenty → Cola de estados pendientes**: debe vaciarse sola. Un
  pendiente con intentos crecientes indica que Twenty está rechazando o no responde.
- **Logs del contenedor**: `Aviso en búsqueda en vivo con Twenty CRM` frecuente indica
  que Twenty está lento; `canceling statement due to statement timeout`, una consulta
  que superó el tope.
