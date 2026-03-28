"""
SecureFlex AI Module — Anthropic Claude integration for intelligent analysis.

Provides:
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


# ── Tender Fit Analysis ──────────────────────────────────────────────────────

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


# ── Prospect Qualification Analysis ──────────────────────────────────────────

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
