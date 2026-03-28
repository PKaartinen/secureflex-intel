import { useState, useEffect, useCallback } from 'react'
import { useDossier } from '../lib/dossier-context'
import { api, type DossierResponse } from '../lib/api'
import { X, BookOpen, Loader2, RefreshCw, Copy, CheckCircle2 } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

const DOSSIER_STYLES = `
  .dossier-prose h1 { font-size: 0.9rem; color: #f9fafb; margin-top: 0.5rem; }
  .dossier-prose h2 { font-size: 0.8rem; color: #f9fafb; margin-top: 0.75rem; border-bottom: 1px solid #1f2937; padding-bottom: 0.25rem; }
  .dossier-prose h3 { font-size: 0.75rem; color: #d1d5db; }
  .dossier-prose p { margin: 0.35em 0; }
  .dossier-prose strong { color: #f9fafb; }
  .dossier-prose a { color: #3b82f6; }
  .dossier-prose ul, .dossier-prose ol { padding-left: 1.2em; }
  .dossier-prose li { margin: 0.15em 0; }
  .dossier-prose blockquote { border-left: 2px solid #374151; padding-left: 0.75em; color: #9ca3af; }
  .dossier-prose table { width: 100%; border-collapse: collapse; font-size: 0.7rem; }
  .dossier-prose th { text-align: left; padding: 0.3rem 0.5rem; border-bottom: 1px solid #374151; color: #9ca3af; font-weight: 600; }
  .dossier-prose td { padding: 0.3rem 0.5rem; border-bottom: 1px solid #1f2937; color: #d1d5db; }
  .dossier-prose tr:hover td { background: rgba(59,130,246,0.03); }
`

const TYPE_COLORS: Record<string, string> = {
  prospect: '#22c55e',
  competitor: '#ef4444',
  tender: '#f59e0b',
  pipeline: '#3b82f6',
}

export default function DossierPanel() {
  const { target, isOpen, closeDossier } = useDossier()

  const [dossier, setDossier] = useState<DossierResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  // Fetch existing dossier when target changes
  useEffect(() => {
    if (!target) {
      setDossier(null)
      setError('')
      return
    }

    setDossier(null)
    setError('')
    setLoading(true)

    api.getDossierByCompany(target.companyKey)
      .then(result => {
        if (result?.dossier_markdown) setDossier(result)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [target?.companyKey])

  const generateDossier = useCallback(async () => {
    if (!target) return
    setGenerating(true)
    setError('')
    try {
      const result = await api.generateDossier({
        company_name: target.companyName,
        company_number: target.companyNumber || '',
        company_type: target.companyType || '',
        region: target.region || '',
      })
      setDossier(result)
    } catch (e: any) {
      setError(e.message || 'Failed to generate dossier')
    } finally {
      setGenerating(false)
    }
  }, [target])

  const copyToClipboard = useCallback(() => {
    if (!dossier?.dossier_markdown) return
    navigator.clipboard.writeText(dossier.dossier_markdown).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }, [dossier])

  // Close on Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) closeDossier()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isOpen, closeDossier])

  const typeColor = TYPE_COLORS[target?.companyType || ''] || '#6b7280'

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 transition-opacity duration-300"
        style={{
          background: 'rgba(0,0,0,0.5)',
          opacity: isOpen ? 1 : 0,
          pointerEvents: isOpen ? 'auto' : 'none',
        }}
        onClick={closeDossier}
      />

      {/* Panel */}
      <div
        className="fixed top-0 right-0 bottom-0 z-50 flex flex-col border-l transition-transform duration-300"
        style={{
          width: 500,
          maxWidth: '90vw',
          background: '#0d1117',
          borderColor: '#1f2937',
          transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
        }}
      >
        {/* Header */}
        <div className="flex items-start justify-between p-4 border-b flex-shrink-0" style={{ borderColor: '#1f2937' }}>
          <div className="flex-1 min-w-0 mr-3">
            <h2 className="text-sm font-bold truncate" style={{ color: '#f9fafb' }}>
              {target?.companyName || 'Dossier'}
            </h2>
            <div className="flex items-center gap-2 mt-1">
              {target?.companyType && (
                <span
                  className="text-xs px-1.5 py-0.5 rounded"
                  style={{ background: `${typeColor}20`, color: typeColor, border: `1px solid ${typeColor}40` }}
                >
                  {target.companyType}
                </span>
              )}
              {target?.region && (
                <span className="text-xs" style={{ color: '#6b7280' }}>{target.region}</span>
              )}
            </div>
          </div>
          <button
            onClick={closeDossier}
            className="flex items-center justify-center rounded-lg p-1.5 transition-colors hover:bg-white/10"
            style={{ color: '#6b7280' }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Loader2 size={20} className="animate-spin" style={{ color: '#3b82f6' }} />
              <span className="text-xs" style={{ color: '#6b7280' }}>Checking for saved dossier...</span>
            </div>
          ) : dossier?.dossier_markdown ? (
            <div className="space-y-3">
              {/* Source badges */}
              {dossier.sources_used && dossier.sources_used.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {dossier.sources_used.map((s, i) => (
                    <span
                      key={i}
                      className="text-xs px-1.5 py-0.5 rounded"
                      style={{ background: '#1f2937', color: '#9ca3af', fontSize: '0.65rem' }}
                    >
                      {s}
                    </span>
                  ))}
                </div>
              )}

              {/* Timestamp */}
              {(dossier.updated_at || dossier.generated_at) && (
                <p className="text-xs" style={{ color: '#4b5563' }}>
                  Updated {new Date(dossier.updated_at || dossier.generated_at).toLocaleDateString('en-GB', {
                    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
                  })}
                </p>
              )}

              {/* Markdown content */}
              <div
                className="rounded-lg p-4"
                style={{ background: '#111827', border: '1px solid #1f2937' }}
              >
                <style>{DOSSIER_STYLES}</style>
                <div
                  className="dossier-prose max-w-none"
                  style={{ color: '#d1d5db', fontSize: '0.75rem', lineHeight: '1.6' }}
                >
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{dossier.dossier_markdown}</ReactMarkdown>
                </div>
              </div>

              {/* Regenerate button */}
              <button
                onClick={generateDossier}
                disabled={generating}
                className="flex items-center gap-2 justify-center py-2.5 rounded-lg text-xs font-medium w-full transition-all"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  color: '#6b7280',
                  border: '1px solid #1f2937',
                  opacity: generating ? 0.6 : 1,
                }}
              >
                {generating ? (
                  <><Loader2 size={12} className="animate-spin" /> Regenerating...</>
                ) : (
                  <><RefreshCw size={12} /> Regenerate Dossier</>
                )}
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <BookOpen size={32} style={{ color: '#374151' }} />
              <div className="text-center">
                <p className="text-sm font-medium" style={{ color: '#9ca3af' }}>No dossier found</p>
                <p className="text-xs mt-1" style={{ color: '#4b5563' }}>
                  Generate a sales intelligence dossier for {target?.companyName || 'this company'}
                </p>
              </div>
              <button
                onClick={generateDossier}
                disabled={generating}
                className="flex items-center gap-2 justify-center px-6 py-3 rounded-lg text-xs font-medium transition-all"
                style={{
                  background: generating ? 'rgba(59,130,246,0.1)' : 'rgba(59,130,246,0.15)',
                  color: '#3b82f6',
                  border: '1px solid rgba(59,130,246,0.3)',
                  opacity: generating ? 0.8 : 1,
                }}
              >
                {generating ? (
                  <><Loader2 size={14} className="animate-spin" /> Generating dossier (15-30s)...</>
                ) : (
                  <><BookOpen size={14} /> Generate Dossier</>
                )}
              </button>
              {error && <p className="text-xs" style={{ color: '#ef4444' }}>{error}</p>}
              <p className="text-xs" style={{ color: '#374151' }}>
                Consolidates DB, news, Companies House &amp; website data via AI
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-2 p-4 border-t flex-shrink-0" style={{ borderColor: '#1f2937' }}>
          <button
            onClick={copyToClipboard}
            disabled={!dossier?.dossier_markdown}
            className="flex items-center gap-2 justify-center flex-1 py-2.5 rounded-lg text-xs font-medium transition-all"
            style={{
              background: copied ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.05)',
              color: copied ? '#22c55e' : '#9ca3af',
              border: `1px solid ${copied ? 'rgba(34,197,94,0.3)' : '#1f2937'}`,
              opacity: dossier?.dossier_markdown ? 1 : 0.4,
            }}
          >
            {copied ? <><CheckCircle2 size={12} /> Copied!</> : <><Copy size={12} /> Copy to Clipboard</>}
          </button>
          <button
            onClick={closeDossier}
            className="flex items-center gap-2 justify-center flex-1 py-2.5 rounded-lg text-xs font-medium transition-all"
            style={{ background: 'rgba(255,255,255,0.05)', color: '#9ca3af', border: '1px solid #1f2937' }}
          >
            <X size={12} /> Close
          </button>
        </div>
      </div>
    </>
  )
}
