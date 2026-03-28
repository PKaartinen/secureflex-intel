"""
SecureFlex Sales Intelligence Dossier Generator

Consolidates all available company intelligence from:
  - Internal DB (prospects, signals, tenders, competitors, pipeline)
  - Live Google News RSS (company-specific news search)
  - Companies House API (officers, filing history, accounts)
  - Website analysis (contact info, security relevance)

Then uses Anthropic Claude to synthesise everything into a comprehensive,
sales-ready dossier document for the head of sales.
"""

import os
import re
import json
import time
import base64
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional
from urllib.request import urlopen, Request
from urllib.error import URLError, HTTPError
from urllib.parse import urlencode, quote
from xml.etree import ElementTree


# ── Live Data Fetchers ────────────────────────────────────────────────────────

GOOGLE_NEWS_RSS = "https://news.google.com/rss/search"
COMPANIES_HOUSE_BASE = "https://api.company-information.service.gov.uk"


def fetch_company_news(company_name: str, max_articles: int = 10) -> List[Dict[str, str]]:
    """
    Fetch recent news articles about a company from Google News RSS.
    Returns a list of article dicts with title, source, published, description, link.
    """
    articles = []
    # Build search queries — company name + security-related variants
    queries = [
        f'"{company_name}"',
        f'"{company_name}" security',
        f'"{company_name}" London',
    ]

    for query in queries:
        try:
            params = {
                "q": query,
                "hl": "en-GB",
                "gl": "GB",
                "ceid": "GB:en",
            }
            url = f"{GOOGLE_NEWS_RSS}?{urlencode(params)}"
            headers = {
                "User-Agent": "Mozilla/5.0 (compatible; SecureFlex-Research/1.0)",
                "Accept": "application/rss+xml, application/xml, text/xml",
            }
            req = Request(url, headers=headers)
            with urlopen(req, timeout=15) as response:
                content = response.read()
                root = ElementTree.fromstring(content)
                channel = root.find("channel")
                if channel is None:
                    continue
                for item in channel.findall("item")[:5]:
                    title = (item.findtext("title") or "").strip()
                    link = (item.findtext("link") or "").strip()
                    description = (item.findtext("description") or "").strip()
                    pub_date = (item.findtext("pubDate") or "").strip()
                    source_elem = item.find("source")
                    source = source_elem.text if source_elem is not None else ""
                    # Clean HTML from description
                    description = re.sub(r"<[^>]+>", " ", description)
                    description = re.sub(r"\s+", " ", description).strip()
                    articles.append({
                        "title": title,
                        "source": source,
                        "published": pub_date,
                        "description": description[:500],
                        "link": link,
                    })
        except Exception:
            continue
        time.sleep(1)  # Rate limit

    # Deduplicate by title
    seen = set()
    unique = []
    for a in articles:
        key = a["title"].lower()[:60]
        if key not in seen:
            seen.add(key)
            unique.append(a)

    return unique[:max_articles]


def fetch_companies_house_profile(company_number: str) -> Optional[Dict[str, Any]]:
    """Fetch full company profile from Companies House API."""
    api_key = os.environ.get("COMPANIES_HOUSE_API_KEY", "")
    if not api_key or not company_number:
        return None

    auth_string = base64.b64encode(f"{api_key}:".encode()).decode()
    headers = {
        "Authorization": f"Basic {auth_string}",
        "Accept": "application/json",
        "User-Agent": "SecureFlex-Dossier/1.0",
    }

    profile = {}
    try:
        # Company profile
        req = Request(f"{COMPANIES_HOUSE_BASE}/company/{company_number}", headers=headers)
        with urlopen(req, timeout=20) as response:
            profile["company"] = json.loads(response.read().decode("utf-8"))
    except Exception:
        return None

    time.sleep(0.5)

    try:
        # Officers
        req = Request(
            f"{COMPANIES_HOUSE_BASE}/company/{company_number}/officers?items_per_page=15",
            headers=headers,
        )
        with urlopen(req, timeout=20) as response:
            data = json.loads(response.read().decode("utf-8"))
            profile["officers"] = data.get("items", [])
    except Exception:
        profile["officers"] = []

    time.sleep(0.5)

    try:
        # Filing history (recent)
        req = Request(
            f"{COMPANIES_HOUSE_BASE}/company/{company_number}/filing-history?items_per_page=10",
            headers=headers,
        )
        with urlopen(req, timeout=20) as response:
            data = json.loads(response.read().decode("utf-8"))
            profile["filings"] = data.get("items", [])
    except Exception:
        profile["filings"] = []

    return profile


def analyze_website_basic(url: str) -> Dict[str, Any]:
    """Basic website analysis — extract useful information."""
    if not url or "company-information.service.gov.uk" in url:
        return {}

    headers = {
        "User-Agent": "Mozilla/5.0 (compatible; SecureFlex-Research/1.0)",
        "Accept": "text/html",
    }

    try:
        req = Request(url, headers=headers)
        with urlopen(req, timeout=15) as response:
            html = response.read().decode("utf-8", errors="ignore")
    except Exception:
        return {}

    info = {}

    # Title
    title_match = re.search(r"<title[^>]*>([^<]+)</title>", html, re.IGNORECASE)
    if title_match:
        info["page_title"] = title_match.group(1).strip()

    # Meta description
    desc_match = re.search(
        r'<meta[^>]*name=["\']description["\'][^>]*content=["\'](.*?)["\']',
        html, re.IGNORECASE,
    )
    if desc_match:
        info["meta_description"] = desc_match.group(1).strip()

    # Phone numbers
    phones = re.findall(
        r'(?:tel:|phone:|call\s*:?\s*)?(\+?44[\s\-]?\d{2,4}[\s\-]?\d{3,4}[\s\-]?\d{3,4})',
        html,
    )
    if phones:
        info["phones"] = list(set(phones[:5]))

    # Emails
    emails = re.findall(r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}', html)
    excluded = ["noreply", "no-reply", "example", "test@", "wixpress", "sentry"]
    emails = [e for e in set(emails) if not any(x in e.lower() for x in excluded)]
    if emails:
        info["emails"] = emails[:5]

    # Security relevance
    security_keywords = [
        "security", "guarding", "patrol", "cctv", "access control",
        "surveillance", "loss prevention", "door supervisor", "manned guarding",
    ]
    text_lower = html.lower()
    info["security_mentions"] = sum(1 for kw in security_keywords if kw in text_lower)

    # Check for security provider mentions
    provider_patterns = [
        r"(?:security\s+(?:by|provided\s+by|partner|contractor))\s*:?\s*([A-Z][a-zA-Z\s&]+)",
        r"(?:our\s+security\s+partner)\s*:?\s*([A-Z][a-zA-Z\s&]+)",
    ]
    for pattern in provider_patterns:
        match = re.search(pattern, html)
        if match:
            info["security_provider"] = match.group(1).strip()
            break

    # Social media links
    social_patterns = {
        "linkedin": r'href=["\']([^"\']*linkedin\.com[^"\']*)["\']',
        "twitter": r'href=["\']([^"\']*(?:twitter\.com|x\.com)[^"\']*)["\']',
    }
    for platform, pattern in social_patterns.items():
        match = re.search(pattern, html, re.IGNORECASE)
        if match:
            info[f"{platform}_url"] = match.group(1)

    return info


# ── Internal DB Data Aggregation ──────────────────────────────────────────────

def aggregate_company_data(company_name: str, company_number: str = "") -> Dict[str, Any]:
    """
    Pull all available internal data about a company from the database.
    Searches across prospects, signals, tenders, competitors, and pipeline tables.
    """
    data = {
        "prospect": None,
        "pipeline_lead": None,
        "competitor_match": None,
        "related_signals": [],
        "related_tenders": [],
    }

    try:
        from secureflex_intel.db import db_available, get_engine, \
            prospects_table, signals_table, tenders_table, competitors_table, pipeline_table
        from sqlalchemy import select, or_, func

        if not db_available():
            return data

        engine = get_engine()
        name_lower = company_name.lower().strip()

        with engine.connect() as conn:
            # 1. Prospect record
            if company_number:
                stmt = select(prospects_table).where(
                    prospects_table.c.company_number == company_number
                )
                result = conn.execute(stmt).first()
                if result:
                    data["prospect"] = dict(result._mapping)
            if not data["prospect"] and company_name:
                stmt = select(prospects_table).where(
                    func.lower(prospects_table.c.company_name) == name_lower
                )
                result = conn.execute(stmt).first()
                if result:
                    data["prospect"] = dict(result._mapping)

            # 2. Pipeline lead
            if company_number:
                stmt = select(pipeline_table).where(
                    pipeline_table.c.company_number == company_number
                )
                result = conn.execute(stmt).first()
                if result:
                    data["pipeline_lead"] = dict(result._mapping)
            if not data["pipeline_lead"] and company_name:
                stmt = select(pipeline_table).where(
                    func.lower(pipeline_table.c.company_name) == name_lower
                )
                result = conn.execute(stmt).first()
                if result:
                    data["pipeline_lead"] = dict(result._mapping)

            # 3. Competitor match
            if company_number:
                stmt = select(competitors_table).where(
                    competitors_table.c.company_number == company_number
                )
                result = conn.execute(stmt).first()
                if result:
                    data["competitor_match"] = dict(result._mapping)

            # 4. Related signals — search by company name in title/company/description
            if company_name:
                # Use ILIKE for partial matching
                name_pattern = f"%{name_lower}%"
                stmt = select(signals_table).where(
                    or_(
                        func.lower(signals_table.c.company).like(name_pattern),
                        func.lower(signals_table.c.title).like(name_pattern),
                    )
                ).order_by(signals_table.c.scanned_at.desc()).limit(20)
                result = conn.execute(stmt)
                data["related_signals"] = [dict(r._mapping) for r in result]

            # 5. Related tenders — search by buyer name
            if company_name:
                name_pattern = f"%{name_lower}%"
                stmt = select(tenders_table).where(
                    func.lower(tenders_table.c.buyer).like(name_pattern)
                ).order_by(tenders_table.c.score.desc()).limit(10)
                result = conn.execute(stmt)
                data["related_tenders"] = [dict(r._mapping) for r in result]

    except Exception as e:
        print(f"[Dossier] DB aggregation error: {e}")

    # Convert datetimes
    def _clean(obj):
        if isinstance(obj, dict):
            return {k: _clean(v) for k, v in obj.items()}
        if isinstance(obj, list):
            return [_clean(i) for i in obj]
        if isinstance(obj, datetime):
            return obj.isoformat()
        return obj

    return _clean(data)


# ── AI Dossier Generation ─────────────────────────────────────────────────────

def generate_dossier(
    company_name: str,
    company_number: str = "",
    company_type: str = "",
    region: str = "",
    sic_codes: str = "",
    address: str = "",
    website_url: str = "",
) -> Dict[str, Any]:
    """
    Generate a comprehensive Sales Intelligence Dossier for a company.

    1. Aggregates all internal DB data
    2. Fetches live news from Google News RSS
    3. Fetches Companies House profile (officers, filings)
    4. Optionally analyses company website
    5. Sends everything to Claude for synthesis into a sales-ready document

    Returns:
        {
            "company_name": str,
            "generated_at": str,
            "dossier_markdown": str,
            "sources_used": list,
            "data_summary": dict,
        }
    """
    sources_used = []
    all_context = {}

    # 1. Internal DB data
    print(f"[Dossier] Aggregating internal data for {company_name}...")
    db_data = aggregate_company_data(company_name, company_number)
    all_context["internal"] = db_data
    if db_data["prospect"]:
        sources_used.append("SecureFlex Prospects Database")
        # Use prospect data to fill in missing fields
        p = db_data["prospect"]
        if not company_number:
            company_number = p.get("company_number", "")
        if not company_type:
            company_type = p.get("company_type", "")
        if not region:
            region = p.get("region", "")
        if not sic_codes:
            sic_codes = p.get("sic_codes", "")
        if not address:
            address = p.get("address", "")
        if not website_url:
            website_url = p.get("website_url", "")
    if db_data["pipeline_lead"]:
        sources_used.append("SecureFlex Pipeline")
    if db_data["related_signals"]:
        sources_used.append(f"SecureFlex Signal Feed ({len(db_data['related_signals'])} signals)")
    if db_data["related_tenders"]:
        sources_used.append(f"SecureFlex Tender Radar ({len(db_data['related_tenders'])} tenders)")
    if db_data["competitor_match"]:
        sources_used.append("SecureFlex Competitor Watch (company is a known competitor)")

    # 2. Live Google News
    print(f"[Dossier] Fetching live news for {company_name}...")
    news_articles = fetch_company_news(company_name)
    all_context["news"] = news_articles
    if news_articles:
        sources_used.append(f"Google News ({len(news_articles)} articles)")

    # 3. Companies House profile
    if company_number:
        print(f"[Dossier] Fetching Companies House profile for {company_number}...")
        ch_profile = fetch_companies_house_profile(company_number)
        if ch_profile:
            all_context["companies_house"] = ch_profile
            sources_used.append("Companies House (profile, officers, filings)")
    else:
        ch_profile = None

    # 4. Website analysis
    if website_url and "company-information.service.gov.uk" not in website_url:
        print(f"[Dossier] Analysing website {website_url}...")
        website_info = analyze_website_basic(website_url)
        if website_info:
            all_context["website"] = website_info
            sources_used.append(f"Website Analysis ({website_url})")

    # 5. Generate AI dossier
    print(f"[Dossier] Generating AI dossier with Claude...")
    dossier_md = _generate_ai_dossier(
        company_name=company_name,
        company_number=company_number,
        company_type=company_type,
        region=region,
        sic_codes=sic_codes,
        address=address,
        website_url=website_url,
        context=all_context,
        sources=sources_used,
    )

    return {
        "company_name": company_name,
        "company_number": company_number,
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "dossier_markdown": dossier_md,
        "sources_used": sources_used,
        "data_summary": {
            "has_prospect_record": db_data["prospect"] is not None,
            "has_pipeline_lead": db_data["pipeline_lead"] is not None,
            "is_known_competitor": db_data["competitor_match"] is not None,
            "signal_count": len(db_data["related_signals"]),
            "tender_count": len(db_data["related_tenders"]),
            "news_article_count": len(news_articles),
            "has_ch_profile": ch_profile is not None,
            "has_website_analysis": "website" in all_context,
        },
    }


def _generate_ai_dossier(
    company_name: str,
    company_number: str,
    company_type: str,
    region: str,
    sic_codes: str,
    address: str,
    website_url: str,
    context: Dict[str, Any],
    sources: List[str],
) -> str:
    """Use Anthropic Claude to generate the dossier from all collected data."""
    try:
        from secureflex_intel.ai import get_client
        client = get_client()
    except Exception:
        client = None

    if not client:
        return _fallback_dossier(company_name, company_number, company_type, region, context, sources)

    # Build the context document for Claude
    context_parts = []

    # Company basics
    context_parts.append(f"""## Company Overview
- **Name:** {company_name}
- **Companies House Number:** {company_number or 'Unknown'}
- **Type:** {company_type or 'Unknown'}
- **Region:** {region or 'Unknown'}
- **SIC Codes:** {sic_codes or 'Unknown'}
- **Registered Address:** {address or 'Unknown'}
- **Website:** {website_url or 'Unknown'}""")

    # Companies House profile
    ch = context.get("companies_house", {})
    if ch:
        company_data = ch.get("company", {})
        officers = ch.get("officers", [])
        filings = ch.get("filings", [])

        accounts = company_data.get("accounts", {}) or {}
        confirmation = company_data.get("confirmation_statement", {}) or {}

        context_parts.append(f"""## Companies House Data
- **Status:** {company_data.get('company_status', 'Unknown')}
- **Type:** {company_data.get('type', 'Unknown')}
- **Date of Creation:** {company_data.get('date_of_creation', 'Unknown')}
- **Last Accounts Made Up To:** {accounts.get('last_accounts', {}).get('made_up_to', 'Unknown')}
- **Accounts Overdue:** {accounts.get('overdue', False)}
- **Next Accounts Due:** {accounts.get('next_due', 'Unknown')}
- **Confirmation Statement Overdue:** {confirmation.get('overdue', False)}
- **Has Charges:** {company_data.get('has_charges', False)}
- **Has Insolvency History:** {company_data.get('has_insolvency_history', False)}""")

        if officers:
            officer_lines = []
            for o in officers[:10]:
                name = o.get("name", "Unknown")
                role = o.get("officer_role", "Unknown").replace("-", " ").title()
                appointed = o.get("appointed_on", "Unknown")
                resigned = o.get("resigned_on", "")
                status = " (RESIGNED)" if resigned else " (ACTIVE)"
                officer_lines.append(f"  - **{name}** — {role}, appointed {appointed}{status}")
            context_parts.append("## Officers & Directors\n" + "\n".join(officer_lines))

        if filings:
            filing_lines = []
            for f in filings[:8]:
                desc = f.get("description", "Unknown")
                date = f.get("date", "Unknown")
                category = f.get("category", "")
                filing_lines.append(f"  - {date}: {desc} ({category})")
            context_parts.append("## Recent Filing History\n" + "\n".join(filing_lines))

    # Internal signals
    signals = context.get("internal", {}).get("related_signals", [])
    if signals:
        signal_lines = []
        for s in signals[:10]:
            title = s.get("title", "")
            source = s.get("source", "")
            published = s.get("published", "")
            score = s.get("score", 0)
            sig_type = s.get("signal_type", "")
            signal_lines.append(f"  - [{sig_type}] {title} (Source: {source}, Published: {published}, Score: {score})")
        context_parts.append("## SecureFlex Internal Signals\n" + "\n".join(signal_lines))

    # Internal tenders
    tenders = context.get("internal", {}).get("related_tenders", [])
    if tenders:
        tender_lines = []
        for t in tenders[:5]:
            title = t.get("title", "")
            value = t.get("value", "")
            deadline = t.get("deadline", "")
            score = t.get("score", 0)
            tender_lines.append(f"  - {title} (Value: {value}, Deadline: {deadline}, Score: {score})")
        context_parts.append("## Related Tenders\n" + "\n".join(tender_lines))

    # Pipeline lead info
    lead = context.get("internal", {}).get("pipeline_lead")
    if lead:
        context_parts.append(f"""## Pipeline Status
- **Status:** {lead.get('status', 'Unknown')}
- **Tier:** {lead.get('tier', 'Unknown')}
- **Source:** {lead.get('source', 'Unknown')}
- **Notes:** {lead.get('notes', 'None')}
- **Next Action:** {lead.get('next_action', 'None')}
- **Next Action Date:** {lead.get('next_action_date', 'None')}""")

    # Competitor flag
    comp = context.get("internal", {}).get("competitor_match")
    if comp:
        context_parts.append(f"""## ⚠️ Competitor Alert
This company appears in our competitor database. They are a known security services competitor.
- **SIC Codes:** {comp.get('sic_codes', '')}
- **Status:** {comp.get('status', '')}""")

    # News articles
    news = context.get("news", [])
    if news:
        news_lines = []
        for n in news:
            title = n.get("title", "")
            source = n.get("source", "")
            published = n.get("published", "")
            description = n.get("description", "")
            link = n.get("link", "")
            news_lines.append(f"  - **{title}** ({source}, {published})\n    {description}\n    Link: {link}")
        context_parts.append("## Recent News & Public Information\n" + "\n".join(news_lines))

    # Website analysis
    web = context.get("website", {})
    if web:
        web_parts = []
        if web.get("page_title"):
            web_parts.append(f"- **Page Title:** {web['page_title']}")
        if web.get("meta_description"):
            web_parts.append(f"- **Description:** {web['meta_description']}")
        if web.get("phones"):
            web_parts.append(f"- **Phone Numbers:** {', '.join(web['phones'])}")
        if web.get("emails"):
            web_parts.append(f"- **Email Addresses:** {', '.join(web['emails'])}")
        if web.get("security_provider"):
            web_parts.append(f"- **Current Security Provider:** {web['security_provider']}")
        if web.get("security_mentions"):
            web_parts.append(f"- **Security Keyword Mentions on Site:** {web['security_mentions']}")
        if web.get("linkedin_url"):
            web_parts.append(f"- **LinkedIn:** {web['linkedin_url']}")
        if web_parts:
            context_parts.append("## Website Analysis\n" + "\n".join(web_parts))

    full_context = "\n\n".join(context_parts)

    prompt = f"""You are a senior sales intelligence analyst at SecureFlex (London-based security services: manned guarding, CCTV, access control, event security, mobile patrols, corporate security).

Produce a **Sales Intelligence Dossier** — a dense, scannable reference document the Head of Sales will use to prepare for a phone call with this company.

**FORMAT RULES — STRICTLY FOLLOW:**
- Maximum information density. NO filler prose, NO generic business advice, NO padding.
- Use **bullet points, tables, and short labelled lines** throughout — never multi-sentence paragraphs.
- Every line must contain a concrete fact, insight, or actionable item. Delete anything a salesperson would skip.
- If data is unavailable for a field, write "Unknown" on one line and move on — do NOT speculate or pad.
- Keep the TOTAL output under 1500 words. Brevity is mandatory.
- Use bold labels (e.g. **Status:** Active) for scannable key-value pairs.
- Use markdown tables where comparing items (officers, news, services).

Write the dossier in this exact structure:

# [Company Name]
**Opportunity:** High / Medium / Low | **Sector:** [type] | **Region:** [region] | **CH#:** [number]

> One-line summary: who they are and why they matter to SecureFlex.

## Company Profile
Use a compact key-value list:
- **Status / Incorporated / SIC / Address / Accounts Due / Charges / Insolvency**
- Flag anything overdue or concerning with a warning marker.

## Directors & Key Contacts
Markdown table: | Name | Role | Appointed | Status | Contact |
Identify the likely security decision-maker with a note. Include any emails/phones/LinkedIn found.

## Business Situation
3-5 bullet points maximum. What do they do, how are they doing, any growth/decline signals from news or filings. No prose.

## News & Intelligence
Markdown table: | Date | Headline | Source | Relevance |
One row per article. Add a 1-2 line "Key takeaway" row below the table summarising what the news means for SecureFlex's approach.

## Security Needs
Bullet list of specific services they likely need (manned guarding, CCTV, access control, etc.) with a one-line rationale per item. Note any evidence of a current security provider.

## Call Strategy
- **Opening hook:** One specific, personalised sentence to open the call.
- **3 talking points:** Tied to their actual situation (news, sector, location).
- **3 discovery questions:** Targeted to uncover needs and budget.
- **Likely objection + response:** One most probable objection and how to handle it.

## Risk Factors
Bullet list only. Overdue filings, insolvency, competitor status, negative news, payment concerns. If none, write "No red flags identified."

## Next Steps
3 numbered actions: before call, during call, after call. One line each.

## Sources & Confidence
- Sources: [comma-separated list]
- Confidence: High / Medium / Low — one-line justification.

---

**ALL AVAILABLE DATA:**

{full_context}

**Sources consulted:** {', '.join(sources) if sources else 'Limited internal data only'}

Generate the dossier now. Be ruthlessly concise — every word must earn its place."""

    try:
        message = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=2500,
            messages=[{"role": "user", "content": prompt}],
        )
        return message.content[0].text
    except Exception as e:
        print(f"[Dossier] AI generation failed: {e}")
        return _fallback_dossier(company_name, company_number, company_type, region, context, sources)


def _fallback_dossier(
    company_name: str,
    company_number: str,
    company_type: str,
    region: str,
    context: Dict[str, Any],
    sources: List[str],
) -> str:
    """Template-based fallback when AI is unavailable."""
    news = context.get("news", [])
    news_section = ""
    if news:
        news_lines = "\n".join(
            f"- **{n['title']}** ({n['source']}, {n['published']})" for n in news[:5]
        )
        news_section = f"""## News & Public Information

{news_lines}
"""

    ch = context.get("companies_house", {})
    officers_section = ""
    if ch and ch.get("officers"):
        officer_lines = "\n".join(
            f"- {o.get('name', 'Unknown')} — {o.get('officer_role', '').replace('-', ' ').title()}"
            for o in ch["officers"][:5]
            if not o.get("resigned_on")
        )
        officers_section = f"""## Key Contacts

{officer_lines}
"""

    return f"""# Sales Intelligence Dossier: {company_name}

## Executive Summary

{company_name} is a {company_type or 'company'} based in {region or 'the UK'} (CH#{company_number or 'Unknown'}). 
Further AI-powered analysis is unavailable — configure ANTHROPIC_API_KEY for comprehensive dossiers.

## Company Profile

- **Company Number:** {company_number or 'Unknown'}
- **Type:** {company_type or 'Unknown'}
- **Region:** {region or 'Unknown'}

{officers_section}

{news_section}

## Recommended Next Steps

1. Research the company website for security-related information
2. Check LinkedIn for facilities/security decision makers
3. Prepare a tailored introduction email
4. Schedule initial discovery call

## Data Sources

{chr(10).join(f'- {s}' for s in sources) if sources else '- Limited data available'}

---
*AI-powered dossier generation unavailable. Configure ANTHROPIC_API_KEY for comprehensive analysis.*
"""
