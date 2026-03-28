import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api, type DossierListItem, type DossierResponse } from '../lib/api'
import { Button, PageHeader, LoadingSpinner, EmptyState } from '../components/ui'
import { formatDate, formatRelativeTime } from '../lib/utils'
import { BookOpen, ChevronRight, X, Sparkles, Loader2, Search, Plus } from 'lucide-react'
import ReactMarkdown from 'react-markdown'

export default function ResearchBriefs() {
  const [selectedDossier, setSelectedDossier] = useState<DossierListItem | null>(null)
  const [dossierContent, setDossierContent] = useState<DossierResponse | null>(null)
  const [dossierLoading, setDossierLoading] = useState(false)
  const [showGenerateForm, setShowGenerateForm] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  const { data: dossierList, isLoading, refetch: refetchDossiers } = useQuery({
    queryKey: ['dossier-list'],
    queryFn: api.listDossiers,
    refetchInterval: 60_000,
  })

  const filteredDossiers = (dossierList?.dossiers || []).filter(d => {
    if (!searchQuery) return true
    const q = searchQuery.toLowerCase()
    return d.company_name?.toLowerCase().includes(q) || d.company_key?.toLowerCase().includes(q)
  })

  const handleSelectDossier = async (item: DossierListItem) => {
    setSelectedDossier(item)
    setDossierContent(null)
    setDossierLoading(true)
    try {
      const result = await api.getDossierByCompany(item.company_key)
      setDossierContent(result)
    } finally {
      setDossierLoading(false)
    }
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <PageHeader
        title="SALES DOSSIERS"
        subtitle={`${dossierList?.total || 0} AI-generated sales intelligence dossiers — persistent, searchable, and always available`}
        actions={
          <Button
            size="sm"
            variant="primary"
            onClick={() => setShowGenerateForm(true)}
          >
            <Plus size={12} />
            Generate New Dossier
          </Button>
        }
      />

      <div className="flex flex-1 overflow-hidden">
        {/* Dossier list sidebar */}
        <div
          className="flex-shrink-0 border-r overflow-hidden flex flex-col"
          style={{ width: 340, background: '#0d1117', borderColor: '#1f2937' }}
        >
          {/* Search */}
          <div className="p-3 border-b flex-shrink-0" style={{ borderColor: '#1f2937' }}>
            <div className="relative">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: '#6b7280' }} />
              <input
                type="text"
                placeholder="Search dossiers..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full text-xs rounded-lg pl-8 pr-3 py-2 border"
                style={{ background: '#111827', color: '#f9fafb', borderColor: '#374151' }}
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              <LoadingSpinner />
            ) : filteredDossiers.length === 0 ? (
              <EmptyState
                icon={<BookOpen size={32} />}
                title="No dossiers yet"
                description={searchQuery
                  ? 'No dossiers match your search'
                  : 'Generate dossiers from Prospect Explorer, Tender Radar, or Pipeline Manager — or use the button above'
                }
              />
            ) : (
              <div className="divide-y divide-gray-800">
                {filteredDossiers.map(item => (
                  <button
                    key={item.company_key}
                    onClick={() => handleSelectDossier(item)}
                    className="w-full text-left px-4 py-3 hover:bg-white/5 transition-colors"
                    style={{
                      background: selectedDossier?.company_key === item.company_key ? 'rgba(59,130,246,0.1)' : 'transparent',
                      borderLeft: selectedDossier?.company_key === item.company_key ? '2px solid #3b82f6' : '2px solid transparent',
                    }}
                  >
                    <div className="flex items-start gap-3">
                      <BookOpen size={14} className="mt-0.5 flex-shrink-0" style={{ color: '#3b82f6' }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate" style={{ color: '#f9fafb' }}>
                          {item.company_name}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {item.company_type && (
                            <span className="text-xs" style={{ color: '#6b7280' }}>{item.company_type}</span>
                          )}
                          <span className="text-xs" style={{ color: '#374151' }}>
                            {formatRelativeTime(item.updated_at)}
                          </span>
                        </div>
                      </div>
                      <ChevronRight size={12} style={{ color: '#374151' }} />
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Content pane */}
        <div className="flex-1 overflow-y-auto p-6">
          {showGenerateForm ? (
            <GenerateDossierForm
              onClose={() => setShowGenerateForm(false)}
              onGenerated={() => {
                setShowGenerateForm(false)
                refetchDossiers()
              }}
            />
          ) : selectedDossier ? (
            dossierLoading ? <LoadingSpinner /> : dossierContent ? (
              <DossierViewer
                item={selectedDossier}
                dossier={dossierContent}
                onClose={() => { setSelectedDossier(null); setDossierContent(null) }}
                onRegenerated={() => { handleSelectDossier(selectedDossier); refetchDossiers() }}
              />
            ) : null
          ) : (
            <div className="flex flex-col items-center justify-center h-full">
              <BookOpen size={48} style={{ color: '#1f2937' }} />
              <p className="mt-4 text-sm" style={{ color: '#374151' }}>Select a dossier to view</p>
              <p className="text-xs mt-1" style={{ color: '#1f2937' }}>
                Or generate a new Sales Intelligence Dossier using the button above
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}


const markdownStyles = `
  .prose h1, .prose h2, .prose h3 { color: #f9fafb; }
  .prose h1 { font-size: 1.25rem; margin-top: 0.5rem; }
  .prose h2 { font-size: 1.1rem; margin-top: 1rem; border-bottom: 1px solid #1f2937; padding-bottom: 0.25rem; }
  .prose h3 { font-size: 0.95rem; }
  .prose strong { color: #f9fafb; }
  .prose a { color: #3b82f6; }
  .prose code { background: #1f2937; color: #f9fafb; padding: 2px 6px; border-radius: 4px; }
  .prose pre { background: #0d1117; border: 1px solid #374151; }
  .prose blockquote { border-left-color: #3b82f6; color: #9ca3af; background: rgba(59,130,246,0.05); padding: 0.5rem 1rem; border-radius: 0 0.25rem 0.25rem 0; }
  .prose hr { border-color: #1f2937; }
  .prose ul li::marker { color: #3b82f6; }
  .prose ol li::marker { color: #3b82f6; }
  .prose table { width: 100%; border-collapse: collapse; font-size: 0.8rem; }
  .prose th { text-align: left; padding: 0.4rem 0.6rem; border-bottom: 1px solid #374151; color: #9ca3af; font-weight: 600; }
  .prose td { padding: 0.4rem 0.6rem; border-bottom: 1px solid #1f2937; color: #d1d5db; }
  .prose tr:hover td { background: rgba(59,130,246,0.03); }
`


function DossierViewer({
  item,
  dossier,
  onClose,
  onRegenerated,
}: {
  item: DossierListItem
  dossier: DossierResponse
  onClose: () => void
  onRegenerated: () => void
}) {
  const [regenerating, setRegenerating] = useState(false)
  const [error, setError] = useState('')

  const regenerate = async () => {
    setRegenerating(true)
    setError('')
    try {
      await api.generateDossier({
        company_name: item.company_name,
        company_number: item.company_number || undefined,
        company_type: item.company_type || undefined,
        region: item.region || undefined,
      })
      onRegenerated()
    } catch (e: any) {
      setError(e.message || 'Regeneration failed')
    } finally {
      setRegenerating(false)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs px-2 py-0.5 rounded" style={{ background: 'rgba(59,130,246,0.15)', color: '#3b82f6', border: '1px solid rgba(59,130,246,0.3)' }}>
              Sales Dossier
            </span>
            {item.company_type && (
              <span className="text-xs px-2 py-0.5 rounded" style={{ background: '#1f2937', color: '#6b7280' }}>
                {item.company_type}
              </span>
            )}
          </div>
          <h2 className="text-lg font-bold" style={{ color: '#f9fafb' }}>{item.company_name}</h2>
          <p className="text-xs mt-0.5" style={{ color: '#6b7280' }}>
            Updated {formatDate(item.updated_at)}
            {item.source_count > 0 && ` · ${item.source_count} sources`}
            {item.company_number && ` · CH#${item.company_number}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={regenerate}
            disabled={regenerating}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
            style={{ background: 'rgba(59,130,246,0.1)', color: '#3b82f6', border: '1px solid rgba(59,130,246,0.2)', opacity: regenerating ? 0.6 : 1 }}
          >
            {regenerating ? <><Loader2 size={12} className="animate-spin" />Regenerating...</> : <><Sparkles size={12} />Regenerate</>}
          </button>
          <Button size="sm" variant="ghost" onClick={onClose}>
            <X size={14} />
          </Button>
        </div>
      </div>
      {error && <p className="text-xs mb-3" style={{ color: '#ef4444' }}>{error}</p>}
      {dossier.sources_used && dossier.sources_used.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-4">
          {dossier.sources_used.map((s, i) => (
            <span key={i} className="text-xs px-2 py-0.5 rounded" style={{ background: '#1f2937', color: '#9ca3af' }}>
              {s}
            </span>
          ))}
        </div>
      )}
      <div className="rounded-xl border p-6" style={{ background: '#111827', borderColor: '#1f2937' }}>
        <div className="prose prose-sm max-w-none" style={{ color: '#d1d5db' }}>
          <style>{markdownStyles}</style>
          <ReactMarkdown>{dossier.dossier_markdown}</ReactMarkdown>
        </div>
      </div>
    </div>
  )
}


function GenerateDossierForm({
  onClose,
  onGenerated,
}: {
  onClose: () => void
  onGenerated: () => void
}) {
  const [companyName, setCompanyName] = useState('')
  const [companyNumber, setCompanyNumber] = useState('')
  const [companyType, setCompanyType] = useState('')
  const [region, setRegion] = useState('')
  const [sicCodes, setSicCodes] = useState('')
  const [address, setAddress] = useState('')
  const [websiteUrl, setWebsiteUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<{ dossier_markdown: string; sources_used: string[] } | null>(null)

  const generate = async () => {
    if (!companyName.trim()) {
      setError('Company name is required')
      return
    }
    setLoading(true)
    setError('')
    try {
      const res = await api.generateDossier({
        company_name: companyName.trim(),
        company_number: companyNumber.trim() || undefined,
        company_type: companyType.trim() || undefined,
        region: region.trim() || undefined,
        sic_codes: sicCodes.trim() || undefined,
        address: address.trim() || undefined,
        website_url: websiteUrl.trim() || undefined,
      })
      setResult(res)
      onGenerated()
    } catch (e: any) {
      setError(e.message || 'Failed to generate dossier')
    } finally {
      setLoading(false)
    }
  }

  if (result) {
    return (
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <span className="text-xs px-2 py-0.5 rounded" style={{ background: 'rgba(59,130,246,0.15)', color: '#3b82f6', border: '1px solid rgba(59,130,246,0.3)' }}>
              Sales Dossier
            </span>
            <h2 className="text-lg font-bold mt-1" style={{ color: '#f9fafb' }}>{companyName}</h2>
            <p className="text-xs mt-0.5" style={{ color: '#6b7280' }}>
              Just generated · {result.sources_used.length} sources consulted
            </p>
          </div>
          <Button size="sm" variant="ghost" onClick={onClose}>
            <X size={14} />
          </Button>
        </div>
        {result.sources_used.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-4">
            {result.sources_used.map((s, i) => (
              <span key={i} className="text-xs px-2 py-0.5 rounded" style={{ background: '#1f2937', color: '#9ca3af' }}>
                {s}
              </span>
            ))}
          </div>
        )}
        <div className="rounded-xl border p-6" style={{ background: '#111827', borderColor: '#1f2937' }}>
          <div className="prose prose-sm max-w-none" style={{ color: '#d1d5db' }}>
            <style>{markdownStyles}</style>
            <ReactMarkdown>{result.dossier_markdown}</ReactMarkdown>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-bold" style={{ color: '#f9fafb' }}>Generate Sales Intelligence Dossier</h2>
          <p className="text-xs mt-1" style={{ color: '#6b7280' }}>
            Enter a company name to generate a comprehensive sales-ready dossier.
            The system will search internal data, live news, Companies House, and the company website.
          </p>
        </div>
        <Button size="sm" variant="ghost" onClick={onClose}>
          <X size={14} />
        </Button>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-xs font-medium mb-1" style={{ color: '#9ca3af' }}>
            Company Name <span style={{ color: '#ef4444' }}>*</span>
          </label>
          <input
            type="text"
            value={companyName}
            onChange={e => setCompanyName(e.target.value)}
            placeholder="e.g., Westfield Shopping Centres"
            className="w-full text-sm rounded-lg px-3 py-2.5 border"
            style={{ background: '#111827', color: '#f9fafb', borderColor: '#374151' }}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: '#9ca3af' }}>
              Companies House Number
            </label>
            <input
              type="text"
              value={companyNumber}
              onChange={e => setCompanyNumber(e.target.value)}
              placeholder="e.g., 12345678"
              className="w-full text-sm rounded-lg px-3 py-2 border"
              style={{ background: '#111827', color: '#f9fafb', borderColor: '#374151' }}
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: '#9ca3af' }}>
              Company Type
            </label>
            <input
              type="text"
              value={companyType}
              onChange={e => setCompanyType(e.target.value)}
              placeholder="e.g., Hotel, Retail"
              className="w-full text-sm rounded-lg px-3 py-2 border"
              style={{ background: '#111827', color: '#f9fafb', borderColor: '#374151' }}
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: '#9ca3af' }}>
              Region
            </label>
            <input
              type="text"
              value={region}
              onChange={e => setRegion(e.target.value)}
              placeholder="e.g., London"
              className="w-full text-sm rounded-lg px-3 py-2 border"
              style={{ background: '#111827', color: '#f9fafb', borderColor: '#374151' }}
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: '#9ca3af' }}>
              SIC Codes
            </label>
            <input
              type="text"
              value={sicCodes}
              onChange={e => setSicCodes(e.target.value)}
              placeholder="e.g., 80100, 68209"
              className="w-full text-sm rounded-lg px-3 py-2 border"
              style={{ background: '#111827', color: '#f9fafb', borderColor: '#374151' }}
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium mb-1" style={{ color: '#9ca3af' }}>
            Website URL
          </label>
          <input
            type="text"
            value={websiteUrl}
            onChange={e => setWebsiteUrl(e.target.value)}
            placeholder="e.g., https://www.example.com"
            className="w-full text-sm rounded-lg px-3 py-2 border"
            style={{ background: '#111827', color: '#f9fafb', borderColor: '#374151' }}
          />
        </div>

        <div>
          <label className="block text-xs font-medium mb-1" style={{ color: '#9ca3af' }}>
            Address
          </label>
          <input
            type="text"
            value={address}
            onChange={e => setAddress(e.target.value)}
            placeholder="e.g., 1 Ariel Way, London W12 7GF"
            className="w-full text-sm rounded-lg px-3 py-2 border"
            style={{ background: '#111827', color: '#f9fafb', borderColor: '#374151' }}
          />
        </div>

        {error && (
          <div className="rounded-lg p-3 text-xs" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)' }}>
            {error}
          </div>
        )}

        <div className="rounded-lg p-3" style={{ background: '#111827', border: '1px solid #1f2937' }}>
          <p className="text-xs" style={{ color: '#6b7280' }}>
            <strong style={{ color: '#9ca3af' }}>What the dossier includes:</strong>
          </p>
          <ul className="text-xs mt-1 space-y-0.5" style={{ color: '#6b7280' }}>
            <li>Company profile with directors and filing status</li>
            <li>Live news articles from Google News</li>
            <li>Security needs assessment based on sector</li>
            <li>Call strategy with opening hook and talking points</li>
            <li>Risk factors and red flags</li>
          </ul>
        </div>

        <button
          onClick={generate}
          disabled={loading || !companyName.trim()}
          className="flex items-center gap-2 justify-center py-3 rounded-lg text-sm font-medium w-full transition-all"
          style={{
            background: loading ? 'rgba(59,130,246,0.1)' : '#3b82f6',
            color: loading ? '#3b82f6' : '#fff',
            opacity: (!companyName.trim() && !loading) ? 0.5 : 1,
          }}
        >
          {loading ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              Generating dossier — this takes 15-30 seconds...
            </>
          ) : (
            <>
              <Sparkles size={16} />
              Generate Sales Intelligence Dossier
            </>
          )}
        </button>
      </div>
    </div>
  )
}
