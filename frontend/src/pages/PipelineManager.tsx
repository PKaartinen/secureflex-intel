import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api, type Lead } from '../lib/api'
import { Card, CardHeader, CardTitle, CardContent, Button, PageHeader, LoadingSpinner, EmptyState, ScoreBadge, StatusBadge, Table, Th, Td, Tr, Input } from '../components/ui'
import { formatDate, formatRelativeTime, parseScore } from '../lib/utils'
import { Kanban, TableIcon, Clock, Building2, Search } from 'lucide-react'

const PIPELINE_STAGES = ['Not Contacted', 'Email 1 Sent', 'Email 2 Sent', 'Warm / Meeting', 'Pilot Live', 'Won']
const STAGE_COLORS: Record<string, string> = {
  'Not Contacted': '#6b7280',
  'Email 1 Sent': '#f59e0b',
  'Email 2 Sent': '#f97316',
  'Warm / Meeting': '#3b82f6',
  'Pilot Live': '#8b5cf6',
  'Won': '#22c55e',
}

function LeadCard({ lead, onClick }: { lead: Lead; onClick: () => void }) {
  const score = parseScore(lead.score)
  return (
    <div
      onClick={onClick}
      className="rounded-lg p-3 border cursor-pointer hover:border-blue-500/30 transition-all"
      style={{ background: '#0d1117', borderColor: '#1f2937' }}
    >
      <div className="flex items-start justify-between mb-2">
        <p className="text-sm font-medium leading-tight" style={{ color: '#f9fafb' }}>{lead.company_name}</p>
        <ScoreBadge score={score} />
      </div>
      <p className="text-xs mb-2" style={{ color: '#6b7280' }}>{lead.company_type}</p>
      {lead.tier && (
        <span
          className="inline-block px-1.5 py-0.5 rounded text-xs"
          style={{ background: 'rgba(59,130,246,0.1)', color: '#3b82f6', border: '1px solid rgba(59,130,246,0.2)' }}
        >
          Tier {lead.tier}
        </span>
      )}
      {lead.next_action_due_date && (
        <div className="flex items-center gap-1 mt-2">
          <Clock size={10} style={{ color: '#f59e0b' }} />
          <span className="text-xs" style={{ color: '#f59e0b' }}>{formatRelativeTime(lead.next_action_due_date)}</span>
        </div>
      )}
    </div>
  )
}

export default function PipelineManager() {
  const [view, setView] = useState<'kanban' | 'table'>('kanban')
  const [search, setSearch] = useState('')
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)

  const { data: pipeline, isLoading } = useQuery({
    queryKey: ['pipeline'],
    queryFn: () => api.pipeline({ limit: 200 }),
    refetchInterval: 60_000,
  })

  const { data: stats } = useQuery({
    queryKey: ['pipeline-stats'],
    queryFn: api.pipelineStats,
    refetchInterval: 60_000,
  })

  const leads = (pipeline?.leads || []).filter(l =>
    !search || l.company_name?.toLowerCase().includes(search.toLowerCase())
  )

  const leadsByStage = PIPELINE_STAGES.reduce<Record<string, Lead[]>>((acc, stage) => {
    acc[stage] = leads.filter(l => {
      const s = l.status?.toLowerCase() || ''
      const stageLower = stage.toLowerCase()
      if (stage === 'Not Contacted') return s.includes('not contacted') || s === ''
      if (stage === 'Email 1 Sent') return s.includes('email 1') || s.includes('email sent')
      if (stage === 'Email 2 Sent') return s.includes('email 2')
      if (stage === 'Warm / Meeting') return s.includes('warm') || s.includes('meeting')
      if (stage === 'Pilot Live') return s.includes('pilot')
      if (stage === 'Won') return s.includes('won')
      return s.includes(stageLower)
    })
    return acc
  }, {})

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <PageHeader
        title="PIPELINE MANAGER"
        subtitle={`${pipeline?.total || 0} leads · ${stats?.by_status ? Object.keys(stats.by_status).length : 0} stages`}
        actions={
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg overflow-hidden border" style={{ borderColor: '#374151' }}>
              <button
                onClick={() => setView('kanban')}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs transition-colors"
                style={{
                  background: view === 'kanban' ? 'rgba(59,130,246,0.2)' : 'transparent',
                  color: view === 'kanban' ? '#3b82f6' : '#9ca3af',
                }}
              >
                <Kanban size={12} /> Board
              </button>
              <button
                onClick={() => setView('table')}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs transition-colors"
                style={{
                  background: view === 'table' ? 'rgba(59,130,246,0.2)' : 'transparent',
                  color: view === 'table' ? '#3b82f6' : '#9ca3af',
                }}
              >
                <TableIcon size={12} /> Table
              </button>
            </div>
          </div>
        }
      />

      <div className="flex-1 p-6 space-y-4">
        {/* Search */}
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: '#6b7280' }} />
          <Input
            placeholder="Search leads..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 w-64"
          />
        </div>

        {isLoading ? (
          <LoadingSpinner />
        ) : view === 'kanban' ? (
          /* Kanban Board */
          <div className="flex gap-4 overflow-x-auto pb-4">
            {PIPELINE_STAGES.map(stage => {
              const stageLeads = leadsByStage[stage] || []
              const color = STAGE_COLORS[stage]
              return (
                <div key={stage} className="flex-shrink-0" style={{ width: 220 }}>
                  <div
                    className="flex items-center justify-between px-3 py-2 rounded-t-lg border border-b-0"
                    style={{ background: `${color}15`, borderColor: `${color}30` }}
                  >
                    <span className="text-xs font-semibold" style={{ color }}>{stage}</span>
                    <span
                      className="text-xs font-mono px-1.5 py-0.5 rounded"
                      style={{ background: `${color}20`, color }}
                    >
                      {stageLeads.length}
                    </span>
                  </div>
                  <div
                    className="rounded-b-lg border border-t-0 p-2 space-y-2"
                    style={{ background: '#0d1117', borderColor: `${color}30`, minHeight: 80 }}
                  >
                    {stageLeads.length === 0 ? (
                      <p className="text-xs text-center py-4" style={{ color: '#374151' }}>Empty</p>
                    ) : (
                      stageLeads.map(lead => (
                        <LeadCard key={lead.company_id} lead={lead} onClick={() => setSelectedLead(lead)} />
                      ))
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          /* Table View */
          <Card>
            <Table>
              <thead>
                <tr>
                  <Th>Company</Th>
                  <Th>Type</Th>
                  <Th>Tier</Th>
                  <Th>Status</Th>
                  <Th>Score</Th>
                  <Th>Source</Th>
                  <Th>Next Action</Th>
                  <Th>Added</Th>
                </tr>
              </thead>
              <tbody>
                {leads.map(lead => (
                  <Tr key={lead.company_id} onClick={() => setSelectedLead(lead)}>
                    <Td>
                      <div>
                        <p className="text-sm font-medium" style={{ color: '#f9fafb' }}>{lead.company_name}</p>
                        {lead.company_number && (
                          <p className="text-xs font-mono" style={{ color: '#374151' }}>CH#{lead.company_number}</p>
                        )}
                      </div>
                    </Td>
                    <Td><span className="text-xs">{lead.company_type}</span></Td>
                    <Td>
                      {lead.tier && (
                        <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'rgba(59,130,246,0.1)', color: '#3b82f6' }}>
                          T{lead.tier}
                        </span>
                      )}
                    </Td>
                    <Td><StatusBadge status={lead.status} /></Td>
                    <Td><ScoreBadge score={lead.score} /></Td>
                    <Td><span className="text-xs" style={{ color: '#6b7280' }}>{lead.source}</span></Td>
                    <Td>
                      {lead.next_action && (
                        <div>
                          <p className="text-xs truncate" style={{ color: '#9ca3af', maxWidth: 160 }}>{lead.next_action}</p>
                          {lead.next_action_due_date && (
                            <p className="text-xs" style={{ color: '#f59e0b' }}>{formatRelativeTime(lead.next_action_due_date)}</p>
                          )}
                        </div>
                      )}
                    </Td>
                    <Td><span className="text-xs">{formatDate(lead.date_added)}</span></Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </Card>
        )}

        {/* Lead Detail Panel */}
        {selectedLead && (
          <Card>
            <CardHeader>
              <div>
                <CardTitle>{selectedLead.company_name}</CardTitle>
                <p className="text-xs mt-0.5" style={{ color: '#6b7280' }}>{selectedLead.company_type} · {selectedLead.region}</p>
              </div>
              <div className="flex items-center gap-2">
                <ScoreBadge score={selectedLead.score} />
                <StatusBadge status={selectedLead.status} />
                <Button size="sm" variant="ghost" onClick={() => setSelectedLead(null)}>✕</Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-6">
                <div className="space-y-3">
                  <h4 className="text-xs uppercase tracking-wider" style={{ color: '#6b7280' }}>Company Info</h4>
                  {[
                    ['CH Number', selectedLead.company_number],
                    ['SIC Codes', selectedLead.sic_codes],
                    ['Tier', selectedLead.tier ? `Tier ${selectedLead.tier}` : null],
                    ['Source', selectedLead.source],
                    ['Date Added', formatDate(selectedLead.date_added)],
                  ].filter(([, v]) => v).map(([k, v]) => (
                    <div key={String(k)}>
                      <p className="text-xs" style={{ color: '#6b7280' }}>{k}</p>
                      <p className="text-sm" style={{ color: '#f9fafb' }}>{v}</p>
                    </div>
                  ))}
                  {selectedLead.website_url && (
                    <a href={selectedLead.website_url} target="_blank" rel="noopener noreferrer"
                      className="text-xs" style={{ color: '#3b82f6' }}>
                      {selectedLead.website_url}
                    </a>
                  )}
                </div>
                <div className="space-y-3">
                  <h4 className="text-xs uppercase tracking-wider" style={{ color: '#6b7280' }}>Contact</h4>
                  {[
                    ['Name', selectedLead.contact_name],
                    ['Email', selectedLead.contact_email],
                    ['Phone', selectedLead.contact_phone],
                    ['Address', selectedLead.address],
                  ].filter(([, v]) => v).map(([k, v]) => (
                    <div key={String(k)}>
                      <p className="text-xs" style={{ color: '#6b7280' }}>{k}</p>
                      <p className="text-sm" style={{ color: '#f9fafb' }}>{v}</p>
                    </div>
                  ))}
                </div>
                <div className="space-y-3">
                  <h4 className="text-xs uppercase tracking-wider" style={{ color: '#6b7280' }}>Actions</h4>
                  {selectedLead.next_action && (
                    <div className="rounded-lg p-3" style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)' }}>
                      <p className="text-xs font-medium mb-1" style={{ color: '#f59e0b' }}>Next Action</p>
                      <p className="text-sm" style={{ color: '#f9fafb' }}>{selectedLead.next_action}</p>
                      {selectedLead.next_action_due_date && (
                        <p className="text-xs mt-1" style={{ color: '#f59e0b' }}>
                          Due: {formatDate(selectedLead.next_action_due_date)}
                        </p>
                      )}
                    </div>
                  )}
                  {selectedLead.notes && (
                    <div>
                      <p className="text-xs mb-1" style={{ color: '#6b7280' }}>Notes</p>
                      <p className="text-sm" style={{ color: '#9ca3af' }}>{selectedLead.notes}</p>
                    </div>
                  )}
                  {selectedLead.tags && (
                    <div>
                      <p className="text-xs mb-1" style={{ color: '#6b7280' }}>Tags</p>
                      <div className="flex flex-wrap gap-1">
                        {selectedLead.tags.split(',').map(tag => (
                          <span key={tag} className="px-2 py-0.5 rounded text-xs"
                            style={{ background: 'rgba(59,130,246,0.1)', color: '#3b82f6', border: '1px solid rgba(59,130,246,0.2)' }}>
                            {tag.trim()}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
