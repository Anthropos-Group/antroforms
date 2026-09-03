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
| [DEPLOY.md](./DEPLOY.md) | Despliegue en servidor propio con Docker |

## Resumen rápido

- **Stack:** Next.js + Supabase (Postgres) + integración vía API REST con Twenty CRM.
- **Problema que resuelve:** identificación confiable del cliente encuestado (sin texto libre), cuestionario editable por un admin, y limpieza automática y recurrente de datos sucios en Twenty (espacios de relleno, `"NULL"` como texto).
- **Pieza más sensible:** el cron diario (11:00 UTC-5) que escribe directamente sobre Twenty — corre primero en modo dry-run antes de dejarse autónomo, y deja auditoría completa de cada cambio.

## Cómo correr el proyecto

Instalación local paso a paso (variables de entorno, migraciones, primer admin): ver el [README.md](../README.md) en la raíz del repo.

Para desplegarlo en un servidor propio (Docker + Caddy con HTTPS automático): ver [DEPLOY.md](./DEPLOY.md).

## Estado del proyecto

Implementado y en uso por el equipo: cron de limpieza, cuestionario dinámico, panel admin, reportes, monitoreo por PDV y autenticación por rol.
