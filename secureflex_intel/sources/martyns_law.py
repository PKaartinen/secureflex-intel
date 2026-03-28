"""
Martyn's Law (Protect Duty) Tracking Source

Monitors legislation progress and cross-references with the prospect database
to identify venues that will be legally required to have security plans.
"""

import json
import time
import urllib.request
import urllib.parse
import xml.etree.ElementTree as ET
from datetime import datetime
from typing import List, Dict, Optional

# ── Constants ────────────────────────────────────────────────────────────────

HANSARD_SEARCH_URL = "https://hansard.parliament.uk/search/Contributions.rss"
LEGISLATION_API_URL = "https://www.legislation.gov.uk/new/data.feed"

KEYWORDS = [
    "Protect Duty",
    "Terrorism (Protection of Premises)",
    "Martyn's Law"
]

# SIC code prefixes for affected sectors
AFFECTED_SIC_PREFIXES = {
    "55": "Hotels",
    "90": "Venues/Events",
    "91": "Venues/Events",
    "92": "Venues/Events",
    "93": "Venues/Events",
    "85": "Education",
    "47": "Retail" # Possibly affected if over threshold
}

# ── Client ───────────────────────────────────────────────────────────────────

class MartynsLawClient:
    """Client for tracking Martyn's Law legislation and affected prospects."""

    def __init__(self):
        self.headers = {
            "User-Agent": "SecureFlex-Intel/1.0 (Martyns Law Tracker)",
        }

    def fetch_hansard_mentions(self) -> List[Dict]:
        """Fetch recent mentions from Hansard RSS."""
        mentions = []
        for keyword in KEYWORDS:
            params = {"searchTerm": keyword}
            url = f"{HANSARD_SEARCH_URL}?{urllib.parse.urlencode(params)}"
            try:
                req = urllib.request.Request(url, headers=self.headers)
                with urllib.request.urlopen(req, timeout=15) as response:
                    xml_data = response.read()
                    root = ET.fromstring(xml_data)
                    for item in root.findall(".//item"):
                        title = item.findtext("title", "")
                        link = item.findtext("link", "")
                        pub_date = item.findtext("pubDate", "")
                        description = item.findtext("description", "")
                        
                        mentions.append({
                            "title": title,
                            "link": link,
                            "published": pub_date,
                            "description": description,
                            "keyword": keyword
                        })
            except Exception as e:
                print(f"[Martyn's Law] Error fetching Hansard for '{keyword}': {e}")
        
        return mentions

    def fetch_legislation_updates(self) -> List[Dict]:
        """Fetch updates from legislation.gov.uk."""
        updates = []
        try:
            req = urllib.request.Request(LEGISLATION_API_URL, headers=self.headers)
            with urllib.request.urlopen(req, timeout=15) as response:
                xml_data = response.read()
                root = ET.fromstring(xml_data)
                # Atom feed namespace
                ns = {'atom': 'http://www.w3.org/2005/Atom'}
                for entry in root.findall(".//atom:entry", ns):
                    title = entry.findtext("atom:title", "", ns)
                    if any(kw.lower() in title.lower() for kw in KEYWORDS):
                        link_elem = entry.find("atom:link", ns)
                        link = link_elem.attrib.get("href", "") if link_elem is not None else ""
                        updated = entry.findtext("atom:updated", "", ns)
                        summary = entry.findtext("atom:summary", "", ns)
                        
                        updates.append({
                            "title": title,
                            "link": link,
                            "published": updated,
                            "description": summary
                        })
        except Exception as e:
            print(f"[Martyn's Law] Error fetching legislation updates: {e}")
            
        return updates

    def score_prospect(self, prospect: Dict) -> Dict:
        """Calculate Protect Duty Readiness score for a prospect."""
        sic_codes = str(prospect.get("sic_codes", ""))
        company_type = str(prospect.get("company_type", ""))
        
        venue_type_affected = False
        sector = "Unknown"
        
        # Check SIC codes
        for prefix, sec in AFFECTED_SIC_PREFIXES.items():
            if prefix in sic_codes:
                venue_type_affected = True
                sector = sec
                break
                
        # Estimate capacity (simplified heuristic)
        estimated_capacity = 0
        if sector == "Venues/Events":
            estimated_capacity = 1000
        elif sector == "Hotels":
            estimated_capacity = 500
        elif sector == "Education":
            estimated_capacity = 800
        elif sector == "Retail":
            estimated_capacity = 300
            
        # Base score calculation
        score = 0
        if venue_type_affected:
            score += 40
            if estimated_capacity >= 800:
                score += 35
            elif estimated_capacity >= 100:
                score += 20
                
        # Legislation imminence (static for now, could be dynamic based on bill progress)
        legislation_imminence = "High" if score > 50 else "Medium"
        
        return {
            "venue_type_affected": venue_type_affected,
            "estimated_capacity": estimated_capacity,
            "legislation_imminence": legislation_imminence,
            "protect_duty_score": min(100, score),
            "sector": sector
        }

# ── Orchestration ────────────────────────────────────────────────────────────

def run_scan() -> Dict:
    """Run the Martyn's Law scan."""
    client = MartynsLawClient()
    
    # 1. Fetch legislative updates
    mentions = client.fetch_hansard_mentions()
    updates = client.fetch_legislation_updates()
    
    signals = []
    now_str = datetime.utcnow().strftime("%Y-%m-%d")
    
    # Generate signals for legislative updates
    for item in mentions + updates:
        signals.append({
            "link": item.get("link", f"martyns-law-{len(signals)}"),
            "title": f"🏛️ Martyn's Law Update: {item.get('title', 'Legislative Mention')}",
            "company": "Regulatory",
            "source": "Hansard/Legislation",
            "published": item.get("published", now_str),
            "description": item.get("description", "")[:500],
            "score": 60,
            "signal_type": "regulatory_change",
            "signal_category": "warm",
            "scanned_at": datetime.utcnow(),
        })
        
    # 2. Cross-reference with prospects
    prospects_scored = 0
    high_priority_prospects = []
    
    try:
        from secureflex_intel.db import db_available, get_engine, prospects_table, upsert_rows, signals_table
        from sqlalchemy import select
        
        if db_available():
            engine = get_engine()
            with engine.connect() as conn:
                # Fetch all prospects
                result = conn.execute(select(prospects_table))
                prospects = [dict(r._mapping) for r in result]
                
                for p in prospects:
                    scoring = client.score_prospect(p)
                    if scoring["protect_duty_score"] >= 75:
                        high_priority_prospects.append({
                            "prospect": p,
                            "scoring": scoring
                        })
                        
                        # Generate signal for high priority prospect
                        signals.append({
                            "link": f"protect-duty-{p.get('company_number', '')}",
                            "title": f"🎯 Protect Duty Opportunity: {p.get('company_name', 'Unknown')}",
                            "company": p.get("company_name", "Unknown"),
                            "source": "Martyn's Law Tracker",
                            "published": now_str,
                            "description": f"High capacity venue ({scoring['sector']}, est. {scoring['estimated_capacity']}+ capacity) likely requiring security planning under Martyn's Law.",
                            "score": 75,
                            "signal_type": "protect_duty_opportunity",
                            "signal_category": "hot",
                            "scanned_at": datetime.utcnow(),
                        })
                    prospects_scored += 1
                    
            # Save signals
            if signals:
                written = upsert_rows(signals_table, signals, "link")
                print(f"[Martyn's Law] Wrote {written} signals to database")
                
    except Exception as e:
        print(f"[Martyn's Law] Error processing prospects: {e}")
        
    return {
        "status": "completed",
        "legislative_updates_found": len(mentions) + len(updates),
        "prospects_scored": prospects_scored,
        "high_priority_opportunities": len(high_priority_prospects),
        "signals_generated": len(signals),
        "signals_written": len(signals) # Assuming all written if no error
    }

def get_scored_prospects(limit: int = 50) -> List[Dict]:
    """Get prospects with their Protect Duty scores."""
    client = MartynsLawClient()
    scored = []
    
    try:
        from secureflex_intel.db import db_available, get_engine, prospects_table
        from sqlalchemy import select
        
        if db_available():
            engine = get_engine()
            with engine.connect() as conn:
                result = conn.execute(select(prospects_table))
                for r in result:
                    p = dict(r._mapping)
                    scoring = client.score_prospect(p)
                    if scoring["venue_type_affected"]:
                        p.update(scoring)
                        scored.append(p)
                        
            # Sort by score descending
            scored.sort(key=lambda x: x.get("protect_duty_score", 0), reverse=True)
            
    except Exception as e:
        print(f"[Martyn's Law] Error fetching scored prospects: {e}")
        
    return scored[:limit]

if __name__ == "__main__":
    print(json.dumps(run_scan(), indent=2, default=str))
