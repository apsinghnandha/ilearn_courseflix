#!/usr/bin/env bash
set -e

# backup.sh
# ---------------------
# Lightweight project backup script that packages the repository snapshot
# into a timestamped directory under `_backup`. The script uses `rsync` if
# available for fast copying and excludes node_modules/.git and other
# common artifacts.

# Get current directory name and path
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PROJECT_NAME=$(basename "$PROJECT_ROOT")
TIMESTAMP=$(date +%Y-%m-%d_%H-%M-%S)

# Read Version
VERSION_FILE="$PROJECT_ROOT/VERSION"
if [ -f "$VERSION_FILE" ]; then
    VERSION=$(cat "$VERSION_FILE" | tr -d '[:space:]')
else
    VERSION="unknown"
fi

# Backup location (one level up from project root, inside _backup folder)
BACKUP_ROOT="$PROJECT_ROOT/../_backup"

# 1. Create the Container Folder: ilearn_v{VERSION}_{TIMESTAMP}
CONTAINER_NAME="ilearn_v${VERSION}_${TIMESTAMP}"
CONTAINER_PATH="${BACKUP_ROOT}/${CONTAINER_NAME}"

echo "=========================================="
echo "📦 Starting Backup for: $PROJECT_NAME"
echo "=========================================="

# Create container directory
mkdir -p "$CONTAINER_PATH"

# 2. Copy Changelog
CHANGELOG_SRC="$PROJECT_ROOT/docs/CHANGELOG.md"
if [ -f "$CHANGELOG_SRC" ]; then
    echo "📄 Copying CHANGELOG.md..."
    cp "$CHANGELOG_SRC" "$CONTAINER_PATH/CHANGELOG.md"
else
    echo "⚠️  CHANGELOG.md not found at $CHANGELOG_SRC"
fi

# 3. Perform Full Project Backup into subfolder
BACKUP_PATH="${CONTAINER_PATH}/${PROJECT_NAME}"
mkdir -p "$BACKUP_PATH"

# Perform the copy using rsync for speed and exclusion
# If rsync is not available, fallback to cp
if command -v rsync >/dev/null 2>&1; then
    echo "🔹 Using rsync..."
    rsync -av --progress "$PROJECT_ROOT/" "$BACKUP_PATH" \
        --exclude 'node_modules' \
        --exclude '.git' \
        --exclude '__pycache__' \
        --exclude '.DS_Store' \
        --exclude 'dist'
else
    echo "🔹 rsync not found, using cp..."
    mkdir -p "$BACKUP_PATH"
    cp -R "$PROJECT_ROOT/." "$BACKUP_PATH"
fi

echo ""
echo "✅ Backup Complete!"
echo "📂 Location: $CONTAINER_PATH"
echo "=========================================="
