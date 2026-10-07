#!/bin/sh
set -e
# Refuse to run without the persistent volume: server.js would silently fall back to /tmp and lose data.
if ! mountpoint -q /data 2>/dev/null; then
  echo "FATAL: /data is not a mounted volume; refusing to start." >&2
  exit 1
fi
chown -R node:node /data
exec su-exec node "$@"
