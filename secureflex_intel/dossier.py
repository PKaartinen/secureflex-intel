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

    prompt = f"""You are a senior business intelligence analyst at SecureFlex, a London-based security services company 
that provides manned guarding, CCTV monitoring, access control, event security, mobile patrols, and corporate security solutions.

Your task is to produce a **Sales Intelligence Dossier** — a comprehensive, actionable document that the Head of Sales 
will use to prepare for a phone call with this company. The dossier must consolidate ALL the data provided below into 
a clear, well-structured document that gives a complete picture of the company and the sales opportunity.

**IMPORTANT GUIDELINES:**
- This is a WORKING DOCUMENT for a sales professional, not an academic report
- Be specific and actionable — every section should help the salesperson prepare for the call
- Highlight any red flags (overdue filings, insolvency, competitor status) prominently
- If news articles reveal anything about the company's current situation, financial health, expansion plans, 
  security incidents, or leadership changes — weave these insights throughout the dossier
- If there are gaps in the data, explicitly note what's missing and suggest how to find it
- Include specific talking points and conversation openers based on the available intelligence
- Format phone numbers and emails clearly if available — these are gold for the sales team

Write the dossier in Markdown format with these sections:

# Sales Intelligence Dossier: [Company Name]

## 1. Executive Summary
A 3-4 sentence overview: who they are, why they're a prospect, and the key opportunity. Include a clear 
**Opportunity Rating** (High / Medium / Low) with brief justification.

## 2. Company Profile
Structured overview: legal status, incorporation date, SIC codes explained in plain English, registered address, 
active directors with roles, and any notable corporate structure observations.

## 3. Business Context & Current Situation
What does this company actually DO? Use SIC codes, website info, and news to paint a picture. 
Are they growing, stable, or declining? Any recent news that indicates their current trajectory?

## 4. Security Needs Assessment
Based on their sector, size, location, and any available signals — what security services would they likely need?
Be specific: manned guarding, CCTV, access control, event security, mobile patrols, etc.
If there's evidence of a current security provider, note it.

## 5. News & Market Intelligence
Summarise all relevant news articles and public information. What do these tell us about the company's 
current priorities, challenges, and opportunities? How can SecureFlex position itself in light of this news?

## 6. Key Contacts & Decision Makers
List directors/officers with their roles. Identify who is most likely the decision maker for security services.
Include any contact information found (emails, phones, LinkedIn).

## 7. Conversation Strategy
- **Opening Hook:** A specific, personalised conversation opener based on the intelligence gathered
- **Key Talking Points:** 5 specific points to raise, tied to their actual business situation
- **Discovery Questions:** 5 targeted questions to uncover their security needs and budget
- **Objection Handling:** 2-3 likely objections and how to address them
- **Value Proposition:** How to position SecureFlex's specific services for THIS company

## 8. Risk Factors & Red Flags
Any concerns: overdue filings, insolvency history, competitor status, negative news, etc.
Be honest — the sales team needs to know what they're walking into.

## 9. Recommended Next Steps
Numbered action items: what to do before the call, during the call, and after the call.

## 10. Data Sources & Confidence Level
List all sources used and note the overall confidence level of this dossier (High / Medium / Low) 
based on data completeness.

---

**ALL AVAILABLE DATA:**

{full_context}

**Sources consulted:** {', '.join(sources) if sources else 'Limited internal data only'}

Generate the complete dossier now. Be thorough but practical."""

    try:
        message = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=4000,
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
