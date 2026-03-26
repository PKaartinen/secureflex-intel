import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { Card, CardHeader, CardTitle, CardContent, Button, PageHeader, LoadingSpinner, EmptyState, ScoreBadge, PriorityBadge, Table, Th, Td, Tr } from '../components/ui'
import { formatDate, formatCurrency, formatRelativeTime } from '../lib/utils'
import { FileText, Play, ExternalLink, RefreshCw, BookOpen } from 'lucide-react'
import ReactMarkdown from 'react-markdown'

export default function TenderRadar() {
  const queryClient = useQueryClient()
  const [minScore, setMinScore] = useState(0)
  const [showReport, setShowReport] = useState(false)
  const [selectedTender, setSelectedTender] = useState<Record<string, string | number | boolean | null | undefined> | null>(null)

  const { data: tenders, isLoading } = useQuery({
    queryKey: ['tenders', minScore],
    queryFn: () => api.tenders({ min_score: minScore }),
    refetchInterval: 60_000,
  })

  const { data: report, isLoading: reportLoading } = useQuery({
    queryKey: ['tender-report'],
    queryFn: api.tenderReport,
    enabled: showReport,
  })

  const scan = useMutation({
    mutationFn: () => api.scanTenders(30),
    onSuccess: () => {
      setTimeout(() => queryClient.invalidateQueries({ queryKey: ['tenders'] }), 3000)
    },
  })

  const hotCount = (tenders?.tenders || []).filter(t => String(t.classification).includes('HOT')).length
  const warmCount = (tenders?.tenders || []).filter(t => String(t.classification).includes('WARM')).length

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <PageHeader
        title="TENDER RADAR"
        subtitle={tenders ? `${tenders.total} tenders · Last scan: ${formatRelativeTime(tenders.last_scan)}` : 'Loading...'}
        actions={
          <>
            <Button size="sm" variant="ghost" onClick={() => setShowReport(!showReport)}>
              <BookOpen size={12} />
              {showReport ? 'Hide Report' : 'View Report'}
            </Button>
            <Button size="sm" variant="primary" loading={scan.isPending} onClick={() => scan.mutate()}>
              <Play size={12} />
              Run Scan
            </Button>
          </>
        }
      />

      <div className="flex-1 p-6 space-y-4">
        {/* Stats row */}
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-xl p-4 border" style={{ background: '#111827', borderColor: '#1f2937' }}>
            <p className="text-xs uppercase tracking-wider mb-1" style={{ color: '#6b7280' }}>Hot Tenders</p>
            <p className="text-2xl font-bold" style={{ color: '#ef4444' }}>{hotCount}</p>
          </div>
          <div className="rounded-xl p-4 border" style={{ background: '#111827', borderColor: '#1f2937' }}>
            <p className="text-xs uppercase tracking-wider mb-1" style={{ color: '#6b7280' }}>Warm Tenders</p>
            <p className="text-2xl font-bold" style={{ color: '#f59e0b' }}>{warmCount}</p>
          </div>
          <div className="rounded-xl p-4 border" style={{ background: '#111827', borderColor: '#1f2937' }}>
            <p className="text-xs uppercase tracking-wider mb-1" style={{ color: '#6b7280' }}>Total Found</p>
            <p className="text-2xl font-bold" style={{ color: '#f9fafb' }}>{tenders?.total || 0}</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3">
          <span className="text-xs" style={{ color: '#6b7280' }}>Min Score:</span>
          {[0, 20, 40, 60, 80].map(s => (
            <button
              key={s}
              onClick={() => setMinScore(s)}
              className="px-3 py-1 rounded-full text-xs transition-all"
              style={{
                background: minScore === s ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.05)',
                border: `1px solid ${minScore === s ? 'rgba(59,130,246,0.4)' : '#374151'}`,
                color: minScore === s ? '#3b82f6' : '#9ca3af',
              }}
            >
              {s === 0 ? 'All' : `${s}+`}
            </button>
          ))}
        </div>

        {/* Report view */}
        {showReport && (
          <Card>
            <CardHeader>
              <CardTitle>Tender Scan Report</CardTitle>
              {report?.last_modified && (
                <span className="text-xs" style={{ color: '#6b7280' }}>{formatRelativeTime(report.last_modified)}</span>
              )}
            </CardHeader>
            <CardContent>
              {reportLoading ? (
                <LoadingSpinner />
              ) : report?.content ? (
                <div className="prose prose-invert prose-sm max-w-none" style={{ color: '#d1d5db' }}>
                  <ReactMarkdown>{report.content}</ReactMarkdown>
                </div>
              ) : (
                <EmptyState icon={<BookOpen size={24} />} title="No report available" description="Run a scan to generate a report" />
              )}
            </CardContent>
          </Card>
        )}

        {/* Tender table */}
        <Card>
          <CardHeader>
            <CardTitle>Tender Opportunities</CardTitle>
            <span className="text-xs" style={{ color: '#6b7280' }}>{tenders?.tenders.length || 0} results</span>
          </CardHeader>
          {isLoading ? (
            <LoadingSpinner />
          ) : !tenders?.tenders.length ? (
            <EmptyState
              icon={<FileText size={32} />}
              title="No tenders found"
              description="Run a scan to find tender opportunities"
            />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Classification</Th>
                  <Th>Title</Th>
                  <Th>Buyer</Th>
                  <Th>Value</Th>
                  <Th>Deadline</Th>
                  <Th>Score</Th>
                  <Th>Link</Th>
                </tr>
              </thead>
              <tbody>
                {tenders.tenders.map((tender, i) => (
                  <Tr key={i} onClick={() => setSelectedTender(tender as unknown as Record<string, string | number | boolean | null | undefined>)}>
                    <Td>
                      <PriorityBadge priority={
                        String(tender.classification).includes('HOT') ? 'hot' :
                        String(tender.classification).includes('WARM') ? 'warm' : 'low'
                      } />
                    </Td>
                    <Td>
                      <div>
                        <p className="text-sm" style={{ color: '#f9fafb', maxWidth: 280 }}>{tender.title}</p>
                        {tender.description_snippet && (
                          <p className="text-xs mt-0.5 truncate" style={{ color: '#6b7280', maxWidth: 280 }}>
                            {tender.description_snippet}
                          </p>
                        )}
                      </div>
                    </Td>
                    <Td>
                      <div>
                        <p className="text-sm">{tender.buyer}</p>
                        {tender.region && <p className="text-xs" style={{ color: '#6b7280' }}>{tender.region}</p>}
                      </div>
                    </Td>
                    <Td>
                      <span className="font-mono text-xs" style={{ color: '#22c55e' }}>
                        {formatCurrency(tender.value)}
                      </span>
                    </Td>
                    <Td>
                      <span className="text-xs" style={{ color: tender.deadline ? '#f59e0b' : '#6b7280' }}>
                        {tender.deadline || 'N/A'}
                      </span>
                    </Td>
                    <Td><ScoreBadge score={tender.score} /></Td>
                    <Td>
                      {tender.link && (
                        <a
                          href={tender.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={e => e.stopPropagation()}
                        >
                          <ExternalLink size={14} style={{ color: '#3b82f6' }} />
                        </a>
                      )}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>

        {/* Selected tender detail */}
        {selectedTender && (
          <Card>
            <CardHeader>
              <CardTitle>Tender Detail</CardTitle>
              <Button size="sm" variant="ghost" onClick={() => setSelectedTender(null)}>✕ Close</Button>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-3">
                  <div>
                    <p className="text-xs uppercase tracking-wider mb-1" style={{ color: '#6b7280' }}>Title</p>
                    <p className="text-sm" style={{ color: '#f9fafb' }}>{String(selectedTender.title || '')}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wider mb-1" style={{ color: '#6b7280' }}>Buyer</p>
                    <p className="text-sm" style={{ color: '#f9fafb' }}>{String(selectedTender.buyer || '')}</p>
                    {selectedTender.buyer_email && (
                      <p className="text-xs mt-0.5" style={{ color: '#3b82f6' }}>{String(selectedTender.buyer_email)}</p>
                    )}
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wider mb-1" style={{ color: '#6b7280' }}>Description</p>
                    <p className="text-sm" style={{ color: '#9ca3af' }}>{String(selectedTender.description_snippet || 'No description available')}</p>
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-wider mb-1" style={{ color: '#6b7280' }}>Value</p>
                      <p className="text-lg font-bold" style={{ color: '#22c55e' }}>{formatCurrency(selectedTender.value as string)}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wider mb-1" style={{ color: '#6b7280' }}>Score</p>
                      <ScoreBadge score={selectedTender.score as string} />
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wider mb-1" style={{ color: '#6b7280' }}>Deadline</p>
                      <p className="text-sm" style={{ color: '#f59e0b' }}>{String(selectedTender.deadline || 'N/A')}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wider mb-1" style={{ color: '#6b7280' }}>Region</p>
                      <p className="text-sm" style={{ color: '#f9fafb' }}>{String(selectedTender.region || 'N/A')}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wider mb-1" style={{ color: '#6b7280' }}>SME Friendly</p>
                      <p className="text-sm" style={{ color: String(selectedTender.sme_friendly) === 'true' ? '#22c55e' : '#6b7280' }}>
                        {String(selectedTender.sme_friendly) === 'true' ? '✅ Yes' : '❌ No'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wider mb-1" style={{ color: '#6b7280' }}>CPV Code</p>
                      <p className="text-sm font-mono" style={{ color: '#9ca3af' }}>{String(selectedTender.cpv_code || 'N/A')}</p>
                    </div>
                  </div>
                  {selectedTender.link && (
                    <a
                      href={String(selectedTender.link)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 justify-center py-2 rounded-lg text-sm"
                      style={{ background: 'rgba(59,130,246,0.15)', color: '#3b82f6', border: '1px solid rgba(59,130,246,0.3)' }}
                    >
                      <ExternalLink size={14} />
                      View on Contracts Finder
                    </a>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
