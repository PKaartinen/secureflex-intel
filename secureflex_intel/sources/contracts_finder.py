#!/usr/bin/env python3
"""
SecureFlex Tender Radar — Automated UK Public Sector Tender Monitoring

Monitors Contracts Finder OCDS API for security-related tenders in London and
surrounding areas. Outputs scored opportunities to data/output/tenders/ and
optionally adds high-scoring leads to the pipeline.

Usage (via CLI):
    python -m secureflex_intel tenders
    python -m secureflex_intel tenders --region "London"
    python -m secureflex_intel tenders --min-value 50000
    python -m secureflex_intel tenders --add-to-pipeline

Data Sources:
    - Contracts Finder OCDS API
      https://www.contractsfinder.service.gov.uk/Published/Notices/OCDS/Search
    - Free, no API key required
    - Cursor-based pagination

CPV Codes for Security:
    79710000 - Security services
    79711000 - Alarm monitoring services
    79713000 - Guard services
    79714000 - Surveillance services
    79715000 - Patrol services
    85312310 - Key-holding services
"""

import csv
import json
import os
import sys
import time
import argparse
from datetime import datetime, timedelta
from urllib.request import urlopen, Request
from urllib.error import URLError, HTTPError
from urllib.parse import urlencode, quote_plus

from secureflex_intel.config import settings


# ── Configuration ────────────────────────────────────────────────────────────

CONTRACTS_FINDER_OCDS = "https://www.contractsfinder.service.gov.uk/Published/Notices/OCDS/Search"

# CPV codes that indicate security-related tenders
SECURITY_CPV_PREFIXES = [
    "7971",    # 79710000–79719000 Security services family
    "853123",  # 85312310 Key-holding services
]

# Keywords for text-based matching (scored)
SECURITY_KEYWORDS = [
    "security guard", "manned guarding", "security services",
    "door supervisor", "security officer", "patrol services",
    "key holding", "alarm response", "concierge security",
    "event security", "static guarding", "mobile patrol",
    "security personnel", "close protection", "cctv monitoring",
    "access control", "reception security", "corporate security",
    "retail security", "loss prevention", "guarding",
    "security staffing", "night security", "24/7 security",
]

# Broad search terms to query the API with (cast a wide net)
SEARCH_QUERIES = [
    "security guard",
    "manned guarding",
    "security services",
    "security officer",
    "door supervisor",
    "patrol services",
    "guarding services",
    "CCTV monitoring",
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


# ── Contracts Finder OCDS API Client ─────────────────────────────────────────

def search_contracts_finder(keyword, published_from=None, published_to=None,
                            stages="tender", limit=100, max_pages=5):
    """
    Search the Contracts Finder OCDS API for notices matching a keyword.

    Args:
        keyword: Search term
        published_from: ISO datetime string for start of publication range
        published_to: ISO datetime string for end of publication range
        stages: 'tender' for open opportunities, 'award' for awarded
        limit: Results per page (max ~100)
        max_pages: Maximum number of pages to fetch

    Returns:
        list of OCDS release dicts
    """
    params = {
        "keyword": keyword,
        "limit": limit,
    }
    if stages:
        params["stages"] = stages
    if published_from:
        params["publishedFrom"] = published_from
    if published_to:
        params["publishedTo"] = published_to

    url = f"{CONTRACTS_FINDER_OCDS}?{urlencode(params, quote_via=quote_plus)}"
    all_releases = []
    page = 0

    while url and page < max_pages:
        page += 1
        headers = {
            "Accept": "application/json",
            "User-Agent": "SecureFlex-TenderRadar/2.0 (business-development-tool)",
        }

        try:
            # Ensure the URL has no unquoted spaces (pagination cursors can have them)
            url = url.replace(" ", "%20")
            req = Request(url, headers=headers)
            with urlopen(req, timeout=30) as response:
                data = json.loads(response.read().decode("utf-8"))
                releases = data.get("releases", [])
                all_releases.extend(releases)

                # Follow pagination cursor
                next_url = data.get("links", {}).get("next", "")
                url = next_url if next_url else None

        except HTTPError as e:
            print(f"  ⚠️  HTTP Error {e.code} for '{keyword}' page {page}: {e.reason}")
            if e.code == 429:
                print("  ⏳ Rate limited. Waiting 30 seconds...")
                time.sleep(30)
                continue  # Retry same URL
            break
        except URLError as e:
            print(f"  ⚠️  URL Error for '{keyword}': {e.reason}")
            break
        except Exception as e:
            print(f"  ⚠️  Unexpected error for '{keyword}': {e}")
            break

        # Be respectful of rate limits
        if url:
            time.sleep(1)

    return all_releases


# ── OCDS Release Parsing ─────────────────────────────────────────────────────

def parse_ocds_release(release):
    """
    Extract relevant fields from an OCDS release.

    Returns a standardised opportunity dict.
    """
    tender = release.get("tender", {})
    parties = release.get("parties", [])

    # Title & description
    title = tender.get("title", "Untitled")
    description = tender.get("description", "")

    # Status
    status = tender.get("status", "unknown")

    # CPV classification
    classification = tender.get("classification", {})
    cpv_code = classification.get("id", "")
    cpv_description = classification.get("description", "")

    # Value
    value_obj = tender.get("value", {})
    value = value_obj.get("amount", 0) or 0
    currency = value_obj.get("currency", "GBP")

    # Min value
    min_value_obj = tender.get("minValue", {})
    min_value = min_value_obj.get("amount", 0) or 0

    # Location / region from delivery addresses
    region = ""
    country = ""
    items = tender.get("items", [])
    if items:
        addrs = items[0].get("deliveryAddresses", [])
        if addrs:
            region = addrs[0].get("region", "")
            country = addrs[0].get("countryName", "")

    # Deadline
    tender_period = tender.get("tenderPeriod", {})
    deadline = tender_period.get("endDate", "")

    # Contract period
    contract_period = tender.get("contractPeriod", {})
    contract_start = contract_period.get("startDate", "")
    contract_end = contract_period.get("endDate", "")

    # Published date
    published = release.get("date", "")

    # Buyer info
    buyer_name = ""
    buyer_email = ""
    buyer_address = ""
    for party in parties:
        if "buyer" in party.get("roles", []):
            buyer_name = party.get("name", "")
            cp = party.get("contactPoint", {})
            buyer_email = cp.get("email", "")
            addr = party.get("address", {})
            buyer_address = ", ".join(filter(None, [
                addr.get("streetAddress", ""),
                addr.get("locality", ""),
                addr.get("postalCode", ""),
            ]))
            break

    # SME suitability
    suitability = tender.get("suitability", {})
    sme_friendly = suitability.get("sme", False)

    # OCDS ID for dedup and link
    ocid = release.get("ocid", "")
    release_id = release.get("id", "")

    # Build CF link from the tender ID
    tender_id = tender.get("id", "")
    link = ""
    if tender_id:
        link = f"https://www.contractsfinder.service.gov.uk/Notice/{tender_id}"

    return {
        "title": title,
        "description": description,
        "status": status,
        "cpv_code": cpv_code,
        "cpv_description": cpv_description,
        "buyer": buyer_name,
        "buyer_email": buyer_email,
        "buyer_address": buyer_address,
        "region": region,
        "country": country,
        "value": value,
        "min_value": min_value,
        "currency": currency,
        "deadline": deadline,
        "contract_start": contract_start,
        "contract_end": contract_end,
        "published_date": published,
        "sme_friendly": sme_friendly,
        "link": link,
        "ocid": ocid,
        "release_id": release_id,
        "tender_id": tender_id,
    }


def is_security_related(parsed):
    """Check if a parsed notice is actually security-related."""
    # Check CPV code
    cpv = parsed.get("cpv_code", "")
    for prefix in SECURITY_CPV_PREFIXES:
        if cpv.startswith(prefix):
            return True

    # Check title and description for security keywords
    combined = f"{parsed['title']} {parsed['description']}".lower()
    hits = sum(1 for kw in SECURITY_KEYWORDS if kw in combined)
    return hits >= 1


# ── Scoring & Classification ─────────────────────────────────────────────────

def score_opportunity(parsed):
    """
    Score a tender opportunity based on relevance to SecureFlex.

    Returns a score 0-100 and a breakdown dict.
    """
    score = 0
    breakdown = {}
    combined_text = f"{parsed['title']} {parsed['description']} {parsed['region']}".lower()

    # ── Keyword relevance (0-40 points) ──────────────────────────────────
    keyword_hits = sum(1 for kw in SECURITY_KEYWORDS if kw in combined_text)
    keyword_score = min(40, keyword_hits * 8)

    # Bonus for CPV match
    cpv = parsed.get("cpv_code", "")
    for prefix in SECURITY_CPV_PREFIXES:
        if cpv.startswith(prefix):
            keyword_score = min(40, keyword_score + 15)
            break

    score += keyword_score
    breakdown["keyword_relevance"] = f"{keyword_score}/40 ({keyword_hits} kw + CPV:{cpv[:4] if cpv else 'none'})"

    # ── Location relevance (0-25 points) ─────────────────────────────────
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
    if location_score == 0 and "uk" in combined_loc:
        location_score = 5
        location_match = "UK-wide"

    score += location_score
    breakdown["location"] = f"{location_score}/25 ({location_match})"

    # ── Contract value (0-20 points) ─────────────────────────────────────
    value = parsed.get("value", 0) or parsed.get("min_value", 0) or 0
    value_score = 0

    if 50000 <= value <= 500000:
        value_score = 20  # Sweet spot for SME
    elif 500000 < value <= 2000000:
        value_score = 15  # Achievable with growth
    elif 10000 <= value < 50000:
        value_score = 10  # Small but worthwhile
    elif value > 2000000:
        value_score = 5   # Likely too large for now
    score += value_score
    breakdown["value"] = f"{value_score}/20 (£{value:,.0f})" if value else f"{value_score}/20 (not specified)"

    # ── Deadline proximity (0-10 points) ──────────────────────────────────
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

    # ── SME friendly bonus (0-5 points) ──────────────────────────────────
    sme_score = 5 if parsed.get("sme_friendly") else 0
    score += sme_score
    breakdown["sme_friendly"] = f"{sme_score}/5"

    return score, breakdown


def classify_opportunity(score):
    """Classify opportunity as hot, warm, or cold."""
    if score >= 65:
        return "🔴 HOT"
    elif score >= 40:
        return "🟡 WARM"
    elif score >= 20:
        return "🟢 MONITOR"
    else:
        return "⚪ LOW"


# ── Output & Pipeline Integration ────────────────────────────────────────────

def save_tender_report(opportunities, output_dir):
    """Save a markdown report of found opportunities."""
    today = datetime.now().strftime("%Y-%m-%d")
    filename = f"tender_scan_{today}.md"
    filepath = os.path.join(output_dir, filename)

    counter = 1
    while os.path.exists(filepath):
        counter += 1
        filename = f"tender_scan_{today}_{counter}.md"
        filepath = os.path.join(output_dir, filename)

    hot = [o for o in opportunities if o["classification"].startswith("🔴")]
    warm = [o for o in opportunities if o["classification"].startswith("🟡")]
    monitor = [o for o in opportunities if o["classification"].startswith("🟢")]
    low = [o for o in opportunities if o["classification"].startswith("⚪")]

    lines = [
        f"# Tender Radar Scan — {today}",
        "",
        f"**Scan Time:** {datetime.now().strftime('%Y-%m-%d %H:%M')}",
        f"**Total Opportunities Found:** {len(opportunities)}",
        f"**Hot:** {len(hot)} | **Warm:** {len(warm)} | **Monitor:** {len(monitor)} | **Low:** {len(low)}",
        "",
        "---",
        "",
    ]

    for category, items, emoji in [
        ("HOT Opportunities — Immediate Action Required", hot, "🔴"),
        ("WARM Opportunities — Worth Investigating", warm, "🟡"),
        ("MONITOR — Keep on Radar", monitor, "🟢"),
        ("LOW Priority", low, "⚪"),
    ]:
        if items:
            lines.append(f"## {emoji} {category}")
            lines.append("")
            for opp in sorted(items, key=lambda x: x["score"], reverse=True):
                lines.append(f"### {opp['title']}")
                lines.append(f"- **Score:** {opp['score']}/100")
                lines.append(f"- **Classification:** {opp['classification']}")
                lines.append(f"- **CPV:** {opp.get('cpv_code', '?')} — {opp.get('cpv_description', '?')}")
                lines.append(f"- **Buyer:** {opp.get('buyer', 'Not specified')}")
                if opp.get("buyer_email"):
                    lines.append(f"- **Email:** {opp['buyer_email']}")
                lines.append(f"- **Region:** {opp.get('region', 'Not specified')}")
                lines.append(f"- **Value:** {opp.get('value_display', 'Not specified')}")
                lines.append(f"- **Deadline:** {opp.get('deadline_display', 'Not specified')}")
                lines.append(f"- **Published:** {opp.get('published_display', 'Unknown')}")
                lines.append(f"- **SME Friendly:** {'✅ Yes' if opp.get('sme_friendly') else '❓ Unknown'}")
                lines.append(f"- **Link:** {opp.get('link', 'N/A')}")
                if opp.get("description_snippet"):
                    lines.append(f"- **Description:** {opp['description_snippet']}")
                lines.append("")
                if opp.get("score_breakdown"):
                    lines.append("  **Score Breakdown:**")
                    for key, val in opp["score_breakdown"].items():
                        lines.append(f"  - {key}: {val}")
                    lines.append("")
                lines.append("---")
                lines.append("")

    with open(filepath, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))

    return filepath


def save_tender_csv(opportunities, output_dir):
    """Save opportunities to CSV for pipeline import."""
    today = datetime.now().strftime("%Y-%m-%d")
    filepath = os.path.join(output_dir, f"tender_leads_{today}.csv")

    fieldnames = [
        "classification", "score", "title", "buyer", "buyer_email",
        "region", "cpv_code", "value", "deadline", "sme_friendly",
        "published_date", "link", "description_snippet", "ocid",
    ]

    with open(filepath, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for opp in sorted(opportunities, key=lambda x: x["score"], reverse=True):
            writer.writerow({
                "classification": opp["classification"],
                "score": opp["score"],
                "title": opp.get("title", ""),
                "buyer": opp.get("buyer", ""),
                "buyer_email": opp.get("buyer_email", ""),
                "region": opp.get("region", ""),
                "cpv_code": opp.get("cpv_code", ""),
                "value": opp.get("value", ""),
                "deadline": opp.get("deadline_display", ""),
                "sme_friendly": opp.get("sme_friendly", ""),
                "published_date": opp.get("published_display", ""),
                "link": opp.get("link", ""),
                "description_snippet": opp.get("description_snippet", ""),
                "ocid": opp.get("ocid", ""),
            })

    return filepath


def add_to_pipeline(opportunities, min_score=40):
    """Add high-scoring opportunities to pipeline_master.csv."""
    pipeline_path = str(settings.pipeline_path)
    if not os.path.exists(pipeline_path):
        print("  ⚠️  Pipeline master not found. Skipping pipeline integration.")
        return 0

    existing_companies = set()
    existing_rows = []
    with open(pipeline_path, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames
        for row in reader:
            existing_rows.append(row)
            existing_companies.add(row.get("company_name", "").strip().lower())

    max_id = 0
    for row in existing_rows:
        cid = row.get("company_id", "")
        if cid.startswith("SEC-"):
            try:
                num = int(cid.replace("SEC-", ""))
                max_id = max(max_id, num)
            except ValueError:
                pass

    added = 0
    for opp in opportunities:
        if opp["score"] < min_score:
            continue
        buyer = opp.get("buyer", "").strip()
        if not buyer or buyer.lower() in existing_companies:
            continue

        max_id += 1
        company_id = f"SEC-{max_id:04d}"
        today = datetime.now().strftime("%Y-%m-%d")

        new_row = {fn: "" for fn in fieldnames}
        new_row.update({
            "company_id": company_id,
            "company_name": buyer,
            "company_type": "Local Authority" if any(w in buyer.lower() for w in ["council", "borough", "nhs", "trust"]) else "Corporate",
            "tier": "2",
            "website_url": opp.get("link", ""),
            "region": opp.get("region", "London"),
            "status": "Not Contacted",
            "source": "Tender Radar",
            "date_added": today,
            "last_modified": today,
            "notes": f"Tender: {opp['title'][:80]} | Score: {opp['score']}/100 | {opp.get('value_display', 'N/A')} | Deadline: {opp.get('deadline_display', 'N/A')}",
            "tags": "tender",
            "next_action": "Review tender and prepare response",
            "next_action_due_date": opp.get("deadline_display", ""),
            "contact_email": opp.get("buyer_email", ""),
        })

        existing_rows.append(new_row)
        existing_companies.add(buyer.lower())
        added += 1

    if added > 0:
        with open(pipeline_path, "w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(existing_rows)

    return added


# ── Main Execution ───────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="SecureFlex Tender Radar — Monitor UK public sector security tenders"
    )
    parser.add_argument(
        "--region", default="London",
        help="Primary region to target (default: London)"
    )
    parser.add_argument(
        "--days-back", type=int, default=settings.tender_days_back,
        help=f"How many days back to search (default: {settings.tender_days_back})"
    )
    parser.add_argument(
        "--min-value", type=float, default=0,
        help="Minimum contract value in GBP (default: 0)"
    )
    parser.add_argument(
        "--add-to-pipeline", action="store_true",
        help="Add hot/warm opportunities to pipeline_master.csv"
    )
    parser.add_argument(
        "--stages", default="tender",
        help="Stages to search: tender, award (default: tender)"
    )
    parser.add_argument(
        "--include-all", action="store_true",
        help="Include non-security tenders that matched keyword (for debugging)"
    )
    args = parser.parse_args()

    settings.ensure_dirs()
    tenders_dir = str(settings.tenders_dir)

    print("=" * 60)
    print("  SecureFlex Tender Radar v2 (OCDS API)")
    print("  Scanning UK Contracts Finder for security opportunities")
    print("=" * 60)
    print()

    today = datetime.now()
    from_date = (today - timedelta(days=args.days_back)).strftime("%Y-%m-%dT00:00:00Z")
    to_date = today.strftime("%Y-%m-%dT%H:%M:%SZ")
    print(f"📅 Date range: {from_date[:10]} to {to_date[:10]}")
    print(f"📍 Target region: {args.region}")
    print(f"📊 Stages: {args.stages}")
    print()

    # Search for each query term
    all_releases = {}  # Deduplicate by ocid
    for query in SEARCH_QUERIES:
        print(f"🔍 Searching for: '{query}'...")
        releases = search_contracts_finder(
            keyword=query,
            published_from=from_date,
            published_to=to_date,
            stages=args.stages,
            limit=100,
            max_pages=3,
        )

        new_count = 0
        for release in releases:
            ocid = release.get("ocid", release.get("id", ""))
            if ocid and ocid not in all_releases:
                all_releases[ocid] = release
                new_count += 1

        print(f"  ✅ {len(releases)} results, {new_count} new ({len(all_releases)} unique total)")
        time.sleep(1.5)

    print()
    print(f"📋 Total unique releases found: {len(all_releases)}")

    if not all_releases:
        print("\n⚠️  No tenders found. This could mean:")
        print("   - No matching tenders were published in the date range")
        print("   - Network/API issues")
        print(f"\n💡 Try checking manually at: {CONTRACTS_FINDER_OCDS}?keyword=security&stages=tender&limit=5")

        os.makedirs(tenders_dir, exist_ok=True)
        today_str = datetime.now().strftime("%Y-%m-%d")
        empty_report = os.path.join(tenders_dir, f"tender_scan_{today_str}.md")
        with open(empty_report, "w") as f:
            f.write(f"# Tender Radar Scan — {today_str}\n\n")
            f.write("**No matching tenders found in this scan.**\n\n")
            f.write(f"Date range: {from_date[:10]} to {to_date[:10]}\n")
            f.write(f"Stages: {args.stages}\n")
            f.write(f"Queries searched: {', '.join(SEARCH_QUERIES)}\n")
        print(f"\n📄 Empty report saved to: {empty_report}")
        return

    # Parse and filter
    print("\n🔎 Filtering for security-related tenders...")
    opportunities = []
    skipped = 0

    for ocid, release in all_releases.items():
        parsed = parse_ocds_release(release)

        # Filter: only security-related unless --include-all
        if not args.include_all and not is_security_related(parsed):
            skipped += 1
            continue

        # Filter by min value
        if args.min_value:
            v = parsed.get("value", 0) or 0
            if v and v < args.min_value:
                continue

        # Score
        score, breakdown = score_opportunity(parsed)
        classification = classify_opportunity(score)

        # Format display values
        value = parsed.get("value", 0) or 0
        value_display = f"£{value:,.0f}" if value else "Not specified"

        deadline_display = ""
        if parsed.get("deadline"):
            try:
                dt = datetime.fromisoformat(parsed["deadline"].replace("Z", "+00:00"))
                deadline_display = dt.strftime("%Y-%m-%d")
            except (ValueError, TypeError):
                deadline_display = parsed["deadline"][:10]

        published_display = ""
        if parsed.get("published_date"):
            try:
                dt = datetime.fromisoformat(parsed["published_date"].replace("Z", "+00:00"))
                published_display = dt.strftime("%Y-%m-%d")
            except (ValueError, TypeError):
                published_display = parsed["published_date"][:10]

        description_snippet = parsed["description"][:200].replace("\n", " ").strip()
        if len(parsed["description"]) > 200:
            description_snippet += "..."

        opportunities.append({
            **parsed,
            "score": score,
            "score_breakdown": breakdown,
            "classification": classification,
            "value_display": value_display,
            "deadline_display": deadline_display or "Not specified",
            "published_display": published_display,
            "description_snippet": description_snippet,
        })

    opportunities.sort(key=lambda x: x["score"], reverse=True)

    print(f"  ✅ {len(opportunities)} security-related tenders found (skipped {skipped} non-security)")

    # Categorise
    hot = [o for o in opportunities if o["classification"].startswith("🔴")]
    warm = [o for o in opportunities if o["classification"].startswith("🟡")]
    monitor = [o for o in opportunities if o["classification"].startswith("🟢")]
    low = [o for o in opportunities if o["classification"].startswith("⚪")]

    print()
    print("━" * 50)
    print(f"  🔴 HOT:     {len(hot)} opportunities")
    print(f"  🟡 WARM:    {len(warm)} opportunities")
    print(f"  🟢 MONITOR: {len(monitor)} opportunities")
    print(f"  ⚪ LOW:     {len(low)} opportunities")
    print("━" * 50)

    # Show top opportunities
    if hot or warm:
        print()
        print("🏆 TOP OPPORTUNITIES:")
        print()
        for opp in (hot + warm)[:10]:
            print(f"  {opp['classification']} [{opp['score']}/100] {opp['title'][:60]}")
            print(f"    Buyer: {opp['buyer'][:50]}")
            print(f"    Region: {opp['region']} | Value: {opp['value_display']} | Deadline: {opp['deadline_display']}")
            if opp.get("buyer_email"):
                print(f"    Email: {opp['buyer_email']}")
            print()

    # Save outputs
    os.makedirs(tenders_dir, exist_ok=True)

    if opportunities:
        report_path = save_tender_report(opportunities, tenders_dir)
        print(f"📄 Full report saved to: {report_path}")

        csv_path = save_tender_csv(opportunities, tenders_dir)
        print(f"📊 CSV data saved to: {csv_path}")
    else:
        today_str = datetime.now().strftime("%Y-%m-%d")
        empty_report = os.path.join(tenders_dir, f"tender_scan_{today_str}.md")
        with open(empty_report, "w") as f:
            f.write(f"# Tender Radar Scan — {today_str}\n\n")
            f.write(f"**{len(all_releases)} results retrieved but 0 matched security filters.**\n\n")
            f.write("Try running with `--include-all` to see all results,\n")
            f.write("or broaden your date range with `--days-back 60`.\n")
        print(f"\n📄 Empty report saved to: {empty_report}")

    # Optionally add to pipeline
    if args.add_to_pipeline and opportunities:
        added = add_to_pipeline(opportunities, min_score=40)
        if added > 0:
            print(f"📥 Added {added} opportunities to pipeline_master.csv")
        else:
            print("📥 No new opportunities added to pipeline (already exists or below threshold)")

    print()
    print("✅ Tender radar scan complete!")
    print()
    print("💡 Next steps:")
    if opportunities:
        print("   1. Review the full report for HOT and WARM opportunities")
        print("   2. For HOT: prepare a tender response immediately")
        print("   3. For WARM: research the buyer and prepare an approach")
        print("   4. Run with --add-to-pipeline to add leads to your pipeline")
    else:
        print("   1. Try --days-back 60 to search a wider date range")
        print("   2. Try --include-all to see all keyword matches")
        print("   3. Check manually at https://www.contractsfinder.service.gov.uk")
    print("   5. Run this scan daily for continuous monitoring")


if __name__ == "__main__":
    main()
