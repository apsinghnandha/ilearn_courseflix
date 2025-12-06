#!/bin/sh
set -e

# Ensure /data directory exists and set ownership
mkdir -p /data

chown -R "${PUID:-1000}:${PGID:-100}" /data

# Execute the command as the specified user
exec su-exec "${PUID:-1000}:${PGID:-100}" "$@"