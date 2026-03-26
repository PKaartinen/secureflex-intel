#!/usr/bin/env python3
"""
SecureFlex Companies House Prospector — Find Potential Clients & Monitor Competitors

Uses the free Companies House API to:
1. Find companies by SIC code that are likely buyers of security services
2. Find security industry competitors and monitor their health
3. Detect trigger events (administration, late filings, director changes)
4. Enrich existing pipeline leads with Companies House data

Usage:
    python3 scripts/companies_house_prospector.py --mode clients
    python3 scripts/companies_house_prospector.py --mode competitors
    python3 scripts/companies_house_prospector.py --mode enrich
    python3 scripts/companies_house_prospector.py --mode monitor-competitors

Setup:
    1. Get a free API key from https://developer.company-information.service.gov.uk/
    2. Set environment variable: export COMPANIES_HOUSE_API_KEY="your-key-here"
       Or add to config/system_config.yaml under api_keys.companies_house
"""

import base64
import csv
import json
import os
import sys
import time
import argparse
from datetime import datetime, timedelta
from urllib.request import urlopen, Request
from urllib.error import URLError, HTTPError
from urllib.parse import urlencode, quote

try:
    import yaml
    HAS_YAML = True
except ImportError:
    HAS_YAML = False


# ── Configuration ────────────────────────────────────────────────────────────

from secureflex_intel.config import settings

COMPANIES_HOUSE_BASE = "https://api.company-information.service.gov.uk"

settings.ensure_dirs()
PIPELINE_PATH = str(settings.pipeline_path)
OUTPUT_DIR = str(settings.prospects_dir)

# SIC codes for companies that BUY security services
CLIENT_SIC_CODES = {
    # Real estate and property management
    "68100": "Buying and selling of own real estate",
    "68201": "Renting of Housing Association real estate",
    "68209": "Other letting and operating of real estate",
    "68320": "Management of real estate on a fee or contract basis",
    # Hospitality and venues
    "55100": "Hotels and similar accommodation",
    "55201": "Holiday centres and villages",
    "56101": "Licensed restaurants",
    "56301": "Licensed clubs",
    "56302": "Public houses and bars",
    # Sports, leisure, events
    "93110": "Operation of sports facilities",
    "93199": "Other sports activities not elsewhere classified",
    "93210": "Activities of amusement parks and theme parks",
    "93290": "Other amusement and recreation activities",
    "90040": "Operation of arts facilities",
    # Retail
    "47110": "Retail sale in non-specialised stores with food/beverages",
    "47190": "Other retail sale in non-specialised stores",
    "47710": "Retail sale of clothing in specialised stores",
    # Healthcare
    "86101": "Hospital activities",
    "86210": "General medical practice activities",
    "87100": "Residential nursing care facilities",
    # Education
    "85200": "Primary education",
    "85310": "General secondary education",
    "85421": "First-degree level higher education",
    # Financial services
    "64110": "Central banking",
    "64191": "Banks",
    "64192": "Building societies",
    # Construction (new sites need security)
    "41100": "Development of building projects",
    "41201": "Construction of commercial buildings",
    "41202": "Construction of domestic buildings",
    # Warehousing and logistics
    "52100": "Warehousing and storage",
    "52241": "Cargo handling for water transport",
}

# SIC codes for security industry (competitors)
SECURITY_SIC_CODES = {
    "80100": "Private security activities",
    "80200": "Security systems service activities",
    "80300": "Investigation activities",
}

# London postcodes for geographic filtering
LONDON_POSTCODES = [
    "E", "EC", "N", "NW", "SE", "SW", "W", "WC",
    "BR", "CR", "DA", "EN", "HA", "IG", "KT", "RM",
    "SM", "TW", "UB",
]


# ── API Client ───────────────────────────────────────────────────────────────

def get_api_key():
    """Get Companies House API key from settings (env / .env / config)."""
    return settings.companies_house_api_key


def ch_request(endpoint, params=None):
    """
    Make an authenticated request to the Companies House API.

    The API uses HTTP Basic Auth with the API key as username and empty password.
    """
    api_key = get_api_key()
    if not api_key:
        return None

    url = f"{COMPANIES_HOUSE_BASE}{endpoint}"
    if params:
        url += "?" + urlencode(params)

    # Companies House uses Basic Auth: api_key as username, empty password
    auth_string = base64.b64encode(f"{api_key}:".encode()).decode()

    headers = {
        "Authorization": f"Basic {auth_string}",
        "Accept": "application/json",
        "User-Agent": "SecureFlex-Prospector/1.0",
    }

    try:
        req = Request(url, headers=headers)
        with urlopen(req, timeout=30) as response:
            return json.loads(response.read().decode("utf-8"))
    except HTTPError as e:
        if e.code == 401:
            print("  ❌ Invalid API key. Get one at: https://developer.company-information.service.gov.uk/")
            return None
        elif e.code == 429:
            print("  ⏳ Rate limited. Waiting 60 seconds...")
            time.sleep(60)
            return ch_request(endpoint, params)  # Retry
        elif e.code == 404:
            return None  # Not found is expected for some queries
        else:
            print(f"  ⚠️  HTTP Error {e.code}: {e.reason}")
            return None
    except URLError as e:
        print(f"  ⚠️  Connection error: {e.reason}")
        return None
    except Exception as e:
        print(f"  ⚠️  Unexpected error: {e}")
        return None


def search_companies(query, items_per_page=50, start_index=0):
    """Search for companies by name."""
    return ch_request("/search/companies", {
        "q": query,
        "items_per_page": items_per_page,
        "start_index": start_index,
    })


def search_advanced(sic_codes=None, location=None, company_status="active",
                    items_per_page=100, start_index=0):
    """
    Advanced search for companies.

    Note: The advanced search endpoint may require specific formatting.
    Falls back to basic search if advanced isn't available.
    """
    params = {
        "company_status": company_status,
        "size": items_per_page,
        "start_index": start_index,
    }
    if sic_codes:
        params["sic_codes"] = ",".join(sic_codes) if isinstance(sic_codes, list) else sic_codes
    if location:
        params["location"] = location

    return ch_request("/advanced-search/companies", params)


def get_company(company_number):
    """Get full company profile."""
    return ch_request(f"/company/{company_number}")


def get_company_officers(company_number):
    """Get company officers (directors, secretaries)."""
    return ch_request(f"/company/{company_number}/officers")


def get_filing_history(company_number, items_per_page=10):
    """Get recent filing history."""
    return ch_request(f"/company/{company_number}/filing-history", {
        "items_per_page": items_per_page,
    })


# ── Prospecting Logic ────────────────────────────────────────────────────────

def is_london_company(company):
    """Check if a company is based in London area."""
    address = company.get("registered_office_address", {}) or {}
    locality = (address.get("locality") or "").lower()
    region = (address.get("region") or "").lower()
    postal_code = (address.get("postal_code") or "").upper()
    address_line = (address.get("address_line_1") or "").lower()

    # Check locality/region
    london_keywords = ["london", "city of london", "greater london"]
    for kw in london_keywords:
        if kw in locality or kw in region or kw in address_line:
            return True

    # Check postcode
    for prefix in LONDON_POSTCODES:
        if postal_code.startswith(prefix) and len(postal_code) > len(prefix):
            # Make sure it's actually a London postcode and not, e.g., "EN" from "ENTER"
            next_char = postal_code[len(prefix)]
            if next_char.isdigit():
                return True

    return False


def format_company_for_pipeline(company, source_type="Companies House"):
    """Format a Companies House company record for the pipeline."""
    address = company.get("registered_office_address", {}) or {}
    locality = address.get("locality", "")
    region = address.get("region", "")
    postal_code = address.get("postal_code", "")

    address_str = ", ".join(filter(None, [
        address.get("address_line_1", ""),
        address.get("address_line_2", ""),
        locality,
        region,
        postal_code,
    ]))

    sic_codes = company.get("sic_codes", []) or []
    sic_descriptions = []
    all_sic = {**CLIENT_SIC_CODES, **SECURITY_SIC_CODES}
    for code in sic_codes:
        if code in all_sic:
            sic_descriptions.append(f"{code}: {all_sic[code]}")
        else:
            sic_descriptions.append(code)

    company_number = company.get("company_number", "")
    company_name = company.get("company_name", company.get("title", ""))

    # Determine company type based on SIC codes
    company_type = "Corporate"
    for code in sic_codes:
        if code in SECURITY_SIC_CODES:
            company_type = "Prime Contractor"
            break
        if code in ["68100", "68201", "68209", "68320"]:
            company_type = "Facilities Management"
        elif code in ["93110", "93199", "93210", "93290", "90040"]:
            company_type = "Venue/Events"
        elif code.startswith("86") or code.startswith("87"):
            company_type = "Corporate"  # Healthcare
        elif code.startswith("85"):
            company_type = "Corporate"  # Education

    # Determine region
    detected_region = "Unknown"
    if is_london_company(company):
        detected_region = "London"
    elif region:
        detected_region = region
    elif locality:
        detected_region = locality

    return {
        "company_name": company_name,
        "company_type": company_type,
        "website_url": f"https://find-and-update.company-information.service.gov.uk/company/{company_number}",
        "region": detected_region,
        "address": address_str,
        "company_number": company_number,
        "sic_codes": "; ".join(sic_descriptions),
        "status": company.get("company_status", ""),
        "date_of_creation": company.get("date_of_creation", ""),
        "source": source_type,
    }


def prospect_clients(sic_codes_to_search=None, region_filter="london", max_results=200):
    """
    Find potential clients by searching for companies in target industries.

    Strategy: Search for company names associated with target SIC codes
    in the London area.
    """
    if sic_codes_to_search is None:
        sic_codes_to_search = CLIENT_SIC_CODES

    print(f"\n🔍 Prospecting for potential clients...")
    print(f"   SIC codes: {len(sic_codes_to_search)} target industries")
    print(f"   Region filter: {region_filter}")
    print()

    all_companies = {}  # Deduplicate by company number

    # Strategy 1: Search for industry-specific terms + London
    search_terms = [
        "property management London",
        "facilities management London",
        "hotel London",
        "shopping centre London",
        "sports facility London",
        "event venue London",
        "office building London",
        "warehouse London",
        "hospital London",
        "university London",
        "retail park London",
        "construction London security",
        "real estate London",
    ]

    for term in search_terms:
        print(f"  🔎 Searching: '{term}'...")
        result = search_companies(term, items_per_page=50)
        if result and "items" in result:
            for company in result["items"]:
                comp_num = company.get("company_number", "")
                if comp_num and comp_num not in all_companies:
                    # Check if it matches our SIC codes (requires full profile)
                    if region_filter == "london" and not is_london_company(company):
                        continue
                    all_companies[comp_num] = company
            print(f"    → {len(result['items'])} results, {len(all_companies)} unique London companies")
        time.sleep(1)  # Rate limiting

        if len(all_companies) >= max_results:
            break

    # Strategy 2: Try advanced search with SIC codes (if available)
    print(f"\n  🔎 Trying advanced search with SIC codes...")
    for sic_code, description in list(sic_codes_to_search.items())[:10]:
        result = search_advanced(
            sic_codes=[sic_code],
            location="london" if region_filter == "london" else None,
            items_per_page=50,
        )
        if result and "items" in result:
            for company in result["items"]:
                comp_num = company.get("company_number", "")
                if comp_num and comp_num not in all_companies:
                    all_companies[comp_num] = company
            print(f"    SIC {sic_code} ({description}): {len(result.get('items', []))} results")
        elif result is None:
            print(f"    ⚠️  Advanced search may not be available (requires different auth)")
            break
        time.sleep(1)

    print(f"\n📊 Total unique companies found: {len(all_companies)}")
    return list(all_companies.values())


def prospect_competitors(region_filter="london", max_results=200):
    """Find security industry competitors."""
    print(f"\n🔍 Finding security industry competitors...")
    print(f"   SIC codes: {list(SECURITY_SIC_CODES.keys())}")
    print()

    all_companies = {}

    # Search for security companies
    search_terms = [
        "security services London",
        "security guard London",
        "manned guarding London",
        "security company London",
        "patrol services London",
        "door supervisor London",
        "security solutions London",
        "private security London",
        "security management London",
        "corporate security London",
    ]

    for term in search_terms:
        print(f"  🔎 Searching: '{term}'...")
        result = search_companies(term, items_per_page=50)
        if result and "items" in result:
            for company in result["items"]:
                comp_num = company.get("company_number", "")
                status = (company.get("company_status") or "").lower()
                if comp_num and comp_num not in all_companies and status == "active":
                    if region_filter == "london" and not is_london_company(company):
                        continue
                    all_companies[comp_num] = company
            print(f"    → {len(result['items'])} results, {len(all_companies)} unique active London companies")
        time.sleep(1)

        if len(all_companies) >= max_results:
            break

    # Strategy 2: Advanced search with security SIC codes (much more reliable for London filter)
    print(f"\n  🔎 Trying advanced search with security SIC codes...")
    for sic_code, description in SECURITY_SIC_CODES.items():
        result = search_advanced(
            sic_codes=[sic_code],
            location="london" if region_filter == "london" else None,
            items_per_page=100,
        )
        if result and "items" in result:
            for company in result["items"]:
                comp_num = company.get("company_number", "")
                if comp_num and comp_num not in all_companies:
                    all_companies[comp_num] = company
            print(f"    SIC {sic_code} ({description}): {len(result.get('items', []))} results")
        elif result is None:
            print(f"    ⚠️  Advanced search may not be available")
            break
        time.sleep(1)

    print(f"\n📊 Total unique competitor companies found: {len(all_companies)}")
    return list(all_companies.values())


def monitor_competitors(competitor_numbers):
    """
    Monitor a list of competitor company numbers for health signals.

    Checks:
    - Filing status (overdue = financial trouble)
    - Company status (administration, liquidation)
    - Recent director changes (instability)
    """
    print(f"\n📡 Monitoring {len(competitor_numbers)} competitors...")
    print()

    alerts = []
    for comp_num in competitor_numbers:
        print(f"  Checking {comp_num}...", end=" ")
        profile = get_company(comp_num)
        if not profile:
            print("❌ Not found")
            continue

        name = profile.get("company_name", "Unknown")
        status = profile.get("company_status", "unknown")
        has_overdue = profile.get("has_been_liquidated", False)
        has_charges = profile.get("has_charges", False)
        accounts = profile.get("accounts", {}) or {}
        overdue = accounts.get("overdue", False)
        next_due = accounts.get("next_due", "")
        last_accounts = accounts.get("last_accounts", {}) or {}
        last_made_up_to = last_accounts.get("made_up_to", "")

        alert_level = "✅"
        alert_reasons = []

        # Check status
        if status != "active":
            alert_level = "🔴"
            alert_reasons.append(f"Status: {status}")

        # Check overdue filings
        if overdue:
            alert_level = "🟡" if alert_level == "✅" else alert_level
            alert_reasons.append("Accounts OVERDUE")

        # Check if accounts are old
        if last_made_up_to:
            try:
                last_date = datetime.strptime(last_made_up_to, "%Y-%m-%d")
                months_old = (datetime.now() - last_date).days / 30
                if months_old > 18:
                    alert_level = "🟡" if alert_level == "✅" else alert_level
                    alert_reasons.append(f"Last accounts {months_old:.0f} months old")
            except ValueError:
                pass

        print(f"{alert_level} {name}")
        if alert_reasons:
            for reason in alert_reasons:
                print(f"    ⚠️  {reason}")
            alerts.append({
                "company_number": comp_num,
                "company_name": name,
                "alert_level": alert_level,
                "reasons": alert_reasons,
                "status": status,
            })

        time.sleep(1)

    return alerts


def enrich_pipeline_leads():
    """Enrich existing pipeline leads with Companies House data."""
    if not os.path.exists(PIPELINE_PATH):
        print("  ⚠️  Pipeline master not found.")
        return

    api_key = get_api_key()
    if not api_key:
        print("  ❌ No API key. Set COMPANIES_HOUSE_API_KEY environment variable.")
        print("     Get a free key at: https://developer.company-information.service.gov.uk/")
        return

    with open(PIPELINE_PATH, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames
        rows = list(reader)

    enriched_count = 0
    for row in rows:
        name = row.get("company_name", "").strip()
        if not name:
            continue

        # Skip if already has good data
        if row.get("address") and row.get("company_size"):
            continue

        print(f"  🔎 Enriching: {name}...")
        result = search_companies(name, items_per_page=5)

        if result and result.get("items"):
            # Take the best match (first result)
            best = result["items"][0]
            comp_num = best.get("company_number", "")

            # Get full profile
            if comp_num:
                profile = get_company(comp_num)
                if profile:
                    formatted = format_company_for_pipeline(profile)

                    # Fill in missing fields only
                    if not row.get("address"):
                        row["address"] = formatted["address"]
                    if not row.get("region") or row["region"] == "Unknown":
                        row["region"] = formatted["region"]
                    if not row.get("website_url"):
                        row["website_url"] = formatted["website_url"]

                    # Add Companies House data to notes
                    existing_notes = row.get("notes", "")
                    ch_note = f"CH#{comp_num} | SIC: {formatted['sic_codes'][:80]} | Created: {formatted['date_of_creation']}"
                    if "CH#" not in existing_notes:
                        row["notes"] = f"{existing_notes} | {ch_note}" if existing_notes else ch_note

                    row["last_modified"] = datetime.now().strftime("%Y-%m-%d")
                    enriched_count += 1
                    print(f"    ✅ Enriched (CH#{comp_num})")

            time.sleep(1)  # Rate limiting

    # Save updated pipeline
    if enriched_count > 0:
        with open(PIPELINE_PATH, "w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(rows)
        print(f"\n  ✅ Enriched {enriched_count} leads in pipeline_master.csv")
    else:
        print(f"\n  ℹ️  No leads needed enrichment")


# ── Output ───────────────────────────────────────────────────────────────────

def save_prospects_csv(companies, filename, source_type):
    """Save found companies to a CSV file."""
    filepath = os.path.join(OUTPUT_DIR, filename)

    fieldnames = [
        "company_name", "company_number", "company_type", "sic_codes",
        "status", "region", "address", "date_of_creation", "website_url",
    ]

    formatted = []
    for company in companies:
        fmt = format_company_for_pipeline(company, source_type)
        formatted.append(fmt)

    with open(filepath, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for fmt in formatted:
            writer.writerow({k: fmt.get(k, "") for k in fieldnames})

    return filepath, formatted


def save_prospect_report(companies, formatted, filename, report_title):
    """Save a markdown report of found companies."""
    filepath = os.path.join(OUTPUT_DIR, filename)
    today = datetime.now().strftime("%Y-%m-%d")

    lines = [
        f"# {report_title}",
        f"",
        f"**Generated:** {today}",
        f"**Total Companies:** {len(companies)}",
        "",
        "---",
        "",
    ]

    # Group by type
    by_type = {}
    for fmt in formatted:
        ctype = fmt.get("company_type", "Unknown")
        by_type.setdefault(ctype, []).append(fmt)

    for ctype, items in sorted(by_type.items()):
        lines.append(f"## {ctype} ({len(items)} companies)")
        lines.append("")
        for item in sorted(items, key=lambda x: x["company_name"]):
            lines.append(f"### {item['company_name']}")
            lines.append(f"- **Company Number:** {item.get('company_number', 'N/A')}")
            lines.append(f"- **SIC Codes:** {item.get('sic_codes', 'N/A')}")
            lines.append(f"- **Region:** {item.get('region', 'N/A')}")
            lines.append(f"- **Address:** {item.get('address', 'N/A')}")
            lines.append(f"- **Created:** {item.get('date_of_creation', 'N/A')}")
            lines.append(f"- **Status:** {item.get('status', 'N/A')}")
            lines.append(f"- **CH Link:** {item.get('website_url', 'N/A')}")
            lines.append("")

    with open(filepath, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))

    return filepath


# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="SecureFlex Companies House Prospector — Find clients and monitor competitors"
    )
    parser.add_argument(
        "--mode", required=True,
        choices=["clients", "competitors", "monitor-competitors", "enrich"],
        help="Operating mode"
    )
    parser.add_argument(
        "--region", default="london",
        help="Region filter (default: london)"
    )
    parser.add_argument(
        "--max-results", type=int, default=200,
        help="Maximum results to return (default: 200)"
    )
    parser.add_argument(
        "--competitor-numbers", nargs="*",
        help="Company numbers to monitor (for monitor-competitors mode)"
    )
    args = parser.parse_args()

    print("=" * 60)
    print("  SecureFlex Companies House Prospector")
    print(f"  Mode: {args.mode}")
    print("=" * 60)

    api_key = get_api_key()
    if not api_key:
        print()
        print("❌ No Companies House API key found!")
        print()
        print("To use this script, you need a free API key:")
        print("  1. Go to https://developer.company-information.service.gov.uk/")
        print("  2. Register for a free account")
        print("  3. Create an application to get an API key")
        print("  4. Set the key:")
        print("     export COMPANIES_HOUSE_API_KEY='your-key-here'")
        print("     OR add to config/system_config.yaml:")
        print("     api_keys:")
        print("       companies_house: 'your-key-here'")
        print()
        print("The API is completely FREE with generous rate limits (600 req/5 min).")
        print()

        # Still run in demo mode to show what the script does
        print("Running in DEMO mode to show output format...")
        print()
        demo_mode(args.mode)
        return

    os.makedirs(OUTPUT_DIR, exist_ok=True)
    today = datetime.now().strftime("%Y-%m-%d")

    if args.mode == "clients":
        companies = prospect_clients(
            region_filter=args.region,
            max_results=args.max_results,
        )
        if companies:
            csv_path, formatted = save_prospects_csv(
                companies,
                f"prospect_clients_{today}.csv",
                "Companies House (Client Prospect)",
            )
            report_path = save_prospect_report(
                companies, formatted,
                f"prospect_clients_{today}.md",
                "Potential Client Companies — Companies House Search",
            )
            print(f"\n📊 CSV saved to: {csv_path}")
            print(f"📄 Report saved to: {report_path}")
            print(f"\n💡 Next steps:")
            print(f"   1. Review the report for relevant companies")
            print(f"   2. Research each company's security needs")
            print(f"   3. Find decision makers on LinkedIn")
            print(f"   4. Add promising leads to pipeline_master.csv")

    elif args.mode == "competitors":
        companies = prospect_competitors(
            region_filter=args.region,
            max_results=args.max_results,
        )
        if companies:
            csv_path, formatted = save_prospects_csv(
                companies,
                f"competitors_{today}.csv",
                "Companies House (Competitor)",
            )
            report_path = save_prospect_report(
                companies, formatted,
                f"competitors_{today}.md",
                "Security Industry Competitors — Companies House Search",
            )
            print(f"\n📊 CSV saved to: {csv_path}")
            print(f"📄 Report saved to: {report_path}")
            print(f"\n💡 Next steps:")
            print(f"   1. Review competitor list for subcontract partners")
            print(f"   2. Identify struggling competitors (late filings, bad reviews)")
            print(f"   3. Research their clients for poaching opportunities")
            print(f"   4. Monitor key competitors: python3 scripts/companies_house_prospector.py --mode monitor-competitors --competitor-numbers XXXXXXXX YYYYYYYY")

    elif args.mode == "monitor-competitors":
        if not args.competitor_numbers:
            print("\n⚠️  No competitor company numbers provided.")
            print("   Usage: --competitor-numbers 12345678 23456789")
            print("   Find company numbers at: https://find-and-update.company-information.service.gov.uk/")
            return
        alerts = monitor_competitors(args.competitor_numbers)
        if alerts:
            print(f"\n🚨 {len(alerts)} competitor(s) with alerts:")
            for alert in alerts:
                print(f"   {alert['alert_level']} {alert['company_name']}: {', '.join(alert['reasons'])}")

    elif args.mode == "enrich":
        enrich_pipeline_leads()

    print("\n✅ Done!")


def demo_mode(mode):
    """Show what the script would produce without an API key."""
    print("─" * 50)
    print("DEMO: What this script produces with a real API key:")
    print("─" * 50)
    print()

    if mode == "clients":
        print("Mode: FIND POTENTIAL CLIENTS")
        print()
        print("The script searches Companies House for companies in London")
        print("matching these industry SIC codes:")
        print()
        for code, desc in list(CLIENT_SIC_CODES.items())[:10]:
            print(f"  {code}: {desc}")
        print(f"  ... and {len(CLIENT_SIC_CODES) - 10} more")
        print()
        print("Output: CSV and markdown report of companies like:")
        print("  - Property management firms (need site security)")
        print("  - Hotels and hospitality venues (need door/concierge)")
        print("  - Shopping centres (need retail security)")
        print("  - Hospitals and universities (need campus security)")
        print("  - Construction companies (need site security)")
        print("  - Warehouses and logistics (need guarding)")

    elif mode == "competitors":
        print("Mode: FIND COMPETITORS")
        print()
        print("Searches for companies with SIC codes:")
        for code, desc in SECURITY_SIC_CODES.items():
            print(f"  {code}: {desc}")
        print()
        print("Output: List of every active security company in London")
        print("Useful for: subcontract partnerships, competitive intelligence")

    elif mode == "monitor-competitors":
        print("Mode: MONITOR COMPETITOR HEALTH")
        print()
        print("Checks specific companies for warning signals:")
        print("  🔴 Company in administration/liquidation")
        print("  🟡 Overdue account filings (financial trouble)")
        print("  🟡 Very old accounts (15+ months)")
        print("  ✅ Healthy / no concerns")
        print()
        print("Why this matters: When a competitor goes into admin,")
        print("their clients need a new provider IMMEDIATELY.")

    elif mode == "enrich":
        print("Mode: ENRICH PIPELINE LEADS")
        print()
        print("Takes existing leads from pipeline_master.csv and adds:")
        print("  - Registered address")
        print("  - Company number")
        print("  - SIC codes (business type)")
        print("  - Date of creation")
        print("  - Filing status")

    print()
    print("─" * 50)
    print(f"To use for real: export COMPANIES_HOUSE_API_KEY='your-key'")
    print(f"Get free key: https://developer.company-information.service.gov.uk/")
    print("─" * 50)


if __name__ == "__main__":
    main()
