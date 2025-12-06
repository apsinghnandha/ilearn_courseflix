FROM node:20-alpine AS frontend-build
WORKDIR /frontend
# Cache package.json first to take advantage of Docker layer caching
COPY frontend/package*.json ./
# Use cache mount for faster npm installs
RUN --mount=type=cache,target=/root/.npm npm ci
COPY frontend/ .
# Build static frontend assets (Vite)
RUN npm run build

FROM python:3.11-alpine
WORKDIR /app
# Server image: Python runtime with ffmpeg installed so the server can
# generate thumbnails and transcode as needed. For build-time performance
# the Dockerfile uses cache mounts for apk and pip caches when supported.
RUN apk add --no-cache ffmpeg su-exec

COPY backend/requirements.txt .
# Use a pip cache mount to speed up repeated builds
RUN --mount=type=cache,target=/root/.cache/pip pip install -r requirements.txt

COPY backend/ .
COPY category.csv .
COPY VERSION /app/VERSION
COPY --from=frontend-build /frontend/dist /app/static

# Entrypoint script for chown + su-exec (fixes JSONArgsRecommended warning)
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 8000
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]