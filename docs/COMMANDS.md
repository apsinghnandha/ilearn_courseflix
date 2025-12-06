# iLearn CourseFlix - Command Reference

Note: Run these commands from the project root (`ilearn_courseflix/`)

## Most Used Commands

### Quick Actions
```bash
./scripts/start.sh          # Start the application
./scripts/stop.sh           # Stop the application
./scripts/status.sh         # Check status
./scripts/clear.sh          # Clear data (WARNING: deletes DB)
./scripts/backup.sh         # Create backup
```

### Restore Navbar
```bash
cp '/Users/ap/Developer/_backup/navbar.json' '/Users/ap/Developer/Proplexity_Projects/ilearn_courseflix/data'
```

### Pi Deployment
```bash
./scripts/prepare_pi_deploy.sh

ssh -p 8888 root@192.168.20.4 "rm -rf /home/ap/zcloud/apps/docker-compose/build/ilearn/*"

scp -P 8888 -rp ilearn_pi_deploy/. ap@192.168.20.4:/home/ap/zcloud/apps/docker-compose/build/ilearn/

ssh -t -p 8888 ap@192.168.20.4 "sudo docker container stop ilearn && sudo docker rm ilearn && sudo docker volume rm ilearn && sudo docker image rm ilearn/alpine:latest"

ssh -t -p 8888 ap@192.168.20.4 "sudo docker load -i /home/ap/zcloud/apps/docker-compose/build/ilearn/alpine.tar.gz && cd ~/zcloud/apps/docker-compose && sudo docker compose -f 3.2_media_manager.yml -p 3_2_media_manager up -d ilearn"

```

## 1. Quick Start & Development

The `start.sh` script is the main entry point for development and running the application. It handles frontend building and Docker management.

Make scripts executable first (if needed):
```bash
chmod +x scripts/*.sh
```

### Standard Start
Builds frontend and starts the application in Docker.
```bash
./scripts/start.sh
```

### Development Mode
Starts the Frontend Development Server (Vite) with Hot Module Replacement (HMR).
```bash
./scripts/start.sh dev
```

### Build Options
```bash
cd frontend && npm run build

./scripts/clear.sh
./scripts/start.sh

npm --prefix frontend run build

cd frontend && npm run build && cd .. && ./scripts/start.sh clean

# Rebuild Docker image (with cache) and start
./scripts/start.sh build

# Rebuild Docker image (NO cache) and start
./scripts/start.sh rebuild

# Deep clean (removes node_modules, dist, pycache), clean install dependencies, rebuild, and start
./scripts/start.sh clean

# Start and follow logs immediately
./scripts/start.sh logs
```

## 2. Management Scripts

### Stop Application
Stops the running Docker containers.
```bash
./scripts/stop.sh
```

### Check Status
Checks the status of the Docker containers.
```bash
./scripts/status.sh
```

### Clear Data
**WARNING**: This will delete the database and scanned data.
```bash
./scripts/clear.sh
```

### Backup
Creates a backup of the current state.
```bash
./scripts/backup.sh
```

## 3. Deployment / Sync

### Sync to Remote (Deploy)
Syncs files to the remote server and restarts the application there.
```bash
# Dry run (check what will happen)
./scripts/sync_and_deploy.sh --dry-run

# Apply changes
./scripts/sync_and_deploy.sh --apply

# Include compiled artifacts (remove __pycache__ exclusion)
./scripts/sync_and_deploy.sh --apply --include-compiled

# Include compiled artifacts AND data (use with caution)
./scripts/sync_and_deploy.sh --apply --include-compiled --include-data
```

### Sync Only (No Deploy)
Syncs files to the remote server without restarting the application.
```bash
# Dry run
./scripts/sync_only.sh --dry-run

# Apply changes
./scripts/sync_only.sh --apply
```

## 4. Docker Manual Commands (Reference)

If you prefer running Docker commands directly:

```bash
# Build and Run (Detached)
docker compose up -d --build

# Build with no cache (Clean build)
docker compose build --no-cache
docker compose up -d

# Stop
docker compose down

# View Logs
docker compose logs -f
```



sudo iotop -o
