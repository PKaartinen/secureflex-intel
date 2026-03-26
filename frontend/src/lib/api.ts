// API client — all calls go to /api/* (same origin, proxied in dev)

const BASE = '/api'

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`)
  if (!res.ok) throw new Error(`API error ${res.status}: ${path}`)
  return res.json()
}

async function post<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) throw new Error(`API error ${res.status}: ${path}`)
  return res.json()
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface StatusResponse {
  status: string
  timestamp: string
  api_keys: { companies_house: boolean; openai: boolean }
  pipeline: { path: string; exists: boolean; lead_count: number }
  data_counts: { tenders: number; prospects: number; signals: number; briefs: number }
  settings: { tender_region: string; tender_days_back: number; prospector_region: string; max_results: number }
}

export interface Lead {
  company_id: string
  company_name: string
  company_type: string
  tier: string
  website_url: string
  region: string
  status: string
  source: string
  score: string | number
  contact_name: string
  contact_email: string
  contact_phone: string
  address: string
  company_number: string
  sic_codes: string
  date_added: string
  last_modified: string
  notes: string
  tags: string
  next_action: string
  next_action_due_date: string
}

export interface PipelineResponse {
  total: number
  leads: Lead[]
}

export interface PipelineStats {
  total: number
  by_status: Record<string, number>
  by_tier: Record<string, number>
  by_type: Record<string, number>
  by_source: Record<string, number>
}

export interface Tender {
  title: string
  buyer: string
  buyer_email: string
  region: string
  cpv_code: string
  value: string | number
  deadline: string
  classification: string
  score: string | number
  sme_friendly: string | boolean
  link: string
  description_snippet: string
  published_date: string
}

export interface TendersResponse {
  total: number
  tenders: Tender[]
  last_scan: string | null
  source_file?: string
}

export interface Prospect {
  company_name: string
  company_number: string
  company_type: string
  sic_codes: string
  region: string
  address: string
  status: string
  website_url: string
  date_of_creation?: string
  source?: string
}

export interface ProspectsResponse {
  total: number
  prospects: Prospect[]
  last_scan: string | null
  offset: number
  limit: number
}

export interface Competitor {
  company_name: string
  company_number: string
  sic_codes: string
  region: string
  address: string
  status: string
  date_of_creation?: string
}

export interface CompetitorsResponse {
  total: number
  competitors: Competitor[]
  last_scan: string | null
}

export interface Signal {
  type: string
  title: string
  source: string
  url?: string
  link?: string
  published: string
  priority: string
  relevance: string
  category: string
  company?: string
  description?: string
}

export interface SignalsResponse {
  total: number
  signals: Signal[]
  last_scan: string | null
}

export interface FeedEvent {
  type: string
  timestamp: string
  title: string
  subtitle: string
  score?: number
  classification?: string
  priority?: string
  detail: string
  link: string
  icon: string
}

export interface FeedResponse {
  total: number
  events: FeedEvent[]
  generated_at: string
}

export interface Brief {
  filename: string
  company_id: string
  company_name: string
  size: number
  last_modified: string
}

export interface BriefsResponse {
  total: number
  briefs: Brief[]
}

export interface GeoJSONFeature {
  type: 'Feature'
  geometry: { type: 'Point'; coordinates: [number, number] }
  properties: {
    name?: string
    title?: string
    buyer?: string
    marker_type: 'prospect' | 'competitor' | 'tender' | 'crime'
    marker_color: string
    score?: number
    classification?: string
    company_type?: string
    [key: string]: unknown
  }
}

export interface GeoJSONCollection {
  type: 'FeatureCollection'
  features: GeoJSONFeature[]
  metadata?: { total_features: number; layers: Record<string, number>; generated_at: string }
}

export interface ScanResponse {
  status: string
  type: string
  [key: string]: unknown
}

// ── API Functions ─────────────────────────────────────────────────────────────

export const api = {
  status: () => get<StatusResponse>('/status'),

  pipeline: (params?: { status?: string; tier?: string; limit?: number }) => {
    const q = new URLSearchParams()
    if (params?.status) q.set('status', params.status)
    if (params?.tier) q.set('tier', params.tier)
    if (params?.limit) q.set('limit', String(params.limit))
    return get<PipelineResponse>(`/pipeline${q.toString() ? '?' + q : ''}`)
  },

  pipelineLead: (id: string) => get<Lead>(`/pipeline/${id}`),

  pipelineStats: () => get<PipelineStats>('/pipeline/stats'),

  tenders: (params?: { min_score?: number; classification?: string }) => {
    const q = new URLSearchParams()
    if (params?.min_score) q.set('min_score', String(params.min_score))
    if (params?.classification) q.set('classification', params.classification)
    return get<TendersResponse>(`/tenders${q.toString() ? '?' + q : ''}`)
  },

  tenderReport: () => get<{ content: string; file: string | null; last_modified: string | null }>('/tenders/report'),

  tendersGeoJSON: () => get<GeoJSONCollection>('/tenders/geojson'),

  prospects: (params?: { company_type?: string; limit?: number; offset?: number }) => {
    const q = new URLSearchParams()
    if (params?.company_type) q.set('company_type', params.company_type)
    if (params?.limit !== undefined) q.set('limit', String(params.limit))
    if (params?.offset !== undefined) q.set('offset', String(params.offset))
    return get<ProspectsResponse>(`/prospects${q.toString() ? '?' + q : ''}`)
  },

  prospectsGeoJSON: (limit = 200) => get<GeoJSONCollection>(`/prospects/geojson?limit=${limit}`),

  competitors: (params?: { limit?: number; offset?: number }) => {
    const q = new URLSearchParams()
    if (params?.limit !== undefined) q.set('limit', String(params.limit))
    if (params?.offset !== undefined) q.set('offset', String(params.offset))
    return get<CompetitorsResponse>(`/competitors${q.toString() ? '?' + q : ''}`)
  },

  competitorsGeoJSON: () => get<GeoJSONCollection>('/competitors/geojson'),

  signals: (params?: { priority?: string; signal_type?: string; limit?: number }) => {
    const q = new URLSearchParams()
    if (params?.priority) q.set('priority', params.priority)
    if (params?.signal_type) q.set('signal_type', params.signal_type)
    if (params?.limit) q.set('limit', String(params.limit))
    return get<SignalsResponse>(`/signals${q.toString() ? '?' + q : ''}`)
  },

  signalsReport: () => get<{ content: string; file: string | null }>('/signals/report'),

  briefs: () => get<BriefsResponse>('/briefs'),

  brief: (filename: string) => get<{ filename: string; content: string }>(`/briefs/${filename}`),

  mapAll: (params?: { prospect_limit?: number; competitor_limit?: number }) => {
    const q = new URLSearchParams()
    if (params?.prospect_limit) q.set('prospect_limit', String(params.prospect_limit))
    if (params?.competitor_limit) q.set('competitor_limit', String(params.competitor_limit))
    return get<GeoJSONCollection>(`/map/all${q.toString() ? '?' + q : ''}`)
  },

  feed: (limit = 50) => get<FeedResponse>(`/feed?limit=${limit}`),

  scanTenders: (daysBack = 30) => post<ScanResponse>(`/scan/tenders?days_back=${daysBack}`),
  scanProspects: (region = 'london') => post<ScanResponse>(`/scan/prospects?region=${region}`),
  scanCompetitors: (region = 'london') => post<ScanResponse>(`/scan/competitors?region=${region}`),
  scanSignals: () => post<ScanResponse>('/scan/signals'),
}
