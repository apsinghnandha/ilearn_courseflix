"""
main.py
-----------------------------------------------------------------------------
FastAPI Application Entrypoint for iLearn Media Server
-----------------------------------------------------------------------------
This module serves as the central hub for the backend application. It initializes
the FastAPI app, configures logging, sets up database connections, and defines
the API endpoints used by the frontend.

Key Responsibilities:
1.  **App Initialization**: Sets up FastAPI with CORS middleware and static file serving.
2.  **Database Management**: Handles database migrations and session management via SQLModel.
3.  **Background Tasks**: Manages background scanning of the media library to keep the UI responsive.
4.  **API Endpoints**:
    -   `/api/courses`: CRUD operations for courses.
    -   `/api/stream`: Video streaming with support for range requests and disconnect handling.
    -   `/api/settings`: System configuration, logs, and backups.
    -   `/api/scan`: Triggers for library scanning.
5.  **Logging**: Configures rotating file logs and console output for debugging.

Usage:
    Run this file using Uvicorn:
    `uvicorn main:app --host 0.0.0.0 --port 8000 --reload`
"""

import os
import logging
from logging.handlers import RotatingFileHandler
import json
from datetime import datetime
from fastapi import FastAPI, Depends, HTTPException, BackgroundTasks, Request, UploadFile, File, Form
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, Response, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
import threading
from sqlmodel import SQLModel, Session, select, text, or_
from collections import defaultdict
import asyncio
import zipfile
import io
import csv
import shutil
import math
import hashlib
from typing import List, Dict, Any

from database import engine, get_session, DATA_PATH
from models import Course, Video
from pydantic import BaseModel
from scanner import run_scan, load_category_map, SCAN_STATUS, sync_csv_to_db

# Configure logging
LOG_FILE = os.path.join(DATA_PATH, "ilearn.log")
os.makedirs(DATA_PATH, exist_ok=True)

# Setup Root Logger
root_logger = logging.getLogger()
root_logger.setLevel(logging.INFO)
root_logger.handlers = [] # Clear existing handlers

formatter = logging.Formatter("%(asctime)s [%(levelname)s] %(name)s: %(message)s")

# File Handler
file_handler = RotatingFileHandler(LOG_FILE, maxBytes=10*1024*1024, backupCount=5)
file_handler.setFormatter(formatter)
root_logger.addHandler(file_handler)

# Stream Handler (Console)
stream_handler = logging.StreamHandler()
stream_handler.setFormatter(formatter)
root_logger.addHandler(stream_handler)

# Configure Uvicorn Logging to propagate to root
for logger_name in ["uvicorn", "uvicorn.access", "uvicorn.error"]:
    log = logging.getLogger(logger_name)
    log.handlers = []
    log.propagate = True

logger = logging.getLogger("ilearn")
HDD_LOG_TAG = "[HDD ACCESS]"


def log_hdd_access(message: str):
    """Emit a standardized log entry for physical disk reads."""
    logger.info(f"{HDD_LOG_TAG} {message}")

app = FastAPI()

# Config handling
CONFIG_FILE = os.path.join(DATA_PATH, "config.json")
CSV_FILE = os.path.join(DATA_PATH, "category.csv")
VERSION_FILE = "/app/VERSION"

def get_app_version():
    try:
        if os.path.exists(VERSION_FILE):
            with open(VERSION_FILE, "r") as f:
                return f.read().strip()
    except:
        pass
    return "1.0.0"

DEFAULT_CONFIG = {
    "server_name": "iLearn Media Server",
    "version": get_app_version(),
    "player_defaults": {
        "autoplay": False,
        "default_speed": 1.0,
        "subtitle_size": "medium"
    }
}

def ensure_csv_exists():
    # Check for host mounted CSV first
    host_csv = "/app/category.csv"
    if os.path.exists(host_csv):
        logger.info(f"Found host CSV at {host_csv}. Syncing to {CSV_FILE}...")
        try:
            shutil.copy2(host_csv, CSV_FILE)
            logger.info("CSV sync successful.")
        except Exception as e:
            logger.error(f"Failed to copy host CSV: {e}")
    else:
        logger.warning(f"Host CSV not found at {host_csv}. Will use existing data or create default.")

    if not os.path.exists(CSV_FILE):
        logger.info(f"Creating new CSV file at {CSV_FILE}")
        try:
            with open(CSV_FILE, 'w', newline='', encoding='utf-8') as f:
                writer = csv.writer(f)
                writer.writerow(["Category", "Sub-Category", "Artist", "Title", "Carousel Info", "Available", "Visible"])
        except Exception as e:
            logger.error(f"Failed to create CSV file: {e}")

def load_config():
    ensure_csv_exists()
    
    # Always get the true version from file
    current_version = get_app_version()
    
    if not os.path.exists(CONFIG_FILE):
        config = DEFAULT_CONFIG.copy()
        config["version"] = current_version
        save_config(config)
        return config
    try:
        with open(CONFIG_FILE, 'r') as f:
            config = json.load(f)
            # Force version update from file
            config["version"] = current_version
            return config
    except:
        return DEFAULT_CONFIG

def save_config(config):
    with open(CONFIG_FILE, 'w') as f:
        json.dump(config, f, indent=4)

NAVBAR_FILE = os.path.join(DATA_PATH, "navbar.json")
DEFAULT_NAVBAR = []

def load_navbar_config():
    if not os.path.exists(NAVBAR_FILE):
        save_navbar_config(DEFAULT_NAVBAR)
        return DEFAULT_NAVBAR
    try:
        with open(NAVBAR_FILE, 'r') as f:
            data = json.load(f)
            # Migration: If it's a dict, convert to list
            if isinstance(data, dict):
                new_list = []
                for k, v in data.items():
                    new_list.append({"name": k, "categories": v})
                save_navbar_config(new_list)
                return new_list
            return data
    except:
        return DEFAULT_NAVBAR

def save_navbar_config(config):
    with open(NAVBAR_FILE, 'w') as f:
        json.dump(config, f, indent=4)

class LogRequest(BaseModel):
    message: str
    level: str = "error"
    context: dict = {}

class ProgressUpdate(BaseModel):
    time: int

@app.get("/api/scan/status")
def get_scan_status():
    return SCAN_STATUS

@app.post("/api/log")
def log_frontend_error(log: LogRequest):
    # Format context for readability
    ctx_parts = []
    for k, v in log.context.items():
        if k == "position":
            # Format seconds to MM:SS
            m, s = divmod(int(v), 60)
            h, m = divmod(m, 60)
            time_str = f"{h}:{m:02d}:{s:02d}" if h > 0 else f"{m}:{s:02d}"
            ctx_parts.append(f"Time: {time_str}")
        else:
            ctx_parts.append(f"{k}: {v}")
    
    ctx_str = " | ".join(ctx_parts)
    msg = f"FRONTEND {log.level.upper()}: {log.message} [{ctx_str}]"
    
    if log.level == "error":
        logger.error(msg)
    elif log.level == "warn":
        logger.warning(msg)
    else:
        logger.info(msg)
    return {"status": "logged"}

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def on_startup():
    SQLModel.metadata.create_all(engine)
    # Migration: Add new columns if they don't exist
    with Session(engine) as session:
        try:
            session.exec(text("ALTER TABLE course ADD COLUMN is_visible BOOLEAN DEFAULT 1"))
            logger.info("Added is_visible column to course table")
        except Exception:
            pass # Column likely exists
            
        try:
            session.exec(text("ALTER TABLE course ADD COLUMN carousel_info VARCHAR"))
            logger.info("Added carousel_info column to course table")
        except Exception:
            pass # Column likely exists

        try:
            session.exec(text("ALTER TABLE course ADD COLUMN all_categories VARCHAR DEFAULT '[]'"))
            logger.info("Added all_categories column to course table")
        except Exception:
            pass

    # Run initial scan in a background thread to prevent startup hang.
    # This ensures the API and UI are available immediately, while the
    # scanner discovers new media in the background. Use `trigger_scan`
    # to start scans on demand from the UI.
    def initial_scan():
        logger.info("Starting initial background scan...")
        with Session(engine) as session:
            run_scan(session, mode="quick")
            try:
                # Ensure duplicates are hidden on startup
                deduplicate_courses(session)
                logger.info("Deduplication completed during startup")
            except Exception as e:
                logger.error(f"Deduplication on startup failed: {e}")

    thread = threading.Thread(target=initial_scan)
    thread.daemon = True
    thread.start()

@app.get("/api/frames/h/{file_hash}")
def get_video_frame_by_hash(file_hash: str):
    cache_dir = os.path.join(DATA_PATH, "cache/frames")
    hash_path = os.path.join(cache_dir, f"{file_hash}.jpg")
    if os.path.exists(hash_path):
        # Cache for 1 year, as hash is unique to file path
        return FileResponse(hash_path, media_type="image/jpeg", headers={"Cache-Control": "public, max-age=31536000"})
    return Response(status_code=204)

@app.get("/api/frames/{video_id}")
def get_video_frame(video_id: int, session: Session = Depends(get_session)):
    cache_dir = os.path.join(DATA_PATH, "cache/frames")
    
    # Use Hash-based lookup only to prevent ID collisions
    video = session.get(Video, video_id)
    if video and video.course:
        full_path = os.path.join(video.course.path, video.filename)
        # Use MD5 of full path for stability
        file_hash = hashlib.md5(full_path.encode('utf-8')).hexdigest()
        hash_path = os.path.join(cache_dir, f"{file_hash}.jpg")
        if os.path.exists(hash_path):
            return FileResponse(hash_path, media_type="image/jpeg", headers={"Cache-Control": "no-cache"})

    # If frame is missing, respond with 204 so frontend doesn't spam errors
    return Response(status_code=204)

@app.get("/api/cover/{course_id}")
def get_course_cover(course_id: int, session: Session = Depends(get_session)):
    # 1. Try cached cover
    cache_dir = os.path.join(DATA_PATH, "cache/covers")
    if not os.path.exists(cache_dir):
        os.makedirs(cache_dir, exist_ok=True)
        
    cached_path = os.path.join(cache_dir, f"{course_id}.jpg")
    if os.path.exists(cached_path):
        return FileResponse(cached_path, media_type="image/jpeg", headers={"Cache-Control": "no-cache"})
    
    # 2. Fallback to HDD if not cached (and cache it)
    course = session.get(Course, course_id)
    if course and course.cover_path:
        full_path = os.path.join("/courses", course.cover_path)
        if os.path.exists(full_path):
            log_hdd_access(f"Serving cover for course {course_id} \"{course.title}\" \"{full_path}\"")
            # Cache it
            try:
                import shutil
                shutil.copy2(full_path, cached_path)
            except Exception as e:
                logger.error(f"Failed to cache cover for {course_id}: {e}")
            
            return FileResponse(full_path)
            
    raise HTTPException(404)

@app.get("/api/homepage")
def get_homepage_data(session: Session = Depends(get_session)):
    # Refactored: Filter Visible AND Available (is_available=True)
    courses = session.exec(select(Course).where(Course.is_visible == True, Course.is_available == True)).all()
    
    # Load CSV to determine sort order
    cat_map = load_category_map()
    # Create ordered lists for categories and subcategories
    category_order = []
    subcategory_order = defaultdict(list)
    
    seen_cats = set()
    for item in cat_map:
        c = item["category"]
        s = item["sub_category"]
        if c not in seen_cats:
            category_order.append(c)
            seen_cats.add(c)
        if s not in subcategory_order[c]:
            subcategory_order[c].append(s)

    # Structure: Category -> SubCategory -> Courses
    data = defaultdict(lambda: defaultdict(list))
    
    for c in courses:
        # Find last watched video
        resume_id = None
        last_watched_ts = None
        try:
            watched_videos = [v for v in c.videos if v.last_watched is not None]
            if watched_videos:
                last_watched_video = sorted(watched_videos, key=lambda v: v.last_watched, reverse=True)[0]
                resume_id = last_watched_video.id
                last_watched_ts = last_watched_video.last_watched.isoformat()
            elif any(v.progress > 0 for v in c.videos):
                 # Fallback if last_watched is null but progress exists
                 started = [v for v in c.videos if v.progress > 0]
                 if started: 
                     resume_id = started[0].id
        except Exception as e:
            logger.error(f"Error calculating resume video for course {c.id}: {e}")

        # Simple grouping (one course per category now)
        data[c.category][c.sub_category].append({
            "id": c.id,
            "title": c.title,
            "instructor": c.instructor,
            "cover_path": f"/api/cover/{c.id}",
            "resume_video_id": resume_id,
            "last_watched": last_watched_ts,
            "carousel_info": c.carousel_info
        })
    
    result = []
    
    # Helper to process a category
    def process_category(cat_name):
        if cat_name not in data: return None
        
        subcats = data[cat_name]
        sub_cat_list = []
        
        # Sort subcategories: CSV order first, then others alphabetically
        defined_subs = subcategory_order.get(cat_name, [])
        existing_subs = list(subcats.keys())
        sorted_subs = [s for s in defined_subs if s in existing_subs] + \
                      sorted([s for s in existing_subs if s not in defined_subs])
        
        for sub in sorted_subs:
            # Sort courses by title (or maybe we should use CSV order for courses too? 
            # For now alphabetical title is standard)
            course_list = sorted(subcats[sub], key=lambda x: x['title'])
            sub_cat_list.append({"name": sub, "courses": course_list})
            
        return {"category": cat_name, "sub_categories": sub_cat_list}

    # 1. Add categories from CSV order
    for cat in category_order:
        res = process_category(cat)
        if res: result.append(res)
        
    # 2. Add any remaining categories not in CSV (e.g. Uncategorized)
    existing_cats = list(data.keys())
    remaining = [c for c in existing_cats if c not in category_order]
    for cat in sorted(remaining):
        res = process_category(cat)
        if res: result.append(res)
    
    return result

@app.get("/api/media/{file_path:path}")
def serve_media(file_path: str):
    full_path = os.path.join("/courses", file_path)
    if not os.path.exists(full_path) or os.path.isdir(full_path):
         raise HTTPException(status_code=404)
    log_hdd_access(f"Serving media \"{full_path}\"")
    return FileResponse(full_path)

import json

@app.get("/api/course/{course_id}")
def get_course_details(course_id: int, session: Session = Depends(get_session)):
    course = session.get(Course, course_id)
    if not course: raise HTTPException(404)
    videos = sorted(course.videos, key=lambda v: v.filename)
    
    # Try to load metadata.json
    meta = {}
    if course.path:
        meta_path = os.path.join(course.path, "metadata.json")
        if os.path.exists(meta_path):
            try:
                with open(meta_path, 'r') as f:
                    meta = json.load(f)
            except Exception as e:
                logger.error(f"Failed to load metadata for course {course_id}: {e}")

    video_list = []
    for v in videos:
        v_data = v.dict()
        # Use cached subtitle path from DB if available
        if v.subtitle_path:
             v_data['subtitle'] = f"/api/media/{v.subtitle_path}"
        else:
             v_data['subtitle'] = None
             
        # Generate hash-based frame URL
        if course.path:
            full_path = os.path.join(course.path, v.filename)
            file_hash = hashlib.md5(full_path.encode('utf-8')).hexdigest()
            v_data['frame'] = f"/api/frames/h/{file_hash}"
        else:
            v_data['frame'] = f"/api/frames/{v.id}" # Fallback

        v_data['duration'] = v.duration
        v_data['progress'] = v.progress
        v_data['last_watched'] = v.last_watched
        video_list.append(v_data)

    return {
        "id": course.id, 
        "title": course.title, 
        "category": course.category, 
        "sub_category": course.sub_category,
        "instructor": course.instructor,
        "description": meta.get("description", ""),
        "year": meta.get("year", ""),
        "rating": meta.get("rating", ""),
        "cover_path": f"/api/cover/{course.id}",
        "carousel_info": course.carousel_info,
        "videos": video_list
    }

class CourseUpdate(BaseModel):
    is_visible: bool = None
    is_available: bool = None
    carousel_info: str = None
    category: str = None
    sub_category: str = None
    title: str = None
    instructor: str = None

@app.get("/api/courses")
def manage_courses(
    page: int = 1, 
    limit: int = 50, 
    search: str = "", 
    category: str = "",
    sub_category: str = "",
    instructor: str = "",
    title: str = "",
    is_available: str = "yes",
    hide_duplicates: bool = True,
    show_hidden: bool = False,
    session: Session = Depends(get_session)
):
    # If frontend requests to show hidden items, disable deduplication
    if show_hidden:
        hide_duplicates = False

    query = select(Course)
    
    if search:
        query = query.where(or_(
            Course.title.ilike(f"%{search}%"),
            Course.instructor.ilike(f"%{search}%")
        ))
    if category and category != "All":
        query = query.where(Course.category == category)
    if sub_category and sub_category != "All":
        query = query.where(Course.sub_category == sub_category)
    if instructor and instructor != "All":
        query = query.where(Course.instructor == instructor)
    if title and title != "All":
        query = query.where(Course.title == title)
        
    if is_available == "yes":
        # Refactored: User requested "Available" -> is_available=True
        query = query.where(Course.is_available == True)
    elif is_available == "no":
        # Refactored: User requested "Not Available" -> is_available=False
        query = query.where(Course.is_available == False)
        
    # Count total
    courses_all = session.exec(query).all()
    
    # Calculate unique entries (Title + Instructor)
    unique_keys = set()
    for c in courses_all:
        unique_keys.add((c.title, c.instructor))
    unique_count = len(unique_keys)
    
    # Filter duplicates if requested
    if hide_duplicates:
        # Keep only ONE course per (Title, Instructor)
        # Preference: Available (False) > Has Path > ID
        groups = defaultdict(list)
        for c in courses_all:
            groups[(c.title, c.instructor)].append(c)
            
        filtered_courses = []
        for key, group in groups.items():
            if len(group) == 1:
                filtered_courses.append(group[0])
            else:
                # Sort to find the best one to keep
                # Refactored: Sort by Available (True) first. Since False < True, we use 'not x.is_available' (False < True) 
                # Wait: True (Available) should be first. 
                # not True = False. not False = True. 
                # So False comes before True. So Available comes first.
                group.sort(key=lambda x: (not x.is_available, not x.path, x.id))
                filtered_courses.append(group[0])
        
        courses_all = filtered_courses
    
    total = len(courses_all)
    
    # Sort by CSV order
    try:
        cat_map = load_category_map()
        # Create a lookup for sort order: (Category, Sub-Category, Title) -> Index
        # We use a tuple key for uniqueness
        sort_map = {}
        for idx, item in enumerate(cat_map):
            key = (
                item.get("category", "").strip(), 
                item.get("sub_category", "").strip(), 
                item.get("title", "").strip()
            )
            sort_map[key] = idx
            
        def get_sort_key(course):
            # Try to find in map
            key = (course.category.strip(), course.sub_category.strip(), course.title.strip())
            if key in sort_map:
                return sort_map[key]
            return 999999 # Put at end if not in CSV

        courses_all.sort(key=get_sort_key)
    except Exception as e:
        logger.error(f"Sorting failed: {e}")
        # Fallback to title sort
        courses_all.sort(key=lambda x: x.title)
    
    # Paginate
    start = (page - 1) * limit
    end = start + limit
    paginated = courses_all[start:end]

    # Calculate global unique options (for filters and autocomplete)
    # We fetch all courses to get complete lists for filters
    all_courses_raw = session.exec(select(Course)).all()
    all_categories = sorted(list(set(c.category for c in all_courses_raw if c.category)))
    all_sub_categories = sorted(list(set(c.sub_category for c in all_courses_raw if c.sub_category)))
    all_instructors = sorted(list(set(c.instructor for c in all_courses_raw if c.instructor)))
    all_titles = sorted(list(set(c.title for c in all_courses_raw if c.title)))
    
    filter_options = {
        "categories": all_categories,
        "subCategories": all_sub_categories,
        "instructors": all_instructors,
        "titles": all_titles
    }
    
    return {
        "total": total,
        "unique_count": unique_count,
        "page": page,
        "limit": limit,
        "total_pages": math.ceil(total / limit),
        "courses": paginated,
        "filter_options": filter_options,
        "all_unique_options": filter_options
    }

@app.patch("/api/courses/{course_id}")
def update_course(course_id: int, update: CourseUpdate, session: Session = Depends(get_session)):
    course = session.get(Course, course_id)
    if not course: raise HTTPException(404)
    
    update_data = update.dict(exclude_unset=True)
    
    # Check if carousel_info is being updated to propagate to duplicates
    new_carousel_info = update_data.get("carousel_info")

    for key, value in update_data.items():
        setattr(course, key, value)
        
    session.add(course)
    
    # Propagate carousel_info to all duplicate courses (same Title + Instructor)
    if new_carousel_info is not None:
        duplicates = session.exec(
            select(Course).where(
                Course.title == course.title,
                Course.instructor == course.instructor,
                Course.id != course.id
            )
        ).all()
        for dup in duplicates:
            dup.carousel_info = new_carousel_info
            session.add(dup)

    session.commit()
    session.refresh(course)
    return course

class CourseCreate(BaseModel):
    title: str
    category: str = "Uncategorized"
    sub_category: str = "General"
    instructor: str = ""
    carousel_info: str = ""
    # Refactored: Default to False (Not Available) for manual creation
    is_available: bool = False
    is_visible: bool = True

@app.post("/api/courses")
def create_course(course_data: CourseCreate, session: Session = Depends(get_session)):
    course = Course(**course_data.dict())
    session.add(course)
    session.commit()
    session.refresh(course)
    return course

@app.delete("/api/courses/{course_id}")
def delete_course(course_id: int, session: Session = Depends(get_session)):
    course = session.get(Course, course_id)
    if not course: raise HTTPException(404)
    
    # Delete associated videos
    for video in course.videos:
        session.delete(video)
        
    session.delete(course)
    session.commit()
    return {"status": "deleted"}

@app.post("/api/courses/deduplicate")
def deduplicate_courses(session: Session = Depends(get_session)):
    courses = session.exec(select(Course)).all()
    groups = defaultdict(list)
    for c in courses:
        groups[(c.title, c.instructor)].append(c)
        
    count = 0
    for key, group in groups.items():
        if len(group) > 1:
            # Refactored: Sort: Available (True) first. (not True = False, which comes first)
            group.sort(key=lambda x: (not x.is_available, not x.path, x.id))
            
            # Keep first visible, others invisible
            for c in group[1:]:
                if c.is_visible:
                    c.is_visible = False
                    session.add(c)
                    count += 1
                    
    session.commit()
    return {"status": "deduplicated", "hidden_count": count}

@app.post("/api/courses/import")
async def import_courses_csv(file: UploadFile = File(...), session: Session = Depends(get_session)):
    if not file.filename.endswith(".csv"):
        raise HTTPException(400, "File must be a CSV")
    
    # Save to /app/data/category.csv
    dest_path = CSV_FILE
    try:
        content = await file.read()
        with open(dest_path, "wb") as f:
            f.write(content)
            
        # Run sync
        sync_csv_to_db(session, dest_path)
        
        return {"status": "Imported and Synced"}
    except Exception as e:
        logger.error(f"Import failed: {e}")
        raise HTTPException(500, f"Import failed: {e}")

@app.get("/api/courses/export")
def export_courses_csv(session: Session = Depends(get_session)):
    courses = session.exec(select(Course)).all()
    
    # Generate CSV
    output = io.StringIO()
    writer = csv.writer(output)
    
    # Headers
    writer.writerow(["Category", "Sub-Category", "Artist", "Title", "Carousel Info", "Available", "Visible"])
    
    for c in courses:
        writer.writerow([
            c.category,
            c.sub_category,
            c.instructor,
            c.title,
            c.carousel_info or "",
            "true" if c.is_available else "false",
            "true" if c.is_visible else "false"
        ])
        
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=courses_export.csv"}
    )

@app.get("/api/stream/{video_id}")
async def stream_video(video_id: int, request: Request):
    """Stream video with client disconnect detection to stop disk reads immediately.

    Implementation details:
    - Uses small chunk sizes and checks client connection status on each
        iteration to stop disk reads as soon as a client disconnects.
    - Supports Range requests for seeking (returns 206 when Range header is
        present). Content-Length and Content-Range headers are set accordingly.
    - All disk reads for streaming are logged with `log_hdd_access` so
        HDD usage can be correlated with UI actions.
    """
    with Session(engine) as session:
        video = session.get(Video, video_id)
        if not video or not video.is_downloaded:
            logger.error(f"Video not found or not downloaded: ID {video_id}")
            raise HTTPException(404)

        file_path = os.path.join(video.course.path, video.filename)
        course_title = video.course.title

    if not os.path.exists(file_path):
        logger.error(f"File not found on disk: {file_path} (Video ID: {video_id})")
        raise HTTPException(404, detail="File not found on disk")

    file_size = os.path.getsize(file_path)
    
    # Parse Range header for partial content requests
    range_header = request.headers.get("range")
    start = 0
    end = file_size - 1
    
    if range_header:
        range_str = range_header.replace("bytes=", "")
        range_parts = range_str.split("-")
        if range_parts[0]:
            start = int(range_parts[0])
        if len(range_parts) > 1 and range_parts[1]:
            end = int(range_parts[1])
    
    chunk_size = 64 * 1024  # 64KB chunks
    
    async def stream_with_disconnect_check():
        """Generator that stops reading when client disconnects."""
        bytes_read = 0
        log_hdd_access(f"START streaming video ID {video_id} \"{course_title}\" \"{file_path}\" (range: {start}-{end})")
        
        try:
            with open(file_path, "rb") as video_file:
                video_file.seek(start)
                remaining = end - start + 1
                
                while remaining > 0:
                    # Check if client disconnected
                    if await request.is_disconnected():
                        logger.info(f"[CLIENT DISCONNECTED] Stopped streaming video ID {video_id} after {bytes_read} bytes")
                        break
                    
                    chunk = video_file.read(min(chunk_size, remaining))
                    if not chunk:
                        break
                    
                    bytes_read += len(chunk)
                    remaining -= len(chunk)
                    yield chunk
                    
                    # Small delay to allow disconnect check
                    await asyncio.sleep(0.001)
                
                if remaining == 0:
                    log_hdd_access(f"COMPLETED streaming video ID {video_id}: {bytes_read} bytes")
                else:
                    logger.info(f"[STREAM STOPPED] Video ID {video_id}: {bytes_read}/{end-start+1} bytes")
                    
        except Exception as e:
            logger.error(f"Stream error for video ID {video_id}: {e}")
    
    headers = {
        "Accept-Ranges": "bytes",
        "Content-Type": "video/mp4",
        "Cache-Control": "no-store, no-cache, must-revalidate",
    }
    
    if range_header:
        headers["Content-Range"] = f"bytes {start}-{end}/{file_size}"
        headers["Content-Length"] = str(end - start + 1)
        return StreamingResponse(
            stream_with_disconnect_check(),
            status_code=206,
            headers=headers
        )
    else:
        headers["Content-Length"] = str(file_size)
        return StreamingResponse(
            stream_with_disconnect_check(),
            headers=headers
        )

@app.post("/api/progress/{video_id}")
def update_progress(video_id: int, update: ProgressUpdate, session: Session = Depends(get_session)):
    video = session.get(Video, video_id)
    if not video: raise HTTPException(404)
    video.progress = update.time
    video.last_watched = datetime.utcnow()
    session.add(video)
    session.commit()
    return {"status": "updated", "progress": video.progress}

@app.post("/api/history/clear/{course_id}")
def clear_course_history(course_id: int, session: Session = Depends(get_session)):
    course = session.get(Course, course_id)
    if not course: raise HTTPException(404)
    
    for video in course.videos:
        video.progress = 0
        video.last_watched = None
        session.add(video)
        
    session.commit()
    return {"status": "cleared"}

def run_scan_background(mode: str):
    with Session(engine) as session:
        run_scan(session, mode=mode)

@app.post("/api/scan")
def trigger_scan(background_tasks: BackgroundTasks, mode: str = "quick"):
    """Trigger a background library scan.

    This endpoint schedules a scan via FastAPI `BackgroundTasks` so the
    request returns immediately and the UI can continue to interact with the
    API while the scan runs. Progress is available via `/api/scan/status`.
    """
    background_tasks.add_task(run_scan_background, mode=mode)
    return {"status": f"Scan started in background (Mode: {mode})"}

@app.get("/api/settings/courses")
def get_all_courses_table(session: Session = Depends(get_session)):
    return session.exec(select(Course)).all()

def get_dir_size(path):
    total = 0
    try:
        if os.path.isfile(path):
            return os.path.getsize(path)
        for entry in os.scandir(path):
            if entry.is_file():
                total += entry.stat().st_size
            elif entry.is_dir():
                total += get_dir_size(entry.path)
    except Exception:
        pass
    return total

def format_size(size):
    for unit in ['B', 'KB', 'MB', 'GB', 'TB']:
        if size < 1024:
            return f"{size:.2f} {unit}"
        size /= 1024
    return f"{size:.2f} PB"

@app.get("/api/settings/stats")
def get_library_stats(session: Session = Depends(get_session)):
    # Refactored: Filter only available courses (is_available=True)
    raw_courses = session.exec(select(Course).where(Course.is_available == True)).all()
    
    # Deduplicate: Keep one per (title, instructor)
    courses = []
    seen = set()
    for c in raw_courses:
        key = (c.title, c.instructor)
        if key not in seen:
            seen.add(key)
            courses.append(c)
    
    # Calculate stats based on unique, available courses
    total_courses = len(courses)
    
    # Count videos and duration from these courses only
    total_videos = 0
    total_duration = 0
    for c in courses:
        total_videos += len(c.videos)
        for v in c.videos:
            if v.duration:
                total_duration += v.duration
    
    categories = set(c.category for c in courses)
    sub_categories = set(c.sub_category for c in courses)
    instructors = set(c.instructor for c in courses if c.instructor)
    
    # Group by category
    by_category = defaultdict(lambda: {"count": 0, "sub_categories": defaultdict(int)})
    for c in courses:
        by_category[c.category]["count"] += 1
        by_category[c.category]["sub_categories"][c.sub_category] += 1
        
    # Sort based on CSV
    cat_map = load_category_map()
    category_order = []
    subcategory_order = defaultdict(list)
    seen_cats = set()
    for item in cat_map:
        c = item["category"]
        s = item["sub_category"]
        if c not in seen_cats:
            category_order.append(c)
            seen_cats.add(c)
        if s not in subcategory_order[c]:
            subcategory_order[c].append(s)

    sorted_stats = []
    # 1. CSV categories
    for cat in category_order:
        if cat in by_category:
            sub_stats = []
            defined_subs = subcategory_order.get(cat, [])
            existing_subs = list(by_category[cat]["sub_categories"].keys())
            sorted_subs = [s for s in defined_subs if s in existing_subs] + \
                          sorted([s for s in existing_subs if s not in defined_subs])
            
            for sub in sorted_subs:
                sub_stats.append({"name": sub, "count": by_category[cat]["sub_categories"][sub]})
            
            sorted_stats.append({
                "category": cat,
                "count": by_category[cat]["count"],
                "sub_categories": sub_stats
            })
            
    # 2. Remaining categories
    remaining = [c for c in by_category.keys() if c not in category_order]
    for cat in sorted(remaining):
        sub_stats = []
        for sub in sorted(by_category[cat]["sub_categories"].keys()):
            sub_stats.append({"name": sub, "count": by_category[cat]["sub_categories"][sub]})
        sorted_stats.append({
            "category": cat,
            "count": by_category[cat]["count"],
            "sub_categories": sub_stats
        })

    cache_path = os.path.join(DATA_PATH, "cache")
    frames_path = os.path.join(DATA_PATH, "cache/frames")
    db_path = os.path.join(DATA_PATH, "db.sqlite")

    return {
        "total_courses": total_courses,
        "total_videos": total_videos,
        "total_categories": len(categories),
        "total_sub_categories": len(sub_categories),
        "total_instructors": len(instructors),
        "total_duration_seconds": total_duration,
        "by_category": sorted_stats,
        "locations": {
            "cache": f"{cache_path} ({format_size(get_dir_size(cache_path))})",
            "frames": f"{frames_path} ({format_size(get_dir_size(frames_path))})",
            "database": f"{db_path} ({format_size(get_dir_size(db_path))})"
        }
    }

@app.get("/api/settings/config")
def get_server_config():
    return load_config()

@app.post("/api/settings/config")
def update_server_config(config: dict):
    current = load_config()
    current.update(config)
    save_config(current)
    return current

@app.get("/api/settings/navbar")
def get_navbar_settings():
    return load_navbar_config()

@app.post("/api/settings/navbar")
def update_navbar_settings(config: List[Dict[str, Any]]):
    logger.info(f"Updating navbar settings with {len(config)} groups")
    save_navbar_config(config)
    return config

@app.get("/api/settings/logs")
def get_logs(lines: int = 100, filter_type: str = "all"):
    if not os.path.exists(LOG_FILE):
        return {"logs": []}
    
    try:
        with open(LOG_FILE, 'r') as f:
            all_lines = f.readlines()
            
        filtered_lines = all_lines
        if filter_type != "all":
            if filter_type == "frontend":
                filtered_lines = [l for l in all_lines if "FRONTEND" in l]
            elif filter_type == "error":
                filtered_lines = [l for l in all_lines if "ERROR" in l]
            elif filter_type == "warning":
                filtered_lines = [l for l in all_lines if "WARNING" in l]
            elif filter_type == "scanner":
                filtered_lines = [l for l in all_lines if "Scan" in l or "scan" in l]
            elif filter_type == "playback":
                filtered_lines = [l for l in all_lines if "Video" in l or "stream" in l or "Stream" in l]
            elif filter_type == "api":
                # Filter for API access logs or HDD access
                filtered_lines = [l for l in all_lines if HDD_LOG_TAG in l or "GET /api" in l or "POST /api" in l]

        return {"logs": filtered_lines[-lines:]}
    except Exception as e:
        return {"logs": [f"Error reading logs: {str(e)}"]}

@app.delete("/api/settings/logs")
def clear_logs():
    open(LOG_FILE, 'w').close()
    return {"status": "cleared"}

@app.post("/api/settings/clear-cache")
def clear_cache(target: str, session: Session = Depends(get_session)):
    if target == "all":
        # Clear everything
        cache_dir = os.path.join(DATA_PATH, "cache")
        if os.path.exists(cache_dir):
            shutil.rmtree(cache_dir)
            os.makedirs(cache_dir, exist_ok=True)
            os.makedirs(os.path.join(cache_dir, "frames"), exist_ok=True)
            os.makedirs(os.path.join(cache_dir, "covers"), exist_ok=True)
        return {"status": "All cache cleared"}
    elif target == "frames":
        cache_dir = os.path.join(DATA_PATH, "cache/frames")
        if os.path.exists(cache_dir):
            for f in os.listdir(cache_dir):
                os.remove(os.path.join(cache_dir, f))
        return {"status": "Frames cleared"}
    elif target == "covers":
        cache_dir = os.path.join(DATA_PATH, "cache/covers")
        if os.path.exists(cache_dir):
            for f in os.listdir(cache_dir):
                os.remove(os.path.join(cache_dir, f))
        return {"status": "Covers cleared"}
    elif target == "orphaned":
        # Logic to find files in cache not in DB
        # Get all valid video hashes
        valid_hashes = set()
        videos = session.exec(select(Video)).all()
        for v in videos:
            if v.course:
                full_path = os.path.join(v.course.path, v.filename)
                file_hash = hashlib.md5(full_path.encode('utf-8')).hexdigest()
                valid_hashes.add(file_hash)

        frames_dir = os.path.join(DATA_PATH, "cache/frames")
        removed_frames = 0
        if os.path.exists(frames_dir):
            for f in os.listdir(frames_dir):
                if f.endswith(".jpg"):
                    # Check if filename (without extension) is a valid hash
                    # Legacy files (numeric IDs) will also be removed here if not in valid_hashes
                    # But wait, legacy files are numeric. Hashes are hex.
                    # If we want to clean legacy files, we should check if it looks like a hash.
                    # Actually, simpler: if the filename (minus ext) is NOT in valid_hashes, delete it.
                    # This covers both old IDs (which won't match a hash) and stale hashes.
                    
                    file_id = f.replace(".jpg", "")
                    if file_id not in valid_hashes:
                        os.remove(os.path.join(frames_dir, f))
                        removed_frames += 1
        
        # Get all valid course IDs for covers
        valid_course_ids = {str(c.id) for c in session.exec(select(Course)).all()}
        covers_dir = os.path.join(DATA_PATH, "cache/covers")
        removed_covers = 0
        if os.path.exists(covers_dir):
            for f in os.listdir(covers_dir):
                if f.endswith(".jpg"):
                    cid = f.replace(".jpg", "")
                    if cid not in valid_course_ids:
                        os.remove(os.path.join(covers_dir, f))
                        removed_covers += 1
                        
        return {"status": f"Cleared {removed_frames} orphaned frames and {removed_covers} orphaned covers"}
        
    return {"status": "done"}

@app.post("/api/settings/course/{course_id}/category")
def update_category(course_id: int, new_category: str, session: Session = Depends(get_session)):
    course = session.get(Course, course_id)
    if not course: raise HTTPException(404)
    course.category = new_category
    session.add(course)
    session.commit()
    return {"status": "updated"}

@app.get("/api/settings/database/backup")
def backup_database(
    include_db: bool = True, 
    include_config: bool = True,
    include_logs: bool = False,
    include_scan_state: bool = False,
    include_csv: bool = True, 
    include_covers: bool = True,
    include_frames: bool = True,
    include_navbar: bool = True
):
    mem_zip = io.BytesIO()
    manifest = {
        "timestamp": datetime.utcnow().isoformat(),
        "contents": []
    }
    
    with zipfile.ZipFile(mem_zip, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
        # Database
        db_path = os.path.join(DATA_PATH, "db.sqlite")
        if include_db and os.path.exists(db_path):
            zf.write(db_path, "db.sqlite")
            manifest["contents"].append("Database")
            
        # Config
        config_path = os.path.join(DATA_PATH, "config.json")
        if include_config and os.path.exists(config_path):
            zf.write(config_path, "config.json")
            manifest["contents"].append("Config")

        # Logs
        log_path = os.path.join(DATA_PATH, "ilearn.log")
        if include_logs and os.path.exists(log_path):
            zf.write(log_path, "ilearn.log")
            manifest["contents"].append("Logs")

        # Scan State
        scan_state_path = os.path.join(DATA_PATH, "scan_state.json")
        if include_scan_state and os.path.exists(scan_state_path):
            zf.write(scan_state_path, "scan_state.json")
            manifest["contents"].append("Scan State")
        
        # CSV
        if include_csv:
            if os.path.exists(CSV_FILE):
                zf.write(CSV_FILE, "category.csv")
                manifest["contents"].append("CSV")
        
        # Cache - Covers
        covers_path = os.path.join(DATA_PATH, "cache/covers")
        if include_covers and os.path.exists(covers_path):
            count = 0
            for root, dirs, files in os.walk(covers_path):
                for file in files:
                    file_path = os.path.join(root, file)
                    arcname = os.path.join("cache/covers", file)
                    zf.write(file_path, arcname)
                    count += 1
            if count > 0: manifest["contents"].append(f"Covers ({count})")

        # Cache - Frames
        frames_path = os.path.join(DATA_PATH, "cache/frames")
        if include_frames and os.path.exists(frames_path):
            count = 0
            for root, dirs, files in os.walk(frames_path):
                for file in files:
                    file_path = os.path.join(root, file)
                    arcname = os.path.join("cache/frames", file)
                    zf.write(file_path, arcname)
                    count += 1
            if count > 0: manifest["contents"].append(f"Frames ({count})")

        # Navbar config
        if include_navbar and os.path.exists(NAVBAR_FILE):
            zf.write(NAVBAR_FILE, "navbar.json")
            manifest["contents"].append("Navbar")

        # Version File
        if os.path.exists(VERSION_FILE):
            zf.write(VERSION_FILE, "VERSION")
            manifest["contents"].append("Version Info")

        # Changelog (Try docs/CHANGELOG.md first, then root)
        changelog_path = "/app/docs/CHANGELOG.md" # Assuming docs are mounted or copied? 
        # Wait, docs are not mounted in docker-compose. Let's check if we can find it.
        # In docker-compose, we mount ./backend:/app. So docs are at ../docs relative to backend?
        # No, backend is root of /app. So /app/docs doesn't exist unless we copy it.
        # But wait, docker-compose mounts ./backend:/app. 
        # The project structure is:
        # root/
        #   backend/
        #   docs/
        # So inside container /app is backend/. docs/ is not there.
        # We need to mount docs/ or copy it.
        # For now, let's assume we might not have it unless we mount it.
        # Let's check if we can access it via relative path if we are in dev mode with volume mounts?
        # No, /app is the root of the container workdir.
        
        # Write Manifest
        zf.writestr("backup_info.json", json.dumps(manifest, indent=2))

    mem_zip.seek(0)
    # Get version for filename
    app_version = get_app_version()
    filename = f"ilearn_v{app_version}_backup_{datetime.now().strftime('%Y%m%d_%H%M%S')}.zip"
    return StreamingResponse(mem_zip, media_type="application/zip", headers={"Content-Disposition": f"attachment; filename={filename}"})

@app.post("/api/settings/database/restore/analyze")
async def analyze_backup(file: UploadFile = File(...)):
    if not file.filename.endswith(".zip"):
        raise HTTPException(400, "File must be a zip archive")
    
    content = await file.read()
    info = {"valid": False, "timestamp": None, "contents": [], "files_found": []}
    
    try:
        with zipfile.ZipFile(io.BytesIO(content)) as zf:
            # Try to read manifest
            if "backup_info.json" in zf.namelist():
                try:
                    manifest = json.loads(zf.read("backup_info.json"))
                    info["timestamp"] = manifest.get("timestamp")
                    info["contents"] = manifest.get("contents", [])
                    info["valid"] = True
                except:
                    pass
            
            # List actual files
            info["files_found"] = zf.namelist()
            
            # Detect contents from files
            detected = []
            if "db.sqlite" in info["files_found"] or "ilearn.db" in info["files_found"]: detected.append("Database")
            if "config.json" in info["files_found"]: detected.append("Config")
            if "ilearn.log" in info["files_found"]: detected.append("Logs")
            if "scan_state.json" in info["files_found"]: detected.append("Scan State")
            if "category.csv" in info["files_found"]: detected.append("CSV")
            if "navbar.json" in info["files_found"]: detected.append("Navbar")
            if any(f.startswith("cache/covers") for f in info["files_found"]): detected.append("Covers")
            if any(f.startswith("cache/frames") for f in info["files_found"]): detected.append("Frames")

            # If manifest contents are empty (or manifest missing), use detected
            if not info["contents"]:
                info["contents"] = detected
            else:
                # If manifest exists but might be missing items that are present, we could merge.
                # For now, let's trust manifest unless it's empty.
                pass
                
    except Exception as e:
        raise HTTPException(400, f"Invalid zip file: {e}")
        
    return info

@app.post("/api/settings/database/restore")
async def restore_database(
    file: UploadFile = File(...),
    restore_db: bool = Form(True),
    restore_config: bool = Form(True),
    restore_logs: bool = Form(True),
    restore_scan_state: bool = Form(True),
    restore_csv: bool = Form(True),
    restore_covers: bool = Form(True),
    restore_frames: bool = Form(True),
    restore_navbar: bool = Form(True)
):
    if not file.filename.endswith(".zip"):
        raise HTTPException(400, "File must be a zip archive")
    
    content = await file.read()
    restored = []
    
    with zipfile.ZipFile(io.BytesIO(content)) as zf:
        # Restore DB
        if restore_db and ("db.sqlite" in zf.namelist() or "ilearn.db" in zf.namelist()):
            if "db.sqlite" in zf.namelist():
                with open(os.path.join(DATA_PATH, "db.sqlite"), "wb") as f:
                    f.write(zf.read("db.sqlite"))
            elif "ilearn.db" in zf.namelist(): # Legacy support
                with open(os.path.join(DATA_PATH, "db.sqlite"), "wb") as f:
                    f.write(zf.read("ilearn.db"))
            restored.append("Database")

        # Restore Config
        if restore_config and "config.json" in zf.namelist():
            with open(os.path.join(DATA_PATH, "config.json"), "wb") as f:
                f.write(zf.read("config.json"))
            restored.append("Config")

        # Restore Logs
        if restore_logs and "ilearn.log" in zf.namelist():
            with open(os.path.join(DATA_PATH, "ilearn.log"), "wb") as f:
                f.write(zf.read("ilearn.log"))
            restored.append("Logs")

        # Restore Scan State
        if restore_scan_state and "scan_state.json" in zf.namelist():
            with open(os.path.join(DATA_PATH, "scan_state.json"), "wb") as f:
                f.write(zf.read("scan_state.json"))
            restored.append("Scan State")
        
        # Restore CSV
        if restore_csv and "category.csv" in zf.namelist():
            with open(CSV_FILE, "wb") as f:
                f.write(zf.read("category.csv"))
            restored.append("CSV")

        # Restore Navbar
        if restore_navbar and "navbar.json" in zf.namelist():
            with open(NAVBAR_FILE, "wb") as f:
                f.write(zf.read("navbar.json"))
            restored.append("Navbar")
        
        # Restore Cache
        # Check if any file starts with "cache/"
        has_cache = any(n.startswith("cache/") for n in zf.namelist())
        if has_cache:
            # We only clear specific subfolders if they exist in zip AND are requested
            has_covers = any(n.startswith("cache/covers") for n in zf.namelist())
            has_frames = any(n.startswith("cache/frames") for n in zf.namelist())
            
            do_covers = restore_covers and has_covers
            do_frames = restore_frames and has_frames
            
            covers_path = os.path.join(DATA_PATH, "cache/covers")
            frames_path = os.path.join(DATA_PATH, "cache/frames")

            if do_covers and os.path.exists(covers_path):
                shutil.rmtree(covers_path)
            if do_frames and os.path.exists(frames_path):
                shutil.rmtree(frames_path)
            
            # Extract all cache files that match requested types
            for member in zf.namelist():
                if member.startswith("cache/covers") and do_covers:
                    zf.extract(member, DATA_PATH)
                elif member.startswith("cache/frames") and do_frames:
                    zf.extract(member, DATA_PATH)
            
            if do_covers: restored.append("Covers")
            if do_frames: restored.append("Frames")
                
    return {"status": "Restore complete", "restored": restored}

@app.get("/api/settings/csv")
def get_csv_data():
    csv_path = CSV_FILE
    
    if not os.path.exists(csv_path):
        return {"headers": [], "rows": []}
        
    rows = []
    headers = []
    try:
        with open(csv_path, 'r', encoding='utf-8') as f:
            reader = csv.reader(f)
            headers = next(reader, [])
            for row in reader:
                rows.append(row)
    except Exception as e:
        logger.error(f"Error reading CSV: {e}")
        
    return {"headers": headers, "rows": rows}

class CSVUpdate(BaseModel):
    headers: list
    rows: list

@app.post("/api/settings/csv")
def update_csv_data(data: CSVUpdate):
    # Always write to /app/data/category.csv
    csv_path = CSV_FILE
    try:
        with open(csv_path, 'w', newline='', encoding='utf-8') as f:
            writer = csv.writer(f)
            writer.writerow(data.headers)
            writer.writerows(data.rows)
    except Exception as e:
        logger.error(f"Error writing CSV: {e}")
        raise HTTPException(500, f"Failed to save CSV: {e}")
        
    return {"status": "saved"}

# --- Frontend Serving (FIXED) ---
if os.path.isdir("static"):
    app.mount("/assets", StaticFiles(directory="static/assets"), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        # Avoid capturing API routes
        if full_path.startswith("api/") or full_path.startswith("docs"):
            raise HTTPException(status_code=404, detail="Not found")

        # Construct path to potential file
        file_path = os.path.join("static", full_path)
        
        # If it's a file that exists, serve it
        if os.path.exists(file_path) and os.path.isfile(file_path):
            return FileResponse(file_path)
        
        # Otherwise serve index.html
        index_path = "static/index.html"
        if os.path.exists(index_path) and os.path.isfile(index_path):
            return FileResponse(index_path)
            
        raise HTTPException(status_code=404, detail="SPA index not found")