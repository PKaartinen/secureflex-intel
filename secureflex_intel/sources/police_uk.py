"""
Police UK Open Data API Source — Crime Intelligence for SecureFlex Intel

Fetches street-level crime data from the free Police UK API (no API key required)
and generates crime signals for prospect locations.

API base: https://data.police.uk/api/
"""

import json
import time
from datetime import datetime, timedelta
from typing import List, Dict, Optional, Tuple
from urllib.request import urlopen, Request
from urllib.error import URLError, HTTPError
from urllib.parse import urlencode

# ── Constants ─────────────────────────────────────────────────────────────────

POLICE_API_BASE = "https://data.police.uk/api"

# Security-relevant crime categories (Police UK slugs)
SECURITY_RELEVANT_CATEGORIES = [
    "burglary",
    "robbery",
    "violent-crime",
    "criminal-damage-arson",
    "shoplifting",
    "theft-from-the-person",
    "other-theft",
]

# Severity weights for scoring (higher = more severe)
CATEGORY_SEVERITY: Dict[str, int] = {
    "robbery": 10,
    "violent-crime": 10,
    "burglary": 8,
    "criminal-damage-arson": 7,
    "theft-from-the-person": 5,
    "other-theft": 4,
    "shoplifting": 3,
}

# Thresholds
HIGH_CRIME_THRESHOLD = 50       # incidents/month → generate signal
HOT_SIGNAL_INCREASE_PCT = 200   # month-over-month % increase → HOT signal
HOT_SIGNAL_SCORE = 80


# ── Geocoding helpers ─────────────────────────────────────────────────────────

# Rough UK postcode area → (lat, lng) for fallback geocoding
POSTCODE_COORDS: Dict[str, Tuple[float, float]] = {
    "EC": (51.5155, -0.0922), "WC": (51.5170, -0.1200),
    "E":  (51.5200, -0.0500), "N":  (51.5500, -0.1000),
    "NW": (51.5500, -0.1700), "SE": (51.4700, -0.0600),
    "SW": (51.4700, -0.1600), "W":  (51.5100, -0.2000),
    "BR": (51.4000,  0.0400), "CR": (51.3700, -0.1000),
    "DA": (51.4500,  0.1500), "EN": (51.6500, -0.0800),
    "HA": (51.5800, -0.3400), "IG": (51.5600,  0.0700),
    "KT": (51.3800, -0.3000), "RM": (51.5500,  0.1800),
    "SM": (51.3600, -0.1700), "TW": (51.4500, -0.3400),
    "UB": (51.5300, -0.4400),
    # Major UK cities
    "M":  (53.4808, -2.2426),  # Manchester
    "B":  (52.4862, -1.8904),  # Birmingham
    "LS": (53.8008, -1.5491),  # Leeds
    "S":  (53.3811, -1.4701),  # Sheffield
    "L":  (53.4084, -2.9916),  # Liverpool
    "BS": (51.4545, -2.5879),  # Bristol
    "EH": (55.9533, -3.1883),  # Edinburgh
    "G":  (55.8642, -4.2518),  # Glasgow
    "CF": (51.4816, -3.1791),  # Cardiff
    "BT": (54.5973, -5.9301),  # Belfast
    "NG": (52.9548, -1.1581),  # Nottingham
    "CV": (52.4068, -1.5197),  # Coventry
    "OX": (51.7520, -1.2577),  # Oxford
    "CB": (52.2053,  0.1218),  # Cambridge
    "SO": (50.9097, -1.4044),  # Southampton
    "PO": (50.8198, -1.0880),  # Portsmouth
}


def address_to_coords(address: str) -> Optional[Tuple[float, float]]:
    """
    Extract approximate lat/lng from a UK address string using postcode prefix matching.
    Returns None if no match found.
    """
    if not address:
        return None
    address_upper = address.upper()
    # Try longest prefix first for accuracy
    for prefix in sorted(POSTCODE_COORDS.keys(), key=len, reverse=True):
        if prefix in address_upper:
            return POSTCODE_COORDS[prefix]
    return None


# ── HTTP helpers ──────────────────────────────────────────────────────────────

def _api_get(path: str, params: Optional[Dict] = None, retries: int = 3) -> Optional[Dict]:
    """
    Make a GET request to the Police UK API.
    Returns parsed JSON or None on failure.
    """
    url = f"{POLICE_API_BASE}{path}"
    if params:
        url = f"{url}?{urlencode(params)}"

    for attempt in range(retries):
        try:
            req = Request(url, headers={"User-Agent": "SecureFlex-Intel/1.0"})
            with urlopen(req, timeout=15) as resp:
                raw = resp.read().decode("utf-8")
                return json.loads(raw)
        except HTTPError as e:
            if e.code == 503:
                # Police API returns 503 when no data for that area/date
                return []
            if e.code == 404:
                return None
            print(f"[PoliceUK] HTTP {e.code} for {url}")
            if attempt < retries - 1:
                time.sleep(2 ** attempt)
        except URLError as e:
            print(f"[PoliceUK] URL error for {url}: {e}")
            if attempt < retries - 1:
                time.sleep(2 ** attempt)
        except Exception as e:
            print(f"[PoliceUK] Unexpected error for {url}: {e}")
            if attempt < retries - 1:
                time.sleep(1)
    return None


# ── Main Client ───────────────────────────────────────────────────────────────

class PoliceUKClient:
    """
    Client for the Police UK Open Data API.

    Provides crime data fetching, density calculation, and signal generation
    for prospect locations.
    """

    def __init__(self):
        self._categories_cache: Optional[List[Dict]] = None

    # ── Core API methods ──────────────────────────────────────────────────────

    def fetch_crime_categories(self) -> List[Dict]:
        """Fetch and cache all crime categories from the API."""
        if self._categories_cache is not None:
            return self._categories_cache
        result = _api_get("/crime-categories")
        self._categories_cache = result if isinstance(result, list) else []
        return self._categories_cache

    def fetch_crimes_near(self, lat: float, lng: float, date_str: str) -> List[Dict]:
        """
        Fetch all street-level crimes within ~1 mile of (lat, lng) for a given month.

        Args:
            lat: Latitude
            lng: Longitude
            date_str: Month in YYYY-MM format (e.g. "2024-11")

        Returns:
            List of crime dicts from the Police UK API
        """
        params = {"lat": lat, "lng": lng, "date": date_str}
        result = _api_get("/crimes-street/all-crime", params=params)
        if isinstance(result, list):
            return result
        return []

    def fetch_crimes_for_prospects(self) -> List[Dict]:
        """
        Iterate all prospect locations from the DB and fetch recent crime data.

        Returns a flat list of crime records enriched with prospect context.
        """
        try:
            from secureflex_intel.db import db_available, query_table, prospects_table
            if not db_available():
                print("[PoliceUK] DB not available — cannot fetch prospects")
                return []
            prospects = query_table(prospects_table, limit=500)
        except Exception as e:
            print(f"[PoliceUK] Failed to load prospects: {e}")
            return []

        # Use last 2 months for data
        now = datetime.utcnow()
        months = [
            (now - timedelta(days=30)).strftime("%Y-%m"),
            now.strftime("%Y-%m"),
        ]

        all_crimes: List[Dict] = []
        processed = 0

        for prospect in prospects:
            address = prospect.get("address", "")
            company_name = prospect.get("company_name", "")
            coords = address_to_coords(address)
            if not coords:
                continue

            lat, lng = coords
            for month in months:
                crimes = self.fetch_crimes_near(lat, lng, month)
                for crime in crimes:
                    crime["_prospect_name"] = company_name
                    crime["_prospect_address"] = address
                    crime["_lat"] = lat
                    crime["_lng"] = lng
                    crime["_month"] = month
                all_crimes.extend(crimes)
                time.sleep(0.3)  # Rate limiting — be polite to the API

            processed += 1
            if processed % 10 == 0:
                print(f"[PoliceUK] Processed {processed}/{len(prospects)} prospects")

        print(f"[PoliceUK] Fetched {len(all_crimes)} crimes across {processed} prospect locations")
        return all_crimes

    def calculate_crime_density(self, lat: float, lng: float) -> Dict:
        """
        Calculate crime density score for a location based on the most recent month.

        Returns a dict with:
            total: int — total crimes
            categories: Dict[str, int] — breakdown by category
            density_score: int (0–100)
            month: str
            security_relevant_total: int
        """
        # Use previous month (current month data may be incomplete)
        date_str = (datetime.utcnow() - timedelta(days=30)).strftime("%Y-%m")
        crimes = self.fetch_crimes_near(lat, lng, date_str)

        categories: Dict[str, int] = {}
        for crime in crimes:
            cat = crime.get("category", "unknown")
            categories[cat] = categories.get(cat, 0) + 1

        total = len(crimes)
        security_relevant = sum(
            categories.get(c, 0) for c in SECURITY_RELEVANT_CATEGORIES
        )

        # Density score: 0–100 based on total crimes, capped at 200
        density_score = min(100, int((total / 200) * 100))

        return {
            "total": total,
            "categories": categories,
            "density_score": density_score,
            "month": date_str,
            "security_relevant_total": security_relevant,
        }

    # ── Signal generation ─────────────────────────────────────────────────────

    def generate_signals(self, crimes: List[Dict]) -> List[Dict]:
        """
        Analyse crime records and generate signals for high-crime prospect areas.

        Args:
            crimes: List of crime dicts (from fetch_crimes_for_prospects)

        Returns:
            List of signal dicts ready for insertion into the signals table
        """
        # Group crimes by (prospect_name, month)
        groups: Dict[str, Dict] = {}
        for crime in crimes:
            prospect_name = crime.get("_prospect_name", "Unknown")
            month = crime.get("_month", "")
            key = f"{prospect_name}|{month}"
            if key not in groups:
                groups[key] = {
                    "prospect_name": prospect_name,
                    "address": crime.get("_prospect_address", ""),
                    "lat": crime.get("_lat"),
                    "lng": crime.get("_lng"),
                    "month": month,
                    "crimes": [],
                }
            groups[key]["crimes"].append(crime)

        # Build per-prospect monthly summaries
        # Structure: { prospect_name: { month: { total, categories } } }
        summaries: Dict[str, Dict] = {}
        for key, group in groups.items():
            name = group["prospect_name"]
            month = group["month"]
            if name not in summaries:
                summaries[name] = {}
            cats: Dict[str, int] = {}
            for crime in group["crimes"]:
                cat = crime.get("category", "unknown")
                cats[cat] = cats.get(cat, 0) + 1
            summaries[name][month] = {
                "total": len(group["crimes"]),
                "categories": cats,
                "address": group["address"],
                "lat": group["lat"],
                "lng": group["lng"],
            }

        signals: List[Dict] = []
        now = datetime.utcnow()
        current_month = now.strftime("%Y-%m")
        prev_month = (now - timedelta(days=30)).strftime("%Y-%m")

        for prospect_name, monthly in summaries.items():
            latest_month = max(monthly.keys()) if monthly else None
            if not latest_month:
                continue

            data = monthly[latest_month]
            total = data["total"]
            cats = data["categories"]
            address = data["address"]

            if total < HIGH_CRIME_THRESHOLD:
                continue  # Below threshold — no signal

            # Calculate severity score
            severity_score = self._calculate_severity_score(cats, total)

            # Check for month-over-month spike (HOT signal)
            is_hot = False
            if current_month in monthly and prev_month in monthly:
                curr_total = monthly[current_month]["total"]
                prev_total = monthly[prev_month]["total"]
                if prev_total > 0:
                    increase_pct = ((curr_total - prev_total) / prev_total) * 100
                    if increase_pct >= HOT_SIGNAL_INCREASE_PCT:
                        is_hot = True
                        severity_score = max(severity_score, HOT_SIGNAL_SCORE)

            # Build signal
            signal_category = "hot" if (is_hot or severity_score >= HOT_SIGNAL_SCORE) else (
                "warm" if severity_score >= 50 else "low"
            )

            # Top crime category for description
            top_cat = max(cats, key=lambda c: cats[c]) if cats else "crime"
            top_cat_display = top_cat.replace("-", " ").title()

            title = f"High crime area near {prospect_name}: {total} incidents"
            description = (
                f"Location: {address or 'Unknown'}. "
                f"Month: {latest_month}. "
                f"Top category: {top_cat_display} ({cats.get(top_cat, 0)} incidents). "
                f"Security-relevant crimes: {sum(cats.get(c, 0) for c in SECURITY_RELEVANT_CATEGORIES)}."
            )
            if is_hot:
                description += " ⚠️ Month-over-month spike detected (>200% increase)."

            # Unique link key for deduplication
            link_key = f"police-uk-crime-{prospect_name.lower().replace(' ', '-')}-{latest_month}"

            signal = {
                "link": link_key,
                "title": title,
                "company": prospect_name,
                "source": "Police UK Open Data",
                "published": f"{latest_month}-01T00:00:00",
                "description": description,
                "score": severity_score,
                "signal_type": "crime",
                "signal_category": signal_category,
                "scanned_at": now,
            }
            signals.append(signal)

        print(f"[PoliceUK] Generated {len(signals)} crime signals")
        return signals

    def _calculate_severity_score(self, categories: Dict[str, int], total: int) -> int:
        """
        Calculate a 0–100 severity score based on crime category weights and volume.
        """
        if total == 0:
            return 0

        weighted_sum = 0
        for cat, count in categories.items():
            weight = CATEGORY_SEVERITY.get(cat, 2)
            weighted_sum += count * weight

        # Normalise: max possible weight is 10 per crime
        max_weighted = total * 10
        severity_ratio = weighted_sum / max_weighted if max_weighted > 0 else 0

        # Volume factor: more crimes = higher base score
        volume_score = min(50, int((total / 200) * 50))

        # Severity factor: 0–50 based on category weights
        severity_score = int(severity_ratio * 50)

        return min(100, volume_score + severity_score)

    # ── DB persistence ────────────────────────────────────────────────────────

    def save_crime_data(self, crimes: List[Dict]) -> int:
        """
        Persist raw crime records to the crime_data table.
        Returns number of rows written.
        """
        try:
            from secureflex_intel.db import db_available, get_engine, crime_data_table
            from sqlalchemy.dialects.postgresql import insert as pg_insert
            if not db_available():
                return 0

            engine = get_engine()
            now = datetime.utcnow()
            written = 0

            with engine.begin() as conn:
                for crime in crimes:
                    cat = crime.get("category", "unknown")
                    lat = crime.get("_lat")
                    lng = crime.get("_lng")
                    month = crime.get("_month", "")
                    location_name = crime.get("_prospect_name", "")

                    if lat is None or lng is None:
                        continue

                    row = {
                        "lat": lat,
                        "lng": lng,
                        "month": month,
                        "category": cat,
                        "count": 1,
                        "location_name": location_name,
                        "scanned_at": now,
                    }
                    conn.execute(crime_data_table.insert().values(**row))
                    written += 1

            print(f"[PoliceUK] Saved {written} crime records to DB")
            return written
        except Exception as e:
            print(f"[PoliceUK] Failed to save crime data: {e}")
            return 0

    def save_signals(self, signals: List[Dict]) -> int:
        """
        Upsert crime signals into the signals table.
        Returns number of rows written.
        """
        if not signals:
            return 0
        try:
            from secureflex_intel.db import db_available, upsert_rows, signals_table
            if not db_available():
                return 0
            written = upsert_rows(signals_table, signals, conflict_col="link")
            print(f"[PoliceUK] Saved {written} crime signals to DB")
            return written
        except Exception as e:
            print(f"[PoliceUK] Failed to save signals: {e}")
            return 0


# ── Scan entrypoint ───────────────────────────────────────────────────────────

def run_scan() -> Dict:
    """
    Full crime intelligence scan:
    1. Fetch crimes for all prospect locations
    2. Save raw crime data to crime_data table
    3. Generate signals for high-crime areas
    4. Save signals to signals table

    Returns summary dict.
    """
    client = PoliceUKClient()
    print("[PoliceUK] Starting crime intelligence scan...")

    crimes = client.fetch_crimes_for_prospects()
    crime_records_written = client.save_crime_data(crimes)

    signals = client.generate_signals(crimes)
    signals_written = client.save_signals(signals)

    return {
        "status": "completed",
        "crimes_fetched": len(crimes),
        "crime_records_written": crime_records_written,
        "signals_generated": len(signals),
        "signals_written": signals_written,
    }
