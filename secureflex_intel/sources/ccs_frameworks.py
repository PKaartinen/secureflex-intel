"""
CCS Framework Intelligence Source

Tracks Crown Commercial Service framework agreements for security services.
Focuses on RM6270, RM6187, RM6232.
"""

import json
import re
import time
from datetime import datetime
from typing import List, Dict, Optional

try:
    import requests
    from bs4 import BeautifulSoup
    HAS_DEPS = True
except ImportError:
    HAS_DEPS = False

# ── Constants ────────────────────────────────────────────────────────────────

CCS_BASE_URL = "https://www.crowncommercial.gov.uk"
AGREEMENTS_URL = f"{CCS_BASE_URL}/agreements"

TARGET_FRAMEWORKS = ["RM6270", "RM6187", "RM6232"]

# ── HTTP Helpers ─────────────────────────────────────────────────────────────

def _fetch_html(url: str, retries: int = 3) -> Optional[str]:
    """Fetch HTML content from a URL with retries."""
    if not HAS_DEPS:
        print("[CCS] Missing requests or beautifulsoup4")
        return None
        
    headers = {
        "User-Agent": "SecureFlex-Intel/1.0 (CCS Framework Scanner)",
        "Accept": "text/html,application/xhtml+xml",
    }
    
    for attempt in range(retries):
        try:
            resp = requests.get(url, headers=headers, timeout=30)
            resp.raise_for_status()
            return resp.text
        except Exception as e:
            print(f"[CCS] Fetch attempt {attempt + 1} failed: {e}")
            if attempt < retries - 1:
                time.sleep(5 * (attempt + 1))
    return None

# ── CCS Client ───────────────────────────────────────────────────────────────

class CCSClient:
    """Client for scraping CCS framework agreements."""

    def scrape_frameworks(self) -> List[Dict]:
        """Scrape target framework agreements."""
        if not HAS_DEPS:
            return []
            
        frameworks = []
        
        for ref in TARGET_FRAMEWORKS:
            print(f"[CCS] Scraping framework {ref}...")
            url = f"{AGREEMENTS_URL}/{ref}"
            html = _fetch_html(url)
            
            if not html:
                print(f"[CCS] Could not fetch {ref}")
                continue
                
            soup = BeautifulSoup(html, "html.parser")
            
            # Extract name
            name_el = soup.find("h1", class_="page-title")
            name = name_el.text.strip() if name_el else f"Framework {ref}"
            
            # Extract description
            desc_el = soup.find("div", class_="summary")
            description = desc_el.text.strip() if desc_el else ""
            
            # Extract expiry date
            expiry_date = ""
            details_list = soup.find("dl", class_="apollo-list--definition")
            if details_list:
                dts = details_list.find_all("dt")
                dds = details_list.find_all("dd")
                for dt, dd in zip(dts, dds):
                    if "End date" in dt.text:
                        expiry_date = dd.text.strip()
                        break
            
            # Extract suppliers (just count or list a few for now)
            suppliers = []
            suppliers_section = soup.find("section", id="suppliers")
            if suppliers_section:
                supplier_links = suppliers_section.find_all("a")
                for link in supplier_links:
                    if link.text.strip():
                        suppliers.append(link.text.strip())
            
            frameworks.append({
                "reference": ref,
                "name": name,
                "description": description,
                "expiry_date": expiry_date,
                "suppliers": suppliers,
                "url": url
            })
            
            time.sleep(1)
            
        print(f"[CCS] Scraped {len(frameworks)} frameworks")
        return frameworks

# ── Signal Generation & Persistence ──────────────────────────────────────────

def _parse_date(date_str: str) -> Optional[datetime]:
    """Parse CCS date format (e.g., '21/04/2025')."""
    if not date_str:
        return None
    try:
        # Try common formats
        for fmt in ["%d/%m/%Y", "%d %B %Y", "%Y-%m-%d"]:
            try:
                return datetime.strptime(date_str, fmt)
            except ValueError:
                continue
    except Exception:
        pass
    return None

def generate_signals(frameworks: List[Dict]) -> List[Dict]:
    """Convert frameworks to standard signal dicts based on expiry."""
    signals = []
    now = datetime.utcnow()
    
    for fw in frameworks:
        expiry_str = fw.get("expiry_date", "")
        expiry_dt = _parse_date(expiry_str)
        
        if not expiry_dt:
            continue
            
        months_to_expiry = (expiry_dt.year - now.year) * 12 + expiry_dt.month - now.month
        
        if 0 <= months_to_expiry <= 6:
            signals.append({
                "link": fw.get("url", ""),
                "title": f"🔵 CCS FRAMEWORK EXPIRING: {fw.get('name', '')} — {months_to_expiry} months",
                "company": "Crown Commercial Service",
                "source": "CCS Frameworks",
                "published": now.strftime("%Y-%m-%d"),
                "description": f"Framework {fw.get('reference', '')} expires on {expiry_str}. {fw.get('description', '')}",
                "score": 75,
                "signal_type": "framework_expiry",
                "signal_category": "hot",
                "scanned_at": now,
            })
        elif months_to_expiry > 6 and months_to_expiry < 48: # Arbitrary check for "new"
            # In a real system we'd track previous state to know if it's truly new
            pass
            
    return signals

def save_signals(signals: List[Dict]) -> int:
    """Persist CCS signals to the database."""
    if not signals:
        return 0
    try:
        from secureflex_intel.db import db_available, upsert_rows, signals_table
        if not db_available():
            print("[CCS] Database not available for signal storage")
            return 0
        written = upsert_rows(signals_table, signals, "link")
        print(f"[CCS] Wrote {written} signals to database")
        return written
    except Exception as e:
        print(f"[CCS] Error saving signals: {e}")
        return 0

# ── Orchestration ────────────────────────────────────────────────────────────

def run_scan() -> Dict:
    """Run the CCS frameworks scan."""
    client = CCSClient()
    
    # 1. Scrape frameworks
    frameworks = client.scrape_frameworks()
    
    # 2. Generate signals
    signals = generate_signals(frameworks)
    
    # 3. Save signals
    written = save_signals(signals)
    
    return {
        "status": "completed",
        "frameworks_found": len(frameworks),
        "signals_generated": len(signals),
        "signals_written": written,
        "frameworks": frameworks
    }

# ── CLI Entry Point ──────────────────────────────────────────────────────────

def main():
    """CLI entry point for CCS Frameworks scanner."""
    import argparse
    parser = argparse.ArgumentParser(description="CCS Frameworks Monitor")
    args = parser.parse_args()

    result = run_scan()
    # Don't print full frameworks list in CLI output to keep it clean
    if "frameworks" in result:
        del result["frameworks"]
    print(f"\n[CCS] Result: {json.dumps(result, indent=2, default=str)}")

if __name__ == "__main__":
    main()
