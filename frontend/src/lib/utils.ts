import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return 'N/A'
  try {
    return new Date(dateStr).toLocaleDateString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric'
    })
  } catch {
    return dateStr
  }
}

export function formatRelativeTime(dateStr: string | null | undefined): string {
  if (!dateStr) return 'N/A'
  try {
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    if (diffMins < 1) return 'just now'
    if (diffMins < 60) return `${diffMins}m ago`
    const diffHours = Math.floor(diffMins / 60)
    if (diffHours < 24) return `${diffHours}h ago`
    const diffDays = Math.floor(diffHours / 24)
    if (diffDays < 7) return `${diffDays}d ago`
    return formatDate(dateStr)
  } catch {
    return dateStr || 'N/A'
  }
}

export function formatCurrency(value: string | number | null | undefined): string {
  if (!value) return 'N/A'
  const num = typeof value === 'string' ? parseFloat(value.replace(/[^0-9.]/g, '')) : value
  if (isNaN(num)) return String(value)
  if (num >= 1_000_000) return `£${(num / 1_000_000).toFixed(1)}M`
  if (num >= 1_000) return `£${(num / 1_000).toFixed(0)}K`
  return `£${num.toFixed(0)}`
}

export function getScoreColor(score: number): string {
  if (score >= 80) return '#ef4444'
  if (score >= 60) return '#f59e0b'
  if (score >= 40) return '#22c55e'
  return '#6b7280'
}

export function getScoreBg(score: number): string {
  if (score >= 80) return 'bg-red-500/20 text-red-400 border-red-500/30'
  if (score >= 60) return 'bg-amber-500/20 text-amber-400 border-amber-500/30'
  if (score >= 40) return 'bg-green-500/20 text-green-400 border-green-500/30'
  return 'bg-gray-500/20 text-gray-400 border-gray-500/30'
}

export function getPriorityColor(priority: string): string {
  switch (priority?.toLowerCase()) {
    case 'hot': return 'text-red-400'
    case 'warm': return 'text-amber-400'
    case 'low': return 'text-green-400'
    default: return 'text-gray-400'
  }
}

export function getPriorityBg(priority: string): string {
  switch (priority?.toLowerCase()) {
    case 'hot': return 'bg-red-500/20 text-red-400 border-red-500/30'
    case 'warm': return 'bg-amber-500/20 text-amber-400 border-amber-500/30'
    case 'low': return 'bg-green-500/20 text-green-400 border-green-500/30'
    default: return 'bg-gray-500/20 text-gray-400 border-gray-500/30'
  }
}

export function getStatusColor(status: string): string {
  const s = status?.toLowerCase() || ''
  if (s.includes('won') || s.includes('pilot')) return 'bg-green-500/20 text-green-400 border-green-500/30'
  if (s.includes('warm') || s.includes('meeting')) return 'bg-blue-500/20 text-blue-400 border-blue-500/30'
  if (s.includes('email')) return 'bg-amber-500/20 text-amber-400 border-amber-500/30'
  if (s.includes('not contacted')) return 'bg-gray-500/20 text-gray-400 border-gray-500/30'
  return 'bg-gray-500/20 text-gray-400 border-gray-500/30'
}

export function parseScore(score: string | number | undefined): number {
  if (score === undefined || score === null) return 0
  const n = typeof score === 'string' ? parseFloat(score) : score
  return isNaN(n) ? 0 : Math.round(n)
}
