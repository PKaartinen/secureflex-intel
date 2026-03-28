"""
Charity Commission Source

Identifies large charities with venues that may need security services.
Uses the free Charity Commission public data extract (updated daily)
from https://register-of-charities.charitycommission.gov.uk/

Replaces the previous dummy-data implementation with real data.
"""

import csv
import io
import json
import os
import re
import time
import zipfile
import urllib.request
from datetime import datetime
from typing import List, Dict, Optional

from secureflex_intel.config import settings

# ── Constants ────────────────────────────────────────────────────────────────

# Free public data extract (updated daily, no API key needed)
CC_DATA_URL = "https://ccewuksprdoneregsadata1.blob.core.windows.net/data/txt/publicextract.charity.zip"

# Charity detail page base URL
CC_DETAIL_URL = "https://register-of-charities.charitycommission.gov.uk/charity-details/?regId={}&subId=0"

# Minimum annual income to qualify as a prospect (£500k+)
MIN_INCOME = 500_000

# Keywords indicating venue/premises-based charities likely needing security
VENUE_KEYWORDS = [
    "museum", "gallery", "theatre", "theater", "concert",
    "hospital", "hospice", "clinic",
    "school", "college", "university", "academy",
    "church", "cathedral", "mosque", "synagogue", "temple",
    "community centre", "community center", "village hall",
    "sports centre", "leisure centre", "swimming pool",
    "stadium", "arena",
    "zoo", "park", "garden",
    "library", "archive",
    "shelter", "hostel", "housing",
    "care home", "nursing home", "residential",
]

# London postcodes
LONDON_POSTCODES = [
    "E1", "E2", "E3", "E4", "E5", "E6", "E7", "E8", "E9", "E10",
    "E11", "E12", "E13", "E14", "E15", "E16", "E17", "E18", "E20",
    "EC1", "EC2", "EC3", "EC4",
    "N1", "N2", "N3", "N4", "N5", "N6", "N7", "N8", "N9", "N10",
    "N11", "N12", "N13", "N14", "N15", "N16", "N17", "N18", "N19", "N20",
    "N21", "N22",
    "NW1", "NW2", "NW3", "NW4", "NW5", "NW6", "NW7", "NW8", "NW9", "NW10", "NW11",
    "SE1", "SE2", "SE3", "SE4", "SE5", "SE6", "SE7", "SE8", "SE9", "SE10",
    "SE11", "SE12", "SE13", "SE14", "SE15", "SE16", "SE17", "SE18", "SE19",
    "SE20", "SE21", "SE22", "SE23", "SE24", "SE25", "SE26", "SE27", "SE28",
    "SW1", "SW2", "SW3", "SW4", "SW5", "SW6", "SW7", "SW8", "SW9", "SW10",
    "SW11", "SW12", "SW13", "SW14", "SW15", "SW16", "SW17", "SW18", "SW19", "SW20",
    "W1", "W2", "W3", "W4", "W5", "W6", "W7", "W8", "W9", "W10",
    "W11", "W12", "W13", "W14",
    "WC1", "WC2",
]

# ── Client ───────────────────────────────────────────────────────────────────

class CharityCommissionClient:
    """Client for fetching and filtering Charity Commission public data."""

    def __init__(self):
        self.data_dir = settings.data_dir / "charity_commission"
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.zip_path = self.data_dir / "publicextract.charity.zip"
        self.txt_path = self.data_dir / "publicextract.charity.txt"

    def _download_extract(self, force: bool = False) -> bool:
        """
        Download the public data extract if not already cached today.
        Returns True if data is available.
        """
        # Check if we already have today's data
        if not force and self.txt_path.exists():
            mtime = datetime.fromtimestamp(self.txt_path.stat().st_mtime)
            if mtime.date() == datetime.utcnow().date():
                print("[Charity Commission] Using cached data extract from today")
                return True

        print("[Charity Commission] Downloading public data extract...")
        try:
            req = urllib.request.Request(CC_DATA_URL, headers={
                "User-Agent": "SecureFlex-Intel/1.0 (Charity Commission Scanner)",
            })
            with urllib.request.urlopen(req, timeout=120) as response:
                data = response.read()

            # Save zip
            with open(self.zip_path, "wb") as f:
                f.write(data)

            # Extract
            with zipfile.ZipFile(self.zip_path, "r") as zf:
                zf.extractall(self.data_dir)

            print(f"[Charity Commission] Downloaded and extracted ({len(data) / 1024 / 1024:.1f} MB)")
            return True

        except Exception as e:
            print(f"[Charity Commission] Error downloading data: {e}")
            # Fall back to cached data if available
            if self.txt_path.exists():
                print("[Charity Commission] Using previously cached data")
                return True
            return False

    def _is_london(self, postcode: str) -> bool:
        """Check if a postcode is in London."""
        if not postcode:
            return False
        pc_upper = postcode.upper().strip()
        for prefix in LONDON_POSTCODES:
            if pc_upper.startswith(prefix) and (
                len(pc_upper) == len(prefix) or not pc_upper[len(prefix)].isalpha()
            ):
                return True
        return False

    def _is_venue_charity(self, name: str, activities: str) -> bool:
        """Check if a charity is likely to have physical venues needing security."""
        combined = f"{name} {activities}".lower()
        return any(kw in combined for kw in VENUE_KEYWORDS)

    def _score_prospect(self, charity: Dict) -> int:
        """Score a charity as a security prospect (0-100)."""
        score = 0
        name = charity.get("charity_name", "").lower()
        activities = charity.get("activities", "").lower()
        income = charity.get("income", 0) or 0

        # Venue type (0-40)
        venue_hits = sum(1 for kw in VENUE_KEYWORDS if kw in f"{name} {activities}")
        score += min(40, venue_hits * 15)

        # Income/size (0-30)
        if income >= 10_000_000:
            score += 30
        elif income >= 5_000_000:
            score += 25
        elif income >= 1_000_000:
            score += 20
        elif income >= 500_000:
            score += 10

        # London location (0-20)
        postcode = charity.get("postcode", "")
        if self._is_london(postcode):
            score += 20
        elif postcode:
            score += 5

        # Has contact info (0-10)
        if charity.get("email"):
            score += 5
        if charity.get("phone"):
            score += 5

        return min(100, score)

    def search_charities(self, min_income: int = None, london_only: bool = True) -> List[Dict]:
        """
        Search for charities that are potential security prospects.

        Filters:
        - Registered (active) charities only
        - Above minimum income threshold
        - Venue/premises-based (keywords in name or activities)
        - Optionally London-only

        Returns list of prospect dicts.
        """
        if min_income is None:
            min_income = MIN_INCOME

        if not self._download_extract():
            print("[Charity Commission] No data available — returning empty results")
            return []

        print(f"[Charity Commission] Filtering charities (min income: £{min_income:,}, London only: {london_only})...")

        prospects = []
        total_rows = 0
        registered_count = 0
        income_qualified = 0

        try:
            with open(self.txt_path, "r", encoding="utf-8", errors="replace") as f:
                reader = csv.DictReader(f, delimiter="\t")
                for row in reader:
                    total_rows += 1

                    # Only registered charities
                    if row.get("charity_registration_status", "").strip() != "Registered":
                        continue
                    registered_count += 1

                    # Income filter
                    try:
                        income = float(row.get("latest_income", 0) or 0)
                    except (ValueError, TypeError):
                        income = 0

                    if income < min_income:
                        continue
                    income_qualified += 1

                    # Location filter
                    postcode = row.get("charity_contact_postcode", "").strip()
                    if london_only and not self._is_london(postcode):
                        continue

                    # Venue/premises filter
                    name = row.get("charity_name", "")
                    activities = row.get("charity_activities", "")
                    if not self._is_venue_charity(name, activities):
                        continue

                    # Build prospect record
                    charity_number = row.get("registered_charity_number", "")
                    prospect = {
                        "charity_number": charity_number,
                        "charity_name": name,
                        "income": income,
                        "expenditure": float(row.get("latest_expenditure", 0) or 0),
                        "postcode": postcode,
                        "address": ", ".join(filter(None, [
                            row.get("charity_contact_address1", ""),
                            row.get("charity_contact_address2", ""),
                            row.get("charity_contact_address3", ""),
                            row.get("charity_contact_address4", ""),
                            row.get("charity_contact_address5", ""),
                            postcode,
                        ])),
                        "phone": row.get("charity_contact_phone", ""),
                        "email": row.get("charity_contact_email", ""),
                        "website": row.get("charity_contact_web", ""),
                        "activities": (activities or "")[:500],
                        "company_number": row.get("charity_company_registration_number", "") or f"CH-{charity_number}",
                        "date_registered": row.get("date_of_registration", ""),
                        "link": CC_DETAIL_URL.format(charity_number),
                        "source": "charity_commission",
                        "scanned_at": datetime.utcnow(),
                    }

                    # Score
                    prospect["score"] = self._score_prospect(prospect)
                    prospects.append(prospect)

        except Exception as e:
            print(f"[Charity Commission] Error reading data extract: {e}")
            return []

        # Sort by score descending
        prospects.sort(key=lambda x: x["score"], reverse=True)

        print(f"[Charity Commission] Processed {total_rows} rows: "
              f"{registered_count} registered, {income_qualified} above £{min_income:,}, "
              f"{len(prospects)} venue-based prospects")

        return prospects


# ── Orchestration ────────────────────────────────────────────────────────────

def run_scan() -> Dict:
    """Run the Charity Commission scan."""
    client = CharityCommissionClient()

    try:
        prospects = client.search_charities(london_only=True)
    except Exception as e:
        print(f"[Charity Commission] Scan failed: {e}")
        prospects = []

    # Save to database
    prospects_written = 0
    signals_generated = 0

    if prospects:
        try:
            from secureflex_intel.db import db_available, upsert_rows, prospects_table, signals_table

            if db_available():
                # Write prospects
                prospect_rows = []
                signal_rows = []

                for p in prospects:
                    prospect_rows.append({
                        "company_number": p.get("company_number", ""),
                        "company_name": p.get("charity_name", ""),
                        "company_type": "Charity",
                        "sic_codes": "",
                        "postcode": p.get("postcode", ""),
                        "address": p.get("address", ""),
                        "phone": p.get("phone", ""),
                        "email": p.get("email", ""),
                        "website": p.get("website", ""),
                        "income": str(int(p.get("income", 0))),
                        "source": "charity_commission",
                        "score": p.get("score", 0),
                        "scanned_at": datetime.utcnow(),
                    })

                    # Generate signal for high-scoring prospects
                    if p["score"] >= 60:
                        signal_rows.append({
                            "link": p.get("link", f"cc-{p.get('charity_number', '')}"),
                            "title": f"🏛️ Charity Prospect: {p.get('charity_name', '')} (£{p.get('income', 0):,.0f} income)",
                            "company": p.get("charity_name", ""),
                            "source": "Charity Commission",
                            "published": datetime.utcnow().strftime("%Y-%m-%d"),
                            "description": p.get("activities", "")[:300],
                            "score": p.get("score", 0),
                            "signal_type": "charity_prospect",
                            "signal_category": "warm" if p["score"] >= 70 else "monitor",
                            "scanned_at": datetime.utcnow(),
                        })

                prospects_written = upsert_rows(prospects_table, prospect_rows, "company_number")
                print(f"[Charity Commission] Wrote {prospects_written} prospects to database")

                if signal_rows:
                    signals_generated = upsert_rows(signals_table, signal_rows, "link")
                    print(f"[Charity Commission] Generated {signals_generated} signals")

        except Exception as e:
            print(f"[Charity Commission] Error saving to database: {e}")

    return {
        "status": "completed",
        "charities_found": len(prospects),
        "prospects_written": prospects_written,
        "signals_generated": signals_generated,
    }


def get_charity_details(charity_number: str) -> Optional[Dict]:
    """Get details for a specific charity from the data extract."""
    client = CharityCommissionClient()

    if not client._download_extract():
        return None

    try:
        with open(client.txt_path, "r", encoding="utf-8", errors="replace") as f:
            reader = csv.DictReader(f, delimiter="\t")
            for row in reader:
                if row.get("registered_charity_number", "").strip() == str(charity_number):
                    return dict(row)
    except Exception as e:
        print(f"[Charity Commission] Error looking up charity {charity_number}: {e}")

    return None


if __name__ == "__main__":
    print(json.dumps(run_scan(), indent=2, default=str))
