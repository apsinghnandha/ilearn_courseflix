"""
utils.py
----------------
Small helper utilities used across the backend. Keep these helpers lightweight
and robust (exceptions are logged instead of raising so tasks can continue).
"""

import os
import subprocess
import logging

# Use the uvicorn logger for consistent server logs
logger = logging.getLogger("uvicorn")


def extract_thumbnail(video_path, output_path):
    """Extract a single thumbnail from a video using ffmpeg.

    Important notes:
    - This is a best-effort helper and logs on failure instead of raising.
    - We use a fixed seek position (5s) because it is usually safe for most
      content (not the first black frame) and it's quick.
    - For performance, this function should not be called in tight loops
      without rate-limiting: ffmpeg calls are expensive on low-power boards.
    """
    try:
        cmd = [
            'ffmpeg', '-y', '-ss', '00:00:05',
            '-i', video_path,
            '-vframes', '1',
            '-q:v', '2',
            output_path
        ]
        subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
        return True
    except Exception as e:
        logger.error(f"Failed to extract thumbnail for {video_path}: {e}")
        return False