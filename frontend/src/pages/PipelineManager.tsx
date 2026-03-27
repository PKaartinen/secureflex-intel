import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, type Lead, type LeadCreatePayload, type LeadUpdatePayload } from '../lib/api'
import { Card, CardHeader, CardTitle, CardContent, Button, PageHeader, LoadingSpinner, EmptyState, ScoreBadge, StatusBadge, Table, Th, Td, Tr, Input } from '../components/ui'
import { formatDate, formatRelativeTime, parseScore } from '../lib/utils'
import { Kanban, TableIcon, Clock, Search, Plus, X, Save, Trash2, Sparkles, Edit3, ChevronDown } from 'lucide-react'
import ReactMarkdown from 'react-markdown'

const PIPELINE_STAGES = ['Not Contacted', 'Email 1 Sent', 'Email 2 Sent', 'Warm / Meeting', 'Pilot Live', 'Won']
const STAGE_COLORS: Record<string, string> = {
  'Not Contacted': '#6b7280',
  'Email 1 Sent': '#f59e0b',
  'Email 2 Sent': '#f97316',
  'Warm / Meeting': '#3b82f6',
  'Pilot Live': '#8b5cf6',
  'Won': '#22c55e',
}

const COMPANY_TYPES = [
  '', 'Facilities Management', 'Hotel', 'Retail', 'Healthcare', 'Education',
  'Construction', 'Warehouse/Logistics', 'Corporate', 'Prime Contractor',
  'Local Authority', 'Venue/Events', 'Tender Lead', 'Other',
]

const TIERS = ['', '1', '2', '3']

const STATUS_OPTIONS = ['Not Contacted', 'Email 1 Sent', 'Email 2 Sent', 'Warm / Meeting', 'Pilot Live', 'Won', 'Lost', 'On Hold']

// ── Form field component ────────────────────────────────────────────────────

function FormField({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="block text-xs mb-1" style={{ color: '#6b7280' }}>{label}</label>
      {children}
    </div>
  )
}

function FormInput({ value, onChange, placeholder, type = 'text' }: {
  value: string; onChange: (v: string) => void; placeholder?: string; type?: string
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full text-sm rounded-lg px-3 py-2 border outline-none focus:ring-1 focus:ring-blue-500/50"
      style={{ background: '#1f2937', color: '#f9fafb', borderColor: '#374151' }}
    />
  )
}

function FormSelect({ value, onChange, options }: {
  value: string; onChange: (v: string) => void; options: { value: string; label: string }[]
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="w-full text-sm rounded-lg px-3 py-2 border outline-none focus:ring-1 focus:ring-blue-500/50 appearance-none"
      style={{ background: '#1f2937', color: '#f9fafb', borderColor: '#374151' }}
    >
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}

function FormTextarea({ value, onChange, placeholder, rows = 3 }: {
  value: string; onChange: (v: string) => void; placeholder?: string; rows?: number
}) {
  return (
    <textarea
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      className="w-full text-sm rounded-lg px-3 py-2 border outline-none focus:ring-1 focus:ring-blue-500/50 resize-none"
      style={{ background: '#1f2937', color: '#f9fafb', borderColor: '#374151' }}
    />
  )
}


// ── Lead Card (kanban) ──────────────────────────────────────────────────────

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
      {(lead.next_action_due_date || lead.next_action_date) && (
        <div className="flex items-center gap-1 mt-2">
          <Clock size={10} style={{ color: '#f59e0b' }} />
          <span className="text-xs" style={{ color: '#f59e0b' }}>{formatRelativeTime(lead.next_action_due_date || lead.next_action_date || '')}</span>
        </div>
      )}
    </div>
  )
}


// ── Add Lead Modal ──────────────────────────────────────────────────────────

function AddLeadModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [form, setForm] = useState<LeadCreatePayload>({
    company_name: '',
    company_type: '',
    company_number: '',
    sic_codes: '',
    region: '',
    address: '',
    website_url: '',
    source: 'Manual Entry',
    status: 'Not Contacted',
    tier: '',
    notes: '',
    next_action: '',
    next_action_date: '',
  })
  const [error, setError] = useState('')

  const mutation = useMutation({
    mutationFn: () => api.createLead(form),
    onSuccess: () => onSuccess(),
    onError: (e: Error) => setError(e.message),
  })

  const set = (key: keyof LeadCreatePayload, value: string) =>
    setForm(prev => ({ ...prev, [key]: value }))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.7)' }}>
      <div
        className="rounded-xl border shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        style={{ background: '#111827', borderColor: '#1f2937' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: '#1f2937' }}>
          <h2 className="text-lg font-semibold" style={{ color: '#f9fafb' }}>Add New Lead</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-white/5" style={{ color: '#6b7280' }}>
            <X size={18} />
          </button>
        </div>

        {/* Form */}
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Company Name *" className="col-span-2">
              <FormInput value={form.company_name || ''} onChange={v => set('company_name', v)} placeholder="e.g., Acme Security Ltd" />
            </FormField>

            <FormField label="Company Type">
              <FormSelect
                value={form.company_type || ''}
                onChange={v => set('company_type', v)}
                options={COMPANY_TYPES.map(t => ({ value: t, label: t || 'Select type...' }))}
              />
            </FormField>

            <FormField label="Tier">
              <FormSelect
                value={form.tier || ''}
                onChange={v => set('tier', v)}
                options={TIERS.map(t => ({ value: t, label: t ? `Tier ${t}` : 'Select tier...' }))}
              />
            </FormField>

            <FormField label="Region">
              <FormInput value={form.region || ''} onChange={v => set('region', v)} placeholder="e.g., London" />
            </FormField>

            <FormField label="Status">
              <FormSelect
                value={form.status || 'Not Contacted'}
                onChange={v => set('status', v)}
                options={STATUS_OPTIONS.map(s => ({ value: s, label: s }))}
              />
            </FormField>

            <FormField label="Company Number (CH)">
              <FormInput value={form.company_number || ''} onChange={v => set('company_number', v)} placeholder="e.g., 12345678" />
            </FormField>

            <FormField label="SIC Codes">
              <FormInput value={form.sic_codes || ''} onChange={v => set('sic_codes', v)} placeholder="e.g., 80100 - Security" />
            </FormField>

            <FormField label="Address" className="col-span-2">
              <FormInput value={form.address || ''} onChange={v => set('address', v)} placeholder="Registered address" />
            </FormField>

            <FormField label="Website URL">
              <FormInput value={form.website_url || ''} onChange={v => set('website_url', v)} placeholder="https://..." />
            </FormField>

            <FormField label="Source">
              <FormInput value={form.source || ''} onChange={v => set('source', v)} placeholder="e.g., Manual Entry, Referral" />
            </FormField>

            <FormField label="Next Action" className="col-span-2">
              <FormInput value={form.next_action || ''} onChange={v => set('next_action', v)} placeholder="e.g., Send introduction email" />
            </FormField>

            <FormField label="Next Action Date">
              <FormInput value={form.next_action_date || ''} onChange={v => set('next_action_date', v)} placeholder="YYYY-MM-DD" type="date" />
            </FormField>

            <div /> {/* spacer */}

            <FormField label="Notes" className="col-span-2">
              <FormTextarea value={form.notes || ''} onChange={v => set('notes', v)} placeholder="Any additional notes..." rows={3} />
            </FormField>
          </div>

          {error && (
            <div className="rounded-lg p-3 text-sm" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)' }}>
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t" style={{ borderColor: '#1f2937' }}>
          <Button size="sm" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            size="sm"
            variant="primary"
            loading={mutation.isPending}
            onClick={() => {
              if (!form.company_name?.trim()) { setError('Company name is required'); return }
              mutation.mutate()
            }}
          >
            <Plus size={12} />
            Add Lead
          </Button>
        </div>
      </div>
    </div>
  )
}


// ── Edit Lead Panel ─────────────────────────────────────────────────────────

function EditLeadPanel({ lead, onClose, onSaved }: { lead: Lead; onClose: () => void; onSaved: () => void }) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState<LeadUpdatePayload>({
    company_name: lead.company_name || '',
    company_type: lead.company_type || '',
    company_number: lead.company_number || '',
    sic_codes: lead.sic_codes || '',
    region: lead.region || '',
    address: lead.address || '',
    website_url: lead.website_url || '',
    source: lead.source || '',
    status: lead.status || 'Not Contacted',
    tier: lead.tier || '',
    notes: lead.notes || '',
    next_action: lead.next_action || '',
    next_action_date: lead.next_action_date || lead.next_action_due_date || '',
  })
  const [error, setError] = useState('')
  const [brief, setBrief] = useState<string | null>(null)
  const [briefLoading, setBriefLoading] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const updateMutation = useMutation({
    mutationFn: () => api.updateLead(lead.company_id, form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pipeline'] })
      queryClient.invalidateQueries({ queryKey: ['pipeline-stats'] })
      onSaved()
    },
    onError: (e: Error) => setError(e.message),
  })

  const deleteMutation = useMutation({
    mutationFn: () => api.deleteLead(lead.company_id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pipeline'] })
      queryClient.invalidateQueries({ queryKey: ['pipeline-stats'] })
      onClose()
    },
    onError: (e: Error) => setError(e.message),
  })

  const generateBrief = async () => {
    setBriefLoading(true)
    try {
      const result = await api.aiBrief(lead.company_id)
      setBrief(result.brief)
    } catch {
      setBrief('AI brief generation unavailable. Ensure ANTHROPIC_API_KEY is configured.')
    } finally {
      setBriefLoading(false)
    }
  }

  const set = (key: keyof LeadUpdatePayload, value: string) =>
    setForm(prev => ({ ...prev, [key]: value }))

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-end" style={{ background: 'rgba(0,0,0,0.5)' }}>
      <div
        className="h-full border-l shadow-2xl flex flex-col overflow-hidden"
        style={{ width: 520, background: '#111827', borderColor: '#1f2937' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b flex-shrink-0" style={{ borderColor: '#1f2937' }}>
          <div>
            <h2 className="text-sm font-semibold" style={{ color: '#f9fafb' }}>Edit Lead</h2>
            <p className="text-xs font-mono mt-0.5" style={{ color: '#6b7280' }}>{lead.company_id}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setConfirmDelete(true)}
              className="p-1.5 rounded hover:bg-red-500/10 transition-colors"
              style={{ color: '#ef4444' }}
              title="Delete lead"
            >
              <Trash2 size={14} />
            </button>
            <button onClick={onClose} className="p-1.5 rounded hover:bg-white/5" style={{ color: '#6b7280' }}>
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Delete confirmation */}
        {confirmDelete && (
          <div className="px-5 py-3 border-b flex items-center justify-between" style={{ background: 'rgba(239,68,68,0.1)', borderColor: 'rgba(239,68,68,0.2)' }}>
            <p className="text-xs" style={{ color: '#ef4444' }}>Delete this lead permanently?</p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmDelete(false)}
                className="px-3 py-1 rounded text-xs"
                style={{ color: '#9ca3af', background: 'rgba(255,255,255,0.05)' }}
              >
                Cancel
              </button>
              <button
                onClick={() => deleteMutation.mutate()}
                disabled={deleteMutation.isPending}
                className="px-3 py-1 rounded text-xs font-medium"
                style={{ color: '#fff', background: '#ef4444' }}
              >
                {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        )}

        {/* Scrollable form */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Company Name" className="col-span-2">
              <FormInput value={form.company_name || ''} onChange={v => set('company_name', v)} />
            </FormField>

            <FormField label="Company Type">
              <FormSelect
                value={form.company_type || ''}
                onChange={v => set('company_type', v)}
                options={COMPANY_TYPES.map(t => ({ value: t, label: t || 'Select...' }))}
              />
            </FormField>

            <FormField label="Tier">
              <FormSelect
                value={form.tier || ''}
                onChange={v => set('tier', v)}
                options={TIERS.map(t => ({ value: t, label: t ? `Tier ${t}` : 'Select...' }))}
              />
            </FormField>

            <FormField label="Status">
              <FormSelect
                value={form.status || ''}
                onChange={v => set('status', v)}
                options={STATUS_OPTIONS.map(s => ({ value: s, label: s }))}
              />
            </FormField>

            <FormField label="Region">
              <FormInput value={form.region || ''} onChange={v => set('region', v)} />
            </FormField>

            <FormField label="Company Number">
              <FormInput value={form.company_number || ''} onChange={v => set('company_number', v)} />
            </FormField>

            <FormField label="SIC Codes">
              <FormInput value={form.sic_codes || ''} onChange={v => set('sic_codes', v)} />
            </FormField>

            <FormField label="Address" className="col-span-2">
              <FormInput value={form.address || ''} onChange={v => set('address', v)} />
            </FormField>

            <FormField label="Website URL" className="col-span-2">
              <FormInput value={form.website_url || ''} onChange={v => set('website_url', v)} />
            </FormField>

            <FormField label="Source">
              <FormInput value={form.source || ''} onChange={v => set('source', v)} />
            </FormField>

            <FormField label="Next Action Date">
              <FormInput value={form.next_action_date || ''} onChange={v => set('next_action_date', v)} type="date" />
            </FormField>

            <FormField label="Next Action" className="col-span-2">
              <FormInput value={form.next_action || ''} onChange={v => set('next_action', v)} placeholder="e.g., Send follow-up email" />
            </FormField>

            <FormField label="Notes" className="col-span-2">
              <FormTextarea value={form.notes || ''} onChange={v => set('notes', v)} rows={4} />
            </FormField>
          </div>

          {error && (
            <div className="rounded-lg p-3 text-xs" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)' }}>
              {error}
            </div>
          )}

          {/* AI Brief section */}
          <div className="border-t pt-4" style={{ borderColor: '#1f2937' }}>
            <p className="text-xs uppercase tracking-wider mb-2" style={{ color: '#6b7280' }}>AI Research Brief</p>
            {brief ? (
              <div className="rounded-lg p-4" style={{ background: '#0d1117', border: '1px solid #1f2937' }}>
                <div className="prose prose-invert prose-sm max-w-none" style={{ color: '#d1d5db', fontSize: '0.8rem', lineHeight: '1.5' }}>
                  <ReactMarkdown>{brief}</ReactMarkdown>
                </div>
              </div>
            ) : (
              <button
                onClick={generateBrief}
                disabled={briefLoading}
                className="flex items-center gap-2 justify-center py-2.5 rounded-lg text-xs font-medium w-full transition-all"
                style={{
                  background: 'rgba(168,85,247,0.15)',
                  color: '#a855f7',
                  border: '1px solid rgba(168,85,247,0.3)',
                  opacity: briefLoading ? 0.6 : 1,
                }}
              >
                <Sparkles size={13} />
                {briefLoading ? 'Generating Brief...' : 'Generate AI Research Brief'}
              </button>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-5 py-3 border-t flex-shrink-0" style={{ borderColor: '#1f2937' }}>
          <Button size="sm" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            size="sm"
            variant="primary"
            loading={updateMutation.isPending}
            onClick={() => updateMutation.mutate()}
          >
            <Save size={12} />
            Save Changes
          </Button>
        </div>
      </div>
    </div>
  )
}


// ── Main Component ──────────────────────────────────────────────────────────

export default function PipelineManager() {
  const queryClient = useQueryClient()
  const [view, setView] = useState<'kanban' | 'table'>('kanban')
  const [search, setSearch] = useState('')
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingLead, setEditingLead] = useState<Lead | null>(null)

  const { data: pipeline, isLoading } = useQuery({
    queryKey: ['pipeline'],
    queryFn: () => api.pipeline({ limit: 500 }),
    refetchInterval: 30_000,
  })

  const { data: stats } = useQuery({
    queryKey: ['pipeline-stats'],
    queryFn: api.pipelineStats,
    refetchInterval: 60_000,
  })

  const leads = (pipeline?.leads || []).filter(l =>
    !search || l.company_name?.toLowerCase().includes(search.toLowerCase()) ||
    l.company_type?.toLowerCase().includes(search.toLowerCase()) ||
    l.source?.toLowerCase().includes(search.toLowerCase())
  )

  const leadsByStage = PIPELINE_STAGES.reduce<Record<string, Lead[]>>((acc, stage) => {
    acc[stage] = leads.filter(l => {
      const s = l.status?.toLowerCase() || ''
      if (stage === 'Not Contacted') return s.includes('not contacted') || s === '' || s === 'prospect'
      if (stage === 'Email 1 Sent') return s.includes('email 1') || s.includes('email sent')
      if (stage === 'Email 2 Sent') return s.includes('email 2')
      if (stage === 'Warm / Meeting') return s.includes('warm') || s.includes('meeting')
      if (stage === 'Pilot Live') return s.includes('pilot')
      if (stage === 'Won') return s.includes('won')
      return s.includes(stage.toLowerCase())
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
            <Button size="sm" variant="primary" onClick={() => setShowAddModal(true)}>
              <Plus size={12} />
              Add Lead
            </Button>
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
        ) : !leads.length && !search ? (
          <EmptyState
            icon={<Kanban size={32} />}
            title="No leads in pipeline"
            description="Add leads from Prospect Explorer, Tender Radar, or manually using the Add Lead button above."
          />
        ) : view === 'kanban' ? (
          /* Kanban Board */
          <div className="flex gap-4 overflow-x-auto pb-4">
            {PIPELINE_STAGES.map(stage => {
              const stageLeads = leadsByStage[stage] || []
              const color = STAGE_COLORS[stage]
              return (
                <div key={stage} className="flex-shrink-0" style={{ width: 240 }}>
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
                    style={{ background: '#0d1117', borderColor: `${color}30`, minHeight: 100 }}
                  >
                    {stageLeads.length === 0 ? (
                      <p className="text-xs text-center py-6" style={{ color: '#374151' }}>Empty</p>
                    ) : (
                      stageLeads.map(lead => (
                        <LeadCard key={lead.company_id} lead={lead} onClick={() => setEditingLead(lead)} />
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
                  <Th>Source</Th>
                  <Th>Next Action</Th>
                  <Th>Modified</Th>
                  <Th>{' '}</Th>
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
                    <Td><span className="text-xs" style={{ color: '#6b7280' }}>{lead.source}</span></Td>
                    <Td>
                      {lead.next_action && (
                        <div>
                          <p className="text-xs truncate" style={{ color: '#9ca3af', maxWidth: 160 }}>{lead.next_action}</p>
                          {(lead.next_action_due_date || lead.next_action_date) && (
                            <p className="text-xs" style={{ color: '#f59e0b' }}>{formatRelativeTime(lead.next_action_due_date || lead.next_action_date || '')}</p>
                          )}
                        </div>
                      )}
                    </Td>
                    <Td><span className="text-xs">{formatDate(lead.last_modified || lead.created_at || '')}</span></Td>
                    <Td>
                      <button
                        onClick={e => { e.stopPropagation(); setEditingLead(lead) }}
                        className="p-1 rounded hover:bg-white/5"
                        style={{ color: '#6b7280' }}
                        title="Edit lead"
                      >
                        <Edit3 size={13} />
                      </button>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </Card>
        )}

        {/* Inline Lead Detail (table view click) */}
        {selectedLead && !editingLead && (
          <Card>
            <CardHeader>
              <div>
                <CardTitle>{selectedLead.company_name}</CardTitle>
                <p className="text-xs mt-0.5" style={{ color: '#6b7280' }}>{selectedLead.company_type} · {selectedLead.region}</p>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={selectedLead.status} />
                <Button size="sm" variant="ghost" onClick={() => setEditingLead(selectedLead)}>
                  <Edit3 size={12} /> Edit
                </Button>
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
                    ['Added', formatDate(selectedLead.created_at || selectedLead.date_added || '')],
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
                      {(selectedLead.next_action_due_date || selectedLead.next_action_date) && (
                        <p className="text-xs mt-1" style={{ color: '#f59e0b' }}>
                          Due: {formatDate(selectedLead.next_action_due_date || selectedLead.next_action_date || '')}
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
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Add Lead Modal */}
      {showAddModal && (
        <AddLeadModal
          onClose={() => setShowAddModal(false)}
          onSuccess={() => {
            setShowAddModal(false)
            queryClient.invalidateQueries({ queryKey: ['pipeline'] })
            queryClient.invalidateQueries({ queryKey: ['pipeline-stats'] })
          }}
        />
      )}

      {/* Edit Lead Panel */}
      {editingLead && (
        <EditLeadPanel
          lead={editingLead}
          onClose={() => setEditingLead(null)}
          onSaved={() => {
            setEditingLead(null)
            setSelectedLead(null)
          }}
        />
      )}
    </div>
  )
}
