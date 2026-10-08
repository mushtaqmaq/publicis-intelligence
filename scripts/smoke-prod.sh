#!/bin/sh
# Post-deploy smoke test (signed out). Usage: sh scripts/smoke-prod.sh [base-url]
# Checks that public pages load, that protected pages redirect to login or answer 401 (never 500), and that the legacy
# /planning links still redirect. It cannot test signed-in behaviour; do that by hand after each release.
BASE="${1:-https://publicis-intelligence.vercel.app}"; FAIL=0
check() { # path expected-status [expected-redirect-substring]
  out=$(curl -s -m 60 -o /dev/null -w "%{http_code} %{redirect_url}" "$BASE$1"); code=${out%% *}; loc=${out#* }
  ok=1; [ "$code" = "$2" ] || ok=0; [ -z "$3" ] || case "$loc" in *"$3"*) ;; *) ok=0;; esac
  if [ $ok = 1 ]; then printf "  ok   %-40s %s\n" "$1" "$code"; else printf "  FAIL %-40s got %s %s (wanted %s %s)\n" "$1" "$code" "$loc" "$2" "$3"; FAIL=1; fi
}
echo "Smoke test: $BASE"
check / 200; check /login 200; check /api/health 200
check /api/me 401; check /api/admin/users 401; check /api/search 401; check "/api/asset-images/x" 401
for p in /media /media/plans /media/plans/new /media/inventory /media/map /media/suppliers /media/reports /media/dashboard /media/settings/rate-cards /media/settings/import-rate-card /media/settings/import-kmz /media/settings/fees /media/settings/audit-log; do check $p 307 /login; done
check /media/plans/x/agency 401; check /media/plans/export 401
check /planning/inventory 307 /media/inventory
[ $FAIL = 0 ] && echo "All checks passed." || { echo "Some checks FAILED."; exit 1; }
