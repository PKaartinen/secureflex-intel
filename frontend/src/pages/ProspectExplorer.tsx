import { useState, useMemo, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, type Prospect } from '../lib/api'
import { Card, Button, PageHeader, LoadingSpinner, EmptyState, Table, Th, Td, Tr, Input } from '../components/ui'
import { formatDate, formatRelativeTime } from '../lib/utils'
import { Building2, Play, ExternalLink, Search, ChevronLeft, ChevronRight, SlidersHorizontal, X, Globe, MapPin, Hash, Calendar, Briefcase, Shield, FileText, PlusCircle, Sparkles, CheckCircle2, BookOpen, Loader2 } from 'lucide-react'
import ReactMarkdown from 'react-markdown'

const COMPANY_TYPES = [
  'All',
  'Facilities Management',
  'Hotel',
  'Retail',
  'Healthcare',
  'Education',
  'Construction',
  'Warehouse/Logistics',
  'Corporate',
  'Prime Contractor',
  'Local Authority',
  'Venue/Events',
]

const TYPE_COLORS: Record<string, string> = {
  'Facilities Management': '#3b82f6',
  'Hotel':                 '#a855f7',
  'Retail':                '#ec4899',
  'Healthcare':            '#14b8a6',
  'Education':             '#84cc16',
  'Construction':          '#f97316',
  'Warehouse/Logistics':   '#eab308',
  'Corporate':             '#06b6d4',
  'Prime Contractor':      '#ef4444',
  'Local Authority':       '#10b981',
  'Venue/Events':          '#8b5cf6',
}

const SORT_OPTIONS = [
  { value: 'company_name_asc', label: 'Name A→Z' },
  { value: 'company_name_desc', label: 'Name Z→A' },
  { value: 'date_desc', label: 'Newest first' },
  { value: 'date_asc', label: 'Oldest first' },
  { value: 'score_desc', label: 'Score high→low' },
  { value: 'score_asc', label: 'Score low→high' },
]

const REGIONS = ['All Regions', 'London', 'South East', 'South West', 'Midlands', 'North West', 'North East', 'Yorkshire', 'Scotland', 'Wales', 'Unknown']
const STATUSES = ['All', 'Active', 'Dissolved', 'Liquidation', 'Administration']

export default function ProspectExplorer() {
  const queryClient = useQueryClient()
  const [companyType, setCompanyType] = useState('')
  const [search, setSearch] = useState('')
  const [region, setRegion] = useState('')
  const [status, setStatus] = useState('')
  const [sortBy, setSortBy] = useState('company_name_asc')
  const [minScore, setMinScore] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [offset, setOffset] = useState(0)
  const [selectedProspect, setSelectedProspect] = useState<Prospect | null>(null)
  const limit = 50

  const { data, isLoading } = useQuery({
    queryKey: ['prospects', companyType, offset],
    queryFn: () => api.prospects({ company_type: companyType || undefined, limit, offset }),
    refetchInterval: 120_000,
  })

  const scan = useMutation({
    mutationFn: () => api.scanProspects(),
    onSuccess: () => {
      setTimeout(() => queryClient.invalidateQueries({ queryKey: ['prospects'] }), 3000)
    },
  })

  const prospects = useMemo(() => {
    let rows = data?.prospects || []

    // Text search
    if (search) {
      const q = search.toLowerCase()
      rows = rows.filter(p =>
        p.company_name?.toLowerCase().includes(q) ||
        p.sic_codes?.toLowerCase().includes(q) ||
        p.company_number?.toLowerCase().includes(q)
      )
    }

    // Region filter
    if (region && region !== 'All Regions') {
      rows = rows.filter(p => p.region?.toLowerCase().includes(region.toLowerCase()))
    }

    // Status filter
    if (status && status !== 'All') {
      rows = rows.filter(p => p.status?.toLowerCase() === status.toLowerCase())
    }

    // Min score filter
    if (minScore) {
      const min = parseInt(minScore, 10)
      rows = rows.filter(p => (p.score || 0) >= min)
    }

    // Sort
    rows = [...rows].sort((a, b) => {
      switch (sortBy) {
        case 'company_name_asc': return (a.company_name || '').localeCompare(b.company_name || '')
        case 'company_name_desc': return (b.company_name || '').localeCompare(a.company_name || '')
        case 'date_desc': return (b.date_of_creation || '').localeCompare(a.date_of_creation || '')
        case 'date_asc': return (a.date_of_creation || '').localeCompare(b.date_of_creation || '')
        case 'score_desc': return (b.score || 0) - (a.score || 0)
        case 'score_asc': return (a.score || 0) - (b.score || 0)
        default: return 0
      }
    })

    return rows
  }, [data, search, region, status, sortBy, minScore])

  const totalPages = Math.ceil((data?.total || 0) / limit)
  const currentPage = Math.floor(offset / limit) + 1

  const activeFilterCount = [companyType, region && region !== 'All Regions', status && status !== 'All', minScore].filter(Boolean).length

  // Type count breakdown for sidebar
  const typeCounts = useMemo(() => {
    const all = data?.prospects || []
    return COMPANY_TYPES.slice(1).reduce<Record<string, number>>((acc, t) => {
      acc[t] = all.filter(p => p.company_type === t).length
      return acc
    }, {})
  }, [data])

  const typeColor = selectedProspect ? (TYPE_COLORS[selectedProspect.company_type || ''] || '#6b7280') : '#6b7280'

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <PageHeader
        title="PROSPECT EXPLORER"
        subtitle={data ? `${data.total} companies · Last scan: ${formatRelativeTime(data.last_scan)}` : 'Loading...'}
        actions={
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant={showFilters ? 'primary' : 'ghost'}
              onClick={() => setShowFilters(v => !v)}
            >
              <SlidersHorizontal size={12} />
              Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
            </Button>
            <Button size="sm" variant="primary" loading={scan.isPending} onClick={() => scan.mutate()}>
              <Play size={12} />
              Run Scan
            </Button>
          </div>
        }
      />

      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar — company type */}
        <div
          className="flex-shrink-0 border-r p-4 space-y-4 overflow-y-auto"
          style={{ width: 200, background: '#0d1117', borderColor: '#1f2937' }}
        >
          <div>
            <p className="text-xs uppercase tracking-wider mb-2" style={{ color: '#6b7280' }}>Company Type</p>
            <div className="space-y-0.5">
              {COMPANY_TYPES.map(type => {
                const active = (type === 'All' && !companyType) || companyType === type
                const color = TYPE_COLORS[type] || '#6b7280'
                const count = type === 'All' ? (data?.total || 0) : (typeCounts[type] || 0)
                return (
                  <button
                    key={type}
                    onClick={() => { setCompanyType(type === 'All' ? '' : type); setOffset(0) }}
                    className="w-full text-left px-2 py-1.5 rounded text-xs transition-colors flex items-center justify-between gap-1"
                    style={{
                      background: active ? `${color}22` : 'transparent',
                      color: active ? color : '#9ca3af',
                    }}
                  >
                    <span className="flex items-center gap-1.5">
                      {type !== 'All' && (
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
                      )}
                      {type}
                    </span>
                    {count > 0 && (
                      <span className="text-xs font-mono opacity-60">{count}</span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {/* Main content — table */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Advanced filter bar */}
          {showFilters && (
            <div
              className="flex-shrink-0 border-b px-6 py-3 flex flex-wrap items-center gap-3"
              style={{ background: '#111827', borderColor: '#1f2937' }}
            >
              {/* Region */}
              <div className="flex items-center gap-2">
                <label className="text-xs" style={{ color: '#6b7280' }}>Region</label>
                <select
                  value={region}
                  onChange={e => { setRegion(e.target.value); setOffset(0) }}
                  className="text-xs rounded px-2 py-1 border"
                  style={{ background: '#1f2937', color: '#f9fafb', borderColor: '#374151' }}
                >
                  {REGIONS.map(r => <option key={r} value={r === 'All Regions' ? '' : r}>{r}</option>)}
                </select>
              </div>

              {/* Status */}
              <div className="flex items-center gap-2">
                <label className="text-xs" style={{ color: '#6b7280' }}>Status</label>
                <select
                  value={status}
                  onChange={e => { setStatus(e.target.value); setOffset(0) }}
                  className="text-xs rounded px-2 py-1 border"
                  style={{ background: '#1f2937', color: '#f9fafb', borderColor: '#374151' }}
                >
                  {STATUSES.map(s => <option key={s} value={s === 'All' ? '' : s}>{s}</option>)}
                </select>
              </div>

              {/* Sort */}
              <div className="flex items-center gap-2">
                <label className="text-xs" style={{ color: '#6b7280' }}>Sort</label>
                <select
                  value={sortBy}
                  onChange={e => setSortBy(e.target.value)}
                  className="text-xs rounded px-2 py-1 border"
                  style={{ background: '#1f2937', color: '#f9fafb', borderColor: '#374151' }}
                >
                  {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>

              {/* Min score */}
              <div className="flex items-center gap-2">
                <label className="text-xs" style={{ color: '#6b7280' }}>Min Score</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  placeholder="0"
                  value={minScore}
                  onChange={e => { setMinScore(e.target.value); setOffset(0) }}
                  className="text-xs rounded px-2 py-1 border w-16"
                  style={{ background: '#1f2937', color: '#f9fafb', borderColor: '#374151' }}
                />
              </div>

              {/* Clear all */}
              {activeFilterCount > 0 && (
                <button
                  onClick={() => { setRegion(''); setStatus(''); setMinScore(''); setSortBy('company_name_asc') }}
                  className="flex items-center gap-1 text-xs px-2 py-1 rounded"
                  style={{ color: '#ef4444', background: 'rgba(239,68,68,0.1)' }}
                >
                  <X size={10} /> Clear filters
                </button>
              )}
            </div>
          )}

          {/* Search + pagination info */}
          <div className="flex items-center gap-3 px-6 pt-4 pb-2 flex-shrink-0">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: '#6b7280' }} />
              <Input
                placeholder="Search name, SIC, CH#..."
                value={search}
                onChange={e => { setSearch(e.target.value); setOffset(0) }}
                className="pl-9 w-72"
              />
            </div>
            <span className="text-xs" style={{ color: '#6b7280' }}>
              {prospects.length} results · Page {currentPage} of {totalPages || 1} · click row to inspect
            </span>
          </div>

          {/* Table */}
          <div className="flex-1 overflow-y-auto px-6 pb-4">
            {isLoading ? (
              <LoadingSpinner />
            ) : !prospects.length ? (
              <EmptyState
                icon={<Building2 size={32} />}
                title="No prospects found"
                description="Run a scan to discover prospect companies, or adjust your filters"
              />
            ) : (
              <Card className="overflow-hidden">
                <Table>
                  <thead>
                    <tr>
                      <Th>Company Name</Th>
                      <Th>Type</Th>
                      <Th>SIC Code</Th>
                      <Th>Region</Th>
                      <Th>Status</Th>
                      <Th>Incorporated</Th>
                      <Th>Actions</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {prospects.map((prospect, i) => {
                      const tColor = TYPE_COLORS[prospect.company_type || ''] || '#6b7280'
                      const isSelected = selectedProspect?.company_number === prospect.company_number && selectedProspect?.company_name === prospect.company_name
                      return (
                        <Tr
                          key={i}
                          onClick={() => setSelectedProspect(prospect)}
                          style={isSelected ? { background: 'rgba(59,130,246,0.08)' } : {}}
                        >
                          <Td>
                            <div>
                              <p className="text-sm font-medium" style={{ color: '#f9fafb' }}>{prospect.company_name}</p>
                              {prospect.company_number && (
                                <p className="text-xs font-mono" style={{ color: '#374151' }}>CH#{prospect.company_number}</p>
                              )}
                            </div>
                          </Td>
                          <Td>
                            <span
                              className="text-xs px-2 py-0.5 rounded"
                              style={{
                                background: `${tColor}18`,
                                color: tColor,
                                border: `1px solid ${tColor}33`,
                              }}
                            >
                              {prospect.company_type || 'Unknown'}
                            </span>
                          </Td>
                          <Td><span className="text-xs font-mono" style={{ color: '#6b7280' }}>{prospect.sic_codes?.split(';')[0]?.trim()}</span></Td>
                          <Td><span className="text-xs">{prospect.region}</span></Td>
                          <Td>
                            <span
                              className="text-xs px-1.5 py-0.5 rounded"
                              style={{
                                background: prospect.status === 'Active' ? 'rgba(34,197,94,0.1)' : 'rgba(107,114,128,0.1)',
                                color: prospect.status === 'Active' ? '#22c55e' : '#6b7280',
                              }}
                            >
                              {prospect.status || 'Unknown'}
                            </span>
                          </Td>
                          <Td><span className="text-xs">{formatDate(prospect.date_of_creation)}</span></Td>
                          <Td>
                            <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                              {prospect.company_number && (
                                <a
                                  href={`https://find-and-update.company-information.service.gov.uk/company/${prospect.company_number}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  title="View on Companies House"
                                >
                                  <ExternalLink size={12} style={{ color: '#3b82f6' }} />
                                </a>
                              )}
                              {prospect.company_name && (
                                <a
                                  href={`https://www.linkedin.com/search/results/companies/?keywords=${encodeURIComponent(prospect.company_name)}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  title="Search on LinkedIn"
                                  className="text-xs px-1.5 py-0.5 rounded"
                                  style={{ background: 'rgba(10,102,194,0.2)', color: '#60a5fa' }}
                                >
                                  LI
                                </a>
                              )}
                            </div>
                          </Td>
                        </Tr>
                      )
                    })}
                  </tbody>
                </Table>
              </Card>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-3 mt-4">
                <Button size="sm" variant="ghost" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - limit))}>
                  <ChevronLeft size={14} /> Prev
                </Button>
                <span className="text-xs" style={{ color: '#6b7280' }}>{currentPage} / {totalPages}</span>
                <Button size="sm" variant="ghost" disabled={offset + limit >= (data?.total || 0)} onClick={() => setOffset(offset + limit)}>
                  Next <ChevronRight size={14} />
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Right: Inspect panel — always visible, shows placeholder when nothing selected */}
        <div
          className="flex-shrink-0 border-l flex flex-col overflow-hidden"
          style={{ width: 380, borderColor: '#1f2937', background: '#0d1117' }}
        >
          {selectedProspect ? (
            <>
              {/* Detail header */}
              <div className="flex items-start justify-between px-5 py-4 border-b flex-shrink-0" style={{ borderColor: '#1f2937' }}>
                <div className="flex-1 min-w-0 pr-3">
                  <div className="mb-1.5">
                    <span
                      className="text-xs px-2 py-0.5 rounded"
                      style={{
                        background: `${typeColor}22`,
                        color: typeColor,
                        border: `1px solid ${typeColor}33`,
                      }}
                    >
                      {selectedProspect.company_type || 'Unknown'}
                    </span>
                  </div>
                  <h3 className="text-sm font-semibold leading-snug" style={{ color: '#f9fafb' }}>
                    {selectedProspect.company_name}
                  </h3>
                  {selectedProspect.company_number && (
                    <p className="text-xs font-mono mt-0.5" style={{ color: '#6b7280' }}>
                      CH#{selectedProspect.company_number}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => setSelectedProspect(null)}
                  className="flex-shrink-0 text-xs px-2 py-1 rounded"
                  style={{ color: '#6b7280', background: 'rgba(255,255,255,0.05)' }}
                >
                  ✕
                </button>
              </div>

              {/* Detail body */}
              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                {/* Key metrics */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg p-3" style={{ background: '#111827', border: '1px solid #1f2937' }}>
                    <p className="text-xs uppercase tracking-wider mb-1" style={{ color: '#6b7280' }}>Status</p>
                    <p className="text-sm font-medium" style={{
                      color: selectedProspect.status === 'Active' ? '#22c55e' :
                             selectedProspect.status === 'Dissolved' ? '#ef4444' : '#f59e0b'
                    }}>
                      {selectedProspect.status || 'Unknown'}
                    </p>
                  </div>
                  <div className="rounded-lg p-3" style={{ background: '#111827', border: '1px solid #1f2937' }}>
                    <p className="text-xs uppercase tracking-wider mb-1" style={{ color: '#6b7280' }}>Score</p>
                    {selectedProspect.score ? (
                      <p className="text-sm font-bold" style={{
                        color: selectedProspect.score >= 70 ? '#22c55e' :
                               selectedProspect.score >= 40 ? '#f59e0b' : '#6b7280'
                      }}>
                        {selectedProspect.score}/100
                      </p>
                    ) : (
                      <p className="text-sm" style={{ color: '#374151' }}>N/A</p>
                    )}
                  </div>
                  <div className="rounded-lg p-3" style={{ background: '#111827', border: '1px solid #1f2937' }}>
                    <p className="text-xs uppercase tracking-wider mb-1" style={{ color: '#6b7280' }}>Region</p>
                    <p className="text-sm font-medium" style={{ color: '#f9fafb' }}>
                      {selectedProspect.region || 'Unknown'}
                    </p>
                  </div>
                  <div className="rounded-lg p-3" style={{ background: '#111827', border: '1px solid #1f2937' }}>
                    <p className="text-xs uppercase tracking-wider mb-1" style={{ color: '#6b7280' }}>Incorporated</p>
                    <p className="text-sm font-medium" style={{ color: '#f9fafb' }}>
                      {formatDate(selectedProspect.date_of_creation) || 'Unknown'}
                    </p>
                  </div>
                </div>

                {/* Company details */}
                <div>
                  <p className="text-xs uppercase tracking-wider mb-2" style={{ color: '#6b7280' }}>Company Details</p>
                  <div className="space-y-2.5">
                    {selectedProspect.sic_codes && (
                      <div className="flex items-start gap-3">
                        <Hash size={13} className="flex-shrink-0 mt-0.5" style={{ color: '#374151' }} />
                        <div>
                          <p className="text-xs" style={{ color: '#6b7280' }}>SIC Codes</p>
                          <p className="text-xs font-mono mt-0.5" style={{ color: '#f9fafb' }}>
                            {selectedProspect.sic_codes}
                          </p>
                        </div>
                      </div>
                    )}
                    {selectedProspect.address && (
                      <div className="flex items-start gap-3">
                        <MapPin size={13} className="flex-shrink-0 mt-0.5" style={{ color: '#374151' }} />
                        <div>
                          <p className="text-xs" style={{ color: '#6b7280' }}>Registered Address</p>
                          <p className="text-xs mt-0.5" style={{ color: '#f9fafb' }}>
                            {selectedProspect.address}
                          </p>
                        </div>
                      </div>
                    )}
                    {selectedProspect.source && (
                      <div className="flex items-start gap-3">
                        <FileText size={13} className="flex-shrink-0 mt-0.5" style={{ color: '#374151' }} />
                        <div>
                          <p className="text-xs" style={{ color: '#6b7280' }}>Source</p>
                          <p className="text-xs mt-0.5" style={{ color: '#f9fafb' }}>
                            {selectedProspect.source}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Security opportunity assessment */}
                <div>
                  <p className="text-xs uppercase tracking-wider mb-2" style={{ color: '#6b7280' }}>Security Opportunity</p>
                  <div
                    className="rounded-lg p-3"
                    style={{ background: '#111827', border: '1px solid #1f2937' }}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <Shield size={14} style={{ color: typeColor }} />
                      <span className="text-xs font-medium" style={{ color: typeColor }}>
                        {selectedProspect.company_type || 'General'} Sector
                      </span>
                    </div>
                    <p className="text-xs leading-relaxed" style={{ color: '#9ca3af' }}>
                      {getSecurityInsight(selectedProspect.company_type, selectedProspect.status)}
                    </p>
                  </div>
                </div>

                {/* AI Analysis */}
                <ProspectAIAnalysis prospect={selectedProspect} />

                {/* Sales Intelligence Dossier */}
                <ProspectDossier prospect={selectedProspect} />

                {/* Action links */}
                <div>
                  <p className="text-xs uppercase tracking-wider mb-2" style={{ color: '#6b7280' }}>Actions</p>
                  <div className="space-y-2">
                    <AddProspectToPipeline prospect={selectedProspect} />
                    {selectedProspect.company_number && (
                      <a
                        href={`https://find-and-update.company-information.service.gov.uk/company/${selectedProspect.company_number}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 justify-center py-2.5 rounded-lg text-xs font-medium w-full"
                        style={{ background: 'rgba(59,130,246,0.15)', color: '#3b82f6', border: '1px solid rgba(59,130,246,0.3)' }}
                      >
                        <Briefcase size={14} />
                        View on Companies House
                      </a>
                    )}
                    {selectedProspect.company_name && (
                      <a
                        href={`https://www.linkedin.com/search/results/companies/?keywords=${encodeURIComponent(selectedProspect.company_name)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 justify-center py-2.5 rounded-lg text-xs font-medium w-full"
                        style={{ background: 'rgba(10,102,194,0.15)', color: '#60a5fa', border: '1px solid rgba(10,102,194,0.3)' }}
                      >
                        <ExternalLink size={14} />
                        Search on LinkedIn
                      </a>
                    )}
                    {selectedProspect.website_url && selectedProspect.website_url !== `https://find-and-update.company-information.service.gov.uk/company/${selectedProspect.company_number}` && (
                      <a
                        href={selectedProspect.website_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 justify-center py-2.5 rounded-lg text-xs font-medium w-full"
                        style={{ background: 'rgba(34,197,94,0.1)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.2)' }}
                      >
                        <Globe size={14} />
                        Visit Website
                      </a>
                    )}
                    {selectedProspect.company_name && (
                      <a
                        href={`https://www.google.com/search?q=${encodeURIComponent(selectedProspect.company_name + ' security services')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 justify-center py-2.5 rounded-lg text-xs font-medium w-full"
                        style={{ background: 'rgba(255,255,255,0.05)', color: '#9ca3af', border: '1px solid #374151' }}
                      >
                        <Search size={14} />
                        Google Security Needs
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-full p-8 text-center">
              <Building2 size={32} style={{ color: '#374151', marginBottom: 12 }} />
              <p className="text-sm font-medium" style={{ color: '#4b5563' }}>Select a prospect</p>
              <p className="text-xs mt-1" style={{ color: '#374151' }}>Click any row to view full company details here</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/** Generate a contextual security insight based on company type */
function getSecurityInsight(companyType?: string, status?: string): string {
  if (status && status !== 'Active') {
    return `This company is currently ${status?.toLowerCase()}. Verify current operational status before pursuing.`
  }
  switch (companyType) {
    case 'Facilities Management':
      return 'FM companies often subcontract security services. Strong potential for manned guarding, access control, and CCTV monitoring contracts.'
    case 'Hotel':
      return 'Hotels require 24/7 security presence, CCTV monitoring, and guest safety protocols. High-value recurring contract opportunity.'
    case 'Retail':
      return 'Retail sites need loss prevention, store detectives, and out-of-hours security patrols. Seasonal demand spikes around holidays.'
    case 'Healthcare':
      return 'Healthcare facilities require specialist security with conflict resolution training. Often subject to NHS procurement frameworks.'
    case 'Education':
      return 'Educational institutions need campus security, event security, and safeguarding-compliant officers. Often procure via frameworks.'
    case 'Construction':
      return 'Construction sites require temporary site security, access control, and plant/material protection. Project-based contracts.'
    case 'Warehouse/Logistics':
      return 'Warehouses and logistics centres need perimeter security, access control, and goods-in-transit protection. 24/7 coverage typical.'
    case 'Corporate':
      return 'Corporate offices require reception security, access control systems, and executive protection services. Long-term contract potential.'
    case 'Prime Contractor':
      return 'Prime contractors manage large-scale security contracts and subcontract to regional providers. Partnership opportunity for local delivery.'
    case 'Local Authority':
      return 'Local authorities procure security via public frameworks. Requires compliance with public sector procurement regulations.'
    case 'Venue/Events':
      return 'Venues and event spaces need event security, crowd management, and SIA-licensed door supervisors. Mix of recurring and ad-hoc work.'
    default:
      return 'Assess this company for potential security service requirements based on their sector and operational profile.'
  }
}


/** Add prospect to pipeline as a lead */
function AddProspectToPipeline({ prospect }: { prospect: Prospect }) {
  const queryClient = useQueryClient()
  const [added, setAdded] = useState(false)
  const [error, setError] = useState('')

  const mutation = useMutation({
    mutationFn: () => api.createLead({
      company_name: prospect.company_name,
      company_type: prospect.company_type || '',
      company_number: prospect.company_number || '',
      sic_codes: prospect.sic_codes || '',
      region: prospect.region || '',
      address: prospect.address || '',
      website_url: prospect.website_url || '',
      source: 'Prospect Explorer',
      status: 'Not Contacted',
      notes: `Imported from Prospect Explorer. Status: ${prospect.status || 'Unknown'}. SIC: ${prospect.sic_codes || 'N/A'}`,
      next_action: 'Research company and identify decision maker',
    }),
    onSuccess: () => {
      setAdded(true)
      queryClient.invalidateQueries({ queryKey: ['pipeline'] })
      queryClient.invalidateQueries({ queryKey: ['pipeline-stats'] })
    },
    onError: (e: Error) => setError(e.message),
  })

  if (added) {
    return (
      <div
        className="flex items-center gap-2 justify-center py-2.5 rounded-lg text-xs font-medium w-full"
        style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.3)' }}
      >
        <CheckCircle2 size={14} />
        Added to Pipeline
      </div>
    )
  }

  return (
    <>
      <button
        onClick={() => mutation.mutate()}
        disabled={mutation.isPending}
        className="flex items-center gap-2 justify-center py-2.5 rounded-lg text-xs font-medium w-full transition-all"
        style={{
          background: 'rgba(34,197,94,0.15)',
          color: '#22c55e',
          border: '1px solid rgba(34,197,94,0.3)',
          opacity: mutation.isPending ? 0.6 : 1,
        }}
      >
        <PlusCircle size={14} />
        {mutation.isPending ? 'Adding...' : 'Add to Pipeline'}
      </button>
      {error && <p className="text-xs text-center" style={{ color: '#ef4444' }}>{error}</p>}
    </>
  )
}


/** Generate Sales Intelligence Dossier for a prospect — auto-loads if one already exists */
function ProspectDossier({ prospect }: { prospect: Prospect }) {
  const [dossier, setDossier] = useState<string | null>(null)
  const [generatedAt, setGeneratedAt] = useState<string | null>(null)
  const [sources, setSources] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(true)
  const [error, setError] = useState('')

  // Derive the company key the same way the backend does
  const companyKey = prospect.company_number?.trim()
    ? prospect.company_number.trim().toUpperCase()
    : `name_${prospect.company_name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '').slice(0, 80)}`

  // Auto-fetch existing dossier when the prospect changes
  useEffect(() => {
    setDossier(null)
    setGeneratedAt(null)
    setSources([])
    setError('')
    setFetching(true)
    api.getDossierByCompany(companyKey).then(result => {
      if (result) {
        setDossier(result.dossier_markdown)
        setGeneratedAt(result.updated_at || result.generated_at)
        setSources(result.sources_used || [])
      }
    }).finally(() => setFetching(false))
  }, [companyKey])

  const generateDossier = async () => {
    setLoading(true)
    setError('')
    try {
      const result = await api.generateDossier({
        company_name: prospect.company_name,
        company_number: prospect.company_number || '',
        company_type: prospect.company_type || '',
        region: prospect.region || '',
        sic_codes: prospect.sic_codes || '',
        address: prospect.address || '',
        website_url: prospect.website_url || '',
      })
      setDossier(result.dossier_markdown)
      setGeneratedAt(result.updated_at || result.generated_at)
      setSources(result.sources_used)
    } catch (e: any) {
      setError(e.message || 'Failed to generate dossier')
    } finally {
      setLoading(false)
    }
  }

  const DOSSIER_STYLES = `
    .prose h1 { font-size: 0.9rem; color: #f9fafb; margin-top: 0.5rem; }
    .prose h2 { font-size: 0.8rem; color: #f9fafb; margin-top: 0.75rem; border-bottom: 1px solid #1f2937; padding-bottom: 0.25rem; }
    .prose h3 { font-size: 0.75rem; color: #d1d5db; }
    .prose strong { color: #f9fafb; }
    .prose a { color: #3b82f6; }
    .prose ul, .prose ol { padding-left: 1.2em; }
    .prose li { margin: 0.15em 0; }
    .prose blockquote { border-left: 2px solid #374151; padding-left: 0.75em; color: #9ca3af; }
  `

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-xs uppercase tracking-wider" style={{ color: '#6b7280' }}>Sales Intelligence Dossier</p>
        {dossier && generatedAt && (
          <span className="text-xs" style={{ color: '#4b5563' }}>
            Updated {new Date(generatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
          </span>
        )}
      </div>

      {fetching ? (
        <div className="flex items-center justify-center py-4 gap-2" style={{ color: '#4b5563' }}>
          <Loader2 size={14} className="animate-spin" />
          <span className="text-xs">Checking for saved dossier...</span>
        </div>
      ) : dossier ? (
        <>
          {sources.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-2">
              {sources.map((s, i) => (
                <span key={i} className="text-xs px-1.5 py-0.5 rounded" style={{ background: '#1f2937', color: '#9ca3af', fontSize: '0.65rem' }}>
                  {s}
                </span>
              ))}
            </div>
          )}
          <div className="rounded-lg p-3 max-h-96 overflow-y-auto" style={{ background: '#111827', border: '1px solid #1f2937' }}>
            <div className="prose prose-invert prose-xs max-w-none" style={{ color: '#d1d5db', fontSize: '0.7rem', lineHeight: '1.5' }}>
              <style>{DOSSIER_STYLES}</style>
              <ReactMarkdown>{dossier}</ReactMarkdown>
            </div>
          </div>
          <button
            onClick={generateDossier}
            disabled={loading}
            className="flex items-center gap-2 justify-center py-2 rounded-lg text-xs font-medium w-full mt-2 transition-all"
            style={{ background: 'rgba(255,255,255,0.04)', color: '#6b7280', border: '1px solid #1f2937', opacity: loading ? 0.6 : 1 }}
          >
            {loading ? <><Loader2 size={12} className="animate-spin" />Regenerating...</> : <><BookOpen size={12} />Regenerate Dossier</>}
          </button>
        </>
      ) : (
        <>
          <button
            onClick={generateDossier}
            disabled={loading}
            className="flex items-center gap-2 justify-center py-3 rounded-lg text-xs font-medium w-full transition-all"
            style={{
              background: loading ? 'rgba(59,130,246,0.1)' : 'rgba(59,130,246,0.15)',
              color: '#3b82f6',
              border: '1px solid rgba(59,130,246,0.3)',
              opacity: loading ? 0.8 : 1,
            }}
          >
            {loading ? (
              <><Loader2 size={14} className="animate-spin" />Generating dossier (15-30s)...</>
            ) : (
              <><BookOpen size={14} />Generate Sales Intelligence Dossier</>
            )}
          </button>
          {error && <p className="text-xs mt-1 text-center" style={{ color: '#ef4444' }}>{error}</p>}
          <p className="text-xs mt-1 text-center" style={{ color: '#374151' }}>
            Consolidates DB, news, Companies House &amp; website data via AI
          </p>
        </>
      )}
    </div>
  )
}


/** AI analysis for a prospect */
function ProspectAIAnalysis({ prospect }: { prospect: Prospect }) {
  const [analysis, setAnalysis] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const runAnalysis = async () => {
    setLoading(true)
    try {
      const result = await api.aiAnalyzeProspect(prospect as unknown as Record<string, unknown>)
      setAnalysis(result.analysis)
    } catch {
      setAnalysis('AI analysis unavailable. Ensure ANTHROPIC_API_KEY is configured.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <p className="text-xs uppercase tracking-wider mb-1.5" style={{ color: '#6b7280' }}>AI Analysis</p>
      {analysis ? (
        <div className="rounded-lg p-3" style={{ background: '#111827', border: '1px solid #1f2937' }}>
          <div className="prose prose-invert prose-xs max-w-none" style={{ color: '#d1d5db', fontSize: '0.75rem', lineHeight: '1.4' }}>
            <ReactMarkdown>{analysis}</ReactMarkdown>
          </div>
        </div>
      ) : (
        <button
          onClick={runAnalysis}
          disabled={loading}
          className="flex items-center gap-2 justify-center py-2.5 rounded-lg text-xs font-medium w-full transition-all"
          style={{
            background: 'rgba(168,85,247,0.15)',
            color: '#a855f7',
            border: '1px solid rgba(168,85,247,0.3)',
            opacity: loading ? 0.6 : 1,
          }}
        >
          <Sparkles size={13} />
          {loading ? 'Analyzing...' : 'Generate AI Analysis'}
        </button>
      )}
    </div>
  )
}
