"""
SecureFlex Intel API Server

FastAPI application that exposes all intelligence tools as REST endpoints
for dashboard consumption. Supports JSON, GeoJSON, and real-time updates.

Run with:
    python -m secureflex_intel serve
    # or
    uvicorn secureflex_intel.api.server:app --reload --port 8000
"""

import csv
import json
import os
import sys
import time
import asyncio
import threading
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional, List, Dict, Any

try:
    from fastapi import FastAPI, Query, BackgroundTasks, HTTPException
    from fastapi.middleware.cors import CORSMiddleware
    from fastapi.responses import JSONResponse, FileResponse
    from fastapi.staticfiles import StaticFiles
except ImportError:
    print("FastAPI not installed. Run: pip install fastapi uvicorn")
    print("Or: pip install secureflex-intel[server]")
    sys.exit(1)

from secureflex_intel.config import settings

# ── App Setup ────────────────────────────────────────────────────────────────

app = FastAPI(
    title="SecureFlex Intel API",
    description="Security industry intelligence platform — tenders, prospects, signals, pipeline management",
    version="0.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Tighten in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Auto-Scan Scheduler State ────────────────────────────────────────────────

_scheduler_state = {
    "enabled": False,
    "interval_hours": 6,
    "last_run": None,
    "next_run": None,
    "running": False,
    "thread": None,
}


def _run_scheduled_scans():
    """Run all tender scans (CF + FTS) as a scheduled task."""
    _scheduler_state["running"] = True
    _scheduler_state["last_run"] = datetime.utcnow().isoformat()
    print("[Scheduler] Starting scheduled scan...")
    try:
        # Run Contracts Finder scan
        from secureflex_intel.sources.contracts_finder import run_scan as cf_scan
        from secureflex_intel.db import record_scan_start, record_scan_complete
        run_id = record_scan_start("tenders")
        try:
            results = cf_scan(days_back=settings.tender_days_back)
            record_scan_complete(run_id, len(results))
        except Exception as e:
            record_scan_complete(run_id, 0, str(e))
            print(f"[Scheduler] CF scan error: {e}")

        # Run FTS scan
        from secureflex_intel.sources.find_a_tender import run_scan as fts_scan
        run_id = record_scan_start("fts")
        try:
            results = fts_scan(days_back=settings.fts_days_back)
            record_scan_complete(run_id, len(results))
        except Exception as e:
            record_scan_complete(run_id, 0, str(e))
            print(f"[Scheduler] FTS scan error: {e}")

        print("[Scheduler] Scheduled scan complete")
    except Exception as e:
        print(f"[Scheduler] Error: {e}")
    finally:
        _scheduler_state["running"] = False


def _scheduler_loop():
    """Background thread that runs scans at the configured interval."""
    while _scheduler_state["enabled"]:
        interval = _scheduler_state["interval_hours"] * 3600
        _scheduler_state["next_run"] = (
            datetime.utcnow() + timedelta(seconds=interval)
        ).isoformat()

        # Sleep in small increments so we can stop quickly
        for _ in range(interval):
            if not _scheduler_state["enabled"]:
                return
            time.sleep(1)

        if _scheduler_state["enabled"] and not _scheduler_state["running"]:
            _run_scheduled_scans()


def _start_scheduler():
    """Start the background scheduler thread."""
    if _scheduler_state["thread"] and _scheduler_state["thread"].is_alive():
        return  # Already running
    _scheduler_state["enabled"] = True
    _scheduler_state["interval_hours"] = settings.scan_interval_hours
    _scheduler_state["next_run"] = (
        datetime.utcnow() + timedelta(hours=settings.scan_interval_hours)
    ).isoformat()
    t = threading.Thread(target=_scheduler_loop, daemon=True, name="scan-scheduler")
    t.start()
    _scheduler_state["thread"] = t
    print(f"[Scheduler] Started — interval: {settings.scan_interval_hours}h")


def _stop_scheduler():
    """Stop the background scheduler."""
    _scheduler_state["enabled"] = False
    _scheduler_state["next_run"] = None
    print("[Scheduler] Stopped")


# ── DB init + auto-scan on startup ───────────────────────────────────────────

@app.on_event("startup")
def startup_event():
    """Initialise database tables on startup if DATABASE_URL is set."""
    try:
        from secureflex_intel.db import init_db
        init_db()
    except Exception as e:
        print(f"[DB] Startup init failed (non-fatal): {e}")

    # Start auto-scan scheduler if configured
    if settings.auto_scan:
        _start_scheduler()

# ── Helpers ──────────────────────────────────────────────────────────────────

def read_csv_as_dicts(filepath: str) -> List[Dict[str, str]]:
    """Read a CSV file and return list of dicts."""
    if not os.path.exists(filepath):
        return []
    with open(filepath, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        return list(reader)


def get_latest_file(directory: str, pattern: str = "", ext: str = "") -> Optional[str]:
    """Get the most recently modified file in a directory matching pattern and optional extension."""
    if not os.path.exists(directory):
        return None
    files = []
    for f in os.listdir(directory):
        if pattern and pattern not in f:
            continue
        if ext and not f.endswith(ext):
            continue
        filepath = os.path.join(directory, f)
        if os.path.isfile(filepath):
            files.append((os.path.getmtime(filepath), filepath))
    if not files:
        return None
    files.sort(reverse=True)
    return files[0][1]


def read_markdown_file(filepath: str) -> str:
    """Read a markdown file and return content."""
    if not filepath or not os.path.exists(filepath):
        return ""
    with open(filepath, "r", encoding="utf-8") as f:
        return f.read()


# UK Postcode to approximate lat/lng mapping for GeoJSON
LONDON_POSTCODE_COORDS = {
    "EC": (51.5155, -0.0922), "WC": (51.5170, -0.1200), "E": (51.5200, -0.0500),
    "N": (51.5500, -0.1000), "NW": (51.5500, -0.1700), "SE": (51.4700, -0.0600),
    "SW": (51.4700, -0.1600), "W": (51.5100, -0.2000), "BR": (51.4000, 0.0400),
    "CR": (51.3700, -0.1000), "DA": (51.4500, 0.1500), "EN": (51.6500, -0.0800),
    "HA": (51.5800, -0.3400), "IG": (51.5600, 0.0700), "KT": (51.3800, -0.3000),
    "RM": (51.5500, 0.1800), "SM": (51.3600, -0.1700), "TW": (51.4500, -0.3400),
    "UB": (51.5300, -0.4400),
}

REGION_COORDS = {
    "london": (51.5074, -0.1278), "south east": (51.2700, -0.4200),
    "south west": (51.0600, -2.7200), "east of england": (52.1900, 0.5700),
    "west midlands": (52.4800, -1.9000), "east midlands": (52.9500, -1.1500),
    "north west": (53.4800, -2.2400), "north east": (54.9700, -1.6100),
    "yorkshire and the humber": (53.7900, -1.7500), "wales": (52.1300, -3.7800),
    "scotland": (56.4900, -4.2000), "england": (52.3555, -1.1743),
}


def postcode_to_coords(postcode: str) -> Optional[tuple]:
    """Approximate lat/lng from a UK postcode prefix."""
    if not postcode:
        return None
    postcode = postcode.upper().strip()
    for prefix in sorted(LONDON_POSTCODE_COORDS.keys(), key=len, reverse=True):
        if postcode.startswith(prefix):
            return LONDON_POSTCODE_COORDS[prefix]
    return None


def region_to_coords(region: str) -> Optional[tuple]:
    """Get approximate coords for a UK region."""
    if not region:
        return None
    region_lower = region.lower().strip()
    for key, coords in REGION_COORDS.items():
        if key in region_lower:
            return coords
    return None


def _score_to_color(score: int) -> str:
    if score >= 65:
        return "#ef4444"
    elif score >= 40:
        return "#f59e0b"
    elif score >= 20:
        return "#22c55e"
    return "#94a3b8"


def _type_to_color(company_type: str) -> str:
    colors = {
        "Facilities Management": "#3b82f6",
        "Venue/Events": "#8b5cf6",
        "Corporate": "#06b6d4",
        "Prime Contractor": "#f97316",
        "Local Authority": "#10b981",
    }
    for key, color in colors.items():
        if key.lower() in company_type.lower():
            return color
    return "#6b7280"


# ── Status Endpoint ──────────────────────────────────────────────────────────

@app.get("/api/status")
def get_status():
    """System health check — API keys, paths, file counts."""
    settings.ensure_dirs()
    pipeline_path = str(settings.pipeline_path)
    pipeline_count = 0

    # Try DB count first
    try:
        from secureflex_intel.db import db_available, count_table, pipeline_table, tenders_table, prospects_table, signals_table, competitors_table, dossiers_table
        if db_available():
            pipeline_count = count_table(pipeline_table)
            db_status = "connected"
            data_counts = {
                "tenders": count_table(tenders_table),
                "prospects": count_table(prospects_table),
                "competitors": count_table(competitors_table),
                "signals": count_table(signals_table),
                "dossiers": count_table(dossiers_table),
            }
        else:
            raise Exception("DB not available")
    except Exception:
        db_status = "not_connected"
        if os.path.exists(pipeline_path):
            with open(pipeline_path) as f:
                pipeline_count = sum(1 for _ in csv.DictReader(f))

        def count_files(d):
            d = str(d)
            return len([f for f in os.listdir(d) if os.path.isfile(os.path.join(d, f))]) if os.path.exists(d) else 0

        data_counts = {
            "tenders": count_files(settings.tenders_dir),
            "prospects": count_files(settings.prospects_dir),
            "signals": count_files(settings.signals_dir),
            "dossiers": 0,
        }

    return {
        "status": "ok",
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "database": db_status,
        "api_keys": {
            "companies_house": bool(settings.companies_house_api_key),
            "anthropic": bool(settings.anthropic_api_key),
        },
        "pipeline": {
            "path": pipeline_path,
            "exists": os.path.exists(pipeline_path),
            "lead_count": pipeline_count,
        },
        "data_counts": data_counts,
        "settings": {
            "tender_region": settings.tender_region,
            "tender_days_back": settings.tender_days_back,
            "prospector_region": settings.prospector_region,
            "max_results": settings.prospector_max_results,
        },
    }


# ── Pipeline / Leads Endpoints ───────────────────────────────────────────────

@app.get("/api/pipeline/stats")
def get_pipeline_stats():
    """Pipeline statistics — counts by status, tier, type."""
    # DB path
    try:
        from secureflex_intel.db import db_available, query_table, count_table, pipeline_table
        if db_available():
            rows = query_table(pipeline_table, limit=5000)
            by_status, by_tier, by_type, by_source = {}, {}, {}, {}
            for row in rows:
                s = row.get("status", "Unknown") or "Unknown"
                by_status[s] = by_status.get(s, 0) + 1
                t = row.get("tier", "Unknown") or "Unknown"
                by_tier[t] = by_tier.get(t, 0) + 1
                ct = row.get("company_type", "Unknown") or "Unknown"
                by_type[ct] = by_type.get(ct, 0) + 1
                src = row.get("source", "Unknown") or "Unknown"
                by_source[src] = by_source.get(src, 0) + 1
            return {"total": len(rows), "by_status": by_status, "by_tier": by_tier, "by_type": by_type, "by_source": by_source}
    except Exception:
        pass
    # CSV fallback
    pipeline_path = str(settings.pipeline_path)
    rows = read_csv_as_dicts(pipeline_path)
    by_status, by_tier, by_type, by_source = {}, {}, {}, {}
    for row in rows:
        s = row.get("status", "Unknown")
        by_status[s] = by_status.get(s, 0) + 1
        t = row.get("tier", "Unknown")
        by_tier[t] = by_tier.get(t, 0) + 1
        ct = row.get("company_type", "Unknown")
        by_type[ct] = by_type.get(ct, 0) + 1
        src = row.get("source", "Unknown")
        by_source[src] = by_source.get(src, 0) + 1
    return {"total": len(rows), "by_status": by_status, "by_tier": by_tier, "by_type": by_type, "by_source": by_source}


@app.get("/api/pipeline")
def get_pipeline(
    status: Optional[str] = None,
    tier: Optional[str] = None,
    company_type: Optional[str] = None,
    sort_by: str = "last_modified",
    limit: int = 100,
):
    """Get pipeline leads with optional filtering."""
    # DB path
    try:
        from secureflex_intel.db import db_available, query_table, count_table, pipeline_table
        if db_available():
            filters = {}
            if status:
                filters["status"] = status
            if tier:
                filters["tier"] = tier
            rows = query_table(pipeline_table, filters=filters, order_by=sort_by, limit=limit)
            if company_type:
                rows = [r for r in rows if company_type.lower() in (r.get("company_type") or "").lower()]
            return {"total": len(rows), "leads": rows, "source": "database"}
    except Exception:
        pass
    # CSV fallback
    pipeline_path = str(settings.pipeline_path)
    rows = read_csv_as_dicts(pipeline_path)
    if status:
        rows = [r for r in rows if r.get("status", "").lower() == status.lower()]
    if tier:
        rows = [r for r in rows if r.get("tier", "") == tier]
    if company_type:
        rows = [r for r in rows if company_type.lower() in r.get("company_type", "").lower()]
    rows.sort(key=lambda r: r.get("last_modified", ""), reverse=True)
    return {"total": len(rows), "leads": rows[:limit]}


@app.get("/api/pipeline/{company_id}")
def get_pipeline_lead(company_id: str):
    """Get a single pipeline lead by company_id."""
    try:
        from secureflex_intel.db import db_available, query_table, pipeline_table
        if db_available():
            rows = query_table(pipeline_table, filters={"company_id": company_id}, limit=1)
            if rows:
                return rows[0]
    except Exception:
        pass
    pipeline_path = str(settings.pipeline_path)
    rows = read_csv_as_dicts(pipeline_path)
    for r in rows:
        if r.get("company_id") == company_id:
            return r
    raise HTTPException(status_code=404, detail="Lead not found")


@app.post("/api/pipeline")
def create_pipeline_lead(payload: Dict[str, Any]):
    """Create a new pipeline lead."""
    company_name = payload.get("company_name", "").strip()
    if not company_name:
        raise HTTPException(status_code=400, detail="company_name is required")

    try:
        from secureflex_intel.db import db_available, get_engine, pipeline_table, count_table
        from sqlalchemy import insert as sa_insert
        if db_available():
            engine = get_engine()
            total = count_table(pipeline_table)
            company_id = f"SEC-{total + 1:04d}"
            row = {
                "company_id": company_id,
                "company_name": company_name,
                "company_number": payload.get("company_number", ""),
                "company_type": payload.get("company_type", ""),
                "sic_codes": payload.get("sic_codes", ""),
                "status": payload.get("status", "prospect"),
                "tier": payload.get("tier", "3"),
                "region": payload.get("region", ""),
                "address": payload.get("address", ""),
                "website_url": payload.get("website_url", ""),
                "source": payload.get("source", "Manual"),
                "notes": payload.get("notes", ""),
                "next_action": payload.get("next_action", ""),
                "next_action_date": payload.get("next_action_date", ""),
                "last_modified": datetime.utcnow(),
                "created_at": datetime.utcnow(),
            }
            with engine.begin() as conn:
                conn.execute(sa_insert(pipeline_table).values(**row))
            return {"status": "created", "company_id": company_id, "lead": row}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.put("/api/pipeline/{company_id}")
def update_pipeline_lead(company_id: str, payload: Dict[str, Any]):
    """Update an existing pipeline lead."""
    try:
        from secureflex_intel.db import db_available, get_engine, pipeline_table
        from sqlalchemy import update as sa_update
        if db_available():
            engine = get_engine()
            payload["last_modified"] = datetime.utcnow()
            valid_cols = {c.name for c in pipeline_table.columns}
            clean = {k: v for k, v in payload.items() if k in valid_cols}
            with engine.begin() as conn:
                conn.execute(
                    sa_update(pipeline_table)
                    .where(pipeline_table.c.company_id == company_id)
                    .values(**clean)
                )
            return {"status": "updated", "company_id": company_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/pipeline/{company_id}")
def delete_pipeline_lead(company_id: str):
    """Delete a pipeline lead."""
    try:
        from secureflex_intel.db import db_available, get_engine, pipeline_table
        from sqlalchemy import delete as sa_delete
        if db_available():
            engine = get_engine()
            with engine.begin() as conn:
                conn.execute(
                    sa_delete(pipeline_table)
                    .where(pipeline_table.c.company_id == company_id)
                )
            return {"status": "deleted", "company_id": company_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── AI Endpoints ─────────────────────────────────────────────────────────────

@app.get("/api/ai/status")
def ai_status():
    """Check if AI (Anthropic) is available."""
    return {"available": bool(settings.anthropic_api_key)}


@app.post("/api/ai/analyze/tender")
def ai_analyze_tender(payload: Dict[str, Any]):
    """AI analysis of a tender opportunity."""
    try:
        from secureflex_intel.ai import analyze_tender
        analysis = analyze_tender(payload)
        return {"analysis": analysis}
    except Exception as e:
        return {"analysis": f"AI analysis unavailable: {e}"}


@app.post("/api/ai/analyze/prospect")
def ai_analyze_prospect(payload: Dict[str, Any]):
    """AI analysis of a prospect company."""
    try:
        from secureflex_intel.ai import analyze_prospect
        analysis = analyze_prospect(payload)
        return {"analysis": analysis}
    except Exception as e:
        return {"analysis": f"AI analysis unavailable: {e}"}


# ── Dossier Endpoints ────────────────────────────────────────────────────────

def _dossier_company_key(company_number: str, company_name: str) -> str:
    """Derive a stable company key for dossier lookups."""
    if company_number:
        return company_number.upper().strip()
    if company_name:
        import re
        slug = re.sub(r'[^a-z0-9]+', '_', company_name.lower().strip())
        return f"name_{slug[:80]}"
    return "unknown"


def _save_dossier_to_db(result: dict, company_number: str, company_type: str, region: str):
    """Upsert a generated dossier into the dossiers table."""
    try:
        from secureflex_intel.db import db_available, get_engine, dossiers_table
        from sqlalchemy.dialects.postgresql import insert as pg_insert
        if not db_available():
            return
        company_name = result.get("company_name", "")
        company_key = _dossier_company_key(company_number, company_name)
        row = {
            "company_key": company_key,
            "company_name": company_name,
            "company_number": company_number or None,
            "company_type": company_type or None,
            "region": region or None,
            "dossier_markdown": result.get("dossier_markdown", ""),
            "sources_used": json.dumps(result.get("sources_used", [])),
            "data_summary": json.dumps(result.get("data_summary", {})),
            "generated_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
        }
        engine = get_engine()
        with engine.begin() as conn:
            stmt = pg_insert(dossiers_table).values(**row)
            stmt = stmt.on_conflict_do_update(
                index_elements=["company_key"],
                set_={
                    "dossier_markdown": stmt.excluded.dossier_markdown,
                    "sources_used": stmt.excluded.sources_used,
                    "data_summary": stmt.excluded.data_summary,
                    "company_name": stmt.excluded.company_name,
                    "company_type": stmt.excluded.company_type,
                    "region": stmt.excluded.region,
                    "updated_at": stmt.excluded.updated_at,
                }
            )
            conn.execute(stmt)
        print(f"[Dossier] Saved to DB with key: {company_key}")
    except Exception as e:
        print(f"[Dossier] Failed to save to DB: {e}")


@app.post("/api/dossier/generate")
def generate_dossier_endpoint(
    background_tasks: BackgroundTasks,
    payload: Dict[str, Any],
):
    """Generate a comprehensive Sales Intelligence Dossier for a company.
    
    Accepts: { company_name, company_number?, company_type?, region?, sic_codes?, address?, website_url? }
    Returns: { company_name, generated_at, dossier_markdown, sources_used, data_summary, company_key }
    """
    company_name = payload.get("company_name", "").strip()
    if not company_name:
        raise HTTPException(status_code=400, detail="company_name is required")

    company_number = payload.get("company_number", "").strip()
    company_type = payload.get("company_type", "")
    region = payload.get("region", "")

    from secureflex_intel.dossier import generate_dossier
    result = generate_dossier(
        company_name=company_name,
        company_number=company_number,
        company_type=company_type,
        region=region,
        sic_codes=payload.get("sic_codes", ""),
        address=payload.get("address", ""),
        website_url=payload.get("website_url", ""),
    )

    # Persist to PostgreSQL (primary storage — survives redeployments)
    _save_dossier_to_db(result, company_number, company_type, region)
    result["company_key"] = _dossier_company_key(company_number, company_name)

    return result


@app.get("/api/dossier/by-company/{company_key}")
def get_dossier_by_company(company_key: str):
    """Retrieve a persisted dossier by company key (company number or name slug).
    
    Returns 404 if no dossier has been generated yet for this company.
    """
    try:
        from secureflex_intel.db import db_available, get_engine, dossiers_table
        from sqlalchemy import select
        if db_available():
            engine = get_engine()
            with engine.connect() as conn:
                # Try exact key match first
                stmt = select(dossiers_table).where(
                    dossiers_table.c.company_key == company_key.upper()
                )
                row = conn.execute(stmt).first()
                if not row:
                    # Try name-slug variant
                    stmt = select(dossiers_table).where(
                        dossiers_table.c.company_key == company_key
                    )
                    row = conn.execute(stmt).first()
                if row:
                    d = dict(row._mapping)
                    return {
                        "company_key": d["company_key"],
                        "company_name": d["company_name"],
                        "company_number": d["company_number"],
                        "company_type": d["company_type"],
                        "region": d["region"],
                        "dossier_markdown": d["dossier_markdown"],
                        "sources_used": json.loads(d["sources_used"]) if d["sources_used"] else [],
                        "data_summary": json.loads(d["data_summary"]) if d["data_summary"] else {},
                        "generated_at": d["generated_at"].isoformat() if hasattr(d["generated_at"], "isoformat") else str(d["generated_at"]),
                        "updated_at": d["updated_at"].isoformat() if hasattr(d["updated_at"], "isoformat") else str(d["updated_at"]),
                    }
    except Exception as e:
        print(f"[Dossier] Lookup failed: {e}")
    # Return 200 with null dossier_markdown instead of 404 to avoid console errors
    return {"dossier_markdown": None, "company_key": company_key}


@app.get("/api/dossier/list")
def list_dossiers():
    """List all persisted dossiers from the database."""
    try:
        from secureflex_intel.db import db_available, get_engine, dossiers_table
        from sqlalchemy import select
        if db_available():
            engine = get_engine()
            with engine.connect() as conn:
                stmt = select(
                    dossiers_table.c.id,
                    dossiers_table.c.company_key,
                    dossiers_table.c.company_name,
                    dossiers_table.c.company_number,
                    dossiers_table.c.company_type,
                    dossiers_table.c.region,
                    dossiers_table.c.generated_at,
                    dossiers_table.c.updated_at,
                    dossiers_table.c.sources_used,
                ).order_by(dossiers_table.c.updated_at.desc())
                rows = conn.execute(stmt).fetchall()
                dossiers = []
                for r in rows:
                    d = dict(r._mapping)
                    sources = json.loads(d["sources_used"]) if d["sources_used"] else []
                    dossiers.append({
                        "id": d["id"],
                        "company_key": d["company_key"],
                        "company_name": d["company_name"],
                        "company_number": d["company_number"],
                        "company_type": d["company_type"],
                        "region": d["region"],
                        "source_count": len(sources),
                        "generated_at": d["generated_at"].isoformat() if hasattr(d["generated_at"], "isoformat") else str(d["generated_at"]),
                        "updated_at": d["updated_at"].isoformat() if hasattr(d["updated_at"], "isoformat") else str(d["updated_at"]),
                    })
                return {"total": len(dossiers), "dossiers": dossiers}
    except Exception as e:
        print(f"[Dossier] List failed: {e}")
    return {"total": 0, "dossiers": []}


@app.get("/api/dossier/{company_id}")
def get_saved_dossier_legacy(company_id: str):
    """Legacy: get dossier by pipeline lead company_id. Redirects to by-company lookup."""
    try:
        from secureflex_intel.db import db_available, query_table, pipeline_table
        if db_available():
            rows = query_table(pipeline_table, filters={"company_id": company_id}, limit=1)
            if rows:
                company_number = rows[0].get("company_number", "")
                company_name = rows[0].get("company_name", "")
                key = _dossier_company_key(company_number, company_name)
                return get_dossier_by_company(key)
    except Exception:
        pass
    raise HTTPException(status_code=404, detail="No dossier found for this lead")


# ── Tenders Endpoints ────────────────────────────────────────────────────────

@app.get("/api/tenders")
def get_tenders(
    classification: Optional[str] = None,
    min_score: int = 0,
    region: Optional[str] = None,
    source: Optional[str] = None,
):
    """Get latest tender scan results with optional source filter."""
    # DB path
    try:
        from secureflex_intel.db import db_available, query_table, count_table, get_last_scan_time, tenders_table
        if db_available():
            rows = query_table(tenders_table, order_by="score", limit=500)
            if classification:
                rows = [r for r in rows if classification.lower() in (r.get("classification") or "").lower()]
            if min_score:
                rows = [r for r in rows if int(r.get("score") or 0) >= min_score]
            if region:
                rows = [r for r in rows if region.lower() in (r.get("region") or "").lower()]
            if source:
                rows = [r for r in rows if (r.get("source") or "contracts_finder") == source]
            return {
                "total": len(rows),
                "tenders": rows,
                "last_scan": get_last_scan_time("tenders"),
                "source": "database",
            }
    except Exception:
        pass
    # CSV fallback
    tenders_dir = str(settings.tenders_dir)
    latest_csv = get_latest_file(tenders_dir, "tender_leads_", ext=".csv")
    if not latest_csv:
        return {"total": 0, "tenders": [], "last_scan": None}
    rows = read_csv_as_dicts(latest_csv)
    if classification:
        rows = [r for r in rows if classification.lower() in r.get("classification", "").lower()]
    if min_score:
        rows = [r for r in rows if int(r.get("score", 0)) >= min_score]
    if region:
        rows = [r for r in rows if region.lower() in r.get("region", "").lower()]
    if source:
        rows = [r for r in rows if r.get("source", "contracts_finder") == source]
    last_modified = datetime.fromtimestamp(os.path.getmtime(latest_csv)).isoformat()
    return {"total": len(rows), "tenders": rows, "last_scan": last_modified, "source_file": os.path.basename(latest_csv)}


@app.get("/api/tenders/report")
def get_tender_report():
    """Get the latest tender scan report as markdown."""
    tenders_dir = str(settings.tenders_dir)
    latest_md = get_latest_file(tenders_dir, "tender_scan_", ext=".md")
    content = read_markdown_file(latest_md)
    return {
        "content": content,
        "file": os.path.basename(latest_md) if latest_md else None,
        "last_modified": datetime.fromtimestamp(os.path.getmtime(latest_md)).isoformat() if latest_md else None,
    }


@app.get("/api/tenders/geojson")
def get_tenders_geojson():
    """GeoJSON of tender locations for map display."""
    import random
    # DB path
    try:
        from secureflex_intel.db import db_available, query_table, tenders_table
        if db_available():
            rows = query_table(tenders_table, order_by="score", limit=200)
        else:
            raise Exception("no db")
    except Exception:
        tenders_dir = str(settings.tenders_dir)
        latest_csv = get_latest_file(tenders_dir, "tender_leads_", ext=".csv")
        rows = read_csv_as_dicts(latest_csv) if latest_csv else []

    features = []
    for row in rows:
        region = row.get("region", "")
        coords = region_to_coords(region) or (51.5074, -0.1278)
        lat = coords[0] + random.uniform(-0.02, 0.02)
        lng = coords[1] + random.uniform(-0.02, 0.02)
        features.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [lng, lat]},
            "properties": {
                "title": row.get("title", ""),
                "buyer": row.get("buyer", ""),
                "region": region,
                "score": int(row.get("score") or 0),
                "classification": row.get("classification", ""),
                "value": row.get("value", ""),
                "deadline": row.get("deadline", ""),
                "buyer_email": row.get("buyer_email", ""),
                "link": row.get("link", ""),
                "source": row.get("source", "contracts_finder"),
                "marker_type": "tender",
                "marker_color": _score_to_color(int(row.get("score") or 0)),
            },
        })
    return {"type": "FeatureCollection", "features": features}


# ── Prospects Endpoints ──────────────────────────────────────────────────────

@app.get("/api/prospects")
def get_prospects(
    company_type: Optional[str] = None,
    region: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
):
    """Get prospect companies from latest scan."""
    # DB path
    try:
        from secureflex_intel.db import db_available, query_table, count_table, get_last_scan_time, prospects_table
        if db_available():
            # When filtering, fetch all matching rows then paginate
            if company_type or region:
                all_rows = query_table(prospects_table, order_by="company_name", order_desc=False, limit=5000, offset=0)
                if company_type:
                    all_rows = [r for r in all_rows if company_type.lower() in (r.get("company_type") or "").lower()]
                if region:
                    all_rows = [r for r in all_rows if region.lower() in (r.get("region") or "").lower()]
                total = len(all_rows)
                rows = all_rows[offset:offset + limit]
            else:
                rows = query_table(prospects_table, order_by="company_name", order_desc=False, limit=limit, offset=offset)
                total = count_table(prospects_table)
            return {
                "total": total,
                "prospects": rows,
                "last_scan": get_last_scan_time("prospects"),
                "offset": offset,
                "limit": limit,
                "source": "database",
            }
    except Exception:
        pass
    # CSV fallback
    prospects_dir = str(settings.prospects_dir)
    latest_csv = get_latest_file(prospects_dir, "prospect_clients_", ext=".csv")
    if not latest_csv:
        return {"total": 0, "prospects": [], "last_scan": None}
    rows = read_csv_as_dicts(latest_csv)
    if company_type:
        rows = [r for r in rows if company_type.lower() in r.get("company_type", "").lower()]
    if region:
        rows = [r for r in rows if region.lower() in r.get("region", "").lower()]
    total = len(rows)
    rows = rows[offset:offset + limit]
    return {
        "total": total,
        "prospects": rows,
        "last_scan": datetime.fromtimestamp(os.path.getmtime(latest_csv)).isoformat() if latest_csv else None,
        "offset": offset,
        "limit": limit,
    }


@app.get("/api/prospects/geojson")
def get_prospects_geojson(limit: int = 200):
    """GeoJSON of prospect locations for map display."""
    import random
    try:
        from secureflex_intel.db import db_available, query_table, prospects_table
        if db_available():
            rows = query_table(prospects_table, order_by="scanned_at", limit=limit)
        else:
            raise Exception("no db")
    except Exception:
        prospects_dir = str(settings.prospects_dir)
        latest_csv = get_latest_file(prospects_dir, "prospect_clients_", ext=".csv")
        rows = read_csv_as_dicts(latest_csv) if latest_csv else []

    features = []
    for row in rows[:limit]:
        address = row.get("address", "")
        region = row.get("region", "")
        coords = None
        parts = address.split(",")
        for part in reversed(parts):
            part = part.strip()
            if part and len(part) <= 8:
                coords = postcode_to_coords(part)
                if coords:
                    break
        if not coords:
            coords = region_to_coords(region)
        if not coords:
            coords = (51.5074, -0.1278)
        lat = coords[0] + random.uniform(-0.015, 0.015)
        lng = coords[1] + random.uniform(-0.015, 0.015)
        features.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [lng, lat]},
            "properties": {
                "name": row.get("company_name", ""),
                "company_number": row.get("company_number", ""),
                "company_type": row.get("company_type", ""),
                "sic_codes": row.get("sic_codes", ""),
                "region": region,
                "address": address,
                "status": row.get("status", ""),
                "website_url": row.get("website_url", ""),
                "marker_type": "prospect",
                "marker_color": _type_to_color(row.get("company_type", "")),
            },
        })
    return {"type": "FeatureCollection", "features": features}


# ── Competitors Endpoints ────────────────────────────────────────────────────

@app.get("/api/competitors")
def get_competitors(
    limit: int = 100,
    offset: int = 0,
    acs_only: bool = False,
):
    """Get competitor companies from latest scan. Use acs_only=true to filter ACS-verified only."""
    # DB path
    try:
        from secureflex_intel.db import db_available, query_table, count_table, get_last_scan_time, competitors_table
        if db_available():
            filters = {}
            if acs_only:
                filters["acs_verified"] = True
            if acs_only:
                all_rows = query_table(competitors_table, filters=filters, order_by="scanned_at", limit=5000, offset=0)
                total = len(all_rows)
                rows = all_rows[offset:offset + limit]
            else:
                rows = query_table(competitors_table, order_by="scanned_at", limit=limit, offset=offset)
                total = count_table(competitors_table)
            # Parse service_categories JSON for frontend
            for r in rows:
                sc = r.get("service_categories")
                if sc and isinstance(sc, str):
                    try:
                        r["service_categories_parsed"] = json.loads(sc)
                    except Exception:
                        r["service_categories_parsed"] = []
                else:
                    r["service_categories_parsed"] = []
            return {
                "total": total,
                "competitors": rows,
                "last_scan": get_last_scan_time("competitors"),
                "offset": offset,
                "limit": limit,
                "source": "database",
            }
    except Exception:
        pass
    # CSV fallback
    prospects_dir = str(settings.prospects_dir)
    latest_csv = get_latest_file(prospects_dir, "competitors_", ext=".csv")
    if not latest_csv:
        return {"total": 0, "competitors": [], "last_scan": None}
    rows = read_csv_as_dicts(latest_csv)
    total = len(rows)
    return {
        "total": total,
        "competitors": rows[offset:offset + limit],
        "last_scan": datetime.fromtimestamp(os.path.getmtime(latest_csv)).isoformat(),
        "offset": offset,
        "limit": limit,
    }


@app.get("/api/competitors/geojson")
def get_competitors_geojson(limit: int = 200):
    """GeoJSON of competitor locations for map display."""
    import random
    try:
        from secureflex_intel.db import db_available, query_table, competitors_table
        if db_available():
            rows = query_table(competitors_table, order_by="scanned_at", limit=limit)
        else:
            raise Exception("no db")
    except Exception:
        prospects_dir = str(settings.prospects_dir)
        latest_csv = get_latest_file(prospects_dir, "competitors_", ext=".csv")
        rows = read_csv_as_dicts(latest_csv) if latest_csv else []

    features = []
    for row in rows[:limit]:
        address = row.get("address", "")
        region = row.get("region", "")
        coords = None
        parts = address.split(",")
        for part in reversed(parts):
            part = part.strip()
            if part and len(part) <= 8:
                coords = postcode_to_coords(part)
                if coords:
                    break
        if not coords:
            coords = region_to_coords(region)
        if not coords:
            coords = (51.5074, -0.1278)
        lat = coords[0] + random.uniform(-0.01, 0.01)
        lng = coords[1] + random.uniform(-0.01, 0.01)
        features.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [lng, lat]},
            "properties": {
                "name": row.get("company_name", ""),
                "company_number": row.get("company_number", ""),
                "sic_codes": row.get("sic_codes", ""),
                "region": region,
                "address": address,
                "marker_type": "competitor",
                "marker_color": "#ef4444",
            },
        })
    return {"type": "FeatureCollection", "features": features}


# ── Signals Endpoints ────────────────────────────────────────────────────────

@app.get("/api/signals")
def get_signals(
    signal_type: Optional[str] = None,
    priority: Optional[str] = None,
    limit: int = 100,
):
    """Get latest intent signals (news, crime, jobs)."""
    # DB path
    try:
        from secureflex_intel.db import db_available, query_table, count_table, get_last_scan_time, signals_table
        if db_available():
            rows = query_table(signals_table, order_by="scanned_at", limit=500)
            if signal_type:
                rows = [r for r in rows if signal_type.lower() in (r.get("signal_type") or "").lower()]
            if priority:
                rows = [r for r in rows if priority.lower() in (r.get("signal_category") or "").lower()]
            # Normalise field names for frontend compatibility
            for r in rows:
                r["type"] = r.get("signal_type", "")
                r["priority"] = r.get("signal_category", "")
                r["category"] = r.get("signal_type", "")
                r["relevance"] = r.get("description", "")
                r["url"] = r.get("link", "")
            # Sort by published date descending (newest first)
            from email.utils import parsedate_to_datetime
            def _parse_date(s):
                if not s:
                    return datetime.min
                try:
                    return parsedate_to_datetime(s)
                except Exception:
                    try:
                        # Try ISO format fallback
                        return datetime.fromisoformat(s.replace("Z", "+00:00"))
                    except Exception:
                        return datetime.min
            rows.sort(key=lambda r: _parse_date(r.get("published", "")), reverse=True)
            rows = rows[:limit]
            return {
                "total": count_table(signals_table),
                "signals": rows,
                "last_scan": get_last_scan_time("signals"),
                "source": "database",
            }
    except Exception:
        pass
    # CSV fallback
    signals_dir = str(settings.signals_dir)
    latest_csv = get_latest_file(signals_dir, "news_signals_", ext=".csv")
    if not latest_csv:
        return {"total": 0, "signals": [], "last_scan": None}
    rows = read_csv_as_dicts(latest_csv)
    if signal_type:
        rows = [r for r in rows if signal_type.lower() in r.get("type", "").lower()]
    if priority:
        rows = [r for r in rows if priority.lower() in r.get("priority", "").lower()]
    return {
        "total": len(rows),
        "signals": rows[:limit],
        "last_scan": datetime.fromtimestamp(os.path.getmtime(latest_csv)).isoformat(),
    }


@app.get("/api/signals/report")
def get_signals_report():
    """Get the latest signals report as markdown."""
    signals_dir = str(settings.signals_dir)
    latest_md = get_latest_file(signals_dir, "intent_signals_", ext=".md")
    content = read_markdown_file(latest_md)
    return {
        "content": content,
        "file": os.path.basename(latest_md) if latest_md else None,
    }


# ── Map Data (Combined GeoJSON) ─────────────────────────────────────────────

@app.get("/api/map/all")
def get_all_map_data(
    include_prospects: bool = True,
    include_competitors: bool = True,
    include_tenders: bool = True,
    prospect_limit: int = 200,
    competitor_limit: int = 100,
):
    """Combined GeoJSON for the main map view."""
    features = []
    if include_tenders:
        features.extend(get_tenders_geojson().get("features", []))
    if include_prospects:
        features.extend(get_prospects_geojson(limit=prospect_limit).get("features", []))
    if include_competitors:
        features.extend(get_competitors_geojson(limit=competitor_limit).get("features", []))
    return {
        "type": "FeatureCollection",
        "features": features,
        "metadata": {
            "total_features": len(features),
            "layers": {
                "tenders": sum(1 for f in features if f["properties"].get("marker_type") == "tender"),
                "prospects": sum(1 for f in features if f["properties"].get("marker_type") == "prospect"),
                "competitors": sum(1 for f in features if f["properties"].get("marker_type") == "competitor"),
            },
            "generated_at": datetime.utcnow().isoformat() + "Z",
        },
    }


# ── Live Feed Endpoint ───────────────────────────────────────────────────────

@app.get("/api/feed")
def get_live_feed(limit: int = 50):
    """Aggregated live feed of recent activity across all sources."""
    events = []

    # Tenders — DB first
    try:
        from secureflex_intel.db import db_available, query_table, tenders_table
        if db_available():
            t_rows = query_table(tenders_table, order_by="scanned_at", limit=20)
            for row in t_rows:
                events.append({
                    "type": "tender",
                    "timestamp": row.get("scanned_at", datetime.utcnow().isoformat()),
                    "title": f"Tender: {(row.get('title') or '')[:80]}",
                    "subtitle": f"{row.get('buyer', '')} — {row.get('region', '')}",
                    "score": int(row.get("score") or 0),
                    "classification": row.get("classification", ""),
                    "detail": f"Value: {row.get('value', 'N/A')} | Deadline: {row.get('deadline', 'N/A')}",
                    "link": row.get("link", ""),
                    "icon": "📋",
                })
        else:
            raise Exception("no db")
    except Exception:
        tenders_dir = str(settings.tenders_dir)
        latest_tender_csv = get_latest_file(tenders_dir, "tender_leads_", ext=".csv")
        if latest_tender_csv:
            rows = read_csv_as_dicts(latest_tender_csv)
            scan_time = datetime.fromtimestamp(os.path.getmtime(latest_tender_csv))
            for row in rows[:20]:
                events.append({
                    "type": "tender",
                    "timestamp": scan_time.isoformat(),
                    "title": f"Tender: {row.get('title', '')[:80]}",
                    "subtitle": f"{row.get('buyer', '')} — {row.get('region', '')}",
                    "score": int(row.get("score", 0)),
                    "classification": row.get("classification", ""),
                    "detail": f"Value: {row.get('value', 'N/A')} | Deadline: {row.get('deadline', 'N/A')}",
                    "link": row.get("link", ""),
                    "icon": "📋",
                })

    # Signals — DB first
    try:
        from secureflex_intel.db import db_available, query_table, signals_table
        if db_available():
            s_rows = query_table(signals_table, order_by="score", limit=30)
            for row in s_rows:
                score = int(row.get("score") or 0)
                icon = "🔴" if score >= 70 else "🟡" if score >= 40 else "🟢"
                events.append({
                    "type": "signal",
                    "timestamp": row.get("scanned_at", datetime.utcnow().isoformat()),
                    "title": (row.get("title") or "")[:80],
                    "subtitle": row.get("source", ""),
                    "score": score,
                    "detail": row.get("description", ""),
                    "link": row.get("link", ""),
                    "icon": icon,
                })
        else:
            raise Exception("no db")
    except Exception:
        signals_dir = str(settings.signals_dir)
        latest_signal_csv = get_latest_file(signals_dir, "news_signals_", ext=".csv")
        if latest_signal_csv:
            rows = read_csv_as_dicts(latest_signal_csv)
            for row in rows[:30]:
                priority = row.get("priority", "medium")
                icon = "🔴" if priority == "hot" else "🟡" if priority == "warm" else "🟢"
                events.append({
                    "type": "signal",
                    "timestamp": row.get("published", datetime.utcnow().isoformat()),
                    "title": row.get("title", "")[:80],
                    "subtitle": row.get("source", ""),
                    "priority": priority,
                    "detail": row.get("relevance", ""),
                    "link": row.get("url", row.get("link", "")),
                    "icon": icon,
                })

    events.sort(key=lambda e: e.get("timestamp", ""), reverse=True)
    return {
        "total": len(events),
        "events": events[:limit],
        "generated_at": datetime.utcnow().isoformat() + "Z",
    }


# ── Scan History Endpoint ────────────────────────────────────────────────────

@app.get("/api/scan/history")
def get_scan_history(limit: int = 20):
    """Get recent scan run history from the database."""
    try:
        from secureflex_intel.db import db_available, get_engine, scan_runs_table
        from sqlalchemy import select
        if db_available():
            engine = get_engine()
            with engine.connect() as conn:
                stmt = (
                    select(scan_runs_table)
                    .order_by(scan_runs_table.c.id.desc())
                    .limit(limit)
                )
                result = conn.execute(stmt)
                runs = []
                for row in result:
                    r = dict(row._mapping)
                    for k, v in r.items():
                        if isinstance(v, datetime):
                            r[k] = v.isoformat()
                    runs.append(r)
                # Check for any currently running scans
                running_stmt = (
                    select(scan_runs_table)
                    .where(scan_runs_table.c.status == "running")
                    .order_by(scan_runs_table.c.started_at.desc())
                )
                running_result = conn.execute(running_stmt)
                running = []
                for row in running_result:
                    r = dict(row._mapping)
                    for k, v in r.items():
                        if isinstance(v, datetime):
                            r[k] = v.isoformat()
                    running.append(r)
                return {
                    "runs": runs,
                    "running": running,
                    "total": len(runs),
                }
    except Exception as e:
        return {"runs": [], "running": [], "total": 0, "error": str(e)}
    return {"runs": [], "running": [], "total": 0}


# ── Scan Trigger Endpoints ───────────────────────────────────────────────────

@app.post("/api/scan/tenders")
def trigger_tender_scan(
    background_tasks: BackgroundTasks,
    days_back: int = 30,
    add_to_pipeline: bool = False,
):
    """Trigger a new tender scan in the background."""
    def run_scan():
        from secureflex_intel.sources.contracts_finder import main as tender_main
        import sys
        sys.argv = ["tender_radar", "--days-back", str(days_back)]
        if add_to_pipeline:
            sys.argv.append("--add-to-pipeline")
        try:
            tender_main()
        except SystemExit:
            pass

    background_tasks.add_task(run_scan)
    return {"status": "scan_started", "type": "tenders", "days_back": days_back}


@app.post("/api/scan/fts")
def trigger_fts_scan(background_tasks: BackgroundTasks):
    """Trigger a new Find a Tender Service scan in the background."""
    def run_scan():
        from secureflex_intel.db import record_scan_start, record_scan_complete
        from secureflex_intel.sources.find_a_tender import run_scan as fts_scan
        run_id = record_scan_start("fts")
        try:
            results = fts_scan(days_back=settings.fts_days_back)
            record_scan_complete(run_id, len(results))
        except Exception as e:
            record_scan_complete(run_id, 0, str(e))
            print(f"[FTS] Scan error: {e}")

    background_tasks.add_task(run_scan)
    return {"status": "scan_started", "type": "fts", "days_back": settings.fts_days_back}


@app.post("/api/scan/prospects")
def trigger_prospect_scan(
    background_tasks: BackgroundTasks,
    region: str = "london",
    max_results: int = 200,
):
    """Trigger a new Companies House prospect scan."""
    def run_scan():
        from secureflex_intel.sources.companies_house import main as ch_main
        import sys
        sys.argv = ["ch_prospector", "--mode", "clients", "--region", region, "--max-results", str(max_results)]
        try:
            ch_main()
        except SystemExit:
            pass

    background_tasks.add_task(run_scan)
    return {"status": "scan_started", "type": "prospects", "region": region}


@app.post("/api/scan/signals")
def trigger_signal_scan(background_tasks: BackgroundTasks):
    """Trigger a new intent signal scan."""
    def run_scan():
        from secureflex_intel.sources.signals import main as signal_main
        import sys
        sys.argv = ["signal_scanner"]
        try:
            signal_main()
        except SystemExit:
            pass

    background_tasks.add_task(run_scan)
    return {"status": "scan_started", "type": "signals"}


@app.post("/api/scan/competitors")
def trigger_competitor_scan(
    background_tasks: BackgroundTasks,
    region: str = "london",
):
    """Trigger a new competitor scan."""
    def run_scan():
        from secureflex_intel.sources.companies_house import main as ch_main
        import sys
        sys.argv = ["ch_prospector", "--mode", "competitors", "--region", region]
        try:
            ch_main()
        except SystemExit:
            pass

    background_tasks.add_task(run_scan)
    return {"status": "scan_started", "type": "competitors", "region": region}


# ── Scan Schedule Endpoints ──────────────────────────────────────────────────

@app.get("/api/scan/schedule")
def get_scan_schedule():
    """Get the current auto-scan schedule status."""
    return {
        "enabled": _scheduler_state["enabled"],
        "interval_hours": _scheduler_state["interval_hours"],
        "last_run": _scheduler_state["last_run"],
        "next_run": _scheduler_state["next_run"],
        "running": _scheduler_state["running"],
    }


@app.post("/api/scan/schedule")
def toggle_scan_schedule(payload: Dict[str, Any] = None):
    """Toggle auto-scan on/off. Optionally set interval_hours."""
    if payload is None:
        payload = {}

    # Toggle
    if "enabled" in payload:
        if payload["enabled"]:
            if "interval_hours" in payload:
                _scheduler_state["interval_hours"] = int(payload["interval_hours"])
            _start_scheduler()
        else:
            _stop_scheduler()
    else:
        # Toggle current state
        if _scheduler_state["enabled"]:
            _stop_scheduler()
        else:
            if "interval_hours" in payload:
                _scheduler_state["interval_hours"] = int(payload["interval_hours"])
            _start_scheduler()

    return get_scan_schedule()


# ── Utility ──────────────────────────────────────────────────────────────────

def _score_to_color(score: int) -> str:
    """Convert a score to a hex color for map markers."""
    if score >= 65:
        return "#ef4444"  # red (hot)
    elif score >= 40:
        return "#f59e0b"  # amber (warm)
    elif score >= 20:
        return "#22c55e"  # green (monitor)
    return "#94a3b8"      # gray (low)


def _type_to_color(company_type: str) -> str:
    """Convert company type to marker color."""
    colors = {
        "Facilities Management": "#3b82f6",   # blue
        "Hotel":                 "#a855f7",   # violet
        "Retail":                "#ec4899",   # pink
        "Healthcare":            "#14b8a6",   # teal
        "Education":             "#84cc16",   # lime
        "Construction":          "#f97316",   # orange
        "Warehouse":             "#eab308",   # yellow
        "Logistics":             "#eab308",   # yellow (same as warehouse)
        "Corporate":             "#06b6d4",   # cyan
        "Prime Contractor":      "#ef4444",   # red
        "Local Authority":       "#10b981",   # emerald
        "Venue":                 "#8b5cf6",   # purple
    }
    for key, color in colors.items():
        if key.lower() in company_type.lower():
            return color
    return "#6b7280"  # gray default


# ── Crime Intelligence Endpoints ────────────────────────────────────────────

@app.post("/api/scan/crime")
def trigger_crime_scan(background_tasks: BackgroundTasks):
    """Trigger a Police UK crime intelligence scan for all prospect locations."""
    def run_crime_scan():
        from secureflex_intel.db import record_scan_start, record_scan_complete
        from secureflex_intel.sources.police_uk import run_scan as police_scan
        run_id = record_scan_start("crime")
        try:
            result = police_scan()
            records = result.get("signals_written", 0) + result.get("crime_records_written", 0)
            record_scan_complete(run_id, records)
            print(f"[Crime] Scan complete: {result}")
        except Exception as e:
            record_scan_complete(run_id, 0, str(e))
            print(f"[Crime] Scan error: {e}")

    background_tasks.add_task(run_crime_scan)
    return {"status": "scan_started", "type": "crime"}


@app.get("/api/crime/near")
def get_crime_near(
    lat: float = Query(..., description="Latitude"),
    lng: float = Query(..., description="Longitude"),
):
    """
    Return crime density for a given lat/lng location.
    Calls the Police UK API in real-time for the most recent month.
    """
    try:
        from secureflex_intel.sources.police_uk import PoliceUKClient
        client = PoliceUKClient()
        density = client.calculate_crime_density(lat, lng)
        return density
    except Exception as e:
        print(f"[Crime] /crime/near error: {e}")
        return {
            "total": 0,
            "categories": {},
            "density_score": 0,
            "month": "",
            "security_relevant_total": 0,
            "error": str(e),
        }


@app.get("/api/crime/density/{company_number}")
def get_crime_density_for_prospect(company_number: str):
    """
    Return crime density score for a prospect company by its Companies House number.
    Looks up the prospect's registered address, geocodes it, and fetches crime data.
    """
    try:
        from secureflex_intel.db import db_available, query_table, prospects_table
        from secureflex_intel.sources.police_uk import PoliceUKClient, address_to_coords

        if not db_available():
            raise HTTPException(status_code=503, detail="Database not available")

        rows = query_table(prospects_table, filters={"company_number": company_number}, limit=1)
        if not rows:
            raise HTTPException(status_code=404, detail="Prospect not found")

        prospect = rows[0]
        address = prospect.get("address", "")
        coords = address_to_coords(address)

        if not coords:
            return {
                "company_number": company_number,
                "company_name": prospect.get("company_name", ""),
                "address": address,
                "total": 0,
                "categories": {},
                "density_score": 0,
                "month": "",
                "error": "Could not geocode address",
            }

        lat, lng = coords
        client = PoliceUKClient()
        density = client.calculate_crime_density(lat, lng)
        density["company_number"] = company_number
        density["company_name"] = prospect.get("company_name", "")
        density["address"] = address
        return density

    except HTTPException:
        raise
    except Exception as e:
        print(f"[Crime] /crime/density error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ── Tier 1 Source Endpoints ─────────────────────────────────────────────────

# -- SIA ACS Register --

@app.post("/api/scan/acs")
def trigger_acs_scan(
    background_tasks: BackgroundTasks,
    cross_ref_ch: bool = True,
):
    """Trigger a full SIA ACS Register scan (scrape + optional CH cross-ref)."""
    def run_acs():
        from secureflex_intel.db import record_scan_start, record_scan_complete
        from secureflex_intel.sources.sia_acs import run_scan as acs_scan
        run_id = record_scan_start("acs")
        try:
            result = acs_scan(cross_ref_ch=cross_ref_ch)
            record_scan_complete(run_id, result.get("contractors_written", 0))
            print(f"[ACS] Scan complete: {result}")
        except Exception as e:
            record_scan_complete(run_id, 0, str(e))
            print(f"[ACS] Scan error: {e}")

    background_tasks.add_task(run_acs)
    return {"status": "scan_started", "type": "acs", "cross_ref_ch": cross_ref_ch}


@app.post("/api/scan/acs/csv")
async def import_acs_csv(
    background_tasks: BackgroundTasks,
    cross_ref_ch: bool = False,
):
    """Import ACS roster from uploaded CSV content (fallback)."""
    # Accept CSV as request body text
    from starlette.requests import Request as StarletteRequest
    # We'll accept JSON with a "csv_content" field
    return {"status": "error", "detail": "Use POST /api/scan/acs/csv/upload with csv_content in JSON body"}


@app.post("/api/scan/acs/csv/upload")
async def import_acs_csv_upload(
    background_tasks: BackgroundTasks,
    payload: Dict[str, Any],
):
    """Import ACS roster from CSV content in JSON body {csv_content: '...', cross_ref_ch: false}."""
    csv_content = payload.get("csv_content", "")
    cross_ref_ch = payload.get("cross_ref_ch", False)
    if not csv_content:
        raise HTTPException(status_code=400, detail="csv_content is required")

    def run_import():
        from secureflex_intel.db import record_scan_start, record_scan_complete
        from secureflex_intel.sources.sia_acs import run_csv_import
        run_id = record_scan_start("acs_csv")
        try:
            result = run_csv_import(csv_content, cross_ref_ch=cross_ref_ch)
            record_scan_complete(run_id, result.get("contractors_written", 0))
        except Exception as e:
            record_scan_complete(run_id, 0, str(e))

    background_tasks.add_task(run_import)
    return {"status": "import_started", "type": "acs_csv"}


@app.get("/api/acs/stats")
def get_acs_stats():
    """Get ACS verification statistics for the competitors table."""
    try:
        from secureflex_intel.db import db_available, get_engine, competitors_table
        from sqlalchemy import select, func
        if not db_available():
            raise HTTPException(status_code=503, detail="Database not available")

        engine = get_engine()
        with engine.connect() as conn:
            total = conn.execute(
                select(func.count()).select_from(competitors_table)
            ).scalar() or 0
            acs_count = conn.execute(
                select(func.count()).select_from(competitors_table)
                .where(competitors_table.c.acs_verified == True)
            ).scalar() or 0

            # Category breakdown
            acs_rows = conn.execute(
                select(competitors_table.c.service_categories)
                .where(competitors_table.c.acs_verified == True)
            ).fetchall()

            category_counts = {}
            for row in acs_rows:
                cats_json = row[0]
                if cats_json:
                    try:
                        cats = json.loads(cats_json)
                        for cat in cats:
                            category_counts[cat] = category_counts.get(cat, 0) + 1
                    except Exception:
                        pass

            # Average ACS score
            avg_score = conn.execute(
                select(func.avg(competitors_table.c.acs_score))
                .where(competitors_table.c.acs_verified == True)
            ).scalar() or 0

        return {
            "total_competitors": total,
            "acs_verified": acs_count,
            "non_acs": total - acs_count,
            "acs_percentage": round(acs_count / total * 100, 1) if total else 0,
            "category_breakdown": category_counts,
            "average_acs_score": round(float(avg_score), 1),
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# -- The Gazette --

@app.post("/api/scan/gazette")
def trigger_gazette_scan(
    background_tasks: BackgroundTasks,
    days_back: int = 30,
):
    """Trigger a Gazette insolvency notice scan."""
    def run_gazette():
        from secureflex_intel.db import record_scan_start, record_scan_complete
        from secureflex_intel.sources.gazette import run_scan as gazette_scan
        run_id = record_scan_start("gazette")
        try:
            result = gazette_scan(days_back=days_back)
            record_scan_complete(run_id, result.get("signals_written", 0))
            print(f"[Gazette] Scan complete: {result}")
        except Exception as e:
            record_scan_complete(run_id, 0, str(e))
            print(f"[Gazette] Scan error: {e}")

    background_tasks.add_task(run_gazette)
    return {"status": "scan_started", "type": "gazette", "days_back": days_back}


@app.get("/api/gazette/notices")
def get_gazette_notices(
    days_back: int = 30,
    limit: int = 50,
):
    """Get recent Gazette insolvency notices (live query, no DB required)."""
    try:
        from secureflex_intel.sources.gazette import GazetteClient
        client = GazetteClient()
        notices = client.search_insolvency_notices(days_back=days_back)
        return {
            "total": len(notices),
            "notices": notices[:limit],
            "days_back": days_back,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# -- Companies House Events --

@app.post("/api/scan/ch-events")
def trigger_ch_events_scan(background_tasks: BackgroundTasks):
    """Trigger a Companies House events scan for all watched companies."""
    def run_ch_events():
        from secureflex_intel.db import record_scan_start, record_scan_complete
        from secureflex_intel.sources.ch_streaming import run_scan as ch_events_scan
        run_id = record_scan_start("ch_events")
        try:
            result = ch_events_scan()
            record_scan_complete(run_id, result.get("signals_written", 0))
            print(f"[CH Events] Scan complete: {result}")
        except Exception as e:
            record_scan_complete(run_id, 0, str(e))
            print(f"[CH Events] Scan error: {e}")

    background_tasks.add_task(run_ch_events)
    return {"status": "scan_started", "type": "ch_events"}


@app.get("/api/ch-events/{company_number}")
def get_company_events(company_number: str):
    """Get recent events for a specific company from Companies House."""
    try:
        from secureflex_intel.sources.ch_streaming import CHEventsClient, events_to_signals
        client = CHEventsClient()
        events = client.check_company_events(
            company_number=company_number,
            company_name=company_number,
            is_competitor=False,
        )
        signals = events_to_signals(events)
        return {
            "company_number": company_number,
            "events_found": len(events),
            "events": events,
            "signals": signals,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


## ── Static SPA Serving ───────────────────────────────────────────────────────
_STATIC_DIR = Path(__file__).parent.parent.parent / "static"

if _STATIC_DIR.exists():
    _ASSETS_DIR = _STATIC_DIR / "assets"
    if _ASSETS_DIR.exists():
        app.mount("/assets", StaticFiles(directory=str(_ASSETS_DIR)), name="assets")

    @app.get("/favicon.svg", include_in_schema=False)
    async def favicon():
        return FileResponse(str(_STATIC_DIR / "favicon.svg"))

    @app.get("/icons.svg", include_in_schema=False)
    async def icons_svg():
        f = _STATIC_DIR / "icons.svg"
        if f.exists():
            return FileResponse(str(f))
        return JSONResponse({"error": "not found"}, status_code=404)

    # Catch-all SPA route — must be LAST
    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa(full_path: str):
        if full_path.startswith("api/") or full_path in ("docs", "redoc", "openapi.json"):
            from fastapi import HTTPException
            raise HTTPException(status_code=404)
        index = _STATIC_DIR / "index.html"
        if index.exists():
            return FileResponse(str(index))
        return JSONResponse({"error": "Frontend not built yet. Run: cd frontend && pnpm build"}, status_code=503)

# ── Entry Point ──────────────────────────────────────────────────────────────
def run_server(host: str = "0.0.0.0", port: int = 8000, reload: bool = False):
    """Start the API server."""
    try:
        import uvicorn
    except ImportError:
        print("uvicorn not installed. Run: pip install uvicorn")
        sys.exit(1)
    uvicorn.run(
        "secureflex_intel.api.server:app",
        host=host,
        port=port,
        reload=reload,
    )
