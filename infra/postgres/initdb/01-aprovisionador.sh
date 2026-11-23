#!/bin/sh
# Solo corre la primera vez (volumen vacío). Crea el rol con el que trabaja el
# aprovisionador: puede crear bases y usuarios, pero no es superusuario.
set -eu
: "${APROVISIONADOR_DB_PASSWORD:?Falta APROVISIONADOR_DB_PASSWORD}"
psql -v ON_ERROR_STOP=1 -v pw="$APROVISIONADOR_DB_PASSWORD" --username "$POSTGRES_USER" --dbname postgres <<'SQL'
create role aprovisionador with login createdb createrole password :'pw';
-- Los usuarios que crea le quedan concedidos con SET e INHERIT: puede revisar
-- sus bases (estado, consultas de solo lectura) sin ser superusuario.
alter role aprovisionador set createrole_self_grant = 'set, inherit';
create database aprovisionador owner aprovisionador;
revoke all on database postgres from public;
SQL
