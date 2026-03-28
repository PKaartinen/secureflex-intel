import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { Card, CardHeader, CardTitle, CardContent, PageHeader, LoadingSpinner } from '../components/ui'
import { Settings as SettingsIcon, Key, Database, Globe, Info } from 'lucide-react'

export default function Settings() {
  const { data: status, isLoading } = useQuery({
    queryKey: ['status'],
    queryFn: api.status,
    refetchInterval: 60_000,
  })

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <PageHeader
        title="SETTINGS"
        subtitle="System configuration and API key status"
      />

      <div className="p-6 space-y-6">
        {isLoading ? (
          <LoadingSpinner />
        ) : (
          <>
            {/* API Keys */}
            <Card>
              <CardHeader>
                <CardTitle>API Keys</CardTitle>
                <Key size={14} style={{ color: '#6b7280' }} />
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-3 rounded-lg" style={{ background: '#0d1117', border: '1px solid #1f2937' }}>
                    <div>
                      <p className="text-sm font-medium" style={{ color: '#f9fafb' }}>Companies House API</p>
                      <p className="text-xs mt-0.5" style={{ color: '#6b7280' }}>
                        Required for prospect and competitor discovery via Companies House
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <div
                        className="rounded-full"
                        style={{
                          width: 8, height: 8,
                          background: status?.api_keys.companies_house ? '#22c55e' : '#ef4444',
                        }}
                      />
                      <span className="text-xs" style={{ color: status?.api_keys.companies_house ? '#22c55e' : '#ef4444' }}>
                        {status?.api_keys.companies_house ? 'Configured' : 'Not configured'}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-3 rounded-lg" style={{ background: '#0d1117', border: '1px solid #1f2937' }}>
                    <div>
                      <p className="text-sm font-medium" style={{ color: '#f9fafb' }}>Anthropic API (Claude)</p>
                      <p className="text-xs mt-0.5" style={{ color: '#6b7280' }}>
                        Powers AI sales dossiers, prospect analysis, and tender fit assessments
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <div
                        className="rounded-full"
                        style={{
                          width: 8, height: 8,
                          background: status?.api_keys.anthropic ? '#22c55e' : '#ef4444',
                        }}
                      />
                      <span className="text-xs" style={{ color: status?.api_keys.anthropic ? '#22c55e' : '#ef4444' }}>
                        {status?.api_keys.anthropic ? 'Configured' : 'Not configured'}
                      </span>
                    </div>
                  </div>

                  <div
                    className="rounded-lg p-3"
                    style={{ background: 'rgba(59,130,246,0.05)', border: '1px solid rgba(59,130,246,0.15)' }}
                  >
                    <div className="flex items-start gap-2">
                      <Info size={14} className="mt-0.5 flex-shrink-0" style={{ color: '#3b82f6' }} />
                      <div>
                        <p className="text-xs font-medium mb-1" style={{ color: '#3b82f6' }}>How to configure API keys</p>
                        <p className="text-xs" style={{ color: '#6b7280' }}>
                          Set environment variables in the Railway service settings:
                        </p>
                        <div className="mt-2 rounded p-2 font-mono text-xs" style={{ background: '#0d1117', color: '#22c55e' }}>
                          <p>COMPANIES_HOUSE_API_KEY=your_key_here</p>
                          <p>ANTHROPIC_API_KEY=your_key_here</p>
                        </div>
                        <p className="text-xs mt-2" style={{ color: '#6b7280' }}>
                          Go to Railway dashboard &rarr; Service &rarr; Variables to configure.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Active Settings */}
            {status?.settings && (
              <Card>
                <CardHeader>
                  <CardTitle>Active Configuration</CardTitle>
                  <Globe size={14} style={{ color: '#6b7280' }} />
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4">
                    {[
                      { key: 'tender_region', label: 'Tender Region', description: 'Geographic region for tender searches' },
                      { key: 'tender_days_back', label: 'Tender Days Back', description: 'How far back to search for tenders' },
                      { key: 'prospector_region', label: 'Prospector Region', description: 'Region for prospect/competitor discovery' },
                      { key: 'max_results', label: 'Max Results', description: 'Maximum results per scan operation' },
                    ].map(({ key, label, description }) => (
                      <div key={key} className="p-3 rounded-lg" style={{ background: '#0d1117', border: '1px solid #1f2937' }}>
                        <p className="text-xs" style={{ color: '#6b7280' }}>{label}</p>
                        <p className="text-lg font-bold mt-1" style={{ color: '#f9fafb' }}>
                          {String(status.settings[key as keyof typeof status.settings])}
                        </p>
                        <p className="text-xs mt-1" style={{ color: '#374151' }}>{description}</p>
                      </div>
                    ))}
                  </div>
                  <div
                    className="mt-4 rounded-lg p-3"
                    style={{ background: 'rgba(245,158,11,0.05)', border: '1px solid rgba(245,158,11,0.15)' }}
                  >
                    <div className="flex items-start gap-2">
                      <Info size={14} className="mt-0.5 flex-shrink-0" style={{ color: '#f59e0b' }} />
                      <p className="text-xs" style={{ color: '#9ca3af' }}>
                        Configuration is managed via Railway environment variables.
                        Changes take effect after the next deployment.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Data Storage */}
            <Card>
              <CardHeader>
                <CardTitle>Data Storage</CardTitle>
                <Database size={14} style={{ color: '#6b7280' }} />
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 rounded-lg" style={{ background: '#0d1117', border: '1px solid #1f2937' }}>
                    <div>
                      <p className="text-sm font-medium" style={{ color: '#f9fafb' }}>PostgreSQL Database</p>
                      <p className="text-xs font-mono mt-0.5" style={{ color: '#6b7280' }}>Railway managed instance</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <div
                        className="rounded-full"
                        style={{ width: 8, height: 8, background: '#22c55e' }}
                      />
                      <span className="text-xs" style={{ color: '#22c55e' }}>
                        Connected
                      </span>
                    </div>
                  </div>

                  {status?.pipeline && (
                    <div className="flex items-center justify-between p-3 rounded-lg" style={{ background: '#0d1117', border: '1px solid #1f2937' }}>
                      <div>
                        <p className="text-sm font-medium" style={{ color: '#f9fafb' }}>Pipeline Leads</p>
                        <p className="text-xs mt-0.5" style={{ color: '#6b7280' }}>Tracked companies in growth pipeline</p>
                      </div>
                      <span className="text-sm font-bold" style={{ color: '#3b82f6' }}>
                        {status.pipeline.lead_count || 0}
                      </span>
                    </div>
                  )}

                  <div className="grid grid-cols-5 gap-3">
                    {status && Object.entries(status.data_counts).map(([k, v]) => (
                      <div key={k} className="p-3 rounded-lg text-center" style={{ background: '#0d1117', border: '1px solid #1f2937' }}>
                        <p className="text-2xl font-bold" style={{ color: '#f9fafb' }}>{v}</p>
                        <p className="text-xs mt-1 capitalize" style={{ color: '#6b7280' }}>{k}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* About */}
            <Card>
              <CardHeader>
                <CardTitle>About SecureFlex Intel</CardTitle>
                <SettingsIcon size={14} style={{ color: '#6b7280' }} />
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <p className="text-sm" style={{ color: '#9ca3af' }}>
                    SecureFlex Intel is a security industry intelligence platform that aggregates tender opportunities,
                    prospect companies, competitor intelligence, and market signals into a unified command center.
                  </p>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: 'Backend', value: 'FastAPI + Python' },
                      { label: 'Frontend', value: 'React + TypeScript' },
                      { label: 'Data Sources', value: 'Contracts Finder, Companies House, News APIs' },
                    ].map(({ label, value }) => (
                      <div key={label} className="p-3 rounded-lg" style={{ background: '#0d1117', border: '1px solid #1f2937' }}>
                        <p className="text-xs" style={{ color: '#6b7280' }}>{label}</p>
                        <p className="text-xs font-medium mt-1" style={{ color: '#f9fafb' }}>{value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  )
}
