"""
SecureFlex AI Module — Anthropic Claude integration for intelligent analysis.

Provides:
  - AI-powered research brief generation for pipeline leads
  - Prospect qualification analysis
  - Tender fit assessment
  - Signal summarisation
"""

import os
from typing import Dict, Any, Optional

try:
    import anthropic
    HAS_ANTHROPIC = True
except ImportError:
    HAS_ANTHROPIC = False


def get_client() -> Optional[Any]:
    """Get an Anthropic client if the API key is configured."""
    if not HAS_ANTHROPIC:
        return None
    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not api_key:
        return None
    return anthropic.Anthropic(api_key=api_key)


def ai_available() -> bool:
    """Check if AI features are available."""
    client = get_client()
    return client is not None


# ── Research Brief Generation ────────────────────────────────────────────────

def generate_ai_brief(lead: Dict[str, Any]) -> str:
    """
    Generate an AI-powered research brief for a pipeline lead using Claude.

    Returns a markdown-formatted research brief with:
    - Company analysis and security opportunity assessment
    - Recommended approach strategy
    - Key talking points for outreach
    - Research gaps and next steps
    """
    client = get_client()
    if not client:
        return _fallback_brief(lead)

    company_name = lead.get("company_name", "Unknown Company")
    company_type = lead.get("company_type", "Unknown")
    region = lead.get("region", "Unknown")
    sic_codes = lead.get("sic_codes", "")
    address = lead.get("address", "")
    status = lead.get("status", "")
    source = lead.get("source", "")
    notes = lead.get("notes", "")
    website_url = lead.get("website_url", "")
    tier = lead.get("tier", "")
    next_action = lead.get("next_action", "")

    prompt = f"""You are a business intelligence analyst for SecureFlex, a London-based security services company 
that provides manned guarding, CCTV monitoring, access control, event security, and corporate security solutions.

Generate a concise, actionable research brief for the following pipeline lead. The brief should help the sales 
team prepare for outreach and understand the security opportunity.

**Lead Information:**
- Company Name: {company_name}
- Company Type: {company_type}
- Region: {region}
- SIC Codes: {sic_codes}
- Registered Address: {address}
- Company Status: {status}
- Lead Source: {source}
- Pipeline Tier: {tier or 'Not set'}
- Website: {website_url}
- Notes: {notes or 'None'}
- Next Action: {next_action or 'None'}

Write the brief in markdown format with these sections:
1. **Executive Summary** — 2-3 sentence overview of the opportunity
2. **Security Needs Assessment** — What security services this type of company typically requires, based on their sector and size
3. **Approach Strategy** — How to approach this prospect (cold call, email, referral, etc.) with specific talking points
4. **Key Questions to Ask** — 5 specific discovery questions for the first conversation
5. **Competitive Landscape** — What to watch for regarding incumbent security providers
6. **Next Steps** — 3-4 concrete actions to take

Keep it practical and specific to the security industry. Be concise — this is a working document, not an essay.
Avoid generic business advice. Focus on security-specific insights."""

    try:
        message = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=1500,
            messages=[{"role": "user", "content": prompt}],
        )
        return message.content[0].text
    except Exception as e:
        print(f"[AI] Brief generation failed: {e}")
        return _fallback_brief(lead)


def generate_tender_analysis(tender: Dict[str, Any]) -> str:
    """Generate an AI analysis of a tender opportunity's fit for SecureFlex."""
    client = get_client()
    if not client:
        return "AI analysis unavailable. Configure ANTHROPIC_API_KEY to enable."

    prompt = f"""You are a bid analyst for SecureFlex, a London-based security services company.
Assess this tender opportunity and provide a brief fit analysis.

**Tender:**
- Title: {tender.get('title', 'Unknown')}
- Buyer: {tender.get('buyer', 'Unknown')}
- Region: {tender.get('region', 'Unknown')}
- Value: {tender.get('value', 'Unknown')}
- Deadline: {tender.get('deadline', 'Unknown')}
- Description: {tender.get('description_snippet', 'No description')}
- Score: {tender.get('score', 'N/A')}/100
- Classification: {tender.get('classification', 'Unknown')}

Provide in 150 words or less:
1. **Fit Assessment** — How well does this match SecureFlex's capabilities?
2. **Key Considerations** — What to watch for in the bid
3. **Recommendation** — Bid / Monitor / Skip, with brief rationale"""

    try:
        message = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=500,
            messages=[{"role": "user", "content": prompt}],
        )
        return message.content[0].text
    except Exception as e:
        return f"AI analysis failed: {e}"


def generate_prospect_analysis(prospect: Dict[str, Any]) -> str:
    """Generate an AI qualification analysis for a prospect."""
    client = get_client()
    if not client:
        return "AI analysis unavailable. Configure ANTHROPIC_API_KEY to enable."

    prompt = f"""You are a business development analyst for SecureFlex, a London-based security services company.
Quickly assess this prospect's potential as a security services client.

**Prospect:**
- Company: {prospect.get('company_name', 'Unknown')}
- Type: {prospect.get('company_type', 'Unknown')}
- Region: {prospect.get('region', 'Unknown')}
- SIC Codes: {prospect.get('sic_codes', '')}
- Status: {prospect.get('status', 'Unknown')}
- Address: {prospect.get('address', '')}

In 100 words or less, provide:
1. **Opportunity** — What security services would they likely need?
2. **Approach** — Best way to initiate contact
3. **Priority** — High / Medium / Low, with brief rationale"""

    try:
        message = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=400,
            messages=[{"role": "user", "content": prompt}],
        )
        return message.content[0].text
    except Exception as e:
        return f"AI analysis failed: {e}"


# ── Fallback Brief (template-based) ─────────────────────────────────────────

def _fallback_brief(lead: Dict[str, Any]) -> str:
    """Generate a template-based brief when AI is unavailable."""
    company = lead.get("company_name", "Unknown")
    company_type = lead.get("company_type", "Unknown")
    region = lead.get("region", "Unknown")

    return f"""# Research Brief: {company}

## Executive Summary
{company} is a {company_type} company based in {region}. Further research is needed to assess their security requirements and current provider arrangements.

## Security Needs Assessment
Based on the {company_type} sector classification, this company likely requires:
- Manned guarding / reception security
- CCTV monitoring and access control
- Out-of-hours security patrols

## Next Steps
1. Research the company website for security-related information
2. Check LinkedIn for facilities/security decision makers
3. Prepare a tailored introduction email
4. Schedule initial discovery call

---
*AI-powered analysis unavailable. Configure ANTHROPIC_API_KEY for enhanced briefs.*
"""
