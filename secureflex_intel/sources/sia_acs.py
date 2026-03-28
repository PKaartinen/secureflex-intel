"""
SIA ACS Register Source — Approved Contractor Scheme Roster

Scrapes the SIA Register of Approved Contractors to identify genuinely
SIA-approved security companies (~800), replacing inaccurate SIC-based
competitor data.

Data source: https://www.services.sia.homeoffice.gov.uk/Pages/acs-roac.aspx
Also supports CSV upload as a fallback import method.

Categories:
  CVIT = Cash and Valuables in Transit
  CP   = Close Protection
  DS   = Door Supervision
  KH   = Key Holding
  CCTV = Public Space Surveillance (CCTV)
  SG   = Security Guard
  VI   = Vehicle Immobilising
"""

import csv
import io
import json
import re
import time
from datetime import datetime
from typing import List, Dict, Optional, Tuple
from urllib.request import urlopen, Request
from urllib.error import URLError, HTTPError

# ── Constants ────────────────────────────────────────────────────────────────

ACS_ROSTER_URL = "https://www.services.sia.homeoffice.gov.uk/Pages/acs-roac.aspx?all"

# Map abbreviations to full category names
CATEGORY_MAP = {
    "CVIT": "Cash & Valuables in Transit",
    "CViT": "Cash & Valuables in Transit",
    "CP": "Close Protection",
    "DS": "Door Supervision",
    "KH": "Key Holding",
    "CCTV": "Public Space Surveillance (CCTV)",
    "SG": "Security Guard",
    "VI": "Vehicle Immobilising",
}

# ACS score calculation weights per category
CATEGORY_SCORES = {
    "Security Guard": 20,
    "Door Supervision": 15,
    "Key Holding": 10,
    "Public Space Surveillance (CCTV)": 15,
    "Close Protection": 20,
    "Cash & Valuables in Transit": 15,
    "Vehicle Immobilising": 5,
}


# ── HTML Parsing Helpers ─────────────────────────────────────────────────────

def _fetch_html(url: str, retries: int = 3) -> Optional[str]:
    """Fetch HTML content from a URL with retries."""
    headers = {
        "User-Agent": "SecureFlex-Intel/1.0 (ACS Roster Scanner)",
        "Accept": "text/html,application/xhtml+xml",
    }
    for attempt in range(retries):
        try:
            req = Request(url, headers=headers)
            with urlopen(req, timeout=60) as resp:
                return resp.read().decode("utf-8", errors="replace")
        except (URLError, HTTPError) as e:
            print(f"[SIA ACS] Fetch attempt {attempt + 1} failed: {e}")
            if attempt < retries - 1:
                time.sleep(5 * (attempt + 1))
        except Exception as e:
            print(f"[SIA ACS] Unexpected error fetching roster: {e}")
            if attempt < retries - 1:
                time.sleep(5 * (attempt + 1))
    return None


def _parse_categories(raw: str) -> List[str]:
    """Parse category abbreviations into full names."""
    if not raw:
        return []
    # Split on commas, spaces, dots, slashes
    parts = re.split(r'[,\s./]+', raw.strip())
    categories = []
    for part in parts:
        part = part.strip()
        if part in CATEGORY_MAP:
            full_name = CATEGORY_MAP[part]
            if full_name not in categories:
                categories.append(full_name)
    return categories


def _calculate_acs_score(categories: List[str]) -> int:
    """Calculate an ACS competitiveness score based on service categories."""
    score = 0
    for cat in categories:
        score += CATEGORY_SCORES.get(cat, 0)
    # Cap at 100
    return min(score, 100)


# ── SIA ACS Client ───────────────────────────────────────────────────────────

class SIAACSClient:
    """Client for fetching and parsing the SIA ACS Register."""

    def fetch_acs_roster(self) -> List[Dict]:
        """
        Scrape the ACS roster from the SIA website.
        Returns a list of dicts with: company_name, service_categories,
        expiry_date, and (if available) sia_number.
        """
        print("[SIA ACS] Fetching ACS roster from SIA website...")
        html = _fetch_html(ACS_ROSTER_URL)
        if not html:
            print("[SIA ACS] Failed to fetch roster HTML — use CSV import fallback")
            return []

        roster = []
        try:
            from bs4 import BeautifulSoup
            soup = BeautifulSoup(html, "html.parser")

            # Find the results table
            table = soup.find("table")
            if not table:
                print("[SIA ACS] No table found in roster page")
                return []

            rows = table.find_all("tr")
            for row in rows:
                cells = row.find_all("td")
                if len(cells) < 2:
                    continue

                # Column 0: Contractor name (may be a link)
                name_cell = cells[0]
                link = name_cell.find("a")
                company_name = (link.get_text(strip=True) if link
                                else name_cell.get_text(strip=True))

                # Column 1: Activities (sectors) approved
                activities_raw = cells[1].get_text(strip=True)
                categories = _parse_categories(activities_raw)

                # Column 2: Expiry date (if present)
                expiry_date = ""
                if len(cells) >= 3:
                    expiry_date = cells[2].get_text(strip=True)

                if not company_name:
                    continue

                entry = {
                    "company_name": company_name,
                    "service_categories": categories,
                    "service_categories_raw": activities_raw,
                    "expiry_date": expiry_date,
                    "acs_score": _calculate_acs_score(categories),
                }
                roster.append(entry)

            print(f"[SIA ACS] Parsed {len(roster)} contractors from roster")
        except ImportError:
            print("[SIA ACS] BeautifulSoup not available — use CSV import fallback")
            return []
        except Exception as e:
            print(f"[SIA ACS] Error parsing roster HTML: {e}")
            return []

        return roster

    def parse_csv_roster(self, csv_content: str) -> List[Dict]:
        """
        Parse a CSV-format ACS roster (fallback import method).
        Expected columns: company_name, sia_number, service_categories, geographic_coverage
        Flexible: also accepts columns named differently.
        """
        roster = []
        try:
            reader = csv.DictReader(io.StringIO(csv_content))
            for row in reader:
                # Normalise column names (lowercase, strip)
                norm = {k.strip().lower().replace(" ", "_"): v.strip()
                        for k, v in row.items() if k}

                company_name = (norm.get("company_name") or
                                norm.get("contractor") or
                                norm.get("name") or "")
                sia_number = (norm.get("sia_number") or
                              norm.get("sia_no") or
                              norm.get("number") or "")
                cats_raw = (norm.get("service_categories") or
                            norm.get("activities") or
                            norm.get("sectors") or "")
                geo = (norm.get("geographic_coverage") or
                       norm.get("region") or
                       norm.get("coverage") or "")

                if not company_name:
                    continue

                categories = _parse_categories(cats_raw)
                if not categories and cats_raw:
                    # Try treating as comma-separated full names
                    categories = [c.strip() for c in cats_raw.split(",") if c.strip()]

                roster.append({
                    "company_name": company_name,
                    "sia_number": sia_number,
                    "service_categories": categories,
                    "service_categories_raw": cats_raw,
                    "geographic_coverage": geo,
                    "acs_score": _calculate_acs_score(categories),
                })

            print(f"[SIA ACS] Parsed {len(roster)} contractors from CSV")
        except Exception as e:
            print(f"[SIA ACS] Error parsing CSV: {e}")
        return roster

    def cross_reference_companies_house(self, roster: List[Dict]) -> List[Dict]:
        """
        Look up each ACS contractor in Companies House to get company_number
        and other details. Uses the existing companies_house.py search.
        """
        print(f"[SIA ACS] Cross-referencing {len(roster)} contractors with Companies House...")
        try:
            from secureflex_intel.sources.companies_house import search_companies, get_api_key
            if not get_api_key():
                print("[SIA ACS] No Companies House API key — skipping cross-reference")
                return roster
        except ImportError:
            print("[SIA ACS] companies_house module not available")
            return roster

        enriched = 0
        for i, entry in enumerate(roster):
            name = entry["company_name"]
            # Strip trading-as suffixes for better search
            search_name = re.split(r'\s+t/a\s+|\s+trading\s+as\s+', name, flags=re.IGNORECASE)[0]
            search_name = search_name.strip()

            try:
                result = search_companies(search_name, items_per_page=5)
                if result and result.get("items"):
                    # Find best match
                    best = None
                    for item in result["items"]:
                        item_name = (item.get("title") or "").upper()
                        if search_name.upper() in item_name or item_name in search_name.upper():
                            best = item
                            break
                    if not best:
                        # Take first active result
                        for item in result["items"]:
                            if item.get("company_status") == "active":
                                best = item
                                break
                    if not best:
                        best = result["items"][0]

                    entry["company_number"] = best.get("company_number", "")
                    entry["company_type"] = best.get("company_type", "")
                    entry["status"] = best.get("company_status", "")
                    entry["sic_codes"] = ", ".join(
                        best.get("sic_codes", []) if isinstance(best.get("sic_codes"), list) else []
                    )
                    addr = best.get("registered_office_address") or best.get("address", {}) or {}
                    if isinstance(addr, dict):
                        parts = [
                            addr.get("address_line_1", ""),
                            addr.get("address_line_2", ""),
                            addr.get("locality", ""),
                            addr.get("region", ""),
                            addr.get("postal_code", ""),
                        ]
                        entry["address"] = ", ".join(p for p in parts if p)
                        entry["region"] = addr.get("region", "") or addr.get("locality", "")
                    entry["date_of_creation"] = best.get("date_of_creation", "")
                    enriched += 1
            except Exception as e:
                print(f"[SIA ACS] CH lookup failed for '{search_name}': {e}")

            # Rate limiting: CH API = 600 req/5min ≈ 2 req/sec
            if (i + 1) % 50 == 0:
                print(f"[SIA ACS] Processed {i + 1}/{len(roster)} — pausing for rate limit...")
                time.sleep(10)
            else:
                time.sleep(0.6)

        print(f"[SIA ACS] Cross-referenced {enriched}/{len(roster)} contractors with CH data")
        return roster


# ── Database Persistence ─────────────────────────────────────────────────────

def save_to_db(roster: List[Dict]) -> int:
    """
    Merge ACS roster data into the competitors table.
    - ACS + existing = update existing row, set acs_verified=True
    - ACS only = add new row with acs_verified=True
    - Existing only = keep but acs_verified remains False
    """
    try:
        from secureflex_intel.db import (
            db_available, get_engine, competitors_table, upsert_rows
        )
        if not db_available():
            print("[SIA ACS] Database not available")
            return 0
    except ImportError:
        print("[SIA ACS] DB module not available")
        return 0

    rows_to_upsert = []
    for entry in roster:
        company_number = entry.get("company_number", "")
        if not company_number:
            # Generate a placeholder key from name for companies not found in CH
            slug = re.sub(r'[^a-z0-9]', '', entry["company_name"].lower())[:18]
            company_number = f"ACS-{slug}"

        row = {
            "company_number": company_number,
            "company_name": entry["company_name"],
            "company_type": entry.get("company_type", ""),
            "sic_codes": entry.get("sic_codes", ""),
            "status": entry.get("status", "active"),
            "region": entry.get("region", ""),
            "address": entry.get("address", ""),
            "date_of_creation": entry.get("date_of_creation", ""),
            "website_url": entry.get("website_url", ""),
            "scanned_at": datetime.utcnow(),
            "sia_number": entry.get("sia_number", ""),
            "acs_verified": True,
            "service_categories": json.dumps(entry.get("service_categories", [])),
            "acs_score": entry.get("acs_score", 0),
        }
        rows_to_upsert.append(row)

    written = upsert_rows(competitors_table, rows_to_upsert, "company_number")
    print(f"[SIA ACS] Wrote {written} ACS contractors to competitors table")
    return written


# ── Orchestration ────────────────────────────────────────────────────────────

def run_scan(cross_ref_ch: bool = True) -> Dict:
    """
    Full ACS roster scan: fetch, optionally cross-reference with CH, persist.
    Returns a summary dict.
    """
    client = SIAACSClient()

    # Step 1: Fetch roster
    roster = client.fetch_acs_roster()
    if not roster:
        return {
            "status": "failed",
            "error": "Could not fetch ACS roster — use CSV import",
            "contractors_found": 0,
            "contractors_written": 0,
        }

    # Step 2: Cross-reference with Companies House (optional, slow)
    if cross_ref_ch:
        roster = client.cross_reference_companies_house(roster)

    # Step 3: Persist to database
    written = save_to_db(roster)

    return {
        "status": "completed",
        "contractors_found": len(roster),
        "contractors_written": written,
        "cross_referenced": cross_ref_ch,
    }


def run_csv_import(csv_content: str, cross_ref_ch: bool = False) -> Dict:
    """
    Import ACS roster from CSV content (fallback).
    Returns a summary dict.
    """
    client = SIAACSClient()
    roster = client.parse_csv_roster(csv_content)
    if not roster:
        return {
            "status": "failed",
            "error": "No contractors parsed from CSV",
            "contractors_found": 0,
            "contractors_written": 0,
        }

    if cross_ref_ch:
        roster = client.cross_reference_companies_house(roster)

    written = save_to_db(roster)
    return {
        "status": "completed",
        "contractors_found": len(roster),
        "contractors_written": written,
        "cross_referenced": cross_ref_ch,
    }


# ── CLI Entry Point ──────────────────────────────────────────────────────────

def main():
    """CLI entry point for ACS roster scanning."""
    import argparse
    parser = argparse.ArgumentParser(description="SIA ACS Register Scanner")
    parser.add_argument("--no-ch", action="store_true",
                        help="Skip Companies House cross-reference")
    parser.add_argument("--csv", type=str, default="",
                        help="Path to CSV file for manual import")
    args = parser.parse_args()

    if args.csv:
        with open(args.csv, "r", encoding="utf-8") as f:
            csv_content = f.read()
        result = run_csv_import(csv_content, cross_ref_ch=not args.no_ch)
    else:
        result = run_scan(cross_ref_ch=not args.no_ch)

    print(f"\n[SIA ACS] Result: {json.dumps(result, indent=2)}")


if __name__ == "__main__":
    main()
