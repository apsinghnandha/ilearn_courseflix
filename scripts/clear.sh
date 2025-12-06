#!/usr/bin/env bash

# clear.sh
# ---------------------
# Danger: Clean up script that resets local Docker and project state. This
# script will stop all containers, remove images (docker system prune) and
# wipe the project's `data` directory. Do not run on production.

# Resolve the project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
DATA_DIR="$PROJECT_ROOT/data"

echo "⚠️  WARNING: This will STOP all containers, REMOVE them, PRUNE all images/volumes,"
echo "    AND DELETE ALL DATA in $DATA_DIR."
read -p "Are you sure? (y/N) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "🔥 Nuke mode engaged..."
    
    # Docker cleanup
    docker stop $(docker ps -aq) 2>/dev/null || true
    docker rm $(docker ps -aq) 2>/dev/null || true
    docker system prune -a --volumes -f
    echo "✅ Docker system cleared."

    # Data cleanup
    if [ -d "$DATA_DIR" ]; then
        echo "🗑️  Cleaning data directory..."
        rm -rf "$DATA_DIR"/*
        echo "✅ Data directory cleared."
    else
        echo "⚠️  Data directory not found at $DATA_DIR"
    fi
else
    echo "Cancelled."
fi
