import { useState, useMemo, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, type Lead, type LeadCreatePayload, type LeadUpdatePayload, type ActivityEntry } from '../lib/api'
import { Card, CardHeader, CardTitle, CardContent, Button, PageHeader, LoadingSpinner, EmptyState, StatusBadge, Table, Th, Td, Tr, Input } from '../components/ui'
import { formatDate, formatRelativeTime } from '../lib/utils'
import { useDossier } from '../lib/dossier-context'
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd'
import { Kanban, TableIcon, Clock, Search, Plus, X, Save, Trash2, Edit3, CheckSquare, Square, ArrowRight, BarChart3, AlertTriangle, Activity, Radio, FileText, RefreshCw, BookOpen, Loader2, Download } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

const PIPELINE_STAGES = ['Research', 'Outreach', 'Engaged', 'Proposal', 'Negotiation', 'Won', 'Lost']
const STAGE_COLORS: Record<string, string> = {
  Research: '#6b7280', Outreach: '#f59e0b', Engaged: '#3b82f6',
  Proposal: '#6366f1', Negotiation: '#8b5cf6', Won: '#22c55e', Lost: '#ef4444',
}
const COMPANY_TYPES = ['', 'Facilities Management', 'Hotel', 'Retail', 'Healthcare', 'Education', 'Construction', 'Warehouse/Logistics', 'Corporate', 'Prime Contractor', 'Local Authority', 'Venue/Events', 'Tender Lead', 'Other']
const TIERS = ['', '1', '2', '3']
const STATUS_OPTIONS = PIPELINE_STAGES

function daysSince(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null
  try { return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000) } catch { return null }
}
function isOverdue(dateStr: string | null | undefined): boolean {
  if (!dateStr) return false
  try { return new Date(dateStr) < new Date() } catch { return false }
}
function normalizeStatus(status: string): string {
  const s = (status || '').toLowerCase()
  for (const stage of PIPELINE_STAGES) { if (s === stage.toLowerCase()) return stage }
  if (s.includes('not contacted') || s === '' || s === 'prospect') return 'Research'
  if (s.includes('email')) return 'Outreach'
  if (s.includes('responded') || s.includes('warm') || s.includes('meeting')) return 'Engaged'
  if (s.includes('pilot')) return 'Proposal'
  if (s.includes('won')) return 'Won'
  if (s.includes('lost')) return 'Lost'
  return 'Research'
}

function FormField({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return (<div className={className}><label className="block text-xs mb-1" style={{ color: '#6b7280' }}>{label}</label>{children}</div>)
}
function FormInput({ value, onChange, placeholder, type = 'text' }: { value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return (<input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className="w-full text-sm rounded-lg px-3 py-2 border outline-none focus:ring-1 focus:ring-blue-500/50" style={{ background: '#1f2937', color: '#f9fafb', borderColor: '#374151' }} />)
}
function FormSelect({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (<select value={value} onChange={e => onChange(e.target.value)} className="w-full text-sm rounded-lg px-3 py-2 border outline-none focus:ring-1 focus:ring-blue-500/50 appearance-none" style={{ background: '#1f2937', color: '#f9fafb', borderColor: '#374151' }}>{options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select>)
}
function FormTextarea({ value, onChange, placeholder, rows = 3 }: { value: string; onChange: (v: string) => void; placeholder?: string; rows?: number }) {
  return (<textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={rows} className="w-full text-sm rounded-lg px-3 py-2 border outline-none focus:ring-1 focus:ring-blue-500/50 resize-none" style={{ background: '#1f2937', color: '#f9fafb', borderColor: '#374151' }} />)
}

function AnalyticsBar({ leads }: { leads: Lead[] }) {
  const m = useMemo(() => {
    const total = leads.length
    const won = leads.filter(l => normalizeStatus(l.status) === 'Won').length
    const lost = leads.filter(l => normalizeStatus(l.status) === 'Lost').length
    const conversionRate = (won + lost) > 0 ? Math.round((won / (won + lost)) * 100) : 0
    const wonLeads = leads.filter(l => normalizeStatus(l.status) === 'Won' && l.created_at)
    let avgDays = 0
    if (wonLeads.length > 0) {
      const totalDays = wonLeads.reduce((sum, l) => {
        const created = new Date(l.created_at || l.last_modified || '').getTime()
        const modified = new Date(l.last_modified || '').getTime()
        return sum + Math.max(0, Math.floor((modified - created) / 86400000))
      }, 0)
      avgDays = Math.round(totalDays / wonLeads.length)
    }
    const stale = leads.filter(l => {
      const st = normalizeStatus(l.status)
      if (st === 'Won' || st === 'Lost') return false
      const d = daysSince(l.last_modified)
      return d !== null && d > 14
    }).length
    return { total, conversionRate, avgDays, stale }
  }, [leads])
  return (
    <div className="grid grid-cols-4 gap-3">
      {[
        { label: 'Total Pipeline', value: `${m.total} leads`, icon: <BarChart3 size={14} />, color: '#3b82f6' },
        { label: 'Conversion Rate', value: `${m.conversionRate}%`, icon: <ArrowRight size={14} />, color: '#22c55e' },
        { label: 'Avg. Days to Won', value: `${m.avgDays}d`, icon: <Clock size={14} />, color: '#f59e0b' },
        { label: 'Stale Leads', value: String(m.stale), icon: <AlertTriangle size={14} />, color: m.stale > 0 ? '#ef4444' : '#6b7280' },
      ].map(item => (
        <div key={item.label} className="rounded-lg p-3 border" style={{ background: '#0d1117', borderColor: '#1f2937' }}>
          <div className="flex items-center gap-1.5 mb-1"><span style={{ color: item.color }}>{item.icon}</span><span className="text-xs" style={{ color: '#6b7280' }}>{item.label}</span></div>
          <p className="text-lg font-semibold" style={{ color: '#f9fafb' }}>{item.value}</p>
        </div>
      ))}
    </div>
  )
}

function LeadCard({ lead, onClick, isSelected, onToggleSelect }: { lead: Lead; onClick: () => void; isSelected: boolean; onToggleSelect: (e: React.MouseEvent) => void }) {
  const overdue = isOverdue(lead.next_action_date || lead.next_action_due_date)
  const lastActionDays = daysSince(lead.last_modified)
  return (
    <div onClick={onClick} className="rounded-lg p-3 border cursor-pointer hover:border-blue-500/30 transition-all group" style={{ background: '#0d1117', borderColor: overdue ? '#ef4444' : '#1f2937', borderWidth: overdue ? 2 : 1 }}>
      <div className="flex items-start gap-2 mb-2">
        <button onClick={onToggleSelect} className="mt-0.5 flex-shrink-0 opacity-40 group-hover:opacity-100 transition-opacity" style={{ color: isSelected ? '#3b82f6' : '#6b7280' }}>
          {isSelected ? <CheckSquare size={14} /> : <Square size={14} />}
        </button>
        <p className="text-sm font-medium leading-tight truncate flex-1" style={{ color: '#f9fafb' }}>{lead.company_name}</p>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        {lead.tier && <span className="inline-block px-1.5 py-0.5 rounded text-xs" style={{ background: 'rgba(59,130,246,0.1)', color: '#3b82f6', border: '1px solid rgba(59,130,246,0.2)' }}>T{lead.tier}</span>}
        {lead.source && <span className="text-xs truncate" style={{ color: '#6b7280', maxWidth: 100 }}>{lead.source}</span>}
      </div>
      <div className="flex items-center justify-between mt-2">
        {lastActionDays !== null && <span className="text-xs" style={{ color: lastActionDays > 14 ? '#ef4444' : '#6b7280' }}>{lastActionDays}d ago</span>}
        {(lead.next_action_date || lead.next_action_due_date) && (
          <div className="flex items-center gap-1">
            <Clock size={10} style={{ color: overdue ? '#ef4444' : '#f59e0b' }} />
            <span className="text-xs" style={{ color: overdue ? '#ef4444' : '#f59e0b' }}>{formatRelativeTime(lead.next_action_date || lead.next_action_due_date || '')}</span>
          </div>
        )}
      </div>
    </div>
  )
}

function BulkActionBar({ selectedIds, onClear, onRefresh }: { selectedIds: string[]; onClear: () => void; onRefresh: () => void }) {
  const [moveTarget, setMoveTarget] = useState('')
  const [tierTarget, setTierTarget] = useState('')
  const bulkMoveMut = useMutation({ mutationFn: () => api.bulkUpdateLeads(selectedIds, { status: moveTarget }), onSuccess: () => { onRefresh(); onClear(); setMoveTarget('') } })
  const bulkTierMut = useMutation({ mutationFn: () => api.bulkUpdateLeads(selectedIds, { tier: tierTarget }), onSuccess: () => { onRefresh(); onClear(); setTierTarget('') } })
  const bulkDelMut = useMutation({ mutationFn: () => api.bulkDeleteLeads(selectedIds), onSuccess: () => { onRefresh(); onClear() } })
  if (selectedIds.length === 0) return null
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 rounded-xl px-5 py-3 shadow-2xl border" style={{ background: '#1f2937', borderColor: '#374151' }}>
      <span className="text-sm font-medium" style={{ color: '#f9fafb' }}>{selectedIds.length} selected</span>
      <div className="h-4 w-px" style={{ background: '#374151' }} />
      <select value={moveTarget} onChange={e => setMoveTarget(e.target.value)} className="text-xs rounded-lg px-2 py-1.5 border appearance-none" style={{ background: '#111827', color: '#f9fafb', borderColor: '#374151' }}>
        <option value="">Move to...</option>
        {PIPELINE_STAGES.map(s => <option key={s} value={s}>{s}</option>)}
      </select>
      {moveTarget && <Button size="sm" variant="primary" loading={bulkMoveMut.isPending} onClick={() => bulkMoveMut.mutate()}><ArrowRight size={12} /> Move</Button>}
      <select value={tierTarget} onChange={e => setTierTarget(e.target.value)} className="text-xs rounded-lg px-2 py-1.5 border appearance-none" style={{ background: '#111827', color: '#f9fafb', borderColor: '#374151' }}>
        <option value="">Tier...</option>
        {['1','2','3'].map(t => <option key={t} value={t}>Tier {t}</option>)}
      </select>
      {tierTarget && <Button size="sm" variant="primary" loading={bulkTierMut.isPending} onClick={() => bulkTierMut.mutate()}>Change Tier</Button>}
      <div className="h-4 w-px" style={{ background: '#374151' }} />
      <Button size="sm" variant="danger" loading={bulkDelMut.isPending} onClick={() => { if (confirm(`Archive ${selectedIds.length} leads?`)) bulkDelMut.mutate() }}><Trash2 size={12} /> Archive</Button>
      <button onClick={onClear} className="p-1 rounded hover:bg-white/5" style={{ color: '#6b7280' }}><X size={14} /></button>
    </div>
  )
}

function AddLeadModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [form, setForm] = useState<LeadCreatePayload>({ company_name: '', company_type: '', company_number: '', sic_codes: '', region: '', address: '', website_url: '', source: 'Manual Entry', status: 'Research', tier: '', notes: '', next_action: '', next_action_date: '' })
  const [error, setError] = useState('')
  const mutation = useMutation({ mutationFn: () => api.createLead(form), onSuccess, onError: (e: Error) => setError(e.message) })
  const set = (key: keyof LeadCreatePayload, value: string) => setForm(prev => ({ ...prev, [key]: value }))
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.7)' }}>
      <div className="rounded-xl border shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" style={{ background: '#111827', borderColor: '#1f2937' }}>
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: '#1f2937' }}>
          <h2 className="text-lg font-semibold" style={{ color: '#f9fafb' }}>Add New Lead</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-white/5" style={{ color: '#6b7280' }}><X size={18} /></button>
        </div>
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Company Name *" className="col-span-2"><FormInput value={form.company_name || ''} onChange={v => set('company_name', v)} placeholder="e.g., Acme Security Ltd" /></FormField>
            <FormField label="Company Type"><FormSelect value={form.company_type || ''} onChange={v => set('company_type', v)} options={COMPANY_TYPES.map(t => ({ value: t, label: t || 'Select type...' }))} /></FormField>
            <FormField label="Tier"><FormSelect value={form.tier || ''} onChange={v => set('tier', v)} options={TIERS.map(t => ({ value: t, label: t ? `Tier ${t}` : 'Select tier...' }))} /></FormField>
            <FormField label="Region"><FormInput value={form.region || ''} onChange={v => set('region', v)} placeholder="e.g., London" /></FormField>
            <FormField label="Status"><FormSelect value={form.status || 'Research'} onChange={v => set('status', v)} options={STATUS_OPTIONS.map(s => ({ value: s, label: s }))} /></FormField>
            <FormField label="Company Number (CH)"><FormInput value={form.company_number || ''} onChange={v => set('company_number', v)} placeholder="e.g., 12345678" /></FormField>
            <FormField label="SIC Codes"><FormInput value={form.sic_codes || ''} onChange={v => set('sic_codes', v)} placeholder="e.g., 80100 - Security" /></FormField>
            <FormField label="Address" className="col-span-2"><FormInput value={form.address || ''} onChange={v => set('address', v)} placeholder="Registered address" /></FormField>
            <FormField label="Website URL"><FormInput value={form.website_url || ''} onChange={v => set('website_url', v)} placeholder="https://..." /></FormField>
            <FormField label="Source"><FormInput value={form.source || ''} onChange={v => set('source', v)} placeholder="e.g., Manual Entry, Referral" /></FormField>
            <FormField label="Next Action" className="col-span-2"><FormInput value={form.next_action || ''} onChange={v => set('next_action', v)} placeholder="e.g., Send introduction email" /></FormField>
            <FormField label="Next Action Date"><FormInput value={form.next_action_date || ''} onChange={v => set('next_action_date', v)} type="date" /></FormField>
            <div />
            <FormField label="Notes" className="col-span-2"><FormTextarea value={form.notes || ''} onChange={v => set('notes', v)} placeholder="Any additional notes..." rows={3} /></FormField>
          </div>
          {error && <div className="rounded-lg p-3 text-sm" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)' }}>{error}</div>}
        </div>
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t" style={{ borderColor: '#1f2937' }}>
          <Button size="sm" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button size="sm" variant="primary" loading={mutation.isPending} onClick={() => { if (!form.company_name?.trim()) { setError('Company name is required'); return }; mutation.mutate() }}><Plus size={12} /> Add Lead</Button>
        </div>
      </div>
    </div>
  )
}

// ── Tab: Details ───────────────────────────────────────────────────────────

function DetailsTab({ lead, onSaved, onClose }: { lead: Lead; onSaved: () => void; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState<LeadUpdatePayload>({
    company_name: lead.company_name || '', company_type: lead.company_type || '', company_number: lead.company_number || '',
    sic_codes: lead.sic_codes || '', region: lead.region || '', address: lead.address || '', website_url: lead.website_url || '',
    source: lead.source || '', status: normalizeStatus(lead.status), tier: lead.tier || '', notes: lead.notes || '',
    next_action: lead.next_action || '', next_action_date: lead.next_action_date || lead.next_action_due_date || '',
    contact_name: lead.contact_name || '', contact_email: lead.contact_email || '', contact_phone: lead.contact_phone || '',
  })
  const [error, setError] = useState('')
  const updateMut = useMutation({
    mutationFn: () => api.updateLead(lead.company_id, form),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['pipeline'] }); queryClient.invalidateQueries({ queryKey: ['pipeline-stats'] }); onSaved() },
    onError: (e: Error) => setError(e.message),
  })
  const set = (key: keyof LeadUpdatePayload, value: string) => setForm(prev => ({ ...prev, [key]: value }))
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Company Name" className="col-span-2"><FormInput value={form.company_name || ''} onChange={v => set('company_name', v)} /></FormField>
        <FormField label="Company Type"><FormSelect value={form.company_type || ''} onChange={v => set('company_type', v)} options={COMPANY_TYPES.map(t => ({ value: t, label: t || 'Select...' }))} /></FormField>
        <FormField label="Tier"><FormSelect value={form.tier || ''} onChange={v => set('tier', v)} options={TIERS.map(t => ({ value: t, label: t ? `Tier ${t}` : 'Select...' }))} /></FormField>
        <FormField label="Status"><FormSelect value={form.status || ''} onChange={v => set('status', v)} options={STATUS_OPTIONS.map(s => ({ value: s, label: s }))} /></FormField>
        <FormField label="Region"><FormInput value={form.region || ''} onChange={v => set('region', v)} /></FormField>
        <FormField label="Contact Name"><FormInput value={form.contact_name || ''} onChange={v => set('contact_name', v)} placeholder="Full name" /></FormField>
        <FormField label="Contact Email"><FormInput value={form.contact_email || ''} onChange={v => set('contact_email', v)} placeholder="email@company.com" type="email" /></FormField>
        <FormField label="Contact Phone"><FormInput value={form.contact_phone || ''} onChange={v => set('contact_phone', v)} placeholder="+44..." /></FormField>
        <FormField label="Company Number"><FormInput value={form.company_number || ''} onChange={v => set('company_number', v)} /></FormField>
        <FormField label="Website URL" className="col-span-2"><FormInput value={form.website_url || ''} onChange={v => set('website_url', v)} /></FormField>
        <FormField label="Source"><FormInput value={form.source || ''} onChange={v => set('source', v)} /></FormField>
        <FormField label="Next Action Date"><FormInput value={form.next_action_date || ''} onChange={v => set('next_action_date', v)} type="date" /></FormField>
        <FormField label="Next Action" className="col-span-2"><FormInput value={form.next_action || ''} onChange={v => set('next_action', v)} placeholder="e.g., Send follow-up email" /></FormField>
        <FormField label="Notes" className="col-span-2"><FormTextarea value={form.notes || ''} onChange={v => set('notes', v)} rows={4} /></FormField>
      </div>
      {error && <div className="rounded-lg p-3 text-xs" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)' }}>{error}</div>}
      <div className="flex justify-end">
        <Button size="sm" variant="primary" loading={updateMut.isPending} onClick={() => updateMut.mutate()}><Save size={12} /> Save Changes</Button>
      </div>
    </div>
  )
}

// ── Tab: Dossier ───────────────────────────────────────────────────────────

function DossierTab({ lead }: { lead: Lead }) {
  const { openDossier } = useDossier()
  const companyKey = lead.company_number?.trim() ? lead.company_number.trim().toUpperCase() : `name_${lead.company_name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '').slice(0, 80)}`
  const { data: dossier, isLoading, refetch } = useQuery({
    queryKey: ['dossier', companyKey],
    queryFn: () => api.getDossierByCompany(companyKey),
    staleTime: 60_000,
  })
  const generateMut = useMutation({
    mutationFn: () => api.generateDossier({ company_name: lead.company_name, company_number: lead.company_number || '', company_type: lead.company_type || '', region: lead.region || '' }),
    onSuccess: () => refetch(),
  })
  if (isLoading) return <div className="flex justify-center py-12"><Loader2 size={20} className="animate-spin" style={{ color: '#6b7280' }} /></div>
  if (!dossier?.dossier_markdown) {
    return (
      <div className="text-center py-12">
        <BookOpen size={32} className="mx-auto mb-3" style={{ color: '#374151' }} />
        <p className="text-sm mb-4" style={{ color: '#6b7280' }}>No dossier generated yet for this company.</p>
        <Button size="sm" variant="primary" loading={generateMut.isPending} onClick={() => generateMut.mutate()}><BookOpen size={12} /> Generate Dossier</Button>
      </div>
    )
  }
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs" style={{ color: '#6b7280' }}>Generated: {formatDate(dossier.generated_at)}</span>
        <Button size="sm" variant="ghost" loading={generateMut.isPending} onClick={() => generateMut.mutate()}><RefreshCw size={12} /> Regenerate</Button>
      </div>
      <div className="prose prose-invert prose-sm max-w-none rounded-lg p-4 border overflow-y-auto" style={{ background: '#0d1117', borderColor: '#1f2937', maxHeight: 500 }}>
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{dossier.dossier_markdown}</ReactMarkdown>
      </div>
    </div>
  )
}

// ── Tab: Signals ───────────────────────────────────────────────────────────

function SignalsTab({ lead }: { lead: Lead }) {
  const { data, isLoading } = useQuery({
    queryKey: ['signals-for-company', lead.company_number],
    queryFn: () => api.signalsForCompany(lead.company_number!),
    enabled: !!lead.company_number,
    staleTime: 60_000,
  })
  if (!lead.company_number) return <p className="text-sm py-8 text-center" style={{ color: '#6b7280' }}>No company number set. Add a Companies House number to see matched signals.</p>
  if (isLoading) return <div className="flex justify-center py-12"><Loader2 size={20} className="animate-spin" style={{ color: '#6b7280' }} /></div>
  if (!data?.signals?.length) return (
    <div className="text-center py-12">
      <Radio size={32} className="mx-auto mb-3" style={{ color: '#374151' }} />
      <p className="text-sm" style={{ color: '#6b7280' }}>No signals detected for this company.</p>
    </div>
  )
  const typeIcons: Record<string, string> = { gazette: '📜', hse: '⚠️', planning: '🏗️', ch_event: '🏢', news: '📰', acs: '🛡️' }
  return (
    <div className="space-y-2">
      {data.signals.map((sig: any, i: number) => (
        <div key={sig.id || i} className="rounded-lg p-3 border" style={{ background: '#0d1117', borderColor: '#1f2937' }}>
          <div className="flex items-start gap-2">
            <span className="text-base flex-shrink-0">{typeIcons[(sig.signal_type || sig.type || '').toLowerCase()] || '📡'}</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate" style={{ color: '#f9fafb' }}>{sig.title}</p>
              <div className="flex items-center gap-3 mt-1">
                {sig.match?.match_score && <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'rgba(34,197,94,0.1)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.2)' }}>{sig.match.match_score}% match</span>}
                <span className="text-xs" style={{ color: '#6b7280' }}>{sig.source}</span>
                <span className="text-xs" style={{ color: '#6b7280' }}>{formatDate(sig.published || sig.scanned_at)}</span>
              </div>
              {sig.description && <p className="text-xs mt-1 line-clamp-2" style={{ color: '#9ca3af' }}>{sig.description}</p>}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Tab: Activity ──────────────────────────────────────────────────────────

function ActivityTab({ lead }: { lead: Lead }) {
  const { data, isLoading } = useQuery({
    queryKey: ['pipeline-activity', lead.company_id],
    queryFn: () => api.pipelineActivity(lead.company_id),
    staleTime: 30_000,
  })
  if (isLoading) return <div className="flex justify-center py-12"><Loader2 size={20} className="animate-spin" style={{ color: '#6b7280' }} /></div>
  const activity = (data?.activity || []).slice().reverse()
  if (!activity.length) return (
    <div className="text-center py-12">
      <Activity size={32} className="mx-auto mb-3" style={{ color: '#374151' }} />
      <p className="text-sm" style={{ color: '#6b7280' }}>No activity recorded yet.</p>
    </div>
  )
  const actionIcons: Record<string, string> = { status_change: '🔄', notes_updated: '📝', next_action_set: '📌', tier_change: '🏷️' }
  return (
    <div className="space-y-0">
      {activity.map((entry: ActivityEntry, i: number) => (
        <div key={i} className="flex gap-3 py-3 border-b last:border-0" style={{ borderColor: '#1f2937' }}>
          <div className="flex flex-col items-center">
            <span className="text-sm">{actionIcons[entry.action] || '📋'}</span>
            {i < activity.length - 1 && <div className="flex-1 w-px mt-1" style={{ background: '#1f2937' }} />}
          </div>
          <div className="flex-1">
            <p className="text-sm" style={{ color: '#f9fafb' }}>{entry.description}</p>
            <p className="text-xs mt-0.5" style={{ color: '#6b7280' }}>{formatDate(entry.timestamp)}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Lead Intelligence Panel ────────────────────────────────────────────────

function LeadIntelligencePanel({ lead, onClose, onSaved }: { lead: Lead; onClose: () => void; onSaved: () => void }) {
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<'details' | 'dossier' | 'signals' | 'activity'>('details')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const deleteMut = useMutation({
    mutationFn: () => api.deleteLead(lead.company_id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['pipeline'] }); queryClient.invalidateQueries({ queryKey: ['pipeline-stats'] }); onClose() },
  })

  const tabs = [
    { id: 'details' as const, label: 'Details', icon: <FileText size={13} /> },
    { id: 'dossier' as const, label: 'Dossier', icon: <BookOpen size={13} /> },
    { id: 'signals' as const, label: 'Signals', icon: <Radio size={13} /> },
    { id: 'activity' as const, label: 'Activity', icon: <Activity size={13} /> },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-end" style={{ background: 'rgba(0,0,0,0.5)' }}>
      <div className="h-full border-l shadow-2xl flex flex-col overflow-hidden" style={{ width: 560, background: '#111827', borderColor: '#1f2937' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b flex-shrink-0" style={{ borderColor: '#1f2937' }}>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold truncate" style={{ color: '#f9fafb' }}>{lead.company_name}</h2>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs font-mono" style={{ color: '#6b7280' }}>{lead.company_id}</span>
              <StatusBadge status={normalizeStatus(lead.status)} />
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button onClick={() => setConfirmDelete(true)} className="p-1.5 rounded hover:bg-red-500/10 transition-colors" style={{ color: '#ef4444' }} title="Delete lead"><Trash2 size={14} /></button>
            <button onClick={onClose} className="p-1.5 rounded hover:bg-white/5" style={{ color: '#6b7280' }}><X size={16} /></button>
          </div>
        </div>

        {/* Delete confirmation */}
        {confirmDelete && (
          <div className="px-5 py-3 border-b flex items-center justify-between" style={{ background: 'rgba(239,68,68,0.1)', borderColor: 'rgba(239,68,68,0.2)' }}>
            <p className="text-xs" style={{ color: '#ef4444' }}>Delete this lead permanently?</p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmDelete(false)} className="px-3 py-1 rounded text-xs" style={{ color: '#9ca3af', background: 'rgba(255,255,255,0.05)' }}>Cancel</button>
              <button onClick={() => deleteMut.mutate()} disabled={deleteMut.isPending} className="px-3 py-1 rounded text-xs font-medium" style={{ color: '#fff', background: '#ef4444' }}>{deleteMut.isPending ? 'Deleting...' : 'Delete'}</button>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex border-b flex-shrink-0" style={{ borderColor: '#1f2937' }}>
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium transition-colors border-b-2"
              style={{
                color: tab === t.id ? '#3b82f6' : '#6b7280',
                borderColor: tab === t.id ? '#3b82f6' : 'transparent',
                background: tab === t.id ? 'rgba(59,130,246,0.05)' : 'transparent',
              }}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto p-5">
          {tab === 'details' && <DetailsTab lead={lead} onSaved={onSaved} onClose={onClose} />}
          {tab === 'dossier' && <DossierTab lead={lead} />}
          {tab === 'signals' && <SignalsTab lead={lead} />}
          {tab === 'activity' && <ActivityTab lead={lead} />}
        </div>
      </div>
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────

export default function PipelineManager() {
  const queryClient = useQueryClient()
  const [view, setView] = useState<'kanban' | 'table'>('kanban')
  const [search, setSearch] = useState('')
  const [editingLead, setEditingLead] = useState<Lead | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])

  const { data: pipeline, isLoading } = useQuery({
    queryKey: ['pipeline'],
    queryFn: () => api.pipeline({ limit: 500 }),
    refetchInterval: 30_000,
  })

  const leads = useMemo(() => (pipeline?.leads || []).filter(l =>
    !search || l.company_name?.toLowerCase().includes(search.toLowerCase()) ||
    l.company_type?.toLowerCase().includes(search.toLowerCase()) ||
    l.source?.toLowerCase().includes(search.toLowerCase())
  ), [pipeline, search])

  const leadsByStage = useMemo(() => PIPELINE_STAGES.reduce<Record<string, Lead[]>>((acc, stage) => {
    acc[stage] = leads.filter(l => normalizeStatus(l.status) === stage)
    return acc
  }, {}), [leads])

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }, [])

  const refreshAll = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['pipeline'] })
    queryClient.invalidateQueries({ queryKey: ['pipeline-stats'] })
  }, [queryClient])

  // Drag-and-drop handler
  const updateStatusMut = useMutation({
    mutationFn: ({ companyId, status }: { companyId: string; status: string }) =>
      api.updateLead(companyId, { status }),
    onSuccess: () => refreshAll(),
  })

  const onDragEnd = useCallback((result: DropResult) => {
    if (!result.destination) return
    const destStage = result.destination.droppableId
    const companyId = result.draggableId
    const lead = leads.find(l => l.company_id === companyId)
    if (!lead || normalizeStatus(lead.status) === destStage) return
    updateStatusMut.mutate({ companyId, status: destStage })
  }, [leads, updateStatusMut])

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <PageHeader
        title="PIPELINE MANAGER"
        subtitle={`${pipeline?.total || 0} leads across ${PIPELINE_STAGES.length} stages`}
        actions={
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg overflow-hidden border" style={{ borderColor: '#374151' }}>
              <button onClick={() => setView('kanban')} className="flex items-center gap-1.5 px-3 py-1.5 text-xs transition-colors" style={{ background: view === 'kanban' ? 'rgba(59,130,246,0.2)' : 'transparent', color: view === 'kanban' ? '#3b82f6' : '#9ca3af' }}>
                <Kanban size={12} /> Board
              </button>
              <button onClick={() => setView('table')} className="flex items-center gap-1.5 px-3 py-1.5 text-xs transition-colors" style={{ background: view === 'table' ? 'rgba(59,130,246,0.2)' : 'transparent', color: view === 'table' ? '#3b82f6' : '#9ca3af' }}>
                <TableIcon size={12} /> Table
              </button>
            </div>
            <Button size="sm" variant="ghost" onClick={() => api.exportPipelineCSV()}><Download size={12} /> Export CSV</Button>
            <Button size="sm" variant="primary" onClick={() => setShowAddModal(true)}><Plus size={12} /> Add Lead</Button>
          </div>
        }
      />

      <div className="flex-1 p-6 space-y-4">
        {/* Analytics Bar */}
        <AnalyticsBar leads={leads} />

        {/* Search */}
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: '#6b7280' }} />
          <Input placeholder="Search leads..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 w-64" />
        </div>

        {isLoading ? (
          <LoadingSpinner />
        ) : !leads.length && !search ? (
          <EmptyState icon={<Kanban size={32} />} title="No leads in pipeline" description="Add leads from Prospect Explorer, Tender Radar, or manually using the Add Lead button above." />
        ) : view === 'kanban' ? (
          /* ── Kanban Board with DnD ── */
          <DragDropContext onDragEnd={onDragEnd}>
            <div className="flex gap-3 overflow-x-auto pb-4">
              {PIPELINE_STAGES.map(stage => {
                const stageLeads = leadsByStage[stage] || []
                const color = STAGE_COLORS[stage]
                return (
                  <div key={stage} className="flex-shrink-0" style={{ width: 240 }}>
                    <div className="flex items-center justify-between px-3 py-2 rounded-t-lg border border-b-0" style={{ background: `${color}15`, borderColor: `${color}30` }}>
                      <span className="text-xs font-semibold" style={{ color }}>{stage}</span>
                      <span className="text-xs font-mono px-1.5 py-0.5 rounded" style={{ background: `${color}20`, color }}>{stageLeads.length}</span>
                    </div>
                    <Droppable droppableId={stage}>
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.droppableProps}
                          className="rounded-b-lg border border-t-0 p-2 space-y-2 transition-colors"
                          style={{
                            background: snapshot.isDraggingOver ? `${color}08` : '#0d1117',
                            borderColor: `${color}30`,
                            minHeight: 100,
                          }}
                        >
                          {stageLeads.length === 0 && !snapshot.isDraggingOver ? (
                            <p className="text-xs text-center py-6" style={{ color: '#374151' }}>Empty</p>
                          ) : (
                            stageLeads.map((lead, index) => (
                              <Draggable key={lead.company_id} draggableId={lead.company_id} index={index}>
                                {(dragProvided, dragSnapshot) => (
                                  <div
                                    ref={dragProvided.innerRef}
                                    {...dragProvided.draggableProps}
                                    {...dragProvided.dragHandleProps}
                                    style={{
                                      ...dragProvided.draggableProps.style,
                                      opacity: dragSnapshot.isDragging ? 0.85 : 1,
                                    }}
                                  >
                                    <LeadCard
                                      lead={lead}
                                      onClick={() => setEditingLead(lead)}
                                      isSelected={selectedIds.includes(lead.company_id)}
                                      onToggleSelect={(e) => { e.stopPropagation(); toggleSelect(lead.company_id) }}
                                    />
                                  </div>
                                )}
                              </Draggable>
                            ))
                          )}
                          {provided.placeholder}
                        </div>
                      )}
                    </Droppable>
                  </div>
                )
              })}
            </div>
          </DragDropContext>
        ) : (
          /* ── Table View ── */
          <Card>
            <Table>
              <thead>
                <tr>
                  <Th><span className="sr-only">Select</span></Th>
                  <Th>Company</Th>
                  <Th>Type</Th>
                  <Th>Tier</Th>
                  <Th>Status</Th>
                  <Th>Source</Th>
                  <Th>Next Action</Th>
                  <Th>Modified</Th>
                  <Th> </Th>
                </tr>
              </thead>
              <tbody>
                {leads.map(lead => (
                  <Tr key={lead.company_id} onClick={() => setEditingLead(lead)}>
                    <Td>
                      <button onClick={e => { e.stopPropagation(); toggleSelect(lead.company_id) }} style={{ color: selectedIds.includes(lead.company_id) ? '#3b82f6' : '#6b7280' }}>
                        {selectedIds.includes(lead.company_id) ? <CheckSquare size={14} /> : <Square size={14} />}
                      </button>
                    </Td>
                    <Td>
                      <div>
                        <p className="text-sm font-medium" style={{ color: '#f9fafb' }}>{lead.company_name}</p>
                        {lead.company_number && <p className="text-xs font-mono" style={{ color: '#374151' }}>CH#{lead.company_number}</p>}
                      </div>
                    </Td>
                    <Td><span className="text-xs">{lead.company_type}</span></Td>
                    <Td>{lead.tier && <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'rgba(59,130,246,0.1)', color: '#3b82f6' }}>T{lead.tier}</span>}</Td>
                    <Td><StatusBadge status={normalizeStatus(lead.status)} /></Td>
                    <Td><span className="text-xs" style={{ color: '#6b7280' }}>{lead.source}</span></Td>
                    <Td>
                      {lead.next_action && (
                        <div>
                          <p className="text-xs truncate" style={{ color: '#9ca3af', maxWidth: 160 }}>{lead.next_action}</p>
                          {(lead.next_action_due_date || lead.next_action_date) && (
                            <p className="text-xs" style={{ color: isOverdue(lead.next_action_date || lead.next_action_due_date) ? '#ef4444' : '#f59e0b' }}>{formatRelativeTime(lead.next_action_due_date || lead.next_action_date || '')}</p>
                          )}
                        </div>
                      )}
                    </Td>
                    <Td><span className="text-xs">{formatDate(lead.last_modified || lead.created_at || '')}</span></Td>
                    <Td>
                      <button onClick={e => { e.stopPropagation(); setEditingLead(lead) }} className="p-1 rounded hover:bg-white/5" style={{ color: '#6b7280' }} title="Edit lead"><Edit3 size={13} /></button>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </Card>
        )}
      </div>

      {/* Bulk Action Bar */}
      <BulkActionBar selectedIds={selectedIds} onClear={() => setSelectedIds([])} onRefresh={refreshAll} />

      {/* Add Lead Modal */}
      {showAddModal && (
        <AddLeadModal
          onClose={() => setShowAddModal(false)}
          onSuccess={() => { setShowAddModal(false); refreshAll() }}
        />
      )}

      {/* Lead Intelligence Panel */}
      {editingLead && (
        <LeadIntelligencePanel
          lead={editingLead}
          onClose={() => setEditingLead(null)}
          onSaved={() => { setEditingLead(null); refreshAll() }}
        />
      )}
    </div>
  )
}
