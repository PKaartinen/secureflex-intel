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
  database?: string
  api_keys: { companies_house: boolean; anthropic?: boolean }
  pipeline: { path: string; exists: boolean; lead_count: number }
  data_counts: { tenders: number; prospects: number; competitors?: number; signals: number; dossiers: number }
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
  next_action_date?: string
  created_at?: string
}

export interface LeadCreatePayload {
  company_name: string
  company_type?: string
  company_number?: string
  sic_codes?: string
  region?: string
  address?: string
  website_url?: string
  source?: string
  status?: string
  tier?: string
  notes?: string
  next_action?: string
  next_action_date?: string
}

export interface LeadUpdatePayload {
  company_name?: string
  company_type?: string
  company_number?: string
  sic_codes?: string
  region?: string
  address?: string
  website_url?: string
  source?: string
  status?: string
  tier?: string
  notes?: string
  next_action?: string
  next_action_date?: string
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
  source?: string  // 'contracts_finder' | 'fts'
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
  score?: number
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

export interface DossierPayload {
  company_name: string
  company_number?: string
  company_type?: string
  region?: string
  sic_codes?: string
  address?: string
  website_url?: string
}

export interface DossierResponse {
  company_name: string
  company_number?: string
  company_key?: string
  company_type?: string
  region?: string
  generated_at: string
  updated_at?: string
  dossier_markdown: string | null
  sources_used: string[]
  data_summary: {
    has_prospect_record: boolean
    has_pipeline_lead: boolean
    is_known_competitor: boolean
    signal_count: number
    tender_count: number
    news_article_count: number
    has_ch_profile: boolean
    has_website_analysis: boolean
  }
  saved_as?: string | null
}

export interface DossierListItem {
  id: number
  company_key: string
  company_name: string
  company_number: string | null
  company_type: string | null
  region: string | null
  source_count: number
  generated_at: string
  updated_at: string
}

export interface DossierListResponse {
  total: number
  dossiers: DossierListItem[]
}

export interface CrimeResponse {
  total: number
  categories: Record<string, number>
  density_score: number
  month?: string
  security_relevant_total?: number
  company_number?: string
  company_name?: string
  address?: string
  error?: string
}

export interface ScanResponse {
  status: string
  type: string
  [key: string]: unknown
}

export interface ScanSchedule {
  enabled: boolean
  interval_hours: number
  last_run: string | null
  next_run: string | null
  running: boolean
}

export interface ScanRun {
  id: number
  scan_type: string
  started_at: string
  completed_at: string | null
  records_written: number
  status: string
  error: string | null
}

export interface ScanHistoryResponse {
  runs: ScanRun[]
  running: ScanRun[]
  total: number
}

export interface BadgeFlags {
  has_signals: boolean
  has_tenders: boolean
  has_dossier: boolean
  in_pipeline: boolean
  high_crime: boolean
  gazette_alert: boolean
}

// company_number -> BadgeFlags
export type EnrichmentBadgesResponse = Record<string, BadgeFlags>

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

  tenders: (params?: { min_score?: number; classification?: string; source?: string }) => {
    const q = new URLSearchParams()
    if (params?.min_score) q.set('min_score', String(params.min_score))
    if (params?.classification) q.set('classification', params.classification)
    if (params?.source) q.set('source', params.source)
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

  mapAll: (params?: { prospect_limit?: number; competitor_limit?: number }) => {
    const q = new URLSearchParams()
    if (params?.prospect_limit) q.set('prospect_limit', String(params.prospect_limit))
    if (params?.competitor_limit) q.set('competitor_limit', String(params.competitor_limit))
    return get<GeoJSONCollection>(`/map/all${q.toString() ? '?' + q : ''}`)
  },

  feed: (limit = 50) => get<FeedResponse>(`/feed?limit=${limit}`),

  scanTenders: (daysBack = 30) => post<ScanResponse>(`/scan/tenders?days_back=${daysBack}`),
  scanFTS: () => post<ScanResponse>('/scan/fts'),
  scanProspects: (region = 'london') => post<ScanResponse>(`/scan/prospects?region=${region}`),
  scanCompetitors: (region = 'london') => post<ScanResponse>(`/scan/competitors?region=${region}`),
  scanSignals: () => post<ScanResponse>('/scan/signals'),
  scanCrime: () => post<ScanResponse>('/scan/crime'),

  crimeNear: (lat: number, lng: number) => get<CrimeResponse>(`/crime/near?lat=${lat}&lng=${lng}`),
  crimeDensity: (companyNumber: string) => get<CrimeResponse>(`/crime/density/${encodeURIComponent(companyNumber)}`),

  scanHistory: () => get<ScanHistoryResponse>('/scan/history'),

  // Auto-scan schedule
  scanSchedule: () => get<ScanSchedule>('/scan/schedule'),
  toggleScanSchedule: (payload?: { enabled?: boolean; interval_hours?: number }) =>
    post<ScanSchedule>('/scan/schedule', payload),

  // Pipeline CRUD
  createLead: (data: LeadCreatePayload) => post<{ status: string; company_id: string; lead: Record<string, string> }>('/pipeline', data),
  updateLead: (companyId: string, data: LeadUpdatePayload) =>
    fetch(`${BASE}/pipeline/${companyId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).then(r => { if (!r.ok) throw new Error(`API error ${r.status}`); return r.json() }),
  deleteLead: (companyId: string) =>
    fetch(`${BASE}/pipeline/${companyId}`, { method: 'DELETE' })
      .then(r => { if (!r.ok) throw new Error(`API error ${r.status}`); return r.json() }),

  // AI
  aiStatus: () => get<{ available: boolean }>('/ai/status'),
  aiAnalyzeTender: (tender: Record<string, unknown>) => post<{ analysis: string }>('/ai/analyze/tender', tender),
  aiAnalyzeProspect: (prospect: Record<string, unknown>) => post<{ analysis: string }>('/ai/analyze/prospect', prospect),

  // Dossier
  generateDossier: (payload: DossierPayload) => post<DossierResponse>('/dossier/generate', payload),
  // Fetch persisted dossier by company number (or name slug prefixed with 'name_')
  getDossierByCompany: (companyKey: string) =>
    get<DossierResponse>(`/dossier/by-company/${encodeURIComponent(companyKey)}`)
      .catch(() => null as DossierResponse | null),
  listDossiers: () => get<DossierListResponse>('/dossier/list'),
  // Legacy pipeline-lead-based lookup
  getSavedDossier: (companyId: string) =>
    get<DossierResponse>(`/dossier/${companyId}`).catch(() => null as DossierResponse | null),

  // Cross-pollination enrichment badges
  enrichmentBadges: () => get<EnrichmentBadgesResponse>('/entities/enrichment-badges'),

  // Additional scan triggers for System page
  scanGazette: (daysBack = 30) => post<ScanResponse>(`/scan/gazette?days_back=${daysBack}`),
  scanAcs: () => post<ScanResponse>('/scan/acs'),
  scanChEvents: () => post<ScanResponse>('/scan/ch-events'),
}
