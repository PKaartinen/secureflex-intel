#!/usr/bin/env python3
"""
SecureFlex Lead Enrichment Pipeline — Automated Prospect Research

Takes existing leads from pipeline_master.csv and enriches them with data
from multiple sources. Fills in gaps automatically and generates research
briefs for high-priority prospects.

Enrichment Sources:
  1. Companies House API — company details, directors, filing status
  2. Website analysis — extract services, contact info, about page
  3. Social/web search — recent news, reviews, job postings
  4. LLM research agent — AI-powered prospect analysis (optional)

Usage:
    python3 scripts/enrich_leads.py                    # Enrich all leads with gaps
    python3 scripts/enrich_leads.py --lead-id SEC-0001 # Enrich specific lead
    python3 scripts/enrich_leads.py --tier 1           # Enrich only tier 1 leads
    python3 scripts/enrich_leads.py --generate-briefs  # Generate research briefs
    python3 scripts/enrich_leads.py --score            # Re-score all leads

Setup:
    Optional: export COMPANIES_HOUSE_API_KEY="your-key"
    Optional: export OPENAI_API_KEY="your-key"  (for LLM research agent)
"""

import csv
import json
import os
import re
import sys
import time
import argparse
from datetime import datetime, timedelta
from urllib.request import urlopen, Request
from urllib.error import URLError, HTTPError
from urllib.parse import urlencode, quote, urlparse
import base64


# ── Configuration ────────────────────────────────────────────────────────────

from secureflex_intel.config import settings

settings.ensure_dirs()
PIPELINE_PATH = str(settings.pipeline_path)
BRIEFS_DIR = str(settings.briefs_dir)
COMPANIES_HOUSE_BASE = "https://api.company-information.service.gov.uk"

try:
    import yaml
    HAS_YAML = True
except ImportError:
    HAS_YAML = False


def get_api_key(key_name):
    """Get API key from settings (env / .env)."""
    if key_name == "companies_house":
        return settings.companies_house_api_key
    elif key_name == "openai":
        return settings.openai_api_key
    return ""


# ── Companies House Enrichment ───────────────────────────────────────────────

def ch_request(endpoint, params=None):
    """Make Companies House API request."""
    api_key = get_api_key("companies_house")
    if not api_key:
        return None

    url = f"{COMPANIES_HOUSE_BASE}{endpoint}"
    if params:
        url += "?" + urlencode(params)

    auth_string = base64.b64encode(f"{api_key}:".encode()).decode()
    headers = {
        "Authorization": f"Basic {auth_string}",
        "Accept": "application/json",
        "User-Agent": "SecureFlex-Enrichment/1.0",
    }

    try:
        req = Request(url, headers=headers)
        with urlopen(req, timeout=20) as response:
            return json.loads(response.read().decode("utf-8"))
    except HTTPError as e:
        if e.code == 429:
            time.sleep(30)
            return ch_request(endpoint, params)
        return None
    except Exception:
        return None


def enrich_from_companies_house(lead):
    """Enrich a single lead with Companies House data."""
    company_name = lead.get("company_name", "").strip()
    if not company_name:
        return lead, False

    api_key = get_api_key("companies_house")
    if not api_key:
        return lead, False

    # Search for company
    result = ch_request("/search/companies", {
        "q": company_name,
        "items_per_page": 5,
    })

    if not result or not result.get("items"):
        return lead, False

    # Find best match
    best_match = None
    for item in result["items"]:
        item_name = (item.get("title") or item.get("company_name") or "").lower()
        if company_name.lower() in item_name or item_name in company_name.lower():
            best_match = item
            break
    if not best_match:
        best_match = result["items"][0]  # Take first result

    company_number = best_match.get("company_number", "")
    if not company_number:
        return lead, False

    # Get full profile
    profile = ch_request(f"/company/{company_number}")
    if not profile:
        return lead, False

    enriched = False

    # Fill in address if missing
    address = profile.get("registered_office_address", {}) or {}
    if not lead.get("address"):
        parts = [
            address.get("address_line_1", ""),
            address.get("address_line_2", ""),
            address.get("locality", ""),
            address.get("region", ""),
            address.get("postal_code", ""),
        ]
        lead["address"] = ", ".join(p for p in parts if p)
        enriched = True

    # Fill in region if missing or generic
    if not lead.get("region") or lead["region"] in ["Unknown", ""]:
        locality = (address.get("locality") or "").lower()
        region = (address.get("region") or "").lower()
        if "london" in locality or "london" in region:
            lead["region"] = "London"
        elif region:
            lead["region"] = address.get("region", "")
        elif locality:
            lead["region"] = address.get("locality", "")
        enriched = True

    # Get officers (directors)
    officers = ch_request(f"/company/{company_number}/officers", {"items_per_page": 10})
    if officers and officers.get("items"):
        # Find a director to use as primary contact if none set
        if not lead.get("primary_contact_name"):
            for officer in officers["items"]:
                role = (officer.get("officer_role") or "").lower()
                if role in ["director", "managing-director", "chief-executive"]:
                    lead["primary_contact_name"] = officer.get("name", "")
                    lead["primary_contact_role"] = officer.get("officer_role", "").replace("-", " ").title()
                    enriched = True
                    break

    # Add CH data to notes
    sic_codes = profile.get("sic_codes", []) or []
    status = profile.get("company_status", "")
    created = profile.get("date_of_creation", "")
    accounts = profile.get("accounts", {}) or {}
    overdue = accounts.get("overdue", False)

    existing_notes = lead.get("notes", "")
    ch_note = f"CH#{company_number}"
    if sic_codes:
        ch_note += f" SIC:{','.join(sic_codes[:3])}"
    if created:
        ch_note += f" Est:{created}"
    if status and status != "active":
        ch_note += f" STATUS:{status}"
    if overdue:
        ch_note += " ⚠️OVERDUE_FILINGS"

    if "CH#" not in existing_notes:
        lead["notes"] = f"{existing_notes} | {ch_note}" if existing_notes else ch_note
        enriched = True

    # Set company website if Companies House link not already there
    if not lead.get("website_url"):
        lead["website_url"] = f"https://find-and-update.company-information.service.gov.uk/company/{company_number}"
        enriched = True

    return lead, enriched


# ── Website Analysis ─────────────────────────────────────────────────────────

def analyze_website(url):
    """
    Basic website analysis — extract useful information from a company's website.

    Returns a dict of extracted info.
    """
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

    # Extract title
    title_match = re.search(r"<title[^>]*>([^<]+)</title>", html, re.IGNORECASE)
    if title_match:
        info["page_title"] = title_match.group(1).strip()

    # Extract meta description
    desc_match = re.search(
        r'<meta[^>]*name=["\']description["\'][^>]*content=["\'](.*?)["\']',
        html, re.IGNORECASE
    )
    if desc_match:
        info["meta_description"] = desc_match.group(1).strip()

    # Look for phone numbers
    phones = re.findall(r'(?:tel:|phone:|call\s*:?\s*)?(\+?44[\s\-]?\d{2,4}[\s\-]?\d{3,4}[\s\-]?\d{3,4})', html)
    if phones:
        info["phones"] = list(set(phones[:5]))

    # Look for email addresses
    emails = re.findall(r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}', html)
    # Filter out common non-contact emails
    excluded = ["noreply", "no-reply", "support", "info@example", "test@"]
    emails = [e for e in set(emails) if not any(x in e.lower() for x in excluded)]
    if emails:
        info["emails"] = emails[:5]

    # Check for security-related content
    security_keywords = [
        "security", "guarding", "patrol", "cctv", "access control",
        "surveillance", "loss prevention", "door supervisor",
    ]
    text_lower = html.lower()
    security_mentions = sum(1 for kw in security_keywords if kw in text_lower)
    info["security_relevance"] = security_mentions

    # Check if they mention a security provider
    provider_patterns = [
        r"(?:security\s+(?:by|provided\s+by|partner|contractor))\s*:?\s*([A-Z][a-zA-Z\s]+)",
        r"(?:our\s+security\s+partner)\s*:?\s*([A-Z][a-zA-Z\s]+)",
    ]
    for pattern in provider_patterns:
        match = re.search(pattern, html)
        if match:
            info["security_provider"] = match.group(1).strip()
            break

    return info


def enrich_from_website(lead):
    """Enrich a lead with data from their website."""
    url = lead.get("website_url", "").strip()
    if not url:
        return lead, False

    # Skip Companies House links
    if "company-information.service.gov.uk" in url:
        return lead, False

    info = analyze_website(url)
    if not info:
        return lead, False

    enriched = False

    # Add phone if missing
    if not lead.get("primary_contact_phone") and info.get("phones"):
        lead["primary_contact_phone"] = info["phones"][0]
        enriched = True

    # Add email if missing
    if not lead.get("primary_contact_email") and info.get("emails"):
        # Try to find a good contact email
        for email in info["emails"]:
            if any(prefix in email.lower() for prefix in ["info@", "enquir", "contact", "hello"]):
                lead["primary_contact_email"] = email
                enriched = True
                break
        if not enriched and info["emails"]:
            lead["primary_contact_email"] = info["emails"][0]
            enriched = True

    # Add website analysis to notes
    existing_notes = lead.get("notes", "")
    web_notes = []
    if info.get("security_provider"):
        web_notes.append(f"Current security: {info['security_provider']}")
    if info.get("security_relevance", 0) > 3:
        web_notes.append("High security content on website")

    if web_notes and "website analysis" not in existing_notes.lower():
        note = " | Web: " + "; ".join(web_notes)
        lead["notes"] = existing_notes + note
        enriched = True

    return lead, enriched


# ── Lead Scoring ─────────────────────────────────────────────────────────────

def calculate_lead_score(lead):
    """
    Calculate a composite lead score based on all available data.

    Score components:
    - Fit score (0-40): How well they match our ideal client profile
    - Data completeness (0-20): How much we know about them
    - Engagement score (0-20): How far along in the pipeline
    - Timing score (0-20): Urgency and recency signals
    """
    fit_score = 0
    data_score = 0
    engagement_score = 0
    timing_score = 0

    # ── Fit Score (0-40) ──────────────────────────────────────────────────
    # Region
    region = (lead.get("region") or "").lower()
    if "london" in region:
        fit_score += 15
    elif region in ["south east", "surrey", "kent", "essex"]:
        fit_score += 8

    # Tier
    tier = lead.get("tier", "")
    if str(tier) == "1":
        fit_score += 15
    elif str(tier) == "2":
        fit_score += 10
    elif str(tier) == "3":
        fit_score += 5

    # Company type
    company_type = (lead.get("company_type") or "").lower()
    high_value_types = ["prime contractor", "facilities management"]
    medium_value_types = ["venue/events", "local authority"]
    if any(t in company_type for t in high_value_types):
        fit_score += 10
    elif any(t in company_type for t in medium_value_types):
        fit_score += 7

    # ── Data Completeness (0-20) ──────────────────────────────────────────
    fields_to_check = [
        "company_name", "website_url", "primary_contact_name",
        "primary_contact_email", "primary_contact_phone",
        "address", "region", "company_type", "tier",
        "primary_contact_role",
    ]
    filled = sum(1 for f in fields_to_check if lead.get(f, "").strip())
    data_score = int((filled / len(fields_to_check)) * 20)

    # ── Engagement Score (0-20) ───────────────────────────────────────────
    status = (lead.get("status") or "").lower()
    status_scores = {
        "pilot live": 20,
        "pilot discussed": 18,
        "proposal sent": 16,
        "warm": 14,
        "email 3 sent": 10,
        "email 2 sent": 8,
        "email 1 sent": 6,
        "not contacted": 2,
        "closed won": 20,
        "closed lost": 0,
    }
    engagement_score = status_scores.get(status, 2)

    # Call count bonus
    try:
        call_count = int(lead.get("call_count", 0) or 0)
        engagement_score = min(20, engagement_score + call_count * 2)
    except ValueError:
        pass

    # ── Timing Score (0-20) ───────────────────────────────────────────────
    # Check if there's a pending action
    next_due = lead.get("next_action_due_date", "")
    if next_due:
        try:
            due_date = datetime.strptime(next_due, "%Y-%m-%d")
            days_until = (due_date - datetime.now()).days
            if days_until < 0:
                timing_score += 15  # Overdue = urgent
            elif days_until <= 3:
                timing_score += 12
            elif days_until <= 7:
                timing_score += 8
            elif days_until <= 14:
                timing_score += 5
        except ValueError:
            pass

    # Source quality bonus
    source = (lead.get("source") or "").lower()
    if "referral" in source:
        timing_score += 5
    elif "tender" in source:
        timing_score += 5

    total_score = fit_score + data_score + engagement_score + timing_score

    return {
        "total": total_score,
        "fit": fit_score,
        "data_completeness": data_score,
        "engagement": engagement_score,
        "timing": timing_score,
        "max_possible": 100,
    }


# ── Research Brief Generation ────────────────────────────────────────────────

def generate_research_brief(lead, score_info):
    """
    Generate a structured research brief for a high-priority lead.

    This is the "intelligence pack" that makes your cofounder's
    door-knocks 5x more effective.
    """
    company = lead.get("company_name", "Unknown")
    today = datetime.now().strftime("%Y-%m-%d")

    lines = [
        f"# Research Brief: {company}",
        f"",
        f"**Generated:** {today}",
        f"**Lead Score:** {score_info['total']}/100 "
        f"(Fit: {score_info['fit']}/40, Data: {score_info['data_completeness']}/20, "
        f"Engagement: {score_info['engagement']}/20, Timing: {score_info['timing']}/20)",
        f"",
        "---",
        "",
        "## Company Overview",
        "",
        f"- **Company Name:** {lead.get('company_name', 'N/A')}",
        f"- **Type:** {lead.get('company_type', 'N/A')}",
        f"- **Tier:** {lead.get('tier', 'N/A')}",
        f"- **Website:** {lead.get('website_url', 'N/A')}",
        f"- **Region:** {lead.get('region', 'N/A')}",
        f"- **Address:** {lead.get('address', 'N/A')}",
        f"- **Company Size:** {lead.get('company_size', 'N/A')}",
        f"- **Annual Revenue:** {lead.get('annual_revenue', 'N/A')}",
        "",
        "## Primary Contact",
        "",
        f"- **Name:** {lead.get('primary_contact_name', 'N/A')}",
        f"- **Role:** {lead.get('primary_contact_role', 'N/A')}",
        f"- **Email:** {lead.get('primary_contact_email', 'N/A')}",
        f"- **Phone:** {lead.get('primary_contact_phone', 'N/A')}",
        "",
        "## Pipeline Status",
        "",
        f"- **Status:** {lead.get('status', 'N/A')}",
        f"- **Source:** {lead.get('source', 'N/A')}",
        f"- **Date Added:** {lead.get('date_added', 'N/A')}",
        f"- **Last Touch:** {lead.get('last_touch_date', 'N/A')}",
        f"- **Next Action:** {lead.get('next_action', 'N/A')}",
        f"- **Next Action Due:** {lead.get('next_action_due_date', 'N/A')}",
        f"- **Outreach Sequence:** {lead.get('outreach_sequence', 'N/A')}",
        f"- **Emails Sent:** E1: {lead.get('email_1_sent_date', 'N/A')} | E2: {lead.get('email_2_sent_date', 'N/A')} | E3: {lead.get('email_3_sent_date', 'N/A')}",
        f"- **Calls Made:** {lead.get('call_count', 0)}",
        f"- **Proposal Sent:** {lead.get('proposal_sent_date', 'N/A')}",
        "",
        "## Intelligence Notes",
        "",
        f"{lead.get('notes', 'No notes available.')}",
        "",
        "## Research Gaps (TODO)",
        "",
    ]

    # Identify what's missing
    gaps = []
    if not lead.get("primary_contact_name"):
        gaps.append("- [ ] Find decision maker name (check LinkedIn)")
    if not lead.get("primary_contact_email"):
        gaps.append("- [ ] Find contact email (try Hunter.io or Apollo)")
    if not lead.get("primary_contact_phone"):
        gaps.append("- [ ] Find phone number")
    if not lead.get("website_url") or "company-information" in (lead.get("website_url") or ""):
        gaps.append("- [ ] Find actual company website")
    if not lead.get("company_size"):
        gaps.append("- [ ] Estimate company size")
    if not lead.get("annual_revenue"):
        gaps.append("- [ ] Estimate annual revenue")

    if gaps:
        lines.extend(gaps)
    else:
        lines.append("- [x] All key fields populated")

    lines.extend([
        "",
        "## Recommended Approach",
        "",
    ])

    # Generate approach recommendations based on type and status
    company_type = (lead.get("company_type") or "").lower()
    status = (lead.get("status") or "").lower()
    tier = str(lead.get("tier", ""))

    if "prime contractor" in company_type:
        lines.extend([
            "**Strategy: Subcontract Partner Approach**",
            "",
            "This is a prime contractor — position SecureFlex as a reliable subcontract partner:",
            "1. Lead with capacity and reliability messaging",
            "2. Emphasize SIA licensing, ACS status (if applicable)",
            "3. Offer a 30-day pilot for one of their overflow sites",
            "4. Key selling point: faster response times in London vs. national coverage",
            "",
        ])
    elif "facilities management" in company_type:
        lines.extend([
            "**Strategy: FM Subcontract Approach**",
            "",
            "FM companies manage security for their clients — become their security arm:",
            "1. Position as specialist security partner within their TFM offering",
            "2. Emphasize flexibility and rapid deployment",
            "3. Offer competitive rates for long-term framework agreement",
            "4. Key selling point: dedicated London team vs. national spread",
            "",
        ])
    elif "venue" in company_type or "event" in company_type:
        lines.extend([
            "**Strategy: Direct Venue Approach**",
            "",
            "Venues buy security directly — this is a direct client opportunity:",
            "1. Lead with experience in similar venues",
            "2. Emphasize customer-facing skills, not just security",
            "3. Offer a free security assessment / site walk",
            "4. Key selling point: we understand hospitality, not just guarding",
            "",
        ])
    elif "local authority" in company_type:
        lines.extend([
            "**Strategy: Public Sector / Tender Response**",
            "",
            "Local authorities procure through formal tender processes:",
            "1. Check Contracts Finder for live tenders from this authority",
            "2. Register on their supplier portal",
            "3. Build relationship with procurement team ahead of next tender",
            "4. Key selling point: local presence, SIA compliance, social value",
            "",
        ])
    else:
        lines.extend([
            "**Strategy: General Direct Approach**",
            "",
            "1. Research their current security arrangements",
            "2. Identify specific pain points or growth areas",
            "3. Offer a tailored solution for their specific needs",
            "4. Lead with a free security consultation / site assessment",
            "",
        ])

    lines.extend([
        "## Pre-Visit / Pre-Call Checklist",
        "",
        "- [ ] Review their website thoroughly",
        "- [ ] Check their LinkedIn company page",
        "- [ ] Search for recent news about them",
        "- [ ] Check if they have any live tenders",
        "- [ ] Look up the decision maker on LinkedIn",
        "- [ ] Prepare company-specific talking points",
        "- [ ] Have a leave-behind document ready",
        "- [ ] Plan follow-up sequence",
        "",
    ])

    return "\n".join(lines)


# ── Main Execution ───────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="SecureFlex Lead Enrichment — Automated prospect research"
    )
    parser.add_argument(
        "--lead-id", default=None,
        help="Enrich a specific lead by ID (e.g., SEC-0001)"
    )
    parser.add_argument(
        "--tier", default=None,
        help="Only enrich leads of a specific tier (1, 2, or 3)"
    )
    parser.add_argument(
        "--generate-briefs", action="store_true",
        help="Generate research briefs for top leads"
    )
    parser.add_argument(
        "--score", action="store_true",
        help="Re-score all leads and show priority ranking"
    )
    parser.add_argument(
        "--top", type=int, default=10,
        help="Number of top leads to show/generate briefs for (default: 10)"
    )
    parser.add_argument(
        "--skip-web", action="store_true",
        help="Skip website analysis (faster, but less data)"
    )
    args = parser.parse_args()

    print("=" * 60)
    print("  SecureFlex Lead Enrichment Pipeline")
    print("=" * 60)

    if not os.path.exists(PIPELINE_PATH):
        print(f"\n❌ Pipeline not found at: {PIPELINE_PATH}")
        print("   Run scripts/build_pipeline_master.py first.")
        return

    # Read pipeline
    with open(PIPELINE_PATH, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames
        leads = list(reader)

    print(f"\n📊 Pipeline: {len(leads)} total leads")

    # Filter leads
    if args.lead_id:
        leads_to_process = [l for l in leads if l.get("company_id") == args.lead_id]
        if not leads_to_process:
            print(f"❌ Lead {args.lead_id} not found in pipeline.")
            return
    elif args.tier:
        leads_to_process = [l for l in leads if str(l.get("tier", "")) == args.tier]
    else:
        leads_to_process = leads

    print(f"   Processing: {len(leads_to_process)} leads")

    # ── Enrichment Phase ─────────────────────────────────────────────────
    if not args.score:  # Skip enrichment if only scoring
        ch_key = get_api_key("companies_house")
        enriched_count = 0

        print(f"\n{'─' * 50}")
        print("Phase 1: Companies House Enrichment")
        print(f"{'─' * 50}")

        if ch_key:
            for lead in leads_to_process:
                name = lead.get("company_name", "Unknown")
                print(f"\n  🔎 {name}...")

                lead, was_enriched = enrich_from_companies_house(lead)
                if was_enriched:
                    enriched_count += 1
                    print(f"    ✅ Enriched from Companies House")
                else:
                    print(f"    ℹ️  No new data from Companies House")

                time.sleep(1)
        else:
            print("  ⚠️  No Companies House API key. Skipping.")
            print("     Get a free key at: https://developer.company-information.service.gov.uk/")

        if not args.skip_web:
            print(f"\n{'─' * 50}")
            print("Phase 2: Website Analysis")
            print(f"{'─' * 50}")

            for lead in leads_to_process:
                url = lead.get("website_url", "")
                if url and "company-information" not in url:
                    name = lead.get("company_name", "Unknown")
                    print(f"\n  🌐 Analyzing: {name} ({url[:50]}...)")

                    lead, was_enriched = enrich_from_website(lead)
                    if was_enriched:
                        enriched_count += 1
                        print(f"    ✅ Enriched from website")
                    else:
                        print(f"    ℹ️  No new data from website")

                    time.sleep(1)

        # Save enriched pipeline
        if enriched_count > 0:
            # Update last_modified
            for lead in leads_to_process:
                lead["last_modified"] = datetime.now().strftime("%Y-%m-%d")

            with open(PIPELINE_PATH, "w", newline="", encoding="utf-8") as f:
                writer = csv.DictWriter(f, fieldnames=fieldnames)
                writer.writeheader()
                writer.writerows(leads)

            print(f"\n✅ Enriched {enriched_count} leads. Pipeline updated.")
        else:
            print(f"\nℹ️  No new enrichment data found.")

    # ── Scoring Phase ────────────────────────────────────────────────────
    print(f"\n{'─' * 50}")
    print("Lead Scoring & Priority Ranking")
    print(f"{'─' * 50}")

    scored_leads = []
    for lead in leads:
        score_info = calculate_lead_score(lead)
        scored_leads.append((lead, score_info))

    # Sort by total score
    scored_leads.sort(key=lambda x: x[1]["total"], reverse=True)

    # Print top leads
    print(f"\n🏆 Top {args.top} Leads by Score:")
    print()
    print(f"{'Rank':<5} {'Score':<7} {'ID':<10} {'Company':<30} {'Type':<20} {'Status':<15}")
    print("─" * 90)

    for i, (lead, score_info) in enumerate(scored_leads[:args.top], 1):
        company = lead.get("company_name", "Unknown")[:28]
        ctype = lead.get("company_type", "Unknown")[:18]
        status = lead.get("status", "Unknown")[:13]
        lead_id = lead.get("company_id", "N/A")

        score_str = f"{score_info['total']}/100"
        print(f"{i:<5} {score_str:<7} {lead_id:<10} {company:<30} {ctype:<20} {status:<15}")

    # Score distribution
    print(f"\n📊 Score Distribution:")
    hot = len([s for _, s in scored_leads if s["total"] >= 70])
    warm = len([s for _, s in scored_leads if 50 <= s["total"] < 70])
    cool = len([s for _, s in scored_leads if 30 <= s["total"] < 50])
    cold = len([s for _, s in scored_leads if s["total"] < 30])
    print(f"   🔴 Hot (70+):  {hot}")
    print(f"   🟡 Warm (50-69): {warm}")
    print(f"   🟢 Cool (30-49): {cool}")
    print(f"   ⚪ Cold (<30):  {cold}")

    # ── Research Brief Generation ────────────────────────────────────────
    if args.generate_briefs:
        print(f"\n{'─' * 50}")
        print(f"Generating Research Briefs (Top {args.top})")
        print(f"{'─' * 50}")

        os.makedirs(BRIEFS_DIR, exist_ok=True)

        for i, (lead, score_info) in enumerate(scored_leads[:args.top], 1):
            company = lead.get("company_name", "Unknown")
            lead_id = lead.get("company_id", "UNKNOWN")

            brief = generate_research_brief(lead, score_info)

            # Sanitize filename
            safe_name = re.sub(r'[^\w\-]', '_', company.lower())[:40]
            filename = f"brief_{lead_id}_{safe_name}.md"
            filepath = os.path.join(BRIEFS_DIR, filename)

            with open(filepath, "w", encoding="utf-8") as f:
                f.write(brief)

            print(f"  📄 [{i}] {company}: {filepath}")

        print(f"\n✅ Generated {min(args.top, len(scored_leads))} research briefs in {BRIEFS_DIR}/")

    # ── Final Summary ────────────────────────────────────────────────────
    print()
    print("━" * 50)
    print("  ENRICHMENT COMPLETE")
    print("━" * 50)
    print()
    print("💡 Next steps:")
    print("   1. Review top-scored leads and prioritize outreach")
    if not args.generate_briefs:
        print("   2. Generate research briefs: python3 scripts/enrich_leads.py --generate-briefs")
    else:
        print(f"   2. Review research briefs in: {BRIEFS_DIR}/")
    print("   3. Fill research gaps identified in briefs")
    print("   4. Run daily outreach: python3 scripts/daily_outreach.py")
    print("   5. Generate call sheets: python3 scripts/build_call_sheet.py")


if __name__ == "__main__":
    main()
