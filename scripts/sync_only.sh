#!/usr/bin/env bash
set -euo pipefail

# Simple sync-only script.
# Usage:
#  ./scripts/sync_only.sh --dry-run       (default, safe)
#  ./scripts/sync_only.sh --apply         (actually synchronize)
#  ./scripts/sync_only.sh --delete        (pass --delete to rsync to mirror deletions)
#  ./scripts/sync_only.sh --include-compiled    (include backend __pycache__)
#  ./scripts/sync_only.sh --include-data        (include ./data in sync; use with caution)

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SRC_DEFAULT="$PROJECT_ROOT/"
DST_DEFAULT="ap@192.168.20.4:/home/ap/zcloud/apps/docker-compose/build/ilearn/"
SSH_PORT_DEFAULT=8888
#exclude list we can add in below bracket "node_modules" "data" "__pycache__" ".DS_Store" ".git"
EXCLUDE_DEFAULT=()

SRC=${SRC:-$SRC_DEFAULT}
DST=${DST:-$DST_DEFAULT}
SSH_PORT=${SSH_PORT:-$SSH_PORT_DEFAULT}
DRY_RUN=true
INCLUDE_COMPILED=false
INCLUDE_DATA=false
RSYNC_DELETE=""

declare -a EXCLUDE_ARGS
for e in "${EXCLUDE_DEFAULT[@]}"; do
  EXCLUDE_ARGS+=("--exclude=$e")
done

# If user wants to include compiled or data files, remove them from the exclude list
remove_exclude() {
  local target="$1"
  local newargs=()
  for arg in "${EXCLUDE_ARGS[@]}"; do
    if [[ "$arg" != "--exclude=$target" ]]; then
      newargs+=("$arg")
    fi
  done
  EXCLUDE_ARGS=("${newargs[@]}")
}

# We will update exclude list after parsing flags

for arg in "$@"; do
  case $arg in
    --apply)
      DRY_RUN=false
      shift
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --delete)
      RSYNC_DELETE="--delete"
      shift
      ;;
    --src=*)
      SRC="${arg#*=}"
      shift
      ;;
    --dst=*)
      DST="${arg#*=}"
      shift
      ;;
    --ssh-port=*)
      SSH_PORT="${arg#*=}"
      shift
      ;;
    --exclude=*)
      EXCLUDE_ARGS+=("--exclude=${arg#*=}")
      shift
      ;;
    --include-compiled)
      INCLUDE_COMPILED=true
      shift
      ;;
    --include-data)
      INCLUDE_DATA=true
      shift
      ;;
    *)
      ;;
  esac
done

# After parsing flags, update exclude list if requested
if [ "$INCLUDE_COMPILED" = true ]; then
  remove_exclude "__pycache__"
fi
if [ "$INCLUDE_DATA" = true ]; then
  remove_exclude "data"
fi

if [ "$INCLUDE_COMPILED" = true ]; then
  echo "Including compiled artifacts (__pycache__, etc.) in sync."
fi
if [ "$INCLUDE_DATA" = true ]; then
  echo "WARNING: Including ./data in sync (this may overwrite databases or local state)."
fi
echo "Sync only: SRC=$SRC"
echo "DST=$DST"
echo "SSH_PORT=$SSH_PORT"
echo "Delete mode: ${RSYNC_DELETE:-no}"

RSYNC_CMD=(rsync -avz --progress --itemize-changes --stats --partial --partial-dir=.rsync-partial --delay-updates -e "ssh -p $SSH_PORT")

if [ "$DRY_RUN" = true ]; then
  echo "Running dry-run; use --apply to synchronize."
  "${RSYNC_CMD[@]}" "${EXCLUDE_ARGS[@]}" $RSYNC_DELETE --dry-run "$SRC" "$DST"
  exit 0
fi

echo "Applying synchronization now."
read -p "Proceed? (y/N) " yn
if [[ ! "$yn" =~ ^[Yy]$ ]]; then
  echo "Aborted by user."
  exit 1
fi

"${RSYNC_CMD[@]}" "${EXCLUDE_ARGS[@]}" $RSYNC_DELETE "$SRC" "$DST"

echo "Sync only complete."
