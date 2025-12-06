#!/bin/bash

# stop.sh
# ---------------------
# Stop local containers for the iLearn application using docker compose.
# Run this script in development or on the host where the compose file is
# present; it simply runs `docker compose down` to stop and remove the
# containers.

echo "Stopping iLearn CourseFlix..."
cd "$(dirname "$0")/.."
docker compose down

echo "✅ iLearn CourseFlix stopped successfully!"
