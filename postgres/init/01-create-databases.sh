#!/bin/bash
# Executado automaticamente na primeira inicialização do Postgres.
# Cria os dois bancos usados pela stack: "evolution" e "n8n".
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "postgres" <<-EOSQL
    CREATE DATABASE evolution;
    CREATE DATABASE n8n;
    GRANT ALL PRIVILEGES ON DATABASE evolution TO $POSTGRES_USER;
    GRANT ALL PRIVILEGES ON DATABASE n8n TO $POSTGRES_USER;
EOSQL

echo ">>> Bancos 'evolution' e 'n8n' criados com sucesso."
