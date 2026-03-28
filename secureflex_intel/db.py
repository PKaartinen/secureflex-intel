"""
Database layer for SecureFlex Intel.

Uses SQLAlchemy Core (not ORM) for simplicity — plain dicts in, plain dicts out,
matching the exact same field names the CSV layer used so the API layer needs
minimal changes.

Tables:
  tenders        — from contracts_finder and find_a_tender scanners
  prospects      — from companies_house clients scan
  competitors    — from companies_house competitors scan
  signals        — from signals scanner
  pipeline_leads — the growth pipeline (replaces pipeline_master.csv)
  scan_runs      — audit log of when each scan ran
"""
import os
import json
from datetime import datetime
from typing import Optional, List, Dict, Any

try:
    from sqlalchemy import (
        create_engine, text, MetaData, Table, Column,
        String, Integer, Float, Text, DateTime, Boolean,
        UniqueConstraint, Index, insert, select, update, delete, func
    )
    from sqlalchemy.dialects.postgresql import insert as pg_insert
    HAS_SQLALCHEMY = True
except ImportError:
    HAS_SQLALCHEMY = False

# ── Engine ────────────────────────────────────────────────────────────────────

_engine = None

def get_engine():
    global _engine
    if _engine is not None:
        return _engine
    db_url = os.environ.get("DATABASE_URL", "")
    if not db_url:
        return None
    # SQLAlchemy requires postgresql:// not postgres://
    if db_url.startswith("postgres://"):
        db_url = "postgresql://" + db_url[len("postgres://"):]
    try:
        _engine = create_engine(
            db_url,
            pool_pre_ping=True,
            pool_size=5,
            max_overflow=10,
            connect_args={"connect_timeout": 10},
        )
        return _engine
    except Exception as e:
        print(f"[DB] Failed to create engine: {e}")
        return None

def db_available() -> bool:
    """Return True if a database connection is configured and reachable."""
    if not HAS_SQLALCHEMY:
        return False
    engine = get_engine()
    if engine is None:
        return False
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return True
    except Exception:
        return False

# ── Schema ────────────────────────────────────────────────────────────────────

metadata = MetaData()

tenders_table = Table("tenders", metadata,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("ocid", String(200), unique=True, nullable=True),
    Column("title", Text),
    Column("buyer", Text),
    Column("buyer_email", Text),
    Column("region", String(200)),
    Column("cpv_code", String(100)),
    Column("value", String(200)),
    Column("deadline", String(100)),
    Column("sme_friendly", String(50)),
    Column("published_date", String(100)),
    Column("link", Text),
    Column("description_snippet", Text),
    Column("score", Integer, default=0),
    Column("classification", String(50)),
    Column("scanned_at", DateTime, default=datetime.utcnow),
    Column("source", String(50), default="contracts_finder"),
)

prospects_table = Table("prospects", metadata,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("company_number", String(20), unique=True, nullable=False),
    Column("company_name", Text),
    Column("company_type", String(200)),
    Column("sic_codes", Text),
    Column("status", String(100)),
    Column("region", String(200)),
    Column("address", Text),
    Column("date_of_creation", String(50)),
    Column("website_url", Text),
    Column("scanned_at", DateTime, default=datetime.utcnow),
)

competitors_table = Table("competitors", metadata,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("company_number", String(20), unique=True, nullable=False),
    Column("company_name", Text),
    Column("company_type", String(200)),
    Column("sic_codes", Text),
    Column("status", String(100)),
    Column("region", String(200)),
    Column("address", Text),
    Column("date_of_creation", String(50)),
    Column("website_url", Text),
    Column("scanned_at", DateTime, default=datetime.utcnow),
)

signals_table = Table("signals", metadata,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("link", Text, unique=True, nullable=True),
    Column("title", Text),
    Column("company", Text),
    Column("source", Text),
    Column("published", String(100)),
    Column("description", Text),
    Column("score", Integer, default=0),
    Column("signal_type", String(100)),
    Column("signal_category", String(100)),
    Column("scanned_at", DateTime, default=datetime.utcnow),
)

pipeline_table = Table("pipeline_leads", metadata,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("company_id", String(50), unique=True, nullable=False),
    Column("company_name", Text),
    Column("company_number", String(20)),
    Column("company_type", String(200)),
    Column("sic_codes", Text),
    Column("status", String(100), default="prospect"),
    Column("tier", String(50)),
    Column("region", String(200)),
    Column("address", Text),
    Column("website_url", Text),
    Column("source", String(200)),
    Column("notes", Text),
    Column("next_action", Text),
    Column("next_action_date", String(50)),
    Column("last_modified", DateTime, default=datetime.utcnow),
    Column("created_at", DateTime, default=datetime.utcnow),
)

scan_runs_table = Table("scan_runs", metadata,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("scan_type", String(50)),
    Column("started_at", DateTime, default=datetime.utcnow),
    Column("completed_at", DateTime, nullable=True),
    Column("records_written", Integer, default=0),
    Column("status", String(50), default="running"),
    Column("error", Text, nullable=True),
)

dossiers_table = Table("dossiers", metadata,
    Column("id", Integer, primary_key=True, autoincrement=True),
    # Primary lookup key — company_number when available, else slugified name
    Column("company_key", String(100), unique=True, nullable=False),
    Column("company_name", Text),
    Column("company_number", String(20), nullable=True),
    Column("company_type", String(200), nullable=True),
    Column("region", String(200), nullable=True),
    Column("dossier_markdown", Text),
    Column("sources_used", Text),       # JSON array stored as text
    Column("data_summary", Text),       # JSON object stored as text
    Column("generated_at", DateTime, default=datetime.utcnow),
    Column("updated_at", DateTime, default=datetime.utcnow),
)

crime_data_table = Table("crime_data", metadata,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("lat", Float, nullable=False),
    Column("lng", Float, nullable=False),
    Column("month", String(10)),
    Column("category", String(100)),
    Column("count", Integer, default=1),
    Column("location_name", Text),
    Column("scanned_at", DateTime, default=datetime.utcnow),
)

def init_db():
    """Create all tables if they don't exist, and run migrations."""
    engine = get_engine()
    if engine is None:
        print("[DB] No DATABASE_URL set — skipping DB init")
        return False
    try:
        metadata.create_all(engine)
        print("[DB] Tables created/verified OK")

        # ── Migrations ───────────────────────────────────────────────────
        # Add source column to tenders if it doesn't exist
        with engine.begin() as conn:
            conn.execute(text(
                "ALTER TABLE tenders ADD COLUMN IF NOT EXISTS source VARCHAR(50) DEFAULT 'contracts_finder'"
            ))
        print("[DB] Migration: tenders.source column OK")

        return True
    except Exception as e:
        print(f"[DB] Failed to create tables: {e}")
        return False

# ── Generic upsert helpers ────────────────────────────────────────────────────

def upsert_rows(table: Table, rows: List[Dict], conflict_col: str) -> int:
    """
    Upsert a list of dicts into a table.
    On conflict on `conflict_col`, update all other columns.
    Returns number of rows processed.
    """
    if not rows:
        return 0
    engine = get_engine()
    if engine is None:
        return 0
    written = 0
    with engine.begin() as conn:
        for row in rows:
            # Strip keys not in table columns
            valid_cols = {c.name for c in table.columns}
            clean = {k: v for k, v in row.items() if k in valid_cols}
            if not clean.get(conflict_col):
                continue
            stmt = pg_insert(table).values(**clean)
            update_cols = {k: stmt.excluded[k] for k in clean if k != conflict_col and k != 'id'}
            stmt = stmt.on_conflict_do_update(
                index_elements=[conflict_col],
                set_=update_cols
            )
            conn.execute(stmt)
            written += 1
    return written

def query_table(
    table: Table,
    filters: Optional[Dict] = None,
    order_by: Optional[str] = None,
    order_desc: bool = True,
    limit: int = 100,
    offset: int = 0,
) -> List[Dict]:
    """Query a table with optional filters, ordering, and pagination."""
    engine = get_engine()
    if engine is None:
        return []
    with engine.connect() as conn:
        stmt = select(table)
        if filters:
            for col, val in filters.items():
                if val is not None and hasattr(table.c, col):
                    stmt = stmt.where(table.c[col] == val)
        if order_by and hasattr(table.c, order_by):
            col = table.c[order_by]
            stmt = stmt.order_by(col.desc() if order_desc else col.asc())
        stmt = stmt.limit(limit).offset(offset)
        result = conn.execute(stmt)
        rows = [dict(r._mapping) for r in result]
        # Convert datetime objects to ISO strings for JSON serialisation
        for row in rows:
            for k, v in row.items():
                if isinstance(v, datetime):
                    row[k] = v.isoformat()
        return rows

def count_table(table: Table, filters: Optional[Dict] = None) -> int:
    """Count rows in a table with optional filters."""
    engine = get_engine()
    if engine is None:
        return 0
    with engine.connect() as conn:
        stmt = select(func.count()).select_from(table)
        if filters:
            for col, val in filters.items():
                if val is not None and hasattr(table.c, col):
                    stmt = stmt.where(table.c[col] == val)
        return conn.execute(stmt).scalar() or 0

def get_last_scan_time(scan_type: str) -> Optional[str]:
    """Get the timestamp of the last completed scan of a given type."""
    engine = get_engine()
    if engine is None:
        return None
    with engine.connect() as conn:
        stmt = (
            select(scan_runs_table.c.completed_at)
            .where(scan_runs_table.c.scan_type == scan_type)
            .where(scan_runs_table.c.status == "completed")
            .order_by(scan_runs_table.c.completed_at.desc())
            .limit(1)
        )
        result = conn.execute(stmt).scalar()
        return result.isoformat() if result else None

def record_scan_start(scan_type: str) -> int:
    """Record a scan starting. Returns the scan run ID."""
    engine = get_engine()
    if engine is None:
        return -1
    with engine.begin() as conn:
        result = conn.execute(
            insert(scan_runs_table).values(
                scan_type=scan_type,
                started_at=datetime.utcnow(),
                status="running"
            )
        )
        return result.inserted_primary_key[0]

def record_scan_complete(run_id: int, records_written: int, error: str = None):
    """Mark a scan run as completed."""
    if run_id < 0:
        return
    engine = get_engine()
    if engine is None:
        return
    with engine.begin() as conn:
        conn.execute(
            update(scan_runs_table)
            .where(scan_runs_table.c.id == run_id)
            .values(
                completed_at=datetime.utcnow(),
                records_written=records_written,
                status="failed" if error else "completed",
                error=error,
            )
        )
