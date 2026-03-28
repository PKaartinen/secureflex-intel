"""
HSE Enforcement & Insolvency Source

Scrapes HSE enforcement notices for security/safety violations.
Fetches insolvency data for competitor failure detection.
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

HSE_URL = "https://www.hse.gov.uk/enforce/enforcementdb.htm"
INSOLVENCY_URL = "https://www.insolvencydirect.bis.gov.uk/"

SECURITY_KEYWORDS = [
    "security", "guarding", "patrol", "cctv", "access control", "workplace violence"
]

# ── HTTP Helpers ─────────────────────────────────────────────────────────────

def _fetch_html(url: str, retries: int = 3) -> Optional[str]:
    """Fetch HTML content from a URL with retries."""
    if not HAS_DEPS:
        print("[HSE/Insolvency] Missing requests or beautifulsoup4")
        return None
        
    headers = {
        "User-Agent": "SecureFlex-Intel/1.0 (HSE/Insolvency Scanner)",
        "Accept": "text/html,application/xhtml+xml",
    }
    
    for attempt in range(retries):
        try:
            resp = requests.get(url, headers=headers, timeout=30)
            resp.raise_for_status()
            return resp.text
        except Exception as e:
            print(f"[HSE/Insolvency] Fetch attempt {attempt + 1} failed for {url}: {e}")
            if attempt < retries - 1:
                time.sleep(5 * (attempt + 1))
    return None

# ── HSE Client ───────────────────────────────────────────────────────────────

class HSEClient:
    """Client for scraping HSE enforcement actions."""

    def scrape_enforcements(self) -> List[Dict]:
        """Scrape recent HSE enforcement notices."""
        # Note: The actual HSE database is complex and often requires form submission.
        # For this implementation, we simulate scraping the main page or a known endpoint.
        html = _fetch_html(HSE_URL)
        if not html:
            return []
            
        soup = BeautifulSoup(html, "html.parser")
        enforcements = []
        
        # Simulated extraction logic (would need adjustment based on actual DOM)
        # We look for tables or lists of notices
        tables = soup.find_all("table")
        for table in tables:
            rows = table.find_all("tr")
            for row in rows[1:]: # Skip header
                cols = row.find_all("td")
                if len(cols) >= 5:
                    company = cols[0].text.strip()
                    offence = cols[1].text.strip()
                    penalty = cols[2].text.strip()
                    date = cols[3].text.strip()
                    location = cols[4].text.strip()
                    
                    enforcements.append({
                        "company_name": company,
                        "offence": offence,
                        "penalty": penalty,
                        "date": date,
                        "location": location,
                        "url": HSE_URL
                    })
                    
        # If no real data found, return empty list (graceful degradation)
        print(f"[HSE] Scraped {len(enforcements)} enforcement notices")
        return enforcements

    def filter_security_enforcements(self, enforcements: List[Dict]) -> List[Dict]:
        """Filter enforcements for security-related keywords."""
        filtered = []
        for enf in enforcements:
            text_to_check = f"{enf.get('company_name', '')} {enf.get('offence', '')}".lower()
            if any(kw in text_to_check for kw in SECURITY_KEYWORDS):
                filtered.append(enf)
        print(f"[HSE] Filtered down to {len(filtered)} security-related enforcements")
        return filtered

# ── Insolvency Client ────────────────────────────────────────────────────────

class InsolvencyClient:
    """Client for fetching insolvency data."""

    def scrape_insolvencies(self) -> List[Dict]:
        """Scrape recent insolvency notices."""
        html = _fetch_html(INSOLVENCY_URL)
        if not html:
            return []
            
        soup = BeautifulSoup(html, "html.parser")
        insolvencies = []
        
        # Simulated extraction logic
        tables = soup.find_all("table")
        for table in tables:
            rows = table.find_all("tr")
            for row in rows[1:]:
                cols = row.find_all("td")
                if len(cols) >= 3:
                    company = cols[0].text.strip()
                    notice_type = cols[1].text.strip()
                    date = cols[2].text.strip()
                    
                    insolvencies.append({
                        "company_name": company,
                        "notice_type": notice_type,
                        "date": date,
                        "url": INSOLVENCY_URL
                    })
                    
        print(f"[Insolvency] Scraped {len(insolvencies)} insolvency notices")
        return insolvencies

# ── Cross-Reference & Signal Generation ──────────────────────────────────────

def _normalise_name(name: str) -> str:
    """Normalise company name for fuzzy matching."""
    name = name.upper().strip()
    for suffix in [" LIMITED", " LTD", " PLC", " LLP", " INC",
                   " SERVICES", " GROUP", " UK", " (UK)"]:
        name = name.replace(suffix, "")
    name = re.sub(r'[^A-Z0-9\s]', '', name)
    return name.strip()

def cross_reference_and_generate_signals(
    hse_data: List[Dict],
    insolvency_data: List[Dict]
) -> List[Dict]:
    """Cross-reference with competitors and generate signals."""
    competitors = {}
    try:
        from secureflex_intel.db import db_available, get_engine, competitors_table
        from sqlalchemy import select
        if db_available():
            engine = get_engine()
            with engine.connect() as conn:
                for row in conn.execute(select(competitors_table)):
                    r = dict(row._mapping)
                    norm = _normalise_name(r.get("company_name", ""))
                    competitors[norm] = r
    except Exception as e:
        print(f"[HSE/Insolvency] Error loading competitors: {e}")

    signals = []
    now_str = datetime.utcnow().strftime("%Y-%m-%d")
    
    # Process HSE
    for enf in hse_data:
        company = enf.get("company_name", "Unknown")
        norm_name = _normalise_name(company)
        
        is_competitor = False
        for cname in competitors:
            if norm_name in cname or cname in norm_name:
                is_competitor = True
                break
                
        score = 85 if is_competitor else 70
        title_prefix = "COMPETITOR" if is_competitor else "SECURITY COMPANY"
        
        signals.append({
            "link": f"{enf.get('url', HSE_URL)}#{norm_name}",
            "title": f"🔴 {title_prefix} ENFORCEMENT: {company}",
            "company": company,
            "source": "HSE Enforcement",
            "published": enf.get("date", now_str),
            "description": f"HSE enforcement action against {company}. Offence: {enf.get('offence', '')}. Penalty: {enf.get('penalty', '')}. Location: {enf.get('location', '')}",
            "score": score,
            "signal_type": "regulatory_enforcement",
            "signal_category": "hot" if is_competitor else "warm",
            "scanned_at": datetime.utcnow(),
        })
        
    # Process Insolvency
    for ins in insolvency_data:
        company = ins.get("company_name", "Unknown")
        norm_name = _normalise_name(company)
        
        is_competitor = False
        for cname in competitors:
            if norm_name in cname or cname in norm_name:
                is_competitor = True
                break
                
        if is_competitor:
            signals.append({
                "link": f"{ins.get('url', INSOLVENCY_URL)}#{norm_name}",
                "title": f"🚨 COMPETITOR INSOLVENCY: {company}",
                "company": company,
                "source": "Insolvency Service",
                "published": ins.get("date", now_str),
                "description": f"Competitor {company} has an insolvency notice: {ins.get('notice_type', '')}.",
                "score": 80,
                "signal_type": "competitor_failure",
                "signal_category": "hot",
                "scanned_at": datetime.utcnow(),
            })
            
    return signals

def save_signals(signals: List[Dict]) -> int:
    """Persist signals to the database."""
    if not signals:
        return 0
    try:
        from secureflex_intel.db import db_available, upsert_rows, signals_table
        if not db_available():
            print("[HSE/Insolvency] Database not available for signal storage")
            return 0
        written = upsert_rows(signals_table, signals, "link")
        print(f"[HSE/Insolvency] Wrote {written} signals to database")
        return written
    except Exception as e:
        print(f"[HSE/Insolvency] Error saving signals: {e}")
        return 0

# ── Orchestration ────────────────────────────────────────────────────────────

def run_hse_scan() -> Dict:
    """Run the HSE enforcement scan."""
    client = HSEClient()
    enforcements = client.scrape_enforcements()
    filtered = client.filter_security_enforcements(enforcements)
    signals = cross_reference_and_generate_signals(filtered, [])
    written = save_signals(signals)
    
    return {
        "status": "completed",
        "enforcements_found": len(enforcements),
        "security_enforcements": len(filtered),
        "signals_generated": len(signals),
        "signals_written": written,
    }

def run_insolvency_scan() -> Dict:
    """Run the Insolvency scan."""
    client = InsolvencyClient()
    insolvencies = client.scrape_insolvencies()
    signals = cross_reference_and_generate_signals([], insolvencies)
    written = save_signals(signals)
    
    return {
        "status": "completed",
        "insolvencies_found": len(insolvencies),
        "signals_generated": len(signals),
        "signals_written": written,
    }

# ── CLI Entry Point ──────────────────────────────────────────────────────────

def main():
    """CLI entry point for HSE/Insolvency scanner."""
    import argparse
    parser = argparse.ArgumentParser(description="HSE & Insolvency Monitor")
    parser.add_argument("--type", choices=["hse", "insolvency", "all"], default="all",
                        help="Which scan to run")
    args = parser.parse_args()

    results = {}
    if args.type in ["hse", "all"]:
        results["hse"] = run_hse_scan()
    if args.type in ["insolvency", "all"]:
        results["insolvency"] = run_insolvency_scan()
        
    print(f"\n[HSE/Insolvency] Result: {json.dumps(results, indent=2, default=str)}")

if __name__ == "__main__":
    main()
