"""
The Gazette Source — Insolvency & Corporate Distress Monitoring

Queries The Gazette's free REST API (Atom XML feed) for insolvency notices
and cross-references them against the competitors and prospects tables to
generate high-value sales signals.

API docs: https://github.com/TheGazette/DevDocs
Base URL: https://www.thegazette.co.uk

Notice categories used:
  24 — Corporate Insolvency
  25 — Personal Insolvency (optional)
"""

import json
import re
import time
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta
from typing import List, Dict, Optional

try:
    import requests as _requests
    HAS_REQUESTS = True
except ImportError:
    HAS_REQUESTS = False
    from urllib.request import urlopen, Request
    from urllib.error import URLError, HTTPError
    from urllib.parse import urlencode

# ── Constants ────────────────────────────────────────────────────────────────

GAZETTE_BASE = "https://www.thegazette.co.uk"

# XML namespaces used by the Gazette Atom feed
NS = {
    "atom": "http://www.w3.org/2005/Atom",
    "f": "https://www.thegazette.co.uk/facets",
    "os": "http://a9.com/-/spec/opensearch/1.1/",
    "xhtml": "http://www.w3.org/1999/xhtml",
}

# Insolvency notice code descriptions (4-digit codes)
INSOLVENCY_NOTICE_TYPES = {
    "2401": "Winding-up Petition",
    "2402": "Winding-up Order",
    "2410": "Administration",
    "2411": "Administrative Receiver",
    "2421": "Voluntary Arrangement",
    "2431": "Dissolution",
    "2432": "Dissolution",
    "2450": "Striking Off",
    "2452": "Striking Off",
}


# ── HTTP Helpers ─────────────────────────────────────────────────────────────

def _gazette_feed_request(path: str, params: Optional[Dict] = None,
                          retries: int = 3) -> Optional[ET.Element]:
    """Make a request to The Gazette Atom feed and return parsed XML root."""
    url = f"{GAZETTE_BASE}{path}"
    headers = {
        "User-Agent": "Mozilla/5.0 (SecureFlex-Intel/1.0)",
        "Accept": "*/*",
    }

    for attempt in range(retries):
        try:
            if HAS_REQUESTS:
                resp = _requests.get(url, params=params, headers=headers, timeout=30)
                resp.raise_for_status()
                return ET.fromstring(resp.text)
            else:
                from urllib.parse import urlencode
                full_url = url
                if params:
                    full_url += "?" + urlencode(params)
                req = Request(full_url, headers=headers)
                with urlopen(req, timeout=30) as resp:
                    raw = resp.read().decode("utf-8")
                    return ET.fromstring(raw)
        except Exception as e:
            err_str = str(e)
            if "429" in err_str:
                wait = 30 * (attempt + 1)
                print(f"[Gazette] Rate limited — waiting {wait}s...")
                time.sleep(wait)
                continue
            print(f"[Gazette] Request error (attempt {attempt + 1}): {e}")
            if attempt < retries - 1:
                time.sleep(5)
    return None


# ── Gazette Client ───────────────────────────────────────────────────────────

class GazetteClient:
    """Client for querying The Gazette insolvency notices via Atom feed."""

    def search_insolvency_notices(self, days_back: int = 30) -> List[Dict]:
        """
        Search for corporate insolvency notices published in the last N days.
        Returns parsed notice dicts.
        """
        start_date = (datetime.utcnow() - timedelta(days=days_back)).strftime("%Y-%m-%d")
        end_date = datetime.utcnow().strftime("%Y-%m-%d")

        print(f"[Gazette] Searching insolvency notices from {start_date} to {end_date}...")

        all_notices = []
        page = 1
        max_pages = 20  # Safety limit

        while page <= max_pages:
            params = {
                "categorycode": "24",
                "start-publish-date": start_date,
                "end-publish-date": end_date,
                "results-page": str(page),
                "results-page-size": "100",
                "sort-by": "latest-date",
            }

            root = _gazette_feed_request("/insolvency/notice/data.feed", params)
            if root is None:
                print(f"[Gazette] No data returned for page {page}")
                break

            entries = root.findall("atom:entry", NS)
            if not entries:
                break

            for entry in entries:
                notice = self._parse_entry(entry)
                if notice:
                    all_notices.append(notice)

            # Check total for pagination
            total_el = root.find("f:total", NS)
            try:
                total = int(total_el.text) if total_el is not None else 0
            except (ValueError, TypeError):
                total = 0

            if page * 100 >= total:
                break
            page += 1
            time.sleep(1)  # Be polite

        print(f"[Gazette] Found {len(all_notices)} insolvency notices")
        return all_notices

    def _parse_entry(self, entry: ET.Element) -> Optional[Dict]:
        """Parse a single Atom entry into a clean dict."""
        try:
            title_el = entry.find("atom:title", NS)
            title = title_el.text.strip() if title_el is not None and title_el.text else ""

            code_el = entry.find("f:notice-code", NS)
            notice_code = code_el.text.strip() if code_el is not None and code_el.text else ""
            notice_type = INSOLVENCY_NOTICE_TYPES.get(
                notice_code, f"Insolvency ({notice_code})"
            )

            pub_el = entry.find("atom:published", NS)
            published = pub_el.text.strip() if pub_el is not None and pub_el.text else ""

            # Extract gazette URL from links
            gazette_url = ""
            for link in entry.findall("atom:link", NS):
                href = link.get("href", "")
                rel = link.get("rel", "")
                if href and "/notice/" in href and not rel:
                    gazette_url = href
                    break
            if not gazette_url:
                for link in entry.findall("atom:link", NS):
                    href = link.get("href", "")
                    if href and "/notice/" in href and link.get("rel") == "self":
                        gazette_url = href
                        break

            # Extract content text
            content_el = entry.find("atom:content", NS)
            description = ""
            if content_el is not None:
                description = self._element_text(content_el)[:500]

            # Extract company name
            company_name = self._extract_company_name(title, description)

            # Try to extract company number from description
            company_number = ""
            cn_match = re.search(r'Company\s+Number\s+(\d{6,8})', description)
            if cn_match:
                company_number = cn_match.group(1)

            return {
                "company_name": company_name,
                "company_number": company_number,
                "notice_type": notice_type,
                "notice_code": notice_code,
                "publication_date": published,
                "gazette_url": gazette_url,
                "description": description,
                "title": title,
            }
        except Exception as e:
            print(f"[Gazette] Error parsing entry: {e}")
            return None

    def _element_text(self, el: ET.Element) -> str:
        """Extract all text content from an XML element and its children."""
        text = ET.tostring(el, encoding="unicode", method="text")
        text = re.sub(r'\s+', ' ', text)
        return text.strip()

    def _extract_company_name(self, title: str, description: str) -> str:
        """Extract company name from notice title or description."""
        name = title.strip()

        # Remove common prefixes
        prefixes = [
            "In the Matter of ", "In the matter of ",
            "Re: ", "RE: ",
            "Petition to Wind Up ", "Winding Up ",
            "Administration Order - ", "Administration - ",
        ]
        for prefix in prefixes:
            if name.startswith(prefix):
                name = name[len(prefix):]

        # Remove trailing reference numbers, brackets, etc.
        name = re.sub(r'\s*\((?:in\s+)?(?:liquidation|administration|dissolved)\)', '',
                       name, flags=re.IGNORECASE)
        name = re.sub(r'\s*-\s*\d+/\d+.*$', '', name)

        return name.strip() or title.strip()


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
    notices: List[Dict],
) -> List[Dict]:
    """
    Cross-reference Gazette notices with competitors and prospects tables.
    Generate scored signals based on match type.
    """
    try:
        from secureflex_intel.db import (
            db_available, get_engine, competitors_table, prospects_table
        )
        from sqlalchemy import select
        if not db_available():
            print("[Gazette] Database not available for cross-reference")
            return _generate_unmatched_signals(notices)
    except ImportError:
        print("[Gazette] DB module not available")
        return _generate_unmatched_signals(notices)

    engine = get_engine()

    # Load competitors and prospects for matching
    competitors = {}
    prospects = {}
    try:
        with engine.connect() as conn:
            for row in conn.execute(select(competitors_table)):
                r = dict(row._mapping)
                norm = _normalise_name(r.get("company_name", ""))
                competitors[norm] = r

            for row in conn.execute(select(prospects_table)):
                r = dict(row._mapping)
                norm = _normalise_name(r.get("company_name", ""))
                prospects[norm] = r
    except Exception as e:
        print(f"[Gazette] Error loading companies for cross-ref: {e}")

    print(f"[Gazette] Cross-referencing against {len(competitors)} competitors "
          f"and {len(prospects)} prospects")

    signals = []
    for notice in notices:
        notice_name = _normalise_name(notice.get("company_name", ""))
        if not notice_name:
            continue

        # Try exact match first, then partial
        comp_match = competitors.get(notice_name)
        if not comp_match:
            for cname, cdata in competitors.items():
                if notice_name in cname or cname in notice_name:
                    comp_match = cdata
                    break

        prospect_match = prospects.get(notice_name)
        if not prospect_match:
            for pname, pdata in prospects.items():
                if notice_name in pname or pname in notice_name:
                    prospect_match = pdata
                    break

        signal = _create_signal(notice, comp_match, prospect_match)
        if signal:
            signals.append(signal)

    print(f"[Gazette] Generated {len(signals)} signals from {len(notices)} notices")
    return signals


def _create_signal(
    notice: Dict,
    comp_match: Optional[Dict],
    prospect_match: Optional[Dict],
) -> Optional[Dict]:
    """Create a signal from a Gazette notice based on match type."""
    company_name = notice.get("company_name", "Unknown")
    notice_type = notice.get("notice_type", "Insolvency")
    gazette_url = notice.get("gazette_url", "")
    pub_date = notice.get("publication_date", "")
    description = notice.get("description", "")

    if comp_match:
        is_acs = comp_match.get("acs_verified", False)
        score = 90 if is_acs else 75
        return {
            "link": gazette_url,
            "title": f"COMPETITOR INSOLVENCY: {company_name}",
            "company": company_name,
            "source": "The Gazette",
            "published": pub_date,
            "description": (f"{'ACS-verified c' if is_acs else 'C'}ompetitor "
                            f"{company_name} has a {notice_type} notice. "
                            f"{description}"),
            "score": score,
            "signal_type": "competitor_insolvency",
            "signal_category": "hot",
            "scanned_at": datetime.utcnow(),
        }

    if prospect_match:
        return {
            "link": gazette_url,
            "title": f"PROSPECT AT RISK: {company_name}",
            "company": company_name,
            "source": "The Gazette",
            "published": pub_date,
            "description": (f"Prospect {company_name} has a {notice_type} "
                            f"notice — assess risk. {description}"),
            "score": 60,
            "signal_type": "prospect_insolvency",
            "signal_category": "warm",
            "scanned_at": datetime.utcnow(),
        }

    # No match — check if it looks like a security company
    name_lower = company_name.lower()
    security_keywords = ["security", "guard", "patrol", "surveillance",
                         "protection", "cctv", "door"]
    is_security = any(kw in name_lower for kw in security_keywords)

    if is_security:
        return {
            "link": gazette_url,
            "title": f"MARKET INSOLVENCY: {company_name}",
            "company": company_name,
            "source": "The Gazette",
            "published": pub_date,
            "description": (f"Security company {company_name} has a "
                            f"{notice_type} notice. {description}"),
            "score": 50,
            "signal_type": "market_insolvency",
            "signal_category": "warm",
            "scanned_at": datetime.utcnow(),
        }

    return None


def _generate_unmatched_signals(notices: List[Dict]) -> List[Dict]:
    """Generate signals without DB cross-reference (fallback)."""
    signals = []
    for notice in notices:
        company_name = notice.get("company_name", "Unknown")
        name_lower = company_name.lower()
        security_keywords = ["security", "guard", "patrol", "surveillance",
                             "protection", "cctv", "door"]
        if any(kw in name_lower for kw in security_keywords):
            signals.append({
                "link": notice.get("gazette_url", ""),
                "title": f"MARKET INSOLVENCY: {company_name}",
                "company": company_name,
                "source": "The Gazette",
                "published": notice.get("publication_date", ""),
                "description": (f"Security company {company_name} — "
                                f"{notice.get('notice_type', 'Insolvency')}. "
                                f"{notice.get('description', '')}"),
                "score": 50,
                "signal_type": "market_insolvency",
                "signal_category": "warm",
                "scanned_at": datetime.utcnow(),
            })
    return signals


# ── Database Persistence ─────────────────────────────────────────────────────

def save_signals(signals: List[Dict]) -> int:
    """Persist Gazette signals to the signals table."""
    if not signals:
        return 0
    try:
        from secureflex_intel.db import db_available, upsert_rows, signals_table
        if not db_available():
            print("[Gazette] Database not available for signal storage")
            return 0
        written = upsert_rows(signals_table, signals, "link")
        print(f"[Gazette] Wrote {written} signals to database")
        return written
    except Exception as e:
        print(f"[Gazette] Error saving signals: {e}")
        return 0


# ── Orchestration ────────────────────────────────────────────────────────────

def run_scan(days_back: int = 30) -> Dict:
    """
    Full Gazette scan: search insolvency notices, cross-reference, generate
    and persist signals.
    Returns a summary dict.
    """
    client = GazetteClient()

    # Step 1: Search for insolvency notices
    notices = client.search_insolvency_notices(days_back=days_back)
    if not notices:
        return {
            "status": "completed",
            "notices_found": 0,
            "signals_generated": 0,
            "signals_written": 0,
        }

    # Step 2: Cross-reference and generate signals
    signals = cross_reference_and_generate_signals(notices)

    # Step 3: Persist signals
    written = save_signals(signals)

    return {
        "status": "completed",
        "notices_found": len(notices),
        "signals_generated": len(signals),
        "signals_written": written,
    }


# ── CLI Entry Point ──────────────────────────────────────────────────────────

def main():
    """CLI entry point for Gazette scanning."""
    import argparse
    parser = argparse.ArgumentParser(description="The Gazette Insolvency Monitor")
    parser.add_argument("--days-back", type=int, default=30,
                        help="Number of days to look back (default: 30)")
    args = parser.parse_args()

    result = run_scan(days_back=args.days_back)
    print(f"\n[Gazette] Result: {json.dumps(result, indent=2, default=str)}")


if __name__ == "__main__":
    main()
