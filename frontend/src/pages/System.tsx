import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useDossier } from '../lib/dossier-context'
import {
  PageHeader, LoadingSpinner, EmptyState, Card, CardHeader, CardTitle, CardContent, Button,
} from '../components/ui'
import {
  ScanLine, Settings, Database, BookOpen, Info,
  Play, RefreshCw, CheckCircle2, XCircle, Clock, AlertTriangle,
  ToggleLeft, ToggleRight, ChevronRight, Loader2,
  Users, Mail, UserPlus, Eye, EyeOff, Key, Send,
} from 'lucide-react'
import { useAuth } from '../auth'

// ── Types ─────────────────────────────────────────────────────────────────────

interface ScanJob {
  id: string
  label: string
  description: string
  icon: string
  scanFn: () => Promise<unknown>
  scanType: string
}

// ── Scan card sub-component ───────────────────────────────────────────────────

function ScanCard({ job, history }: { job: ScanJob; history: import('../lib/api').ScanRun[] }) {
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  const lastRun = history.find(r => r.scan_type === job.scanType)

  const run = async () => {
    setRunning(true)
    setResult(null)
    try {
      await job.scanFn()
      setResult('started')
    } catch (e: any) {
      setResult('error: ' + (e?.message || 'unknown'))
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="rounded-lg p-4 flex flex-col gap-3"
      style={{ background: '#111827', border: '1px solid #1f2937' }}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-3">
          <span style={{ fontSize: 20 }}>{job.icon}</span>
          <div>
            <p className="text-sm font-medium" style={{ color: '#f9fafb' }}>{job.label}</p>
            <p className="text-xs mt-0.5" style={{ color: '#6b7280' }}>{job.description}</p>
          </div>
        </div>
        <button
          onClick={run}
          disabled={running}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium flex-shrink-0 transition-all"
          style={{
            background: running ? 'rgba(59,130,246,0.1)' : 'rgba(59,130,246,0.2)',
            color: '#3b82f6',
            border: '1px solid rgba(59,130,246,0.3)',
            opacity: running ? 0.7 : 1,
          }}
        >
          {running ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
          {running ? 'Running...' : 'Run'}
        </button>
      </div>

      {lastRun && (
        <div className="flex items-center gap-2 text-xs" style={{ color: '#4b5563' }}>
          <Clock size={11} />
          Last: {lastRun.started_at ? new Date(lastRun.started_at).toLocaleString() : 'N/A'}
          {lastRun.records_written != null && (
            <span className="ml-1" style={{ color: '#6b7280' }}>· {lastRun.records_written} records</span>
          )}
          <span className="ml-auto px-1.5 py-0.5 rounded text-xs"
            style={{
              background: lastRun.status === 'complete' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
              color: lastRun.status === 'complete' ? '#22c55e' : '#ef4444',
            }}>
            {lastRun.status}
          </span>
        </div>
      )}

      {result && (
        <p className="text-xs" style={{ color: result === 'started' ? '#22c55e' : '#ef4444' }}>
          {result === 'started' ? '✓ Scan started in background' : result}
        </p>
      )}
    </div>
  )
}

// ── Tab: Scans ────────────────────────────────────────────────────────────────

function ScansTab() {
  const queryClient = useQueryClient()
  const [runningAll, setRunningAll] = useState(false)

  const { data: historyData, refetch: refetchHistory } = useQuery({
    queryKey: ['scan-history'],
    queryFn: api.scanHistory,
    refetchInterval: 10_000,
  })

  const { data: scheduleData } = useQuery({
    queryKey: ['scan-schedule'],
    queryFn: api.scanSchedule,
  })

  const toggleSchedule = useMutation({
    mutationFn: () => api.toggleScanSchedule({ enabled: !scheduleData?.enabled }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['scan-schedule'] }),
  })

  const history = historyData?.runs || []

  const SCAN_JOBS: ScanJob[] = [
    { id: 'tenders',    label: 'Tender Radar',          description: 'Contracts Finder — public sector tenders',       icon: '📋', scanType: 'tenders',    scanFn: () => api.scanTenders() },
    { id: 'fts',        label: 'FTS Tenders',           description: 'Find a Tender Service — OJEU/above-threshold',   icon: '🔍', scanType: 'fts',        scanFn: () => api.scanFTS() },
    { id: 'prospects',  label: 'Prospect Discovery',    description: 'Companies House — new prospect companies',        icon: '🏢', scanType: 'prospects',  scanFn: () => api.scanProspects() },
    { id: 'competitors',label: 'Competitor Mapping',    description: 'Companies House — competitor landscape',          icon: '🎯', scanType: 'competitors',scanFn: () => api.scanCompetitors() },
    { id: 'signals',    label: 'Signal Intelligence',   description: 'News & intent signals for tracked companies',     icon: '📡', scanType: 'signals',    scanFn: () => api.scanSignals() },
    { id: 'crime',      label: 'Crime Intelligence',    description: 'Police UK — crime density near prospect sites',   icon: '🚨', scanType: 'crime',      scanFn: () => api.scanCrime() },
    { id: 'gazette',    label: 'Gazette Insolvency',    description: 'The Gazette — insolvency notices & alerts',       icon: '⚖️', scanType: 'gazette',    scanFn: () => api.scanGazette() },
    { id: 'ch_events',  label: 'Company Events',        description: 'Companies House streaming — director/filing changes', icon: '🔔', scanType: 'ch_events', scanFn: () => api.scanChEvents() },
    { id: 'acs',        label: 'ACS Register',          description: 'SIA ACS — approved contractor scheme verification', icon: '🛡️', scanType: 'acs',       scanFn: () => api.scanAcs() },
  ]

  const runAll = async () => {
    setRunningAll(true)
    for (const job of SCAN_JOBS) {
      try { await job.scanFn() } catch {}
      await new Promise(r => setTimeout(r, 500))
    }
    setRunningAll(false)
    refetchHistory()
  }

  return (
    <div className="space-y-6">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium" style={{ color: '#f9fafb' }}>Data Source Scans</p>
          <p className="text-xs mt-0.5" style={{ color: '#6b7280' }}>Trigger individual or all scans to refresh intelligence data</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Auto-scan toggle */}
          {scheduleData !== undefined && (
            <button
              onClick={() => toggleSchedule.mutate()}
              className="flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg transition-all"
              style={{
                background: scheduleData.enabled ? 'rgba(34,197,94,0.15)' : 'rgba(107,114,128,0.15)',
                color: scheduleData.enabled ? '#22c55e' : '#6b7280',
                border: `1px solid ${scheduleData.enabled ? 'rgba(34,197,94,0.3)' : 'rgba(107,114,128,0.3)'}`,
              }}
            >
              {scheduleData.enabled ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
              Auto-scan {scheduleData.enabled ? 'ON' : 'OFF'}
              {scheduleData.enabled && scheduleData.interval_hours && (
                <span style={{ color: '#4b5563' }}>({scheduleData.interval_hours}h)</span>
              )}
            </button>
          )}
          <button
            onClick={runAll}
            disabled={runningAll}
            className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-medium transition-all"
            style={{
              background: 'rgba(59,130,246,0.2)',
              color: '#3b82f6',
              border: '1px solid rgba(59,130,246,0.3)',
              opacity: runningAll ? 0.7 : 1,
            }}
          >
            {runningAll ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
            {runningAll ? 'Running All...' : 'Run All Scans'}
          </button>
        </div>
      </div>

      {/* Scan cards grid */}
      <div className="grid grid-cols-1 gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))' }}>
        {SCAN_JOBS.map(job => (
          <ScanCard key={job.id} job={job} history={history} />
        ))}
      </div>

      {/* Scan History */}
      <div>
        <p className="text-sm font-medium mb-3" style={{ color: '#f9fafb' }}>Scan History</p>
        {!historyData ? <LoadingSpinner /> : history.length === 0 ? (
          <EmptyState icon={<Clock size={28} />} title="No scan history" description="Run a scan to see results here" />
        ) : (
          <div className="rounded-lg overflow-hidden" style={{ border: '1px solid #1f2937' }}>
            <table className="w-full text-xs">
              <thead>
                <tr style={{ background: '#111827', borderBottom: '1px solid #1f2937' }}>
                  {['Type', 'Started', 'Completed', 'Records', 'Status'].map(h => (
                    <th key={h} className="text-left px-4 py-2.5 font-medium" style={{ color: '#6b7280' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {history.slice(0, 30).map(run => (
                  <tr key={run.id} style={{ borderBottom: '1px solid #111827' }}>
                    <td className="px-4 py-2.5 font-mono" style={{ color: '#9ca3af' }}>{run.scan_type}</td>
                    <td className="px-4 py-2.5" style={{ color: '#6b7280' }}>
                      {run.started_at ? new Date(run.started_at).toLocaleString() : '—'}
                    </td>
                    <td className="px-4 py-2.5" style={{ color: '#6b7280' }}>
                      {run.completed_at ? new Date(run.completed_at).toLocaleString() : '—'}
                    </td>
                    <td className="px-4 py-2.5 font-mono" style={{ color: '#9ca3af' }}>
                      {run.records_written ?? '—'}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="px-1.5 py-0.5 rounded"
                        style={{
                          background: run.status === 'complete' ? 'rgba(34,197,94,0.1)' : run.status === 'running' ? 'rgba(59,130,246,0.1)' : 'rgba(239,68,68,0.1)',
                          color: run.status === 'complete' ? '#22c55e' : run.status === 'running' ? '#3b82f6' : '#ef4444',
                        }}>
                        {run.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Tab: Configuration ────────────────────────────────────────────────────────

function ConfigurationTab() {
  const { data: status, isLoading } = useQuery({
    queryKey: ['status'],
    queryFn: api.status,
    refetchInterval: 60_000,
  })

  if (isLoading) return <LoadingSpinner />

  const s = status?.settings
  const keys = status?.api_keys

  return (
    <div className="space-y-6 max-w-2xl">
      {/* API Keys */}
      <div className="rounded-lg p-5" style={{ background: '#111827', border: '1px solid #1f2937' }}>
        <p className="text-sm font-semibold mb-4" style={{ color: '#f9fafb' }}>API Key Status</p>
        <div className="space-y-3">
          {[
            { label: 'Companies House API', ok: keys?.companies_house, hint: 'COMPANIES_HOUSE_API_KEY' },
            { label: 'Anthropic Claude API', ok: keys?.anthropic, hint: 'ANTHROPIC_API_KEY' },
          ].map(({ label, ok, hint }) => (
            <div key={label} className="flex items-center justify-between py-2.5 border-b" style={{ borderColor: '#1f2937' }}>
              <div>
                <p className="text-xs font-medium" style={{ color: '#f9fafb' }}>{label}</p>
                <p className="text-xs mt-0.5 font-mono" style={{ color: '#374151' }}>{hint}</p>
              </div>
              <span className="flex items-center gap-1.5 text-xs px-2 py-1 rounded-full"
                style={{
                  background: ok ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                  color: ok ? '#22c55e' : '#ef4444',
                  border: `1px solid ${ok ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
                }}>
                {ok ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                {ok ? 'Configured' : 'Not Set'}
              </span>
            </div>
          ))}
        </div>
        <p className="text-xs mt-3" style={{ color: '#4b5563' }}>
          Set environment variables in Railway dashboard → Variables tab.
        </p>
      </div>

      {/* Active Configuration */}
      {s && (
        <div className="rounded-lg p-5" style={{ background: '#111827', border: '1px solid #1f2937' }}>
          <p className="text-sm font-semibold mb-4" style={{ color: '#f9fafb' }}>Active Configuration</p>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Tender Region', value: s.tender_region },
              { label: 'Tender Days Back', value: String(s.tender_days_back) },
              { label: 'Prospector Region', value: s.prospector_region },
              { label: 'Max Results', value: String(s.max_results) },
            ].map(({ label, value }) => (
              <div key={label} className="rounded p-3" style={{ background: '#0d1117', border: '1px solid #1f2937' }}>
                <p className="text-xs" style={{ color: '#6b7280' }}>{label}</p>
                <p className="text-sm font-mono mt-1" style={{ color: '#f9fafb' }}>{value}</p>
              </div>
            ))}
          </div>
          <p className="text-xs mt-3" style={{ color: '#4b5563' }}>
            Configuration is managed via environment variables or <code className="font-mono">config.py</code>.
          </p>
        </div>
      )}

      {/* Database */}
      <div className="rounded-lg p-5" style={{ background: '#111827', border: '1px solid #1f2937' }}>
        <p className="text-sm font-semibold mb-3" style={{ color: '#f9fafb' }}>Database</p>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 text-xs px-2 py-1 rounded-full"
            style={{
              background: status?.database === 'connected' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
              color: status?.database === 'connected' ? '#22c55e' : '#ef4444',
              border: `1px solid ${status?.database === 'connected' ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
            }}>
            {status?.database === 'connected' ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
            PostgreSQL — {status?.database || 'unknown'}
          </span>
        </div>
        <p className="text-xs mt-2" style={{ color: '#4b5563' }}>
          Managed via <code className="font-mono">DATABASE_URL</code> Railway variable.
        </p>
      </div>
    </div>
  )
}

// ── Tab: Data Health ──────────────────────────────────────────────────────────

function DataHealthTab() {
  const { data: status, isLoading } = useQuery({
    queryKey: ['status'],
    queryFn: api.status,
    refetchInterval: 30_000,
  })
  const { data: historyData } = useQuery({
    queryKey: ['scan-history'],
    queryFn: api.scanHistory,
    refetchInterval: 30_000,
  })

  if (isLoading) return <LoadingSpinner />

  const counts = status?.data_counts
  const history = historyData?.runs || []

  const getLastScan = (type: string) => {
    const run = history.find(r => r.scan_type === type && r.status === 'complete')
    return run?.completed_at ? new Date(run.completed_at).toLocaleString() : 'Never'
  }

  const TABLE_ROWS = [
    { label: 'Tenders',     count: counts?.tenders,     scanType: 'tenders',    icon: '📋' },
    { label: 'Prospects',   count: counts?.prospects,   scanType: 'prospects',  icon: '🏢' },
    { label: 'Competitors', count: counts?.competitors, scanType: 'competitors',icon: '🎯' },
    { label: 'Signals',     count: counts?.signals,     scanType: 'signals',    icon: '📡' },
    { label: 'Dossiers',    count: counts?.dossiers,    scanType: 'dossier',    icon: '🗂️' },
  ]

  const SOURCE_HEALTH = [
    { label: 'Contracts Finder',    available: true,  note: 'Public API — no key required' },
    { label: 'Find a Tender (FTS)', available: true,  note: 'Public API — no key required' },
    { label: 'Companies House',     available: !!status?.api_keys?.companies_house, note: 'Requires CH API key' },
    { label: 'Anthropic Claude',    available: !!status?.api_keys?.anthropic,       note: 'Requires Anthropic key' },
    { label: 'Police UK',           available: true,  note: 'Public API — no key required' },
    { label: 'The Gazette',         available: true,  note: 'Public API — no key required' },
    { label: 'SIA ACS Register',    available: true,  note: 'Web scrape — no key required' },
  ]

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Record counts */}
      <div className="rounded-lg overflow-hidden" style={{ border: '1px solid #1f2937' }}>
        <div className="px-4 py-3 border-b" style={{ background: '#111827', borderColor: '#1f2937' }}>
          <p className="text-sm font-semibold" style={{ color: '#f9fafb' }}>Record Counts</p>
        </div>
        <table className="w-full text-xs">
          <thead>
            <tr style={{ background: '#0d1117', borderBottom: '1px solid #1f2937' }}>
              {['Source', 'Records', 'Last Scan'].map(h => (
                <th key={h} className="text-left px-4 py-2.5 font-medium" style={{ color: '#6b7280' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {TABLE_ROWS.map(row => (
              <tr key={row.label} style={{ borderBottom: '1px solid #111827' }}>
                <td className="px-4 py-3">
                  <span className="flex items-center gap-2" style={{ color: '#f9fafb' }}>
                    <span style={{ fontSize: 14 }}>{row.icon}</span>
                    {row.label}
                  </span>
                </td>
                <td className="px-4 py-3 font-mono" style={{ color: '#3b82f6' }}>
                  {row.count != null ? row.count.toLocaleString() : '—'}
                </td>
                <td className="px-4 py-3" style={{ color: '#6b7280' }}>
                  {getLastScan(row.scanType)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Source availability */}
      <div className="rounded-lg p-5" style={{ background: '#111827', border: '1px solid #1f2937' }}>
        <p className="text-sm font-semibold mb-4" style={{ color: '#f9fafb' }}>Source Availability</p>
        <div className="space-y-2">
          {SOURCE_HEALTH.map(src => (
            <div key={src.label} className="flex items-center justify-between py-2 border-b" style={{ borderColor: '#1f2937' }}>
              <div>
                <p className="text-xs font-medium" style={{ color: '#f9fafb' }}>{src.label}</p>
                <p className="text-xs mt-0.5" style={{ color: '#4b5563' }}>{src.note}</p>
              </div>
              <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full"
                style={{
                  background: src.available ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                  color: src.available ? '#22c55e' : '#ef4444',
                }}>
                {src.available ? <CheckCircle2 size={11} /> : <XCircle size={11} />}
                {src.available ? 'Available' : 'Unavailable'}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Tab: Dossier Library ──────────────────────────────────────────────────────

function DossierLibraryTab() {
  const { openDossier } = useDossier()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState('')
  const [form, setForm] = useState({ company_name: '', company_number: '', company_type: '', region: '' })

  const { data: dossierList, isLoading } = useQuery({
    queryKey: ['dossier-list'],
    queryFn: api.listDossiers,
    refetchInterval: 60_000,
  })

  const dossiers = (dossierList?.dossiers || []).filter(d =>
    !search || d.company_name?.toLowerCase().includes(search.toLowerCase())
  )

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.company_name.trim()) return
    setGenerating(true)
    setGenError('')
    try {
      await api.generateDossier(form)
      queryClient.invalidateQueries({ queryKey: ['dossier-list'] })
      setForm({ company_name: '', company_number: '', company_type: '', region: '' })
    } catch (err: any) {
      setGenError(err?.message || 'Failed to generate dossier')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="flex gap-6">
      {/* Dossier list */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-3 mb-4">
          <input
            type="text"
            placeholder="Search dossiers..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 text-xs rounded-lg px-3 py-2 border"
            style={{ background: '#111827', color: '#f9fafb', borderColor: '#1f2937' }}
          />
          <span className="text-xs" style={{ color: '#6b7280' }}>{dossiers.length} dossiers</span>
        </div>

        {isLoading ? <LoadingSpinner /> : dossiers.length === 0 ? (
          <EmptyState icon={<BookOpen size={28} />} title="No dossiers yet" description="Generate a dossier using the form" />
        ) : (
          <div className="space-y-2">
            {dossiers.map(d => (
              <button
                key={d.id}
                onClick={() => openDossier(d.company_key, d.company_name, d.company_number || '', d.company_type || '', d.region || '')}
                className="w-full text-left rounded-lg p-3 transition-all hover:border-blue-500/40"
                style={{ background: '#111827', border: '1px solid #1f2937' }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: '#f9fafb' }}>{d.company_name}</p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      {d.company_number && (
                        <span className="text-xs font-mono" style={{ color: '#374151' }}>CH#{d.company_number}</span>
                      )}
                      {d.company_type && (
                        <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'rgba(59,130,246,0.1)', color: '#60a5fa' }}>
                          {d.company_type}
                        </span>
                      )}
                      {d.region && (
                        <span className="text-xs" style={{ color: '#6b7280' }}>{d.region}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex-shrink-0 text-right">
                    <p className="text-xs" style={{ color: '#4b5563' }}>
                      {d.updated_at ? new Date(d.updated_at).toLocaleDateString() : '—'}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: '#374151' }}>{d.source_count} sources</p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Generate form */}
      <div className="flex-shrink-0" style={{ width: 280 }}>
        <div className="rounded-lg p-4 sticky top-0" style={{ background: '#111827', border: '1px solid #1f2937' }}>
          <p className="text-sm font-semibold mb-3" style={{ color: '#f9fafb' }}>Generate New Dossier</p>
          <form onSubmit={handleGenerate} className="space-y-3">
            {[
              { key: 'company_name', label: 'Company Name *', placeholder: 'e.g. Securitas UK Ltd' },
              { key: 'company_number', label: 'CH Number', placeholder: 'e.g. 12345678' },
              { key: 'company_type', label: 'Type', placeholder: 'e.g. Facilities Management' },
              { key: 'region', label: 'Region', placeholder: 'e.g. London' },
            ].map(({ key, label, placeholder }) => (
              <div key={key}>
                <label className="block text-xs mb-1" style={{ color: '#6b7280' }}>{label}</label>
                <input
                  type="text"
                  placeholder={placeholder}
                  value={(form as any)[key]}
                  onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                  className="w-full text-xs rounded px-2.5 py-2 border"
                  style={{ background: '#0d1117', color: '#f9fafb', borderColor: '#374151' }}
                />
              </div>
            ))}

            {genError && <p className="text-xs" style={{ color: '#ef4444' }}>{genError}</p>}

            <button
              type="submit"
              disabled={generating || !form.company_name.trim()}
              className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-medium transition-all"
              style={{
                background: 'rgba(59,130,246,0.2)',
                color: '#3b82f6',
                border: '1px solid rgba(59,130,246,0.3)',
                opacity: generating || !form.company_name.trim() ? 0.6 : 1,
              }}
            >
              {generating ? <Loader2 size={12} className="animate-spin" /> : <BookOpen size={12} />}
              {generating ? 'Generating...' : 'Generate Dossier'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

// ── Tab: About ────────────────────────────────────────────────────────────────

function AboutTab() {
  return (
    <div className="space-y-5 max-w-2xl">
      <div className="rounded-lg p-5" style={{ background: '#111827', border: '1px solid #1f2937' }}>
        <p className="text-sm font-semibold mb-1" style={{ color: '#f9fafb' }}>SecureFlex Intel Platform</p>
        <p className="text-xs mb-4" style={{ color: '#6b7280' }}>Version 0.1.0 — Phase 2</p>
        <p className="text-xs leading-relaxed" style={{ color: '#9ca3af' }}>
          An autonomous intelligence platform for the UK private security industry. Aggregates public sector
          tenders, prospect companies, competitor intelligence, intent signals, and AI-generated sales dossiers
          into a single command centre.
        </p>
      </div>

      <div className="rounded-lg p-5" style={{ background: '#111827', border: '1px solid #1f2937' }}>
        <p className="text-sm font-semibold mb-3" style={{ color: '#f9fafb' }}>Tech Stack</p>
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: 'Backend', value: 'Python 3.11 · FastAPI · SQLAlchemy Core' },
            { label: 'Database', value: 'PostgreSQL (Railway)' },
            { label: 'AI', value: 'Anthropic Claude (dossier generation)' },
            { label: 'Frontend', value: 'React 18 · TypeScript · Vite' },
            { label: 'State', value: 'TanStack React Query' },
            { label: 'Charts', value: 'Recharts · Leaflet maps' },
            { label: 'Hosting', value: 'Railway (auto-deploy on push)' },
            { label: 'Build', value: 'pnpm · Vite SPA → /static' },
          ].map(({ label, value }) => (
            <div key={label} className="rounded p-3" style={{ background: '#0d1117', border: '1px solid #1f2937' }}>
              <p className="text-xs" style={{ color: '#6b7280' }}>{label}</p>
              <p className="text-xs mt-1 font-mono" style={{ color: '#f9fafb' }}>{value}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-lg p-5" style={{ background: '#111827', border: '1px solid #1f2937' }}>
        <p className="text-sm font-semibold mb-3" style={{ color: '#f9fafb' }}>Data Sources</p>
        <div className="space-y-1.5 text-xs" style={{ color: '#9ca3af' }}>
          {[
            'Contracts Finder — public sector tender notices',
            'Find a Tender Service (FTS) — above-threshold OJEU tenders',
            'Companies House — company registration and filing data',
            'Police UK — crime statistics by location',
            'The Gazette — official insolvency and company notices',
            'SIA ACS Register — approved contractor scheme verification',
            'Companies House Streaming — real-time company events',
            'Google News — intent signals and company news',
          ].map(s => (
            <div key={s} className="flex items-center gap-2">
              <span style={{ color: '#374151' }}>›</span>
              {s}
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-lg p-5" style={{ background: '#111827', border: '1px solid #1f2937' }}>
        <p className="text-sm font-semibold mb-3" style={{ color: '#f9fafb' }}>Links</p>
        <div className="space-y-2">
          {[
            { label: 'Live Platform', url: 'https://intel.secureflex.uk' },
            { label: 'API Documentation', url: '/docs' },
            { label: 'Railway Dashboard', url: 'https://railway.app' },
          ].map(({ label, url }) => (
            <a key={label} href={url} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-2 text-xs transition-colors hover:text-blue-400"
              style={{ color: '#60a5fa' }}>
              <ChevronRight size={12} />
              {label}
            </a>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Tab: Users (admin) ──────────────────────────────────────────────────

function UsersTab() {
  const { user: currentUser } = useAuth()
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ username: '', password: '', email: '', role: 'viewer' })
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Change password state
  const [showPwChange, setShowPwChange] = useState(false)
  const [pwForm, setPwForm] = useState({ old_password: '', new_password: '' })
  const [pwError, setPwError] = useState('')
  const [pwSuccess, setPwSuccess] = useState('')
  const [showOld, setShowOld] = useState(false)
  const [showNew, setShowNew] = useState(false)

  const isAdmin = currentUser?.role === 'admin'

  const { data: usersData, isLoading } = useQuery({
    queryKey: ['auth-users'],
    queryFn: api.authUsers,
    enabled: isAdmin,
  })

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    try {
      await api.authRegister(form)
      setSuccess(`User "${form.username}" created`)
      setForm({ username: '', password: '', email: '', role: 'viewer' })
      setShowForm(false)
      queryClient.invalidateQueries({ queryKey: ['auth-users'] })
    } catch (err: any) {
      setError(err?.message || 'Failed to create user')
    }
  }

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setPwError('')
    setPwSuccess('')
    try {
      await api.authChangePassword(pwForm.old_password, pwForm.new_password)
      setPwSuccess('Password changed successfully')
      setPwForm({ old_password: '', new_password: '' })
      setShowPwChange(false)
    } catch (err: any) {
      setPwError(err?.message || 'Failed to change password')
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Change own password */}
      <div className="rounded-lg p-5" style={{ background: '#111827', border: '1px solid #1f2937' }}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-sm font-semibold" style={{ color: '#f9fafb' }}>Your Account</p>
            <p className="text-xs mt-0.5" style={{ color: '#6b7280' }}>
              Signed in as <strong style={{ color: '#f9fafb' }}>{currentUser?.username}</strong> ({currentUser?.role})
            </p>
          </div>
          <button
            onClick={() => setShowPwChange(!showPwChange)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
            style={{ background: 'rgba(107,114,128,0.15)', color: '#9ca3af', border: '1px solid rgba(107,114,128,0.3)' }}
          >
            <Key size={12} /> Change Password
          </button>
        </div>

        {showPwChange && (
          <form onSubmit={handleChangePassword} className="space-y-3 mt-3 pt-3" style={{ borderTop: '1px solid #1f2937' }}>
            <div className="relative">
              <label className="block text-xs mb-1" style={{ color: '#6b7280' }}>Current Password</label>
              <input
                type={showOld ? 'text' : 'password'}
                value={pwForm.old_password}
                onChange={e => setPwForm(f => ({ ...f, old_password: e.target.value }))}
                required
                className="w-full text-xs rounded px-3 py-2 border pr-8"
                style={{ background: '#0d1117', color: '#f9fafb', borderColor: '#374151' }}
              />
              <button type="button" onClick={() => setShowOld(!showOld)} className="absolute right-2 top-7" style={{ color: '#4b5563' }}>
                {showOld ? <EyeOff size={12} /> : <Eye size={12} />}
              </button>
            </div>
            <div className="relative">
              <label className="block text-xs mb-1" style={{ color: '#6b7280' }}>New Password (min 8 chars)</label>
              <input
                type={showNew ? 'text' : 'password'}
                value={pwForm.new_password}
                onChange={e => setPwForm(f => ({ ...f, new_password: e.target.value }))}
                required
                minLength={8}
                className="w-full text-xs rounded px-3 py-2 border pr-8"
                style={{ background: '#0d1117', color: '#f9fafb', borderColor: '#374151' }}
              />
              <button type="button" onClick={() => setShowNew(!showNew)} className="absolute right-2 top-7" style={{ color: '#4b5563' }}>
                {showNew ? <EyeOff size={12} /> : <Eye size={12} />}
              </button>
            </div>
            {pwError && <p className="text-xs" style={{ color: '#ef4444' }}>{pwError}</p>}
            {pwSuccess && <p className="text-xs" style={{ color: '#22c55e' }}>{pwSuccess}</p>}
            <button type="submit" className="px-4 py-1.5 rounded-lg text-xs font-medium" style={{ background: 'rgba(59,130,246,0.2)', color: '#3b82f6', border: '1px solid rgba(59,130,246,0.3)' }}>
              Update Password
            </button>
          </form>
        )}
      </div>

      {/* Admin: User list */}
      {isAdmin && (
        <div className="rounded-lg p-5" style={{ background: '#111827', border: '1px solid #1f2937' }}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm font-semibold" style={{ color: '#f9fafb' }}>User Management</p>
              <p className="text-xs mt-0.5" style={{ color: '#6b7280' }}>Admin only — create and manage platform users</p>
            </div>
            <button
              onClick={() => setShowForm(!showForm)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
              style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.3)' }}
            >
              <UserPlus size={12} /> Add User
            </button>
          </div>

          {showForm && (
            <form onSubmit={handleCreate} className="space-y-3 mb-4 p-4 rounded-lg" style={{ background: '#0d1117', border: '1px solid #1f2937' }}>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs mb-1" style={{ color: '#6b7280' }}>Username *</label>
                  <input type="text" value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} required
                    className="w-full text-xs rounded px-2.5 py-2 border" style={{ background: '#111827', color: '#f9fafb', borderColor: '#374151' }} />
                </div>
                <div>
                  <label className="block text-xs mb-1" style={{ color: '#6b7280' }}>Password *</label>
                  <input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} required minLength={8}
                    className="w-full text-xs rounded px-2.5 py-2 border" style={{ background: '#111827', color: '#f9fafb', borderColor: '#374151' }} />
                </div>
                <div>
                  <label className="block text-xs mb-1" style={{ color: '#6b7280' }}>Email</label>
                  <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                    className="w-full text-xs rounded px-2.5 py-2 border" style={{ background: '#111827', color: '#f9fafb', borderColor: '#374151' }} />
                </div>
                <div>
                  <label className="block text-xs mb-1" style={{ color: '#6b7280' }}>Role</label>
                  <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                    className="w-full text-xs rounded px-2.5 py-2 border" style={{ background: '#111827', color: '#f9fafb', borderColor: '#374151' }}>
                    <option value="viewer">Viewer</option>
                    <option value="editor">Editor</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
              </div>
              {error && <p className="text-xs" style={{ color: '#ef4444' }}>{error}</p>}
              {success && <p className="text-xs" style={{ color: '#22c55e' }}>{success}</p>}
              <button type="submit" className="px-4 py-1.5 rounded-lg text-xs font-medium" style={{ background: 'rgba(34,197,94,0.2)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.3)' }}>
                Create User
              </button>
            </form>
          )}

          {isLoading ? <LoadingSpinner /> : (
            <div className="rounded-lg overflow-hidden" style={{ border: '1px solid #1f2937' }}>
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ background: '#0d1117', borderBottom: '1px solid #1f2937' }}>
                    {['Username', 'Email', 'Role', 'Active', 'Last Login'].map(h => (
                      <th key={h} className="text-left px-4 py-2.5 font-medium" style={{ color: '#6b7280' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(usersData?.users || []).map(u => (
                    <tr key={u.id || u.username} style={{ borderBottom: '1px solid #111827' }}>
                      <td className="px-4 py-2.5 font-medium" style={{ color: '#f9fafb' }}>{u.username}</td>
                      <td className="px-4 py-2.5" style={{ color: '#6b7280' }}>{u.email || '—'}</td>
                      <td className="px-4 py-2.5">
                        <span className="px-1.5 py-0.5 rounded text-xs"
                          style={{
                            background: u.role === 'admin' ? 'rgba(239,68,68,0.1)' : u.role === 'editor' ? 'rgba(59,130,246,0.1)' : 'rgba(107,114,128,0.1)',
                            color: u.role === 'admin' ? '#ef4444' : u.role === 'editor' ? '#3b82f6' : '#6b7280',
                          }}>
                          {u.role}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="px-1.5 py-0.5 rounded text-xs"
                          style={{ background: u.is_active ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', color: u.is_active ? '#22c55e' : '#ef4444' }}>
                          {u.is_active ? 'Yes' : 'No'}
                        </span>
                      </td>
                      <td className="px-4 py-2.5" style={{ color: '#6b7280' }}>
                        {u.last_login ? new Date(u.last_login).toLocaleString() : 'Never'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Tab: Email Digest ───────────────────────────────────────────────────

function DigestTab() {
  const { user: currentUser } = useAuth()
  const [previewHtml, setPreviewHtml] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [sendResult, setSendResult] = useState<string | null>(null)
  const [sending, setSending] = useState(false)

  const isAdmin = currentUser?.role === 'admin'

  const { data: digestSettings } = useQuery({
    queryKey: ['digest-settings'],
    queryFn: api.digestSettings,
  })

  const handlePreview = async () => {
    setLoading(true)
    try {
      const res = await api.digestPreview()
      setPreviewHtml(res.html)
    } catch (err: any) {
      setPreviewHtml(`<p style="color:red;">Error: ${err?.message || 'Failed to generate preview'}</p>`)
    } finally {
      setLoading(false)
    }
  }

  const handleSend = async () => {
    setSending(true)
    setSendResult(null)
    try {
      const res = await api.digestSend()
      if (res.status === 'sent') {
        setSendResult(`Digest sent to ${(res.recipients || []).join(', ')}`)
      } else {
        setSendResult(`${res.status}: ${res.error || 'Unknown'}`)
      }
    } catch (err: any) {
      setSendResult(`Error: ${err?.message || 'Failed to send'}`)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Settings overview */}
      <div className="rounded-lg p-5" style={{ background: '#111827', border: '1px solid #1f2937' }}>
        <p className="text-sm font-semibold mb-4" style={{ color: '#f9fafb' }}>Email Digest Configuration</p>
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: 'Enabled', value: digestSettings?.enabled ? 'Yes' : 'No' },
            { label: 'Schedule', value: `${digestSettings?.day || 'monday'} at ${digestSettings?.hour ?? 8}:00 UTC` },
            { label: 'SMTP Configured', value: digestSettings?.smtp_configured ? 'Yes' : 'No' },
            { label: 'Recipients', value: (digestSettings?.recipients || []).join(', ') || 'None configured' },
          ].map(({ label, value }) => (
            <div key={label} className="rounded p-3" style={{ background: '#0d1117', border: '1px solid #1f2937' }}>
              <p className="text-xs" style={{ color: '#6b7280' }}>{label}</p>
              <p className="text-xs font-mono mt-1" style={{ color: '#f9fafb' }}>{value}</p>
            </div>
          ))}
        </div>
        <p className="text-xs mt-3" style={{ color: '#4b5563' }}>
          Configure via environment variables: DIGEST_ENABLED, DIGEST_DAY, DIGEST_HOUR, DIGEST_RECIPIENTS, SMTP_HOST, SMTP_USER, SMTP_PASSWORD
        </p>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <button
          onClick={handlePreview}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium transition-all"
          style={{ background: 'rgba(59,130,246,0.2)', color: '#3b82f6', border: '1px solid rgba(59,130,246,0.3)', opacity: loading ? 0.7 : 1 }}
        >
          {loading ? <Loader2 size={13} className="animate-spin" /> : <Eye size={13} />}
          {loading ? 'Generating...' : 'Preview Digest'}
        </button>

        {isAdmin && (
          <button
            onClick={handleSend}
            disabled={sending}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium transition-all"
            style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.3)', opacity: sending ? 0.7 : 1 }}
          >
            {sending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
            {sending ? 'Sending...' : 'Send Now'}
          </button>
        )}
      </div>

      {sendResult && (
        <div className="rounded-lg px-4 py-3 text-xs"
          style={{ background: sendResult.startsWith('Digest sent') ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                   color: sendResult.startsWith('Digest sent') ? '#22c55e' : '#ef4444',
                   border: `1px solid ${sendResult.startsWith('Digest sent') ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}` }}>
          {sendResult}
        </div>
      )}

      {/* Preview iframe */}
      {previewHtml && (
        <div className="rounded-lg overflow-hidden" style={{ border: '1px solid #1f2937' }}>
          <div className="px-4 py-2 flex items-center justify-between" style={{ background: '#111827', borderBottom: '1px solid #1f2937' }}>
            <p className="text-xs font-medium" style={{ color: '#9ca3af' }}>Digest Preview</p>
            <button onClick={() => setPreviewHtml(null)} className="text-xs" style={{ color: '#6b7280' }}>Close</button>
          </div>
          <iframe
            srcDoc={previewHtml}
            className="w-full"
            style={{ height: 600, border: 'none', background: '#0d1117' }}
            title="Digest Preview"
          />
        </div>
      )}
    </div>
  )
}

// ── Main Component ──────────────────────────────────────────────────────

const TABS = [
  { key: 'scans',     label: 'Scans',           icon: ScanLine   },
  { key: 'config',    label: 'Configuration',   icon: Settings   },
  { key: 'health',    label: 'Data Health',      icon: Database   },
  { key: 'dossiers',  label: 'Dossier Library',  icon: BookOpen   },
  { key: 'users',     label: 'Users',            icon: Users      },
  { key: 'digest',    label: 'Email Digest',     icon: Mail       },
  { key: 'about',     label: 'About',            icon: Info       },
]

export default function System() {
  const [activeTab, setActiveTab] = useState('scans')

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <PageHeader
        title="SYSTEM"
        subtitle="Scan management, configuration, data health, and dossier library"
      />

      {/* Tab bar */}
      <div className="flex items-center gap-0 px-6 border-b flex-shrink-0" style={{ borderColor: '#1f2937', background: '#0d1117' }}>
        {TABS.map(tab => {
          const Icon = tab.icon
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className="flex items-center gap-2 px-4 py-2.5 text-xs font-medium transition-colors relative"
              style={{ color: activeTab === tab.key ? '#f9fafb' : '#6b7280' }}
            >
              <Icon size={13} />
              {tab.label}
              {activeTab === tab.key && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5" style={{ background: '#3b82f6' }} />
              )}
            </button>
          )
        })}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-6">
        {activeTab === 'scans'    && <ScansTab />}
        {activeTab === 'config'   && <ConfigurationTab />}
        {activeTab === 'health'   && <DataHealthTab />}
        {activeTab === 'dossiers' && <DossierLibraryTab />}
        {activeTab === 'users'    && <UsersTab />}
        {activeTab === 'digest'   && <DigestTab />}
        {activeTab === 'about'    && <AboutTab />}
      </div>
    </div>
  )
}
