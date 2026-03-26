import { useQuery, useMutation } from '@tanstack/react-query'
import { api } from '../lib/api'
import { StatCard, Card, CardHeader, CardTitle, CardContent, Button, LoadingSpinner, EmptyState, ProgressBar, ScoreBadge, StatusBadge, PageHeader } from '../components/ui'
import { formatRelativeTime, formatCurrency, parseScore } from '../lib/utils'
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts'
import { FileText, Rss, Kanban, Trophy, Play, ExternalLink, AlertCircle, Clock } from 'lucide-react'
import MiniMap from '../components/MiniMap'

const PIPELINE_STAGE_ORDER = ['Not Contacted', 'Email 1 Sent', 'Email 2 Sent', 'Warm / Meeting', 'Pilot Live', 'Won']
const STAGE_COLORS: Record<string, string> = {
  'Not Contacted': '#6b7280',
  'Email 1 Sent': '#f59e0b',
  'Email 2 Sent': '#f97316',
  'Warm / Meeting': '#3b82f6',
  'Pilot Live': '#8b5cf6',
  'Won': '#22c55e',
}

export default function CommandCenter() {
  const { data: status } = useQuery({ queryKey: ['status'], queryFn: api.status, refetchInterval: 60_000 })
  const { data: pipelineStats, isLoading: statsLoading } = useQuery({ queryKey: ['pipeline-stats'], queryFn: api.pipelineStats, refetchInterval: 30_000 })
  const { data: feed, isLoading: feedLoading } = useQuery({ queryKey: ['feed'], queryFn: () => api.feed(20), refetchInterval: 30_000 })
  const { data: tenders } = useQuery({ queryKey: ['tenders-hot'], queryFn: () => api.tenders({ min_score: 40 }), refetchInterval: 60_000 })
  const { data: pipeline } = useQuery({ queryKey: ['pipeline-top'], queryFn: () => api.pipeline({ limit: 5 }), refetchInterval: 60_000 })
  const { data: mapData } = useQuery({ queryKey: ['map-mini'], queryFn: () => api.mapAll({ prospect_limit: 100, competitor_limit: 50 }), refetchInterval: 120_000 })

  const scanAll = useMutation({
    mutationFn: async () => {
      await Promise.allSettled([api.scanTenders(), api.scanSignals()])
    },
  })

  const hotTenders = (tenders?.tenders || []).filter(t => String(t.classification).includes('HOT')).length
  const warmSignals = (status?.data_counts.signals || 0)
  const pipelineLeads = pipelineStats?.total || 0

  // Pipeline chart data
  const pipelineChartData = PIPELINE_STAGE_ORDER
    .map(stage => ({
      name: stage.replace('Email 1 Sent', 'Email 1').replace('Email 2 Sent', 'Email 2').replace('Warm / Meeting', 'Warm').replace('Not Contacted', 'Not Contacted').replace('Pilot Live', 'Pilot'),
      count: pipelineStats?.by_status?.[stage] || 0,
      color: STAGE_COLORS[stage] || '#6b7280',
    }))
    .filter(d => d.count > 0)

  const maxCount = Math.max(...pipelineChartData.map(d => d.count), 1)

  // Top leads by score
  const topLeads = [...(pipeline?.leads || [])]
    .sort((a, b) => parseScore(b.score) - parseScore(a.score))
    .slice(0, 5)

  // Upcoming actions
  const upcomingActions = (pipeline?.leads || [])
    .filter(l => l.next_action_due_date)
    .sort((a, b) => new Date(a.next_action_due_date).getTime() - new Date(b.next_action_due_date).getTime())
    .slice(0, 5)

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <PageHeader
        title="COMMAND CENTER"
        subtitle="Security intelligence overview"
        actions={
          <Button
            variant="primary"
            size="sm"
            loading={scanAll.isPending}
            onClick={() => scanAll.mutate()}
          >
            <Play size={12} />
            Scan All
          </Button>
        }
      />

      <div className="flex-1 p-6 space-y-6">
        {/* KPI Cards */}
        <div className="grid grid-cols-4 gap-4">
          <StatCard
            title="Hot Tenders"
            value={hotTenders}
            subtitle={`${tenders?.total || 0} total found`}
            icon={<FileText size={16} />}
            color="#ef4444"
            trend={hotTenders > 0 ? 'up' : 'flat'}
            trendLabel="active"
          />
          <StatCard
            title="Signals"
            value={warmSignals}
            subtitle="news & crime signals"
            icon={<Rss size={16} />}
            color="#f59e0b"
          />
          <StatCard
            title="Pipeline Leads"
            value={pipelineLeads}
            subtitle="tracked companies"
            icon={<Kanban size={16} />}
            color="#3b82f6"
          />
          <StatCard
            title="Data Sources"
            value={`${status?.data_counts.tenders || 0}T`}
            subtitle={`${status?.data_counts.prospects || 0} prospects · ${status?.data_counts.briefs || 0} briefs`}
            icon={<Trophy size={16} />}
            color="#22c55e"
          />
        </div>

        {/* Live Feed + Mini Map */}
        <div className="grid grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Live Intelligence Feed</CardTitle>
              <span className="text-xs" style={{ color: '#6b7280' }}>
                {feed ? formatRelativeTime(feed.generated_at) : ''}
              </span>
            </CardHeader>
            <CardContent className="p-0">
              {feedLoading ? (
                <LoadingSpinner />
              ) : !feed?.events.length ? (
                <EmptyState
                  icon={<Rss size={32} />}
                  title="No feed events yet"
                  description="Run a scan to populate the feed"
                />
              ) : (
                <div className="divide-y divide-gray-800" style={{ maxHeight: 320, overflowY: 'auto' }}>
                  {feed.events.map((event, i) => (
                    <div key={i} className="flex items-start gap-3 px-4 py-3 hover:bg-white/5 transition-colors">
                      <span className="text-base flex-shrink-0 mt-0.5">{event.icon}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm truncate" style={{ color: '#f9fafb' }}>{event.title}</p>
                        <p className="text-xs truncate mt-0.5" style={{ color: '#6b7280' }}>{event.subtitle}</p>
                        {event.detail && (
                          <p className="text-xs mt-0.5 truncate" style={{ color: '#4b5563' }}>{event.detail}</p>
                        )}
                      </div>
                      <div className="flex-shrink-0 flex flex-col items-end gap-1">
                        <span className="text-xs" style={{ color: '#374151' }}>{formatRelativeTime(event.timestamp)}</span>
                        {event.link && (
                          <a href={event.link} target="_blank" rel="noopener noreferrer">
                            <ExternalLink size={10} style={{ color: '#374151' }} />
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Intelligence Map</CardTitle>
              <span className="text-xs" style={{ color: '#6b7280' }}>
                {mapData?.metadata?.total_features || 0} features
              </span>
            </CardHeader>
            <div style={{ height: 320 }}>
              <MiniMap data={mapData} />
            </div>
          </Card>
        </div>

        {/* Pipeline Snapshot */}
        <Card>
          <CardHeader>
            <CardTitle>Pipeline Snapshot</CardTitle>
            <span className="text-xs" style={{ color: '#6b7280' }}>{pipelineLeads} total leads</span>
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <LoadingSpinner size={20} />
            ) : pipelineChartData.length === 0 ? (
              <EmptyState
                icon={<Kanban size={32} />}
                title="No pipeline data"
                description="Add leads to your pipeline to see the snapshot"
              />
            ) : (
              <div className="space-y-3">
                {pipelineChartData.map(d => (
                  <ProgressBar
                    key={d.name}
                    label={d.name}
                    value={d.count}
                    max={maxCount}
                    color={d.color}
                    count={d.count}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top Leads + Upcoming Actions */}
        <div className="grid grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Top Leads</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {topLeads.length === 0 ? (
                <EmptyState icon={<AlertCircle size={24} />} title="No leads yet" />
              ) : (
                <div className="divide-y divide-gray-800">
                  {topLeads.map((lead, i) => (
                    <div key={lead.company_id} className="flex items-center gap-3 px-4 py-3">
                      <span className="text-xs font-mono w-5" style={{ color: '#374151' }}>{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm truncate" style={{ color: '#f9fafb' }}>{lead.company_name}</p>
                        <p className="text-xs" style={{ color: '#6b7280' }}>{lead.company_type}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusBadge status={lead.status} />
                        <ScoreBadge score={lead.score} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Upcoming Actions</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {upcomingActions.length === 0 ? (
                <EmptyState icon={<Clock size={24} />} title="No upcoming actions" />
              ) : (
                <div className="divide-y divide-gray-800">
                  {upcomingActions.map(lead => (
                    <div key={lead.company_id} className="flex items-start gap-3 px-4 py-3">
                      <Clock size={14} className="mt-0.5 flex-shrink-0" style={{ color: '#f59e0b' }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm" style={{ color: '#f9fafb' }}>{lead.company_name}</p>
                        <p className="text-xs truncate mt-0.5" style={{ color: '#9ca3af' }}>{lead.next_action}</p>
                      </div>
                      <span className="text-xs flex-shrink-0" style={{ color: '#6b7280' }}>
                        {formatRelativeTime(lead.next_action_due_date)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Tender Pipeline Chart */}
        {tenders && tenders.tenders.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Tender Score Distribution</CardTitle>
              <span className="text-xs" style={{ color: '#6b7280' }}>{tenders.total} tenders</span>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={tenders.tenders.slice(0, 10).map(t => ({
                  name: t.buyer?.split(' ')[0] || 'Unknown',
                  score: parseScore(t.score),
                }))}>
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#6b7280' }} />
                  <YAxis tick={{ fontSize: 10, fill: '#6b7280' }} domain={[0, 100]} />
                  <Tooltip
                    contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: 6 }}
                    labelStyle={{ color: '#9ca3af' }}
                    itemStyle={{ color: '#f9fafb' }}
                  />
                  <Bar dataKey="score" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
