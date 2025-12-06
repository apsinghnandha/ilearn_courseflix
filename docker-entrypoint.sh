#!/bin/sh
set -e

# Set ownership of /app/data
chown -R "${PUID:-1000}:${PGID:-100}" /app/data

# Execute the command as the specified user
exec su-exec "${PUID:-1000}:${PGID:-100}" "$@"