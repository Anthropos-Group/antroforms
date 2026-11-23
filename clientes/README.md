# Clientes

Una carpeta por cliente (`clientes/<slug>/`), creada por la skill `nuevo-cliente`:

- `FICHA.md`: datos del cliente, reglas de negocio, decisiones y preguntas abiertas.
- `documentos/`: cuestionarios y documentos de reglas de negocio que entrega el cliente.

**Nunca** se suben bases de datos con datos personales (socios, clientes, cédulas,
teléfonos). La carpeta `datos/` de cada cliente está ignorada por git.

La configuración técnica vive en `tenants/<slug>.js` y `tenants/<slug>.cuestionario.js`.
