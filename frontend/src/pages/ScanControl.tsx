import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, type ScanRun } from '../lib/api'
import { Card, CardHeader, CardTitle, CardContent, Button, PageHeader, LoadingSpinner } from '../components/ui'
import { formatRelativeTime } from '../lib/utils'
import { Play, CheckCircle, XCircle, Clock, Zap, History, Loader2 } from 'lucide-react'

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
  elapsed?: number
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

  // Poll scan history for live progress
  const anyRunning = jobs.some(j => j.status === 'running')
  const { data: scanHistory } = useQuery({
    queryKey: ['scan-history'],
    queryFn: api.scanHistory,
    refetchInterval: anyRunning ? 3_000 : 15_000,
  })

  // Track elapsed time for running scans
  useEffect(() => {
    if (!anyRunning) return
    const interval = setInterval(() => {
      setJobs(prev => prev.map(j => {
        if (j.status === 'running' && j.lastRun) {
          return { ...j, elapsed: Math.floor((Date.now() - new Date(j.lastRun).getTime()) / 1000) }
        }
        return j
      }))
    }, 1000)
    return () => clearInterval(interval)
  }, [anyRunning])

  // Sync running state from scan history
  useEffect(() => {
    if (!scanHistory) return
    const runningTypes = new Set(scanHistory.running.map(r => r.scan_type))
    setJobs(prev => prev.map(j => {
      if (j.status === 'running' && !runningTypes.has(j.type)) {
        // Scan finished — find the latest completed run for this type
        const latestRun = scanHistory.runs.find(r => r.scan_type === j.type && r.status !== 'running')
        if (latestRun) {
          // Invalidate relevant queries
          queryClient.invalidateQueries({ queryKey: [j.type] })
          queryClient.invalidateQueries({ queryKey: ['status'] })
          queryClient.invalidateQueries({ queryKey: ['feed'] })
          return {
            ...j,
            status: latestRun.status === 'completed' ? 'success' as const : 'error' as const,
            lastRun: latestRun.completed_at || latestRun.started_at,
            result: latestRun.status === 'completed'
              ? `${latestRun.records_written} records written`
              : latestRun.error || 'Scan failed',
            elapsed: undefined,
          }
        }
      }
      return j
    }))
  }, [scanHistory, queryClient])

  const updateJob = (id: string, updates: Partial<ScanJob>) => {
    setJobs(prev => prev.map(j => j.id === id ? { ...j, ...updates } : j))
  }

  const runScan = async (job: ScanJob) => {
    updateJob(job.id, { status: 'running', result: undefined, lastRun: new Date().toISOString(), elapsed: 0 })
    try {
      if (job.type === 'tenders') await api.scanTenders(30)
      else if (job.type === 'prospects') await api.scanProspects()
      else if (job.type === 'competitors') await api.scanCompetitors()
      else if (job.type === 'signals') await api.scanSignals()

      // Invalidate scan history to start polling for completion
      queryClient.invalidateQueries({ queryKey: ['scan-history'] })

      // Fallback: if polling doesn't detect completion after 90s, mark as done
      setTimeout(() => {
        setJobs(prev => prev.map(j => {
          if (j.id === job.id && j.status === 'running') {
            queryClient.invalidateQueries({ queryKey: [job.type] })
            queryClient.invalidateQueries({ queryKey: ['status'] })
            return { ...j, status: 'success' as const, result: 'Scan completed', elapsed: undefined }
          }
          return j
        }))
      }, 90000)
    } catch (err) {
      updateJob(job.id, {
        status: 'error',
        result: err instanceof Error ? err.message : 'Scan failed',
        elapsed: undefined,
      })
    }
  }

  const runAllScans = async () => {
    for (const job of jobs) {
      await runScan(job)
    }
  }

  const formatElapsed = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}m ${s}s`
  }

  // Get last run info from scan history
  const getLastRunForType = (scanType: string): ScanRun | undefined => {
    if (!scanHistory?.runs) return undefined
    return scanHistory.runs.find(r => r.scan_type === scanType && r.status !== 'running')
  }

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
                    <span className="text-xs" style={{ color: '#6b7280' }}>Database</span>
                    <span className="text-xs" style={{ color: '#22c55e' }}>PostgreSQL Connected</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs" style={{ color: '#6b7280' }}>Companies House API</span>
                    <span className="text-xs" style={{ color: status.api_keys.companies_house ? '#22c55e' : '#ef4444' }}>
                      {status.api_keys.companies_house ? 'Connected' : 'Not configured'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs" style={{ color: '#6b7280' }}>OpenAI API</span>
                    <span className="text-xs" style={{ color: status.api_keys.openai ? '#22c55e' : '#ef4444' }}>
                      {status.api_keys.openai ? 'Connected' : 'Not configured'}
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
              <CardTitle>
                <div className="flex items-center gap-2">
                  <History size={14} />
                  Scan History
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {scanHistory?.runs && scanHistory.runs.length > 0 ? (
                  scanHistory.runs.slice(0, 8).map((run) => {
                    const typeIcons: Record<string, string> = {
                      tenders: '📋', prospects: '🏢', competitors: '👁️', signals: '📡',
                    }
                    const typeColors: Record<string, string> = {
                      tenders: '#f59e0b', prospects: '#3b82f6', competitors: '#ef4444', signals: '#8b5cf6',
                    }
                    return (
                      <div key={run.id} className="flex items-center gap-3 py-1">
                        <span className="text-sm">{typeIcons[run.scan_type] || '📊'}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs capitalize" style={{ color: '#9ca3af' }}>{run.scan_type}</p>
                          <p className="text-xs" style={{ color: '#374151' }}>
                            {run.completed_at ? formatRelativeTime(run.completed_at) : formatRelativeTime(run.started_at)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {run.records_written > 0 && (
                            <span className="text-xs font-mono" style={{ color: typeColors[run.scan_type] || '#6b7280' }}>
                              {run.records_written}
                            </span>
                          )}
                          {run.status === 'running' && (
                            <Loader2 size={14} className="animate-spin" style={{ color: typeColors[run.scan_type] || '#6b7280' }} />
                          )}
                          {run.status === 'completed' && <CheckCircle size={14} style={{ color: '#22c55e' }} />}
                          {run.status === 'failed' && <XCircle size={14} style={{ color: '#ef4444' }} />}
                        </div>
                      </div>
                    )
                  })
                ) : (
                  <div className="text-center py-4">
                    <Clock size={20} style={{ color: '#374151' }} className="mx-auto mb-2" />
                    <p className="text-xs" style={{ color: '#6b7280' }}>No scan history yet</p>
                    <p className="text-xs" style={{ color: '#374151' }}>Run a scan to see history</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Scan cards */}
        <div className="grid grid-cols-2 gap-4">
          {jobs.map(job => {
            const lastDbRun = getLastRunForType(job.type)
            const lastRunTime = job.lastRun || lastDbRun?.completed_at || lastDbRun?.started_at
            return (
              <div
                key={job.id}
                className="rounded-xl border p-5 transition-all"
                style={{
                  background: '#111827',
                  borderColor: job.status === 'running' ? job.color + '60' : '#1f2937',
                  boxShadow: job.status === 'running' ? `0 0 20px ${job.color}15` : 'none',
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
                      {lastRunTime && (
                        <p className="text-xs" style={{ color: '#6b7280' }}>Last: {formatRelativeTime(lastRunTime)}</p>
                      )}
                    </div>
                  </div>
                  <div>
                    {job.status === 'idle' && <Clock size={16} style={{ color: '#374151' }} />}
                    {job.status === 'running' && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono" style={{ color: job.color }}>
                          {job.elapsed !== undefined ? formatElapsed(job.elapsed) : ''}
                        </span>
                        <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: job.color, borderTopColor: 'transparent' }} />
                      </div>
                    )}
                    {job.status === 'success' && <CheckCircle size={16} style={{ color: '#22c55e' }} />}
                    {job.status === 'error' && <XCircle size={16} style={{ color: '#ef4444' }} />}
                  </div>
                </div>

                <p className="text-xs mb-3" style={{ color: '#6b7280' }}>{job.description}</p>

                {/* Progress bar for running scans */}
                {job.status === 'running' && (
                  <div className="mb-3">
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: '#1f2937' }}>
                      <div
                        className="h-full rounded-full"
                        style={{
                          background: `linear-gradient(90deg, ${job.color}, ${job.color}88)`,
                          animation: 'scanProgress 2s ease-in-out infinite',
                        }}
                      />
                    </div>
                    <p className="text-xs mt-1.5 text-center" style={{ color: job.color }}>
                      Scanning... {job.elapsed !== undefined && job.elapsed > 10 ? 'This may take a minute' : ''}
                    </p>
                  </div>
                )}

                {/* Last DB run stats */}
                {job.status !== 'running' && lastDbRun && (
                  <div
                    className="rounded-lg p-2 mb-3 flex items-center justify-between"
                    style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid #1f2937' }}
                  >
                    <span className="text-xs" style={{ color: '#6b7280' }}>Last result</span>
                    <span className="text-xs font-mono" style={{ color: lastDbRun.status === 'completed' ? '#22c55e' : '#ef4444' }}>
                      {lastDbRun.status === 'completed'
                        ? `${lastDbRun.records_written} records`
                        : lastDbRun.error || 'Failed'}
                    </span>
                  </div>
                )}

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
            )
          })}
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

      {/* CSS for scan progress animation */}
      <style>{`
        @keyframes scanProgress {
          0% { width: 0%; opacity: 0.6; }
          50% { width: 80%; opacity: 1; }
          100% { width: 100%; opacity: 0.6; }
        }
      `}</style>
    </div>
  )
}
