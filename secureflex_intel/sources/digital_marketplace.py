"""
Digital Marketplace Source

Fetches DOS (Digital Outcomes and Specialists) procurement opportunities
from the Digital Marketplace by scraping the opportunities search page.

The JSON API at /api/briefs is deprecated and returns HTML instead of JSON.
This module scrapes the HTML search page instead.
"""

import json
import re
import time
import urllib.request
import urllib.parse
from datetime import datetime
from typing import List, Dict, Optional

# ── Constants ────────────────────────────────────────────────────────────────

# Primary search URL (the old domain redirects to the new one)
DM_SEARCH_URL = "https://www.applytosupply.digitalmarketplace.service.gov.uk/digital-outcomes-and-specialists/opportunities"

# Fallback URL (original domain, may redirect)
DM_SEARCH_URL_FALLBACK = "https://www.digitalmarketplace.service.gov.uk/digital-outcomes-and-specialists/opportunities"

KEYWORDS = [
    "security",
    "guarding",
    "CCTV",
    "access control",
    "physical security"
]

# ── Client ───────────────────────────────────────────────────────────────────

class DigitalMarketplaceClient:
    """Client for fetching opportunities from the Digital Marketplace via HTML scraping."""

    def __init__(self):
        self.headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-GB,en;q=0.9",
        }

    def _fetch_html(self, url: str, timeout: int = 20) -> Optional[str]:
        """Fetch HTML content from a URL with error handling."""
        try:
            req = urllib.request.Request(url, headers=self.headers)
            with urllib.request.urlopen(req, timeout=timeout) as response:
                return response.read().decode("utf-8", errors="replace")
        except urllib.error.HTTPError as e:
            print(f"[Digital Marketplace] HTTP Error {e.code}: {e.reason} for {url}")
            return None
        except urllib.error.URLError as e:
            print(f"[Digital Marketplace] URL Error: {e.reason} for {url}")
            return None
        except Exception as e:
            print(f"[Digital Marketplace] Unexpected error fetching {url}: {e}")
            return None

    def _parse_opportunities_html(self, html: str) -> List[Dict]:
        """
        Parse the Digital Marketplace opportunities search results page.
        Uses BeautifulSoup to extract opportunity details from GOV.UK Design System HTML.
        """
        try:
            from bs4 import BeautifulSoup
        except ImportError:
            print("[Digital Marketplace] BeautifulSoup not available — cannot parse HTML results")
            return []

        opportunities = []
        try:
            soup = BeautifulSoup(html, "html.parser")

            # Check for error page
            title = soup.find("title")
            if title and "technical difficulties" in title.get_text(strip=True).lower():
                print("[Digital Marketplace] Service is experiencing technical difficulties")
                return []

            # The DM search results use GOV.UK Design System patterns
            # Look for search result items — try multiple selectors
            result_items = (
                soup.find_all("li", class_="app-search-result")
                or soup.find_all("li", class_="search-result")
                or soup.find_all("div", class_="search-result")
            )

            if not result_items:
                # Try to find opportunity links in the main content area
                main = soup.find("main") or soup.find(id="main-content")
                if main:
                    # Look for links that point to individual opportunity pages
                    opp_links = main.find_all("a", href=re.compile(r"/opportunities/\d+"))
                    for link in opp_links:
                        href = link.get("href", "")
                        title_text = link.get_text(strip=True)
                        if not title_text:
                            continue

                        # Build full URL
                        if href.startswith("/"):
                            full_url = f"https://www.applytosupply.digitalmarketplace.service.gov.uk{href}"
                        else:
                            full_url = href

                        # Try to extract surrounding context
                        parent = link.find_parent(["li", "div", "article"])
                        description = ""
                        buyer = ""
                        deadline = ""
                        if parent:
                            # Look for buyer/organisation info
                            for p_tag in parent.find_all(["p", "span", "dd"]):
                                text = p_tag.get_text(strip=True)
                                if not text:
                                    continue
                                if any(kw in text.lower() for kw in ["closes", "closing", "deadline"]):
                                    deadline = text
                                elif not buyer and text != title_text:
                                    buyer = text

                            description = parent.get_text(strip=True)[:200]

                        opp_id = re.search(r"/opportunities/(\d+)", href)
                        opp_id_str = opp_id.group(1) if opp_id else ""

                        opportunities.append({
                            "ocid": f"dm-{opp_id_str}" if opp_id_str else f"dm-{len(opportunities)}",
                            "title": title_text,
                            "buyer": buyer,
                            "value": "",
                            "deadline": deadline,
                            "link": full_url,
                            "status": "live",
                            "description_snippet": description[:200],
                            "source": "digital_marketplace",
                            "scanned_at": datetime.utcnow(),
                            "score": 65,
                            "classification": "Warm",
                        })
            else:
                # Parse structured search result items
                for item in result_items:
                    title_elem = (
                        item.find("a", class_="search-result-title")
                        or item.find("a", class_="govuk-link")
                        or item.find("a")
                    )
                    if not title_elem:
                        continue

                    title_text = title_elem.get_text(strip=True)
                    href = title_elem.get("href", "")
                    if href.startswith("/"):
                        full_url = f"https://www.applytosupply.digitalmarketplace.service.gov.uk{href}"
                    else:
                        full_url = href

                    # Extract metadata
                    buyer = ""
                    deadline = ""
                    description = ""

                    meta_items = item.find_all(["p", "span", "dd", "li"])
                    for meta in meta_items:
                        text = meta.get_text(strip=True)
                        if not text:
                            continue
                        if any(kw in text.lower() for kw in ["closes", "closing", "deadline"]):
                            deadline = text
                        elif any(kw in text.lower() for kw in ["published by", "organisation", "buyer"]):
                            buyer = text
                        elif not description:
                            description = text

                    opp_id = re.search(r"/opportunities/(\d+)", href)
                    opp_id_str = opp_id.group(1) if opp_id else ""

                    opportunities.append({
                        "ocid": f"dm-{opp_id_str}" if opp_id_str else f"dm-{len(opportunities)}",
                        "title": title_text,
                        "buyer": buyer,
                        "value": "",
                        "deadline": deadline,
                        "link": full_url,
                        "status": "live",
                        "description_snippet": description[:200],
                        "source": "digital_marketplace",
                        "scanned_at": datetime.utcnow(),
                        "score": 65,
                        "classification": "Warm",
                    })

        except Exception as e:
            print(f"[Digital Marketplace] Error parsing HTML: {e}")
            return []

        return opportunities

    def search_opportunities(self) -> List[Dict]:
        """Search for security-related opportunities by scraping the search page."""
        opportunities = []
        seen_ids = set()

        for keyword in KEYWORDS:
            params = {"q": keyword}
            url = f"{DM_SEARCH_URL}?{urllib.parse.urlencode(params)}"

            print(f"[Digital Marketplace] Searching: '{keyword}'...")
            html = self._fetch_html(url)

            # Try fallback URL if primary fails
            if not html:
                url = f"{DM_SEARCH_URL_FALLBACK}?{urllib.parse.urlencode(params)}"
                print(f"[Digital Marketplace] Trying fallback URL for '{keyword}'...")
                html = self._fetch_html(url)

            if not html:
                print(f"[Digital Marketplace] Could not fetch results for '{keyword}'")
                continue

            parsed = self._parse_opportunities_html(html)
            new_count = 0
            for opp in parsed:
                opp_id = opp.get("ocid", "")
                if opp_id and opp_id not in seen_ids:
                    seen_ids.add(opp_id)
                    opportunities.append(opp)
                    new_count += 1

            print(f"[Digital Marketplace] '{keyword}': {len(parsed)} results, {new_count} new")
            time.sleep(1)

        print(f"[Digital Marketplace] Total unique opportunities: {len(opportunities)}")
        return opportunities

# ── Orchestration ────────────────────────────────────────────────────────────

def run_scan() -> Dict:
    """Run the Digital Marketplace scan."""
    try:
        client = DigitalMarketplaceClient()
        opportunities = client.search_opportunities()
    except Exception as e:
        print(f"[Digital Marketplace] Scan failed: {e}")
        opportunities = []

    written = 0
    try:
        from secureflex_intel.db import db_available, get_engine, tenders_table, upsert_rows

        if db_available() and opportunities:
            written = upsert_rows(tenders_table, opportunities, "ocid")
            print(f"[Digital Marketplace] Wrote {written} opportunities to database")

    except Exception as e:
        print(f"[Digital Marketplace] Error saving opportunities: {e}")

    result = {
        "status": "completed",
        "opportunities_found": len(opportunities),
        "records_written": written,
    }

    if not opportunities:
        result["warning"] = "No opportunities found (service may be temporarily unavailable)"

    return result

if __name__ == "__main__":
    print(json.dumps(run_scan(), indent=2, default=str))
