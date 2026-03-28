"""
Digital Marketplace Source

Fetches G-Cloud and DOS procurement opportunities from the Digital Marketplace.
"""

import json
import time
import urllib.request
import urllib.parse
from datetime import datetime
from typing import List, Dict, Optional

# ── Constants ────────────────────────────────────────────────────────────────

DM_API_URL = "https://www.digitalmarketplace.service.gov.uk/api/briefs"

KEYWORDS = [
    "security",
    "guarding",
    "CCTV",
    "access control",
    "physical security"
]

# ── Client ───────────────────────────────────────────────────────────────────

class DigitalMarketplaceClient:
    """Client for fetching opportunities from the Digital Marketplace."""

    def __init__(self):
        self.headers = {
            "User-Agent": "SecureFlex-Intel/1.0 (Digital Marketplace Scanner)",
            "Accept": "application/json"
        }

    def search_opportunities(self) -> List[Dict]:
        """Search for security-related opportunities."""
        opportunities = []
        seen_ids = set()
        
        for keyword in KEYWORDS:
            # Note: The actual DM API might have different pagination/search params.
            # This is a generic implementation based on typical REST APIs.
            params = {
                "keyword": keyword,
                "status": "live"
            }
            url = f"{DM_API_URL}?{urllib.parse.urlencode(params)}"
            
            try:
                req = urllib.request.Request(url, headers=self.headers)
                with urllib.request.urlopen(req, timeout=15) as response:
                    data = json.loads(response.read().decode("utf-8"))
                    
                    # Handle different possible response structures
                    briefs = data.get("briefs", [])
                    if not briefs and isinstance(data, list):
                        briefs = data
                        
                    for brief in briefs:
                        brief_id = brief.get("id")
                        if brief_id and brief_id not in seen_ids:
                            seen_ids.add(brief_id)
                            
                            # Extract required fields
                            title = brief.get("title", "")
                            buyer = brief.get("organisation", "")
                            value = brief.get("budgetRange", "")
                            deadline = brief.get("applicationsClosedAt", "")
                            link = f"https://www.digitalmarketplace.service.gov.uk/digital-outcomes-and-specialists/opportunities/{brief_id}"
                            status = brief.get("status", "live")
                            
                            opportunities.append({
                                "ocid": f"dm-{brief_id}",
                                "title": title,
                                "buyer": buyer,
                                "value": value,
                                "deadline": deadline,
                                "link": link,
                                "status": status,
                                "description_snippet": brief.get("summary", "")[:200],
                                "source": "digital_marketplace",
                                "scanned_at": datetime.utcnow(),
                                "score": 65, # Base score for DM opportunities
                                "classification": "Warm"
                            })
                            
            except urllib.error.HTTPError as e:
                # 404 might mean the endpoint is different or deprecated, handle gracefully
                print(f"[Digital Marketplace] HTTP Error for '{keyword}': {e.code}")
            except Exception as e:
                print(f"[Digital Marketplace] Error fetching for '{keyword}': {e}")
                
            time.sleep(1) # Be nice to the API
            
        return opportunities

# ── Orchestration ────────────────────────────────────────────────────────────

def run_scan() -> Dict:
    """Run the Digital Marketplace scan."""
    client = DigitalMarketplaceClient()
    opportunities = client.search_opportunities()
    
    written = 0
    try:
        from secureflex_intel.db import db_available, get_engine, tenders_table, upsert_rows
        
        if db_available() and opportunities:
            written = upsert_rows(tenders_table, opportunities, "ocid")
            print(f"[Digital Marketplace] Wrote {written} opportunities to database")
            
    except Exception as e:
        print(f"[Digital Marketplace] Error saving opportunities: {e}")
        
    return {
        "status": "completed",
        "opportunities_found": len(opportunities),
        "records_written": written
    }

if __name__ == "__main__":
    print(json.dumps(run_scan(), indent=2, default=str))
