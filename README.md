# SecureFlex Intelligence Platform

**Automated lead generation and market intelligence for security companies.**

Self-contained Python package that scans UK government tenders, Companies House,
news feeds, and crime data to find security contract opportunities and potential
clients in London. Designed to be deployed on a server with a dashboard.

## Quick Start

```bash
# 1. Navigate to the package
cd secureflex-intel

# 2. Add your API keys to .env
cp .env.example .env
# Edit .env with your Companies House API key

# 3. Check everything works
python3 -m secureflex_intel status

# 4. Run your first scan
python3 -m secureflex_intel tenders          # Find open UK security tenders
python3 -m secureflex_intel prospects        # Find 400+ potential clients
python3 -m secureflex_intel competitors      # Find 280+ London security firms
python3 -m secureflex_intel signals          # Scan news for trigger events
python3 -m secureflex_intel enrich           # Score & rank pipeline leads
python3 -m secureflex_intel briefs --top 5   # Generate research briefs
```

## Commands Reference

| Command | Description | Data Source | API Key? |
|---------|-------------|-------------|----------|
| `tenders` | Scan UK Contracts Finder for open security tenders | Contracts Finder OCDS API | No |
| `prospects` | Find companies that buy security services by SIC code | Companies House | Yes |
| `competitors` | Find London security companies (SIC 80100/80200/80300) | Companies House | Yes |
| `monitor` | Check competitor health (overdue filings, admin) | Companies House | Yes |
| `signals` | Scan Google News + Met Police for trigger events | News RSS, Police API | No |
| `enrich` | Score/rank existing pipeline leads, enrich with CH data | Companies House | Yes |
| `briefs` | Generate research briefs for top leads | Pipeline CSV | No |
| `alerts` | Show hot signals and urgent tenders | Local data | No |
| `status` | Show system status, API keys, output counts | Local | No |

## What It Finds

### Tenders (Real examples from live scan)
- **Skanska — Lower Thames Crossing Site Security** — £500k, South East
- **Kier — A66 Manned Security** — £200k, North West
- Every open security tender on UK Contracts Finder, scored 0-100

### Prospects (463+ companies from one scan)
- Property management firms (need site security)
- Hotels & hospitality (need door/concierge)
- Shopping centres (need retail security)
- Hospitals, universities, sports venues
- Construction companies (need site guarding)
- Warehouses & logistics centres

### Competitors (287 from one scan)
- Every active security company in London on Companies House
- SIC codes 80100 (Private security), 80200 (Systems), 80300 (Investigation)

### Signals (137 news signals from one scan)
- Security incidents at named venues
- New commercial developments
- Competitor problems / complaints
- Contract awards and tender announcements

## Package Structure

```
secureflex-intel/
├── secureflex_intel/           # Python package
│   ├── __init__.py
│   ├── __main__.py             # Entry: python -m secureflex_intel
│   ├── cli.py                  # CLI dispatcher (all commands)
│   ├── config.py               # Centralised settings (.env loader)
│   └── sources/
│       ├── contracts_finder.py # Contracts Finder OCDS API v2
│       ├── companies_house.py  # Companies House API (search + advanced)
│       ├── signals.py          # News RSS + Met Police crime data
│       └── enrichment.py       # Lead scoring + research briefs
├── data/
│   └── output/                 # Generated data (gitignored)
│       ├── tenders/            # Tender scan reports + CSV
│       ├── prospects/          # Client prospect lists
│       ├── signals/            # News & crime signal reports
│       └── briefs/             # Per-lead research briefs
├── docs/
│   └── lead_generation_strategy.md
├── .env                        # API keys (gitignored)
├── .gitignore
├── pyproject.toml
├── setup.py                    # Backward-compat install
└── README.md
```

## Configuration

### API Keys

Create a `.env` file in the package root:

```env
COMPANIES_HOUSE_API_KEY=your-key-here
OPENAI_API_KEY=sk-...  # Optional, for future AI features
```

Get a **free** Companies House API key at:
https://developer.company-information.service.gov.uk/

Rate limits: 600 requests per 5 minutes (very generous).

### Pipeline Integration

The package auto-detects a sibling `secureflex-growth/data/pipeline_master.csv`
for the enrichment and scoring commands. Override with:

```env
PIPELINE_CSV_PATH=/path/to/your/pipeline.csv
```

## Server Integration Architecture

The package is designed to be deployed as a backend service:

```
┌─────────────────────────────────────────────┐
│  secureflex-intel (this package)            │
│  ┌────────────────────────────────────────┐ │
│  │  FastAPI Server (future)               │ │
│  │  /api/tenders    → contracts_finder    │ │
│  │  /api/prospects  → companies_house     │ │
│  │  /api/signals    → signals scanner     │ │
│  │  /api/pipeline   → enrichment engine   │ │
│  │  /api/map-data   → GeoJSON for map     │ │
│  └────────────────────────────────────────┘ │
└─────────────┬───────────────────────────────┘
              │ REST API
              ▼
┌─────────────────────────────────────────────┐
│  Dashboard Frontend                         │
│  ┌──────────────────┐ ┌──────────────────┐ │
│  │  Map View         │ │  Pipeline View   │ │
│  │  • Client pins    │ │  • Lead scores   │ │
│  │  • Crime hotspots │ │  • Status board  │ │
│  │  • Tender zones   │ │  • Email queue   │ │
│  └──────────────────┘ └──────────────────┘ │
│  ┌──────────────────┐ ┌──────────────────┐ │
│  │  Live Feed        │ │  Analytics       │ │
│  │  • New tenders    │ │  • Win rate      │ │
│  │  • News alerts    │ │  • Response time │ │
│  │  • Crime spikes   │ │  • Revenue       │ │
│  └──────────────────┘ └──────────────────┘ │
└─────────────────────────────────────────────┘
```

### Planned Server Dependencies

```bash
pip install secureflex-intel[server]
# Adds: fastapi, uvicorn, httpx
```

## Command Examples

```bash
# Tenders — wider date range, add to pipeline
python3 -m secureflex_intel tenders --days-back 60 --add-to-pipeline

# Prospects — different region
python3 -m secureflex_intel prospects --region manchester --max-results 100

# Competitors — monitor specific companies
python3 -m secureflex_intel monitor --competitor-numbers 12345678 23456789

# Signals — full scan
python3 -m secureflex_intel signals

# Enrichment — score and generate briefs for top 10
python3 -m secureflex_intel briefs --top 10

# Status check
python3 -m secureflex_intel status
```

## Data Sources

| Source | Type | Cost | Rate Limit | Notes |
|--------|------|------|------------|-------|
| Contracts Finder OCDS | UK Gov | Free | Generous | All public sector tenders |
| Companies House | UK Gov | Free | 600/5min | Company data, SIC codes, filings |
| Google News RSS | Public | Free | None | Security incident monitoring |
| Met Police API | UK Gov | Free | None | Crime data by location |
| Indeed RSS | Public | Free | None | Job posting signals (may require scraping) |

## Scoring System

Leads are scored 0-100 based on:

| Factor | Weight | Description |
|--------|--------|-------------|
| Fit | 0-40 | Industry match, security keywords, CPV codes |
| Location | 0-25 | London (25), South East (15), England (8), UK (5) |
| Value | 0-20 | Sweet spot £50k-£500k (20), larger/smaller scaled down |
| Deadline | 0-10 | More time = higher score |
| SME Friendly | 0-5 | Bonus for SME-flagged tenders |

## License

Private — SecureFlex Group Ltd.
