import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api, type Brief } from '../lib/api'
import { Card, CardHeader, CardTitle, CardContent, Button, PageHeader, LoadingSpinner, EmptyState } from '../components/ui'
import { formatDate, formatRelativeTime } from '../lib/utils'
import { BookOpen, FileText, ChevronRight, X } from 'lucide-react'
import ReactMarkdown from 'react-markdown'

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`
}

export default function ResearchBriefs() {
  const [selectedBrief, setSelectedBrief] = useState<Brief | null>(null)

  const { data: briefs, isLoading } = useQuery({
    queryKey: ['briefs'],
    queryFn: api.briefs,
    refetchInterval: 60_000,
  })

  const { data: briefContent, isLoading: contentLoading } = useQuery({
    queryKey: ['brief-content', selectedBrief?.filename],
    queryFn: () => selectedBrief ? api.brief(selectedBrief.filename) : null,
    enabled: !!selectedBrief,
  })

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <PageHeader
        title="RESEARCH BRIEFS"
        subtitle={`${briefs?.total || 0} AI-generated company intelligence briefs`}
      />

      <div className="flex flex-1 overflow-hidden">
        {/* Brief list */}
        <div
          className="flex-shrink-0 border-r overflow-y-auto"
          style={{ width: 320, background: '#0d1117', borderColor: '#1f2937' }}
        >
          {isLoading ? (
            <LoadingSpinner />
          ) : !briefs?.briefs.length ? (
            <EmptyState
              icon={<BookOpen size={32} />}
              title="No briefs yet"
              description="Generate briefs from the Pipeline Manager by clicking on a lead"
            />
          ) : (
            <div className="divide-y divide-gray-800">
              {briefs.briefs.map(brief => (
                <button
                  key={brief.filename}
                  onClick={() => setSelectedBrief(brief)}
                  className="w-full text-left px-4 py-3 hover:bg-white/5 transition-colors"
                  style={{
                    background: selectedBrief?.filename === brief.filename ? 'rgba(59,130,246,0.1)' : 'transparent',
                    borderLeft: selectedBrief?.filename === brief.filename ? '2px solid #3b82f6' : '2px solid transparent',
                  }}
                >
                  <div className="flex items-start gap-3">
                    <FileText size={16} className="mt-0.5 flex-shrink-0" style={{ color: '#3b82f6' }} />
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
              ))}
            </div>
          )}
        </div>

        {/* Brief content */}
        <div className="flex-1 overflow-y-auto p-6">
          {!selectedBrief ? (
            <div className="flex flex-col items-center justify-center h-full">
              <BookOpen size={48} style={{ color: '#1f2937' }} />
              <p className="mt-4 text-sm" style={{ color: '#374151' }}>Select a brief to view</p>
            </div>
          ) : contentLoading ? (
            <LoadingSpinner />
          ) : briefContent ? (
            <div>
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-lg font-bold" style={{ color: '#f9fafb' }}>
                    {selectedBrief.company_name || selectedBrief.company_id}
                  </h2>
                  <p className="text-xs mt-0.5" style={{ color: '#6b7280' }}>
                    Generated {formatDate(selectedBrief.last_modified)} · {formatFileSize(selectedBrief.size)}
                  </p>
                </div>
                <Button size="sm" variant="ghost" onClick={() => setSelectedBrief(null)}>
                  <X size={14} />
                </Button>
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
