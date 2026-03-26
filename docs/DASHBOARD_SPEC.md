# SecureFlex Intel Command Center — Dashboard Specification

**Version:** 1.0  
**Date:** 2026-03-26  
**Purpose:** Complete specification for building a professional-grade security intelligence dashboard web application that connects to the `secureflex-intel` backend API.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Architecture Overview](#2-architecture-overview)
3. [Technology Stack](#3-technology-stack)
4. [Pages & Features](#4-pages--features)
   - 4.1 [Command Center (Home)](#41-command-center-home)
   - 4.2 [Intelligence Map](#42-intelligence-map)
   - 4.3 [Tender Radar](#43-tender-radar)
   - 4.4 [Pipeline Manager](#44-pipeline-manager)
   - 4.5 [Prospect Explorer](#45-prospect-explorer)
   - 4.6 [Competitor Watch](#46-competitor-watch)
   - 4.7 [Signal Feed](#47-signal-feed)
   - 4.8 [Research Briefs](#48-research-briefs)
   - 4.9 [Analytics & Reports](#49-analytics--reports)
   - 4.10 [Scan Control](#410-scan-control)
   - 4.11 [Settings](#411-settings)
5. [API Endpoints Reference](#5-api-endpoints-reference)
6. [Data Models](#6-data-models)
7. [Real-Time Updates](#7-real-time-updates)
8. [Design System](#8-design-system)
9. [Deployment](#9-deployment)

---

## 1. Executive Summary

The SecureFlex Intel Command Center is a web-based dashboard that serves as the central hub for all lead generation and market intelligence operations. It connects to the `secureflex-intel` Python backend via REST API to display:

- **Live map** of prospects, competitors, tenders, and crime hotspots across London
- **Real-time feed** of tender opportunities, news signals, and market events
- **Pipeline management** with lead scoring, status tracking, and enrichment
- **Analytics** showing conversion rates, market coverage, and trend analysis
- **One-click scans** to trigger fresh intelligence gathering

The goal is to give the remote cofounder a **professional, data-rich command center** that replaces manual research with automated intelligence — the kind of system a top-tier security consultancy would use.

---

## 2. Architecture Overview

```
┌──────────────────────────────────────────────────────┐
│  Frontend (Next.js / React)                          │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐            │
│  │ Dashboard │ │ Map View │ │ Pipeline │  ...pages  │
│  └─────┬────┘ └─────┬────┘ └─────┬────┘            │
│        │            │            │                   │
│        ▼            ▼            ▼                   │
│  ┌──────────────────────────────────────────────┐   │
│  │  API Client Layer (fetch / SWR / React Query) │   │
│  └──────────────────────┬───────────────────────┘   │
└─────────────────────────┼────────────────────────────┘
                          │ HTTP REST + WebSocket
                          ▼
┌──────────────────────────────────────────────────────┐
│  Backend: secureflex-intel (FastAPI)                  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐            │
│  │ /api/map │ │/api/tend.│ │/api/pipe.│  ...routes │
│  └─────┬────┘ └─────┬────┘ └─────┬────┘            │
│        │            │            │                   │
│        ▼            ▼            ▼                   │
│  ┌──────────────────────────────────────────────┐   │
│  │  Intelligence Sources                         │   │
│  │  • Contracts Finder OCDS API                  │   │
│  │  • Companies House API                        │   │
│  │  • Google News RSS                            │   │
│  │  • Met Police Crime API                       │   │
│  │  • Pipeline CSV / Database                    │   │
│  └──────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────┘
```

### Backend (Already Built)
- **Repo:** https://github.com/PKaartinen/secureflex-intel
- **Server:** `python -m secureflex_intel serve` (FastAPI on port 8000)
- **Docs:** Auto-generated at `http://localhost:8000/docs` (Swagger UI)

### Frontend (To Be Built)
- React/Next.js SPA connecting to the backend API
- Map powered by Mapbox GL JS or Leaflet
- Real-time updates via polling or WebSocket

---

## 3. Technology Stack

### Recommended Frontend Stack
| Component | Technology | Why |
|-----------|-----------|-----|
| Framework | **Next.js 14+ (App Router)** | SSR, file-based routing, excellent DX |
| UI Library | **shadcn/ui + Tailwind CSS** | Professional, customizable, dark mode |
| Map | **Mapbox GL JS** or **react-leaflet** | Industry-standard, GeoJSON native |
| Charts | **Recharts** or **Tremor** | React-native charts, clean design |
| Data Fetching | **TanStack Query (React Query)** | Caching, auto-refresh, loading states |
| State | **Zustand** or built-in React state | Lightweight, simple |
| Icons | **Lucide React** | Clean, comprehensive icon set |
| Markdown | **react-markdown** | For rendering research briefs |

### Color Palette (Dark Theme — Security/Intel Aesthetic)
```
Background:      #0a0a0f (near-black)
Surface:         #111827 (dark gray)
Surface Elevated: #1f2937 (medium gray)
Border:          #374151 (subtle gray)
Primary:         #3b82f6 (blue — main accent)
Success:         #22c55e (green)
Warning:         #f59e0b (amber)
Danger:          #ef4444 (red)
Info:            #06b6d4 (cyan)
Text Primary:    #f9fafb (white)
Text Secondary:  #9ca3af (gray)
```

---

## 4. Pages & Features

### 4.1 Command Center (Home)

**Route:** `/`  
**Purpose:** At-a-glance overview of the entire intelligence operation.

#### Layout (4-column grid)
```
┌─────────────────────────────────────────────────────────┐
│  SECUREFLEX INTEL COMMAND CENTER           [Scan All ▶] │
├──────────┬──────────┬──────────┬────────────────────────┤
│  🔴 HOT  │  🟡 WARM │ 📋 PIPE │  📊 WIN RATE          │
│  Tenders │  Signals │  Leads  │  12% (this month)     │
│  3       │  51      │  10     │  ▲ from 8%            │
├──────────┴──────────┴──────────┴────────────────────────┤
│                                                         │
│  ┌──────────────────────┐  ┌──────────────────────────┐ │
│  │  LIVE FEED            │  │  MINI MAP               │ │
│  │                       │  │                          │ │
│  │  🔴 New tender:       │  │  [London map with       │ │
│  │  Skanska £500k site   │  │   colored dots for      │ │
│  │  security             │  │   prospects, tenders,   │ │
│  │                       │  │   competitors]          │ │
│  │  📰 Security breach   │  │                          │ │
│  │  at Westfield London  │  │                          │ │
│  │                       │  │                          │ │
│  │  🟡 Competitor filing │  │                          │ │
│  │  overdue: XYZ Sec.    │  │                          │ │
│  │                       │  │                          │ │
│  │  📋 New prospect:     │  │                          │ │
│  │  Premier Inn London   │  │                          │ │
│  │                       │  │                          │ │
│  └──────────────────────┘  └──────────────────────────┘ │
│                                                         │
│  ┌──────────────────────────────────────────────────────┤
│  │  PIPELINE SNAPSHOT                                   │
│  │  Not Contacted ████████░░░░░░ 4                      │
│  │  Email Sent    ███████░░░░░░░ 3                      │
│  │  Warm          ████░░░░░░░░░░ 2                      │
│  │  Pilot Live    ██░░░░░░░░░░░░ 1                      │
│  └──────────────────────────────────────────────────────┤
│                                                         │
│  ┌──────────────────────┐  ┌──────────────────────────┐ │
│  │  TOP LEADS            │  │  UPCOMING ACTIONS        │ │
│  │  1. G4S Sec. (95/100)│  │  • Follow up G4S (today) │ │
│  │  2. Buckingham (95)  │  │  • Tender deadline (3d)  │ │
│  │  3. Securitas (91)   │  │  • Call Westminster (5d) │ │
│  └──────────────────────┘  └──────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

#### API Calls
- `GET /api/status` — System health
- `GET /api/pipeline/stats` — Pipeline statistics
- `GET /api/feed?limit=20` — Live event feed
- `GET /api/tenders?min_score=40` — Hot/warm tenders
- `GET /api/map/all?prospect_limit=50` — Mini map data

#### Key Features
- **KPI Cards** — 4 cards at top showing key metrics with trend arrows
- **Live Feed** — Scrolling list of recent events across all sources, color-coded by type
- **Mini Map** — Embedded small map showing recent activity clusters
- **Pipeline Bar Chart** — Horizontal stacked bar showing leads by status
- **Top Leads** — Ranked list of highest-scoring pipeline leads
- **Upcoming Actions** — Next actions due (deadlines, follow-ups)
- **Scan All Button** — One-click to trigger all intelligence scans

---

### 4.2 Intelligence Map

**Route:** `/map`  
**Purpose:** Full-screen interactive map showing all intelligence layers across London.

#### Map Layers (Toggle On/Off)
| Layer | Icon | Color | Data Source |
|-------|------|-------|-------------|
| Prospects | 🔵 Circle | Blue (by type) | `/api/prospects/geojson` |
| Competitors | 🔴 Diamond | Red | `/api/competitors/geojson` |
| Tenders | ⭐ Star | Gold/Green/Red (by score) | `/api/tenders/geojson` |
| Crime Hotspots | 🟡 Heatmap | Yellow→Red gradient | `/api/signals` (crime) |
| Pipeline Leads | 📍 Pin | Status-colored | `/api/pipeline` (with coords) |

#### Layout
```
┌─────────────────────────────────────────────────────────┐
│  INTELLIGENCE MAP                     [Filter] [Layers] │
├──────────┬──────────────────────────────────────────────┤
│          │                                              │
│  LAYERS  │                                              │
│          │           [Full London Map]                   │
│  ☑ Pros  │                                              │
│  ☑ Comp  │        Blue dots = prospects                 │
│  ☑ Tend  │        Red diamonds = competitors            │
│  ☑ Crime │        Gold stars = tenders                  │
│  ☑ Pipe  │        Heatmap = crime zones                 │
│          │                                              │
│  FILTERS │                                              │
│  ──────  │                                              │
│  Region  │                                              │
│  [All ▼] │                                              │
│          │                                              │
│  Type    │                                              │
│  [All ▼] │                                              │
│          │                                              │
│  Score   │                                              │
│  [40+  ] │                                              │
│          │                                              │
│  STATS   │                                              │
│  463 pros│                                              │
│  287 comp│                                              │
│  8 tend  │                                              │
│          │                                              │
├──────────┴──────────────────────────────────────────────┤
│  [Selected item detail panel — slides in from right]    │
│  Company: Premier Inn London | SIC: 55100 Hotels        │
│  Address: 1 Euston Road, London NW1 2SD                 │
│  Status: Not Contacted | [Add to Pipeline] [View Brief] │
└─────────────────────────────────────────────────────────┘
```

#### Map Features
- **Clustering** — Zoom out shows clusters with count badges
- **Click Popup** — Click any marker to see summary card
- **Detail Panel** — Right sidebar slides open with full details
- **Search** — Search bar to jump to a specific company/location
- **Heatmap Toggle** — Crime data as a transparent heatmap overlay
- **Draw Tool** — Draw a polygon to select companies in an area
- **Export** — Export selected area as CSV for outreach list

#### API Calls
- `GET /api/map/all` — Combined GeoJSON (or individual layer endpoints)
- `GET /api/prospects/geojson?limit=500` — Prospect pins
- `GET /api/competitors/geojson?limit=300` — Competitor pins
- `GET /api/tenders/geojson` — Tender locations

---

### 4.3 Tender Radar

**Route:** `/tenders`  
**Purpose:** Dedicated view for monitoring and acting on UK government security tenders.

#### Layout
```
┌─────────────────────────────────────────────────────────┐
│  TENDER RADAR                         [Run Scan ▶]      │
│  Last scan: 2 hours ago | 8 opportunities found         │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐                  │
│  │🔴 HOT│ │🟡WARM│ │🟢 MON│ │⚪ LOW│                  │
│  │  0   │ │  2   │ │  6   │ │  0   │                  │
│  └──────┘ └──────┘ └──────┘ └──────┘                  │
│                                                         │
│  ┌──────────────────────────────────────────────────┐  │
│  │ 🟡 WARM [56/100]                                 │  │
│  │ Lower Thames Crossing - Kent Roads - Site Security│  │
│  │                                                    │  │
│  │ Buyer: SKANSKA CONSTRUCTION UK LIMITED             │  │
│  │ Email: steve.willis@skanska.co.uk                  │  │
│  │ Region: South East | Value: £500,000               │  │
│  │ Deadline: 2026-04-13 (18 days left)                │  │
│  │ CPV: 79710000 — Security services                  │  │
│  │ SME Friendly: ✅                                    │  │
│  │                                                    │  │
│  │ Score Breakdown:                                   │  │
│  │ ██████████████░░░░░░ Keyword: 24/40               │  │
│  │ ███████████████░░░░░ Location: 15/25              │  │
│  │ ████████████████████ Value: 20/20                 │  │
│  │ ████████░░░░░░░░░░░ Deadline: 8/10               │  │
│  │ █████░░░░░░░░░░░░░░ SME: 5/5                     │  │
│  │                                                    │  │
│  │ [View on Contracts Finder] [Add to Pipeline]       │  │
│  │ [Generate Response Brief] [Email Buyer]            │  │
│  └──────────────────────────────────────────────────┘  │
│                                                         │
│  ┌──────────────────────────────────────────────────┐  │
│  │ 🟡 WARM [41/100]                                 │  │
│  │ A66 Northern Trans-Pennine - Manned Security      │  │
│  │ Buyer: KIER TRANSPORTATION LIMITED                 │  │
│  │ ...                                                │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

#### Features
- **Classification filter tabs** — HOT / WARM / MONITOR / LOW / ALL
- **Score breakdown visualization** — Progress bars for each scoring factor
- **Days-until-deadline countdown** — Visual urgency indicator
- **Quick actions** — Add to pipeline, email buyer, generate response brief
- **History** — View previous scan results
- **Scan trigger** — "Run Scan" with days-back parameter
- **Email draft** — Auto-generate tender inquiry email

#### API Calls
- `GET /api/tenders` — All tenders with filters
- `GET /api/tenders/report` — Markdown report
- `POST /api/scan/tenders` — Trigger new scan

---

### 4.4 Pipeline Manager

**Route:** `/pipeline`  
**Purpose:** Full CRM-style pipeline view for managing leads through the sales process.

#### Views
1. **Kanban Board** — Cards in columns by status
2. **Table View** — Sortable/filterable spreadsheet view
3. **Timeline View** — Chronological activity log

#### Kanban Board Layout
```
┌──────────────────────────────────────────────────────────────────┐
│  PIPELINE MANAGER                    [+ Add Lead] [Enrich All]  │
│  10 leads | 6 hot | 4 warm          [Board] [Table] [Timeline]  │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Not Contacted  │  Email Sent    │  Warm/Meeting   │  Pilot     │
│  ─────────────  │  ───────────   │  ─────────────  │  ─────     │
│  ┌───────────┐  │  ┌───────────┐ │  ┌───────────┐  │  ┌──────┐ │
│  │Allied Univ│  │  │Mitie Sec. │ │  │Securitas   │  │  │Buck. │ │
│  │Score: 57  │  │  │Score: 69  │ │  │Score: 91   │  │  │Sec.  │ │
│  │Tier: 2    │  │  │Tier: 1    │ │  │Tier: 1     │  │  │95/100│ │
│  │Prime Cont.│  │  │FM Company │ │  │Prime Cont. │  │  │      │ │
│  └───────────┘  │  └───────────┘ │  └───────────┘  │  └──────┘ │
│  ┌───────────┐  │  ┌───────────┐ │  ┌───────────┐  │           │
│  │Showsec    │  │  │Churchill  │ │  │G4S Sec.   │  │           │
│  │Score: 54  │  │  │Score: 62  │ │  │Score: 95   │  │           │
│  │Venue/Event│  │  │Prime Cont.│ │  │Prime Cont. │  │           │
│  └───────────┘  │  └───────────┘ │  └───────────┘  │           │
│                 │                │                   │           │
│                 │  ┌───────────┐ │                   │           │
│                 │  │Kingdom Svc│ │                   │           │
│                 │  │Score: 71  │ │                   │           │
│                 │  │FM Company │ │                   │           │
│                 │  └───────────┘ │                   │           │
│                                                                  │
├──────────────────────────────────────────────────────────────────┤
│  LEAD DETAIL (click to expand)                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  G4S Security                               Score: 95    │   │
│  │  ─────────────────────────────────────────────────────    │   │
│  │  Type: Prime Contractor | Tier: 1 | Region: London       │   │
│  │  Contact: [name] | [email] | [phone]                     │   │
│  │  Website: g4s.com                                         │   │
│  │  CH#: 04811117 | SIC: 80100 Private security              │   │
│  │  Created: 1996-01-15 | Status: Pilot Discussion           │   │
│  │                                                            │   │
│  │  ACTIVITY LOG                                              │   │
│  │  2025-12-01  Email sent (Tier 1 intro)                    │   │
│  │  2025-12-05  Response received — interested in pilot      │   │
│  │  2025-12-08  Call scheduled                                │   │
│  │                                                            │   │
│  │  NEXT ACTION: Follow up on pilot terms — Due: 2025-12-15 │   │
│  │                                                            │   │
│  │  [View Brief] [Send Email] [Log Call] [Move Stage →]      │   │
│  └──────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
```

#### Features
- **Drag-and-drop Kanban** — Move leads between status columns
- **Score badge** — Color-coded score on each card
- **Quick email** — Send templated email from the card
- **Activity log** — Record calls, emails, meetings per lead
- **Bulk actions** — Select multiple leads and change status/assign
- **Filters** — By tier, type, score range, source, region
- **Search** — Full-text search across all lead fields

#### API Calls
- `GET /api/pipeline` — All leads
- `GET /api/pipeline/{id}` — Single lead detail
- `GET /api/pipeline/stats` — Statistics

---

### 4.5 Prospect Explorer

**Route:** `/prospects`  
**Purpose:** Browse and filter the 463+ potential client companies found by the prospector.

#### Layout
```
┌─────────────────────────────────────────────────────────┐
│  PROSPECT EXPLORER               [Run Scan] [Export CSV]│
│  463 companies | Last scan: 2h ago                      │
├──────────┬──────────────────────────────────────────────┤
│ FILTERS  │                                              │
│          │  ┌─────────────────────────────────────────┐ │
│ Type:    │  │ Company Name    │ Type       │ SIC  │Reg│ │
│ ☑ FM     │  ├─────────────────┼────────────┼──────┼───┤ │
│ ☑ Hotel  │  │ Hilton London   │ Hotels     │55100 │LON│ │
│ ☑ Venue  │  │ British Land    │ Real Est.  │68320 │LON│ │
│ ☑ Retail │  │ Westfield       │ Retail     │47190 │LON│ │
│ ☑ Health │  │ UCL             │ Education  │85421 │LON│ │
│ ☑ Educ.  │  │ Berkeley Homes  │ Construct. │41100 │LON│ │
│ ☑ Constr │  │ ...             │            │      │   │ │
│ ☑ Warehs │  └─────────────────────────────────────────┘ │
│          │                                              │
│ Region:  │  Showing 1-50 of 463    [◀ 1 2 3 4 ... ▶]  │
│ [London] │                                              │
│          │                                              │
│ SIC Code:│  ┌── Detail Panel (click row) ──────────┐   │
│ [All   ] │  │ Hilton London Metropole               │   │
│          │  │ CH#: 02172975                          │   │
│ Status:  │  │ SIC: 55100 Hotels & similar            │   │
│ [Active] │  │ Address: 225 Edgware Rd, W2 1JU        │   │
│          │  │ Created: 1987-06-15                     │   │
│          │  │ [Add to Pipeline] [View on CH]          │   │
│          │  │ [Generate Brief] [Find on LinkedIn]     │   │
│          │  └────────────────────────────────────────┘   │
└──────────┴──────────────────────────────────────────────┘
```

#### Features
- **Paginated table** with server-side filtering
- **SIC code filter** — Filter by industry type
- **One-click pipeline add** — Add any prospect to the sales pipeline
- **LinkedIn lookup** — Link to search for decision makers
- **Batch selection** — Select multiple and add to pipeline/export
- **Companies House deep link** — Direct link to CH profile

#### API Calls
- `GET /api/prospects?company_type=Hotels&limit=50&offset=0`
- `POST /api/scan/prospects` — Trigger new scan

---

### 4.6 Competitor Watch

**Route:** `/competitors`  
**Purpose:** Monitor 287+ London security competitors for market intelligence.

#### Layout
```
┌─────────────────────────────────────────────────────────┐
│  COMPETITOR WATCH                    [Run Scan] [Monitor]│
│  287 security companies in London                        │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────┐ │
│  │ Total    │ │ Private  │ │ Systems  │ │ Investig. │ │
│  │ 287      │ │ Sec: 180 │ │ Sec: 72  │ │ 35        │ │
│  │ companies│ │ SIC80100 │ │ SIC80200 │ │ SIC80300  │ │
│  └──────────┘ └──────────┘ └──────────┘ └───────────┘ │
│                                                         │
│  ┌── HEALTH ALERTS ─────────────────────────────────┐  │
│  │ 🔴 XYZ Security Ltd — IN ADMINISTRATION           │  │
│  │    → Their clients may need a new provider NOW    │  │
│  │                                                    │  │
│  │ 🟡 ABC Guarding Ltd — Accounts 18 months overdue  │  │
│  │    → Possible financial distress                   │  │
│  │                                                    │  │
│  │ 🟡 123 Patrol Services — Director resigned         │  │
│  │    → Leadership instability                        │  │
│  └──────────────────────────────────────────────────┘  │
│                                                         │
│  ┌── COMPETITOR TABLE ──────────────────────────────┐  │
│  │ Name              │ SIC   │ Region│ Status │ Accts│  │
│  │ Securitas UK      │ 80100 │ LON   │ Active │ ✅   │  │
│  │ G4S Holdings      │ 80100 │ LON   │ Active │ ✅   │  │
│  │ Mitie Group       │ 80100 │ LON   │ Active │ ✅   │  │
│  │ Corps Security    │ 80100 │ LON   │ Active │ 🟡   │  │
│  │ ...               │       │       │        │      │  │
│  └──────────────────────────────────────────────────┘  │
│                                                         │
│  [Monitor Selected] — Track filing health for alerts    │
└─────────────────────────────────────────────────────────┘
```

#### Features
- **Health monitoring** — Alert when competitors show signs of distress
- **SIC code breakdown** — Pie chart of competitor types
- **Filing status** — Green/amber/red indicator for accounts health
- **Add to watchlist** — Select competitors for ongoing monitoring
- **Competitor profile** — Click to see full CH data, directors, filings
- **Client poaching** — When a competitor fails, target their clients

#### API Calls
- `GET /api/competitors`
- `POST /api/scan/competitors`

---

### 4.7 Signal Feed

**Route:** `/signals`  
**Purpose:** Real-time news, crime, and job signals indicating security opportunities.

#### Layout
```
┌─────────────────────────────────────────────────────────┐
│  SIGNAL FEED                         [Run Scan] [Filter]│
│  137 signals | 51 hot | 49 warm | Last scan: 1h ago    │
├──────────┬──────────────────────────────────────────────┤
│          │                                              │
│ FILTER   │  ┌── Signal Card ──────────────────────────┐ │
│          │  │ 🔴 HOT — Security Breach                │ │
│ ☑ News   │  │ "Major security breach at Canary Wharf  │ │
│ ☐ Jobs   │  │  office complex, staff evacuated"        │ │
│ ☑ Crime  │  │                                          │ │
│          │  │ Source: Evening Standard                  │ │
│ Priority │  │ Published: 2 hours ago                    │ │
│ ☑ Hot    │  │ Relevance: Venue may need new provider   │ │
│ ☑ Warm   │  │                                          │ │
│ ☐ Low    │  │ [Read Article] [Create Lead] [Dismiss]   │ │
│          │  └──────────────────────────────────────────┘ │
│ Category │                                              │
│ ☑ Breach │  ┌── Signal Card ──────────────────────────┐ │
│ ☑ New Dev│  │ 🟡 WARM — New Development               │ │
│ ☑ Contract│ │ "Planning approved for 500-unit          │ │
│ ☑ Comp.  │  │  residential tower in Stratford"         │ │
│          │  │                                          │ │
│          │  │ Source: Property Week                     │ │
│          │  │ → New builds need security from day one  │ │
│          │  │                                          │ │
│          │  │ [Read Article] [Create Lead] [Dismiss]   │ │
│          │  └──────────────────────────────────────────┘ │
│          │                                              │
│          │  ...more signals...                          │
└──────────┴──────────────────────────────────────────────┘
```

#### Signal Categories
| Category | Signal Type | Action |
|----------|------------|--------|
| 🔴 Security Breach | Break-in, robbery, incident at a venue | Contact venue about upgrading security |
| 🔴 Competitor Failure | Company in admin, bad reviews, complaints | Target their clients |
| 🟡 New Development | New building, shopping centre, hotel opening | Approach developer for security contract |
| 🟡 Contract Award | Security contract awarded to another firm | Note who's buying, follow up at renewal |
| 🟢 Job Posting | Company hiring security staff directly | They may prefer outsourcing to you |
| 🟢 Crime Spike | Elevated crime in an area | Approach local businesses about protection |

#### Features
- **Priority badges** — Visual hot/warm/low classification
- **One-click lead creation** — Turn any signal into a pipeline lead
- **Category filters** — Filter by signal type
- **Article preview** — Expandable snippet with full article link
- **Dismiss/archive** — Mark signals as reviewed
- **Auto-refresh** — Poll for new signals every 5 minutes

#### API Calls
- `GET /api/signals?priority=hot&limit=50`
- `GET /api/signals/report` — Full markdown report
- `POST /api/scan/signals`

---

### 4.8 Research Briefs

**Route:** `/briefs`  
**Purpose:** View and manage auto-generated research briefs for pipeline leads.

#### Layout
- **List of briefs** — Table showing all generated briefs with company, score, date
- **Brief viewer** — Full markdown brief rendered with headings, sections
- **Generate button** — Trigger brief generation for top N leads
- **Print/PDF export** — Export brief as PDF for sharing

#### Brief Contents (Auto-Generated)
Each brief includes:
1. Company overview (name, type, CH number, SIC codes)
2. Score and ranking
3. Contact information known
4. Research gaps (what's missing)
5. Recommended approach strategy
6. Key talking points
7. Competitor analysis for that prospect
8. Action items

#### API Calls
- `GET /api/briefs` — List all briefs
- `GET /api/briefs/{filename}` — Get brief content

---

### 4.9 Analytics & Reports

**Route:** `/analytics`  
**Purpose:** Visualize trends, conversion rates, and market coverage.

#### Charts & Visualizations

1. **Pipeline Funnel** — Leads by stage (Not Contacted → Email → Warm → Pilot → Won)
2. **Lead Source Performance** — Bar chart: which sources produce the best leads
3. **Score Distribution** — Histogram of lead scores
4. **Time Series** — Tenders found per week, signals per day
5. **Market Coverage Map** — Heatmap of London showing density of coverage
6. **Conversion Rate** — Percentage moving through each stage
7. **Response Time** — Average time between stages
8. **Win Rate** — Contracts won / total approached
9. **Revenue Pipeline** — Estimated contract values by stage
10. **Competitor Health** — Grid showing competitor status over time

#### Layout
```
┌─────────────────────────────────────────────────────────┐
│  ANALYTICS                           [Export] [Weekly]   │
├──────────┬──────────────────────────────────────────────┤
│ Pipeline │  ┌──────────────────────────────────────┐    │
│ Funnel   │  │  Not Contacted  ████████████████  40% │    │
│          │  │  Email Sent     ████████████      30% │    │
│          │  │  Warm/Meeting   ████████          20% │    │
│          │  │  Pilot          ████              10% │    │
│          │  │  Won            ██                5%  │    │
│          │  └──────────────────────────────────────┘    │
├──────────┼──────────────────────────────────────────────┤
│ Tenders  │  ┌── Tenders Over Time ──────────────┐      │
│ Over     │  │  10│         *                      │      │
│ Time     │  │   8│    *        *                  │      │
│          │  │   6│       *  *     *               │      │
│          │  │   4│  *               *  *          │      │
│          │  │   2│                      *  *      │      │
│          │  │   0└──────────────────────────────  │      │
│          │  │    W1  W2  W3  W4  W5  W6  W7  W8 │      │
│          │  └────────────────────────────────────┘      │
├──────────┼──────────────────────────────────────────────┤
│ Source   │  ┌── Lead Source Performance ─────────┐      │
│ Perf.    │  │  Tender Radar    ██████████  35%   │      │
│          │  │  Companies House ████████    28%    │      │
│          │  │  News Signals    ██████      21%    │      │
│          │  │  Manual/Referral ████        14%    │      │
│          │  │  Apollo/LinkedIn ██          7%     │      │
│          │  └────────────────────────────────────┘      │
└──────────┴──────────────────────────────────────────────┘
```

#### API Calls
- `GET /api/pipeline/stats`
- `GET /api/tenders`
- `GET /api/signals`

---

### 4.10 Scan Control

**Route:** `/scans`  
**Purpose:** Trigger and monitor intelligence scans. Schedule automated runs.

#### Layout
```
┌─────────────────────────────────────────────────────────┐
│  SCAN CONTROL CENTER                                     │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │  SCAN TYPE        │ LAST RUN │ STATUS │ ACTION  │   │
│  │  Tender Radar     │ 2h ago   │ ✅ OK  │ [Run ▶] │   │
│  │  Prospect Finder  │ 2h ago   │ ✅ OK  │ [Run ▶] │   │
│  │  Competitor Scan  │ 2h ago   │ ✅ OK  │ [Run ▶] │   │
│  │  Signal Scanner   │ 1h ago   │ ✅ OK  │ [Run ▶] │   │
│  │  Lead Enrichment  │ 30m ago  │ ✅ OK  │ [Run ▶] │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  [▶ Run All Scans]                                      │
│                                                         │
│  ┌── Scan History ────────────────────────────────┐    │
│  │ 22:45  Tender Radar    8 tenders, 2 warm       │    │
│  │ 22:43  Prospects       463 companies found     │    │
│  │ 22:44  Competitors     287 firms mapped         │    │
│  │ 22:46  Signals         137 signals (51 hot)     │    │
│  └────────────────────────────────────────────────┘    │
│                                                         │
│  ┌── Schedule (Future) ──────────────────────────┐     │
│  │ Tenders:     Every 6 hours                     │     │
│  │ Prospects:   Weekly (Monday 06:00)             │     │
│  │ Competitors: Weekly (Monday 06:00)             │     │
│  │ Signals:     Every 4 hours                     │     │
│  │ Enrichment:  Daily (02:00)                     │     │
│  └────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────┘
```

#### API Calls
- `POST /api/scan/tenders`
- `POST /api/scan/prospects`
- `POST /api/scan/competitors`
- `POST /api/scan/signals`
- `GET /api/status` — Scan status

---

### 4.11 Settings

**Route:** `/settings`  
**Purpose:** Configure API keys, scan parameters, and preferences.

#### Sections
1. **API Keys** — Companies House key, OpenAI key (masked input)
2. **Scan Parameters** — Region, days-back, max results
3. **Pipeline** — CSV path, pipeline field configuration
4. **Notifications** — Email alerts for hot tenders, competitor alerts
5. **Display** — Theme (dark/light), map style, default view
6. **About** — Version, API docs link, GitHub link

---

## 5. API Endpoints Reference

All endpoints are served by the FastAPI backend at `http://localhost:8000`.

### Read Endpoints (GET)
| Endpoint | Description | Response |
|----------|-------------|----------|
| `/api/status` | System health | JSON |
| `/api/pipeline` | All leads (filterable) | JSON array |
| `/api/pipeline/{id}` | Single lead | JSON object |
| `/api/pipeline/stats` | Pipeline statistics | JSON |
| `/api/tenders` | Latest tender results | JSON array |
| `/api/tenders/report` | Tender report (markdown) | JSON {content} |
| `/api/tenders/geojson` | Tender map data | GeoJSON |
| `/api/prospects` | Prospect list (paginated) | JSON array |
| `/api/prospects/geojson` | Prospect map data | GeoJSON |
| `/api/competitors` | Competitor list | JSON array |
| `/api/competitors/geojson` | Competitor map data | GeoJSON |
| `/api/signals` | News/crime signals | JSON array |
| `/api/signals/report` | Signal report (markdown) | JSON {content} |
| `/api/briefs` | List research briefs | JSON array |
| `/api/briefs/{filename}` | Single brief content | JSON {content} |
| `/api/map/all` | Combined GeoJSON (all layers) | GeoJSON |
| `/api/feed` | Aggregated live feed | JSON array |

### Write Endpoints (POST)
| Endpoint | Description | Response |
|----------|-------------|----------|
| `/api/scan/tenders` | Trigger tender scan | {status: started} |
| `/api/scan/prospects` | Trigger prospect scan | {status: started} |
| `/api/scan/competitors` | Trigger competitor scan | {status: started} |
| `/api/scan/signals` | Trigger signal scan | {status: started} |

### Interactive API Docs
- Swagger UI: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`

---

## 6. Data Models

### Lead (Pipeline Entry)
```typescript
interface Lead {
  company_id: string;      // SEC-0001
  company_name: string;
  company_type: string;    // "Prime Contractor", "Facilities Management", etc.
  tier: string;            // "1", "2", "3"
  website_url: string;
  region: string;
  status: string;          // "Not Contacted", "Email 1 Sent", "Warm", "Pilot Live"
  source: string;          // "Tender Radar", "Companies House", "News Signal"
  score: number;           // 0-100
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  address: string;
  company_number: string;  // Companies House number
  sic_codes: string;
  date_added: string;      // ISO date
  last_modified: string;
  notes: string;
  tags: string;
  next_action: string;
  next_action_due_date: string;
}
```

### Tender
```typescript
interface Tender {
  title: string;
  buyer: string;
  buyer_email: string;
  region: string;
  cpv_code: string;
  value: number;
  deadline: string;
  classification: string;  // "🔴 HOT", "🟡 WARM", etc.
  score: number;
  sme_friendly: boolean;
  link: string;
  description_snippet: string;
  published_date: string;
}
```

### Signal
```typescript
interface Signal {
  type: string;        // "news", "crime", "job"
  title: string;
  source: string;
  url: string;
  published: string;
  priority: string;    // "hot", "warm", "low"
  relevance: string;   // Why this matters
  category: string;    // "breach", "development", "competitor", etc.
}
```

### GeoJSON Feature
```typescript
interface MapFeature {
  type: "Feature";
  geometry: {
    type: "Point";
    coordinates: [number, number];  // [lng, lat]
  };
  properties: {
    name: string;
    marker_type: "prospect" | "competitor" | "tender" | "crime";
    marker_color: string;   // Hex color
    // Additional fields vary by type
  };
}
```

---

## 7. Real-Time Updates

### Polling Strategy (Phase 1 — Simple)
```typescript
// Use TanStack Query with auto-refresh
const { data: feed } = useQuery({
  queryKey: ['feed'],
  queryFn: () => fetch('/api/feed').then(r => r.json()),
  refetchInterval: 30_000,  // Every 30 seconds
});

const { data: status } = useQuery({
  queryKey: ['status'],
  queryFn: () => fetch('/api/status').then(r => r.json()),
  refetchInterval: 60_000,  // Every 60 seconds
});
```

### WebSocket (Phase 2 — Future)
```
ws://localhost:8000/ws/feed
→ Receives push notifications when new scan results are available
→ Events: { type: "tender_found", data: {...} }
→ Events: { type: "scan_complete", data: { type: "signals", count: 137 } }
```

---

## 8. Design System

### Component Library
- Use **shadcn/ui** for all UI components (Dialog, Table, Card, Badge, etc.)
- Dark mode by default (security command center aesthetic)
- Responsive: desktop-first, but usable on tablet

### Key Components to Build

1. **StatCard** — KPI metric with icon, value, trend arrow, subtitle
2. **SignalCard** — News/event card with priority badge, source, actions
3. **LeadCard** — Pipeline lead summary for Kanban board
4. **TenderCard** — Tender opportunity with score breakdown
5. **MapPopup** — Popup content for map markers
6. **ScoreBar** — Horizontal progress bar showing score breakdown
7. **StatusBadge** — Colored badge for lead status
8. **PriorityDot** — Red/amber/green dot indicator

### Typography
```
Headings: Inter (bold)
Body: Inter (regular)
Monospace: JetBrains Mono (for data, IDs)
```

### Spacing
```
Page padding: 24px
Card padding: 16px
Grid gap: 16px
Sidebar width: 280px
```

---

## 9. Deployment

### Phase 1: Local Development
```bash
# Backend
cd secureflex-intel
pip install -r requirements.txt
python -m secureflex_intel serve --port 8000 --reload

# Frontend (in separate terminal)
cd secureflex-dashboard
npm install
npm run dev  # → http://localhost:3000
```

### Phase 2: Single Server (VPS)
```bash
# Deploy both on a single VPS (DigitalOcean, Railway, Render)
# Backend: gunicorn + uvicorn workers
# Frontend: Next.js standalone build
# Reverse proxy: nginx or Caddy
```

### Phase 3: Cloud (Production)
```
Backend:   Railway / Render / Fly.io (Python)
Frontend:  Vercel (Next.js — free tier)
Database:  Supabase (replace CSV with PostgreSQL)
Cron:      GitHub Actions or Railway cron for scheduled scans
Auth:      NextAuth.js (protect the dashboard)
```

### Environment Variables (Production)
```env
COMPANIES_HOUSE_API_KEY=xxx
DATABASE_URL=postgresql://...
NEXTAUTH_SECRET=xxx
API_BASE_URL=https://api.secureflex-intel.com
```

---

## Summary: What to Give Manus AI

When you share this spec with Manus AI to build the dashboard, provide:

1. **This document** — Complete specification with every page, feature, and data model
2. **The GitHub repo** — https://github.com/PKaartinen/secureflex-intel
3. **API documentation** — Tell Manus to run `python -m secureflex_intel serve` and open `http://localhost:8000/docs` for interactive Swagger docs
4. **Sample data** — The backend already has real scan data in `data/output/` from test runs

### Key Instructions for Manus AI
- Build a Next.js 14+ app with shadcn/ui and Tailwind CSS dark theme
- Connect to the FastAPI backend at `http://localhost:8000`
- Use the GeoJSON endpoints for map layers (Mapbox GL JS or Leaflet)
- Implement all 11 pages described in Section 4
- Use TanStack Query for data fetching with polling
- Make it look like a professional intelligence command center
- Every card/table should be clickable with detail views
- Include a working map with toggleable layers
