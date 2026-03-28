import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { Card, CardHeader, CardTitle, CardContent, PageHeader, LoadingSpinner, EmptyState } from '../components/ui'
import { parseScore } from '../lib/utils'
import {
  BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Legend,
  PieChart, Pie, Cell, LineChart, Line, CartesianGrid,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
} from 'recharts'
import { BarChart3 } from 'lucide-react'

const COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316', '#ec4899']

const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) => {
  if (active && payload && payload.length) {
    return (
      <div className="rounded-lg p-3 border" style={{ background: '#1f2937', borderColor: '#374151' }}>
        <p className="text-xs mb-1" style={{ color: '#9ca3af' }}>{label}</p>
        {payload.map((p, i) => (
          <p key={i} className="text-xs font-medium" style={{ color: p.color }}>
            {p.name}: {p.value}
          </p>
        ))}
      </div>
    )
  }
  return null
}

export default function Analytics() {
  const { data: pipelineStats, isLoading: statsLoading } = useQuery({
    queryKey: ['pipeline-stats'],
    queryFn: api.pipelineStats,
    refetchInterval: 60_000,
  })

  const { data: tenders } = useQuery({
    queryKey: ['tenders'],
    queryFn: () => api.tenders(),
    refetchInterval: 120_000,
  })

  const { data: signals } = useQuery({
    queryKey: ['signals'],
    queryFn: () => api.signals({ limit: 200 }),
    refetchInterval: 120_000,
  })

  const { data: competitors } = useQuery({
    queryKey: ['competitors'],
    queryFn: () => api.competitors({ limit: 200 }),
    refetchInterval: 120_000,
  })

  const { data: status } = useQuery({
    queryKey: ['status'],
    queryFn: api.status,
    refetchInterval: 60_000,
  })

  // Pipeline by status
  const pipelineStatusData = pipelineStats?.by_status
    ? Object.entries(pipelineStats.by_status).map(([name, value]) => ({ name, value }))
    : []

  // Pipeline by tier
  const pipelineTierData = pipelineStats?.by_tier
    ? Object.entries(pipelineStats.by_tier).map(([name, value]) => ({ name: `Tier ${name}`, value }))
    : []

  // Pipeline by type
  const pipelineTypeData = pipelineStats?.by_type
    ? Object.entries(pipelineStats.by_type).map(([name, value]) => ({ name, value }))
    : []

  // Tender score distribution
  const tenderScoreBuckets = [
    { name: '0-20', count: 0 },
    { name: '21-40', count: 0 },
    { name: '41-60', count: 0 },
    { name: '61-80', count: 0 },
    { name: '81-100', count: 0 },
  ]
  ;(tenders?.tenders || []).forEach(t => {
    const s = parseScore(t.score)
    if (s <= 20) tenderScoreBuckets[0].count++
    else if (s <= 40) tenderScoreBuckets[1].count++
    else if (s <= 60) tenderScoreBuckets[2].count++
    else if (s <= 80) tenderScoreBuckets[3].count++
    else tenderScoreBuckets[4].count++
  })

  // Signals by type
  const signalTypeData = (signals?.signals || []).reduce<Record<string, number>>((acc, s) => {
    acc[s.type] = (acc[s.type] || 0) + 1
    return acc
  }, {})
  const signalTypePieData = Object.entries(signalTypeData).map(([name, value]) => ({ name, value }))

  // Signals by priority
  const signalPriorityData = (signals?.signals || []).reduce<Record<string, number>>((acc, s) => {
    acc[s.priority] = (acc[s.priority] || 0) + 1
    return acc
  }, {})

  // Competitor SIC distribution
  const competitorSicData = (competitors?.competitors || []).reduce<Record<string, number>>((acc, c) => {
    const sic = c.sic_codes?.split(',')[0]?.trim() || 'Unknown'
    acc[sic] = (acc[sic] || 0) + 1
    return acc
  }, {})
  const topCompetitorSics = Object.entries(competitorSicData)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, value]) => ({ name, value }))

  // Overview radar
  const radarData = [
    { subject: 'Tenders', A: Math.min(100, (tenders?.total || 0) * 2) },
    { subject: 'Prospects', A: Math.min(100, ((status?.data_counts.prospects || 0) / 10)) },
    { subject: 'Signals', A: Math.min(100, (signals?.total || 0) * 5) },
    { subject: 'Pipeline', A: Math.min(100, (pipelineStats?.total || 0) * 3) },
    { subject: 'Competitors', A: Math.min(100, (competitors?.total || 0) / 5) },
    { subject: 'Dossiers', A: Math.min(100, (status?.data_counts.dossiers || 0) * 10) },
  ]

  if (statsLoading) return <LoadingSpinner />

  const hasData = (pipelineStats?.total || 0) > 0 || (tenders?.total || 0) > 0 || (signals?.total || 0) > 0

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <PageHeader
        title="ANALYTICS"
        subtitle="Intelligence data visualisation and trends"
      />

      <div className="p-6 space-y-6">
        {!hasData ? (
          <EmptyState
            icon={<BarChart3 size={48} />}
            title="No data to visualise"
            description="Run scans to populate analytics charts"
          />
        ) : (
          <>
            {/* Overview row */}
            <div className="grid grid-cols-4 gap-4">
              {[
                { label: 'Total Tenders', value: tenders?.total || 0, color: '#f59e0b' },
                { label: 'Total Signals', value: signals?.total || 0, color: '#ef4444' },
                { label: 'Pipeline Leads', value: pipelineStats?.total || 0, color: '#3b82f6' },
                { label: 'Competitors', value: competitors?.total || 0, color: '#8b5cf6' },
              ].map(item => (
                <div key={item.label} className="rounded-xl p-4 border" style={{ background: '#111827', borderColor: '#1f2937' }}>
                  <p className="text-xs uppercase tracking-wider mb-1" style={{ color: '#6b7280' }}>{item.label}</p>
                  <p className="text-3xl font-bold" style={{ color: item.color }}>{item.value}</p>
                </div>
              ))}
            </div>

            {/* Intelligence Coverage Radar + Pipeline Status */}
            <div className="grid grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle>Intelligence Coverage</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={250}>
                    <RadarChart data={radarData}>
                      <PolarGrid stroke="#1f2937" />
                      <PolarAngleAxis dataKey="subject" tick={{ fontSize: 11, fill: '#9ca3af' }} />
                      <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fontSize: 9, fill: '#374151' }} />
                      <Radar name="Coverage" dataKey="A" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.2} />
                    </RadarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Pipeline by Status</CardTitle>
                </CardHeader>
                <CardContent>
                  {pipelineStatusData.length === 0 ? (
                    <EmptyState icon={<BarChart3 size={24} />} title="No pipeline data" />
                  ) : (
                    <ResponsiveContainer width="100%" height={250}>
                      <BarChart data={pipelineStatusData} layout="vertical">
                        <XAxis type="number" tick={{ fontSize: 10, fill: '#6b7280' }} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: '#9ca3af' }} width={100} />
                        <Tooltip content={<CustomTooltip />} />
                        <Bar dataKey="value" fill="#3b82f6" radius={[0, 4, 4, 0]}>
                          {pipelineStatusData.map((_, index) => (
                            <Cell key={index} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Tender Score Distribution + Signal Types */}
            <div className="grid grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle>Tender Score Distribution</CardTitle>
                  <span className="text-xs" style={{ color: '#6b7280' }}>{tenders?.total || 0} tenders</span>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={tenderScoreBuckets}>
                      <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#6b7280' }} />
                      <YAxis tick={{ fontSize: 10, fill: '#6b7280' }} />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                        {tenderScoreBuckets.map((_, i) => (
                          <Cell key={i} fill={['#6b7280', '#22c55e', '#f59e0b', '#f97316', '#ef4444'][i]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Signal Types</CardTitle>
                  <span className="text-xs" style={{ color: '#6b7280' }}>{signals?.total || 0} signals</span>
                </CardHeader>
                <CardContent>
                  {signalTypePieData.length === 0 ? (
                    <EmptyState icon={<BarChart3 size={24} />} title="No signal data" />
                  ) : (
                    <div className="flex items-center gap-4">
                      <ResponsiveContainer width="60%" height={200}>
                        <PieChart>
                          <Pie
                            data={signalTypePieData}
                            cx="50%"
                            cy="50%"
                            innerRadius={50}
                            outerRadius={80}
                            paddingAngle={3}
                            dataKey="value"
                          >
                            {signalTypePieData.map((_, index) => (
                              <Cell key={index} fill={COLORS[index % COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip content={<CustomTooltip />} />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="space-y-2">
                        {signalTypePieData.map((item, i) => (
                          <div key={item.name} className="flex items-center gap-2">
                            <div className="rounded-full" style={{ width: 8, height: 8, background: COLORS[i % COLORS.length] }} />
                            <span className="text-xs" style={{ color: '#9ca3af' }}>{item.name}</span>
                            <span className="text-xs font-mono ml-auto" style={{ color: '#f9fafb' }}>{item.value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Pipeline by Type + Competitor SIC */}
            <div className="grid grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle>Pipeline by Company Type</CardTitle>
                </CardHeader>
                <CardContent>
                  {pipelineTypeData.length === 0 ? (
                    <EmptyState icon={<BarChart3 size={24} />} title="No pipeline data" />
                  ) : (
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={pipelineTypeData}>
                        <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#6b7280' }} />
                        <YAxis tick={{ fontSize: 10, fill: '#6b7280' }} />
                        <Tooltip content={<CustomTooltip />} />
                        <Bar dataKey="value" fill="#22c55e" radius={[4, 4, 0, 0]}>
                          {pipelineTypeData.map((_, i) => (
                            <Cell key={i} fill={COLORS[i % COLORS.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Competitor SIC Codes</CardTitle>
                  <span className="text-xs" style={{ color: '#6b7280' }}>{competitors?.total || 0} competitors</span>
                </CardHeader>
                <CardContent>
                  {topCompetitorSics.length === 0 ? (
                    <EmptyState icon={<BarChart3 size={24} />} title="No competitor data" />
                  ) : (
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={topCompetitorSics} layout="vertical">
                        <XAxis type="number" tick={{ fontSize: 10, fill: '#6b7280' }} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 9, fill: '#9ca3af' }} width={70} />
                        <Tooltip content={<CustomTooltip />} />
                        <Bar dataKey="value" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Signal Priority breakdown */}
            {Object.keys(signalPriorityData).length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Signal Priority Breakdown</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-6">
                    {Object.entries(signalPriorityData).map(([priority, count]) => {
                      const color = priority === 'hot' ? '#ef4444' : priority === 'warm' ? '#f59e0b' : '#22c55e'
                      const total = signals?.total || 1
                      return (
                        <div key={priority} className="flex-1">
                          <div className="flex justify-between mb-1">
                            <span className="text-xs capitalize" style={{ color }}>{priority}</span>
                            <span className="text-xs font-mono" style={{ color: '#f9fafb' }}>{count}</span>
                          </div>
                          <div className="rounded-full overflow-hidden" style={{ height: 8, background: '#1f2937' }}>
                            <div
                              className="h-full rounded-full"
                              style={{ width: `${(count / total) * 100}%`, background: color }}
                            />
                          </div>
                          <p className="text-xs mt-1" style={{ color: '#374151' }}>
                            {((count / total) * 100).toFixed(0)}%
                          </p>
                        </div>
                      )
                    })}
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  )
}
