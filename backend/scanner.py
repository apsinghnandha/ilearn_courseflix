"""
scanner.py
----------------
Library scanner and media utilities.

Responsibilities:
- Recursively discover courses and videos under `/courses` (or a configurable root)
- Create/update Course and Video rows in the DB
- Extract cover images and per-video frames (thumbnails) using `ffmpeg`.
- Expose `run_scan` and `process_frames` used by main application endpoints.

Design notes:
- Scanning and media processing is I/O and CPU intensive; the implementation uses
    a `ThreadPoolExecutor` to parallelise scanning tasks. For heavy operations (ffmpeg)
    we deliberately cap concurrency with `-threads 1` and a reduced worker count to
    avoid CPU oversubscription on low-powered devices.
- Timeouts are applied to `ffprobe` and `ffmpeg` calls to avoid blocking the server
    on corrupt or extremely slow inputs.
"""

import os
import re
import csv
import json
import time
import subprocess
import logging
import threading
from sqlmodel import Session, select, delete
from concurrent.futures import ThreadPoolExecutor, as_completed
from database import engine, DATA_PATH
from models import Course, Video

import random
import hashlib
import shutil

SCAN_STATE_FILE = os.path.join(DATA_PATH, "scan_state.json")
CACHE_DIR = os.path.join(DATA_PATH, "cache/frames")
COVER_CACHE_DIR = os.path.join(DATA_PATH, "cache/covers")
logger = logging.getLogger("ilearn")
scan_lock = threading.Lock()
course_creation_lock = threading.Lock()

# Determine number of workers based on CPU cores (default to 4 if detection fails)
# On Orange Pi 5 (8 cores), this will allow higher parallelism
NUM_WORKERS = os.cpu_count() or 4

# Global Status
SCAN_STATUS = {
    "is_scanning": False,
    "message": "Idle",
    "progress": 0,
    "total": 0,
    "current": 0
}

def update_status(is_scanning, message, current=0, total=0):
    SCAN_STATUS["is_scanning"] = is_scanning
    SCAN_STATUS["message"] = message
    SCAN_STATUS["current"] = current
    SCAN_STATUS["total"] = total
    if total > 0:
        SCAN_STATUS["progress"] = int((current / total) * 100)
    else:
        SCAN_STATUS["progress"] = 0

def ensure_cache_dir():
    if not os.path.exists(CACHE_DIR):
        os.makedirs(CACHE_DIR, exist_ok=True)
    if not os.path.exists(COVER_CACHE_DIR):
        os.makedirs(COVER_CACHE_DIR, exist_ok=True)

def get_video_duration(video_path):
    try:
        cmd = [
            "ffprobe", 
            "-v", "error", 
            "-show_entries", "format=duration", 
            "-of", "default=noprint_wrappers=1:nokey=1", 
            video_path
        ]
        # Use a slightly longer timeout than the default. `ffprobe` is typically
        # quite fast, but slow network filesystems or damaged containers can stall.
        result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=20)
        output = result.stdout.strip()
        if not output:
            return 0.0
        return float(output)
    except Exception as e:
        logger.error(f"Failed to get duration for {video_path}: {e}")
        return 0

def extract_frame(video_path, output_path, timestamp=30):
    try:
        # Build ffmpeg command for a single frame extraction.
        # We use `-threads 1` to make each ffmpeg invocation single-threaded so
        # it behaves nicely under concurrency and doesn't cause CPU contention.
        # The `scale=640:-2` filter keeps aspect and provides reasonable quality
        # for thumbnails without being too large.
        # Use -threads 1 to prevent CPU starvation when running in parallel
        cmd = [
            "ffmpeg", 
            "-threads", "1",
            "-ss", str(timestamp), 
            "-i", video_path, 
            "-frames:v", "1", 
            "-vf", "scale=640:-2",
            "-q:v", "2", 
            "-y", 
            output_path
        ]
        # Run with timeout to prevent hanging. Some files and codecs can stall;
        # a 1-minute timeout is a safe compromise for large files while still
        # ensuring the server remains responsive.
        subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=60)
        return True
    except Exception as e:
        logger.error(f"Failed to extract frame for {video_path}: {e}")
        return False

def process_frame_task(full_path, output_path, duration=0):
    if os.path.exists(output_path):
        return False
    
    if not os.path.exists(full_path):
        return False

    try:
        if duration == 0:
            duration = get_video_duration(full_path)
        
        # Pick a timestamp for the thumbnail. We prefer a moment inside the
        # first quarter of content but also sometimes sample later (random)
        # to avoid black frames or title slides.
        t1_min = duration * 0.1
        t1_max = duration * 0.2
        t1 = random.uniform(t1_min, t1_max)
        t2 = random.uniform(35, 75)
        timestamp = random.choice([t1, t2])
        if timestamp > duration - 1:
            timestamp = max(0, duration * 0.1)
            
        return extract_frame(full_path, output_path, timestamp=timestamp)
    except Exception as e:
        logger.error(f"Error processing frame for {full_path}: {e}")
        return False

def load_category_map(csv_path=None):
    if csv_path is None:
        csv_path = os.path.join(DATA_PATH, "category.csv")
    mapping = []
    
    if not os.path.exists(csv_path):
        # Fallback to legacy locations just in case, or return empty
        if os.path.exists("/app/category.csv"):
            csv_path = "/app/category.csv"
        elif os.path.exists("/courses/category.csv"):
            csv_path = "/courses/category.csv"
        else:
            # print(f"Category CSV not found at {csv_path}")
            return mapping

    try:
        with open(csv_path, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                # "Category","Sub-Category","Instructor Name","Class Title"
                # Handle aliases for Artist/Instructor and Title/Class Title
                instructor = row.get("Artist") or row.get("Instructor Name") or ""
                title = row.get("Title") or row.get("Class Title") or ""
                
                mapping.append({
                    "category": row.get("Category", "Uncategorized"),
                    "sub_category": row.get("Sub-Category", "General"),
                    "instructor": instructor,
                    "title": title
                })
    except Exception as e:
        print(f"Error reading CSV: {e}")
    return mapping

def find_best_match(folder_name, mapping):
    folder_lower = folder_name.lower()
    best_match = None
    max_score = 0

    for item in mapping:
        score = 0
        instructor = item["instructor"].lower()
        title = item["title"].lower()
        
        # Simple token matching
        if instructor and instructor in folder_lower:
            score += 2
        if title and title in folder_lower:
            score += 3
            
        if score > max_score and score >= 2: # Threshold
            max_score = score
            best_match = item
            
    return best_match

def scan_single_course(session: Session, course_path: str, cat_map: list, root_path: str, inferred_meta: dict = None, frame_executor: ThreadPoolExecutor = None):
    folder_name = os.path.basename(course_path)
    
    # Find best match metadata to link to DB courses
    meta = find_best_match(folder_name, cat_map)
    
    default_category = "Uncategorized"
    default_sub = "General"
    
    if inferred_meta:
        default_category = inferred_meta.get("category", default_category)
        default_sub = inferred_meta.get("sub_category", default_sub)
    
    target_courses = []
    
    # Use lock to prevent race conditions when creating/finding courses
    with course_creation_lock:
        if meta:
            # Find all courses in DB with this Title and Instructor
            title = meta["title"] if meta["title"] else folder_name
            instructor = meta["instructor"]
            
            statement = select(Course).where(Course.title == title)
            if instructor:
                statement = statement.where(Course.instructor == instructor)
            
            target_courses = session.exec(statement).all()
        
        # If no match in DB (not in CSV), check if we already have a course with this path
        if not target_courses:
            statement = select(Course).where(Course.path == course_path)
            existing_by_path = session.exec(statement).all()
            if existing_by_path:
                target_courses = existing_by_path
                # Update category if it was Uncategorized and we now have inferred
                for c in target_courses:
                    if c.category == "Uncategorized" and default_category != "Uncategorized":
                        c.category = default_category
                        c.sub_category = default_sub
                        session.add(c)
            else:
                # Create a new course
                course = Course(
                    title=folder_name, 
                    path=course_path, 
                    category=default_category,
                    sub_category=default_sub,
                    instructor=""
                )
                session.add(course)
                session.commit()
                session.refresh(course)
                target_courses = [course]

    # Update all target courses with path. We mark `is_available=True` to
    # indicate the folder currently exists on disk and that items are ready
    # for playback or display in the UI.
    for course in target_courses:
        course.path = course_path
        course.is_available = True 
    
    # Scan for videos and cover
    all_videos = []
    cover_image = None
    
    for c_dirpath, c_dirnames, c_filenames in os.walk(course_path):
        # Skip hidden
        c_dirnames[:] = [d for d in c_dirnames if not d.startswith('.')]
        
        for f in c_filenames:
            if f.endswith((".mp4", ".mkv", ".webm")) and not f.startswith('.'):
                full_video_path = os.path.join(c_dirpath, f)
                rel_video_path = os.path.relpath(full_video_path, course_path)
                all_videos.append(rel_video_path)
        
        # Find cover image
        if not cover_image and c_dirpath == course_path:
            images = sorted([f for f in c_filenames if f.lower().endswith((".jpg", ".jpeg", ".png", ".webp")) and not f.startswith('.')])
            if images:
                standard_covers = ["cover.jpg", "poster.jpg", "folder.jpg", "cover.png", "poster.png"]
                for std in standard_covers:
                    if std in images:
                        full_img_path = os.path.join(c_dirpath, std)
                        cover_image = os.path.relpath(full_img_path, root_path)
                        break
                if not cover_image:
                    full_img_path = os.path.join(c_dirpath, images[0])
                    cover_image = os.path.relpath(full_img_path, root_path)

    # Update all courses with cover and videos
    for course in target_courses:
        if cover_image:
            course.cover_path = cover_image
        
        # Calculate expected
        numbers = {int(re.search(r'\d+', f).group()) for f in all_videos if re.search(r'\d+', f)}
        if numbers:
            course.total_expected = max(numbers)
        else:
            course.total_expected = len(all_videos)
        
        session.add(course)
        
        # Add videos
        for v_rel_path in sorted(all_videos):
            base_name = os.path.splitext(v_rel_path)[0]
            sub_path = None
            for ext in ['.vtt', '.srt']:
                potential_sub = base_name + ext
                full_sub_path = os.path.join(course_path, potential_sub)
                if os.path.exists(full_sub_path):
                    sub_path = os.path.relpath(full_sub_path, root_path)
                    break
            
            full_video_path = os.path.join(course_path, v_rel_path)
            # Safely probe the duration (may return 0 for unknown). We use this
            # to pick better timestamps for thumbnails and estimate runtime.
            duration = get_video_duration(full_video_path)
            
            session.add(Video(filename=v_rel_path, is_downloaded=True, course_id=course.id, subtitle_path=sub_path, duration=int(duration)))
            
    session.commit()

    # Cache cover image for each course id mapped to this path. We resize to
    # a high-resolution cover (1920px wide) and store in the cover cache.
    if target_courses and target_courses[0].cover_path:
        try:
            full_source_path = os.path.join(root_path, target_courses[0].cover_path)
            # Cache for ALL course IDs
            for c in target_courses:
                cached_path = os.path.join(COVER_CACHE_DIR, f"{c.id}.jpg")
                if os.path.exists(full_source_path) and not os.path.exists(cached_path):
                    cmd = [
                        "ffmpeg", "-i", full_source_path,
                        "-vf", "scale=1920:-1",
                        "-q:v", "2", "-y",
                        cached_path
                    ]
                    subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=10)
        except Exception as e:
            logger.error(f"Failed to cache cover: {e}")

def sync_csv_to_db(session: Session, csv_path: str = None):
    """
    Syncs the database with the CSV file.
    """
    if csv_path is None:
        csv_path = os.path.join(DATA_PATH, "category.csv")

    if not os.path.exists(csv_path):
        # Fallback
        if os.path.exists("/app/category.csv"): csv_path = "/app/category.csv"
        elif os.path.exists("/courses/category.csv"): csv_path = "/courses/category.csv"
    
    if not os.path.exists(csv_path):
        logger.warning(f"CSV not found at {csv_path}, skipping sync.")
        return

    logger.info(f"Syncing DB with CSV: {csv_path}")
    
    courses_data = {}

    try:
        with open(csv_path, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            if reader.fieldnames:
                reader.fieldnames = [h.strip() for h in reader.fieldnames]
            
            for row in reader:
                category = row.get("Category", "Uncategorized").strip()
                sub_category = row.get("Sub-Category", "General").strip()
                instructor = row.get("Artist") or row.get("Instructor Name") or ""
                title = row.get("Title") or row.get("Class Title") or ""
                carousel_info = row.get("Carousel Info", "")
                is_visible_str = row.get("Visible", "true").lower()
                is_visible = is_visible_str in ["true", "1", "yes", "on"]
                
                if not title: continue

                key = (title, instructor, category, sub_category)
                
                if key not in courses_data:
                    courses_data[key] = {
                        "title": title,
                        "instructor": instructor,
                        "category": category,
                        "sub_category": sub_category,
                        "carousel_info": carousel_info,
                        "is_visible": is_visible
                    }

        for key, data in courses_data.items():
            title = data["title"]
            instructor = data["instructor"]
            category = data["category"]
            sub_category = data["sub_category"]
            
            statement = select(Course).where(
                Course.title == title,
                Course.instructor == instructor,
                Course.category == category,
                Course.sub_category == sub_category
            )
            course = session.exec(statement).first()
            
            if course:
                course.carousel_info = data["carousel_info"]
                course.is_visible = data["is_visible"]
                session.add(course)
            else:
                course = Course(
                    title=title,
                    category=category,
                    sub_category=sub_category,
                    instructor=instructor,
                    carousel_info=data["carousel_info"],
                    is_visible=data["is_visible"],
                    is_available=False, 
                    path=None 
                )
                session.add(course)
        
        session.commit()
        logger.info(f"CSV Sync Complete. Processed {len(courses_data)} unique courses.")

    except Exception as e:
        logger.error(f"Error syncing CSV: {e}")

def process_frames(session: Session, force: bool = False, executor: ThreadPoolExecutor = None):
    ensure_cache_dir()
    videos = session.exec(select(Video)).all()
    total = len(videos)
    print(f"Processing frames for {total} videos (Force: {force})...")
    update_status(True, "Processing Frames...", 0, total)
    
    tasks = []
    
    def submit_and_wait(pool):
        local_tasks = []
        for i, video in enumerate(videos):
            if not video.course: continue
            full_path = os.path.join(video.course.path, video.filename)
            file_hash = hashlib.md5(full_path.encode('utf-8')).hexdigest()
            output_path = os.path.join(CACHE_DIR, f"{file_hash}.jpg")
            
            if force or not os.path.exists(output_path):
                local_tasks.append(pool.submit(process_frame_task, full_path, output_path, video.duration or 0))
        
        completed = 0
        if local_tasks:
            for future in as_completed(local_tasks):
                completed += 1
                update_status(True, f"Processing Frames... {completed}/{len(local_tasks)}", completed, len(local_tasks))

    if executor:
        submit_and_wait(executor)
    else:
        # Limit frame extraction concurrency to avoid system overload
        # Even with 8 cores, running 8 ffmpegs can be too heavy
        frame_workers = max(1, NUM_WORKERS // 2)
        with ThreadPoolExecutor(max_workers=frame_workers) as pool:
            submit_and_wait(pool)
    
    print("Frame processing complete.")
    update_status(False, "Frame processing complete.")

def run_scan(session: Session, root_path: str = "/courses", mode: str = "quick"):
    if not scan_lock.acquire(blocking=False):
        print("Scan already in progress, skipping.")
        return

    try:
        print(f"Starting Scan. Mode: {mode}")
        update_status(True, f"Starting Scan ({mode})...")
        
        if mode in ["quick", "full", "metadata"]:
            sync_csv_to_db(session)
        
        if mode == "full":
            update_status(True, "Clearing Database...")
            session.exec(delete(Video))
            session.commit()
            if os.path.exists(SCAN_STATE_FILE):
                os.remove(SCAN_STATE_FILE)
        
        if mode in ["frames", "force_frames", "missing_frames", "replace_all_frames"]:
            force = (mode in ["force_frames", "replace_all_frames"])
            process_frames(session, force=force)
            print("Frame processing complete.")
            update_status(False, "Frame processing complete.")
            return

        if not os.path.exists(root_path):
            print(f"Root path {root_path} does not exist")
            update_status(False, "Root path not found")
            return

        last_scan = 0
        if mode == "quick" and os.path.exists(SCAN_STATE_FILE):
            try:
                with open(SCAN_STATE_FILE, 'r') as f:
                    state = json.load(f)
                    last_scan = state.get("last_scan", 0)
            except:
                pass

        cat_map = load_category_map()
        
        # Build a set of known titles from CSV for fast lookup
        csv_titles = set()
        for item in cat_map:
            if item["title"]:
                csv_titles.add(item["title"].lower())

        found_courses = []

        # Recursive Scanner
        def scan_recursive(current_path, category_stack):
            folder_name = os.path.basename(current_path)
            
            # Skip hidden
            if folder_name.startswith('.'): return

            # Check if this folder is a Course Root
            is_course = False
            
            # 1. CSV Match
            if folder_name.lower() in csv_titles:
                is_course = True
            
            # 2. Contains Videos Directly
            if not is_course:
                try:
                    entries = [e for e in os.listdir(current_path) if not e.startswith('.')]
                    has_videos = any(f.endswith((".mp4", ".mkv", ".webm")) for f in entries)
                    if has_videos:
                        is_course = True
                    
                    # 3. Heuristic: Check for structured course (subdirs with videos + numbered folders)
                    # This handles "Course Name/01. Section/video.mp4" structure where Root has no videos
                    elif not is_course:
                        subdirs = [d for d in entries if os.path.isdir(os.path.join(current_path, d))]
                        if subdirs:
                            # Check for section-like naming: "01. ", "1 - ", "Chapter 1"
                            # Regex: Starts with digits followed by separator, or starts with common section words
                            section_pattern = re.compile(r'^(\d+[\.\-\s_]+)|^(Chapter|Section|Week|Module)\s*\d+', re.IGNORECASE)
                            potential_sections = [d for d in subdirs if section_pattern.match(d)]
                            
                            # If we found potential sections, check if they actually contain videos
                            if potential_sections:
                                for ps in potential_sections:
                                    ps_path = os.path.join(current_path, ps)
                                    try:
                                        if any(f.endswith((".mp4", ".mkv", ".webm")) for f in os.listdir(ps_path) if not f.startswith('.')):
                                            is_course = True
                                            break
                                    except OSError:
                                        pass
                except OSError:
                    pass

            if is_course:
                # Infer metadata from stack
                category = "Uncategorized"
                sub_category = "General"
                
                if len(category_stack) > 0:
                    category = category_stack[0]
                if len(category_stack) > 1:
                    sub_category = category_stack[1]
                
                inferred_meta = {
                    "category": category,
                    "sub_category": sub_category
                }
                
                found_courses.append((current_path, inferred_meta))
                # Stop recursing here (treat as leaf course)
                return

            # Recurse
            try:
                subdirs = [d for d in os.listdir(current_path) if os.path.isdir(os.path.join(current_path, d)) and not d.startswith('.')]
                for d in subdirs:
                    new_stack = category_stack + [folder_name] if current_path != root_path else []
                    scan_recursive(os.path.join(current_path, d), new_stack)
            except OSError:
                pass

        # Start recursion
        scan_recursive(root_path, [])

        # Check for deleted courses
        update_status(True, "Checking for deleted courses...")
        existing_courses = session.exec(select(Course)).all()
        for c in existing_courses:
            if c.path and not os.path.exists(c.path):
                print(f"Removing deleted course: {c.title}")
                session.delete(c)
        session.commit()

        current_time = time.time()
        
        # Prepare courses to scan
        courses_to_scan = []
        for folder, meta in found_courses:
            mtime = os.path.getmtime(folder)
            statement = select(Course).where(Course.path == folder)
            exists = session.exec(statement).first()
            
            should_scan = False
            if mode == "full": should_scan = True
            elif mode == "metadata": should_scan = True
            elif mode == "quick":
                if not exists or mtime > last_scan: should_scan = True
            
            if should_scan:
                courses_to_scan.append((folder, meta))

        total_scan = len(courses_to_scan)
        print(f"Found {total_scan} courses to scan.")
        
        # Parallel Execution
        # We use one executor for courses, then verify frames for ALL videos
        
        with ThreadPoolExecutor(max_workers=NUM_WORKERS) as course_executor:
            
            futures = []
            for folder, meta in courses_to_scan:
                # Submit course scan task
                # We need a wrapper to create a thread-local session
                def scan_wrapper(c_path, c_meta):
                    with Session(engine) as thread_session:
                        scan_single_course(thread_session, c_path, cat_map, root_path, c_meta)
                
                futures.append(course_executor.submit(scan_wrapper, folder, meta))
            
            completed = 0
            for future in as_completed(futures):
                completed += 1
                update_status(True, f"Scanning Courses... {completed}/{total_scan}", completed, total_scan)
                try:
                    future.result()
                except Exception as e:
                    logger.error(f"Error in course scan: {e}")

        # After courses are scanned/updated, ensure frames exist for ALL videos
        # This covers both new videos and existing ones with missing frames
        print("Verifying frames for all videos...")
        process_frames(session, force=False)

        os.makedirs(os.path.dirname(SCAN_STATE_FILE), exist_ok=True)
        with open(SCAN_STATE_FILE, 'w') as f:
            json.dump({"last_scan": current_time}, f)

        print("Scan Complete.")
        update_status(False, "Scan Complete")
    except Exception as e:
        logger.error(f"Scan failed: {e}")
        update_status(False, f"Scan failed: {str(e)}")
    finally:
        scan_lock.release()
