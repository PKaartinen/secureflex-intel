import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, type Signal } from '../lib/api'
import { Card, CardHeader, CardTitle, CardContent, Button, PageHeader, LoadingSpinner, EmptyState, PriorityBadge } from '../components/ui'
import { formatRelativeTime } from '../lib/utils'
import { Rss, Play, ExternalLink, BookOpen, Filter } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

const SIGNAL_TYPES = ['All', 'news', 'crime', 'tender_award', 'company_event']
const PRIORITIES = ['All', 'hot', 'warm', 'low']

const TYPE_ICONS: Record<string, string> = {
  news: '📰',
  crime: '🚨',
  tender_award: '📋',
  company_event: '🏢',
}

export default function SignalFeed() {
  const queryClient = useQueryClient()
  const [signalType, setSignalType] = useState('')
  const [priority, setPriority] = useState('')
  const [showReport, setShowReport] = useState(false)
  const [selectedSignal, setSelectedSignal] = useState<Signal | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['signals', signalType, priority],
    queryFn: () => api.signals({
      signal_type: signalType || undefined,
      priority: priority || undefined,
      limit: 100,
    }),
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
      setTimeout(() => queryClient.invalidateQueries({ queryKey: ['signals'] }), 3000)
    },
  })

  const signals = data?.signals || []
  const hotCount = signals.filter(s => s.priority === 'hot').length
  const warmCount = signals.filter(s => s.priority === 'warm').length

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <PageHeader
        title="SIGNAL FEED"
        subtitle={data ? `${data.total} signals · Last scan: ${formatRelativeTime(data.last_scan)}` : 'Loading...'}
        actions={
          <>
            <Button size="sm" variant="ghost" onClick={() => setShowReport(!showReport)}>
              <BookOpen size={12} />
              {showReport ? 'Hide Report' : 'View Report'}
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
        <div className="grid grid-cols-4 gap-4">
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
          <div className="rounded-xl p-4 border" style={{ background: '#111827', borderColor: '#1f2937' }}>
            <p className="text-xs uppercase tracking-wider mb-1" style={{ color: '#6b7280' }}>Crime Signals</p>
            <p className="text-2xl font-bold" style={{ color: '#8b5cf6' }}>
              {signals.filter(s => s.type === 'crime').length}
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-4">
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
            {signals.map((signal, i) => (
              <div
                key={i}
                className="rounded-xl border p-4 cursor-pointer hover:border-blue-500/30 transition-all"
                style={{ background: '#111827', borderColor: '#1f2937' }}
                onClick={() => setSelectedSignal(selectedSignal === signal ? null : signal)}
              >
                <div className="flex items-start gap-3">
                  <span className="text-lg flex-shrink-0 mt-0.5">{TYPE_ICONS[signal.type] || '📡'}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-sm font-medium" style={{ color: '#f9fafb' }}>{signal.title}</p>
                      <PriorityBadge priority={signal.priority} />
                    </div>
                    <p className="text-xs mb-2" style={{ color: '#6b7280' }}>
                      {signal.source} · {formatRelativeTime(signal.published)}
                    </p>
                    {signal.description && (
                      <p className="text-xs" style={{ color: '#9ca3af' }}>{signal.description}</p>
                    )}
                    {selectedSignal === signal && (
                      <div className="mt-3 pt-3 border-t space-y-2" style={{ borderColor: '#1f2937' }}>
                        <div className="grid grid-cols-3 gap-3">
                          {[
                            ['Type', signal.type],
                            ['Category', signal.category],
                            ['Relevance', signal.relevance],
                            ['Company', signal.company],
                          ].filter(([, v]) => v).map(([k, v]) => (
                            <div key={String(k)}>
                              <p className="text-xs" style={{ color: '#6b7280' }}>{k}</p>
                              <p className="text-xs font-medium" style={{ color: '#f9fafb' }}>{v}</p>
                            </div>
                          ))}
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
                  <div className="flex-shrink-0">
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
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
