"""
database.py
----------------
Provides a SQLModel/SQLAlchemy engine and a simple session helper for the
application. The engine is configured for SQLite with thread-safety options
enabled so the server can safely service concurrent requests and background
scans that all share the same DB file.

Notes:
- Using `check_same_thread=False` allows connections to be used from
    multiple threads. We also apply a QueuePool with increased limits to handle
    higher concurrency (video streams, concurrent scans, background tasks).
"""

from sqlmodel import create_engine, Session
from sqlalchemy.pool import QueuePool
import os

DATA_PATH = os.getenv("DATA_PATH", "data")
os.makedirs(DATA_PATH, exist_ok=True)
DATABASE_URL = f"sqlite:///{os.path.join(DATA_PATH, 'db.sqlite')}"

# SQLite needs check_same_thread=False for multithreaded access
# Using QueuePool with higher limits to handle concurrent video streams
engine = create_engine(
    DATABASE_URL, 
    echo=False, 
    connect_args={"check_same_thread": False},
    poolclass=QueuePool,
    pool_size=20,
    max_overflow=30,
    pool_timeout=60
)

def get_session():
    """Yield a DB session usable with FastAPI dependency injection.

    The helper keeps session creation/teardown centralised. Handlers can
    `Depends(get_session)` to get a session context manager that will be
    closed after the request is complete.
    """
    with Session(engine) as session:
        yield session