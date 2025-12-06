# Development Guide & Project Structure

This document describes the project organization, conventions and common commands to help contributors and local development.

## Project Layout (convention)
- `backend/` - FastAPI application and Python code
- `frontend/` - React (Vite) frontend source
- `scripts/` - Helper scripts (start, stop, sync, backup, dev tools)
- `data/` - Persistent data used by the backend (DB, logs) — bind-mounted into the running container
- `category.csv` - Admin metadata file for courses
- `docker-compose.yml` - Compose used to run the application locally
- `Dockerfile` - Multi-stage build for production

## Dev vs Production
- Dev: Use the provided scripts and volumes to run in development mode with hot-reload.
- Production: Build the image and run without mounting source folders.

## Commands
See `COMMANDS.md` for a friendly reference for commonly used commands.

## Scripts
- `./scripts/start.sh` - Main entry point.
    - `./scripts/start.sh` - Build frontend & start Docker.
    - `./scripts/start.sh dev` - Start Vite dev server (HMR).
    - `./scripts/start.sh clean` - Deep clean & rebuild.
    - `./scripts/start.sh rebuild` - Rebuild Docker image (no cache).
    - `./scripts/start.sh logs` - Follow logs.
- `./scripts/stop.sh` - Stop the app.
- `./scripts/status.sh` - Check Docker status.
- `./scripts/backup.sh` - Create a timestamped backup in `../_backup`.
- `./scripts/clear.sh` - Stop containers, prune Docker, and delete `data/`.
- `./scripts/sync_only.sh` - Sync local files to remote server (no deploy).
- `./scripts/sync_and_deploy.sh` - Sync local files and optionally run remote deploy steps.
	- Flags:
		- `--include-compiled` — include compiled artifacts such as `backend/__pycache__` (normally excluded).
		- `--include-data` — include the `data/` folder in the sync (use with caution: may overwrite databases).

## Notes & Conventions
- Avoid checking in `node_modules`, backend virtual environments and large data files. Use `.gitignore`.
- Use relative volumes in Compose file (`./data:/app/data`) and provide a placeholder for host media folders (`/path/to/your/courses`).
- Scripts now derive `PROJECT_ROOT` from their own location to make them portable.
- Prefer using the `scripts/` tooling rather than ad-hoc commands for consistent behavior.

## Recent Features (automatically maintained)
<!-- FEATURES_SNIPPET_START -->
- 2025-12-01: Convert player to overlay/popup to preserve page context and make Back close the player (Player as Overlay) - commit: TBD
<!-- FEATURES_SNIPPET_END -->
