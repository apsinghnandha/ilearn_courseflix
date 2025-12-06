#!/bin/bash

# Exit on any error, treat unset variables as errors, and fail on pipeline errors
set -euo pipefail

# Trap to clean up on exit (success or failure)
cleanup() {
    echo "Script exited. Cleaning up temporary files if needed."
    # Add any cleanup logic here if required
}
trap cleanup EXIT

# Configuration
REMOTE_HOST="192.168.20.4"
REMOTE_PORT="8888"
REMOTE_USER="ap"
REMOTE_PATH="/home/ap/zcloud/apps/docker-compose/build/ilearn"
COMPOSE_FILE="3.2_media_manager.yml"
PROJECT_NAME="3_2_media_manager"
IMAGE_NAME="ilearn/alpine"
DEPLOY_DIR="deploy/pi"

# Function to log errors and exit
error_exit() {
    echo "ERROR: $1" >&2
    exit 1
}

# Ensure deploy directory exists
mkdir -p "$DEPLOY_DIR" || error_exit "Failed to create deploy directory $DEPLOY_DIR"

# Remove old data in deploy directory
echo "Removing old data in $DEPLOY_DIR..."
rm -rf "$DEPLOY_DIR"/* || error_exit "Failed to clean $DEPLOY_DIR"

# Check if Docker image exists
if ! docker image inspect "$IMAGE_NAME" >/dev/null 2>&1; then
    error_exit "Docker image $IMAGE_NAME does not exist. Please build it first with: docker build -t $IMAGE_NAME -f docker/Dockerfile ."
fi

# Save the image to compressed tar.gz
echo "Saving Docker image $IMAGE_NAME to $DEPLOY_DIR/alpine.tar.gz..."
if ! docker save "$IMAGE_NAME" | gzip > "$DEPLOY_DIR/alpine.tar.gz"; then
    error_exit "Failed to save and compress Docker image"
fi
echo "Docker image saved successfully."

# Check if category.csv exists
if [[ ! -f "./config/category.csv" ]]; then
    error_exit "category.csv not found in config directory"
fi

# Copy category.csv
cp ./config/category.csv "$DEPLOY_DIR/category.csv" || error_exit "Failed to copy category.csv"
echo "category.csv copied successfully."

# Remove old deployment files from remote server
echo "Removing old deployment files from remote server..."
if ! ssh -p "$REMOTE_PORT" root@"$REMOTE_HOST" "rm -rf $REMOTE_PATH/*"; then
    error_exit "Failed to remove old files from remote server"
fi
echo "Old files removed from remote server."

# Copy new deployment files to remote server
echo "Copying new deployment files to remote server..."
if ! scp -P "$REMOTE_PORT" -rp "$DEPLOY_DIR"/. "$REMOTE_USER"@"$REMOTE_HOST":"$REMOTE_PATH"/; then
    error_exit "Failed to copy files to remote server"
fi
echo "Files copied to remote server successfully."

# Restart the remote container
echo "Restarting remote ilearn container..."
REMOTE_CMD="sudo docker container stop ilearn 2>/dev/null || true && \
            sudo docker rm ilearn 2>/dev/null || true && \
            sudo docker volume rm ilearn_data 2>/dev/null || true && \
            sudo docker image rm $IMAGE_NAME:latest 2>/dev/null || true && \
            sudo docker load -i $REMOTE_PATH/alpine.tar.gz && \
            cd ~/zcloud/apps/docker-compose && \
            sudo docker compose -f $COMPOSE_FILE -p $PROJECT_NAME up -d ilearn"

if ! ssh -t -p "$REMOTE_PORT" "$REMOTE_USER"@"$REMOTE_HOST" "$REMOTE_CMD"; then
    error_exit "Failed to restart remote container"
fi

echo "Remote server ilearn container restarted successfully with new image."