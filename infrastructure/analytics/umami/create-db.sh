#!/bin/sh
# Creates the `umami` database on the shared dev Postgres if it does not exist yet. Idempotent, so it
# also works for a `db-data` volume created before Umami was part of the stack.
set -eu
echo "SELECT 'CREATE DATABASE umami' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'umami')\\gexec" \
  | psql -h db -U app -d app -v ON_ERROR_STOP=1
