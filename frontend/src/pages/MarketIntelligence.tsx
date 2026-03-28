import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, type Prospect, type Competitor } from '../lib/api'
import { PageHeader, LoadingSpinner, EmptyState, Table, Th, Td, Tr, Input, Button } from '../components/ui'
import { formatDate } from '../lib/utils'
import { useDossier } from '../lib/dossier-context'
import {
  Building2, Search, ExternalLink, Globe, MapPin, Hash, Calendar,
  Briefcase, Shield, BookOpen, PlusCircle, CheckCircle2, Eye, X,
  AlertTriangle,
} from 'lucide-react'

// ---- Types ----

interface MergedCompany {
  company_name: string
  company_number: string
  company_type: string
  sic_codes: string
  region: string
  address: string
  status: string
  website_url?: string
  date_of_creation?: string
  entity_type: 'prospect' | 'competitor'
  acs_verified?: boolean
  service_categories?: string[]
  sia_number?: string
  score?: number
  source?: string
}

interface BadgeFlags {
  has_signals: boolean
  has_tenders: boolean
  has_dossier: boolean
  in_pipeline: boolean
  high_crime: boolean
  gazette_alert: boolean
}

// ---- Constants ----

const COMPANY_TYPES = [
  'Facilities Management', 'Hotel', 'Retail', 'Healthcare', 'Education',
  'Construction', 'Warehouse/Logistics', 'Corporate', 'Prime Contractor',
  'Local Authority', 'Venue/Events',
]

const TYPE_COLORS: Record<string, string> = {
  'Facilities Management': '#3b82f6', 'Hotel': '#a855f7', 'Retail': '#ec4899',
  'Healthcare': '#14b8a6', 'Education': '#84cc16', 'Construction': '#f97316',
  'Warehouse/Logistics': '#eab308', 'Corporate': '#06b6d4', 'Prime Contractor': '#ef4444',
  'Local Authority': '#10b981', 'Venue/Events': '#8b5cf6',
}

const SECURITY_TYPES = [
  'Door Supervision', 'Security Guarding', 'Key Holding', 'CCTV', 'Close Protection',
]

const TABS = [
  { key: 'all', label: 'All Companies' },
  { key: 'prospects', label: 'Prospects' },
  { key: 'acs', label: 'Competitors (ACS)' },
  { key: 'competitors', label: 'Competitors (All)' },
  { key: 'pipeline', label: 'In Pipeline' },
]

const SORT_OPTIONS = [
  { value: 'name_asc', label: 'Name A\u2192Z' },
  { value: 'name_desc', label: 'Name Z\u2192A' },
  { value: 'date_desc', label: 'Newest first' },
  { value: 'date_asc', label: 'Oldest first' },
]

// Badge definitions: key, emoji, colour, tooltip
const BADGE_DEFS: Array<{ key: keyof BadgeFlags; emoji: string; color: string; label: string }> = [
  { key: 'has_signals',    emoji: '📡', color: '#3b82f6', label: 'Has signals'      },
  { key: 'has_tenders',    emoji: '📋', color: '#22c55e', label: 'Has tenders'      },
  { key: 'has_dossier',    emoji: '🗂️', color: '#a855f7', label: 'Has dossier'      },
  { key: 'in_pipeline',    emoji: '💼', color: '#f59e0b', label: 'In pipeline'      },
  { key: 'high_crime',     emoji: '🚨', color: '#ef4444', label: 'High crime area'  },
  { key: 'gazette_alert',  emoji: '⚖️', color: '#b91c1c', label: 'Gazette alert'    },
]

function makeCompanyKey(c: { company_number?: string; company_name: string }) {
  return c.company_number?.trim()
    ? c.company_number.trim().toUpperCase()
    : 'name_' + c.company_name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '').slice(0, 80)
}

// ---- Add to Pipeline sub-component ----

function AddToPipeline({ company }: { company: MergedCompany }) {
  const queryClient = useQueryClient()
  const [added, setAdded] = useState(false)
  const [error, setError] = useState('')

  const mutation = useMutation({
    mutationFn: () => api.createLead({
      company_name: company.company_name,
      company_type: company.company_type || '',
      company_number: company.company_number || '',
      sic_codes: company.sic_codes || '',
      region: company.region || '',
      address: company.address || '',
      website_url: company.website_url || '',
      source: 'Market Intelligence',
      status: 'Not Contacted',
      notes: `Imported from Market Intelligence (${company.entity_type}). SIC: ${company.sic_codes || 'N/A'}`,
      next_action: 'Research company and identify decision maker',
    }),
    onSuccess: () => {
      setAdded(true)
      queryClient.invalidateQueries({ queryKey: ['pipeline'] })
      queryClient.invalidateQueries({ queryKey: ['pipeline-ids'] })
      queryClient.invalidateQueries({ queryKey: ['pipeline-stats'] })
    },
    onError: (e: Error) => setError(e.message),
  })

  if (added) {
    return (
      <div className="flex items-center gap-2 justify-center py-2.5 rounded-lg text-xs font-medium w-full"
        style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.3)' }}>
        <CheckCircle2 size={14} /> Added to Pipeline
      </div>
    )
  }

  return (
    <>
      <button onClick={() => mutation.mutate()} disabled={mutation.isPending}
        className="flex items-center gap-2 justify-center py-2.5 rounded-lg text-xs font-medium w-full transition-all"
        style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.3)', opacity: mutation.isPending ? 0.6 : 1 }}>
        <PlusCircle size={14} /> {mutation.isPending ? 'Adding...' : 'Add to Pipeline'}
      </button>
      {error && <p className="text-xs text-center" style={{ color: '#ef4444' }}>{error}</p>}
    </>
  )
}

// ---- Badge row component ----

function BadgeRow({ flags }: { flags: BadgeFlags | undefined }) {
  if (!flags) return null
  const active = BADGE_DEFS.filter(d => flags[d.key])
  if (!active.length) return null
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {active.map(d => (
        <span
          key={d.key}
          title={d.label}
          style={{ fontSize: 14, lineHeight: 1, cursor: 'default' }}
        >
          {d.emoji}
        </span>
      ))}
    </div>
  )
}

// ---- Main Component ----

export default function MarketIntelligence() {
  const { openDossier } = useDossier()

  const [activeTab, setActiveTab] = useState('all')
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [securityFilter, setSecurityFilter] = useState('')
  const [sortBy, setSortBy] = useState('name_asc')
  const [selected, setSelected] = useState<MergedCompany | null>(null)

  const { data: prospectsData, isLoading: pLoading } = useQuery({
    queryKey: ['prospects-all'], queryFn: () => api.prospects({ limit: 500 }), refetchInterval: 120_000,
  })
  const { data: competitorsData, isLoading: cLoading } = useQuery({
    queryKey: ['competitors-all'], queryFn: () => api.competitors({ limit: 500 }), refetchInterval: 120_000,
  })
  const { data: pipelineData } = useQuery({
    queryKey: ['pipeline-ids'], queryFn: () => api.pipeline({ limit: 500 }), refetchInterval: 60_000,
  })

  // Fetch enrichment badges — single call, cached 5 min server-side
  const { data: badgesData } = useQuery({
    queryKey: ['enrichment-badges'],
    queryFn: () => api.enrichmentBadges(),
    refetchInterval: 300_000,
    staleTime: 300_000,
  })

  const isLoading = pLoading || cLoading

  // Merge prospects + competitors
  const allCompanies = useMemo(() => {
    const merged: MergedCompany[] = []
    const seen = new Set<string>()

    ;(prospectsData?.prospects || []).forEach(p => {
      const key = p.company_number || p.company_name
      if (seen.has(key)) return; seen.add(key)
      merged.push({ ...p, entity_type: 'prospect', website_url: p.website_url })
    })

    ;(competitorsData?.competitors || []).forEach(c => {
      const key = c.company_number || c.company_name
      if (seen.has(key)) return; seen.add(key)
      const raw = c as any
      let cats: string[] = []
      try {
        const sc = raw.service_categories_parsed || raw.service_categories
        if (Array.isArray(sc)) cats = sc
        else if (typeof sc === 'string') cats = JSON.parse(sc)
      } catch {}
      merged.push({
        ...c, entity_type: 'competitor', company_type: raw.company_type || '',
        website_url: raw.website_url || '', acs_verified: raw.acs_verified || false,
        service_categories: cats, sia_number: raw.sia_number || '',
      })
    })
    return merged
  }, [prospectsData, competitorsData])

  // Pipeline lookup (for tab filter only — badges come from API)
  const pipelineKeys = useMemo(() => {
    const s = new Set<string>()
    ;(pipelineData?.leads || []).forEach(l => {
      if (l.company_number) s.add(l.company_number)
      if (l.company_name) s.add(l.company_name.toLowerCase())
    }); return s
  }, [pipelineData])

  // Filtered + sorted
  const filtered = useMemo(() => {
    let rows = [...allCompanies]
    switch (activeTab) {
      case 'prospects': rows = rows.filter(r => r.entity_type === 'prospect'); break
      case 'acs': rows = rows.filter(r => r.entity_type === 'competitor' && r.acs_verified); break
      case 'competitors': rows = rows.filter(r => r.entity_type === 'competitor'); break
      case 'pipeline': rows = rows.filter(r => pipelineKeys.has(r.company_number) || pipelineKeys.has(r.company_name.toLowerCase())); break
    }
    if (typeFilter) rows = rows.filter(r => r.company_type === typeFilter)
    if (securityFilter) rows = rows.filter(r => r.service_categories?.some(sc => sc.toLowerCase().includes(securityFilter.toLowerCase())))
    if (search) {
      const q = search.toLowerCase()
      rows = rows.filter(r => r.company_name?.toLowerCase().includes(q) || r.company_number?.toLowerCase().includes(q) || r.sic_codes?.toLowerCase().includes(q) || r.region?.toLowerCase().includes(q))
    }
    rows.sort((a, b) => {
      switch (sortBy) {
        case 'name_asc': return (a.company_name || '').localeCompare(b.company_name || '')
        case 'name_desc': return (b.company_name || '').localeCompare(a.company_name || '')
        case 'date_desc': return (b.date_of_creation || '').localeCompare(a.date_of_creation || '')
        case 'date_asc': return (a.date_of_creation || '').localeCompare(b.date_of_creation || '')
        default: return 0
      }
    })
    return rows
  }, [allCompanies, activeTab, typeFilter, securityFilter, search, sortBy, pipelineKeys])

  // Sidebar counts
  const typeCounts = useMemo(() => {
    let base = allCompanies
    switch (activeTab) {
      case 'prospects': base = base.filter(r => r.entity_type === 'prospect'); break
      case 'acs': base = base.filter(r => r.entity_type === 'competitor' && r.acs_verified); break
      case 'competitors': base = base.filter(r => r.entity_type === 'competitor'); break
      case 'pipeline': base = base.filter(r => pipelineKeys.has(r.company_number) || pipelineKeys.has(r.company_name.toLowerCase())); break
    }
    const c: Record<string, number> = {}
    COMPANY_TYPES.forEach(t => { c[t] = base.filter(r => r.company_type === t).length })
    return c
  }, [allCompanies, activeTab, pipelineKeys])

  const securityCounts = useMemo(() => {
    const comps = allCompanies.filter(r => r.entity_type === 'competitor')
    const c: Record<string, number> = {}
    SECURITY_TYPES.forEach(st => { c[st] = comps.filter(r => r.service_categories?.some(sc => sc.toLowerCase().includes(st.toLowerCase()))).length })
    return c
  }, [allCompanies])

  const getBadges = (c: MergedCompany): BadgeFlags | undefined =>
    badgesData ? badgesData[c.company_number] : undefined

  const typeColor = selected ? (TYPE_COLORS[selected.company_type || ''] || '#6b7280') : '#6b7280'

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <PageHeader
        title="MARKET INTELLIGENCE"
        subtitle={isLoading ? 'Loading...' : `${allCompanies.length} companies \u00B7 ${prospectsData?.total || 0} prospects \u00B7 ${competitorsData?.total || 0} competitors`}
      />

      {/* Tabs */}
      <div className="flex items-center gap-0 px-6 border-b flex-shrink-0" style={{ borderColor: '#1f2937', background: '#0d1117' }}>
        {TABS.map(tab => (
          <button key={tab.key} onClick={() => { setActiveTab(tab.key); setSelected(null) }}
            className="px-4 py-2.5 text-xs font-medium transition-colors relative"
            style={{ color: activeTab === tab.key ? '#f9fafb' : '#6b7280' }}>
            {tab.label}
            {activeTab === tab.key && <div className="absolute bottom-0 left-0 right-0 h-0.5" style={{ background: '#3b82f6' }} />}
          </button>
        ))}
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar */}
        <div className="flex-shrink-0 border-r p-4 space-y-4 overflow-y-auto" style={{ width: 220, background: '#0d1117', borderColor: '#1f2937' }}>
          <div>
            <p className="text-xs uppercase tracking-wider mb-2" style={{ color: '#6b7280' }}>Company Type</p>
            <div className="space-y-0.5">
              <button onClick={() => setTypeFilter('')}
                className="w-full text-left px-2 py-1.5 rounded text-xs flex items-center justify-between"
                style={{ background: !typeFilter ? 'rgba(59,130,246,0.15)' : 'transparent', color: !typeFilter ? '#3b82f6' : '#9ca3af' }}>
                All Types <span className="font-mono opacity-60">{filtered.length}</span>
              </button>
              {COMPANY_TYPES.map(type => {
                const color = TYPE_COLORS[type] || '#6b7280'
                const count = typeCounts[type] || 0
                if (count === 0 && typeFilter !== type) return null
                return (
                  <button key={type} onClick={() => setTypeFilter(typeFilter === type ? '' : type)}
                    className="w-full text-left px-2 py-1.5 rounded text-xs flex items-center justify-between gap-1"
                    style={{ background: typeFilter === type ? color + '22' : 'transparent', color: typeFilter === type ? color : '#9ca3af' }}>
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
                      {type}
                    </span>
                    <span className="font-mono opacity-60">{count}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {(activeTab === 'acs' || activeTab === 'competitors' || activeTab === 'all') && (
            <div>
              <p className="text-xs uppercase tracking-wider mb-2" style={{ color: '#6b7280' }}>Security Services</p>
              <div className="space-y-0.5">
                {SECURITY_TYPES.map(st => (
                  <button key={st} onClick={() => setSecurityFilter(securityFilter === st ? '' : st)}
                    className="w-full text-left px-2 py-1.5 rounded text-xs flex items-center justify-between"
                    style={{ background: securityFilter === st ? 'rgba(239,68,68,0.15)' : 'transparent', color: securityFilter === st ? '#ef4444' : '#9ca3af' }}>
                    {st} <span className="font-mono opacity-60">{securityCounts[st] || 0}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <p className="text-xs uppercase tracking-wider mb-2" style={{ color: '#6b7280' }}>Sort</p>
            <select value={sortBy} onChange={e => setSortBy(e.target.value)}
              className="w-full text-xs rounded px-2 py-1.5 border"
              style={{ background: '#1f2937', color: '#f9fafb', borderColor: '#374151' }}>
              {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </div>

        {/* Main table */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-3 border-b flex-shrink-0" style={{ borderColor: '#1f2937', background: '#0d1117' }}>
            <div className="relative flex-1 max-w-md">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: '#6b7280' }} />
              <Input placeholder="Search companies..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 w-full" />
            </div>
            <span className="text-xs" style={{ color: '#6b7280' }}>{filtered.length} results</span>
          </div>

          <div className="flex-1 overflow-y-auto">
            {isLoading ? <LoadingSpinner /> : !filtered.length ? (
              <EmptyState icon={<Building2 size={32} />} title="No companies found" description="Adjust filters or run a scan" />
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Company Name</Th>
                    <Th>Type</Th>
                    <Th>Region</Th>
                    <Th>Status</Th>
                    <Th>Incorporated</Th>
                    <Th>Indicators</Th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.slice(0, 200).map((c, i) => {
                    const isActive = c.status?.toLowerCase().trim() === 'active'
                    const entityColor = c.entity_type === 'competitor' ? '#ef4444' : '#22c55e'
                    const flags = getBadges(c)
                    return (
                      <Tr key={c.company_number || i} onClick={() => setSelected(c)}
                        style={{ background: selected?.company_number === c.company_number && selected?.company_name === c.company_name ? 'rgba(59,130,246,0.08)' : undefined }}>
                        <Td>
                          <div className="flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: entityColor }} />
                            <div>
                              <p className="text-sm font-medium" style={{ color: '#f9fafb' }}>{c.company_name}</p>
                              {c.company_number && <p className="text-xs font-mono" style={{ color: '#374151' }}>CH#{c.company_number}</p>}
                            </div>
                          </div>
                        </Td>
                        <Td>
                          <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: (TYPE_COLORS[c.company_type] || '#6b7280') + '20', color: TYPE_COLORS[c.company_type] || '#6b7280' }}>
                            {c.company_type || c.entity_type}
                          </span>
                        </Td>
                        <Td><span className="text-xs">{c.region || '-'}</span></Td>
                        <Td>
                          <span className="text-xs px-1.5 py-0.5 rounded"
                            style={{ background: isActive ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', color: isActive ? '#22c55e' : '#ef4444' }}>
                            {c.status || 'Unknown'}
                          </span>
                        </Td>
                        <Td><span className="text-xs">{formatDate(c.date_of_creation)}</span></Td>
                        <Td>
                          <BadgeRow flags={flags} />
                          {/* ACS badge (local, not from API) */}
                          {c.acs_verified && (
                            <span title="ACS Verified" style={{ fontSize: 14 }}>{'\u2705'}</span>
                          )}
                        </Td>
                      </Tr>
                    )
                  })}
                </tbody>
              </Table>
            )}
          </div>
        </div>

        {/* Right inspect panel */}
        <div className="flex-shrink-0 border-l overflow-y-auto" style={{ width: 380, background: '#0d1117', borderColor: '#1f2937' }}>
          {selected ? (
            <>
              <div className="flex items-start justify-between p-4 border-b" style={{ borderColor: '#1f2937' }}>
                <div className="flex-1 min-w-0 mr-2">
                  <h3 className="text-sm font-bold" style={{ color: '#f9fafb' }}>{selected.company_name}</h3>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className="text-xs px-1.5 py-0.5 rounded"
                      style={{ background: typeColor + '20', color: typeColor, border: '1px solid ' + typeColor + '40' }}>
                      {selected.entity_type === 'competitor' ? 'Competitor' : 'Prospect'}
                    </span>
                    {selected.acs_verified && (
                      <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.3)' }}>
                        {'\u2705'} ACS Verified
                      </span>
                    )}
                  </div>
                </div>
                <button onClick={() => setSelected(null)} className="p-1.5 rounded-lg hover:bg-white/10" style={{ color: '#6b7280' }}>
                  <X size={14} />
                </button>
              </div>

              {/* Gazette alert warning banner */}
              {getBadges(selected)?.gazette_alert && (
                <div className="mx-4 mt-3 flex items-start gap-2 rounded-lg px-3 py-2.5"
                  style={{ background: 'rgba(185,28,28,0.15)', border: '1px solid rgba(185,28,28,0.4)', color: '#fca5a5' }}>
                  <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
                  <p className="text-xs font-medium">Gazette insolvency notice detected for this company.</p>
                </div>
              )}

              {/* Prominent badge strip */}
              {getBadges(selected) && (
                <div className="px-4 pt-3">
                  <p className="text-xs uppercase tracking-wider mb-2" style={{ color: '#6b7280' }}>Intelligence Flags</p>
                  <div className="flex flex-wrap gap-2">
                    {BADGE_DEFS.map(d => {
                      const flags = getBadges(selected)!
                      if (!flags[d.key]) return null
                      return (
                        <span key={d.key}
                          className="flex items-center gap-1 text-xs px-2 py-1 rounded-full"
                          style={{ background: d.color + '20', color: d.color, border: '1px solid ' + d.color + '40' }}>
                          <span style={{ fontSize: 12 }}>{d.emoji}</span>
                          {d.label}
                        </span>
                      )
                    })}
                  </div>
                </div>
              )}

              <div className="p-4 space-y-4">
                {/* Details */}
                <div>
                  <p className="text-xs uppercase tracking-wider mb-2" style={{ color: '#6b7280' }}>Details</p>
                  <div className="space-y-2.5">
                    {selected.company_number && (
                      <div className="flex items-start gap-3">
                        <Hash size={13} className="flex-shrink-0 mt-0.5" style={{ color: '#374151' }} />
                        <div>
                          <p className="text-xs" style={{ color: '#6b7280' }}>Company Number</p>
                          <p className="text-xs font-mono mt-0.5" style={{ color: '#f9fafb' }}>{selected.company_number}</p>
                        </div>
                      </div>
                    )}
                    {selected.sic_codes && (
                      <div className="flex items-start gap-3">
                        <Briefcase size={13} className="flex-shrink-0 mt-0.5" style={{ color: '#374151' }} />
                        <div>
                          <p className="text-xs" style={{ color: '#6b7280' }}>SIC Codes</p>
                          <p className="text-xs font-mono mt-0.5" style={{ color: '#f9fafb' }}>{selected.sic_codes}</p>
                        </div>
                      </div>
                    )}
                    {selected.address && (
                      <div className="flex items-start gap-3">
                        <MapPin size={13} className="flex-shrink-0 mt-0.5" style={{ color: '#374151' }} />
                        <div>
                          <p className="text-xs" style={{ color: '#6b7280' }}>Address</p>
                          <p className="text-xs mt-0.5" style={{ color: '#f9fafb' }}>{selected.address}</p>
                        </div>
                      </div>
                    )}
                    {selected.region && (
                      <div className="flex items-start gap-3">
                        <Globe size={13} className="flex-shrink-0 mt-0.5" style={{ color: '#374151' }} />
                        <div>
                          <p className="text-xs" style={{ color: '#6b7280' }}>Region</p>
                          <p className="text-xs mt-0.5" style={{ color: '#f9fafb' }}>{selected.region}</p>
                        </div>
                      </div>
                    )}
                    {selected.date_of_creation && (
                      <div className="flex items-start gap-3">
                        <Calendar size={13} className="flex-shrink-0 mt-0.5" style={{ color: '#374151' }} />
                        <div>
                          <p className="text-xs" style={{ color: '#6b7280' }}>Incorporated</p>
                          <p className="text-xs mt-0.5" style={{ color: '#f9fafb' }}>{formatDate(selected.date_of_creation)}</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Competitor-specific: service categories + SIA */}
                {selected.entity_type === 'competitor' && (selected.service_categories?.length || selected.sia_number) && (
                  <div>
                    <p className="text-xs uppercase tracking-wider mb-2" style={{ color: '#6b7280' }}>Security Profile</p>
                    <div className="rounded-lg p-3" style={{ background: '#111827', border: '1px solid #1f2937' }}>
                      {selected.service_categories && selected.service_categories.length > 0 && (
                        <div className="mb-2">
                          <p className="text-xs mb-1" style={{ color: '#6b7280' }}>Services</p>
                          <div className="flex flex-wrap gap-1">
                            {selected.service_categories.map((sc, i) => (
                              <span key={i} className="text-xs px-1.5 py-0.5 rounded"
                                style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)' }}>
                                {sc}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {selected.sia_number && (
                        <div>
                          <p className="text-xs" style={{ color: '#6b7280' }}>SIA Number</p>
                          <p className="text-xs font-mono mt-0.5" style={{ color: '#f9fafb' }}>{selected.sia_number}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div>
                  <p className="text-xs uppercase tracking-wider mb-2" style={{ color: '#6b7280' }}>Actions</p>
                  <div className="space-y-2">
                    <AddToPipeline company={selected} />

                    <button
                      onClick={() => openDossier(makeCompanyKey(selected), selected.company_name, selected.company_number, selected.entity_type, selected.region)}
                      className="flex items-center gap-2 justify-center py-2.5 rounded-lg text-xs font-medium w-full transition-all"
                      style={{ background: 'rgba(59,130,246,0.15)', color: '#3b82f6', border: '1px solid rgba(59,130,246,0.3)' }}>
                      <BookOpen size={14} /> View Dossier
                    </button>

                    {/* View Signals link if has_signals badge */}
                    {getBadges(selected)?.has_signals && (
                      <a href="/signals"
                        className="flex items-center gap-2 justify-center py-2.5 rounded-lg text-xs font-medium w-full"
                        style={{ background: 'rgba(59,130,246,0.1)', color: '#60a5fa', border: '1px solid rgba(59,130,246,0.2)' }}>
                        <span style={{ fontSize: 13 }}>📡</span> View Signals
                      </a>
                    )}

                    {selected.company_number && (
                      <a href={`https://find-and-update.company-information.service.gov.uk/company/${selected.company_number}`}
                        target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-2 justify-center py-2.5 rounded-lg text-xs font-medium w-full"
                        style={{ background: 'rgba(59,130,246,0.1)', color: '#60a5fa', border: '1px solid rgba(59,130,246,0.2)' }}>
                        <Briefcase size={14} /> Companies House
                      </a>
                    )}

                    {selected.company_name && (
                      <a href={`https://www.linkedin.com/search/results/companies/?keywords=${encodeURIComponent(selected.company_name)}`}
                        target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-2 justify-center py-2.5 rounded-lg text-xs font-medium w-full"
                        style={{ background: 'rgba(10,102,194,0.15)', color: '#60a5fa', border: '1px solid rgba(10,102,194,0.3)' }}>
                        <ExternalLink size={14} /> LinkedIn Search
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-full p-8 text-center">
              <Building2 size={32} style={{ color: '#374151', marginBottom: 12 }} />
              <p className="text-sm font-medium" style={{ color: '#4b5563' }}>Select a company</p>
              <p className="text-xs mt-1" style={{ color: '#374151' }}>Click any row to view details</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
