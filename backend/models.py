"""
models.py
----------------
Defines the SQLModel data models for the application: `Course` and `Video`.
These are intentionally lightweight and map directly to the database schema.
Add new columns as needed with migrations (handled in `main.py` startup).
"""

from sqlmodel import SQLModel, Field, Relationship
from typing import List, Optional
from datetime import datetime

class Course(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    title: str = Field(index=True)
    # Filesystem path where course media is stored. Not unique: the same
    # folder may be represented in multiple course rows (e.g. multiple
    # `category` / `sub_category` entries mapping to the same folder).
    path: Optional[str] = Field(default=None)
    category: str = Field(index=True, default="Uncategorized")
    sub_category: str = Field(index=True, default="General")
    instructor: Optional[str] = None
    description: Optional[str] = None
    cover_path: Optional[str] = None
    total_expected: int = 0
    is_visible: bool = Field(default=True)
    # Default is False (Not Available). True means Available.
    is_available: bool = Field(default=False)
    carousel_info: Optional[str] = None
    all_categories: str = Field(default="[]") # JSON list of dicts: [{"category": "...", "sub_category": "..."}]
    videos: List["Video"] = Relationship(back_populates="course")

class Video(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    filename: str
    is_downloaded: bool = True
    duration: Optional[int] = None
    progress: int = Field(default=0)
    last_watched: Optional[datetime] = None
    subtitle_path: Optional[str] = None
    course_id: Optional[int] = Field(default=None, foreign_key="course.id")
    course: Optional[Course] = Relationship(back_populates="videos")

# NOTE:
# - `filename` is stored as a relative path in the context of `Course.path`,
#   so `os.path.join(course.path, video.filename)` gives the full path on disk.
# - `duration` is stored as integer seconds (when available), and can be 0.