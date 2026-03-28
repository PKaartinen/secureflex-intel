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
    # Senior roles — highest scoring
    "security manager London",
    "head of security London",
    "security director London",
    # Operational roles
    "security guard London",
    "security officer London",
    "door supervisor London",
    "CCTV operator London",
    # Facilities / property (procurement signals)
    "facilities manager London",
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

# Reed RSS base URL (public, no API key needed)
REED_RSS_BASE = "https://www.reed.co.uk/api/1.0/search"

# Google News RSS
GOOGLE_NEWS_RSS = "https://news.google.com/rss/search"

# ── UK News Source Filtering ─────────────────────────────────────────────────

# Sources to block entirely (international / irrelevant)
BLOCKED_SOURCES = [
    "sabc.co.za", "aljazeera", "hindustantimes", "ndtv", "timesofindia",
    "channelnewsasia", "straitstimes", "abc.net.au", "cnn.com", "foxnews",
]

# Trusted UK sources — get a score bonus
TRUSTED_UK_SOURCES = [
    "bbc.co.uk", "theguardian.com", "standard.co.uk", "cityam.com",
    "ft.com", "telegraph.co.uk", "independent.co.uk", "mirror.co.uk",
    "express.co.uk", "metro.co.uk",
]

# London boroughs for geographic relevance bonus
LONDON_BOROUGHS = [
    "westminster", "camden", "islington", "hackney", "tower hamlets",
    "greenwich", "lewisham", "southwark", "lambeth", "wandsworth",
    "hammersmith", "kensington", "chelsea", "fulham", "ealing",
    "hounslow", "richmond", "kingston", "merton", "sutton",
    "croydon", "bromley", "bexley", "havering", "barking",
    "redbridge", "newham", "waltham forest", "haringey", "enfield",
    "barnet", "harrow", "hillingdon", "canary wharf", "docklands",
    "city of london", "shoreditch", "brixton", "clapham", "peckham",
    "stratford", "whitechapel", "bethnal green",
]

# Crime categories relevant to security sales
SECURITY_CRIME_CATEGORIES = [
    "burglary", "robbery", "violent-crime", "criminal-damage-arson", "shoplifting",
]


# ── Signal Scoring ────────────────────────────────────────────────────────────

def classify_score(score: int) -> str:
    """Classify a numeric score into hot/warm/monitor/low."""
    if score >= 80:
        return "hot"
    elif score >= 50:
        return "warm"
    elif score >= 20:
        return "monitor"
    else:
        return "low"


def recency_bonus(pub_date: str) -> int:
    """Return a recency bonus based on how recently the item was published."""
    if not pub_date:
        return 0
    for fmt in [
        "%a, %d %b %Y %H:%M:%S %Z",
        "%a, %d %b %Y %H:%M:%S %z",
        "%Y-%m-%dT%H:%M:%S%z",
        "%Y-%m-%d",
    ]:
        try:
            dt = datetime.strptime(pub_date, fmt)
            days_old = (datetime.now() - dt.replace(tzinfo=None)).days
            if days_old <= 1:
                return 15
            elif days_old <= 3:
                return 10
            elif days_old <= 7:
                return 5
            elif days_old <= 14:
                return 2
            return 0
        except ValueError:
            continue
    return 0


def source_quality_bonus(source: str) -> int:
    """Return a bonus/penalty based on source quality and geographic relevance."""
    source_lower = source.lower()
    # Block international sources
    for blocked in BLOCKED_SOURCES:
        if blocked in source_lower:
            return -999  # Sentinel: discard this signal
    # Bonus for trusted UK sources
    for trusted in TRUSTED_UK_SOURCES:
        if trusted in source_lower:
            return 10
    return 0


def geographic_bonus(text: str) -> int:
    """Return a geographic relevance bonus for London/UK mentions."""
    text_lower = text.lower()
    bonus = 0
    if "london" in text_lower:
        bonus += 15
    for borough in LONDON_BOROUGHS:
        if borough in text_lower:
            bonus += 10
            break  # Only count once
    return bonus


# ── Job Posting Signals ───────────────────────────────────────────────────────

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

    all_signals = []

    for query in JOB_SEARCH_QUERIES:
        print(f"  📋 Searching Indeed: '{query}'...")
        signals = fetch_indeed_rss(query)
        if signals:
            all_signals.extend(signals)
            print(f"    → {len(signals)} postings found")
        else:
            # Fallback: try Reed RSS
            print(f"    → Indeed unavailable, trying Reed...")
            reed_signals = fetch_reed_rss(query)
            if reed_signals:
                all_signals.extend(reed_signals)
                print(f"    → {len(reed_signals)} Reed postings found")
            else:
                print(f"    → No results from either source")
        time.sleep(1)

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
        "fromage": "14",  # Last 14 days
    }
    url = f"{INDEED_RSS_BASE}?{urlencode(params)}"

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/rss+xml, application/xml, text/xml, */*",
        "Accept-Language": "en-GB,en;q=0.9",
    }

    try:
        req = Request(url, headers=headers)
        with urlopen(req, timeout=15) as response:
            content = response.read()
            signals = parse_rss_jobs(content, "Indeed")
            return signals
    except Exception:
        return []


def fetch_reed_rss(query):
    """Fetch job postings from Reed RSS feed as fallback."""
    # Reed provides a public RSS/search endpoint
    params = {
        "keywords": query,
        "locationName": "London",
        "distanceFromLocation": 10,
    }
    # Reed RSS URL
    url = f"https://www.reed.co.uk/jobs/rss?{urlencode(params)}"

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "application/rss+xml, application/xml, text/xml, */*",
    }

    try:
        req = Request(url, headers=headers)
        with urlopen(req, timeout=15) as response:
            content = response.read()
            return parse_rss_jobs(content, "Reed")
    except Exception:
        return []


def parse_rss_jobs(xml_content, source_name="Indeed"):
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

            # Extract company name from title (usually "Job Title - Company Name")
            company = ""
            if " - " in title:
                parts = title.rsplit(" - ", 1)
                if len(parts) == 2:
                    company = parts[1].strip()

            # Clean HTML from description
            description = re.sub(r"<[^>]+>", " ", description)
            description = re.sub(r"\s+", " ", description).strip()

            if not title:
                continue

            signals.append({
                "source": source_name,
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

    Scoring tiers:
    - Hot (>=80): Senior security role at a non-security company
    - Warm (>=50): Operational security role at a non-security company
    - Monitor (>=20): Security company hiring (competitor intel)
    - Low (<20): Unrelated / insufficient data
    """
    title = (signal.get("title") or "").lower()
    company = (signal.get("company") or "").lower()
    description = (signal.get("description") or "").lower()
    combined = f"{title} {company} {description}"

    # Base score
    score = 30
    signal_type = "job_posting"

    # ── Senior role detection (HOT signals) ──────────────────────────────
    hot_titles = [
        "security manager", "security director", "head of security",
        "chief security", "director of security", "security lead",
    ]
    is_senior = any(kw in title for kw in hot_titles)
    if is_senior:
        score += 40
        signal_type = "senior_security_hire"

    # ── Check if posting company is a security company ────────────────────
    security_company_keywords = [
        "security", "guarding", "securitas", "g4s", "mitie", "ocs",
        "kingdom", "corps", "legion", "shield", "sentinel", "vigil",
        "protection", "patrol", "surveillance", "corps security",
        "noonan", "gsl", "wilson james", "amulet",
    ]
    is_security_company = any(kw in company for kw in security_company_keywords)

    if is_security_company:
        # Security company hiring = competitor intel, not a client signal
        score -= 15
        signal_type = "competitor_hiring"
    else:
        # Non-security company posting for security = strong client signal
        score += 20
        if is_senior:
            signal_type = "high_value_client"
        else:
            signal_type = "potential_client"

    # ── FM companies = they procure security subcontracts ─────────────────
    fm_keywords = ["facilities", "property management", "estate management", "building management"]
    if any(kw in company for kw in fm_keywords):
        score += 10
        if not is_security_company:
            signal_type = "fm_procurement"

    # ── Venue/hospitality = strong security buyer ─────────────────────────
    venue_keywords = ["hotel", "venue", "centre", "mall", "arena", "stadium",
                      "theatre", "hospital", "university", "college", "school"]
    if any(kw in company for kw in venue_keywords):
        score += 15
        if not is_security_company:
            signal_type = "venue_client"

    # ── Geographic relevance ──────────────────────────────────────────────
    score += geographic_bonus(combined)

    # ── Recency ───────────────────────────────────────────────────────────
    score += recency_bonus(signal.get("published", ""))

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

    all_signals = []

    for query in NEWS_SEARCH_QUERIES:
        print(f"  📰 Searching: '{query}'...")
        signals = fetch_google_news_rss(query)
        if signals:
            all_signals.extend(signals)
            print(f"    → {len(signals)} articles found")
        else:
            print(f"    → No results or feed unavailable")
        time.sleep(1)

    # Deduplicate by title
    seen = set()
    unique_signals = []
    for sig in all_signals:
        key = (sig.get("title") or "").lower().strip()
        if key and key not in seen:
            seen.add(key)
            unique_signals.append(sig)

    # Score signals — filter out blocked sources first
    scored = []
    for sig in unique_signals:
        score, signal_type = score_news_signal(sig)
        if score == -999:
            continue  # Blocked source — discard
        sig["score"] = score
        sig["signal_type"] = signal_type
        scored.append(sig)

    scored.sort(key=lambda x: x["score"], reverse=True)

    print(f"\n📊 Total unique news signals: {len(scored)}")
    return scored


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
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "application/rss+xml, application/xml, text/xml, */*",
    }

    try:
        req = Request(url, headers=headers)
        with urlopen(req, timeout=15) as response:
            content = response.read()
            return parse_rss_news(content, query)
    except Exception:
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

            if not title:
                continue

            signals.append({
                "source": f"Google News ({source})",
                "title": title,
                "company": "",
                "description": description[:300],
                "link": link,
                "published": pub_date,
                "signal_category": "news",
                "query": query,
                "_raw_source": source,  # For source quality check
            })
    except ElementTree.ParseError:
        pass

    return signals


def score_news_signal(signal):
    """
    Score a news article for security business relevance.

    Scoring tiers:
    - Hot (>=80): Direct security incident/contract at a known company
    - Warm (>=50): Hotel/venue expansion, FM change, moderate crime
    - Monitor (>=20): General UK/London security industry news
    - Low (<20): Irrelevant / international / tangential
    """
    title = (signal.get("title") or "").lower()
    description = (signal.get("description") or "").lower()
    combined = f"{title} {description}"
    raw_source = signal.get("_raw_source", "")
    full_source = signal.get("source", "")

    # ── Source quality check ──────────────────────────────────────────────
    sq = source_quality_bonus(raw_source or full_source)
    if sq == -999:
        return -999, "blocked"  # Discard signal from blocked source

    # ── Base score ────────────────────────────────────────────────────────
    score = 20
    signal_type = "general_news"

    # ── HOT: Direct security incident at a company/venue ─────────────────
    hot_keywords = [
        "security manager", "security director", "head of security",
        "security contract", "security breach", "break-in",
        "armed robbery", "security tender awarded",
    ]
    if any(kw in combined for kw in hot_keywords):
        score += 55
        signal_type = "hot_security_signal"

    # ── WARM: Incident / expansion / change signals ───────────────────────
    warm_incident_keywords = [
        "robbery", "burglary", "assault", "theft", "shoplifting",
        "security incident", "trespass", "vandalism", "criminal damage",
    ]
    if any(kw in combined for kw in warm_incident_keywords):
        score += 25
        signal_type = "security_incident"

    warm_expansion_keywords = [
        "hotel opening", "new hotel", "venue opening", "new venue",
        "expansion", "new development", "planning permission",
        "fm change", "facilities management change", "corporate relocation",
        "new office", "new building",
    ]
    if any(kw in combined for kw in warm_expansion_keywords):
        score += 20
        signal_type = "new_development"

    # ── Contract/tender = direct opportunity ─────────────────────────────
    contract_keywords = [
        "tender", "contract", "awarded", "procurement",
        "bid", "framework", "outsource",
    ]
    if any(kw in combined for kw in contract_keywords):
        score += 30
        signal_type = "contract_opportunity"

    # ── Competitor issues = poaching opportunity ──────────────────────────
    competitor_keywords = [
        "security company", "security firm", "security provider",
        "complaint", "problem", "failure", "poor service",
    ]
    if sum(1 for kw in competitor_keywords if kw in combined) >= 2:
        score += 20
        signal_type = "competitor_issue"

    # ── Geographic relevance ──────────────────────────────────────────────
    score += geographic_bonus(combined)

    # ── Source quality bonus ──────────────────────────────────────────────
    score += sq

    # ── Recency bonus ─────────────────────────────────────────────────────
    score += recency_bonus(signal.get("published", ""))

    return min(100, max(0, score)), signal_type


# ── Met Police Crime Data ────────────────────────────────────────────────────

def scan_crime_data(latitude=51.5074, longitude=-0.1278, radius_miles=1):
    """
    Fetch crime data from the Police UK API for central London.

    Uses the street-level crimes endpoint for the last 3 months.
    Clusters crimes by category+area+month to create one signal per cluster.

    API: https://data.police.uk/api/crimes-street/all-crime
    Free, no API key required.
    """
    print(f"\n🔍 Scanning Met Police crime data...")
    print(f"   Location: {latitude}, {longitude}")

    signals = []

    # Fetch last 3 months of data
    months_to_fetch = []
    for months_back in range(1, 4):
        dt = datetime.now() - timedelta(days=30 * months_back)
        months_to_fetch.append(dt.strftime("%Y-%m"))

    for month in months_to_fetch:
        print(f"  📅 Fetching crimes for {month}...")
        url = (
            f"https://data.police.uk/api/crimes-street/all-crime"
            f"?lat={latitude}&lng={longitude}&date={month}"
        )
        try:
            req = Request(url, headers={"User-Agent": "SecureFlex-Scanner/1.0"})
            with urlopen(req, timeout=30) as response:
                crimes = json.loads(response.read())

            if not crimes:
                print(f"    → No crimes found for {month}")
                continue

            print(f"    → {len(crimes)} crimes found")

            # Cluster by category
            categories: dict = {}
            for crime in crimes:
                cat = crime.get("category", "other")
                if cat not in categories:
                    categories[cat] = []
                categories[cat].append(crime)

            # Create one signal per relevant category cluster
            for cat, cat_crimes in categories.items():
                if cat not in SECURITY_CRIME_CATEGORIES:
                    continue
                count = len(cat_crimes)
                # Score based on count and category severity
                base = 25
                if cat in ("robbery", "violent-crime"):
                    base = 45
                elif cat in ("burglary", "criminal-damage-arson"):
                    base = 35
                elif cat in ("shoplifting",):
                    base = 30

                # Volume multiplier
                if count >= 20:
                    base += 20
                elif count >= 10:
                    base += 10
                elif count >= 5:
                    base += 5

                score = min(100, base)
                signal_type = f"crime_{cat.replace('-', '_')}"

                signals.append({
                    "source": "Police UK API",
                    "title": f"{cat.replace('-', ' ').title()} cluster — {count} incidents ({month})",
                    "company": "",
                    "description": (
                        f"{count} {cat.replace('-', ' ')} incidents near central London "
                        f"({latitude}, {longitude}) in {month}. "
                        f"High crime area — strong security services opportunity."
                    ),
                    "link": f"https://data.police.uk/api/crimes-street/all-crime?lat={latitude}&lng={longitude}&date={month}",
                    "published": f"{month}-01",
                    "signal_category": "crime",
                    "signal_type": signal_type,
                    "score": score,
                })

        except Exception as e:
            print(f"    ⚠️  Error fetching crime data for {month}: {e}")

        time.sleep(1)

    print(f"\n📊 Total crime signals generated: {len(signals)}")
    return signals


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

def save_signals_report(job_signals, news_signals, crime_signals=None):
    """Save all signals to a comprehensive report."""
    today = datetime.now().strftime("%Y-%m-%d")
    filepath = os.path.join(SIGNALS_DIR, f"intent_signals_{today}.md")

    crime_signals = crime_signals or []

    hot_jobs = [s for s in job_signals if s.get("score", 0) >= 80]
    warm_jobs = [s for s in job_signals if 50 <= s.get("score", 0) < 80]
    other_jobs = [s for s in job_signals if s.get("score", 0) < 50]

    hot_news = [s for s in news_signals if s.get("score", 0) >= 80]
    warm_news = [s for s in news_signals if 50 <= s.get("score", 0) < 80]

    lines = [
        f"# Intent Signal Scan — {today}",
        "",
        f"**Scan Time:** {datetime.now().strftime('%Y-%m-%d %H:%M')}",
        f"**Job Signals:** {len(job_signals)} (🔴 {len(hot_jobs)} hot, 🟡 {len(warm_jobs)} warm)",
        f"**News Signals:** {len(news_signals)} (🔴 {len(hot_news)} hot, 🟡 {len(warm_news)} warm)",
        f"**Crime Signals:** {len(crime_signals)}",
        "",
        "---",
        "",
    ]

    # Job signals
    if job_signals:
        lines.append("## 📋 Job Posting Signals")
        lines.append("")
        lines.append(
            f"**Total:** {len(job_signals)} | "
            f"**Hot:** {len(hot_jobs)} | "
            f"**Warm:** {len(warm_jobs)} | "
            f"**Other:** {len(other_jobs)}"
        )
        lines.append("")

        for category, items in [
            ("🔴 Hot Signals (≥80)", hot_jobs),
            ("🟡 Warm Signals (50–79)", warm_jobs),
            ("🟢 Other", other_jobs[:20]),
        ]:
            if items:
                lines.append(f"### {category}")
                lines.append("")
                for sig in items:
                    lines.append(f"- **[{sig.get('score', 0)}/100]** {sig['title']}")
                    if sig.get("company"):
                        lines.append(f"  - Company: {sig['company']}")
                    lines.append(f"  - Type: {sig.get('signal_type', '')}")
                    lines.append(f"  - Source: {sig['source']}")
                    if sig.get("link"):
                        lines.append(f"  - Link: {sig['link']}")
                    lines.append("")

    # News signals
    if news_signals:
        lines.append("## 📰 News & Event Signals")
        lines.append("")
        lines.append(
            f"**Total:** {len(news_signals)} | "
            f"**Hot:** {len(hot_news)} | "
            f"**Warm:** {len(warm_news)}"
        )
        lines.append("")

        for category, items in [
            ("🔴 Hot Signals (≥80)", hot_news),
            ("🟡 Warm Signals (50–79)", warm_news),
        ]:
            if items:
                lines.append(f"### {category}")
                lines.append("")
                for sig in items:
                    lines.append(f"- **[{sig.get('score', 0)}/100]** {sig['title']}")
                    lines.append(f"  - Type: {sig.get('signal_type', '')}")
                    lines.append(f"  - Source: {sig['source']}")
                    if sig.get("link"):
                        lines.append(f"  - Link: {sig['link']}")
                    if sig.get("description"):
                        lines.append(f"  - Summary: {sig['description'][:150]}")
                    lines.append("")

    # Crime signals
    if crime_signals:
        lines.append("## 🔒 Crime Signals")
        lines.append("")
        for sig in crime_signals:
            lines.append(f"- **[{sig.get('score', 0)}/100]** {sig['title']}")
            if sig.get("description"):
                lines.append(f"  - {sig['description'][:150]}")
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
    crime_signals = []

    if args.source in ["all", "jobs"]:
        job_signals = scan_job_postings()

    if args.source in ["all", "news"]:
        news_signals = scan_news_signals()

    if args.source in ["all", "crime"]:
        crime_signals = scan_crime_data(args.lat, args.lng)

    if args.source == "google-alerts":
        print_google_alerts_setup()
        return

    # Save outputs
    all_signals = job_signals + news_signals + crime_signals

    if all_signals:
        report_path = save_signals_report(job_signals, news_signals, crime_signals)
        print(f"\n📄 Full report saved to: {report_path}")

        if job_signals:
            csv_path = save_signals_csv(job_signals, f"job_signals_{today}.csv")
            print(f"📊 Job signals CSV: {csv_path}")

        if news_signals:
            csv_path = save_signals_csv(news_signals, f"news_signals_{today}.csv")
            print(f"📊 News signals CSV: {csv_path}")

        if crime_signals:
            csv_path = save_signals_csv(crime_signals, f"crime_signals_{today}.csv")
            print(f"📊 Crime signals CSV: {csv_path}")

    # Summary
    print()
    print("━" * 50)
    print("  SCAN SUMMARY")
    print("━" * 50)

    if job_signals:
        hot = len([s for s in job_signals if s.get("score", 0) >= 80])
        warm = len([s for s in job_signals if 50 <= s.get("score", 0) < 80])
        monitor = len([s for s in job_signals if 20 <= s.get("score", 0) < 50])
        print(f"  📋 Job Signals: {len(job_signals)} total ({hot} hot, {warm} warm, {monitor} monitor)")

    if news_signals:
        hot = len([s for s in news_signals if s.get("score", 0) >= 80])
        warm = len([s for s in news_signals if 50 <= s.get("score", 0) < 80])
        monitor = len([s for s in news_signals if 20 <= s.get("score", 0) < 50])
        print(f"  📰 News Signals: {len(news_signals)} total ({hot} hot, {warm} warm, {monitor} monitor)")

    if crime_signals:
        print(f"  🔒 Crime Signals: {len(crime_signals)} clusters")

    if not all_signals:
        print("  ⚠️  No signals detected. This is normal if:")
        print("     - RSS feeds are temporarily unavailable")
        print("     - No matching content in the search period")
        print()
        print("  💡 Recommended fallback actions:")
        print("     1. Set up Google Alerts: --source google-alerts")
        print("     2. Manually check Indeed.co.uk for 'Security Officer London'")
        print("     3. Check Google News for 'security incident London'")

    print()
    print("✅ Scan complete!")


if __name__ == "__main__":
    main()
