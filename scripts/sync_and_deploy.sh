#!/usr/bin/env bash
set -euo pipefail

# sync_and_deploy.sh
# ---------------------
# Incremental sync and deployment tool that rsyncs the local project to a
# remote Orange Pi and optionally prepares/cleans certain artifacts. Useful
# for quickly updating a remote test device without rebuilding containers.

# Usage:
#   ./scripts/sync_and_deploy.sh --dry-run
#   ./scripts/sync_and_deploy.sh --apply
#   ./scripts/sync_and_deploy.sh --include-compiled  (include backend __pycache__)
#   ./scripts/sync_and_deploy.sh --include-data      (include ./data in sync; use with caution)

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SRC_DEFAULT="$PROJECT_ROOT/"
DST_DEFAULT="ap@192.168.20.4:/home/ap/zcloud/apps/docker-compose/build/ilearn/"
SSH_PORT_DEFAULT=8888
EXCLUDE_DEFAULT=("node_modules" "data" "__pycache__" ".DS_Store" ".git")

SRC=${SRC:-$SRC_DEFAULT}
DST=${DST:-$DST_DEFAULT}
SSH_PORT=${SSH_PORT:-$SSH_PORT_DEFAULT}
DRY_RUN=true
INCLUDE_COMPILED=false
INCLUDE_DATA=false

declare -a EXCLUDE_ARGS
for e in "${EXCLUDE_DEFAULT[@]}"; do
    EXCLUDE_ARGS+=("--exclude=$e")
done

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

# We'll update exclude list after parsing flags

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
      EXCLUDE_ARG_VAL="${arg#*=}"
      EXCLUDE_ARGS+=("--exclude=$EXCLUDE_ARG_VAL")
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

RSYNC_BASE=(rsync -avz --progress --itemize-changes --stats --partial --partial-dir=.rsync-partial --delay-updates --delete-after -e "ssh -p $SSH_PORT")

echo "SRC: $SRC"
echo "DST: $DST"
echo "SSH_PORT: $SSH_PORT"
echo "Exclude args: ${EXCLUDE_ARGS[*]}"

if [ "$DRY_RUN" = true ]; then
  echo "Running dry-run. This will not change anything on remote. To apply, run with --apply"
  "${RSYNC_BASE[@]}" "${EXCLUDE_ARGS[@]}" --dry-run "$SRC" "$DST"
  exit 0
fi

if [ "$INCLUDE_COMPILED" = true ]; then
  echo "Including compiled artifacts in sync."
fi
if [ "$INCLUDE_DATA" = true ]; then
  echo "WARNING: You are syncing local ./data folder; this may transfer databases and overwrite remote state."
fi
echo "Performing sync (apply). This will mirror local to remote and may delete files on remote."
read -p "Proceed with sync? (y/N) " yn
if [[ ! "$yn" =~ ^[Yy]$ ]]; then
  echo "Aborted by user."
  exit 1
fi

"${RSYNC_BASE[@]}" "${EXCLUDE_ARGS[@]}" "$SRC" "$DST"

echo "Sync complete."
