#!/bin/sh
# Applies the migrations to a throwaway local database and runs the access tests. Usage: PGURL=postgres://... ./run.sh
set -e
D=$(dirname "$0"); DB=trends_rls_$$
psql "$PGURL" -q -c "create database $DB" && U=$(echo "$PGURL" | sed "s|/[^/]*$|/$DB|")
trap 'psql "$PGURL" -q -c "drop database $DB"' EXIT
psql "$U" -q -v ON_ERROR_STOP=1 -f "$D/shim.sql"
for m in "$D"/../migrations/*.sql; do psql "$U" -q -v ON_ERROR_STOP=1 -f "$m"; done
psql "$U" -v ON_ERROR_STOP=1 -f "$D/rls.sql" 2>&1 | grep -E "ok |FAIL|ERROR|PASSED"
