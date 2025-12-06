#!/bin/bash

# ilearn.sh
# ---------------------
# Unified management script for iLearn CourseFlix.
# Combines functionality from start.sh, stop.sh, status.sh, and clear.sh.
#
# Usage:
#   ./scripts/ilearn.sh start               # Start"
#   ./scripts/ilearn.sh start logs          # Logs"
#   ./scripts/ilearn.sh dev                 # Dev server"
#   ./scripts/ilearn.sh build               # Rebuild"
#   ./scripts/ilearn.sh build logs
#   ./scripts/ilearn.sh rebuild             # Rebuild no-cache"
#   ./scripts/ilearn.sh rebuild logs
#   ./scripts/ilearn.sh stop                # Stop"
#   ./scripts/ilearn.sh status              # Status"
#   ./scripts/ilearn.sh clear               # Clear all"

            

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATA_DIR="$PROJECT_ROOT/data"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Helper functions
log_info() {
    echo -e "${GREEN}ℹ️  $1${NC}"
}

log_warn() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

check_docker() {
    if ! docker info > /dev/null 2>&1; then
        log_error "Docker is not running!"
        log_info "Starting Colima..."
        colima start
        sleep 5
        if ! docker info > /dev/null 2>&1; then
            log_error "Failed to start Docker/Colima"
            exit 1
        fi
    fi
    log_info "Docker is running"
}

# Main logic
COMMAND="${1:-help}"
SUBCOMMAND="${2:-}"
EXTRA="${3:-}"
FOLLOW_LOGS="false"

case "$COMMAND" in
    start|dev|build|rebuild)
        echo ""
        echo "====================================="
        echo "iLearn CourseFlix - Manager"
        echo "====================================="
        echo ""

        check_docker

        # Default mode is start, unless overridden
        MODE="start"
        
        # Handle top-level commands that map to modes
        if [ "$COMMAND" == "dev" ]; then MODE="dev"; fi
        if [ "$COMMAND" == "build" ]; then MODE="build"; fi
        if [ "$COMMAND" == "rebuild" ]; then MODE="rebuild"; fi

        # Handle subcommands if start was used
        if [ "$COMMAND" == "start" ]; then
            case "$SUBCOMMAND" in
                build) MODE="build" ;;
                rebuild) MODE="rebuild" ;;
                clean) MODE="clean" ;;
                dev) MODE="dev" ;;
                logs)
                    # Allow `./scripts/ilearn.sh start logs`
                    MODE="start"
                    FOLLOW_LOGS="true"
                    ;;
            esac
        fi

        # Check for logs argument in various positions
        if [ "$SUBCOMMAND" == "logs" ] || [ "$EXTRA" == "logs" ]; then
            FOLLOW_LOGS="true"
        fi

        # Enable Docker BuildKit
        export DOCKER_BUILDKIT=1
        export COMPOSE_DOCKER_CLI_BUILD=1

        cd "$PROJECT_ROOT"

        # DEV MODE
        if [ "$MODE" == "dev" ]; then
            log_info "Starting Frontend Dev Server (Vite)..."
            if [ -d "frontend" ]; then
                cd frontend
                [ ! -d "node_modules" ] && log_info "Installing dependencies..." && npm install
                npm run dev
            else
                log_error "Frontend directory not found!"
                exit 1
            fi
            exit 0
        fi

        # CLEAN MODE
        if [ "$MODE" == "clean" ]; then
            log_info "Cleaning artifacts..."
            rm -rf build/frontend frontend/node_modules frontend/.vite 2>/dev/null || true
            find backend -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
            find backend -type f -name "*.pyc" -delete 2>/dev/null || true
            log_info "Cleanup complete."
        fi

        # FRONTEND BUILD
        if [ "$MODE" == "build" ] || [ "$MODE" == "rebuild" ] || [ "$MODE" == "clean" ]; then
            log_info "Building Frontend..."
            if command -v npm >/dev/null 2>&1 && [ -d "frontend" ]; then
                pushd frontend > /dev/null
                if [ "$MODE" == "clean" ]; then
                    npm ci
                else
                    npm install
                fi
                npm run build
                popd > /dev/null
                log_info "Frontend built successfully."
            else
                log_warn "npm or frontend directory not found. Skipping frontend build."
            fi
        fi

        # DOCKER OPERATIONS
        if [ "$MODE" == "rebuild" ] || [ "$MODE" == "clean" ]; then
            log_info "Rebuilding Docker image (No Cache)..."
            docker compose build --no-cache
            docker compose down 2>/dev/null || true
            docker compose up -d
        elif [ "$MODE" == "build" ]; then
            log_info "Building and starting Docker containers..."
            docker compose up -d --build
        else
            log_info "Starting iLearn CourseFlix..."
            # If user requested logs, start in background so we can follow logs below
            if [ "$FOLLOW_LOGS" == "true" ]; then
                docker compose up -d
            else
                docker compose up
            fi
        fi

        if [ "$FOLLOW_LOGS" == "true" ] || [ "$MODE" == "logs" ]; then
            log_info "Following logs..."
            docker compose logs -f
        else
            echo ""
            echo "====================================="
            echo "✅ iLearn CourseFlix is running!"
            echo "====================================="
            echo ""
            echo "Access at: http://localhost:80"
            echo ""
            echo "Commands:"
            echo "  --- Core ---"
            echo "  ./scripts/ilearn.sh start           # Start application"
            echo "  ./scripts/ilearn.sh stop            # Stop application"
            echo "  ./scripts/ilearn.sh status          # Check status"
            echo ""
            echo "  --- Development ---"
            echo "  ./scripts/ilearn.sh dev             # Run frontend dev server (Vite)"
            echo "  ./scripts/ilearn.sh start logs      # Start and follow logs"
            echo ""
            echo "  --- Maintenance ---"
            echo "  ./scripts/ilearn.sh build           # Rebuild frontend & containers"
            echo "  ./scripts/ilearn.sh rebuild         # Force rebuild (no cache)"
            echo "  ./scripts/ilearn.sh clear           # DANGER: Clear all data & reset"
            echo ""
        fi
        ;;

    stop)
        log_info "Stopping iLearn CourseFlix..."
        cd "$PROJECT_ROOT"
        docker compose down
        log_info "iLearn CourseFlix stopped successfully!"
        ;;

    status)
        echo "====================================="
        echo "iLearn CourseFlix - Status Check"
        echo "====================================="
        echo ""

        echo "Docker Status:"
        if docker info > /dev/null 2>&1; then
            log_info "Docker is running"
        else
            log_error "Docker is not running"
            exit 1
        fi

        echo ""
        echo "Container Status:"
        cd "$PROJECT_ROOT"
        if docker compose ps | grep -q "ilearn.*Up"; then
            log_info "iLearn container is running"
            docker compose ps
            echo ""
            echo "Access at: http://localhost:80"
        else
            log_error "iLearn container is not running"
            echo ""
            echo "To start: ./scripts/ilearn.sh start"
        fi
        echo ""
        ;;

    clear)
        log_warn "WARNING: This will STOP all containers, REMOVE them, PRUNE all images/volumes,"
        log_warn "AND DELETE ALL DATA in $DATA_DIR and BUILD ARTIFACTS in $PROJECT_ROOT/build."
        read -p "Are you sure? (y/N) " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            log_info "Nuke mode engaged..."

            # Docker cleanup
            docker stop $(docker ps -aq) 2>/dev/null || true
            docker rm $(docker ps -aq) 2>/dev/null || true
            docker system prune -a --volumes -f
            log_info "Docker system cleared."

            # Data cleanup
            if [ -d "$DATA_DIR" ]; then
                log_info "Cleaning data directory..."
                rm -rf "$DATA_DIR"/*
                log_info "Data directory cleared."
            else
                log_warn "Data directory not found at $DATA_DIR"
            fi

            # Build artifacts cleanup
            BUILD_DIR="$PROJECT_ROOT/build"
            if [ -d "$BUILD_DIR" ]; then
                log_info "Cleaning build artifacts..."
                rm -rf "$BUILD_DIR"/*
                log_info "Build artifacts cleared."
            else
                log_warn "Build directory not found at $BUILD_DIR"
            fi
        else
            log_info "Cancelled."
        fi
        ;;

    help|*)
        echo "iLearn CourseFlix Management Script"
        echo ""
        echo "Commands:"
        echo "  --- Core ---"
        echo "  ./scripts/ilearn.sh start           # Start application"
        echo "  ./scripts/ilearn.sh stop            # Stop application"
        echo "  ./scripts/ilearn.sh status          # Check status"
        echo ""
        echo "  --- Development ---"
        echo "  ./scripts/ilearn.sh dev             # Run frontend dev server (Vite)"
        echo "  ./scripts/ilearn.sh start logs      # Start and follow logs"
        echo ""
        echo "  --- Maintenance ---"
        echo "  ./scripts/ilearn.sh build           # Rebuild frontend & containers"
        echo "  ./scripts/ilearn.sh rebuild         # Force rebuild (no cache)"
        echo "  ./scripts/ilearn.sh clear           # DANGER: Clear all data & reset"
        echo ""
        exit 0
        ;;
esac