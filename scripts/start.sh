#!/bin/bash

# start.sh
# ---------------------
# Startup script for local development and deployment. The script provides
# convenience commands for development (vite dev server), normal startup
# (build frontend + Docker compose up), and advanced rebuild/clean options.
#
# It also checks that Docker is running and attempts to start Colima on macOS
# if Docker is not present. The script supports several modes: dev, build,
# rebuild, clean, logs.

set -e

echo "====================================="
echo "iLearn CourseFlix - Startup Script"
echo "====================================="
echo ""

# Check if Docker/Colima is running
echo "Checking if Docker is running..."
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running!"
    echo "Starting Colima..."
    colima start
    sleep 5
else
    echo "✅ Docker is running"
fi

# Check arguments
MODE="start"
if [ "$1" == "build" ]; then
    MODE="build"
elif [ "$1" == "rebuild" ]; then
    MODE="rebuild"
elif [ "$1" == "clean" ]; then
    MODE="clean"
elif [ "$1" == "dev" ]; then
    MODE="dev"
elif [ "$1" == "logs" ]; then
    MODE="logs"
fi

# Enable Docker BuildKit for faster builds
export DOCKER_BUILDKIT=1
export COMPOSE_DOCKER_CLI_BUILD=1

# Navigate to project directory (one level up from scripts)
cd "$(dirname "$0")/.."

# --- DEV MODE ---
if [ "$MODE" == "dev" ]; then
    echo ""
    echo "🎨 Starting Frontend Dev Server (Vite)..."
    if [ -d "frontend" ]; then
        cd frontend
        if [ ! -d "node_modules" ]; then
            echo "Installing dependencies..."
            npm install
        fi
        npm run dev
    else
        echo "❌ Frontend directory not found!"
        exit 1
    fi
    exit 0
fi

# --- CLEAN MODE ---
if [ "$MODE" == "clean" ]; then
    echo ""
    echo "🧹 Cleaning artifacts..."
    rm -rf build/frontend frontend/node_modules frontend/.vite || true
    find backend -type d -name "__pycache__" -exec rm -rf {} + || true
    find backend -type f -name "*.pyc" -delete || true
    echo "✅ Cleanup complete."
fi

# --- FRONTEND BUILD ---
echo ""
echo "📦 Building Frontend..."
if command -v npm >/dev/null 2>&1; then
    if [ -d "frontend" ]; then
        pushd frontend > /dev/null
        
        if [ "$MODE" == "clean" ]; then
            echo "Clean installing dependencies (npm ci)..."
            npm ci
        else
            echo "Installing dependencies (npm install)..."
            npm install
        fi
        
        echo "Building static assets..."
        npm run build
        popd > /dev/null
        echo "✅ Frontend built successfully."
    else
        echo "⚠️  Frontend directory not found. Skipping build."
    fi
else
    echo "⚠️  npm not found. Skipping frontend build."
fi

# --- DOCKER OPERATIONS ---
if [ "$MODE" == "rebuild" ] || [ "$MODE" == "clean" ]; then
    echo ""
    echo "🔄 Rebuilding Docker image (No Cache)..."
    docker compose build --no-cache
    echo "Stopping any existing container..."
    docker compose down 2>/dev/null || true
    echo "Starting iLearn CourseFlix..."
    docker compose up -d
elif [ "$MODE" == "build" ]; then
    echo ""
    echo "🔨 Building Docker image..."
    docker compose up -d --build
else
    echo ""
    echo "🚀 Starting iLearn CourseFlix..."
    docker compose up -d
fi

if [ "$MODE" == "logs" ]; then
    echo "📋 Following logs..."
    docker compose logs -f
else
    echo ""
    echo "====================================="
    echo "✅ iLearn CourseFlix is running!"
    echo "====================================="
    echo ""
    echo "Access the application at: http://localhost:80"
    echo ""
    echo "Usage:"
    echo "  ./scripts/start.sh          # Start the application (Builds frontend + Starts Docker)"
    echo "  ./scripts/start.sh dev      # Start Frontend Dev Server (Vite HMR)"
    echo "  ./scripts/start.sh build    # Rebuild Docker image (Cache) and start"
    echo "  ./scripts/start.sh rebuild  # Rebuild Docker image (No Cache) and start"
    echo "  ./scripts/start.sh clean    # Deep clean (rm node_modules), rebuild all, and start"
    echo "  ./scripts/start.sh logs     # Start and follow logs"
    echo ""
fi
