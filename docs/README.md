# iLearn - Self-Hosted Course Manager

## Project Overview
iLearn is a self-hosted media server designed to manage and stream educational courses. It features a "Database-First" architecture where metadata is primarily driven by a CSV file (`category.csv`), synced to a SQLite database.

## Architecture
- **Backend**: FastAPI (Python) with SQLModel (SQLite).
- **Frontend**: React (Vite) with Mantine UI.
- **Deployment**: Docker Compose.
- **Media Scanning**: `scanner.py` handles file system scanning and CSV synchronization.

## Key Features & Logic (CRITICAL FOR NEXT AI)

### 1. Database-First & CSV Sync
- The system relies on `category.csv` as the source of truth for course metadata (Category, Sub-Category, Instructor, Title).
- **Multi-Category Support**: A single course (identified by Title + Instructor) can appear in multiple categories. The `scanner.py` aggregates these into a JSON list stored in the `all_categories` column in the database.
- **Sync Process**: On startup (or manual trigger), `scanner.py` reads `category.csv` and updates the database.

### 2. Logic Inversion (User Request)
**IMPORTANT**: The user requested specific logic that is "inverted" compared to standard naming conventions. **DO NOT FIX THIS** unless explicitly asked.
- **Availability**:
    - **UI "Available" (Yes)** maps to **DB `is_available = False`**.
    - **UI "Not Available" (No)** maps to **DB `is_available = True`**.
- **Green Ticks**: In the Course Manager UI, a green tick `✓` is shown when `is_available` is **False**.
- **Homepage Filtering**: The homepage only displays courses where `is_visible=True` AND `is_available=False` (which means "Available" to the user).

### 3. Hierarchical Structure
- **Category -> Sub-Category -> Course**.
- The Homepage and Stats page respect the order defined in `category.csv`.

## File Structure
- `backend/main.py`: Main API application. Handles requests, filtering, and serving the frontend.
- `backend/scanner.py`: Logic for scanning the file system for videos and syncing `category.csv` to the DB.
- `backend/models.py`: SQLModel database definitions (`Course`, `Video`).
- `frontend/src/App.jsx`: Main React component containing the UI logic (Homepage, Course Manager, Player).
- `category.csv`: The master list of course metadata.
- `Dockerfile`: Multi-stage build (Node.js for frontend, Python for backend).

## Migration & Setup Instructions

### 1. Prerequisites
- Docker and Docker Compose installed on the target machine.
- A folder containing your course media (e.g., `/nas/nas/Media/Courses/...`).

### 2. Installation
1.  **Copy Files**: Transfer the entire `ilearn` folder (containing `Dockerfile`, `backend/`, `frontend/`, `category.csv`) to the new machine.
2.  **Docker Compose**: Use the provided `docker-compose.yml` snippet or integrate it into your existing stack.
    ```yaml
    ilearn:
      build: ./ilearn  # Path to the folder
      container_name: ilearn
      restart: unless-stopped
      ports:
        - "80:8000" # Maps container port 8000 to host port 80
      volumes:
        - /path/to/your/courses:/courses # Mount your media here
        - ./data:/app/data # Persistent data (DB, cache)
        - ./ilearn/category.csv:/app/category.csv # Mount CSV for easy editing
    ```
3.  **Build & Run**:
    ```bash
    docker compose up -d --build ilearn
    ```

### 3. Configuration
- **Port**: The application runs on port `8000` inside the container. The example above maps it to port `80` on the host.
- **CSV**: Ensure `category.csv` is present and mounted. The format must be:
    ```csv
    "Category","Sub-Category","Instructor Name","Class Title"
    ```

## Troubleshooting
- **"Logic is upside down"**: Remember the inverted logic for `is_available`.
- **Missing Courses**: Check `category.csv` for exact Title/Instructor matches. The system uses these to link CSV rows to folders.
- **Logs**: Check container logs (`docker logs ilearn`) for scanner errors or CSV sync issues.
 - **Export / Backup file downloads**: The UI now prompts you to choose a location to save exported CSV files and backup ZIPs (uses the browser's File System Access API when available, otherwise falls back to the browser's Save dialog). If the browser automatically downloads to a default location, check your browser's download settings or run `npm run dev` and download from there.

---

## Migration / Context Prompt for AI Agent

If you are an AI agent picking up this project for migration or further development, please read the following context:

**Project Overview:**
"ilearn" is a self-hosted media server designed for streaming educational courses. It functions similarly to Netflix but for local video files organized by courses.

**Tech Stack:**
- **Backend:** Python 3.11, FastAPI, SQLModel (SQLite), FFmpeg (for frame extraction).
- **Frontend:** React 18, Vite, Mantine UI (v7), React Router.
- **Infrastructure:** Docker, Docker Compose.

**Key Features:**
- **Library Scanning:** Scans a root directory (`/courses`) for video files, extracts metadata, and generates thumbnails.
- **Course Management:** Supports organizing courses by Category, Sub-Category, and Instructor via a CSV mapping file (`category.csv`).
- **Playback:** Web-based video player with resume capability and progress tracking.
- **Deduplication:** Logic to handle duplicate courses (same title/instructor) by prioritizing "Available" (on disk) versions.

**Project Structure:**
- `/backend`: FastAPI application code (`main.py`, `scanner.py`, `models.py`).
- `/frontend`: React application source (`src/App.jsx`, `vite.config.js`).
- `Dockerfile`: Multi-stage build (Node.js build -> Python runtime).
- `category.csv`: Maps folder names/titles to categories.

**Current State (as of Nov 30, 2025):**
- The project is fully functional and running in Docker.
- Recent changes include:
    - UI: Added "Show Hidden Items" toggle and "Hide Duplicates" button in Settings.
    - Logic: Library stats now count unique courses only.
    - Cleanup: Removed unused scripts (`debug_csv.py`, `migrate_db.py`) and `node_modules`.
- The `node_modules` folder is excluded from the repo/build context (installed inside Docker).

**Migration Goal:**
[User to insert specific migration goal here, e.g., "Move to a new server", "Switch to PostgreSQL", "Refactor to Next.js"]

---

## Development Workflow & DevOps Notes (New Contributors)

This section documents the development workflow and recent DevOps updates so future contributors — or other AI assistants — can set up a fast, stable development environment when moving the project.

### Quick concepts and why they matter
- Build vs runtime: `COPY` in `Dockerfile` creates a build-time snapshot. Runtime volume mounts (like `./backend:/app`) override those snapshots so the container uses the live host files.
- Hot reload: The backend uses `uvicorn --reload` (set in `docker-compose.yml`) so code edits trigger an automatic restart in the running container. The frontend uses Vite for HMR or a build artifact in `/build/frontend` for static serving.
 - Build caching: `Dockerfile` uses BuildKit and `--mount=type=cache` for `npm`, `pip`, and `apt` to speed up rebuilds. Use `./scripts/start.sh rebuild` to enable BuildKit and re-run builds.
- Node 20: The frontend build stage uses `node:20-alpine` to address Node 18 vulnerabilities and keep packages secure.

### Dev vs Production
- Dev: Mount `./backend:/app` and `./build/frontend:/app/static` in the Compose file. Backend reloads in place; frontend is served from the `dist` folder. Prefer running `vite dev` for HMR during UI work.
- Production: Don't mount source folders; rely on the built image (the COPY snapshot) and run uvicorn without `--reload`.

### Quick start for development (recommended)
1. Ensure Node & npm are present on the host:
```bash
node -v && npm -v
```
2. If you plan to change the frontend UI with live reload:
```bash
./scripts/start.sh dev
```
```
That runs Vite's dev server with HMR on `5173`. You can configure a `frontend` service in `docker-compose.dev.yml` to run this in Docker.
3. For backend changes, keep the existing `docker-compose.yml` with:
```yaml
volumes:
    - ./backend:/app
command: uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```
This makes `uvicorn` reload automatically when files change.

### Build & serve static frontend in container (if not using HMR)
If you're using the container to serve the frontend `dist` folder, build locally and the container will serve the updated `dist` automatically:
```bash
cd frontend
npm ci
npm run build
# Then refresh your browser to see updated assets; container serves files from ./build/frontend
```

### Rebuild when required
Rebuild the container when you change build-time things:
- `Dockerfile` or image base changes
- `backend/requirements.txt` (Python deps)
- `frontend/package.json` (Node deps)

Use this to rebuild:
```bash
./scripts/start.sh rebuild
docker compose up -d --build
```

### File watch / reload caveats
- On macOS, Docker Desktop may sometimes delay file system notifications; if reload doesn't occur, check the container logs and manually restart uvicorn/container.
- If you change a dependency, mount `backend/` only for code — rebuild to pick up dependency changes inside the image or run the installation inside the container for quick iteration.

### Auto-Hide Duplicates on Startup
- The backend now automatically runs deduplication on startup to hide duplicate courses in the database. This mirrors the `Hide Duplicates` button in the UI and helps keep the library clean when the server is started or restarted.

### Optional: Running frontend dev server in Docker (not required)
> You said you don't want a separate `frontend` service — that's fine. The `ilearn` service can continue to serve the built `dist` files that live in `./build/frontend`. If you prefer to run the frontend dev server (Vite HMR) separately on your host for faster development, follow the local instructions below instead of running a `frontend` Compose service.

### Local dev alternatives (preferred if you do not want a separate `frontend` service)

1) Run Vite dev server locally (fast HMR) and point it to the backend API:
```bash
cd frontend
npm ci
npm run dev
```
Use the browser at `http://localhost:5173`. Configure `vite.config.js` to proxy `/api` to `http://localhost:8000` when running locally.

2) Rebuild `dist` automatically on frontend source changes and let Docker serve the static files (no separate service):
```bash
cd frontend
npm ci
npm run watch:build
```
This runs a file watcher (chokidar-cli) to run `npm run build` whenever files in `src/` change; because `./build/frontend` is mounted into the container (`- ./build/frontend:/app/static`), the backend serves the updated assets immediately without requiring a Docker image rebuild.

3) If you want to run both locally (host dev server + docker backend), ensure the Vite dev server proxies `/api` to `http://localhost:8000` in `vite.config.js`.

Reminder: The Docker `frontend` service (dev in container) is optional. Not running it keeps your `docker-compose.yml` simpler and still allows fast iteration with either `npm run dev` or `npm run watch:build`.

### Recommended checks after moving the project
1. Confirm Docker and BuildKit support (BuildKit speeds up builds with cache mounts).
2. Update host volume paths in `docker-compose.yml` to match your environment (e.g., media folder `/courses` and data persistence for `/app/data`).
3. Build once to create a validated image:
```bash
./scripts/start.sh rebuild
docker compose up -d
```
You can also run a full clean-and-build which clears build artifacts and re-runs the frontend build before rebuilding images:
```bash
./scripts/start.sh clean
```
4. If testing frontend builds, run `npm ci && npm run build` to populate `/build/frontend` (unless you use `vite dev`).

---

If you'd like, I can also add a `docker-compose.dev.yml` and a short `start-dev.sh` script to further streamline the HMR/dev experience and to provide a reference for other contributors who pick up the project.
