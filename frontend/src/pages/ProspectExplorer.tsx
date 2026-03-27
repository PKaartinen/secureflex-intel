import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, type Prospect } from '../lib/api'
import { Card, Button, PageHeader, LoadingSpinner, EmptyState, Table, Th, Td, Tr, Input } from '../components/ui'
import { formatDate, formatRelativeTime } from '../lib/utils'
import { Building2, Play, ExternalLink, Search, ChevronLeft, ChevronRight, SlidersHorizontal, X } from 'lucide-react'

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

  return (
    <div className="flex flex-col h-full overflow-y-auto">
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

      <div className="flex flex-1">
        {/* Sidebar — company type */}
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

        {/* Main content */}
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

          <div className="flex-1 p-6 space-y-4 overflow-y-auto">
            {/* Search + pagination info */}
            <div className="flex items-center gap-3">
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
                {prospects.length} results · Page {currentPage} of {totalPages || 1}
              </span>
            </div>

            {isLoading ? (
              <LoadingSpinner />
            ) : !prospects.length ? (
              <EmptyState
                icon={<Building2 size={32} />}
                title="No prospects found"
                description="Run a scan to discover prospect companies, or adjust your filters"
              />
            ) : (
              <Card>
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
                      const typeColor = TYPE_COLORS[prospect.company_type || ''] || '#6b7280'
                      return (
                        <Tr key={i} onClick={() => setSelectedProspect(prospect)}>
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
                                background: `${typeColor}18`,
                                color: typeColor,
                                border: `1px solid ${typeColor}33`,
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
              <div className="flex items-center justify-center gap-3">
                <Button size="sm" variant="ghost" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - limit))}>
                  <ChevronLeft size={14} /> Prev
                </Button>
                <span className="text-xs" style={{ color: '#6b7280' }}>{currentPage} / {totalPages}</span>
                <Button size="sm" variant="ghost" disabled={offset + limit >= (data?.total || 0)} onClick={() => setOffset(offset + limit)}>
                  Next <ChevronRight size={14} />
                </Button>
              </div>
            )}

            {/* Detail panel */}
            {selectedProspect && (
              <Card>
                <div className="flex items-start justify-between p-4 border-b" style={{ borderColor: '#1f2937' }}>
                  <div>
                    <h3 className="text-sm font-semibold" style={{ color: '#f9fafb' }}>{selectedProspect.company_name}</h3>
                    <p className="text-xs mt-0.5" style={{ color: '#6b7280' }}>
                      <span
                        className="px-1.5 py-0.5 rounded mr-2"
                        style={{
                          background: `${TYPE_COLORS[selectedProspect.company_type || ''] || '#6b7280'}22`,
                          color: TYPE_COLORS[selectedProspect.company_type || ''] || '#6b7280',
                        }}
                      >
                        {selectedProspect.company_type}
                      </span>
                      {selectedProspect.region}
                    </p>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => setSelectedProspect(null)}>✕</Button>
                </div>
                <div className="p-4 grid grid-cols-2 gap-6">
                  <div className="space-y-2">
                    {[
                      ['Companies House #', selectedProspect.company_number],
                      ['SIC Codes', selectedProspect.sic_codes],
                      ['Status', selectedProspect.status],
                      ['Address', selectedProspect.address],
                      ['Incorporated', formatDate(selectedProspect.date_of_creation)],
                    ].filter(([, v]) => v).map(([k, v]) => (
                      <div key={String(k)} className="flex gap-3">
                        <span className="text-xs w-36 flex-shrink-0" style={{ color: '#6b7280' }}>{k}</span>
                        <span className="text-xs" style={{ color: '#f9fafb' }}>{v}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex flex-col gap-2">
                    {selectedProspect.company_number && (
                      <a
                        href={`https://find-and-update.company-information.service.gov.uk/company/${selectedProspect.company_number}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 justify-center py-2 rounded-lg text-xs"
                        style={{ background: 'rgba(59,130,246,0.1)', color: '#3b82f6', border: '1px solid rgba(59,130,246,0.2)' }}
                      >
                        <ExternalLink size={12} />
                        View on Companies House
                      </a>
                    )}
                    {selectedProspect.company_name && (
                      <a
                        href={`https://www.linkedin.com/search/results/companies/?keywords=${encodeURIComponent(selectedProspect.company_name)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 justify-center py-2 rounded-lg text-xs"
                        style={{ background: 'rgba(10,102,194,0.15)', color: '#60a5fa', border: '1px solid rgba(10,102,194,0.3)' }}
                      >
                        <ExternalLink size={12} />
                        Search on LinkedIn
                      </a>
                    )}
                    {selectedProspect.website_url && selectedProspect.website_url !== `https://find-and-update.company-information.service.gov.uk/company/${selectedProspect.company_number}` && (
                      <a
                        href={selectedProspect.website_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 justify-center py-2 rounded-lg text-xs"
                        style={{ background: 'rgba(34,197,94,0.1)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.2)' }}
                      >
                        <ExternalLink size={12} />
                        Visit Website
                      </a>
                    )}
                  </div>
                </div>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
