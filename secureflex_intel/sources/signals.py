#!/usr/bin/env python3
"""
SecureFlex Intent Signal Scanner — Detect Trigger Events for Security Leads

Scans multiple data sources for "intent signals" — events that indicate a
company may need to change their security provider or add new security services.

Trigger Events Detected:
  1. Job postings for security roles (= active security budget)
  2. Security incidents in target areas (= need for better security)
  3. New venue/development openings (= new security contracts)
  4. Company expansions (= growing security needs)
  5. Competitor distress signals (= clients looking to switch)

Usage:
    python3 scripts/intent_signal_scanner.py
    python3 scripts/intent_signal_scanner.py --source jobs
    python3 scripts/intent_signal_scanner.py --source news
    python3 scripts/intent_signal_scanner.py --source all
    python3 scripts/intent_signal_scanner.py --source google-alerts

Data Sources:
    - Indeed/Reed RSS feeds (job postings)
    - Google News RSS (security incidents, company news)
    - Met Police crime data API (area crime stats)
    - Google Alerts (custom monitoring)
"""

import csv
import json
import os
import sys
import re
import time
import argparse
from datetime import datetime, timedelta
from urllib.request import urlopen, Request
from urllib.error import URLError, HTTPError
from urllib.parse import urlencode, quote
from xml.etree import ElementTree


# ── Configuration ────────────────────────────────────────────────────────────

from secureflex_intel.config import settings

settings.ensure_dirs()
PIPELINE_PATH = str(settings.pipeline_path)
SIGNALS_DIR = str(settings.signals_dir)

# Job search keywords that indicate security purchasing intent
JOB_SEARCH_QUERIES = [
    # Companies hiring security = they have a security budget
    "Security Officer London",
    "Door Supervisor London",
    "Security Guard London",
    "CCTV Operator London",
    "Loss Prevention London",
    "Security Manager London",
    "Head of Security London",
    # Facilities management roles often include security procurement
    "Facilities Manager London security",
    # Property management hires security subcontractors
    "Property Manager London",
]

# News search queries for trigger events
NEWS_SEARCH_QUERIES = [
    # Security incidents = need for better security
    '"security breach" London',
    '"security incident" London venue',
    '"break-in" London commercial',
    '"shoplifting" London retail',
    'robbery London business',
    # Contract changes = opportunities
    '"security contract" London awarded',
    '"security tender" London',
    '"security provider" London change',
    # New developments = new security needs
    '"new development" London commercial',
    '"opening" London shopping centre',
    '"opening" London hotel',
    '"new venue" London',
    # Competitor issues
    '"security company" London complaint',
    '"security firm" London problem',
]

# Indeed RSS base URL (public, no API key needed)
INDEED_RSS_BASE = "https://www.indeed.co.uk/rss"

# Google News RSS
GOOGLE_NEWS_RSS = "https://news.google.com/rss/search"


# ── Signal Detection ─────────────────────────────────────────────────────────

def scan_job_postings():
    """
    Scan job boards for security-related postings in London.

    Companies posting security jobs are either:
    1. Direct employers (venues, corporates) = potential clients
    2. Security companies hiring = potential subcontract partners
    3. FM companies managing security = potential clients

    Each posting is a buying signal.
    """
    print("\n🔍 Scanning job postings for security intent signals...")
    print()

    all_signals = []

    for query in JOB_SEARCH_QUERIES:
        print(f"  📋 Searching: '{query}'...")

        # Try Indeed RSS feed
        signals = fetch_indeed_rss(query)
        if signals:
            all_signals.extend(signals)
            print(f"    → {len(signals)} postings found")
        else:
            print(f"    → RSS unavailable or no results")

        time.sleep(2)  # Rate limiting

    # Deduplicate by title + company
    seen = set()
    unique_signals = []
    for sig in all_signals:
        key = (sig.get("company", "").lower(), sig.get("title", "").lower())
        if key not in seen:
            seen.add(key)
            unique_signals.append(sig)

    # Score and classify signals
    for sig in unique_signals:
        sig["score"], sig["signal_type"] = score_job_signal(sig)

    # Sort by score
    unique_signals.sort(key=lambda x: x["score"], reverse=True)

    print(f"\n📊 Total unique job signals: {len(unique_signals)}")
    return unique_signals


def fetch_indeed_rss(query):
    """Fetch job postings from Indeed RSS feed."""
    params = {
        "q": query,
        "l": "London",
        "sort": "date",
        "fromage": "7",  # Last 7 days
    }
    url = f"{INDEED_RSS_BASE}?{urlencode(params)}"

    headers = {
        "User-Agent": "Mozilla/5.0 (compatible; SecureFlex-Scanner/1.0)",
        "Accept": "application/rss+xml, application/xml, text/xml",
    }

    try:
        req = Request(url, headers=headers)
        with urlopen(req, timeout=15) as response:
            content = response.read()
            return parse_rss_jobs(content)
    except Exception as e:
        return []


def parse_rss_jobs(xml_content):
    """Parse RSS feed XML into job signal dicts."""
    signals = []
    try:
        root = ElementTree.fromstring(xml_content)
        channel = root.find("channel")
        if channel is None:
            return signals

        for item in channel.findall("item"):
            title = (item.findtext("title") or "").strip()
            link = (item.findtext("link") or "").strip()
            description = (item.findtext("description") or "").strip()
            pub_date = (item.findtext("pubDate") or "").strip()
            source = (item.findtext("source") or "").strip()

            # Extract company name from title (usually "Job Title - Company Name")
            company = ""
            if " - " in title:
                parts = title.rsplit(" - ", 1)
                if len(parts) == 2:
                    company = parts[1].strip()

            # Clean HTML from description
            description = re.sub(r"<[^>]+>", " ", description)
            description = re.sub(r"\s+", " ", description).strip()

            signals.append({
                "source": "Indeed",
                "title": title,
                "company": company,
                "description": description[:300],
                "link": link,
                "published": pub_date,
                "signal_category": "job_posting",
            })
    except ElementTree.ParseError:
        pass

    return signals


def score_job_signal(signal):
    """
    Score a job posting signal for lead quality.

    High-value signals:
    - Non-security companies posting for security roles (= they buy security externally)
    - FM companies posting for security (= they procure security subcontracts)
    - Large companies posting multiple roles (= big budget)

    Lower-value signals:
    - Security companies hiring (= potential partner, not client)
    """
    score = 50  # Base score
    signal_type = "potential_client"

    title = (signal.get("title") or "").lower()
    company = (signal.get("company") or "").lower()
    description = (signal.get("description") or "").lower()

    # Check if the posting company is a security company (partner, not client)
    security_company_keywords = [
        "security", "guarding", "securitas", "g4s", "mitie", "ocs",
        "kingdom", "corps", "legion", "shield", "sentinel", "vigil",
        "protection", "patrol", "surveillance",
    ]
    is_security_company = any(kw in company for kw in security_company_keywords)

    if is_security_company:
        score -= 20
        signal_type = "competitor_hiring"
    else:
        score += 20  # Non-security company posting for security = client signal
        signal_type = "potential_client"

    # Senior roles = bigger budget, more decision-making power
    senior_keywords = ["manager", "head of", "director", "chief", "lead"]
    if any(kw in title for kw in senior_keywords):
        score += 15
        signal_type = "high_value_client" if not is_security_company else "competitor_hiring"

    # FM companies = they procure security subcontracts
    fm_keywords = ["facilities", "property", "estate", "building"]
    if any(kw in company for kw in fm_keywords):
        score += 10
        signal_type = "fm_procurement"

    # Venue/hospitality = strong security buyer
    venue_keywords = ["hotel", "venue", "centre", "mall", "arena", "stadium", "theatre"]
    if any(kw in company for kw in venue_keywords):
        score += 15
        signal_type = "venue_client"

    # Large company indicators
    large_indicators = ["plc", "limited", "ltd", "group", "international"]
    if any(kw in company for kw in large_indicators):
        score += 5

    # London-specific bonuses
    london_keywords = ["london", "westminster", "canary wharf", "city of london"]
    if any(kw in company.lower() or kw in description for kw in london_keywords):
        score += 10

    return min(100, max(0, score)), signal_type


# ── News Signal Detection ────────────────────────────────────────────────────

def scan_news_signals():
    """
    Scan Google News RSS for security-related trigger events in London.

    Looks for:
    - Security incidents at specific venues/areas
    - Contract awards/changes
    - New developments/openings
    - Competitor issues
    """
    print("\n🔍 Scanning news for security trigger events...")
    print()

    all_signals = []

    for query in NEWS_SEARCH_QUERIES:
        print(f"  📰 Searching: '{query}'...")
        signals = fetch_google_news_rss(query)
        if signals:
            all_signals.extend(signals)
            print(f"    → {len(signals)} articles found")
        else:
            print(f"    → No results or feed unavailable")
        time.sleep(2)

    # Deduplicate by title
    seen = set()
    unique_signals = []
    for sig in all_signals:
        key = sig.get("title", "").lower()[:60]
        if key and key not in seen:
            seen.add(key)
            unique_signals.append(sig)

    # Score signals
    for sig in unique_signals:
        sig["score"], sig["signal_type"] = score_news_signal(sig)

    unique_signals.sort(key=lambda x: x["score"], reverse=True)

    print(f"\n📊 Total unique news signals: {len(unique_signals)}")
    return unique_signals


def fetch_google_news_rss(query):
    """Fetch news articles from Google News RSS."""
    params = {
        "q": query,
        "hl": "en-GB",
        "gl": "GB",
        "ceid": "GB:en",
    }
    url = f"{GOOGLE_NEWS_RSS}?{urlencode(params)}"

    headers = {
        "User-Agent": "Mozilla/5.0 (compatible; SecureFlex-Scanner/1.0)",
        "Accept": "application/rss+xml, application/xml, text/xml",
    }

    try:
        req = Request(url, headers=headers)
        with urlopen(req, timeout=15) as response:
            content = response.read()
            return parse_rss_news(content, query)
    except Exception as e:
        return []


def parse_rss_news(xml_content, query):
    """Parse Google News RSS into signal dicts."""
    signals = []
    try:
        root = ElementTree.fromstring(xml_content)
        channel = root.find("channel")
        if channel is None:
            return signals

        for item in channel.findall("item")[:10]:  # Limit to 10 per query
            title = (item.findtext("title") or "").strip()
            link = (item.findtext("link") or "").strip()
            description = (item.findtext("description") or "").strip()
            pub_date = (item.findtext("pubDate") or "").strip()
            source_elem = item.find("source")
            source = source_elem.text if source_elem is not None else ""

            # Clean HTML
            description = re.sub(r"<[^>]+>", " ", description)
            description = re.sub(r"\s+", " ", description).strip()

            signals.append({
                "source": f"Google News ({source})",
                "title": title,
                "company": "",  # Will be extracted during scoring
                "description": description[:300],
                "link": link,
                "published": pub_date,
                "signal_category": "news",
                "query": query,
            })
    except ElementTree.ParseError:
        pass

    return signals


def score_news_signal(signal):
    """Score a news article for security business relevance."""
    score = 30
    signal_type = "general_news"

    title = (signal.get("title") or "").lower()
    description = (signal.get("description") or "").lower()
    combined = f"{title} {description}"

    # Security incident = high-value trigger
    incident_keywords = ["break-in", "robbery", "assault", "theft", "shoplifting",
                         "security breach", "security incident", "burglary",
                         "trespass", "vandalism"]
    if any(kw in combined for kw in incident_keywords):
        score += 30
        signal_type = "security_incident"

    # Contract/tender = direct opportunity
    contract_keywords = ["tender", "contract", "awarded", "procurement",
                         "bid", "framework", "outsource"]
    if any(kw in combined for kw in contract_keywords):
        score += 35
        signal_type = "contract_opportunity"

    # New development = future opportunity
    development_keywords = ["opening", "new development", "planning permission",
                           "expansion", "new venue", "construction", "new build"]
    if any(kw in combined for kw in development_keywords):
        score += 20
        signal_type = "new_development"

    # Competitor issues = poaching opportunity
    competitor_keywords = ["security company", "security firm", "security provider",
                          "complaint", "problem", "failure", "poor service"]
    if sum(1 for kw in competitor_keywords if kw in combined) >= 2:
        score += 25
        signal_type = "competitor_issue"

    # London bonus
    london_keywords = ["london", "westminster", "canary wharf", "docklands",
                       "city of london", "hackney", "camden", "islington"]
    if any(kw in combined for kw in london_keywords):
        score += 15

    # Recency bonus (published in last 7 days)
    pub_date = signal.get("published", "")
    if pub_date:
        try:
            # RSS dates can be various formats
            for fmt in ["%a, %d %b %Y %H:%M:%S %Z", "%a, %d %b %Y %H:%M:%S %z",
                       "%Y-%m-%dT%H:%M:%S%z", "%Y-%m-%d"]:
                try:
                    dt = datetime.strptime(pub_date, fmt)
                    days_old = (datetime.now() - dt.replace(tzinfo=None)).days
                    if days_old <= 2:
                        score += 10
                    elif days_old <= 7:
                        score += 5
                    break
                except ValueError:
                    continue
        except Exception:
            pass

    return min(100, max(0, score)), signal_type


# ── Met Police Crime Data ────────────────────────────────────────────────────

def scan_crime_data(latitude=51.5074, longitude=-0.1278, radius_miles=1):
    """
    Fetch crime data from the Police API for a specific area.

    This is useful for creating "Security Risk Briefings" for prospects
    in specific areas — a powerful sales tool.

    API: https://data.police.uk/docs/
    Free, no API key required.
    """
    print(f"\n🔍 Scanning Met Police crime data...")
    print(f"   Location: {latitude}, {longitude}")
    print(f"   Radius: ~{radius_miles} mile(s)")
    print()

    # Get the latest available month
    url = "https://data.police.uk/api/crime-last-updated"
    try:
        req = Request(url, headers={"User-Agent": "SecureFlex-Scanner/1.0"})
        with urlopen(req, timeout=15) as response:
            data = json.loads(response.read())
            latest_month = data.get("date", "")
            print(f"  📅 Latest available data: {latest_month}")
    except Exception as e:
        print(f"  ⚠️  Could not check latest month: {e}")
        latest_month = (datetime.now() - timedelta(days=60)).strftime("%Y-%m")

    # Fetch crimes at location
    params = {
        "lat": latitude,
        "lng": longitude,
        "date": latest_month,
    }
    crimes_url = f"https://data.police.uk/api/crimes-at-location?{urlencode(params)}"

    try:
        req = Request(crimes_url, headers={"User-Agent": "SecureFlex-Scanner/1.0"})
        with urlopen(req, timeout=30) as response:
            crimes = json.loads(response.read())

        if not crimes:
            print("  No crimes found at this exact location.")
            print("  Try street-level API with broader area.")
            return []

        # Categorize crimes
        categories = {}
        for crime in crimes:
            cat = crime.get("category", "other")
            categories[cat] = categories.get(cat, 0) + 1

        print(f"\n  📊 Crime Summary ({latest_month}):")
        for cat, count in sorted(categories.items(), key=lambda x: x[1], reverse=True):
            emoji = "🔴" if count > 5 else "🟡" if count > 2 else "🟢"
            print(f"    {emoji} {cat}: {count}")

        # Flag security-relevant crime types
        security_relevant = [
            "burglary", "robbery", "shoplifting", "theft-from-the-person",
            "other-theft", "violent-crime", "criminal-damage-arson",
            "anti-social-behaviour",
        ]
        relevant_count = sum(categories.get(c, 0) for c in security_relevant)
        total = len(crimes)

        print(f"\n  Security-relevant crimes: {relevant_count}/{total} ({relevant_count/max(total,1)*100:.0f}%)")

        return crimes

    except Exception as e:
        print(f"  ⚠️  Error fetching crime data: {e}")
        return []


# ── Google Alerts Setup Guide ────────────────────────────────────────────────

def print_google_alerts_setup():
    """Print instructions for setting up Google Alerts for automated monitoring."""
    print()
    print("=" * 60)
    print("  GOOGLE ALERTS SETUP GUIDE")
    print("  Free, Automated Trigger Event Monitoring")
    print("=" * 60)
    print()
    print("Go to: https://www.google.com/alerts")
    print()
    print("Create these alerts (deliver to email, once a day, best results):")
    print()
    print("─── SECURITY CONTRACTS ───")
    alerts = [
        '"security contract" London',
        '"security tender" London',
        '"manned guarding" contract London',
        '"security services" procurement London',
        '"security guard" contract award London',
    ]
    for a in alerts:
        print(f"  ✅ {a}")

    print()
    print("─── SECURITY INCIDENTS (Opportunity Signals) ───")
    alerts = [
        '"security incident" London commercial',
        '"break-in" London business',
        '"robbery" London retail',
        '"shoplifting" London shopping centre',
        '"security breach" London office',
    ]
    for a in alerts:
        print(f"  ✅ {a}")

    print()
    print("─── NEW DEVELOPMENTS (Future Contracts) ───")
    alerts = [
        '"new hotel" London opening',
        '"new development" London commercial',
        '"shopping centre" London opening',
        '"planning permission" London commercial',
        '"new venue" London',
    ]
    for a in alerts:
        print(f"  ✅ {a}")

    print()
    print("─── COMPETITOR MONITORING ───")
    alerts = [
        '"security company" London administration',
        '"security company" London complaint',
        '"security firm" London closed',
        '"Securitas" London OR "G4S" London OR "Mitie" London',
    ]
    for a in alerts:
        print(f"  ✅ {a}")

    print()
    print("─── SPECIFIC PROSPECT MONITORING ───")
    print("  Add an alert for each major prospect company:")
    print('  ✅ "Westfield London" security')
    print('  ✅ "Canary Wharf Group" security')
    print('  ✅ "British Land" security')
    print('  ✅ "[Company Name]" security')
    print()
    print("─── PIPELINE COMPANY NAMES ───")

    # Read pipeline and suggest alerts for current leads
    if os.path.exists(PIPELINE_PATH):
        with open(PIPELINE_PATH, "r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                name = row.get("company_name", "").strip()
                if name:
                    print(f'  ✅ "{name}" security OR contract')
    else:
        print("  (Add pipeline_master.csv to see suggestions)")

    print()
    print("💡 TOTAL: Set up ~25-30 alerts. Google will email you daily.")
    print("   This is the EASIEST and most effective free monitoring tool.")
    print()


# ── Output ───────────────────────────────────────────────────────────────────

def save_signals_report(job_signals, news_signals, crime_data=None):
    """Save all signals to a comprehensive report."""
    today = datetime.now().strftime("%Y-%m-%d")
    filepath = os.path.join(SIGNALS_DIR, f"intent_signals_{today}.md")

    lines = [
        f"# Intent Signal Scan — {today}",
        "",
        f"**Scan Time:** {datetime.now().strftime('%Y-%m-%d %H:%M')}",
        f"**Job Signals:** {len(job_signals)}",
        f"**News Signals:** {len(news_signals)}",
        "",
        "---",
        "",
    ]

    # Job signals
    if job_signals:
        hot_jobs = [s for s in job_signals if s["score"] >= 70]
        warm_jobs = [s for s in job_signals if 50 <= s["score"] < 70]
        other_jobs = [s for s in job_signals if s["score"] < 50]

        lines.append("## 📋 Job Posting Signals")
        lines.append("")
        lines.append(f"**Total:** {len(job_signals)} | "
                     f"**Hot:** {len(hot_jobs)} | "
                     f"**Warm:** {len(warm_jobs)} | "
                     f"**Other:** {len(other_jobs)}")
        lines.append("")

        for category, items in [("🔴 Hot Signals", hot_jobs),
                                 ("🟡 Warm Signals", warm_jobs),
                                 ("🟢 Other", other_jobs[:20])]:
            if items:
                lines.append(f"### {category}")
                lines.append("")
                for sig in items:
                    lines.append(f"- **[{sig['score']}/100]** {sig['title']}")
                    if sig.get("company"):
                        lines.append(f"  - Company: {sig['company']}")
                    lines.append(f"  - Type: {sig['signal_type']}")
                    lines.append(f"  - Source: {sig['source']}")
                    if sig.get("link"):
                        lines.append(f"  - Link: {sig['link']}")
                    lines.append("")

    # News signals
    if news_signals:
        hot_news = [s for s in news_signals if s["score"] >= 60]
        warm_news = [s for s in news_signals if 40 <= s["score"] < 60]

        lines.append("## 📰 News & Event Signals")
        lines.append("")
        lines.append(f"**Total:** {len(news_signals)} | "
                     f"**Hot:** {len(hot_news)} | "
                     f"**Warm:** {len(warm_news)}")
        lines.append("")

        for category, items in [("🔴 Hot Signals", hot_news),
                                 ("🟡 Warm Signals", warm_news)]:
            if items:
                lines.append(f"### {category}")
                lines.append("")
                for sig in items:
                    lines.append(f"- **[{sig['score']}/100]** {sig['title']}")
                    lines.append(f"  - Type: {sig['signal_type']}")
                    lines.append(f"  - Source: {sig['source']}")
                    if sig.get("link"):
                        lines.append(f"  - Link: {sig['link']}")
                    if sig.get("description"):
                        lines.append(f"  - Summary: {sig['description'][:150]}")
                    lines.append("")

    # Action items
    lines.append("## 📌 Recommended Actions")
    lines.append("")

    if job_signals:
        hot_jobs = [s for s in job_signals if s["score"] >= 70]
        if hot_jobs:
            lines.append("### From Job Signals:")
            for sig in hot_jobs[:5]:
                company = sig.get("company", "Unknown")
                lines.append(f"1. **Research {company}** — Posted '{sig['title'][:50]}'")
                lines.append(f"   - Find decision maker on LinkedIn")
                lines.append(f"   - Check if they use external security provider")
                lines.append(f"   - Prepare personalized outreach angle")
                lines.append("")

    if news_signals:
        hot_news = [s for s in news_signals if s["score"] >= 60]
        if hot_news:
            lines.append("### From News Signals:")
            for sig in hot_news[:5]:
                lines.append(f"1. **{sig['title'][:60]}** ({sig['signal_type']})")
                if sig["signal_type"] == "security_incident":
                    lines.append(f"   - Research affected venue/company")
                    lines.append(f"   - Prepare security assessment offer")
                elif sig["signal_type"] == "contract_opportunity":
                    lines.append(f"   - Review full tender details")
                    lines.append(f"   - Prepare response/expression of interest")
                elif sig["signal_type"] == "new_development":
                    lines.append(f"   - Research developer/operator")
                    lines.append(f"   - Prepare early engagement outreach")
                lines.append("")

    with open(filepath, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))

    return filepath


def save_signals_csv(signals, filename):
    """Save signals to CSV and database."""
    # ── DB write (primary) ────────────────────────────────────────────────
    try:
        from secureflex_intel.db import db_available, upsert_rows, signals_table
        from datetime import datetime as _dt
        if db_available():
            db_rows = []
            for sig in signals:
                db_rows.append({
                    'link': sig.get('link') or sig.get('url') or None,
                    'title': sig.get('title', ''),
                    'company': sig.get('company', ''),
                    'source': sig.get('source', ''),
                    'published': sig.get('published', ''),
                    'description': sig.get('description', ''),
                    'score': int(sig.get('score', 0)),
                    'signal_type': sig.get('signal_type', ''),
                    'signal_category': sig.get('signal_category', ''),
                    'scanned_at': _dt.utcnow(),
                })
            written = upsert_rows(signals_table, db_rows, 'link')
            print(f'[DB] Upserted {written} signals')
    except Exception as _db_err:
        print(f'[DB] Signal DB write failed: {_db_err}')
    # ── CSV write (backup) ────────────────────────────────────────────────
    filepath = os.path.join(SIGNALS_DIR, filename)

    fieldnames = [
        "score", "signal_type", "signal_category", "title", "company",
        "source", "published", "link", "description",
    ]

    with open(filepath, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for sig in sorted(signals, key=lambda x: x.get("score", 0), reverse=True):
            writer.writerow({k: sig.get(k, "") for k in fieldnames})

    return filepath


# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="SecureFlex Intent Signal Scanner — Detect security lead trigger events"
    )
    parser.add_argument(
        "--source", default="all",
        choices=["all", "jobs", "news", "crime", "google-alerts"],
        help="Which sources to scan (default: all)"
    )
    parser.add_argument(
        "--lat", type=float, default=51.5074,
        help="Latitude for crime data (default: Central London)"
    )
    parser.add_argument(
        "--lng", type=float, default=-0.1278,
        help="Longitude for crime data (default: Central London)"
    )
    args = parser.parse_args()

    print("=" * 60)
    print("  SecureFlex Intent Signal Scanner")
    print("  Detecting trigger events for security leads")
    print("=" * 60)

    os.makedirs(SIGNALS_DIR, exist_ok=True)
    today = datetime.now().strftime("%Y-%m-%d")

    job_signals = []
    news_signals = []
    crime_data = []

    if args.source in ["all", "jobs"]:
        job_signals = scan_job_postings()

    if args.source in ["all", "news"]:
        news_signals = scan_news_signals()

    if args.source in ["all", "crime"]:
        crime_data = scan_crime_data(args.lat, args.lng)

    if args.source == "google-alerts":
        print_google_alerts_setup()
        return

    # Save outputs
    all_signals = job_signals + news_signals

    if all_signals:
        report_path = save_signals_report(job_signals, news_signals, crime_data)
        print(f"\n📄 Full report saved to: {report_path}")

        if job_signals:
            csv_path = save_signals_csv(job_signals, f"job_signals_{today}.csv")
            print(f"📊 Job signals CSV: {csv_path}")

        if news_signals:
            csv_path = save_signals_csv(news_signals, f"news_signals_{today}.csv")
            print(f"📊 News signals CSV: {csv_path}")

    # Summary
    print()
    print("━" * 50)
    print("  SCAN SUMMARY")
    print("━" * 50)

    if job_signals:
        hot = len([s for s in job_signals if s["score"] >= 70])
        warm = len([s for s in job_signals if 50 <= s["score"] < 70])
        print(f"  📋 Job Signals: {len(job_signals)} total ({hot} hot, {warm} warm)")

    if news_signals:
        hot = len([s for s in news_signals if s["score"] >= 60])
        warm = len([s for s in news_signals if 40 <= s["score"] < 60])
        print(f"  📰 News Signals: {len(news_signals)} total ({hot} hot, {warm} warm)")

    if crime_data:
        print(f"  🔒 Crime Data: {len(crime_data)} incidents at location")

    if not all_signals and not crime_data:
        print("  ⚠️  No signals detected. This is normal if:")
        print("     - RSS feeds are temporarily unavailable")
        print("     - No matching content in the search period")
        print()
        print("  💡 Recommended fallback actions:")
        print("     1. Set up Google Alerts: python3 scripts/intent_signal_scanner.py --source google-alerts")
        print("     2. Manually check Indeed.co.uk for 'Security Officer London'")
        print("     3. Check Google News for 'security incident London'")
        print("     4. Review Contracts Finder: python3 scripts/tender_radar.py")

    print()
    print("💡 Next steps:")
    print("   1. Review the intent signal report")
    print("   2. Research hot-signal companies on LinkedIn")
    print("   3. Add promising leads to pipeline: python3 scripts/build_pipeline_master.py")
    print("   4. Generate outreach for new leads: python3 scripts/daily_outreach.py")
    print("   5. Set up Google Alerts for ongoing monitoring:")
    print("      python3 scripts/intent_signal_scanner.py --source google-alerts")
    print()
    print("✅ Scan complete!")


if __name__ == "__main__":
    main()
