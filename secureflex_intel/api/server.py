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
    from fastapi.responses import JSONResponse
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

# ── Helpers ──────────────────────────────────────────────────────────────────

def read_csv_as_dicts(filepath: str) -> List[Dict[str, str]]:
    """Read a CSV file and return list of dicts."""
    if not os.path.exists(filepath):
        return []
    with open(filepath, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        return list(reader)


def get_latest_file(directory: str, pattern: str = "") -> Optional[str]:
    """Get the most recently modified file in a directory."""
    if not os.path.exists(directory):
        return None
    files = []
    for f in os.listdir(directory):
        if pattern and pattern not in f:
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
    # Try full prefix first (e.g., "EC", "NW"), then first letter
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


# ── Status Endpoint ──────────────────────────────────────────────────────────

@app.get("/api/status")
def get_status():
    """System health check — API keys, paths, file counts."""
    settings.ensure_dirs()
    pipeline_path = str(settings.pipeline_path)
    pipeline_count = 0
    if os.path.exists(pipeline_path):
        with open(pipeline_path) as f:
            pipeline_count = sum(1 for _ in csv.DictReader(f))

    def count_files(d):
        d = str(d)
        return len([f for f in os.listdir(d) if os.path.isfile(os.path.join(d, f))]) if os.path.exists(d) else 0

    return {
        "status": "ok",
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "api_keys": {
            "companies_house": bool(settings.companies_house_api_key),
            "openai": bool(settings.openai_api_key),
        },
        "pipeline": {
            "path": pipeline_path,
            "exists": os.path.exists(pipeline_path),
            "lead_count": pipeline_count,
        },
        "data_counts": {
            "tenders": count_files(settings.tenders_dir),
            "prospects": count_files(settings.prospects_dir),
            "signals": count_files(settings.signals_dir),
            "briefs": count_files(settings.briefs_dir),
        },
        "settings": {
            "tender_region": settings.tender_region,
            "tender_days_back": settings.tender_days_back,
            "prospector_region": settings.prospector_region,
            "max_results": settings.max_results,
        },
    }


# ── Pipeline / Leads Endpoints ───────────────────────────────────────────────

@app.get("/api/pipeline")
def get_pipeline(
    status: Optional[str] = None,
    tier: Optional[str] = None,
    company_type: Optional[str] = None,
    sort_by: str = "last_modified",
    limit: int = 100,
):
    """Get pipeline leads with optional filtering."""
    pipeline_path = str(settings.pipeline_path)
    rows = read_csv_as_dicts(pipeline_path)

    if status:
        rows = [r for r in rows if status.lower() in r.get("status", "").lower()]
    if tier:
        rows = [r for r in rows if r.get("tier") == tier]
    if company_type:
        rows = [r for r in rows if company_type.lower() in r.get("company_type", "").lower()]

    # Sort
    rows.sort(key=lambda r: r.get(sort_by, ""), reverse=True)

    return {
        "total": len(rows),
        "leads": rows[:limit],
    }


@app.get("/api/pipeline/{company_id}")
def get_lead(company_id: str):
    """Get a single lead by company ID."""
    pipeline_path = str(settings.pipeline_path)
    rows = read_csv_as_dicts(pipeline_path)
    for row in rows:
        if row.get("company_id") == company_id:
            return row
    raise HTTPException(status_code=404, detail=f"Lead {company_id} not found")


@app.get("/api/pipeline/stats")
def get_pipeline_stats():
    """Pipeline statistics — counts by status, tier, type."""
    pipeline_path = str(settings.pipeline_path)
    rows = read_csv_as_dicts(pipeline_path)

    by_status = {}
    by_tier = {}
    by_type = {}
    by_source = {}

    for row in rows:
        s = row.get("status", "Unknown")
        by_status[s] = by_status.get(s, 0) + 1
        t = row.get("tier", "Unknown")
        by_tier[t] = by_tier.get(t, 0) + 1
        ct = row.get("company_type", "Unknown")
        by_type[ct] = by_type.get(ct, 0) + 1
        src = row.get("source", "Unknown")
        by_source[src] = by_source.get(src, 0) + 1

    return {
        "total": len(rows),
        "by_status": by_status,
        "by_tier": by_tier,
        "by_type": by_type,
        "by_source": by_source,
    }


# ── Tenders Endpoints ────────────────────────────────────────────────────────

@app.get("/api/tenders")
def get_tenders(
    classification: Optional[str] = None,
    min_score: int = 0,
    region: Optional[str] = None,
):
    """Get latest tender scan results."""
    tenders_dir = str(settings.tenders_dir)
    latest_csv = get_latest_file(tenders_dir, "tender_leads_")

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

    return {
        "total": len(rows),
        "tenders": rows,
        "last_scan": last_modified,
        "source_file": os.path.basename(latest_csv),
    }


@app.get("/api/tenders/report")
def get_tender_report():
    """Get the latest tender scan report as markdown."""
    tenders_dir = str(settings.tenders_dir)
    latest_md = get_latest_file(tenders_dir, "tender_scan_")
    content = read_markdown_file(latest_md)
    return {
        "content": content,
        "file": os.path.basename(latest_md) if latest_md else None,
        "last_modified": datetime.fromtimestamp(os.path.getmtime(latest_md)).isoformat() if latest_md else None,
    }


@app.get("/api/tenders/geojson")
def get_tenders_geojson():
    """GeoJSON of tender locations for map display."""
    tenders_dir = str(settings.tenders_dir)
    latest_csv = get_latest_file(tenders_dir, "tender_leads_")
    rows = read_csv_as_dicts(latest_csv) if latest_csv else []

    features = []
    for row in rows:
        region = row.get("region", "")
        coords = region_to_coords(region)
        if not coords:
            coords = (51.5074, -0.1278)  # Default to London

        # Add slight randomization to avoid stacking
        import random
        lat = coords[0] + random.uniform(-0.02, 0.02)
        lng = coords[1] + random.uniform(-0.02, 0.02)

        features.append({
            "type": "Feature",
            "geometry": {
                "type": "Point",
                "coordinates": [lng, lat],
            },
            "properties": {
                "title": row.get("title", ""),
                "buyer": row.get("buyer", ""),
                "region": region,
                "score": int(row.get("score", 0)),
                "classification": row.get("classification", ""),
                "value": row.get("value", ""),
                "deadline": row.get("deadline", ""),
                "buyer_email": row.get("buyer_email", ""),
                "link": row.get("link", ""),
                "marker_type": "tender",
                "marker_color": _score_to_color(int(row.get("score", 0))),
            },
        })

    return {
        "type": "FeatureCollection",
        "features": features,
    }


# ── Prospects Endpoints ──────────────────────────────────────────────────────

@app.get("/api/prospects")
def get_prospects(
    company_type: Optional[str] = None,
    region: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
):
    """Get prospect companies from latest scan."""
    prospects_dir = str(settings.prospects_dir)
    latest_csv = get_latest_file(prospects_dir, "prospect_clients_")

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
    prospects_dir = str(settings.prospects_dir)
    latest_csv = get_latest_file(prospects_dir, "prospect_clients_")
    rows = read_csv_as_dicts(latest_csv) if latest_csv else []

    features = []
    import random
    for row in rows[:limit]:
        address = row.get("address", "")
        region = row.get("region", "")

        # Try to get coords from postcode in address
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
            "geometry": {
                "type": "Point",
                "coordinates": [lng, lat],
            },
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

    return {
        "type": "FeatureCollection",
        "features": features,
    }


# ── Competitors Endpoints ────────────────────────────────────────────────────

@app.get("/api/competitors")
def get_competitors(limit: int = 100, offset: int = 0):
    """Get competitor companies from latest scan."""
    prospects_dir = str(settings.prospects_dir)
    latest_csv = get_latest_file(prospects_dir, "competitors_")

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
    prospects_dir = str(settings.prospects_dir)
    latest_csv = get_latest_file(prospects_dir, "competitors_")
    rows = read_csv_as_dicts(latest_csv) if latest_csv else []

    features = []
    import random
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
    signals_dir = str(settings.signals_dir)
    latest_csv = get_latest_file(signals_dir, "news_signals_")

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
    latest_md = get_latest_file(signals_dir, "intent_signals_")
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
    """
    Combined GeoJSON for the main map view.
    Returns all data layers in a single response.
    """
    features = []

    if include_tenders:
        tender_data = get_tenders_geojson()
        features.extend(tender_data.get("features", []))

    if include_prospects:
        prospect_data = get_prospects_geojson(limit=prospect_limit)
        features.extend(prospect_data.get("features", []))

    if include_competitors:
        competitor_data = get_competitors_geojson(limit=competitor_limit)
        features.extend(competitor_data.get("features", []))

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
    """
    Aggregated live feed of recent activity across all sources.
    Returns a chronologically sorted list of events.
    """
    events = []

    # Add tenders
    tenders_dir = str(settings.tenders_dir)
    latest_tender_csv = get_latest_file(tenders_dir, "tender_leads_")
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

    # Add signals
    signals_dir = str(settings.signals_dir)
    latest_signal_csv = get_latest_file(signals_dir, "news_signals_")
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

    # Sort by timestamp (newest first)
    events.sort(key=lambda e: e.get("timestamp", ""), reverse=True)

    return {
        "total": len(events),
        "events": events[:limit],
        "generated_at": datetime.utcnow().isoformat() + "Z",
    }


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
        "Facilities Management": "#3b82f6",  # blue
        "Venue/Events": "#8b5cf6",           # purple
        "Corporate": "#06b6d4",              # cyan
        "Prime Contractor": "#f97316",       # orange
        "Local Authority": "#10b981",        # emerald
    }
    for key, color in colors.items():
        if key.lower() in company_type.lower():
            return color
    return "#6b7280"  # gray default


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
