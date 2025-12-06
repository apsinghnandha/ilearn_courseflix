# Changelog

All notable changes to this project will be documented in this file.

## [1.6] - 2025-12-03
### 🚀 Major Improvements
- **Docker Entrypoint**: Implemented dedicated entrypoint script (`docker-entrypoint.sh`) for proper CMD/ENTRYPOINT separation, improving signal handling and container flexibility.
- **Error Handling**: Enhanced `prepare_pi_deploy.sh` with comprehensive error checking, pre-validations, and failure-safe operations to prevent partial deployments.
- **Image Embedding**: Moved `VERSION` file into the Docker image instead of host mounting for better portability and consistency.

### 🛠️ Technical Enhancements
- **Linter Compliance**: Fixed `JSONArgsRecommended` warning by using exec-form CMD arrays and entrypoint script, ensuring proper OS signal handling.
- **Script Robustness**: Added strict bash options (`set -euo pipefail`), custom error functions, and cleanup traps in deployment scripts.
- **Configuration Variables**: Centralized remote deployment settings in `prepare_pi_deploy.sh` for easier maintenance.

### 📚 Documentation
- **Changelog Updates**: Added detailed v1.6 section documenting Docker and deployment improvements.

## [1.5] - 2025-12-03
### 🚀 Major Improvements
- **Docker Optimization**: Switched to Alpine Linux base image, reducing size by ~60% (from ~234MB to ~92MB) and build time by ~65%.
- **Pi Deployment**: Automated Pi deployment with compressed tar.gz exports, fixed permission issues for logging, and improved hardware acceleration support.
- **User Permissions**: Implemented proper user switching in containers using `su-exec` for secure non-root operation.
- **Build Automation**: Added `prepare_pi_deploy.sh` script for one-click image building, compression, and Pi transfer.

### 🛠️ Technical Enhancements
- **Image Compression**: Enabled gzip compression for Docker saves, reducing transfer size to ~88MB.
- **Volume Management**: Fixed named volume ownership issues on Pi with dynamic chown.
- **Cross-Platform Builds**: Improved ARM64 build support with Buildx for faster emulation.
- **File Organization**: Renamed Dockerfiles for better sorting (e.g., `Dockerfile.fast`, `Dockerfile_ffmpeg.fast`).

### 📚 Documentation
- **Command Reference**: Reorganized `COMMANDS.md` with most-used commands at the top for quick access.
- **Changelog**: Standardized naming (e.g., `VERSION` → `version.txt`, `CHANGELOG.md` → `changelog.md`).

### � Bug Fixes
- **Logging Permissions**: Resolved "Permission denied" errors for `/app/data/ilearn.log` on Pi deployments.
- **Volume Removal**: Corrected volume name in Pi cleanup commands (`ilearn_data` instead of `ilearn`).

## [1.0] - 2025-12-02
### Added
- **Versioning**: Added `VERSION` file in root and `docs/CHANGELOG.md` for tracking changes.
- **Settings**: Version number in Settings is now read-only and sourced from the `VERSION` file.
- **Course Manager**: 
    - Fixed "Unique" count display (was showing 0).
    - Fixed "Show Hidden Items" filter to correctly show duplicates.
    - Fixed "Availability" filter to correctly distinguish between available (on disk) and unavailable (CSV only) courses.
- **Backup/Restore**:
    - Implemented "Save As" dialog for Backups and CSV Exports using File System Access API.
    - Fixed Restore functionality to correctly handle file uploads and backend parameters.

### Fixed
- **Backend**: Corrected `backend/data` folder generation issue by updating Docker volume mounts.
- **API**: Fixed parameter mismatch (`availability` vs `is_available`) in `/api/courses`.

## [0.9] - 2025-11-30
### Initial Release
- Basic Course Management.
- Video Streaming.
- Metadata Scanning.
