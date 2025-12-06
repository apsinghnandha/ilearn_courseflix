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

## Development Volume Mappings
For efficient development with hot-reload:
- `./backend:/app` - Mounts backend source code for Python hot-reload
- `./frontend/dist:/app/static` - Mounts built frontend assets for serving static files
- `./data:/data` - Persistent data directory
- `./config/category.csv:/app/category.csv` - Configuration file

## Dev vs Production
- Dev: Use the provided scripts and volumes to run in development mode with hot-reload.
- Production: Build the image and run without mounting source folders.

## Build Optimization
The frontend build is optimized for performance with code splitting enabled. Large vendor libraries (Mantine UI, React, Icons) are separated into dedicated chunks to reduce initial bundle sizes and improve loading times.

## Commands
See `COMMANDS.md` for a friendly reference for commonly used commands.

## Scripts
- `./scripts/ilearn.sh` - Main management script.
    - `./scripts/ilearn.sh start` - Build frontend & start Docker.
    - `./scripts/ilearn.sh dev` - Start Vite dev server (HMR).
    - `./scripts/ilearn.sh clear` - Deep clean & rebuild.
    - `./scripts/ilearn.sh rebuild` - Rebuild Docker image (no cache).
    - `./scripts/ilearn.sh start logs` - Follow logs.
    - `./scripts/ilearn.sh stop` - Stop the app.
    - `./scripts/ilearn.sh status` - Check Docker status.
- `./scripts/backup.sh` - Create a timestamped backup in `../_backup`.
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
