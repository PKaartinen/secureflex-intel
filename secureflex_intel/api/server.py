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

# ── DB init on startup ────────────────────────────────────────────────────────

@app.on_event("startup")
def startup_event():
    """Initialise database tables on startup if DATABASE_URL is set."""
    try:
        from secureflex_intel.db import init_db
        init_db()
    except Exception as e:
        print(f"[DB] Startup init failed (non-fatal): {e}")

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
        from secureflex_intel.db import db_available, count_table, pipeline_table, tenders_table, prospects_table, signals_table, competitors_table
        if db_available():
            pipeline_count = count_table(pipeline_table)
            db_status = "connected"
            data_counts = {
                "tenders": count_table(tenders_table),
                "prospects": count_table(prospects_table),
                "competitors": count_table(competitors_table),
                "signals": count_table(signals_table),
                "briefs": len([f for f in os.listdir(str(settings.briefs_dir)) if f.endswith(".md")]) if os.path.exists(str(settings.briefs_dir)) else 0,
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
            "briefs": count_files(settings.briefs_dir),
        }

    return {
        "status": "ok",
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "database": db_status,
        "api_keys": {
            "companies_house": bool(settings.companies_house_api_key),
            "openai": bool(settings.openai_api_key),
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
            total = count_table(pipeline_table)
            return {"total": total, "leads": rows}
    except Exception:
        pass
    # CSV fallback
    pipeline_path = str(settings.pipeline_path)
    rows = read_csv_as_dicts(pipeline_path)
    if status:
        rows = [r for r in rows if status.lower() in r.get("status", "").lower()]
    if tier:
        rows = [r for r in rows if r.get("tier") == tier]
    if company_type:
        rows = [r for r in rows if company_type.lower() in r.get("company_type", "").lower()]
    rows.sort(key=lambda r: r.get(sort_by, ""), reverse=True)
    return {"total": len(rows), "leads": rows[:limit]}


@app.get("/api/pipeline/{company_id}")
def get_lead(company_id: str):
    """Get a single lead by company ID."""
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
    for row in rows:
        if row.get("company_id") == company_id:
            return row
    raise HTTPException(status_code=404, detail=f"Lead {company_id} not found")


from pydantic import BaseModel
from typing import Optional as Opt

class LeadCreate(BaseModel):
    company_name: str
    company_type: str = ""
    company_number: str = ""
    sic_codes: str = ""
    region: str = ""
    address: str = ""
    website_url: str = ""
    source: str = ""
    status: str = "Not Contacted"
    tier: str = ""
    notes: str = ""
    next_action: str = ""
    next_action_date: str = ""

class LeadUpdate(BaseModel):
    company_name: Opt[str] = None
    company_type: Opt[str] = None
    company_number: Opt[str] = None
    sic_codes: Opt[str] = None
    region: Opt[str] = None
    address: Opt[str] = None
    website_url: Opt[str] = None
    source: Opt[str] = None
    status: Opt[str] = None
    tier: Opt[str] = None
    notes: Opt[str] = None
    next_action: Opt[str] = None
    next_action_date: Opt[str] = None


def _generate_company_id() -> str:
    """Generate the next SEC-XXXX company ID."""
    try:
        from secureflex_intel.db import db_available, get_engine, pipeline_table
        from sqlalchemy import select, func
        if db_available():
            engine = get_engine()
            with engine.connect() as conn:
                result = conn.execute(select(func.count()).select_from(pipeline_table)).scalar() or 0
                return f"SEC-{result + 1:04d}"
    except Exception:
        pass
    return f"SEC-{int(time.time()) % 10000:04d}"


@app.post("/api/pipeline")
def create_lead(lead: LeadCreate):
    """Create a new pipeline lead."""
    try:
        from secureflex_intel.db import db_available, upsert_rows, pipeline_table
        if db_available():
            company_id = _generate_company_id()
            row = {
                "company_id": company_id,
                "company_name": lead.company_name,
                "company_type": lead.company_type,
                "company_number": lead.company_number,
                "sic_codes": lead.sic_codes,
                "region": lead.region,
                "address": lead.address,
                "website_url": lead.website_url,
                "source": lead.source,
                "status": lead.status or "Not Contacted",
                "tier": lead.tier,
                "notes": lead.notes,
                "next_action": lead.next_action,
                "next_action_date": lead.next_action_date,
            }
            written = upsert_rows(pipeline_table, [row], "company_id")
            if written:
                return {"status": "created", "company_id": company_id, "lead": row}
            raise HTTPException(status_code=500, detail="Failed to write lead")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e}")


@app.put("/api/pipeline/{company_id}")
def update_lead(company_id: str, updates: LeadUpdate):
    """Update an existing pipeline lead."""
    try:
        from secureflex_intel.db import db_available, get_engine, pipeline_table
        from sqlalchemy import update as sql_update
        if db_available():
            engine = get_engine()
            update_data = {k: v for k, v in updates.dict().items() if v is not None}
            if not update_data:
                raise HTTPException(status_code=400, detail="No fields to update")
            update_data["last_modified"] = datetime.utcnow()
            with engine.begin() as conn:
                result = conn.execute(
                    sql_update(pipeline_table)
                    .where(pipeline_table.c.company_id == company_id)
                    .values(**update_data)
                )
                if result.rowcount == 0:
                    raise HTTPException(status_code=404, detail=f"Lead {company_id} not found")
            return {"status": "updated", "company_id": company_id, "updated_fields": list(update_data.keys())}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e}")


@app.delete("/api/pipeline/{company_id}")
def delete_lead(company_id: str):
    """Delete a pipeline lead."""
    try:
        from secureflex_intel.db import db_available, get_engine, pipeline_table
        from sqlalchemy import delete as sql_delete
        if db_available():
            engine = get_engine()
            with engine.begin() as conn:
                result = conn.execute(
                    sql_delete(pipeline_table)
                    .where(pipeline_table.c.company_id == company_id)
                )
                if result.rowcount == 0:
                    raise HTTPException(status_code=404, detail=f"Lead {company_id} not found")
            return {"status": "deleted", "company_id": company_id}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e}")


# ── AI Analysis Endpoints ───────────────────────────────────────────────────

@app.get("/api/ai/status")
def get_ai_status():
    """Check if AI features are available."""
    try:
        from secureflex_intel.ai import ai_available
        return {"available": ai_available()}
    except Exception:
        return {"available": False}


@app.post("/api/ai/brief/{company_id}")
def generate_brief(company_id: str):
    """Generate an AI-powered research brief for a pipeline lead."""
    # Get the lead data
    try:
        from secureflex_intel.db import db_available, query_table, pipeline_table
        if db_available():
            rows = query_table(pipeline_table, filters={"company_id": company_id}, limit=1)
            if not rows:
                raise HTTPException(status_code=404, detail=f"Lead {company_id} not found")
            lead = rows[0]
        else:
            raise HTTPException(status_code=503, detail="Database unavailable")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    from secureflex_intel.ai import generate_ai_brief
    brief = generate_ai_brief(lead)
    return {"company_id": company_id, "brief": brief}


@app.post("/api/ai/analyze/tender")
def analyze_tender(tender: Dict[str, Any]):
    """Generate AI analysis for a tender opportunity."""
    from secureflex_intel.ai import generate_tender_analysis
    analysis = generate_tender_analysis(tender)
    return {"analysis": analysis}


@app.post("/api/ai/analyze/prospect")
def analyze_prospect(prospect: Dict[str, Any]):
    """Generate AI analysis for a prospect."""
    from secureflex_intel.ai import generate_prospect_analysis
    analysis = generate_prospect_analysis(prospect)
    return {"analysis": analysis}


# ── Tenders Endpoints ────────────────────────────────────────────────────────

@app.get("/api/tenders")
def get_tenders(
    classification: Optional[str] = None,
    min_score: int = 0,
    region: Optional[str] = None,
):
    """Get latest tender scan results."""
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
def get_competitors(limit: int = 100, offset: int = 0):
    """Get competitor companies from latest scan."""
    # DB path
    try:
        from secureflex_intel.db import db_available, query_table, count_table, get_last_scan_time, competitors_table
        if db_available():
            rows = query_table(competitors_table, order_by="scanned_at", limit=limit, offset=offset)
            total = count_table(competitors_table)
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


# ── Briefs Endpoints ─────────────────────────────────────────────────────────

@app.get("/api/briefs")
def get_briefs():
    """List all generated research briefs."""
    briefs_dir = str(settings.briefs_dir)
    if not os.path.exists(briefs_dir):
        return {"total": 0, "briefs": []}
    briefs = []
    for f in sorted(os.listdir(briefs_dir)):
        if f.endswith(".md"):
            filepath = os.path.join(briefs_dir, f)
            briefs.append({
                "filename": f,
                "company_id": f.split("_")[1] if "_" in f else "",
                "company_name": f.replace("brief_", "").replace(".md", "").replace("_", " ").title(),
                "size": os.path.getsize(filepath),
                "last_modified": datetime.fromtimestamp(os.path.getmtime(filepath)).isoformat(),
            })
    return {"total": len(briefs), "briefs": briefs}


@app.get("/api/briefs/{filename}")
def get_brief(filename: str):
    """Get a specific research brief."""
    briefs_dir = str(settings.briefs_dir)
    filepath = os.path.join(briefs_dir, filename)
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail=f"Brief {filename} not found")
    content = read_markdown_file(filepath)
    return {"filename": filename, "content": content}


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
