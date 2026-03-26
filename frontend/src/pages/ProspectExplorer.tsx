import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, type Prospect } from '../lib/api'
import { Card, Button, PageHeader, LoadingSpinner, EmptyState, Table, Th, Td, Tr, Select, Input } from '../components/ui'
import { formatDate, formatRelativeTime } from '../lib/utils'
import { Building2, Play, ExternalLink, Search, ChevronLeft, ChevronRight } from 'lucide-react'

const COMPANY_TYPES = ['All', 'Facilities Management', 'Hotels', 'Venue/Events', 'Retail', 'Healthcare', 'Education', 'Construction', 'Warehouse/Logistics', 'Corporate', 'Prime Contractor', 'Local Authority']

export default function ProspectExplorer() {
  const queryClient = useQueryClient()
  const [companyType, setCompanyType] = useState('')
  const [search, setSearch] = useState('')
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

  const prospects = (data?.prospects || []).filter(p =>
    !search || p.company_name?.toLowerCase().includes(search.toLowerCase())
  )

  const totalPages = Math.ceil((data?.total || 0) / limit)
  const currentPage = Math.floor(offset / limit) + 1

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <PageHeader
        title="PROSPECT EXPLORER"
        subtitle={data ? `${data.total} companies · Last scan: ${formatRelativeTime(data.last_scan)}` : 'Loading...'}
        actions={
          <Button size="sm" variant="primary" loading={scan.isPending} onClick={() => scan.mutate()}>
            <Play size={12} />
            Run Scan
          </Button>
        }
      />

      <div className="flex flex-1">
        {/* Sidebar filters */}
        <div
          className="flex-shrink-0 border-r p-4 space-y-4"
          style={{ width: 200, background: '#0d1117', borderColor: '#1f2937' }}
        >
          <div>
            <p className="text-xs uppercase tracking-wider mb-2" style={{ color: '#6b7280' }}>Company Type</p>
            <div className="space-y-1">
              {COMPANY_TYPES.map(type => (
                <button
                  key={type}
                  onClick={() => { setCompanyType(type === 'All' ? '' : type); setOffset(0) }}
                  className="w-full text-left px-2 py-1.5 rounded text-xs transition-colors"
                  style={{
                    background: (type === 'All' && !companyType) || companyType === type ? 'rgba(59,130,246,0.15)' : 'transparent',
                    color: (type === 'All' && !companyType) || companyType === type ? '#3b82f6' : '#9ca3af',
                  }}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>

          {data && (
            <div>
              <p className="text-xs uppercase tracking-wider mb-2" style={{ color: '#6b7280' }}>Stats</p>
              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span style={{ color: '#6b7280' }}>Total</span>
                  <span className="font-mono" style={{ color: '#f9fafb' }}>{data.total}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span style={{ color: '#6b7280' }}>Showing</span>
                  <span className="font-mono" style={{ color: '#f9fafb' }}>{prospects.length}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Main content */}
        <div className="flex-1 p-6 space-y-4 overflow-y-auto">
          {/* Search */}
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: '#6b7280' }} />
              <Input
                placeholder="Search companies..."
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
          ) : !prospects.length ? (
            <EmptyState
              icon={<Building2 size={32} />}
              title="No prospects found"
              description="Run a scan to discover prospect companies"
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
                    <Th>Created</Th>
                    <Th>Actions</Th>
                  </tr>
                </thead>
                <tbody>
                  {prospects.map((prospect, i) => (
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
                          style={{ background: 'rgba(59,130,246,0.1)', color: '#3b82f6', border: '1px solid rgba(59,130,246,0.2)' }}
                        >
                          {prospect.company_type || 'Unknown'}
                        </span>
                      </Td>
                      <Td><span className="text-xs font-mono" style={{ color: '#6b7280' }}>{prospect.sic_codes}</span></Td>
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
                  ))}
                </tbody>
              </Table>
            </Card>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3">
              <Button
                size="sm"
                variant="ghost"
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - limit))}
              >
                <ChevronLeft size={14} /> Prev
              </Button>
              <span className="text-xs" style={{ color: '#6b7280' }}>
                {currentPage} / {totalPages}
              </span>
              <Button
                size="sm"
                variant="ghost"
                disabled={offset + limit >= (data?.total || 0)}
                onClick={() => setOffset(offset + limit)}
              >
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
                  <p className="text-xs mt-0.5" style={{ color: '#6b7280' }}>{selectedProspect.company_type} · {selectedProspect.region}</p>
                </div>
                <Button size="sm" variant="ghost" onClick={() => setSelectedProspect(null)}>✕</Button>
              </div>
              <div className="p-4 grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  {[
                    ['Companies House #', selectedProspect.company_number],
                    ['SIC Codes', selectedProspect.sic_codes],
                    ['Status', selectedProspect.status],
                    ['Address', selectedProspect.address],
                    ['Created', formatDate(selectedProspect.date_of_creation)],
                  ].filter(([, v]) => v).map(([k, v]) => (
                    <div key={String(k)} className="flex gap-3">
                      <span className="text-xs w-32 flex-shrink-0" style={{ color: '#6b7280' }}>{k}</span>
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
                  {selectedProspect.website_url && (
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
  )
}
