import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api, type Brief } from '../lib/api'
import { Card, CardHeader, CardTitle, CardContent, Button, PageHeader, LoadingSpinner, EmptyState, Input } from '../components/ui'
import { formatDate, formatRelativeTime } from '../lib/utils'
import { BookOpen, FileText, ChevronRight, X, Sparkles, Loader2, Search, Plus, Download } from 'lucide-react'
import ReactMarkdown from 'react-markdown'

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`
}

export default function ResearchBriefs() {
  const [selectedBrief, setSelectedBrief] = useState<Brief | null>(null)
  const [showGenerateForm, setShowGenerateForm] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  const { data: briefs, isLoading, refetch } = useQuery({
    queryKey: ['briefs'],
    queryFn: api.briefs,
    refetchInterval: 60_000,
  })

  const { data: briefContent, isLoading: contentLoading } = useQuery({
    queryKey: ['brief-content', selectedBrief?.filename],
    queryFn: () => selectedBrief ? api.brief(selectedBrief.filename) : null,
    enabled: !!selectedBrief,
  })

  const filteredBriefs = (briefs?.briefs || []).filter(b => {
    if (!searchQuery) return true
    const q = searchQuery.toLowerCase()
    return (
      b.company_name?.toLowerCase().includes(q) ||
      b.filename?.toLowerCase().includes(q)
    )
  })

  // Separate dossiers from regular briefs
  const dossiers = filteredBriefs.filter(b => b.filename.startsWith('dossier_'))
  const regularBriefs = filteredBriefs.filter(b => !b.filename.startsWith('dossier_'))

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <PageHeader
        title="RESEARCH BRIEFS & DOSSIERS"
        subtitle={`${briefs?.total || 0} intelligence documents — AI-generated company analysis and sales dossiers`}
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
        {/* Brief list */}
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
                placeholder="Search briefs..."
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
            ) : !filteredBriefs.length ? (
              <EmptyState
                icon={<BookOpen size={32} />}
                title="No briefs yet"
                description={searchQuery
                  ? 'No briefs match your search'
                  : 'Generate dossiers from Prospect Explorer, Tender Radar, or Pipeline Manager — or use the button above'
                }
              />
            ) : (
              <div>
                {/* Dossiers section */}
                {dossiers.length > 0 && (
                  <div>
                    <div className="px-4 py-2 flex items-center gap-2" style={{ background: '#111827' }}>
                      <BookOpen size={12} style={{ color: '#3b82f6' }} />
                      <span className="text-xs font-medium uppercase tracking-wider" style={{ color: '#3b82f6' }}>
                        Sales Dossiers ({dossiers.length})
                      </span>
                    </div>
                    <div className="divide-y divide-gray-800">
                      {dossiers.map(brief => (
                        <BriefListItem
                          key={brief.filename}
                          brief={brief}
                          selected={selectedBrief?.filename === brief.filename}
                          onClick={() => setSelectedBrief(brief)}
                          isDossier
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Regular briefs section */}
                {regularBriefs.length > 0 && (
                  <div>
                    <div className="px-4 py-2 flex items-center gap-2" style={{ background: '#111827' }}>
                      <FileText size={12} style={{ color: '#a855f7' }} />
                      <span className="text-xs font-medium uppercase tracking-wider" style={{ color: '#a855f7' }}>
                        Research Briefs ({regularBriefs.length})
                      </span>
                    </div>
                    <div className="divide-y divide-gray-800">
                      {regularBriefs.map(brief => (
                        <BriefListItem
                          key={brief.filename}
                          brief={brief}
                          selected={selectedBrief?.filename === brief.filename}
                          onClick={() => setSelectedBrief(brief)}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Brief content */}
        <div className="flex-1 overflow-y-auto p-6">
          {showGenerateForm ? (
            <GenerateDossierForm
              onClose={() => setShowGenerateForm(false)}
              onGenerated={() => {
                setShowGenerateForm(false)
                refetch()
              }}
            />
          ) : !selectedBrief ? (
            <div className="flex flex-col items-center justify-center h-full">
              <BookOpen size={48} style={{ color: '#1f2937' }} />
              <p className="mt-4 text-sm" style={{ color: '#374151' }}>Select a brief or dossier to view</p>
              <p className="text-xs mt-1" style={{ color: '#1f2937' }}>
                Or generate a new Sales Intelligence Dossier using the button above
              </p>
            </div>
          ) : contentLoading ? (
            <LoadingSpinner />
          ) : briefContent ? (
            <div>
              <div className="flex items-center justify-between mb-6">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    {selectedBrief.filename.startsWith('dossier_') ? (
                      <span className="text-xs px-2 py-0.5 rounded" style={{ background: 'rgba(59,130,246,0.15)', color: '#3b82f6', border: '1px solid rgba(59,130,246,0.3)' }}>
                        Sales Dossier
                      </span>
                    ) : (
                      <span className="text-xs px-2 py-0.5 rounded" style={{ background: 'rgba(168,85,247,0.15)', color: '#a855f7', border: '1px solid rgba(168,85,247,0.3)' }}>
                        Research Brief
                      </span>
                    )}
                  </div>
                  <h2 className="text-lg font-bold" style={{ color: '#f9fafb' }}>
                    {selectedBrief.company_name || selectedBrief.company_id}
                  </h2>
                  <p className="text-xs mt-0.5" style={{ color: '#6b7280' }}>
                    Generated {formatDate(selectedBrief.last_modified)} · {formatFileSize(selectedBrief.size)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="ghost" onClick={() => setSelectedBrief(null)}>
                    <X size={14} />
                  </Button>
                </div>
              </div>
              <div
                className="rounded-xl border p-6"
                style={{ background: '#111827', borderColor: '#1f2937' }}
              >
                <div
                  className="prose prose-sm max-w-none"
                  style={{ color: '#d1d5db' }}
                >
                  <style>{`
                    .prose h1, .prose h2, .prose h3 { color: #f9fafb; }
                    .prose h1 { font-size: 1.25rem; margin-top: 0.5rem; }
                    .prose h2 { font-size: 1.1rem; margin-top: 1rem; border-bottom: 1px solid #1f2937; padding-bottom: 0.25rem; }
                    .prose h3 { font-size: 0.95rem; }
                    .prose strong { color: #f9fafb; }
                    .prose a { color: #3b82f6; }
                    .prose code { background: #1f2937; color: #f9fafb; padding: 2px 6px; border-radius: 4px; }
                    .prose pre { background: #0d1117; border: 1px solid #374151; }
                    .prose blockquote { border-left-color: #374151; color: #9ca3af; }
                    .prose hr { border-color: #1f2937; }
                    .prose table { border-color: #374151; }
                    .prose th { background: #1f2937; color: #9ca3af; }
                    .prose td { border-color: #374151; }
                    .prose ul li::marker { color: #3b82f6; }
                    .prose ol li::marker { color: #3b82f6; }
                  `}</style>
                  <ReactMarkdown>{briefContent.content}</ReactMarkdown>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}


/** Brief list item component */
function BriefListItem({
  brief,
  selected,
  onClick,
  isDossier,
}: {
  brief: Brief
  selected: boolean
  onClick: () => void
  isDossier?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left px-4 py-3 hover:bg-white/5 transition-colors"
      style={{
        background: selected ? (isDossier ? 'rgba(59,130,246,0.1)' : 'rgba(168,85,247,0.1)') : 'transparent',
        borderLeft: selected
          ? `2px solid ${isDossier ? '#3b82f6' : '#a855f7'}`
          : '2px solid transparent',
      }}
    >
      <div className="flex items-start gap-3">
        {isDossier ? (
          <BookOpen size={14} className="mt-0.5 flex-shrink-0" style={{ color: '#3b82f6' }} />
        ) : (
          <FileText size={14} className="mt-0.5 flex-shrink-0" style={{ color: '#a855f7' }} />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate" style={{ color: '#f9fafb' }}>
            {brief.company_name || brief.company_id}
          </p>
          <p className="text-xs mt-0.5" style={{ color: '#6b7280' }}>
            {formatFileSize(brief.size)} · {formatRelativeTime(brief.last_modified)}
          </p>
        </div>
        <ChevronRight size={12} style={{ color: '#374151' }} />
      </div>
    </button>
  )
}


/** Generate a new dossier from scratch */
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
        <div className="flex items-center justify-between mb-6">
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
            <style>{`
              .prose h1, .prose h2, .prose h3 { color: #f9fafb; }
              .prose h1 { font-size: 1.25rem; margin-top: 0.5rem; }
              .prose h2 { font-size: 1.1rem; margin-top: 1rem; border-bottom: 1px solid #1f2937; padding-bottom: 0.25rem; }
              .prose strong { color: #f9fafb; }
              .prose a { color: #3b82f6; }
              .prose blockquote { border-left-color: #374151; color: #9ca3af; }
              .prose ul li::marker { color: #3b82f6; }
              .prose ol li::marker { color: #3b82f6; }
            `}</style>
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
            <li>Executive summary and opportunity rating</li>
            <li>Company profile from Companies House (directors, filings, accounts)</li>
            <li>Live news articles and public information from Google News</li>
            <li>Security needs assessment based on sector and signals</li>
            <li>Key contacts and decision makers</li>
            <li>Conversation strategy with talking points and discovery questions</li>
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
              Generating comprehensive dossier — this takes 15-30 seconds...
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
