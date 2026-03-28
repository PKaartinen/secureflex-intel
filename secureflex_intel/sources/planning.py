"""
Planning Applications Source — Major Commercial Developments

Detects major commercial developments that will need security services.
Focuses on 5 London boroughs initially: Westminster, Tower Hamlets, Southwark, Camden, City of London.
"""

import json
import re
import time
from datetime import datetime, timedelta
from typing import List, Dict, Optional

try:
    import requests
    HAS_REQUESTS = True
except ImportError:
    HAS_REQUESTS = False
    from urllib.request import urlopen, Request
    from urllib.error import URLError, HTTPError
    from urllib.parse import urlencode

# ── Constants ────────────────────────────────────────────────────────────────

PLANIT_API_URL = "https://www.planit.org.uk/api/applics/json"

# Focus boroughs
BOROUGHS = [
    "Westminster",
    "Tower Hamlets",
    "Southwark",
    "Camden",
    "City of London"
]

# ── HTTP Helpers ─────────────────────────────────────────────────────────────

def _fetch_planit_data(params: Dict, retries: int = 3) -> Optional[Dict]:
    """Fetch data from PlanIt API with retries."""
    headers = {
        "User-Agent": "SecureFlex-Intel/1.0 (Planning Scanner)",
        "Accept": "application/json",
    }
    
    for attempt in range(retries):
        try:
            if HAS_REQUESTS:
                resp = requests.get(PLANIT_API_URL, params=params, headers=headers, timeout=30)
                resp.raise_for_status()
                return resp.json()
            else:
                from urllib.parse import urlencode
                full_url = f"{PLANIT_API_URL}?{urlencode(params)}"
                req = Request(full_url, headers=headers)
                with urlopen(req, timeout=30) as resp:
                    return json.loads(resp.read().decode("utf-8"))
        except Exception as e:
            print(f"[Planning] Fetch attempt {attempt + 1} failed: {e}")
            if attempt < retries - 1:
                time.sleep(5 * (attempt + 1))
    return None

# ── Planning Client ──────────────────────────────────────────────────────────

class PlanningClient:
    """Client for querying planning applications."""

    def search_applications(self, days_back: int = 30) -> List[Dict]:
        """Search for recent planning applications in target boroughs."""
        start_date = (datetime.utcnow() - timedelta(days=days_back)).strftime("%Y-%m-%d")
        end_date = datetime.utcnow().strftime("%Y-%m-%d")
        
        print(f"[Planning] Searching applications from {start_date} to {end_date}...")
        
        all_apps = []
        
        for borough in BOROUGHS:
            print(f"[Planning] Fetching for {borough}...")
            # PlanIt API uses 'auth' parameter for authority name, e.g., 'Westminster'
            params = {
                "auth": borough,
                "start_date": start_date,
                "end_date": end_date,
                "sort": "-date",
                "limit": 100
            }
            
            data = _fetch_planit_data(params)
            if data and "records" in data:
                for record in data["records"]:
                    record["borough"] = borough
                    all_apps.append(record)
            
            time.sleep(1)  # Be polite to the API
            
        print(f"[Planning] Found {len(all_apps)} total applications")
        return all_apps

    def filter_major_developments(self, applications: List[Dict]) -> List[Dict]:
        """Filter for major developments and extract key fields."""
        major_apps = []
        
        # Keywords indicating major developments
        hotel_leisure_kw = ["hotel", "leisure", "cinema", "gym", "restaurant"]
        commercial_kw = ["commercial", "office", "retail", "mixed-use", "mixed use", "warehouse", "industrial"]
        residential_kw = ["residential", "dwellings", "apartments", "flats", "units"]
        
        for app in applications:
            desc = (app.get("description") or "").lower()
            if not desc:
                continue
                
            # Determine type and score
            signal_type = None
            score = 0
            
            if any(kw in desc for kw in hotel_leisure_kw):
                signal_type = "new_development"
                score = 70
            elif any(kw in desc for kw in commercial_kw):
                signal_type = "new_development"
                score = 60
            elif any(kw in desc for kw in residential_kw):
                # Look for numbers indicating >100 units
                units_match = re.search(r'(\d+)\s*(?:residential|dwellings|apartments|flats|units)', desc)
                if units_match and int(units_match.group(1)) > 100:
                    signal_type = "new_development"
                    score = 40
                elif "major" in desc:
                    signal_type = "new_development"
                    score = 40
            
            if signal_type:
                major_apps.append({
                    "reference": app.get("uid", "Unknown"),
                    "address": app.get("address", "Unknown"),
                    "description": app.get("description", ""),
                    "applicant": app.get("applicant", "Unknown"),
                    "status": app.get("status", "Unknown"),
                    "borough": app.get("borough", "Unknown"),
                    "url": app.get("url", ""),
                    "date": app.get("when_updated", ""),
                    "signal_type": signal_type,
                    "score": score
                })
                
        print(f"[Planning] Filtered down to {len(major_apps)} major developments")
        return major_apps

# ── Signal Generation & Persistence ──────────────────────────────────────────

def generate_signals(applications: List[Dict]) -> List[Dict]:
    """Convert applications to standard signal dicts."""
    signals = []
    for app in applications:
        borough = app.get("borough", "")
        ref = app.get("reference", "")
        url = app.get("url", "") or f"https://www.planit.org.uk/application/{borough}/{ref}"
        
        signals.append({
            "link": url,
            "title": f"MAJOR DEVELOPMENT: {borough} - {ref}",
            "company": app.get("applicant", "Unknown Developer"),
            "source": "Planning Applications",
            "published": app.get("date", datetime.utcnow().strftime("%Y-%m-%d")),
            "description": f"Major development in {borough}. Address: {app.get('address', '')}. {app.get('description', '')}",
            "score": app.get("score", 50),
            "signal_type": app.get("signal_type", "new_development"),
            "signal_category": "warm",
            "scanned_at": datetime.utcnow(),
        })
    return signals

def save_signals(signals: List[Dict]) -> int:
    """Persist planning signals to the database."""
    if not signals:
        return 0
    try:
        from secureflex_intel.db import db_available, upsert_rows, signals_table
        if not db_available():
            print("[Planning] Database not available for signal storage")
            return 0
        written = upsert_rows(signals_table, signals, "link")
        print(f"[Planning] Wrote {written} signals to database")
        return written
    except Exception as e:
        print(f"[Planning] Error saving signals: {e}")
        return 0

# ── Orchestration ────────────────────────────────────────────────────────────

def run_scan(days_back: int = 30) -> Dict:
    """Run the planning applications scan."""
    client = PlanningClient()
    
    # 1. Fetch applications
    apps = client.search_applications(days_back=days_back)
    
    # 2. Filter major developments
    major_apps = client.filter_major_developments(apps)
    
    # 3. Generate signals
    signals = generate_signals(major_apps)
    
    # 4. Save signals
    written = save_signals(signals)
    
    return {
        "status": "completed",
        "applications_found": len(apps),
        "major_developments": len(major_apps),
        "signals_generated": len(signals),
        "signals_written": written,
    }

# ── CLI Entry Point ──────────────────────────────────────────────────────────

def main():
    """CLI entry point for Planning Applications scanner."""
    import argparse
    parser = argparse.ArgumentParser(description="Planning Applications Monitor")
    parser.add_argument("--days-back", type=int, default=30,
                        help="Number of days to look back (default: 30)")
    args = parser.parse_args()

    result = run_scan(days_back=args.days_back)
    print(f"\n[Planning] Result: {json.dumps(result, indent=2, default=str)}")

if __name__ == "__main__":
    main()
