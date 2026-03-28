import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import type { ScanSchedule } from '../lib/api'
import { Card, CardHeader, CardTitle, CardContent, Button, PageHeader, LoadingSpinner, EmptyState, ScoreBadge, PriorityBadge, Table, Th, Td, Tr } from '../components/ui'
import { formatDate, formatCurrency, formatRelativeTime } from '../lib/utils'
import { FileText, Play, ExternalLink, BookOpen, PlusCircle, Sparkles, CheckCircle2, Loader2, Clock, RefreshCw } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

// ── Source badge component ──────────────────────────────────────────────────

function SourceBadge({ source }: { source?: string }) {
  const isFTS = source === 'fts'
  return (
    <span
      className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium"
      style={{
        background: isFTS ? 'rgba(168,85,247,0.15)' : 'rgba(59,130,246,0.15)',
        color: isFTS ? '#a855f7' : '#3b82f6',
        border: `1px solid ${isFTS ? 'rgba(168,85,247,0.3)' : 'rgba(59,130,246,0.3)'}`,
        fontSize: '0.6rem',
        letterSpacing: '0.05em',
      }}
    >
      {isFTS ? 'FTS' : 'CF'}
    </span>
  )
}

// ── Main component ──────────────────────────────────────────────────────────

export default function TenderRadar() {
  const queryClient = useQueryClient()
  const [minScore, setMinScore] = useState(0)
  const [sourceFilter, setSourceFilter] = useState<string>('')
  const [showReport, setShowReport] = useState(false)
  const [selectedTender, setSelectedTender] = useState<Record<string, string | number | boolean | null | undefined> | null>(null)

  const { data: tenders, isLoading } = useQuery({
    queryKey: ['tenders', minScore, sourceFilter],
    queryFn: () => api.tenders({ min_score: minScore, source: sourceFilter || undefined }),
    refetchInterval: 60_000,
  })

  const { data: report, isLoading: reportLoading } = useQuery({
    queryKey: ['tender-report'],
    queryFn: api.tenderReport,
    enabled: showReport,
  })

  const { data: schedule } = useQuery({
    queryKey: ['scan-schedule'],
    queryFn: api.scanSchedule,
    refetchInterval: 30_000,
  })

  const scanCF = useMutation({
    mutationFn: () => api.scanTenders(30),
    onSuccess: () => {
      setTimeout(() => queryClient.invalidateQueries({ queryKey: ['tenders'] }), 3000)
    },
  })

  const scanFTS = useMutation({
    mutationFn: () => api.scanFTS(),
    onSuccess: () => {
      setTimeout(() => queryClient.invalidateQueries({ queryKey: ['tenders'] }), 3000)
    },
  })

  const toggleSchedule = useMutation({
    mutationFn: (payload: { enabled: boolean; interval_hours?: number }) => api.toggleScanSchedule(payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['scan-schedule'] }),
  })

  const allTenders = tenders?.tenders || []
  const hotCount = allTenders.filter(t => String(t.classification).includes('HOT')).length
  const warmCount = allTenders.filter(t => String(t.classification).includes('WARM')).length
  const cfCount = allTenders.filter(t => (t.source || 'contracts_finder') === 'contracts_finder').length
  const ftsCount = allTenders.filter(t => t.source === 'fts').length

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <PageHeader
        title="TENDER RADAR"
        subtitle={tenders ? `${tenders.total} tenders · Last scan: ${formatRelativeTime(tenders.last_scan)}` : 'Loading...'}
        actions={
          <>
            <Button size="sm" variant="ghost" onClick={() => setShowReport(!showReport)}>
              <BookOpen size={12} />
              {showReport ? 'Hide Report' : 'View Report'}
            </Button>
            <Button size="sm" variant="ghost" loading={scanCF.isPending} onClick={() => scanCF.mutate()}>
              <Play size={12} />
              Scan CF
            </Button>
            <Button size="sm" variant="ghost" loading={scanFTS.isPending} onClick={() => scanFTS.mutate()}>
              <Play size={12} />
              Scan FTS
            </Button>
            <Button
              size="sm"
              variant={schedule?.enabled ? 'primary' : 'ghost'}
              onClick={() => toggleSchedule.mutate({ enabled: !schedule?.enabled })}
            >
              <Clock size={12} />
              Auto {schedule?.enabled ? 'ON' : 'OFF'}
            </Button>
          </>
        }
      />

      <div className="flex flex-1 overflow-hidden">
        {/* Left: table list */}
        <div className="flex-1 flex flex-col overflow-hidden p-6 space-y-4">
          {/* Stats row */}
          <div className="grid grid-cols-5 gap-3 flex-shrink-0">
            <div className="rounded-xl p-3 border" style={{ background: '#111827', borderColor: '#1f2937' }}>
              <p className="text-xs uppercase tracking-wider mb-1" style={{ color: '#6b7280' }}>Hot</p>
              <p className="text-2xl font-bold" style={{ color: '#ef4444' }}>{hotCount}</p>
            </div>
            <div className="rounded-xl p-3 border" style={{ background: '#111827', borderColor: '#1f2937' }}>
              <p className="text-xs uppercase tracking-wider mb-1" style={{ color: '#6b7280' }}>Warm</p>
              <p className="text-2xl font-bold" style={{ color: '#f59e0b' }}>{warmCount}</p>
            </div>
            <div className="rounded-xl p-3 border" style={{ background: '#111827', borderColor: '#1f2937' }}>
              <p className="text-xs uppercase tracking-wider mb-1" style={{ color: '#6b7280' }}>Total</p>
              <p className="text-2xl font-bold" style={{ color: '#f9fafb' }}>{tenders?.total || 0}</p>
            </div>
            <div className="rounded-xl p-3 border" style={{ background: '#111827', borderColor: '#1f2937' }}>
              <p className="text-xs uppercase tracking-wider mb-1" style={{ color: '#3b82f6' }}>Contracts Finder</p>
              <p className="text-2xl font-bold" style={{ color: '#3b82f6' }}>{cfCount}</p>
            </div>
            <div className="rounded-xl p-3 border" style={{ background: '#111827', borderColor: '#1f2937' }}>
              <p className="text-xs uppercase tracking-wider mb-1" style={{ color: '#a855f7' }}>Find a Tender</p>
              <p className="text-2xl font-bold" style={{ color: '#a855f7' }}>{ftsCount}</p>
            </div>
          </div>

          {/* Auto-scan status bar */}
          {schedule?.enabled && (
            <div
              className="flex items-center gap-3 px-4 py-2 rounded-lg text-xs"
              style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', color: '#22c55e' }}
            >
              <RefreshCw size={12} className={schedule.running ? 'animate-spin' : ''} />
              <span>
                Auto-scan {schedule.running ? 'running now...' : `every ${schedule.interval_hours}h`}
                {schedule.next_run && !schedule.running && (
                  <> · Next: {formatRelativeTime(schedule.next_run)}</>
                )}
                {schedule.last_run && (
                  <> · Last: {formatRelativeTime(schedule.last_run)}</>
                )}
              </span>
            </div>
          )}

          {/* Filters */}
          <div className="flex items-center gap-4 flex-shrink-0 flex-wrap">
            <div className="flex items-center gap-2">
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
            <div className="flex items-center gap-2">
              <span className="text-xs" style={{ color: '#6b7280' }}>Source:</span>
              {[
                { value: '', label: 'All' },
                { value: 'contracts_finder', label: 'CF' },
                { value: 'fts', label: 'FTS' },
              ].map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setSourceFilter(opt.value)}
                  className="px-3 py-1 rounded-full text-xs transition-all"
                  style={{
                    background: sourceFilter === opt.value ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.05)',
                    border: `1px solid ${sourceFilter === opt.value ? 'rgba(59,130,246,0.4)' : '#374151'}`,
                    color: sourceFilter === opt.value ? '#3b82f6' : '#9ca3af',
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Report view */}
          {showReport && (
            <Card className="flex-shrink-0">
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
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{report.content}</ReactMarkdown>
                  </div>
                ) : (
                  <EmptyState icon={<BookOpen size={24} />} title="No report available" description="Run a scan to generate a report" />
                )}
              </CardContent>
            </Card>
          )}

          {/* Tender table */}
          <Card className="flex-1 overflow-hidden flex flex-col">
            <CardHeader className="flex-shrink-0">
              <CardTitle>Tender Opportunities</CardTitle>
              <span className="text-xs" style={{ color: '#6b7280' }}>{allTenders.length} results · click row to view details</span>
            </CardHeader>
            <div className="flex-1 overflow-y-auto">
              {isLoading ? (
                <LoadingSpinner />
              ) : !allTenders.length ? (
                <EmptyState
                  icon={<FileText size={32} />}
                  title="No tenders found"
                  description="Run a scan to find tender opportunities"
                />
              ) : (
                <Table>
                  <thead>
                    <tr>
                      <Th>Source</Th>
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
                    {allTenders.map((tender, i) => (
                      <Tr
                        key={i}
                        onClick={() => setSelectedTender(tender as unknown as Record<string, string | number | boolean | null | undefined>)}
                        style={selectedTender === (tender as unknown) ? { background: 'rgba(59,130,246,0.08)' } : {}}
                      >
                        <Td><SourceBadge source={tender.source} /></Td>
                        <Td>
                          <PriorityBadge priority={
                            String(tender.classification).includes('HOT') ? 'hot' :
                            String(tender.classification).includes('WARM') ? 'warm' : 'low'
                          } />
                        </Td>
                        <Td>
                          <div>
                            <p className="text-sm" style={{ color: '#f9fafb', maxWidth: 240 }}>{tender.title}</p>
                            {tender.description_snippet && (
                              <p className="text-xs mt-0.5 truncate" style={{ color: '#6b7280', maxWidth: 240 }}>
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
                            <a href={String(tender.link)} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}>
                              <ExternalLink size={14} style={{ color: '#3b82f6' }} />
                            </a>
                          )}
                        </Td>
                      </Tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </div>
          </Card>
        </div>

        {/* Right: detail panel — always visible, shows placeholder when nothing selected */}
        <div
          className="flex-shrink-0 border-l flex flex-col overflow-hidden"
          style={{ width: 380, borderColor: '#1f2937', background: '#0d1117' }}
        >
          {selectedTender ? (
            <>
              {/* Detail header */}
              <div className="flex items-start justify-between px-5 py-4 border-b flex-shrink-0" style={{ borderColor: '#1f2937' }}>
                <div className="flex-1 min-w-0 pr-3">
                  <div className="flex items-center gap-2 mb-1">
                    <SourceBadge source={selectedTender.source as string | undefined} />
                    <PriorityBadge priority={
                      String(selectedTender.classification).includes('HOT') ? 'hot' :
                      String(selectedTender.classification).includes('WARM') ? 'warm' : 'low'
                    } />
                  </div>
                  <h3 className="text-sm font-semibold leading-snug" style={{ color: '#f9fafb' }}>
                    {String(selectedTender.title || '')}
                  </h3>
                </div>
                <button
                  onClick={() => setSelectedTender(null)}
                  className="flex-shrink-0 text-xs px-2 py-1 rounded"
                  style={{ color: '#6b7280', background: 'rgba(255,255,255,0.05)' }}
                >
                  Close
                </button>
              </div>

              {/* Detail body */}
              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                {/* Key metrics */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg p-3" style={{ background: '#111827', border: '1px solid #1f2937' }}>
                    <p className="text-xs uppercase tracking-wider mb-1" style={{ color: '#6b7280' }}>Value</p>
                    <p className="text-lg font-bold" style={{ color: '#22c55e' }}>{formatCurrency(selectedTender.value as string)}</p>
                  </div>
                  <div className="rounded-lg p-3" style={{ background: '#111827', border: '1px solid #1f2937' }}>
                    <p className="text-xs uppercase tracking-wider mb-1" style={{ color: '#6b7280' }}>Score</p>
                    <ScoreBadge score={selectedTender.score as string} />
                  </div>
                  <div className="rounded-lg p-3" style={{ background: '#111827', border: '1px solid #1f2937' }}>
                    <p className="text-xs uppercase tracking-wider mb-1" style={{ color: '#6b7280' }}>Deadline</p>
                    <p className="text-sm font-medium" style={{ color: '#f59e0b' }}>{String(selectedTender.deadline || 'N/A')}</p>
                  </div>
                  <div className="rounded-lg p-3" style={{ background: '#111827', border: '1px solid #1f2937' }}>
                    <p className="text-xs uppercase tracking-wider mb-1" style={{ color: '#6b7280' }}>SME Friendly</p>
                    <p className="text-sm" style={{ color: String(selectedTender.sme_friendly) === 'true' ? '#22c55e' : '#6b7280' }}>
                      {String(selectedTender.sme_friendly) === 'true' ? 'Yes' : 'No'}
                    </p>
                  </div>
                </div>

                {/* Buyer */}
                <div>
                  <p className="text-xs uppercase tracking-wider mb-1.5" style={{ color: '#6b7280' }}>Buyer</p>
                  <p className="text-sm font-medium" style={{ color: '#f9fafb' }}>{String(selectedTender.buyer || '')}</p>
                  {selectedTender.buyer_email && (
                    <p className="text-xs mt-0.5" style={{ color: '#3b82f6' }}>{String(selectedTender.buyer_email)}</p>
                  )}
                  {selectedTender.region && (
                    <p className="text-xs mt-0.5" style={{ color: '#9ca3af' }}>{String(selectedTender.region)}</p>
                  )}
                </div>

                {/* Description */}
                {selectedTender.description_snippet && (
                  <div>
                    <p className="text-xs uppercase tracking-wider mb-1.5" style={{ color: '#6b7280' }}>Description</p>
                    <p className="text-sm leading-relaxed" style={{ color: '#9ca3af' }}>
                      {String(selectedTender.description_snippet)}
                    </p>
                  </div>
                )}

                {/* Meta */}
                <div className="space-y-2">
                  {[
                    ['Source', (selectedTender.source || 'contracts_finder') === 'fts' ? 'Find a Tender Service' : 'Contracts Finder'],
                    ['CPV Code', selectedTender.cpv_code],
                    ['Published', selectedTender.published_date ? formatDate(String(selectedTender.published_date)) : null],
                  ].filter(([, v]) => v).map(([k, v]) => (
                    <div key={String(k)} className="flex gap-3">
                      <span className="text-xs w-24 flex-shrink-0" style={{ color: '#6b7280' }}>{k}</span>
                      <span className="text-xs font-mono" style={{ color: '#9ca3af' }}>{String(v)}</span>
                    </div>
                  ))}
                </div>

                {/* AI Analysis */}
                <TenderAIAnalysis tender={selectedTender} />

                {/* Sales Intelligence Dossier */}
                <TenderDossier tender={selectedTender} />

                {/* Actions */}
                <div className="space-y-2">
                  <p className="text-xs uppercase tracking-wider mb-1.5" style={{ color: '#6b7280' }}>Actions</p>
                  <AddTenderToPipeline tender={selectedTender} />
                  {selectedTender.link && (
                    <a
                      href={String(selectedTender.link)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 justify-center py-2.5 rounded-lg text-sm font-medium w-full"
                      style={{ background: 'rgba(59,130,246,0.15)', color: '#3b82f6', border: '1px solid rgba(59,130,246,0.3)' }}
                    >
                      <ExternalLink size={14} />
                      {(selectedTender.source || 'contracts_finder') === 'fts' ? 'View on Find a Tender' : 'View on Contracts Finder'}
                    </a>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-full p-8 text-center">
              <FileText size={32} style={{ color: '#374151', marginBottom: 12 }} />
              <p className="text-sm font-medium" style={{ color: '#4b5563' }}>Select a tender</p>
              <p className="text-xs mt-1" style={{ color: '#374151' }}>Click any row to view full details here</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}


/** Generate Sales Intelligence Dossier for a tender's buyer */
function TenderDossier({ tender }: { tender: Record<string, string | number | boolean | null | undefined> }) {
  const [dossier, setDossier] = useState<string | null>(null)
  const [generatedAt, setGeneratedAt] = useState<string | null>(null)
  const [sources, setSources] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(true)
  const [error, setError] = useState('')

  const buyerName = String(tender.buyer || '').trim()

  // Derive company key for the buyer (no company number available for tenders)
  const companyKey = buyerName
    ? `name_${buyerName.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '').slice(0, 80)}`
    : ''

  // Auto-fetch existing dossier when tender changes
  useEffect(() => {
    setDossier(null)
    setGeneratedAt(null)
    setSources([])
    setError('')
    if (!companyKey) { setFetching(false); return }
    setFetching(true)
    api.getDossierByCompany(companyKey).then(result => {
      if (result?.dossier_markdown) {
        setDossier(result.dossier_markdown)
        setGeneratedAt(result.updated_at || result.generated_at)
        setSources(result.sources_used || [])
      }
    }).finally(() => setFetching(false))
  }, [companyKey])

  if (!buyerName) return null

  const generateDossier = async () => {
    setLoading(true)
    setError('')
    try {
      const result = await api.generateDossier({
        company_name: buyerName,
        region: String(tender.region || ''),
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
    .prose table { width: 100%; border-collapse: collapse; font-size: 0.7rem; }
    .prose th { text-align: left; padding: 0.3rem 0.5rem; border-bottom: 1px solid #374151; color: #9ca3af; font-weight: 600; }
    .prose td { padding: 0.3rem 0.5rem; border-bottom: 1px solid #1f2937; color: #d1d5db; }
    .prose tr:hover td { background: rgba(59,130,246,0.03); }
  `
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-xs uppercase tracking-wider" style={{ color: '#6b7280' }}>Buyer Intelligence Dossier</p>
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
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{dossier}</ReactMarkdown>
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
              <><Loader2 size={14} className="animate-spin" />Generating dossier for {buyerName} (15-30s)...</>
            ) : (
              <><BookOpen size={14} />Generate Buyer Dossier</>
            )}
          </button>
          {error && <p className="text-xs mt-1 text-center" style={{ color: '#ef4444' }}>{error}</p>}
        </>
      )}
    </div>
  )
}


/** Add tender to pipeline as a lead */
function AddTenderToPipeline({ tender }: { tender: Record<string, string | number | boolean | null | undefined> }) {
  const queryClient = useQueryClient()
  const [added, setAdded] = useState(false)
  const [error, setError] = useState('')

  const sourceName = (tender.source || 'contracts_finder') === 'fts' ? 'FTS' : 'CF'

  const mutation = useMutation({
    mutationFn: () => api.createLead({
      company_name: String(tender.buyer || 'Unknown Buyer'),
      company_type: 'Tender Lead',
      region: String(tender.region || ''),
      source: `${sourceName} Tender: ${String(tender.title || '').slice(0, 80)}`,
      notes: `Tender score: ${tender.score || 'N/A'}/100 | Classification: ${tender.classification || 'N/A'} | Value: ${tender.value || 'N/A'} | Deadline: ${tender.deadline || 'N/A'} | Source: ${sourceName}`,
      status: 'prospect',
      tier: String(tender.classification).includes('HOT') ? '1' : String(tender.classification).includes('WARM') ? '2' : '3',
      next_action: 'Review tender and prepare bid response',
      website_url: String(tender.link || ''),
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
        className="flex items-center gap-2 justify-center py-2.5 rounded-lg text-sm font-medium w-full"
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
        className="flex items-center gap-2 justify-center py-2.5 rounded-lg text-sm font-medium w-full transition-all"
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


/** AI analysis for a tender */
function TenderAIAnalysis({ tender }: { tender: Record<string, string | number | boolean | null | undefined> }) {
  const [analysis, setAnalysis] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const runAnalysis = async () => {
    setLoading(true)
    try {
      const result = await api.aiAnalyzeTender(tender as Record<string, unknown>)
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
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{analysis}</ReactMarkdown>
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
          {loading ? 'Analyzing...' : 'Generate AI Fit Analysis'}
        </button>
      )}
    </div>
  )
}
