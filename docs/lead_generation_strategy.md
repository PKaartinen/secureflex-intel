# SecureFlex AI-Powered Lead Generation Strategy

**Document Version:** 1.0  
**Created:** 2026-03-26  
**Purpose:** Comprehensive playbook for using AI agents, databases, and automation to find security contract leads remotely

---

## Executive Summary

Your position — remote with deep data/AI skills while your cofounder works on the ground in London — is not a weakness. It's a **force multiplier**. Most security companies find leads through personal networks, industry events, and cold calling. Almost none run a systematic, data-driven intelligence operation. This document lays out how to build one that gives SecureFlex an unfair advantage.

The core thesis: **detect trigger events and contract opportunities 2-4 weeks before competitors, then hand your cofounder laser-targeted leads with pre-built context so every door-knock and call converts at 3-5x the industry rate.**

---

## Table of Contents

1. [What the Pros Actually Do](#1-what-the-pros-actually-do)
2. [The Data Sources — Your Arsenal](#2-the-data-sources--your-arsenal)
3. [AI Agent Architecture](#3-ai-agent-architecture)
4. [Trigger Event Detection](#4-trigger-event-detection)
5. [UK Public Sector Tender Monitoring](#5-uk-public-sector-tender-monitoring)
6. [Companies House Intelligence](#6-companies-house-intelligence)
7. [LinkedIn & Social Intelligence](#7-linkedin--social-intelligence)
8. [Lead Enrichment Pipeline](#8-lead-enrichment-pipeline)
9. [Competitive Intelligence](#9-competitive-intelligence)
10. [Game-Changing Approaches](#10-game-changing-approaches)
11. [The Remote Operator Playbook](#11-the-remote-operator-playbook)
12. [Tool Stack & Implementation Priority](#12-tool-stack--implementation-priority)
13. [Scripts Built for This System](#13-scripts-built-for-this-system)

---

## 1. What the Pros Actually Do

### How Top Security Companies Find Contracts

**Tier 1 companies (Securitas, G4S, Allied Universal):**
- Dedicated bid teams monitoring all UK procurement portals daily
- Account management teams farming existing client networks for referrals
- Industry conference circuit (IFSEC, Security & Policing, ASIS)
- Formal framework agreements with government and corporates
- £50K-£200K/year spent on business development tools (Salesforce, ZoomInfo, etc.)

**Tier 2 companies (Mitie, OCS, Kingdom):**
- 1-3 dedicated business development managers doing cold outreach
- LinkedIn Sales Navigator for finding procurement/FM decision makers
- Manual monitoring of Contracts Finder and Find a Tender
- Industry association memberships (BSIA, SIA Approved Contractor Scheme)
- Word-of-mouth and referral networks

**Tier 3 / SME companies (where SecureFlex is):**
- Almost entirely referral and personal network based
- Owner/director knocking on doors and cold calling
- Maybe checking Contracts Finder once a week
- Little to no systematic prospecting
- This is where the opportunity is — nobody at this level runs data-driven ops

### What This Means for You

The gap between Tier 1 and Tier 3 lead generation is enormous. By building even a basic version of what Tier 1 companies do with dedicated teams and expensive tools, you leapfrog every other SME security company. And because you're using AI and automation, you can do it cheaper and faster than they do manually.

---

## 2. The Data Sources — Your Arsenal

### Free / Open Data Sources

| Source | What You Get | API Available | Cost |
|--------|-------------|---------------|------|
| **Companies House** | Company details, directors, filing history, SIC codes, accounts | ✅ REST API (free key) | Free |
| **Contracts Finder** | UK public sector contracts > £10K | ✅ REST API | Free |
| **Find a Tender** | UK public sector contracts (higher value, replaced OJEU) | ✅ Search API | Free |
| **Charity Commission** | Charity details, trustees, accounts | ✅ API | Free |
| **Planning Portal / Local Authority Sites** | New developments needing security | ❌ Scrape | Free |
| **Google Maps / Places API** | Business locations, reviews, contact info | ✅ API | Free tier / pay per call |
| **Job Boards (Indeed, Reed, LinkedIn)** | Security job postings = companies with security needs | Scrape / API | Free-ish |
| **Gov.uk** | Regulatory data, licensing (SIA register) | ✅ Some APIs | Free |
| **OpenCorporates** | Global company data, cross-referencing | ✅ API | Free tier |
| **Endole** | UK company financial data, credit scores | ❌ | Free limited / paid |

### Paid Data Sources (Worth the Investment)

| Source | What You Get | Cost | ROI for You |
|--------|-------------|------|-------------|
| **Apollo.io** | B2B contact database, emails, phone numbers, company data | $49-99/mo | HIGH — already using, go deeper |
| **LinkedIn Sales Navigator** | Decision maker search, InMail, lead alerts | £60-80/mo | HIGH — essential for finding FM/procurement contacts |
| **Hunter.io** | Email finder and verification | $49/mo | MEDIUM — verify emails before outreach |
| **Crunchbase** | Company funding, growth signals | $29/mo | LOW — more relevant for tech |
| **BuiltWith** | Technology stack detection | Free tier | LOW — niche use |
| **SIA Register** | Licensed security operatives and companies | Free | HIGH — find every ACS company |
| **BSIA Member Directory** | Industry association members | Free (public) | HIGH — your target universe |
| **Dun & Bradstreet / Experian** | Business credit, procurement data | £200+/mo | MEDIUM — for later stage |

### The Key Insight: Combine Multiple Free Sources

No single source gives you everything. The power is in **fusion**:

```
Companies House (company basics)
  + SIA Register (licensed security companies)  
  + Apollo (contact details + emails)
  + Contracts Finder (active procurement)
  + Job boards (intent signals)
  + Google (reviews, complaints, location data)
  = Complete prospect intelligence profile
```

---

## 3. AI Agent Architecture

### The Intelligence Pipeline

Build a system where AI agents work in sequence, each adding value:

```
┌─────────────────────────────────────────────────────┐
│                  DISCOVERY AGENTS                     │
│                                                       │
│  ┌──────────┐  ┌───────────┐  ┌──────────────┐      │
│  │ Tender   │  │ Companies │  │ Intent       │      │
│  │ Radar    │  │ House     │  │ Signals      │      │
│  │ Agent    │  │ Prospector│  │ Scanner      │      │
│  └────┬─────┘  └─────┬─────┘  └──────┬───────┘      │
│       │              │               │               │
│       └──────────────┼───────────────┘               │
│                      ▼                               │
│             ┌────────────────┐                        │
│             │  RAW LEADS     │                        │
│             │  (data/*.csv)  │                        │
│             └───────┬────────┘                        │
│                     ▼                                │
│  ┌─────────────────────────────────────────┐         │
│  │           ENRICHMENT AGENT              │         │
│  │  - Company details from Companies House │         │
│  │  - Contact details from Apollo/Hunter   │         │
│  │  - Website analysis for pain points     │         │
│  │  - Social media intelligence            │         │
│  │  - Financial health from filings        │         │
│  └──────────────────┬──────────────────────┘         │
│                     ▼                                │
│  ┌─────────────────────────────────────────┐         │
│  │           SCORING AGENT                 │         │
│  │  - Fit score (size, location, type)     │         │
│  │  - Intent score (trigger events)        │         │
│  │  - Timing score (contract expiry, etc.) │         │
│  │  - Accessibility score (have contacts?) │         │
│  └──────────────────┬──────────────────────┘         │
│                     ▼                                │
│  ┌─────────────────────────────────────────┐         │
│  │           RESEARCH AGENT (LLM)          │         │
│  │  - Write personalized outreach angle    │         │
│  │  - Identify specific pain points        │         │
│  │  - Generate call briefing               │         │
│  │  - Suggest approach strategy            │         │
│  └──────────────────┬──────────────────────┘         │
│                     ▼                                │
│             ┌────────────────┐                        │
│             │ PIPELINE MASTER│                        │
│             │ (scored, ready │                        │
│             │  for outreach) │                        │
│             └───────┬────────┘                        │
│                     ▼                                │
│  ┌─────────────────────────────────────────┐         │
│  │     OUTREACH SYSTEM (existing)          │         │
│  │  - Email drafts → Human review → Send   │         │
│  │  - Call sheets → Cofounder executes     │         │
│  │  - Proposals → Human review → Send      │         │
│  └─────────────────────────────────────────┘         │
└─────────────────────────────────────────────────────┘
```

### How to Use LLMs as Research Agents

For each lead, you can use Claude/GPT to:

1. **Analyze their website** → Extract what services they use, who their current security provider is, any complaints or gaps
2. **Analyze their job postings** → "Security Officer needed" = they're either growing or losing staff from their current provider
3. **Analyze their news** → Recent incidents, expansions, complaints about security
4. **Write personalized angles** → "I noticed you're opening a new site in Canary Wharf — our response times in that area are under 45 minutes"
5. **Score fit** → Based on all collected data, how good a prospect is this?

**Implementation approach:**
```python
# Pseudocode for an LLM research agent
def research_prospect(company_name, website_url, collected_data):
    prompt = f"""
    You are a security industry business development analyst.
    
    Research this company and provide:
    1. Their likely current security provider
    2. Pain points we could address
    3. A personalized outreach angle
    4. A fit score 1-10
    
    Company: {company_name}
    Website: {website_url}
    Data collected: {collected_data}
    """
    return llm.complete(prompt)
```

---

## 4. Trigger Event Detection

### What Are Trigger Events?

A trigger event is something that happens to a company that creates a need to change their security provider or add new security services. **This is the single most valuable thing you can detect.**

### The Trigger Events That Matter for Security

| Trigger Event | Where to Detect It | Signal Strength | Speed Advantage |
|--------------|--------------------|----|---|
| **New security tender published** | Contracts Finder, Find a Tender | 🔴 CRITICAL | 1-2 weeks |
| **Security incident at their premises** | Google News, local media | 🔴 CRITICAL | Days |
| **Job posting for security staff** | Indeed, Reed, LinkedIn | 🟡 STRONG | 1-2 weeks |
| **New venue/site opening** | Planning portals, local news, Google | 🟡 STRONG | 2-4 weeks |
| **Company expansion/acquisition** | Companies House, news | 🟡 STRONG | 2-4 weeks |
| **Security provider going into administration** | Companies House, news | 🔴 CRITICAL | Days |
| **Bad Google reviews mentioning security** | Google Places API | 🟡 STRONG | Ongoing |
| **Existing contract expiry** | Public sector contract data | 🟡 STRONG | 1-3 months |
| **Regulatory requirement change** | SIA, Gov.uk | 🟢 MODERATE | Weeks |
| **Management change at prospect** | LinkedIn, Companies House | 🟢 MODERATE | 1-2 weeks |
| **New construction/development approved** | Planning portals | 🟡 STRONG | Months (early!) |

### How to Build Trigger Detection

**Google Alerts (Free, Immediate):**
Set up alerts for:
- `"security contract" London`
- `"security tender" London`
- `"security incident" + venue/mall/office names in London`
- `"looking for security" London`
- Each target company name + "security"
- `"security guard" OR "door supervisor" site:indeed.co.uk London`

**News API (Free tier available):**
```
newsapi.org - 100 requests/day free
- Query: "security contract" OR "security tender" London
- Query: "security incident" London
- Query: each major prospect company name
```

**Indeed/Reed Job Scraping:**
```
Search: "Security Officer" OR "Door Supervisor" OR "Security Guard"
Location: London
Filter: Posted in last 7 days
Signal: Companies posting these roles = companies with active security needs
```

---

## 5. UK Public Sector Tender Monitoring

### Why This Is Gold

UK public sector procurement is legally required to be published. This means:
- Every council, NHS trust, university, government building that needs security must publish tenders above £10K
- Contract values are transparent
- Incumbents and contract dates are often published
- Framework agreements list approved suppliers

### The Portals

1. **Contracts Finder** (https://www.contractsfinder.service.gov.uk)
   - All UK public sector contracts above £10K
   - Free API: `https://www.contractsfinder.service.gov.uk/api/rest/2`
   - Search by keyword, location, value, category
   - **Script built:** [`scripts/tender_radar.py`](../scripts/tender_radar.py)

2. **Find a Tender** (https://www.find-tender.service.gov.uk)
   - Higher-value contracts (replaced EU OJEU for UK)
   - Search API available
   - Security services CPV codes: 79710000, 79713000, 79714000

3. **London Tenders Portal** (https://procontract.due-north.com/Opportunities)
   - Many London boroughs use this for procurement
   - Must check manually or scrape

4. **Constructionline / BuildingConfidence**
   - Construction project database (new builds need security)
   - Paid but valuable for early-stage intelligence

### CPV Codes for Security Services
```
79710000 - Security services
79711000 - Alarm monitoring services  
79713000 - Guard services
79714000 - Surveillance services
79715000 - Patrol services
85312310 - Key-holding services
```

### The Real Power: Incumbent Tracking

When a public sector contract is published, it often includes:
- Current contract value
- Current provider (the incumbent)
- Contract end date
- Option to extend or re-tender

This means you can build a database of:
- Every public sector security contract in London
- When each one expires
- Who holds it now
- When the re-tender will be published

**Then you reach out 3-6 months before expiry** to start building the relationship.

---

## 6. Companies House Intelligence

### Free API, Massive Value

Companies House API gives you:
- Every company registered in the UK (5M+ companies)
- Directors and officers names
- SIC codes (business classification)
- Filing history
- Company status (active, dissolved, in administration)
- Registered address

### How to Use It for Lead Gen

**Find potential clients (companies that NEED security):**
```
SIC codes for industries that buy security:
- 68100: Buying and selling of own real estate (property management)
- 68201: Renting and operating of Housing Association real estate  
- 68209: Other letting and operating of own or leased real estate
- 93110: Operation of sports facilities
- 93290: Other amusement and recreation activities
- 56101: Licensed restaurants
- 56301: Licensed clubs
- 55100: Hotels and similar accommodation
- 86101: Hospital activities
- 85310: General secondary education
- 64110: Central banking (financial services)
```

**Find competing security companies:**
```
SIC codes for security industry:
- 80100: Private security activities
- 80200: Security systems service activities
- 80300: Investigation activities
```

**Monitor competitor health:**
- Check if competitors are filing late (financial trouble?)
- Check for changes in directors (instability?)
- Check for administration/liquidation (grab their clients!)

**Script built:** [`scripts/companies_house_prospector.py`](../scripts/companies_house_prospector.py)

---

## 7. LinkedIn & Social Intelligence

### LinkedIn Sales Navigator Strategy

LinkedIn is the most powerful tool for finding decision makers in security. Here's how to maximize it:

**Search Filters for Finding Buyers:**
```
Title keywords: 
  "Security Manager" OR "Facilities Manager" OR "FM Director" 
  OR "Operations Director" OR "Procurement Manager" 
  OR "Property Manager" OR "Building Manager"
  OR "Head of Security" OR "Chief Security Officer"

Industry: 
  Real Estate, Facilities Management, Property Management,
  Retail, Hospitality, Healthcare, Education, Local Government

Geography: Greater London Area

Company size: 51-5000 employees
```

**Search Filters for Finding Subcontract Partners:**
```
Title keywords:
  "Operations Director" OR "Operations Manager" OR "Business Development"
  OR "Regional Manager" OR "Managing Director"

Industry: Security and Investigations

Geography: London, South East England

Company size: 11-500 employees
```

### LinkedIn Automation (Careful - Respect TOS)

Tools like **Dux-Soup**, **Expandi**, or **Phantombuster** can:
- Auto-view profiles (they get notified)
- Auto-connect with personalized messages
- Auto-message connection sequences
- Export search results to CSV

**WARNING:** LinkedIn automation violates their TOS. Use very conservatively:
- Max 20-30 connection requests per day
- Always personalize the message
- Warm up accounts slowly
- Use a separate account if doing heavy automation

### Better Approach: Manual + AI Hybrid

1. Use Sales Navigator to find 10-15 prospects per day
2. Use AI to research each one and write a personalized connection note
3. Send manually or via a conservative automation tool
4. Export to your pipeline

---

## 8. Lead Enrichment Pipeline

### The Enrichment Waterfall

When you find a raw company name, run it through this waterfall to build a complete profile:

```
Raw company name
  │
  ├─→ Companies House API → Company number, SIC code, directors, status, address
  │
  ├─→ Google Search → Website URL, recent news
  │
  ├─→ Website scrape → Services page, contact page, about page
  │
  ├─→ Apollo.io → Contact emails, phone numbers, job titles
  │     (or Hunter.io for email finding)
  │
  ├─→ LinkedIn → Decision maker profiles, company page followers
  │
  ├─→ Google Maps → Location, reviews, photos
  │
  ├─→ Google News → Recent articles, incidents, expansions
  │
  └─→ Job boards → Current openings (intent signal)
  
  = Complete prospect profile ready for outreach
```

### What a "Research-Ready" Lead Looks Like

```yaml
company_name: "Westfield London (Unibail-Rodamco-Westfield)"
company_type: "Venue"
tier: 1
website: "https://uk.westfield.com/london"
decision_maker: "James Blackwood, Head of Security Operations"
email: "j.blackwood@urw.com"
phone: "+44 20 7XXX XXXX"
region: "London - Shepherd's Bush"
company_size: "1000+"
current_security_provider: "Securitas (based on LinkedIn profiles of guards)"
contract_renewal: "Estimated Q2 2026 based on previous tender cycle"
trigger_events:
  - "Posted 3 security officer positions on Indeed last week"
  - "Recent shoplifting incident reported in Evening Standard"  
  - "New restaurant wing opening Spring 2026"
pain_points:
  - "High guard turnover (frequent job postings)"
  - "Customer complaints about security response times in Google reviews"
personalized_angle: |
  "We noticed you're expanding the dining quarter — our team specializes in 
  retail/hospitality security with a focus on customer experience, not just 
  asset protection. We could run a 30-day pilot for the new wing."
fit_score: 9/10
urgency_score: 8/10
```

**THIS is what changes the game.** When your cofounder walks into Westfield with this intelligence, they're not cold-calling. They're arriving with specific knowledge that demonstrates competence before they've even started.

**Script built:** [`scripts/enrich_leads.py`](../scripts/enrich_leads.py)

---

## 9. Competitive Intelligence

### Track Your Competitors

Build a watchlist of every security company operating in London (there are hundreds). Monitor for:

| What to Watch | Where | Why |
|--------------|-------|-----|
| Financial filings | Companies House | Late filings = cash flow problems = vulnerable clients |
| Director changes | Companies House | Instability = opportunity |
| Administration/liquidation | Companies House, Gazette | Their clients need a new provider NOW |
| Losing contracts | Contracts Finder (award notices) | Client is open to alternatives |
| Bad reviews | Google, Trustpilot, Glassdoor | Unhappy clients, unhappy staff |
| Job postings | Indeed, Reed | Rapid hiring = overstretched, losing staff = problems |
| SIA compliance | SIA register | Non-compliance = vulnerability |

### The "Vulture" Strategy (Ethical Version)

When a competitor is struggling:
1. Detect the signal (late filings, administration, bad reviews)
2. Identify their clients (from case studies, LinkedIn, contract awards)
3. Reach out to those clients proactively with a "business continuity" message
4. Offer a seamless transition

This is standard practice in the industry. The difference is detecting the signal early through automation rather than hearing about it through gossip weeks later.

### Build a Competitor Database

```csv
competitor_id,company_name,companies_house_number,sic_code,status,last_filing_date,directors,estimated_size,known_clients,london_presence,notes
COMP-001,Securitas UK,01234567,80100,Active,2025-09-30,"...",1000+,"HSBC;Westfield;TfL",Strong,Tier 1 target for subcontracting
COMP-002,G4S,02345678,80100,Active,2025-08-31,"...",1000+,"BBC;NHS;Met Police",Strong,Tier 1 target
...
```

---

## 10. Game-Changing Approaches

### 1. The "Security Intelligence Briefing"

Instead of cold outreach saying "we provide security services," send prospects a **custom security intelligence briefing** for their specific area/industry:

```markdown
Subject: Security Risk Briefing: Retail Crime in Shepherd's Bush Q1 2026

Dear [Name],

We've compiled a quarterly security intelligence briefing for businesses 
in the W12 area. Key findings:

- Retail crime in Shepherd's Bush up 23% vs. last quarter (Met Police data)
- 3 break-ins at commercial properties within 500m of your location
- New modus operandi targeting [specific type] businesses
- Recommended countermeasures...

We put these together for businesses in areas we operate. Happy to discuss 
how we're helping other [industry] businesses in the area.
```

**Why this is game-changing:** You're leading with VALUE, not a sales pitch. You're demonstrating competence and local knowledge. The data is all publicly available (Met Police crime data API, ONS data, local news). An AI agent can compile these automatically.

### 2. The "Contract Expiry Predictor"

Public sector contracts have known durations (typically 2-5 years with extension options). By tracking:
- Original contract award date
- Contract duration
- Extension options

You can predict when contracts will be re-tendered and start relationship building 6+ months ahead.

### 3. The "Site Visit Intelligence Pack"

Before your cofounder visits ANY business, generate an automated intelligence pack:

```
┌─────────────────────────────────────────┐
│  SITE VISIT INTELLIGENCE PACK           │
│  Westfield London | 2026-03-26          │
├─────────────────────────────────────────┤
│  COMPANY OVERVIEW                       │
│  - Parent: Unibail-Rodamco-Westfield    │
│  - Revenue: £XX                         │
│  - Employees: 500+ on site              │
│                                         │
│  CURRENT SECURITY                       │
│  - Provider: Securitas (estimated)      │
│  - Guard count: ~40 (LinkedIn analysis) │
│  - Contract value: ~£2M/year (est.)     │
│                                         │
│  TRIGGER EVENTS                         │
│  ⚡ 3 security positions posted 5d ago  │
│  ⚡ Shoplifting incident reported 2w ago│
│  ⚡ New wing opening announced          │
│                                         │
│  DECISION MAKERS                        │
│  👤 James Blackwood - Head of Security  │
│  👤 Sarah Palmer - Centre Director      │
│  👤 Mark Jones - FM Lead               │
│                                         │
│  RECOMMENDED APPROACH                   │
│  "Focus on the new wing opening as an   │
│  entry point. Offer a pilot specifically │
│  for the new dining quarter. Reference   │
│  recent crime data for the area."        │
│                                         │
│  COMPETITOR WEAKNESSES                  │
│  - High guard turnover (frequent posts)  │
│  - Customer complaints about response    │
│  - Generic service, not tailored         │
└─────────────────────────────────────────┘
```

### 4. The "Network Mapping" Approach

Security industry in London is relationship-driven. Map the network:
- Who are the key decision makers at each target company?
- Where did they work before? (LinkedIn career history)
- Who do they know? (Mutual connections)
- What events do they attend? (LinkedIn activity)
- What content do they engage with? (Posts, comments)

Then design approach strategies that leverage warm paths rather than cold outreach.

### 5. The "Data-Driven Door Knock" System

Your cofounder is on the ground. Give them a daily GPS-optimized route:
1. Take the top 20 scored leads in a geographic cluster
2. Generate walking/driving route between them
3. Provide a mobile-friendly intelligence card for each stop
4. Track outcomes in real-time
5. Re-score and re-route based on results

### 6. Automated Reputation Monitoring

Set up monitoring for mentions of:
- Your target prospects + "security problems"
- Your competitors + "poor service" / "losing contract"
- Your industry + "London" + trigger keywords

Tools: Google Alerts (free), Mention.com ($29/mo), Brand24 ($79/mo)

---

## 11. The Remote Operator Playbook

### Your Daily Routine (2-3 hours/day of high-impact work)

**Morning (30 min):**
1. Check tender radar results → flag urgent opportunities
2. Review overnight trigger event alerts
3. Scan LinkedIn for prospect activity

**Midday (60 min):**
4. Run enrichment pipeline on new leads
5. Generate intelligence packs for cofounder's visits
6. Draft personalized outreach emails for review
7. Update pipeline with new intelligence

**Evening (30 min):**
8. Process results from cofounder's field work
9. Update pipeline statuses
10. Generate tomorrow's priorities and route plan

### Division of Labor

| Task | You (Remote) | Cofounder (London) |
|------|-------------|-------------------|
| Finding leads | ✅ Primary | Referrals only |
| Researching prospects | ✅ Primary | On-site observations |
| Writing outreach emails | ✅ Primary | Reviews before sending |
| Making phone calls | Can do some | ✅ Primary |
| In-person meetings | ❌ | ✅ Primary |
| Tender preparation | ✅ Primary | Review & sign |
| Proposal writing | ✅ Primary | Add operational details |
| Pipeline management | ✅ Primary | Updates via mobile |
| Competitive intelligence | ✅ Primary | Industry gossip |
| Contract negotiation | Support with data | ✅ Primary |

---

## 12. Tool Stack & Implementation Priority

### Phase 1: Immediate (This Week) — Free Tools Only

| Tool | Action | Time to Set Up | Impact |
|------|--------|---------------|--------|
| Google Alerts | Set up 20-30 keyword alerts | 30 min | HIGH |
| Contracts Finder | Run tender radar script daily | Built ✅ | HIGH |
| Companies House | Run prospector script | Built ✅ | HIGH |
| LinkedIn (free) | Manual research, 30 min/day | Ongoing | HIGH |
| Indeed/Reed | Manual job board scanning | 15 min/day | MEDIUM |

### Phase 2: Next 2 Weeks — Low-Cost Paid Tools

| Tool | Action | Cost | Impact |
|------|--------|------|--------|
| Apollo.io (upgrade) | Bulk contact enrichment | $49/mo | HIGH |
| LinkedIn Sales Navigator | Systematic decision maker search | £60/mo | HIGH |
| Hunter.io | Email verification before outreach | $49/mo | MEDIUM |

### Phase 3: Next Month — Advanced Automation

| Tool | Action | Cost | Impact |
|------|--------|------|--------|
| Make.com / n8n | Automated workflows connecting all tools | $9-29/mo | HIGH |
| OpenAI/Claude API | LLM-powered research agents | $20-50/mo | HIGH |
| Airtable / Notion | Better CRM than CSV (with API) | $10-20/mo | MEDIUM |
| Custom scripts | Intent signal scanner, enrichment pipeline | Built ✅ | HIGH |

### Phase 4: Scale — Full Intelligence Operation

| Tool | Action | Cost | Impact |
|------|--------|------|--------|
| HubSpot CRM (free tier) | Full CRM with email tracking | Free-$50/mo | HIGH |
| Phantombuster | LinkedIn automation (careful) | $56/mo | MEDIUM |
| Clay.com | Automated enrichment workflows | $149/mo | HIGH |
| Custom dashboard | Real-time pipeline visibility | Dev time | MEDIUM |

---

## 13. Scripts Built for This System

The following scripts have been built to implement this strategy:

### [`scripts/tender_radar.py`](../scripts/tender_radar.py)
Automated monitoring of UK Contracts Finder for security-related tenders in London and surrounding areas. Runs daily, saves results to `research/tenders/`, and optionally adds high-scoring opportunities to the pipeline.

### [`scripts/companies_house_prospector.py`](../scripts/companies_house_prospector.py)
Searches Companies House for companies by SIC code and location. Finds potential clients (FM companies, property managers, venues) and monitors competitor health (filing status, director changes).

### [`scripts/intent_signal_scanner.py`](../scripts/intent_signal_scanner.py)
Scans multiple sources for trigger events: job postings mentioning security roles, Google Alerts for security incidents, news articles about target companies. Outputs scored signals to the pipeline.

### [`scripts/enrich_leads.py`](../scripts/enrich_leads.py)
Takes raw company names from the pipeline and enriches them with Companies House data, website analysis, and contact information. Fills in gaps in the pipeline_master.csv automatically.

---

## Appendix A: Key Search Queries for Manual Research

### Google Searches to Run Weekly
```
"security contract" London tender 2026
"security services" London procurement
"security guard" contract award London
"manned guarding" tender London
"security" "framework agreement" London
site:contractsfinder.service.gov.uk security London
site:linkedin.com "security manager" London hiring
site:indeed.co.uk "security officer" London posted:7
```

### LinkedIn Searches
```
"looking for security provider" London
"security review" London
"changing security" company
"new security" London
"Head of Security" London changed jobs recently
```

### Twitter/X Searches
```
"security incident" London venue OR mall OR office
"need security" London
"security guards" complaint London
```

---

## Appendix B: UK Security Industry Key Facts

- UK private security market: ~£10 billion/year
- ~365,000 SIA licensed individuals
- ~4,000 companies in SIA Approved Contractor Scheme
- Average security guard contract value: £50K-£500K/year for SME clients
- London represents ~25-30% of the UK market
- Key growth areas: retail, construction, events, healthcare
- Typical contract duration: 1-3 years with annual review
- Decision cycle: 2-6 months from first contact to signed contract
- Win rate for cold outreach: 1-3%
- Win rate with warm introduction: 10-20%
- Win rate with trigger event + personalized approach: 15-30%

---

## Appendix C: SIA Approved Contractor Scheme (ACS)

The ACS is the industry quality mark. If SecureFlex has it (or is getting it), this is a major selling point. If competitors don't have it, that's a vulnerability to exploit.

**How to use ACS for lead gen:**
1. Download the ACS register from SIA website
2. Cross-reference against Companies House data
3. Identify non-ACS companies losing contracts to ACS companies
4. Identify ACS companies that are struggling (late filings, bad reviews)
5. Position SecureFlex as an ACS alternative

---

*This document is a living strategy. Update it as you discover new data sources, refine your approach, and learn what works. The key is to start executing immediately with free tools and iterate from there.*
