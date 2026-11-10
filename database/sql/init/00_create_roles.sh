#!/usr/bin/env bash
# Runs only when the PostgreSQL data volume is initialized the first time.
# Creates login roles using private .env passwords, BEFORE the existing schema SQL files.
set -Eeuo pipefail

: "${DB_PASSWORD:?DB_PASSWORD is required}"
: "${DB_MIGRATION_PASSWORD:?DB_MIGRATION_PASSWORD is required}"
: "${DB_AI_PASSWORD:?DB_AI_PASSWORD is required}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -v app_password="$DB_PASSWORD" \
  -v migrator_password="$DB_MIGRATION_PASSWORD" \
  -v ai_password="$DB_AI_PASSWORD" <<'SQL'
SELECT format('CREATE ROLE app_user LOGIN PASSWORD %L', :'app_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') \gexec
SELECT format('CREATE ROLE migrator LOGIN PASSWORD %L', :'migrator_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'migrator') \gexec
SELECT format('CREATE ROLE ai_user LOGIN PASSWORD %L', :'ai_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ai_user') \gexec
SQL
