# Postgres propio de Antroforms: una base por cliente (af_<slug>).
FROM postgres:17-alpine
COPY initdb/ /docker-entrypoint-initdb.d/
# Carpeta del log de Postgres (volumen compartido, solo lectura, con el aprovisionador).
RUN mkdir -p /pglogs && chown postgres:postgres /pglogs && chmod 755 /pglogs
