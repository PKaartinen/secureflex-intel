"""
Martyn's Law (Protect Duty) Tracking Source

Monitors legislation progress and cross-references with the prospect database
to identify venues that will be legally required to have security plans.

Uses TheyWorkForYou API for Hansard mentions (replaces direct Hansard RSS
which is blocked by Cloudflare).
"""

import json
import time
import urllib.request
import urllib.parse
import xml.etree.ElementTree as ET
from datetime import datetime
from typing import List, Dict, Optional

from secureflex_intel.config import settings

# ── Constants ────────────────────────────────────────────────────────────────

# TheyWorkForYou API (replaces Hansard RSS which returns 403 due to Cloudflare)
TWFY_API_URL = "https://www.theyworkforyou.com/api/getHansard"

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
        """
        Fetch recent Hansard mentions via TheyWorkForYou API.

        Gracefully degrades if:
        - API key is not configured
        - API key is not yet activated
        - API returns any error
        Never raises an unhandled exception.
        """
        # ── Graceful degradation: check API key ──────────────────────────
        if not settings.twfy_api_key:
            print("[Martyn's Law] TheyWorkForYou API key not configured — skipping Hansard scan")
            return []

        mentions = []
        for keyword in KEYWORDS:
            params = {
                "search": keyword,
                "output": "json",
                "key": settings.twfy_api_key,
                "num": 20,
                "order": "d",
            }
            url = f"{TWFY_API_URL}?{urllib.parse.urlencode(params)}"

            try:
                req = urllib.request.Request(url, headers=self.headers)
                with urllib.request.urlopen(req, timeout=15) as response:
                    raw = response.read().decode("utf-8")

                    # TheyWorkForYou may return an error object instead of results
                    data = json.loads(raw)

                    # Check for API error response
                    if isinstance(data, dict) and "error" in data:
                        print(f"[Martyn's Law] TheyWorkForYou API error for '{keyword}': {data['error']}")
                        continue

                    # Extract rows from response
                    rows = []
                    if isinstance(data, dict):
                        rows = data.get("rows", [])
                    elif isinstance(data, list):
                        rows = data

                    for row in rows:
                        body = row.get("body", "")
                        # Clean HTML tags from body
                        import re
                        body_clean = re.sub(r"<[^>]+>", " ", body)
                        body_clean = re.sub(r"\s+", " ", body_clean).strip()

                        title_snippet = body_clean[:80] + "..." if len(body_clean) > 80 else body_clean
                        mentions.append({
                            "title": f"Parliamentary mention: {title_snippet}",
                            "description": body_clean,
                            "source": "TheyWorkForYou (Hansard)",
                            "link": row.get("listurl", ""),
                            "published": row.get("hdate", ""),
                            "speaker": row.get("speaker", {}).get("name", "") if isinstance(row.get("speaker"), dict) else str(row.get("speaker", "")),
                            "keyword": keyword,
                        })

            except urllib.error.HTTPError as e:
                if e.code == 401 or e.code == 403:
                    print(f"[Martyn's Law] TheyWorkForYou API key not active/authorized (HTTP {e.code}) — skipping Hansard scan")
                    return []  # Key not activated — skip all remaining keywords
                else:
                    print(f"[Martyn's Law] TheyWorkForYou HTTP error {e.code} for '{keyword}': {e.reason}")
            except json.JSONDecodeError as e:
                print(f"[Martyn's Law] TheyWorkForYou returned invalid JSON for '{keyword}': {e}")
            except Exception as e:
                print(f"[Martyn's Law] Error fetching TheyWorkForYou for '{keyword}': {e}")

            time.sleep(0.5)

        if mentions:
            print(f"[Martyn's Law] Found {len(mentions)} Hansard mentions via TheyWorkForYou")
        else:
            print("[Martyn's Law] No Hansard mentions found (API may not be active yet)")

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
    # Both fetch methods handle errors internally and return empty lists on failure
    mentions = client.fetch_hansard_mentions()
    updates = client.fetch_legislation_updates()

    signals = []
    now_str = datetime.utcnow().strftime("%Y-%m-%d")

    # Generate signals for legislative updates
    for item in mentions + updates:
        signals.append({
            "link": item.get("link", f"martyns-law-{len(signals)}"),
            "title": f"🏛️ Martyn's Law Update: {item.get('title', 'Legislative Mention')[:120]}",
            "company": "Regulatory",
            "source": item.get("source", "Hansard/Legislation"),
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

    result = {
        "status": "completed",
        "legislative_updates_found": len(mentions) + len(updates),
        "prospects_scored": prospects_scored,
        "high_priority_opportunities": len(high_priority_prospects),
        "signals_generated": len(signals),
        "signals_written": len(signals),  # Assuming all written if no error
    }

    # Add warning if Hansard data was skipped
    if not mentions and not settings.twfy_api_key:
        result["warning"] = "TheyWorkForYou API key not configured — Hansard mentions skipped"
    elif not mentions:
        result["warning"] = "No Hansard mentions found (API key may not be active yet)"

    return result

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
