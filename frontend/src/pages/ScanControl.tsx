import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { Card, CardHeader, CardTitle, CardContent, Button, PageHeader, LoadingSpinner } from '../components/ui'
import { formatRelativeTime } from '../lib/utils'
import { ScanLine, Play, CheckCircle, XCircle, Clock, Zap } from 'lucide-react'

interface ScanJob {
  id: string
  type: string
  label: string
  description: string
  status: 'idle' | 'running' | 'success' | 'error'
  lastRun?: string
  result?: string
  color: string
  icon: string
}

export default function ScanControl() {
  const queryClient = useQueryClient()
  const [jobs, setJobs] = useState<ScanJob[]>([
    {
      id: 'tenders',
      type: 'tenders',
      label: 'Tender Radar Scan',
      description: 'Scrape Contracts Finder for new security tenders in your region',
      status: 'idle',
      color: '#f59e0b',
      icon: '📋',
    },
    {
      id: 'prospects',
      type: 'prospects',
      label: 'Prospect Discovery',
      description: 'Search Companies House for new prospect companies matching your criteria',
      status: 'idle',
      color: '#3b82f6',
      icon: '🏢',
    },
    {
      id: 'competitors',
      type: 'competitors',
      label: 'Competitor Mapping',
      description: 'Identify competitor security companies in your target region',
      status: 'idle',
      color: '#ef4444',
      icon: '👁️',
    },
    {
      id: 'signals',
      type: 'signals',
      label: 'Signal Intelligence',
      description: 'Collect news, crime data, and market signals relevant to your territory',
      status: 'idle',
      color: '#8b5cf6',
      icon: '📡',
    },
  ])

  const { data: status } = useQuery({
    queryKey: ['status'],
    queryFn: api.status,
    refetchInterval: 30_000,
  })

  const updateJob = (id: string, updates: Partial<ScanJob>) => {
    setJobs(prev => prev.map(j => j.id === id ? { ...j, ...updates } : j))
  }

  const runScan = async (job: ScanJob) => {
    updateJob(job.id, { status: 'running', result: undefined })
    try {
      let result
      if (job.type === 'tenders') result = await api.scanTenders(30)
      else if (job.type === 'prospects') result = await api.scanProspects()
      else if (job.type === 'competitors') result = await api.scanCompetitors()
      else if (job.type === 'signals') result = await api.scanSignals()

      const resultStr = result
        ? Object.entries(result)
            .filter(([k]) => !['status', 'type'].includes(k))
            .map(([k, v]) => `${k}: ${v}`)
            .join(', ')
        : 'Completed'

      updateJob(job.id, {
        status: 'success',
        lastRun: new Date().toISOString(),
        result: resultStr || 'Scan completed successfully',
      })

      // Invalidate relevant queries
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: [job.type] })
        queryClient.invalidateQueries({ queryKey: ['status'] })
        queryClient.invalidateQueries({ queryKey: ['feed'] })
      }, 2000)
    } catch (err) {
      updateJob(job.id, {
        status: 'error',
        result: err instanceof Error ? err.message : 'Scan failed',
      })
    }
  }

  const runAllScans = async () => {
    for (const job of jobs) {
      await runScan(job)
    }
  }

  const anyRunning = jobs.some(j => j.status === 'running')

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <PageHeader
        title="SCAN CONTROL"
        subtitle="Manage intelligence gathering operations"
        actions={
          <Button
            variant="primary"
            size="sm"
            loading={anyRunning}
            onClick={runAllScans}
          >
            <Zap size={12} />
            Run All Scans
          </Button>
        }
      />

      <div className="p-6 space-y-6">
        {/* System status */}
        <div className="grid grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle>System Status</CardTitle>
            </CardHeader>
            <CardContent>
              {status ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs" style={{ color: '#6b7280' }}>API Status</span>
                    <span className="flex items-center gap-1.5 text-xs" style={{ color: status.status === 'ok' ? '#22c55e' : '#ef4444' }}>
                      <div className="rounded-full pulse-dot" style={{ width: 6, height: 6, background: status.status === 'ok' ? '#22c55e' : '#ef4444' }} />
                      {status.status === 'ok' ? 'Online' : 'Error'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs" style={{ color: '#6b7280' }}>Companies House API</span>
                    <span className="text-xs" style={{ color: status.api_keys.companies_house ? '#22c55e' : '#ef4444' }}>
                      {status.api_keys.companies_house ? '✅ Connected' : '❌ Not configured'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs" style={{ color: '#6b7280' }}>OpenAI API</span>
                    <span className="text-xs" style={{ color: status.api_keys.openai ? '#22c55e' : '#ef4444' }}>
                      {status.api_keys.openai ? '✅ Connected' : '❌ Not configured'}
                    </span>
                  </div>
                  <div className="border-t pt-3" style={{ borderColor: '#1f2937' }}>
                    <p className="text-xs mb-2" style={{ color: '#6b7280' }}>Data Counts</p>
                    <div className="grid grid-cols-2 gap-2">
                      {Object.entries(status.data_counts).map(([k, v]) => (
                        <div key={k} className="flex justify-between">
                          <span className="text-xs capitalize" style={{ color: '#6b7280' }}>{k}</span>
                          <span className="text-xs font-mono" style={{ color: '#f9fafb' }}>{v}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <LoadingSpinner size={20} />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Scan History</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {jobs.map(job => (
                  <div key={job.id} className="flex items-center gap-3">
                    <span className="text-base">{job.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs" style={{ color: '#9ca3af' }}>{job.label}</p>
                      {job.lastRun && (
                        <p className="text-xs" style={{ color: '#374151' }}>{formatRelativeTime(job.lastRun)}</p>
                      )}
                    </div>
                    <div>
                      {job.status === 'idle' && <Clock size={14} style={{ color: '#374151' }} />}
                      {job.status === 'running' && (
                        <div className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: job.color, borderTopColor: 'transparent' }} />
                      )}
                      {job.status === 'success' && <CheckCircle size={14} style={{ color: '#22c55e' }} />}
                      {job.status === 'error' && <XCircle size={14} style={{ color: '#ef4444' }} />}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Scan cards */}
        <div className="grid grid-cols-2 gap-4">
          {jobs.map(job => (
            <div
              key={job.id}
              className="rounded-xl border p-5"
              style={{
                background: '#111827',
                borderColor: job.status === 'running' ? job.color + '40' : '#1f2937',
              }}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div
                    className="flex items-center justify-center rounded-xl text-xl"
                    style={{ width: 44, height: 44, background: `${job.color}15`, border: `1px solid ${job.color}30` }}
                  >
                    {job.icon}
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold" style={{ color: '#f9fafb' }}>{job.label}</h3>
                    {job.lastRun && (
                      <p className="text-xs" style={{ color: '#6b7280' }}>Last: {formatRelativeTime(job.lastRun)}</p>
                    )}
                  </div>
                </div>
                <div>
                  {job.status === 'idle' && <Clock size={16} style={{ color: '#374151' }} />}
                  {job.status === 'running' && (
                    <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: job.color, borderTopColor: 'transparent' }} />
                  )}
                  {job.status === 'success' && <CheckCircle size={16} style={{ color: '#22c55e' }} />}
                  {job.status === 'error' && <XCircle size={16} style={{ color: '#ef4444' }} />}
                </div>
              </div>

              <p className="text-xs mb-4" style={{ color: '#6b7280' }}>{job.description}</p>

              {job.result && (
                <div
                  className="rounded-lg p-2 mb-3 text-xs font-mono"
                  style={{
                    background: job.status === 'error' ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)',
                    color: job.status === 'error' ? '#ef4444' : '#22c55e',
                    border: `1px solid ${job.status === 'error' ? 'rgba(239,68,68,0.2)' : 'rgba(34,197,94,0.2)'}`,
                  }}
                >
                  {job.result}
                </div>
              )}

              <Button
                variant="primary"
                size="sm"
                loading={job.status === 'running'}
                onClick={() => runScan(job)}
                className="w-full justify-center"
                style={{ background: `${job.color}20`, borderColor: `${job.color}40`, color: job.color }}
              >
                <Play size={12} />
                {job.status === 'running' ? 'Scanning...' : 'Run Scan'}
              </Button>
            </div>
          ))}
        </div>

        {/* Settings preview */}
        {status?.settings && (
          <Card>
            <CardHeader>
              <CardTitle>Active Configuration</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-4 gap-4">
                {Object.entries(status.settings).map(([k, v]) => (
                  <div key={k}>
                    <p className="text-xs" style={{ color: '#6b7280' }}>{k.replace(/_/g, ' ')}</p>
                    <p className="text-sm font-medium mt-0.5" style={{ color: '#f9fafb' }}>{String(v)}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
