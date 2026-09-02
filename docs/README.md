# Sistema de Encuestas — Documentación

Sistema interno para levantar encuestas de satisfacción de clientes, integrado con Twenty CRM (self-hosted), reemplazando el flujo actual en FastField.

## Índice de documentos

| Documento | Contenido |
|---|---|
| [PRD.md](./PRD.md) | Qué se construye, para quién, y por qué |
| [TRD.md](./TRD.md) | Stack, integración con Twenty, reglas del cron de limpieza, restricciones técnicas |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Cómo se comunican los componentes (diagramas de flujo) |
| [DATABASE.md](./DATABASE.md) | Modelo de datos en Supabase + ERD |
| [API.md](./API.md) | Contratos de los endpoints |

## Resumen rápido

- **Stack:** Next.js + Supabase (Postgres) + integración vía API REST con Twenty CRM.
- **Problema que resuelve:** identificación confiable del cliente encuestado (sin texto libre), cuestionario editable por un admin, y limpieza automática y recurrente de datos sucios en Twenty (espacios de relleno, `"NULL"` como texto).
- **Pieza más sensible:** el cron diario (11:00 UTC-5) que escribe directamente sobre Twenty — corre primero en modo dry-run antes de dejarse autónomo, y deja auditoría completa de cada cambio.

## Cómo correr el proyecto (una vez levantado el código)

> Esta sección se completa a medida que el proyecto se implementa. Por ahora describe las variables de entorno y comandos previstos.

### Requisitos

- Node.js LTS
- Cuenta de Supabase (URL + service role key)
- API Key de Twenty CRM con acceso de lectura/escritura sobre `people`

### Variables de entorno

```
NEXT_PUBLIC_SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
TWENTY_API_URL=https://{dominio}/rest
TWENTY_API_KEY=
CRON_SECRET=
```

### Scripts previstos

```bash
npm install
npm run dev        # levanta la app en local
npm run db:migrate # aplica el esquema descrito en DATABASE.md
```

## Estado del proyecto

Fase de diseño cerrada (arquitectura, modelo de datos y contratos de API definidos). Pendiente: implementación.
