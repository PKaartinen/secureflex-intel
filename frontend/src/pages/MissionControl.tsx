import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import {
  Card, CardHeader, CardTitle, CardContent,
  LoadingSpinner, EmptyState, ProgressBar, ScoreBadge, PageHeader,
} from '../components/ui'
import { formatRelativeTime, parseScore, getScoreColor } from '../lib/utils'
import { useDossier } from '../lib/dossier-context'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip,
} from 'recharts'
import {
  FileText, Rss, Kanban, ChevronDown, ChevronUp,
  ExternalLink, BookOpen, Target, Database, Eye, Zap, PlusCircle, Link2,
} from 'lucide-react'
import MiniMap from '../components/MiniMap'

const PIPELINE_STAGE_ORDER = [
  'Not Contacted', 'Email 1 Sent', 'Email 2 Sent',
  'Warm / Meeting', 'Pilot Live', 'Won',
]
const STAGE_COLORS: Record<string, string> = {
  'Not Contacted': '#6b7280', 'Email 1 Sent': '#f59e0b',
  'Email 2 Sent': '#f97316', 'Warm / Meeting': '#3b82f6',
  'Pilot Live': '#8b5cf6', 'Won': '#22c55e',
}

function slugify(s: string) {
  return 'name_' + s.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '').slice(0, 80)
}

function formatValue(v: string | number) {
  const n = typeof v === 'string' ? parseFloat(v.replace(/[^0-9.]/g, '')) : v
  if (isNaN(n)) return String(v)
  if (n >= 1e6) return '\u00A3' + (n / 1e6).toFixed(1) + 'M'
  if (n >= 1e3) return '\u00A3' + (n / 1e3).toFixed(0) + 'K'
  return '\u00A3' + n.toFixed(0)
}

function KPICard({ label, value, color, icon, onClick, subtitle, isText }: {
  label: string; value: string | number; color: string
  icon: React.ReactNode; onClick?: () => void; subtitle?: string; isText?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className="rounded-xl p-3 border text-left hover:bg-white/5 transition-colors"
      style={{ background: '#111827', borderColor: '#1f2937' }}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs uppercase tracking-wider" style={{ color: '#6b7280' }}>{label}</span>
        <div
          className="flex items-center justify-center rounded-lg"
          style={{ width: 26, height: 26, background: color + '20', border: '1px solid ' + color + '30' }}
        >
          <span style={{ color }}>{icon}</span>
        </div>
      </div>
      <p className={isText ? 'text-sm font-semibold' : 'text-2xl font-bold'} style={{ color: '#f9fafb' }}>
        {value}
      </p>
      {subtitle && <p className="text-xs mt-0.5" style={{ color: '#4b5563' }}>{subtitle}</p>}
    </button>
  )
}

export default function MissionControl() {
  const navigate = useNavigate()
  const { openDossier } = useDossier()
  const [trendsOpen, setTrendsOpen] = useState(false)

  const { data: status } = useQuery({ queryKey: ['status'], queryFn: api.status, refetchInterval: 60_000 })
  const { data: feed, isLoading: feedLoading } = useQuery({ queryKey: ['feed'], queryFn: () => api.feed(20), refetchInterval: 30_000 })
  const { data: tenders } = useQuery({ queryKey: ['tenders-all'], queryFn: () => api.tenders(), refetchInterval: 60_000 })
  const { data: signals } = useQuery({ queryKey: ['signals-all'], queryFn: () => api.signals({ limit: 200 }), refetchInterval: 60_000 })
  const { data: pipeline } = useQuery({ queryKey: ['pipeline-all'], queryFn: () => api.pipeline({ limit: 200 }), refetchInterval: 60_000 })
  const { data: pipelineStats } = useQuery({ queryKey: ['pipeline-stats'], queryFn: api.pipelineStats, refetchInterval: 30_000 })
  const { data: mapData } = useQuery({ queryKey: ['map-mini'], queryFn: () => api.mapAll({ prospect_limit: 100, competitor_limit: 50 }), refetchInterval: 120_000 })
  const { data: scanHistory } = useQuery({ queryKey: ['scan-history'], queryFn: api.scanHistory, refetchInterval: 30_000 })
  const { data: suggestedActions } = useQuery({ queryKey: ['suggested-actions'], queryFn: () => api.suggestedActions(5), refetchInterval: 60_000 })
  const queryClient = useQueryClient()

  const addToPipeline = useMutation({
    mutationFn: (signalId: number) => api.addSignalToPipeline(signalId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suggested-actions'] })
      queryClient.invalidateQueries({ queryKey: ['pipeline'] })
      queryClient.invalidateQueries({ queryKey: ['pipeline-stats'] })
    },
  })

  // Priority Actions
  const priorityActions = useMemo(() => {
    const items: Array<{
      type: string; icon: string; title: string; urgencyLabel: string
      urgencyScore: number; color: string; link: string
      companyKey?: string; companyName?: string
    }> = []

    const topT = [...(tenders?.tenders || [])].sort((a, b) => parseScore(b.score) - parseScore(a.score)).slice(0, 3)
    topT.forEach(t => {
      const score = parseScore(t.score)
      const dl = t.deadline ? Math.max(0, Math.ceil((new Date(t.deadline).getTime() - Date.now()) / 86400000)) : 99
      items.push({
        type: 'tender', icon: score >= 80 ? '\u{1F534}' : score >= 60 ? '\u{1F7E1}' : '\u{1F7E2}',
        title: `${t.title || t.buyer || 'Tender'} ${t.value ? '- ' + formatValue(t.value) : ''}`,
        urgencyLabel: `deadline ${dl}d`, urgencyScore: 100 - dl, color: getScoreColor(score), link: '/tenders',
        companyKey: t.buyer ? slugify(t.buyer) : undefined, companyName: t.buyer,
      })
    })

    const topS = [...(signals?.signals || [])].filter(s => s.priority === 'hot' || s.priority === 'warm').slice(0, 3)
    topS.forEach(s => {
      items.push({
        type: 'signal', icon: s.priority === 'hot' ? '\u{1F534}' : '\u{1F7E1}',
        title: s.title || 'Signal', urgencyLabel: formatRelativeTime(s.published),
        urgencyScore: s.priority === 'hot' ? 90 : 60, color: s.priority === 'hot' ? '#ef4444' : '#f59e0b',
        link: '/signals', companyKey: s.company ? slugify(s.company) : undefined, companyName: s.company,
      })
    })

    const now = Date.now()
    const overdue = (pipeline?.leads || []).filter(l => l.next_action_due_date && new Date(l.next_action_due_date).getTime() < now).slice(0, 3)
    overdue.forEach(l => {
      const d = Math.ceil((now - new Date(l.next_action_due_date).getTime()) / 86400000)
      items.push({
        type: 'action', icon: '\u{23F0}',
        title: `${l.company_name} - ${l.next_action || 'Follow up'}`,
        urgencyLabel: `${d}d overdue`, urgencyScore: 80 + Math.min(d, 20), color: '#ef4444',
        link: '/pipeline', companyKey: l.company_number || slugify(l.company_name), companyName: l.company_name,
      })
    })

    return items.sort((a, b) => b.urgencyScore - a.urgencyScore).slice(0, 5)
  }, [tenders, signals, pipeline])

  const hotSignals = useMemo(() => (signals?.signals || []).filter(s => s.priority === 'hot').length, [signals])

  const dataFreshness = useMemo(() => {
    const runs = scanHistory?.runs || []
    if (!runs.length) return 'No scans'
    return formatRelativeTime(runs[0].completed_at || runs[0].started_at)
  }, [scanHistory])

  const pipelineChartData = useMemo(() => {
    return PIPELINE_STAGE_ORDER.map(stage => ({
      name: stage.replace('Email 1 Sent', 'Email 1').replace('Email 2 Sent', 'Email 2').replace('Warm / Meeting', 'Warm').replace('Not Contacted', 'New').replace('Pilot Live', 'Pilot'),
      count: pipelineStats?.by_status?.[stage] || 0,
      color: STAGE_COLORS[stage] || '#6b7280',
    })).filter(d => d.count > 0)
  }, [pipelineStats])

  const maxPC = Math.max(...pipelineChartData.map(d => d.count), 1)

  const lastScans = useMemo(() => (scanHistory?.runs || []).slice(0, 3), [scanHistory])

  const weeklyTrends = useMemo(() => {
    const wm: Record<string, { tenders: number; signals: number; leads: number }> = {}
    const gw = (ds: string) => { try { const d = new Date(ds); const s = new Date(d); s.setDate(d.getDate() - d.getDay()); return s.toISOString().slice(0, 10) } catch { return '' } }
    ;(tenders?.tenders || []).forEach(t => { const w = gw(t.published_date || ''); if (w) { wm[w] = wm[w] || { tenders: 0, signals: 0, leads: 0 }; wm[w].tenders++ } })
    ;(signals?.signals || []).forEach(s => { const w = gw(s.published || ''); if (w) { wm[w] = wm[w] || { tenders: 0, signals: 0, leads: 0 }; wm[w].signals++ } })
    ;(pipeline?.leads || []).forEach(l => { const w = gw(l.date_added || l.created_at || ''); if (w) { wm[w] = wm[w] || { tenders: 0, signals: 0, leads: 0 }; wm[w].leads++ } })
    return Object.entries(wm).sort(([a], [b]) => a.localeCompare(b)).slice(-8).map(([week, data]) => ({
      week: new Date(week).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }), ...data,
    }))
  }, [tenders, signals, pipeline])

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <PageHeader title="MISSION CONTROL" subtitle="Security intelligence command overview" />

      <div className="flex-1 p-6 space-y-6">
        {/* Section 1 - Priority Actions */}
        {priorityActions.length > 0 && (
          <div className="rounded-xl border overflow-hidden" style={{ background: 'linear-gradient(135deg, rgba(239,68,68,0.05), rgba(59,130,246,0.05))', borderColor: '#1f2937' }}>
            <div className="px-4 py-2 border-b flex items-center gap-2" style={{ borderColor: '#1f2937' }}>
              <Zap size={12} style={{ color: '#f59e0b' }} />
              <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#f59e0b' }}>Priority Actions</span>
            </div>
            <div className="flex divide-x" style={{ borderColor: '#1f2937' }}>
              {priorityActions.map((item, i) => (
                <button key={i} onClick={() => navigate(item.link)} className="flex-1 flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors text-left" style={{ borderColor: '#1f2937' }}>
                  <span className="text-lg flex-shrink-0">{item.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate" style={{ color: '#f9fafb' }}>{item.title}</p>
                    <p className="text-xs mt-0.5" style={{ color: item.color }}>{item.urgencyLabel}</p>
                  </div>
                  <span className="text-xs px-1.5 py-0.5 rounded flex-shrink-0" style={{ background: item.color + '20', color: item.color, border: '1px solid ' + item.color + '40' }}>{item.type}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Section 1b - Suggested Actions (Entity Resolution) */}
        {(suggestedActions?.suggestions || []).length > 0 && (
          <div className="rounded-xl border overflow-hidden" style={{ background: 'linear-gradient(135deg, rgba(59,130,246,0.05), rgba(34,197,94,0.05))', borderColor: '#1f2937' }}>
            <div className="px-4 py-2 border-b flex items-center gap-2" style={{ borderColor: '#1f2937' }}>
              <Link2 size={12} style={{ color: '#3b82f6' }} />
              <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#3b82f6' }}>Suggested Actions</span>
              <span className="text-xs ml-auto" style={{ color: '#4b5563' }}>Signals matched to companies not yet in pipeline</span>
            </div>
            <div className="divide-y" style={{ borderColor: '#1f2937' }}>
              {(suggestedActions?.suggestions || []).map((s, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors">
                  <div className="flex-shrink-0">
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold"
                      style={{
                        background: s.match_score >= 90 ? 'rgba(34,197,94,0.15)' : 'rgba(59,130,246,0.15)',
                        color: s.match_score >= 90 ? '#22c55e' : '#3b82f6',
                        border: `1px solid ${s.match_score >= 90 ? 'rgba(34,197,94,0.3)' : 'rgba(59,130,246,0.3)'}`,
                      }}
                    >
                      {s.match_score}%
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate" style={{ color: '#f9fafb' }}>{s.signal_title}</p>
                    <p className="text-xs mt-0.5 truncate" style={{ color: '#6b7280' }}>
                      Matched: <span style={{ color: '#3b82f6' }}>{s.company_name}</span>
                    </p>
                  </div>
                  <button
                    onClick={() => addToPipeline.mutate(s.signal_id)}
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-colors flex-shrink-0"
                    style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.3)' }}
                    disabled={addToPipeline.isPending}
                  >
                    <PlusCircle size={11} />
                    Add to Pipeline
                  </button>
                  <button
                    onClick={() => {
                      const key = s.company_number || ('name_' + s.company_name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '').slice(0, 80))
                      openDossier(key, s.company_name, s.company_number)
                    }}
                    className="flex items-center gap-1 text-xs px-2 py-1.5 rounded-lg hover:bg-white/10 transition-colors flex-shrink-0"
                    style={{ color: '#6b7280' }}
                    title="View Dossier"
                  >
                    <BookOpen size={11} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Section 2 - KPIs */}
        <div className="grid grid-cols-6 gap-3">
          <KPICard label="Active Opportunities" value={tenders?.total || 0} color="#ef4444" icon={<FileText size={14} />} onClick={() => navigate('/tenders')} />
          <KPICard label="Hot Signals" value={hotSignals} color="#f59e0b" icon={<Rss size={14} />} onClick={() => navigate('/signals')} subtitle="priority = hot" />
          <KPICard label="Pipeline Leads" value={pipelineStats?.total || 0} color="#3b82f6" icon={<Kanban size={14} />} onClick={() => navigate('/pipeline')} />
          <KPICard label="Data Freshness" value={dataFreshness} color="#22c55e" icon={<Database size={14} />} onClick={() => navigate('/system')} isText />
          <KPICard label="Competitors" value={status?.data_counts.competitors || 0} color="#a855f7" icon={<Eye size={14} />} onClick={() => navigate('/market')} />
          <KPICard label="Prospects" value={status?.data_counts.prospects || 0} color="#14b8a6" icon={<Target size={14} />} onClick={() => navigate('/market')} />
        </div>

        {/* Section 3 - Intelligence Briefing */}
        <div className="grid gap-4" style={{ gridTemplateColumns: '2fr 1fr' }}>
          {/* Left: Feed */}
          <Card>
            <CardHeader>
              <CardTitle>Live Intelligence Feed</CardTitle>
              <div className="flex items-center gap-2">
                <span className="text-xs" style={{ color: '#6b7280' }}>{feed ? `${feed.total} events` : ''}</span>
                <button onClick={() => navigate('/signals')} className="text-xs px-2 py-0.5 rounded hover:bg-white/5" style={{ color: '#3b82f6' }}>View All</button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {feedLoading ? <LoadingSpinner /> : !feed?.events.length ? (
                <EmptyState icon={<Rss size={32} />} title="No feed events yet" description="Run a scan to populate the feed" />
              ) : (
                <div className="divide-y divide-gray-800" style={{ maxHeight: 400, overflowY: 'auto' }}>
                  {feed.events.slice(0, 20).map((event, i) => (
                    <div key={i} className="flex items-start gap-3 px-4 py-3 hover:bg-white/5 transition-colors group">
                      <span className="text-base flex-shrink-0 mt-0.5">{event.icon}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm truncate" style={{ color: '#f9fafb' }}>{event.title}</p>
                        <p className="text-xs truncate mt-0.5" style={{ color: '#6b7280' }}>{event.subtitle}</p>
                      </div>
                      <div className="flex-shrink-0 flex flex-col items-end gap-1">
                        <span className="text-xs" style={{ color: '#374151' }}>{formatRelativeTime(event.timestamp)}</span>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {event.score !== undefined && <ScoreBadge score={event.score} />}
                          {event.link && (
                            <a href={event.link} target="_blank" rel="noopener noreferrer" className="p-1 rounded hover:bg-white/10">
                              <ExternalLink size={10} style={{ color: '#6b7280' }} />
                            </a>
                          )}
                          <button onClick={(e) => { e.stopPropagation(); const n = event.title || ''; if (n) openDossier(slugify(n), n) }} className="p-1 rounded hover:bg-white/10" title="View Dossier">
                            <BookOpen size={10} style={{ color: '#6b7280' }} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Right sidebar */}
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Intel Map</CardTitle>
                <span className="text-xs" style={{ color: '#6b7280' }}>{mapData?.metadata?.total_features || 0} pts</span>
              </CardHeader>
              <div style={{ height: 180 }}><MiniMap data={mapData} /></div>
            </Card>

            <Card>
              <CardHeader><CardTitle>Pipeline</CardTitle><span className="text-xs font-mono" style={{ color: '#6b7280' }}>{pipelineStats?.total || 0}</span></CardHeader>
              <CardContent>
                {pipelineChartData.length === 0 ? <p className="text-xs text-center py-2" style={{ color: '#4b5563' }}>No pipeline data</p> : (
                  <div className="space-y-2">{pipelineChartData.map(d => <ProgressBar key={d.name} label={d.name} value={d.count} max={maxPC} color={d.color} count={d.count} />)}</div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Last Scans</CardTitle></CardHeader>
              <CardContent className="p-0">
                {lastScans.length === 0 ? <p className="text-xs text-center py-4" style={{ color: '#4b5563' }}>No scan history</p> : (
                  <div className="divide-y" style={{ borderColor: '#1f2937' }}>
                    {lastScans.map((run, i) => (
                      <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                        <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: run.status === 'completed' ? '#22c55e' : run.status === 'failed' ? '#ef4444' : '#f59e0b' }} />
                        <p className="text-xs font-medium capitalize truncate flex-1" style={{ color: '#f9fafb' }}>{run.scan_type?.replace(/_/g, ' ')}</p>
                        <span className="text-xs font-mono" style={{ color: '#6b7280' }}>{run.records_written || 0}</span>
                        <span className="text-xs" style={{ color: '#374151' }}>{formatRelativeTime(run.completed_at || run.started_at)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Section 4 - Weekly Trends (collapsible) */}
        <Card>
          <button onClick={() => setTrendsOpen(v => !v)} className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/5 transition-colors">
            <div className="flex items-center gap-2">
              <CardTitle>Weekly Trends</CardTitle>
              <span className="text-xs" style={{ color: '#4b5563' }}>{weeklyTrends.length > 0 ? `${weeklyTrends.length} weeks` : 'No data'}</span>
            </div>
            {trendsOpen ? <ChevronUp size={14} style={{ color: '#6b7280' }} /> : <ChevronDown size={14} style={{ color: '#6b7280' }} />}
          </button>
          {trendsOpen && weeklyTrends.length > 0 && (
            <CardContent>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-xs mb-2" style={{ color: '#6b7280' }}>Tenders / Week</p>
                  <ResponsiveContainer width="100%" height={120}>
                    <BarChart data={weeklyTrends}>
                      <XAxis dataKey="week" tick={{ fontSize: 9, fill: '#6b7280' }} />
                      <YAxis tick={{ fontSize: 9, fill: '#6b7280' }} width={20} />
                      <Tooltip contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: 6, fontSize: 11 }} />
                      <Bar dataKey="tenders" fill="#ef4444" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div>
                  <p className="text-xs mb-2" style={{ color: '#6b7280' }}>Signals / Week</p>
                  <ResponsiveContainer width="100%" height={120}>
                    <LineChart data={weeklyTrends}>
                      <XAxis dataKey="week" tick={{ fontSize: 9, fill: '#6b7280' }} />
                      <YAxis tick={{ fontSize: 9, fill: '#6b7280' }} width={20} />
                      <Tooltip contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: 6, fontSize: 11 }} />
                      <Line type="monotone" dataKey="signals" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <div>
                  <p className="text-xs mb-2" style={{ color: '#6b7280' }}>Pipeline Leads / Week</p>
                  <ResponsiveContainer width="100%" height={120}>
                    <BarChart data={weeklyTrends}>
                      <XAxis dataKey="week" tick={{ fontSize: 9, fill: '#6b7280' }} />
                      <YAxis tick={{ fontSize: 9, fill: '#6b7280' }} width={20} />
                      <Tooltip contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: 6, fontSize: 11 }} />
                      <Bar dataKey="leads" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </CardContent>
          )}
        </Card>
      </div>
    </div>
  )
}
