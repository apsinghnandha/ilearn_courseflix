#!/bin/bash

# status.sh
# ---------------------
# Checks that Docker is running and that the iLearn container is up. This
# can be used by developers to quickly validate the local environment or by
# a CI system to monitor container health.

echo "====================================="
echo "iLearn CourseFlix - Status Check"
echo "====================================="
echo ""

echo "Docker Status:"
if docker info > /dev/null 2>&1; then
    echo "✅ Docker is running"
else
    echo "❌ Docker is not running"
    exit 1
fi

echo ""
echo "Container Status:"
cd "$(dirname "$0")/.."
if docker compose ps | grep -q "ilearn.*Up"; then
    echo "✅ iLearn container is running"
    docker compose ps
    echo ""
    echo "Access the application at: http://localhost:80"
else
    echo "❌ iLearn container is not running"
    echo ""
    echo "To start: ./scripts/start.sh"
fi

echo ""
