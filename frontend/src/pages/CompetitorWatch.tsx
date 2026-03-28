import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, type Competitor } from '../lib/api'
import { Card, Button, PageHeader, LoadingSpinner, EmptyState, Table, Th, Td, Tr, Input } from '../components/ui'
import { formatDate, formatRelativeTime } from '../lib/utils'
import { Eye, Play, ExternalLink, Search, ChevronLeft, ChevronRight, SlidersHorizontal, X, AlertTriangle } from 'lucide-react'

const SIC_LABELS: Record<string, string> = {
  '80100': 'Private security',
  '80200': 'Security systems',
  '80300': 'Investigation',
}

const SORT_OPTIONS = [
  { value: 'company_name_asc', label: 'Name A→Z' },
  { value: 'company_name_desc', label: 'Name Z→A' },
  { value: 'date_desc', label: 'Newest first' },
  { value: 'date_asc', label: 'Oldest first' },
]

const STATUSES = ['All', 'Active', 'Dissolved', 'Liquidation', 'Administration']
const REGIONS = ['All Regions', 'London', 'South East', 'South West', 'Midlands', 'North West', 'North East', 'Yorkshire', 'Scotland', 'Wales', 'Unknown']
const SIC_FILTERS = ['All', '80100 — Private security', '80200 — Security systems', '80300 — Investigation']

export default function CompetitorWatch() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [sicFilter, setSicFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [regionFilter, setRegionFilter] = useState('')
  const [sortBy, setSortBy] = useState('company_name_asc')
  const [showFilters, setShowFilters] = useState(false)
  const [offset, setOffset] = useState(0)
  const [selectedCompetitor, setSelectedCompetitor] = useState<Competitor | null>(null)
  const limit = 50

  const { data, isLoading } = useQuery({
    queryKey: ['competitors', offset],
    queryFn: () => api.competitors({ limit, offset }),
    refetchInterval: 120_000,
  })

  const scan = useMutation({
    mutationFn: () => api.scanCompetitors(),
    onSuccess: () => {
      setTimeout(() => queryClient.invalidateQueries({ queryKey: ['competitors'] }), 3000)
    },
  })

  const competitors = useMemo(() => {
    let rows = data?.competitors || []

    // Text search
    if (search) {
      const q = search.toLowerCase()
      rows = rows.filter(c =>
        c.company_name?.toLowerCase().includes(q) ||
        c.sic_codes?.toLowerCase().includes(q) ||
        c.company_number?.toLowerCase().includes(q)
      )
    }

    // SIC filter
    if (sicFilter) {
      const sic = sicFilter.split(' ')[0]
      rows = rows.filter(c => c.sic_codes?.includes(sic))
    }

    // Status filter
    if (statusFilter && statusFilter !== 'All') {
      rows = rows.filter(c => c.status?.toLowerCase() === statusFilter.toLowerCase())
    }

    // Region filter
    if (regionFilter && regionFilter !== 'All Regions') {
      rows = rows.filter(c => c.region?.toLowerCase().includes(regionFilter.toLowerCase()))
    }

    // Sort
    rows = [...rows].sort((a, b) => {
      switch (sortBy) {
        case 'company_name_asc': return (a.company_name || '').localeCompare(b.company_name || '')
        case 'company_name_desc': return (b.company_name || '').localeCompare(a.company_name || '')
        case 'date_desc': return (b.date_of_creation || '').localeCompare(a.date_of_creation || '')
        case 'date_asc': return (a.date_of_creation || '').localeCompare(b.date_of_creation || '')
        default: return 0
      }
    })

    return rows
  }, [data, search, sicFilter, statusFilter, regionFilter, sortBy])

  const totalPages = Math.ceil((data?.total || 0) / limit)
  const currentPage = Math.floor(offset / limit) + 1

  const activeFilterCount = [sicFilter, statusFilter && statusFilter !== 'All', regionFilter && regionFilter !== 'All Regions'].filter(Boolean).length

  // SIC breakdown for the sidebar
  const bySic = useMemo(() => {
    const all = data?.competitors || []
    return Object.entries(SIC_LABELS).map(([code, label]) => ({
      code,
      label,
      count: all.filter(c => c.sic_codes?.includes(code)).length,
    })).sort((a, b) => b.count - a.count)
  }, [data])

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <PageHeader
        title="COMPETITOR WATCH"
        subtitle={data ? `${data.total} competitors · Last scan: ${formatRelativeTime(data.last_scan)}` : 'Loading...'}
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

      <div className="p-6 space-y-4">
        {/* Stats row */}
        <div className="grid grid-cols-4 gap-4">
          <div className="rounded-xl p-4 border" style={{ background: '#111827', borderColor: '#1f2937' }}>
            <p className="text-xs uppercase tracking-wider mb-1" style={{ color: '#6b7280' }}>Total Competitors</p>
            <p className="text-2xl font-bold" style={{ color: '#ef4444' }}>{data?.total || 0}</p>
          </div>
          <div className="rounded-xl p-4 border" style={{ background: '#111827', borderColor: '#1f2937' }}>
            <p className="text-xs uppercase tracking-wider mb-1" style={{ color: '#6b7280' }}>Active</p>
            <p className="text-2xl font-bold" style={{ color: '#22c55e' }}>
              {(data?.competitors || []).filter(c => c.status?.toLowerCase().trim() === 'active').length}
            </p>
          </div>
          <div className="rounded-xl p-4 border" style={{ background: '#111827', borderColor: '#1f2937' }}>
            <p className="text-xs uppercase tracking-wider mb-1" style={{ color: '#6b7280' }}>Private Security (80100)</p>
            <p className="text-2xl font-bold" style={{ color: '#f9fafb' }}>
              {bySic.find(s => s.code === '80100')?.count || 0}
            </p>
          </div>
          <div className="rounded-xl p-4 border" style={{ background: '#111827', borderColor: '#1f2937' }}>
            <p className="text-xs uppercase tracking-wider mb-1" style={{ color: '#6b7280' }}>Showing (filtered)</p>
            <p className="text-2xl font-bold" style={{ color: '#3b82f6' }}>{competitors.length}</p>
          </div>
        </div>

        {/* SIC breakdown bars */}
        {bySic.length > 0 && (
          <Card>
            <div className="px-4 py-3 border-b" style={{ borderColor: '#1f2937' }}>
              <h3 className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#9ca3af' }}>SIC Code Breakdown</h3>
            </div>
            <div className="p-4 space-y-3">
              {bySic.map(({ code, label, count }) => (
                <div key={code} className="flex items-center gap-3">
                  <button
                    className="text-xs font-mono w-14 text-left hover:underline"
                    style={{ color: sicFilter.startsWith(code) ? '#3b82f6' : '#9ca3af' }}
                    onClick={() => setSicFilter(sicFilter.startsWith(code) ? '' : `${code} — ${label}`)}
                  >
                    {code}
                  </button>
                  <span className="text-xs w-36 truncate" style={{ color: '#6b7280' }}>{label}</span>
                  <div className="flex-1 rounded-full overflow-hidden" style={{ height: 6, background: '#1f2937' }}>
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${(count / (bySic[0]?.count || 1)) * 100}%`,
                        background: sicFilter.startsWith(code) ? '#3b82f6' : '#ef4444',
                      }}
                    />
                  </div>
                  <span className="text-xs font-mono w-8 text-right" style={{ color: '#6b7280' }}>{count}</span>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Advanced filter bar */}
        {showFilters && (
          <div
            className="rounded-xl border px-4 py-3 flex flex-wrap items-center gap-3"
            style={{ background: '#111827', borderColor: '#1f2937' }}
          >
            {/* SIC filter */}
            <div className="flex items-center gap-2">
              <label className="text-xs" style={{ color: '#6b7280' }}>SIC Code</label>
              <select
                value={sicFilter}
                onChange={e => { setSicFilter(e.target.value); setOffset(0) }}
                className="text-xs rounded px-2 py-1 border"
                style={{ background: '#1f2937', color: '#f9fafb', borderColor: '#374151' }}
              >
                {SIC_FILTERS.map(s => <option key={s} value={s === 'All' ? '' : s}>{s}</option>)}
              </select>
            </div>

            {/* Status */}
            <div className="flex items-center gap-2">
              <label className="text-xs" style={{ color: '#6b7280' }}>Status</label>
              <select
                value={statusFilter}
                onChange={e => { setStatusFilter(e.target.value); setOffset(0) }}
                className="text-xs rounded px-2 py-1 border"
                style={{ background: '#1f2937', color: '#f9fafb', borderColor: '#374151' }}
              >
                {STATUSES.map(s => <option key={s} value={s === 'All' ? '' : s}>{s}</option>)}
              </select>
            </div>

            {/* Region */}
            <div className="flex items-center gap-2">
              <label className="text-xs" style={{ color: '#6b7280' }}>Region</label>
              <select
                value={regionFilter}
                onChange={e => { setRegionFilter(e.target.value); setOffset(0) }}
                className="text-xs rounded px-2 py-1 border"
                style={{ background: '#1f2937', color: '#f9fafb', borderColor: '#374151' }}
              >
                {REGIONS.map(r => <option key={r} value={r === 'All Regions' ? '' : r}>{r}</option>)}
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

            {/* Clear */}
            {activeFilterCount > 0 && (
              <button
                onClick={() => { setSicFilter(''); setStatusFilter(''); setRegionFilter(''); setSortBy('company_name_asc') }}
                className="flex items-center gap-1 text-xs px-2 py-1 rounded"
                style={{ color: '#ef4444', background: 'rgba(239,68,68,0.1)' }}
              >
                <X size={10} /> Clear filters
              </button>
            )}
          </div>
        )}

        {/* Search */}
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
            {competitors.length} results · Page {currentPage} of {totalPages || 1}
          </span>
        </div>

        {isLoading ? (
          <LoadingSpinner />
        ) : !competitors.length ? (
          <EmptyState
            icon={<Eye size={32} />}
            title="No competitors found"
            description="Run a scan to discover competitor companies, or adjust your filters"
          />
        ) : (
          <Card>
            <Table>
              <thead>
                <tr>
                  <Th>Company Name</Th>
                  <Th>SIC Code</Th>
                  <Th>Region</Th>
                  <Th>Status</Th>
                  <Th>Incorporated</Th>
                  <Th>Flags</Th>
                  <Th>Actions</Th>
                </tr>
              </thead>
              <tbody>
                {competitors.map((competitor, i) => {
                  const isActive = competitor.status?.toLowerCase().trim() === 'active'
                  const hasAlert = !isActive
                  return (
                    <Tr key={i} onClick={() => setSelectedCompetitor(competitor)}>
                      <Td>
                        <div className="flex items-center gap-2">
                          {hasAlert && <AlertTriangle size={12} style={{ color: '#f59e0b' }} />}
                          <div>
                            <p className="text-sm font-medium" style={{ color: '#f9fafb' }}>{competitor.company_name}</p>
                            {competitor.company_number && (
                              <p className="text-xs font-mono" style={{ color: '#374151' }}>CH#{competitor.company_number}</p>
                            )}
                          </div>
                        </div>
                      </Td>
                      <Td>
                        <div className="space-y-0.5">
                          {competitor.sic_codes?.split(';').slice(0, 2).map((sic, j) => {
                            const code = sic.trim().split(':')[0].trim()
                            return (
                              <span key={j} className="block text-xs font-mono" style={{ color: '#6b7280' }}>
                                {code} {SIC_LABELS[code] ? `— ${SIC_LABELS[code]}` : ''}
                              </span>
                            )
                          })}
                        </div>
                      </Td>
                      <Td><span className="text-xs">{competitor.region}</span></Td>
                      <Td>
                        <span
                          className="text-xs px-1.5 py-0.5 rounded"
                          style={{
                            background: isActive ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                            color: isActive ? '#22c55e' : '#ef4444',
                          }}
                        >
                          {competitor.status || 'Unknown'}
                        </span>
                      </Td>
                      <Td><span className="text-xs">{formatDate(competitor.date_of_creation)}</span></Td>
                      <Td>
                        {hasAlert && (
                          <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'rgba(245,158,11,0.1)', color: '#f59e0b' }}>
                            {competitor.status}
                          </span>
                        )}
                      </Td>
                      <Td>
                        <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                          {competitor.company_number && (
                            <a
                              href={`https://find-and-update.company-information.service.gov.uk/company/${competitor.company_number}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="View on Companies House"
                            >
                              <ExternalLink size={12} style={{ color: '#3b82f6' }} />
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
        {selectedCompetitor && (
          <Card>
            <div className="flex items-start justify-between p-4 border-b" style={{ borderColor: '#1f2937' }}>
              <div>
                <h3 className="text-sm font-semibold" style={{ color: '#f9fafb' }}>{selectedCompetitor.company_name}</h3>
                <p className="text-xs mt-0.5" style={{ color: '#6b7280' }}>{selectedCompetitor.region}</p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setSelectedCompetitor(null)}>✕</Button>
            </div>
            <div className="p-4 grid grid-cols-2 gap-6">
              <div className="space-y-2">
                {[
                  ['CH Number', selectedCompetitor.company_number],
                  ['SIC Codes', selectedCompetitor.sic_codes],
                  ['Status', selectedCompetitor.status],
                  ['Address', selectedCompetitor.address],
                  ['Incorporated', formatDate(selectedCompetitor.date_of_creation)],
                ].filter(([, v]) => v).map(([k, v]) => (
                  <div key={String(k)} className="flex gap-3">
                    <span className="text-xs w-28 flex-shrink-0" style={{ color: '#6b7280' }}>{k}</span>
                    <span className="text-xs" style={{ color: '#f9fafb' }}>{v}</span>
                  </div>
                ))}
              </div>
              <div className="flex flex-col gap-2">
                {selectedCompetitor.company_number && (
                  <a
                    href={`https://find-and-update.company-information.service.gov.uk/company/${selectedCompetitor.company_number}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 justify-center py-2 rounded-lg text-xs"
                    style={{ background: 'rgba(59,130,246,0.1)', color: '#3b82f6', border: '1px solid rgba(59,130,246,0.2)' }}
                  >
                    <ExternalLink size={12} />
                    View on Companies House
                  </a>
                )}
                {selectedCompetitor.company_name && (
                  <a
                    href={`https://www.linkedin.com/search/results/companies/?keywords=${encodeURIComponent(selectedCompetitor.company_name)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 justify-center py-2 rounded-lg text-xs"
                    style={{ background: 'rgba(10,102,194,0.15)', color: '#60a5fa', border: '1px solid rgba(10,102,194,0.3)' }}
                  >
                    <ExternalLink size={12} />
                    Search on LinkedIn
                  </a>
                )}
              </div>
            </div>
          </Card>
        )}
      </div>
    </div>
  )
}
