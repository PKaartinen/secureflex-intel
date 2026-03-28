#!/usr/bin/env python3
"""
SecureFlex Find a Tender Service (FTS) Integration

Monitors the UK Find a Tender Service OCDS API for above-threshold
security-related procurement opportunities (typically £139K+).

FTS API Details:
    - Base URL: https://www.find-tender.service.gov.uk/api/1.0/ocdsReleasePackages
    - FREE, NO API KEY NEEDED
    - Returns OCDS JSON release packages
    - Docs: https://www.find-tender.service.gov.uk/api

This module provides:
    - FTSClient class for searching and parsing FTS tenders
    - run_scan() for programmatic use from the API server
    - Scoring with +15 FTS bonus (larger contracts)
"""

import json
import os
import time
from datetime import datetime, timedelta
from urllib.request import urlopen, Request
from urllib.error import URLError, HTTPError
from urllib.parse import urlencode, quote_plus
from typing import List, Dict, Optional

from secureflex_intel.config import settings


# ── Configuration ────────────────────────────────────────────────────────────

FTS_BASE_URL = "https://www.find-tender.service.gov.uk/api/1.0/ocdsReleasePackages"

# CPV codes for security-related tenders
FTS_CPV_CODES = [
    "79710000",  # Security services
    "79711000",  # Alarm monitoring services
    "79713000",  # Guard services
    "79714000",  # Surveillance services
    "79715000",  # Patrol services
    "35120000",  # Surveillance systems
    "50610000",  # Security equipment maintenance
]

FTS_CPV_PREFIXES = [
    "7971",    # Security services family
    "35120",   # Surveillance systems
    "50610",   # Security equipment maintenance
]

# Keywords for searching and scoring
FTS_SEARCH_KEYWORDS = [
    "security services",
    "manned guarding",
    "security guarding",
    "guard services",
    "CCTV monitoring",
    "mobile patrol",
    "key holding",
    "door supervision",
    "site security",
    "event security",
    "reception security",
    "concierge services",
]

FTS_SCORING_KEYWORDS = [
    "security guard", "manned guarding", "security services",
    "door supervisor", "door supervision", "security officer",
    "patrol services", "key holding", "alarm response",
    "concierge security", "event security", "static guarding",
    "mobile patrol", "security personnel", "close protection",
    "cctv monitoring", "access control", "reception security",
    "corporate security", "retail security", "loss prevention",
    "guarding", "security staffing", "site security",
    "concierge", "facilities management security",
]

LONDON_REGIONS = [
    "london", "westminster", "camden", "islington", "hackney", "tower hamlets",
    "greenwich", "lewisham", "southwark", "lambeth", "wandsworth", "hammersmith",
    "kensington", "chelsea", "city of london", "barking", "barnet", "bexley",
    "brent", "bromley", "croydon", "ealing", "enfield", "haringey", "harrow",
    "havering", "hillingdon", "hounslow", "kingston", "merton", "newham",
    "redbridge", "richmond", "sutton", "waltham forest", "canary wharf",
    "stratford", "docklands", "east london", "west london", "north london",
    "south london", "central london", "greater london",
]

SOUTH_EAST_REGIONS = [
    "surrey", "kent", "essex", "hertfordshire", "berkshire", "buckinghamshire",
    "oxfordshire", "sussex", "hampshire", "reading", "brighton", "guildford",
    "watford", "slough", "luton", "southend", "maidstone", "crawley",
]


# ── FTS Client ───────────────────────────────────────────────────────────────

class FTSClient:
    """Client for the UK Find a Tender Service OCDS API."""

    def __init__(self):
        self.base_url = FTS_BASE_URL
        self.headers = {
            "Accept": "application/json",
            "User-Agent": "SecureFlex-TenderRadar/2.0 (business-development-tool)",
        }

    def _fetch_page(self, url: str, timeout: int = 30) -> Optional[Dict]:
        """Fetch a single page from the FTS API."""
        try:
            url = url.replace(" ", "%20")
            req = Request(url, headers=self.headers)
            with urlopen(req, timeout=timeout) as response:
                return json.loads(response.read().decode("utf-8"))
        except HTTPError as e:
            print(f"  ⚠️  FTS HTTP Error {e.code}: {e.reason}")
            if e.code == 429:
                print("  ⏳ Rate limited. Waiting 30 seconds...")
                time.sleep(30)
                return self._fetch_page(url, timeout)
            return None
        except URLError as e:
            print(f"  ⚠️  FTS URL Error: {e.reason}")
            return None
        except Exception as e:
            print(f"  ⚠️  FTS Unexpected error: {e}")
            return None

    def search_tenders(
        self,
        keywords: Optional[List[str]] = None,
        cpv_codes: Optional[List[str]] = None,
        days_back: int = 30,
        max_pages: int = 5,
    ) -> List[Dict]:
        """
        Search FTS for security-related tenders.

        Args:
            keywords: Search keywords (defaults to FTS_SEARCH_KEYWORDS)
            cpv_codes: CPV codes to search (defaults to FTS_CPV_CODES)
            days_back: How many days back to search
            max_pages: Maximum pages per query

        Returns:
            List of parsed tender dicts with scores
        """
        if keywords is None:
            keywords = FTS_SEARCH_KEYWORDS
        if cpv_codes is None:
            cpv_codes = FTS_CPV_CODES

        from_date = (datetime.utcnow() - timedelta(days=days_back)).strftime("%Y-%m-%dT00:00:00Z")

        all_releases = {}  # Deduplicate by ocid

        # Search by keyword
        for keyword in keywords:
            print(f"  🔍 FTS searching: '{keyword}'...")
            releases = self._search_keyword(keyword, from_date, max_pages)
            new_count = 0
            for release in releases:
                ocid = release.get("ocid", release.get("id", ""))
                if ocid and ocid not in all_releases:
                    all_releases[ocid] = release
                    new_count += 1
            print(f"    ✅ {len(releases)} results, {new_count} new ({len(all_releases)} unique total)")
            time.sleep(1.5)

        print(f"[FTS] Total unique releases: {len(all_releases)}")

        # Parse, filter, and score
        tenders = []
        skipped = 0
        for ocid, release in all_releases.items():
            parsed = self._parse_release(release)
            if not self._is_security_related(parsed):
                skipped += 1
                continue

            score, breakdown = self._score_opportunity(parsed)
            classification = self._classify(score)

            # Format display values
            value = parsed.get("value", 0) or 0
            value_display = f"£{value:,.0f}" if value else "Not specified"

            deadline_display = ""
            if parsed.get("deadline"):
                try:
                    dt = datetime.fromisoformat(parsed["deadline"].replace("Z", "+00:00"))
                    deadline_display = dt.strftime("%Y-%m-%d")
                except (ValueError, TypeError):
                    deadline_display = str(parsed["deadline"])[:10]

            published_display = ""
            if parsed.get("published_date"):
                try:
                    dt = datetime.fromisoformat(parsed["published_date"].replace("Z", "+00:00"))
                    published_display = dt.strftime("%Y-%m-%d")
                except (ValueError, TypeError):
                    published_display = str(parsed["published_date"])[:10]

            description_snippet = parsed.get("description", "")[:200].replace("\n", " ").strip()
            if len(parsed.get("description", "")) > 200:
                description_snippet += "..."

            tenders.append({
                **parsed,
                "score": score,
                "score_breakdown": breakdown,
                "classification": classification,
                "value_display": value_display,
                "deadline_display": deadline_display or "Not specified",
                "published_display": published_display,
                "description_snippet": description_snippet,
                "source": "fts",
            })

        tenders.sort(key=lambda x: x["score"], reverse=True)
        print(f"[FTS] {len(tenders)} security-related tenders (skipped {skipped} non-security)")
        return tenders

    def _search_keyword(self, keyword: str, from_date: str, max_pages: int = 5) -> List[Dict]:
        """Search FTS by keyword, handling pagination."""
        params = {
            "q": keyword,
            "publishedFrom": from_date,
            "stage": "tender",
            "size": 100,
            "page": 1,
        }

        all_releases = []
        page = 0

        while page < max_pages:
            page += 1
            params["page"] = page
            url = f"{self.base_url}?{urlencode(params, quote_via=quote_plus)}"

            data = self._fetch_page(url)
            if not data:
                break

            # FTS returns release packages — extract releases
            releases = self._extract_releases(data)
            if not releases:
                break

            all_releases.extend(releases)

            # Check if there are more pages
            total = data.get("total", 0)
            if len(all_releases) >= total:
                break

            time.sleep(1)

        return all_releases

    def _extract_releases(self, data: Dict) -> List[Dict]:
        """Extract OCDS releases from FTS response format."""
        releases = []

        # FTS may return releases directly or in release packages
        if "releases" in data:
            releases.extend(data["releases"])
        elif "releasePackages" in data:
            for pkg in data["releasePackages"]:
                if "releases" in pkg:
                    releases.extend(pkg["releases"])
        elif "results" in data:
            for result in data["results"]:
                if "releases" in result:
                    releases.extend(result["releases"])
                elif "release" in result:
                    releases.append(result["release"])
                else:
                    # The result itself might be a release
                    if "tender" in result or "ocid" in result:
                        releases.append(result)

        # If data itself looks like a release package
        if not releases and "uri" in data and "releases" not in data:
            if "tender" in data or "ocid" in data:
                releases.append(data)

        return releases

    def _parse_release(self, release: Dict) -> Dict:
        """Parse an OCDS release from FTS into a standardised dict."""
        tender = release.get("tender", {})
        parties = release.get("parties", [])

        title = tender.get("title", "") or release.get("title", "Untitled")
        description = tender.get("description", "") or release.get("description", "")

        # CPV classification
        classification = tender.get("classification", {})
        cpv_code = classification.get("id", "")
        cpv_description = classification.get("description", "")

        # Also check additional classifications
        if not cpv_code:
            additional = tender.get("additionalClassifications", [])
            for ac in additional:
                if ac.get("scheme", "").upper() == "CPV":
                    cpv_code = ac.get("id", "")
                    cpv_description = ac.get("description", "")
                    break

        # Value
        value_obj = tender.get("value", {})
        value = value_obj.get("amount", 0) or 0

        # Min value
        min_value_obj = tender.get("minValue", {})
        min_value = min_value_obj.get("amount", 0) or 0

        # Region from delivery addresses or buyer address
        region = ""
        country = ""
        items = tender.get("items", [])
        if items:
            addrs = items[0].get("deliveryAddresses", items[0].get("deliveryLocations", []))
            if addrs:
                region = addrs[0].get("region", "")
                country = addrs[0].get("countryName", "")

        # Deadline
        tender_period = tender.get("tenderPeriod", {})
        deadline = tender_period.get("endDate", "")

        # Published date
        published = release.get("date", "")

        # Buyer info
        buyer_name = ""
        buyer_email = ""
        buyer_address = ""
        buyer = release.get("buyer", {})
        if buyer:
            buyer_name = buyer.get("name", "")
        for party in parties:
            roles = party.get("roles", [])
            if "buyer" in roles:
                buyer_name = buyer_name or party.get("name", "")
                cp = party.get("contactPoint", {})
                buyer_email = cp.get("email", "")
                addr = party.get("address", {})
                buyer_address = ", ".join(filter(None, [
                    addr.get("streetAddress", ""),
                    addr.get("locality", ""),
                    addr.get("region", ""),
                    addr.get("postalCode", ""),
                ]))
                if not region:
                    region = addr.get("region", "")
                break

        # SME suitability
        suitability = tender.get("suitability", {})
        sme_friendly = suitability.get("sme", False)

        # OCDS ID
        ocid = release.get("ocid", "")

        # Build FTS link
        notice_id = tender.get("id", "") or ocid
        link = ""
        if ocid:
            # FTS notice links use the OCID
            link = f"https://www.find-tender.service.gov.uk/Notice/{ocid.split('-')[-1] if '-' in ocid else ocid}"
        elif notice_id:
            link = f"https://www.find-tender.service.gov.uk/Notice/{notice_id}"

        return {
            "title": title,
            "description": description,
            "cpv_code": cpv_code,
            "cpv_description": cpv_description,
            "buyer": buyer_name,
            "buyer_email": buyer_email,
            "buyer_address": buyer_address,
            "region": region,
            "country": country,
            "value": value,
            "min_value": min_value,
            "deadline": deadline,
            "published_date": published,
            "sme_friendly": sme_friendly,
            "link": link,
            "ocid": ocid,
        }

    def _is_security_related(self, parsed: Dict) -> bool:
        """Check if a parsed FTS notice is security-related."""
        cpv = parsed.get("cpv_code", "")
        for prefix in FTS_CPV_PREFIXES:
            if cpv.startswith(prefix):
                return True

        combined = f"{parsed.get('title', '')} {parsed.get('description', '')}".lower()
        hits = sum(1 for kw in FTS_SCORING_KEYWORDS if kw in combined)
        return hits >= 1

    def _score_opportunity(self, parsed: Dict) -> tuple:
        """
        Score an FTS tender opportunity.
        Same logic as Contracts Finder but with +15 FTS bonus (larger contracts).
        Returns (score, breakdown).
        """
        score = 0
        breakdown = {}
        combined_text = f"{parsed.get('title', '')} {parsed.get('description', '')} {parsed.get('region', '')}".lower()

        # ── Keyword relevance (0-40 points)
        keyword_hits = sum(1 for kw in FTS_SCORING_KEYWORDS if kw in combined_text)
        keyword_score = min(40, keyword_hits * 8)

        cpv = parsed.get("cpv_code", "")
        for prefix in FTS_CPV_PREFIXES:
            if cpv.startswith(prefix):
                keyword_score = min(40, keyword_score + 15)
                break

        score += keyword_score
        breakdown["keyword_relevance"] = f"{keyword_score}/40 ({keyword_hits} kw + CPV:{cpv[:4] if cpv else 'none'})"

        # ── Location relevance (0-25 points)
        location_score = 0
        location_match = "None"
        region_lower = parsed.get("region", "").lower()
        combined_loc = f"{region_lower} {parsed.get('buyer_address', '').lower()}"

        for loc in LONDON_REGIONS:
            if loc in combined_loc:
                location_score = 25
                location_match = f"London ({loc})"
                break
        if location_score == 0:
            for loc in SOUTH_EAST_REGIONS:
                if loc in combined_loc:
                    location_score = 15
                    location_match = f"South East ({loc})"
                    break
        if location_score == 0 and ("england" in combined_loc or "nationwide" in combined_text):
            location_score = 8
            location_match = "England-wide"
        if location_score == 0 and ("uk" in combined_loc or "united kingdom" in combined_loc):
            location_score = 5
            location_match = "UK-wide"
        if location_score == 0 and region_lower:
            location_score = 3
            location_match = f"Other UK ({region_lower})"

        score += location_score
        breakdown["location"] = f"{location_score}/25 ({location_match})"

        # ── Contract value (0-20 points)
        value = parsed.get("value", 0) or parsed.get("min_value", 0) or 0
        value_score = 0

        if 50000 <= value <= 500000:
            value_score = 20
        elif 500000 < value <= 2000000:
            value_score = 15
        elif 10000 <= value < 50000:
            value_score = 10
        elif value > 2000000:
            value_score = 5
        score += value_score
        breakdown["value"] = f"{value_score}/20 (£{value:,.0f})" if value else f"{value_score}/20 (not specified)"

        # ── Deadline proximity (0-10 points)
        deadline_score = 0
        deadline = parsed.get("deadline", "")
        if deadline:
            try:
                deadline_dt = datetime.fromisoformat(deadline.replace("Z", "+00:00"))
                days_left = (deadline_dt.replace(tzinfo=None) - datetime.utcnow()).days
                if days_left > 21:
                    deadline_score = 10
                elif days_left > 14:
                    deadline_score = 8
                elif days_left > 7:
                    deadline_score = 5
                elif days_left > 3:
                    deadline_score = 3
                else:
                    deadline_score = 1
                breakdown["deadline"] = f"{deadline_score}/10 ({days_left} days left)"
            except (ValueError, TypeError):
                breakdown["deadline"] = "0/10 (could not parse)"
        else:
            breakdown["deadline"] = "0/10 (no deadline)"
        score += deadline_score

        # ── SME friendly bonus (0-5 points)
        sme_score = 5 if parsed.get("sme_friendly") else 0
        score += sme_score
        breakdown["sme_friendly"] = f"{sme_score}/5"

        # ── FTS bonus (+15 — larger above-threshold contracts)
        fts_bonus = 15
        score += fts_bonus
        breakdown["fts_bonus"] = f"+{fts_bonus} (above-threshold procurement)"

        # Cap at 100
        score = min(100, score)

        return score, breakdown

    def _classify(self, score: int) -> str:
        """Classify opportunity as hot, warm, monitor, or low."""
        if score >= 65:
            return "🔴 HOT"
        elif score >= 40:
            return "🟡 WARM"
        elif score >= 20:
            return "🟢 MONITOR"
        else:
            return "⚪ LOW"


# ── Callable scan function for API use ───────────────────────────────────────

def run_scan(days_back: int = None) -> List[Dict]:
    """
    Run an FTS scan programmatically.
    Returns list of opportunity dicts.
    """
    if days_back is None:
        days_back = settings.fts_days_back

    print(f"[FTS] Starting Find a Tender Service scan ({days_back} days back)")

    client = FTSClient()
    tenders = client.search_tenders(days_back=days_back)

    # Save to database
    if tenders:
        try:
            from secureflex_intel.db import db_available, upsert_rows, tenders_table
            if db_available():
                db_rows = []
                for opp in tenders:
                    db_rows.append({
                        'ocid': opp.get('ocid') or None,
                        'title': opp.get('title', ''),
                        'buyer': opp.get('buyer', ''),
                        'buyer_email': opp.get('buyer_email', ''),
                        'region': opp.get('region', ''),
                        'cpv_code': opp.get('cpv_code', ''),
                        'value': str(opp.get('value', '')),
                        'deadline': opp.get('deadline_display', ''),
                        'sme_friendly': str(opp.get('sme_friendly', '')),
                        'published_date': opp.get('published_display', ''),
                        'link': opp.get('link', ''),
                        'description_snippet': opp.get('description_snippet', ''),
                        'score': int(opp.get('score', 0)),
                        'classification': opp.get('classification', ''),
                        'scanned_at': datetime.utcnow(),
                        'source': 'fts',
                    })
                written = upsert_rows(tenders_table, db_rows, 'ocid')
                print(f'[FTS] Upserted {written} tenders to DB')
        except Exception as e:
            print(f'[FTS] DB write failed: {e}')

    print(f"[FTS] Scan complete: {len(tenders)} tenders found")
    return tenders
