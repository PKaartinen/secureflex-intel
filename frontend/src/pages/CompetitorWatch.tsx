import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, type Competitor } from '../lib/api'
import { Card, Button, PageHeader, LoadingSpinner, EmptyState, Table, Th, Td, Tr, Input } from '../components/ui'
import { formatDate, formatRelativeTime } from '../lib/utils'
import { Eye, Play, ExternalLink, Search, ChevronLeft, ChevronRight } from 'lucide-react'

export default function CompetitorWatch() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
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

  const competitors = (data?.competitors || []).filter(c =>
    !search || c.company_name?.toLowerCase().includes(search.toLowerCase())
  )

  const totalPages = Math.ceil((data?.total || 0) / limit)
  const currentPage = Math.floor(offset / limit) + 1

  // Group by SIC code
  const bySic = competitors.reduce<Record<string, number>>((acc, c) => {
    const sic = c.sic_codes?.split(',')[0]?.trim() || 'Unknown'
    acc[sic] = (acc[sic] || 0) + 1
    return acc
  }, {})

  const topSics = Object.entries(bySic).sort((a, b) => b[1] - a[1]).slice(0, 5)

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <PageHeader
        title="COMPETITOR WATCH"
        subtitle={data ? `${data.total} competitors · Last scan: ${formatRelativeTime(data.last_scan)}` : 'Loading...'}
        actions={
          <Button size="sm" variant="primary" loading={scan.isPending} onClick={() => scan.mutate()}>
            <Play size={12} />
            Run Scan
          </Button>
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
              {competitors.filter(c => c.status === 'Active').length}
            </p>
          </div>
          <div className="rounded-xl p-4 border" style={{ background: '#111827', borderColor: '#1f2937' }}>
            <p className="text-xs uppercase tracking-wider mb-1" style={{ color: '#6b7280' }}>Unique SIC Codes</p>
            <p className="text-2xl font-bold" style={{ color: '#f9fafb' }}>{Object.keys(bySic).length}</p>
          </div>
          <div className="rounded-xl p-4 border" style={{ background: '#111827', borderColor: '#1f2937' }}>
            <p className="text-xs uppercase tracking-wider mb-1" style={{ color: '#6b7280' }}>Top SIC</p>
            <p className="text-lg font-bold font-mono" style={{ color: '#3b82f6' }}>{topSics[0]?.[0] || 'N/A'}</p>
          </div>
        </div>

        {/* SIC breakdown */}
        {topSics.length > 0 && (
          <Card>
            <div className="px-4 py-3 border-b" style={{ borderColor: '#1f2937' }}>
              <h3 className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#9ca3af' }}>Top SIC Codes</h3>
            </div>
            <div className="p-4 space-y-2">
              {topSics.map(([sic, count]) => (
                <div key={sic} className="flex items-center gap-3">
                  <span className="text-xs font-mono w-20" style={{ color: '#9ca3af' }}>{sic}</span>
                  <div className="flex-1 rounded-full overflow-hidden" style={{ height: 6, background: '#1f2937' }}>
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${(count / (topSics[0]?.[1] || 1)) * 100}%`, background: '#ef4444' }}
                    />
                  </div>
                  <span className="text-xs font-mono w-6 text-right" style={{ color: '#6b7280' }}>{count}</span>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Search */}
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: '#6b7280' }} />
            <Input
              placeholder="Search competitors..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 w-64"
            />
          </div>
          <span className="text-xs" style={{ color: '#6b7280' }}>
            Page {currentPage} of {totalPages}
          </span>
        </div>

        {isLoading ? (
          <LoadingSpinner />
        ) : !competitors.length ? (
          <EmptyState
            icon={<Eye size={32} />}
            title="No competitors found"
            description="Run a scan to discover competitor companies"
          />
        ) : (
          <Card>
            <Table>
              <thead>
                <tr>
                  <Th>Company Name</Th>
                  <Th>SIC Codes</Th>
                  <Th>Region</Th>
                  <Th>Status</Th>
                  <Th>Incorporated</Th>
                  <Th>Actions</Th>
                </tr>
              </thead>
              <tbody>
                {competitors.map((competitor, i) => (
                  <Tr key={i} onClick={() => setSelectedCompetitor(competitor)}>
                    <Td>
                      <div>
                        <p className="text-sm font-medium" style={{ color: '#f9fafb' }}>{competitor.company_name}</p>
                        {competitor.company_number && (
                          <p className="text-xs font-mono" style={{ color: '#374151' }}>CH#{competitor.company_number}</p>
                        )}
                      </div>
                    </Td>
                    <Td><span className="text-xs font-mono" style={{ color: '#6b7280' }}>{competitor.sic_codes}</span></Td>
                    <Td><span className="text-xs">{competitor.region}</span></Td>
                    <Td>
                      <span
                        className="text-xs px-1.5 py-0.5 rounded"
                        style={{
                          background: competitor.status === 'Active' ? 'rgba(34,197,94,0.1)' : 'rgba(107,114,128,0.1)',
                          color: competitor.status === 'Active' ? '#22c55e' : '#6b7280',
                        }}
                      >
                        {competitor.status || 'Unknown'}
                      </span>
                    </Td>
                    <Td><span className="text-xs">{formatDate(competitor.date_of_creation)}</span></Td>
                    <Td>
                      <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                        {competitor.company_number && (
                          <a
                            href={`https://find-and-update.company-information.service.gov.uk/company/${competitor.company_number}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <ExternalLink size={12} style={{ color: '#3b82f6' }} />
                          </a>
                        )}
                      </div>
                    </Td>
                  </Tr>
                ))}
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
            <div className="p-4 grid grid-cols-2 gap-4">
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
              <div>
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
              </div>
            </div>
          </Card>
        )}
      </div>
    </div>
  )
}
