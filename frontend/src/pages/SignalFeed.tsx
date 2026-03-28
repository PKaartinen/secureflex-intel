import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, type Signal } from '../lib/api'
import { Card, CardHeader, CardTitle, CardContent, Button, PageHeader, LoadingSpinner, EmptyState, PriorityBadge } from '../components/ui'
import { formatRelativeTime } from '../lib/utils'
import { useDossier } from '../lib/dossier-context'
import { Rss, Play, ExternalLink, BookOpen, Filter, PlusCircle, FileText, XCircle, Flag, Link2, Zap } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

const SIGNAL_TYPES = ['All', 'news', 'crime', 'tender_award', 'company_event']
const PRIORITIES = ['All', 'hot', 'warm', 'low']

const TYPE_ICONS: Record<string, string> = {
  news: '\u{1F4F0}',
  crime: '\u{1F6A8}',
  tender_award: '\u{1F4CB}',
  company_event: '\u{1F3E2}',
}

/** Colour scheme for crime signal cards based on priority */
function getCrimeCardStyle(priority: string): React.CSSProperties {
  if (priority === 'hot') {
    return { background: 'rgba(239,68,68,0.08)', borderColor: 'rgba(239,68,68,0.35)' }
  }
  if (priority === 'warm') {
    return { background: 'rgba(245,158,11,0.08)', borderColor: 'rgba(245,158,11,0.35)' }
  }
  return { background: '#111827', borderColor: '#1f2937' }
}

/** Inline badge for HIGH CRIME AREA (score >= 80) */
function HighCrimeBadge() {
  return (
    <span
      className="text-xs font-bold px-2 py-0.5 rounded uppercase tracking-wide flex-shrink-0"
      style={{ background: 'rgba(239,68,68,0.2)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.4)' }}
    >
      HIGH CRIME AREA
    </span>
  )
}

/** Matched company badge */
function MatchBadge({ name, score }: { name: string; score: number }) {
  const color = score >= 90 ? '#22c55e' : score >= 70 ? '#3b82f6' : '#f59e0b'
  return (
    <span
      className="text-xs font-semibold px-2 py-0.5 rounded flex items-center gap-1 flex-shrink-0"
      style={{ background: color + '18', color, border: `1px solid ${color}40` }}
    >
      <Link2 size={10} />
      Matched: {name.length > 35 ? name.slice(0, 35) + '...' : name} ({score}%)
    </span>
  )
}

export default function SignalFeed() {
  const queryClient = useQueryClient()
  const { openDossier } = useDossier()
  const [signalType, setSignalType] = useState('')
  const [priority, setPriority] = useState('')
  const [showReport, setShowReport] = useState(false)
  const [selectedSignal, setSelectedSignal] = useState<Signal | null>(null)
  const [dismissed, setDismissed] = useState<Set<number>>(new Set())
  const [flagged, setFlagged] = useState<Set<number>>(new Set())
  const [pipelineAdded, setPipelineAdded] = useState<Set<number>>(new Set())

  // Use matched signals endpoint (falls back to regular signals if no matches yet)
  const { data, isLoading } = useQuery({
    queryKey: ['signals-matched', signalType, priority],
    queryFn: async () => {
      try {
        const matched = await api.matchedSignals(200)
        // Apply filters client-side
        let sigs = matched.signals || []
        if (signalType) {
          sigs = sigs.filter(s => (s.type || '').toLowerCase().includes(signalType.toLowerCase()))
        }
        if (priority) {
          sigs = sigs.filter(s => (s.priority || '').toLowerCase().includes(priority.toLowerCase()))
        }
        return { ...matched, signals: sigs }
      } catch {
        // Fallback to regular signals endpoint
        return api.signals({
          signal_type: signalType || undefined,
          priority: priority || undefined,
          limit: 200,
        })
      }
    },
    refetchInterval: 30_000,
  })

  const { data: report, isLoading: reportLoading } = useQuery({
    queryKey: ['signals-report'],
    queryFn: api.signalsReport,
    enabled: showReport,
  })

  const scan = useMutation({
    mutationFn: () => api.scanSignals(),
    onSuccess: () => {
      setTimeout(() => queryClient.invalidateQueries({ queryKey: ['signals-matched'] }), 3000)
    },
  })

  const resolve = useMutation({
    mutationFn: () => api.resolveSignals(),
    onSuccess: () => {
      setTimeout(() => queryClient.invalidateQueries({ queryKey: ['signals-matched'] }), 3000)
    },
  })

  const addToPipeline = useMutation({
    mutationFn: (signalId: number) => api.addSignalToPipeline(signalId),
    onSuccess: (data, signalId) => {
      setPipelineAdded(prev => new Set(prev).add(signalId))
      queryClient.invalidateQueries({ queryKey: ['pipeline'] })
    },
  })

  const signals = data?.signals || []
  const hotCount = signals.filter(s => s.priority === 'hot').length
  const warmCount = signals.filter(s => s.priority === 'warm').length
  const crimeCount = signals.filter(s => s.type === 'crime').length
  const matchedCount = signals.filter(s => s.best_match).length

  const handleDismiss = (signalId: number) => {
    setDismissed(prev => new Set(prev).add(signalId))
    api.signalAction(signalId, 'dismiss').catch(() => {})
  }

  const handleFlag = (signalId: number) => {
    setFlagged(prev => {
      const next = new Set(prev)
      if (next.has(signalId)) next.delete(signalId)
      else next.add(signalId)
      return next
    })
    api.signalAction(signalId, 'flag').catch(() => {})
  }

  const handleAddToPipeline = (signalId: number) => {
    addToPipeline.mutate(signalId)
  }

  const handleOpenDossier = (signal: Signal) => {
    const match = signal.best_match
    if (match) {
      openDossier(
        match.company_number || match.company_name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '').slice(0, 80),
        match.company_name,
        match.company_number,
      )
    } else if (signal.company) {
      const slug = 'name_' + signal.company.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '').slice(0, 80)
      openDossier(slug, signal.company)
    }
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <PageHeader
        title="SIGNAL RADAR"
        subtitle={data ? `${data.total} signals \u00B7 ${matchedCount} matched \u00B7 Last scan: ${formatRelativeTime((data as any).last_scan)}` : 'Loading...'}
        actions={
          <>
            <Button size="sm" variant="ghost" onClick={() => setShowReport(!showReport)}>
              <BookOpen size={12} />
              {showReport ? 'Hide Report' : 'View Report'}
            </Button>
            <Button size="sm" variant="ghost" loading={resolve.isPending} onClick={() => resolve.mutate()}>
              <Link2 size={12} />
              Resolve Entities
            </Button>
            <Button size="sm" variant="primary" loading={scan.isPending} onClick={() => scan.mutate()}>
              <Play size={12} />
              Scan Signals
            </Button>
          </>
        }
      />

      <div className="p-6 space-y-4">
        {/* Stats */}
        <div className="grid grid-cols-5 gap-4">
          <div className="rounded-xl p-4 border" style={{ background: '#111827', borderColor: '#1f2937' }}>
            <p className="text-xs uppercase tracking-wider mb-1" style={{ color: '#6b7280' }}>Total Signals</p>
            <p className="text-2xl font-bold" style={{ color: '#f9fafb' }}>{data?.total || 0}</p>
          </div>
          <div className="rounded-xl p-4 border" style={{ background: '#111827', borderColor: '#1f2937' }}>
            <p className="text-xs uppercase tracking-wider mb-1" style={{ color: '#6b7280' }}>Hot</p>
            <p className="text-2xl font-bold" style={{ color: '#ef4444' }}>{hotCount}</p>
          </div>
          <div className="rounded-xl p-4 border" style={{ background: '#111827', borderColor: '#1f2937' }}>
            <p className="text-xs uppercase tracking-wider mb-1" style={{ color: '#6b7280' }}>Warm</p>
            <p className="text-2xl font-bold" style={{ color: '#f59e0b' }}>{warmCount}</p>
          </div>
          <div className="rounded-xl p-4 border" style={{ background: 'rgba(239,68,68,0.06)', borderColor: 'rgba(239,68,68,0.25)' }}>
            <p className="text-xs uppercase tracking-wider mb-1" style={{ color: '#ef4444' }}>{'\u{1F6A8}'} Crime Signals</p>
            <p className="text-2xl font-bold" style={{ color: '#ef4444' }}>{crimeCount}</p>
          </div>
          <div className="rounded-xl p-4 border" style={{ background: 'rgba(59,130,246,0.06)', borderColor: 'rgba(59,130,246,0.25)' }}>
            <p className="text-xs uppercase tracking-wider mb-1" style={{ color: '#3b82f6' }}>{'\u{1F517}'} Entity Matched</p>
            <p className="text-2xl font-bold" style={{ color: '#3b82f6' }}>{matchedCount}</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Filter size={12} style={{ color: '#6b7280' }} />
            <span className="text-xs" style={{ color: '#6b7280' }}>Type:</span>
            {SIGNAL_TYPES.map(t => (
              <button
                key={t}
                onClick={() => setSignalType(t === 'All' ? '' : t)}
                className="px-2.5 py-1 rounded-full text-xs transition-all"
                style={{
                  background: (t === 'All' && !signalType) || signalType === t ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.05)',
                  border: `1px solid ${(t === 'All' && !signalType) || signalType === t ? 'rgba(59,130,246,0.4)' : '#374151'}`,
                  color: (t === 'All' && !signalType) || signalType === t ? '#3b82f6' : '#9ca3af',
                }}
              >
                {t === 'All' ? 'All' : `${TYPE_ICONS[t] || ''} ${t}`}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs" style={{ color: '#6b7280' }}>Priority:</span>
            {PRIORITIES.map(p => (
              <button
                key={p}
                onClick={() => setPriority(p === 'All' ? '' : p)}
                className="px-2.5 py-1 rounded-full text-xs transition-all capitalize"
                style={{
                  background: (p === 'All' && !priority) || priority === p ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.05)',
                  border: `1px solid ${(p === 'All' && !priority) || priority === p ? 'rgba(59,130,246,0.4)' : '#374151'}`,
                  color: (p === 'All' && !priority) || priority === p ? '#3b82f6' : '#9ca3af',
                }}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        {/* Resolution status banner */}
        {resolve.isSuccess && (
          <div className="rounded-lg px-4 py-2 flex items-center gap-2" style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)' }}>
            <Zap size={14} style={{ color: '#22c55e' }} />
            <span className="text-xs" style={{ color: '#22c55e' }}>Entity resolution started. Matches will appear shortly.</span>
          </div>
        )}

        {/* Report */}
        {showReport && (
          <Card>
            <CardHeader>
              <CardTitle>Signals Intelligence Report</CardTitle>
            </CardHeader>
            <CardContent>
              {reportLoading ? (
                <LoadingSpinner />
              ) : report?.content ? (
                <div className="prose prose-invert prose-sm max-w-none" style={{ color: '#d1d5db' }}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{report.content}</ReactMarkdown>
                </div>
              ) : (
                <EmptyState icon={<BookOpen size={24} />} title="No report available" description="Run a scan to generate a signals report" />
              )}
            </CardContent>
          </Card>
        )}

        {/* Signal cards */}
        {isLoading ? (
          <LoadingSpinner />
        ) : !signals.length ? (
          <EmptyState
            icon={<Rss size={32} />}
            title="No signals found"
            description="Run a scan to collect intelligence signals"
          />
        ) : (
          <div className="space-y-3">
            {signals.map((signal, i) => {
              const signalId = signal.id || i
              const isDismissed = dismissed.has(signalId)
              const isFlagged = flagged.has(signalId)
              const isAddedToPipeline = pipelineAdded.has(signalId)
              const bestMatch = signal.best_match
              const isCrime = signal.type === 'crime'
              const isHighCrime = isCrime && (signal.score !== undefined
                ? (signal.score ?? 0) >= 80
                : signal.priority === 'hot')
              const cardStyle = isDismissed
                ? { background: '#0a0f1a', borderColor: '#1a1f2e', opacity: 0.5 }
                : isCrime
                  ? getCrimeCardStyle(signal.priority)
                  : { background: '#111827', borderColor: '#1f2937' }

              return (
                <div
                  key={signalId}
                  className="rounded-xl border p-4 cursor-pointer transition-all"
                  style={{
                    ...cardStyle,
                    ...(selectedSignal === signal ? { borderColor: 'rgba(59,130,246,0.4)' } : {}),
                    ...(isFlagged ? { borderColor: 'rgba(245,158,11,0.5)' } : {}),
                  }}
                  onClick={() => setSelectedSignal(selectedSignal === signal ? null : signal)}
                >
                  <div className="flex items-start gap-3">
                    <span className="text-lg flex-shrink-0 mt-0.5">{TYPE_ICONS[signal.type] || '\u{1F4E1}'}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <p className="text-sm font-medium" style={{ color: isDismissed ? '#6b7280' : '#f9fafb' }}>{signal.title}</p>
                        <PriorityBadge priority={signal.priority} />
                        {isHighCrime && <HighCrimeBadge />}
                        {isFlagged && (
                          <span className="text-xs font-bold px-2 py-0.5 rounded uppercase tracking-wide" style={{ background: 'rgba(245,158,11,0.2)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.4)' }}>
                            FLAGGED
                          </span>
                        )}
                        {isDismissed && (
                          <span className="text-xs px-2 py-0.5 rounded" style={{ background: 'rgba(107,114,128,0.2)', color: '#6b7280' }}>
                            DISMISSED
                          </span>
                        )}
                      </div>

                      {/* Matched company badge */}
                      {bestMatch && (
                        <div className="mb-2">
                          <MatchBadge name={bestMatch.company_name} score={bestMatch.match_score} />
                        </div>
                      )}

                      <p className="text-xs mb-2" style={{ color: '#6b7280' }}>
                        {signal.source} {'\u00B7'} {formatRelativeTime(signal.published)}
                      </p>
                      {signal.description && (
                        <p className="text-xs" style={{ color: '#9ca3af' }}>{signal.description}</p>
                      )}

                      {/* Expanded detail */}
                      {selectedSignal === signal && (
                        <div className="mt-3 pt-3 border-t space-y-3" style={{ borderColor: '#1f2937' }}>
                          <div className="grid grid-cols-3 gap-3">
                            {[
                              ['Type', signal.type],
                              ['Category', signal.category],
                              ['Priority', signal.priority],
                              ['Company', signal.company],
                              ['Relevance', signal.relevance],
                            ].filter(([, v]) => v).map(([k, v]) => (
                              <div key={String(k)}>
                                <p className="text-xs" style={{ color: '#6b7280' }}>{k}</p>
                                <p className="text-xs font-medium" style={{ color: '#f9fafb' }}>{v}</p>
                              </div>
                            ))}
                          </div>

                          {/* Crime-specific detail rows */}
                          {isCrime && signal.description && (() => {
                            const locMatch = signal.description.match(/Location: ([^.]+)\./)
                            const monthMatch = signal.description.match(/Month: ([^.]+)\./)
                            const topCatMatch = signal.description.match(/Top category: ([^(]+)\((\d+) incidents\)/)
                            return (
                              <div className="grid grid-cols-2 gap-3 mt-2 pt-2 border-t" style={{ borderColor: '#1f2937' }}>
                                {locMatch && (
                                  <div>
                                    <p className="text-xs" style={{ color: '#6b7280' }}>Location</p>
                                    <p className="text-xs font-medium" style={{ color: '#f9fafb' }}>{locMatch[1].trim()}</p>
                                  </div>
                                )}
                                {monthMatch && (
                                  <div>
                                    <p className="text-xs" style={{ color: '#6b7280' }}>Month</p>
                                    <p className="text-xs font-medium" style={{ color: '#f9fafb' }}>{monthMatch[1].trim()}</p>
                                  </div>
                                )}
                                {topCatMatch && (
                                  <div>
                                    <p className="text-xs" style={{ color: '#6b7280' }}>Top Crime Category</p>
                                    <p className="text-xs font-medium" style={{ color: '#f9fafb' }}>
                                      {topCatMatch[1].trim()} ({topCatMatch[2]} incidents)
                                    </p>
                                  </div>
                                )}
                                <div>
                                  <p className="text-xs" style={{ color: '#6b7280' }}>Incident Count</p>
                                  <p className="text-xs font-medium" style={{ color: signal.priority === 'hot' ? '#ef4444' : signal.priority === 'warm' ? '#f59e0b' : '#f9fafb' }}>
                                    {signal.title.match(/(\d+) incidents/)?.[1] || '\u2014'} incidents
                                  </p>
                                </div>
                              </div>
                            )
                          })()}

                          {/* Action buttons */}
                          <div className="flex items-center gap-2 pt-2 border-t" style={{ borderColor: '#1f2937' }}>
                            {bestMatch && !isAddedToPipeline && (
                              <button
                                onClick={(e) => { e.stopPropagation(); handleAddToPipeline(signalId) }}
                                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-colors"
                                style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.3)' }}
                                disabled={addToPipeline.isPending}
                              >
                                <PlusCircle size={12} />
                                Add to Pipeline
                              </button>
                            )}
                            {isAddedToPipeline && (
                              <span className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg" style={{ background: 'rgba(34,197,94,0.1)', color: '#22c55e' }}>
                                {'\u2713'} Added to Pipeline
                              </span>
                            )}
                            <button
                              onClick={(e) => { e.stopPropagation(); handleOpenDossier(signal) }}
                              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-colors"
                              style={{ background: 'rgba(59,130,246,0.15)', color: '#3b82f6', border: '1px solid rgba(59,130,246,0.3)' }}
                            >
                              <FileText size={12} />
                              Generate Dossier
                            </button>
                            {!isDismissed && (
                              <button
                                onClick={(e) => { e.stopPropagation(); handleDismiss(signalId) }}
                                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-colors"
                                style={{ background: 'rgba(107,114,128,0.15)', color: '#9ca3af', border: '1px solid rgba(107,114,128,0.3)' }}
                              >
                                <XCircle size={12} />
                                Dismiss
                              </button>
                            )}
                            <button
                              onClick={(e) => { e.stopPropagation(); handleFlag(signalId) }}
                              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-colors"
                              style={{
                                background: isFlagged ? 'rgba(245,158,11,0.2)' : 'rgba(245,158,11,0.1)',
                                color: '#f59e0b',
                                border: `1px solid ${isFlagged ? 'rgba(245,158,11,0.5)' : 'rgba(245,158,11,0.3)'}`,
                              }}
                            >
                              <Flag size={12} />
                              {isFlagged ? 'Unflag' : 'Flag for Review'}
                            </button>
                          </div>

                          {(signal.url || signal.link) && (
                            <a
                              href={signal.url || signal.link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1.5 text-xs"
                              style={{ color: '#3b82f6' }}
                              onClick={e => e.stopPropagation()}
                            >
                              <ExternalLink size={11} />
                              Read full article
                            </a>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex-shrink-0 flex items-center gap-1">
                      {(signal.url || signal.link) && (
                        <a
                          href={signal.url || signal.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={e => e.stopPropagation()}
                        >
                          <ExternalLink size={12} style={{ color: '#374151' }} />
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
