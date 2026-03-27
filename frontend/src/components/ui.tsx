import { cn, getScoreBg, getPriorityBg, getStatusColor, parseScore } from '../lib/utils'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

// ── StatCard ─────────────────────────────────────────────────────────────────

interface StatCardProps {
  title: string
  value: string | number
  subtitle?: string
  trend?: 'up' | 'down' | 'flat'
  trendLabel?: string
  icon?: React.ReactNode
  color?: string
}

export function StatCard({ title, value, subtitle, trend, trendLabel, icon, color = '#3b82f6' }: StatCardProps) {
  return (
    <div
      className="rounded-xl p-4 border"
      style={{ background: '#111827', borderColor: '#1f2937' }}
    >
      <div className="flex items-start justify-between mb-3">
        <span className="text-xs font-medium uppercase tracking-wider" style={{ color: '#6b7280' }}>{title}</span>
        {icon && (
          <div
            className="flex items-center justify-center rounded-lg"
            style={{ width: 32, height: 32, background: `${color}20`, border: `1px solid ${color}30` }}
          >
            <span style={{ color }}>{icon}</span>
          </div>
        )}
      </div>
      <div className="text-3xl font-bold mb-1" style={{ color: '#f9fafb' }}>{value}</div>
      <div className="flex items-center gap-2">
        {trend && (
          <span className={cn('flex items-center gap-1 text-xs',
            trend === 'up' ? 'text-green-400' : trend === 'down' ? 'text-red-400' : 'text-gray-400'
          )}>
            {trend === 'up' ? <TrendingUp size={12} /> : trend === 'down' ? <TrendingDown size={12} /> : <Minus size={12} />}
            {trendLabel}
          </span>
        )}
        {subtitle && <span className="text-xs" style={{ color: '#6b7280' }}>{subtitle}</span>}
      </div>
    </div>
  )
}

// ── ScoreBadge ────────────────────────────────────────────────────────────────

export function ScoreBadge({ score }: { score: string | number | undefined }) {
  const n = parseScore(score)
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded text-xs font-mono font-bold border', getScoreBg(n))}>
      {n}
    </span>
  )
}

// ── PriorityBadge ─────────────────────────────────────────────────────────────

export function PriorityBadge({ priority }: { priority: string }) {
  const label = priority?.toUpperCase() || 'LOW'
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded text-xs font-bold border', getPriorityBg(priority))}>
      {label === 'HOT' ? '🔴' : label === 'WARM' ? '🟡' : '🟢'} {label}
    </span>
  )
}

// ── StatusBadge ───────────────────────────────────────────────────────────────

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border', getStatusColor(status))}>
      {status || 'Unknown'}
    </span>
  )
}

// ── Card ──────────────────────────────────────────────────────────────────────

interface CardProps {
  children: React.ReactNode
  className?: string
  style?: React.CSSProperties
}

export function Card({ children, className, style }: CardProps) {
  return (
    <div
      className={cn('rounded-xl border', className)}
      style={{ background: '#111827', borderColor: '#1f2937', ...style }}
    >
      {children}
    </div>
  )
}

export function CardHeader({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-center justify-between px-4 py-3 border-b', className)}
      style={{ borderColor: '#1f2937' }}>
      {children}
    </div>
  )
}

export function CardTitle({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <h3 className={cn('text-sm font-semibold uppercase tracking-wider', className)}
      style={{ color: '#9ca3af' }}>
      {children}
    </h3>
  )
}

export function CardContent({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('p-4', className)}>{children}</div>
}

// ── PageHeader ────────────────────────────────────────────────────────────────

interface PageHeaderProps {
  title: string
  subtitle?: string
  actions?: React.ReactNode
}

export function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
  return (
    <div
      className="flex items-center justify-between px-6 py-4 border-b flex-shrink-0"
      style={{ background: '#0d1117', borderColor: '#1f2937' }}
    >
      <div>
        <h1 className="text-lg font-bold tracking-wide" style={{ color: '#f9fafb' }}>{title}</h1>
        {subtitle && <p className="text-xs mt-0.5" style={{ color: '#6b7280' }}>{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}

// ── Button ────────────────────────────────────────────────────────────────────

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost'
  size?: 'sm' | 'md'
  loading?: boolean
}

export function Button({ variant = 'secondary', size = 'md', loading, children, className, ...props }: ButtonProps) {
  const base = 'inline-flex items-center gap-2 font-medium rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed'
  const sizes = { sm: 'px-3 py-1.5 text-xs', md: 'px-4 py-2 text-sm' }
  const variants = {
    primary: 'bg-blue-600 hover:bg-blue-500 text-white border border-blue-500',
    secondary: 'border text-gray-300 hover:text-white hover:border-gray-500',
    danger: 'bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-500/30',
    ghost: 'text-gray-400 hover:text-white hover:bg-white/5',
  }
  const variantStyles = {
    secondary: { background: 'rgba(255,255,255,0.05)', borderColor: '#374151' },
  }
  return (
    <button
      className={cn(base, sizes[size], variants[variant], className)}
      style={variant === 'secondary' ? variantStyles.secondary : undefined}
      disabled={loading || props.disabled}
      {...props}
    >
      {loading && <span className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />}
      {children}
    </button>
  )
}

// ── EmptyState ────────────────────────────────────────────────────────────────

export function EmptyState({ icon, title, description }: { icon?: React.ReactNode; title: string; description?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      {icon && <div className="mb-4 opacity-30" style={{ color: '#6b7280' }}>{icon}</div>}
      <p className="text-sm font-medium mb-1" style={{ color: '#9ca3af' }}>{title}</p>
      {description && <p className="text-xs" style={{ color: '#6b7280' }}>{description}</p>}
    </div>
  )
}

// ── LoadingSpinner ────────────────────────────────────────────────────────────

export function LoadingSpinner({ size = 24 }: { size?: number }) {
  return (
    <div className="flex items-center justify-center py-8">
      <div
        className="rounded-full border-2 border-t-transparent animate-spin"
        style={{ width: size, height: size, borderColor: '#374151', borderTopColor: '#3b82f6' }}
      />
    </div>
  )
}

// ── Table ─────────────────────────────────────────────────────────────────────

export function Table({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('overflow-x-auto', className)}>
      <table className="w-full text-sm">{children}</table>
    </div>
  )
}

export function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th className={cn('px-3 py-2 text-left text-xs font-medium uppercase tracking-wider border-b', className)}
      style={{ color: '#6b7280', borderColor: '#1f2937' }}>
      {children}
    </th>
  )
}

export function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <td className={cn('px-3 py-2.5 border-b', className)}
      style={{ color: '#d1d5db', borderColor: '#111827' }}>
      {children}
    </td>
  )
}

export function Tr({ children, onClick, className, style }: { children: React.ReactNode; onClick?: () => void; className?: string; style?: React.CSSProperties }) {
  return (
    <tr
      className={cn('transition-colors', onClick ? 'cursor-pointer hover:bg-white/5' : '', className)}
      onClick={onClick}
      style={style}
    >
      {children}
    </tr>
  )
}

// ── ProgressBar ───────────────────────────────────────────────────────────────

export function ProgressBar({ value, max, color = '#3b82f6', label, count }: {
  value: number; max: number; color?: string; label?: string; count?: number
}) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <div className="flex items-center gap-3">
      {label && <span className="text-xs w-32 truncate flex-shrink-0" style={{ color: '#9ca3af' }}>{label}</span>}
      <div className="flex-1 rounded-full overflow-hidden" style={{ height: 6, background: '#1f2937' }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
      {count !== undefined && <span className="text-xs font-mono w-6 text-right" style={{ color: '#6b7280' }}>{count}</span>}
    </div>
  )
}

// ── Input ─────────────────────────────────────────────────────────────────────

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

export function Input({ className, ...props }: InputProps) {
  return (
    <input
      className={cn('rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-blue-500/50 transition-all', className)}
      style={{ background: '#1f2937', border: '1px solid #374151', color: '#f9fafb' }}
      {...props}
    />
  )
}

// ── Select ────────────────────────────────────────────────────────────────────

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {}

export function Select({ className, children, ...props }: SelectProps) {
  return (
    <select
      className={cn('rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-blue-500/50 cursor-pointer', className)}
      style={{ background: '#1f2937', border: '1px solid #374151', color: '#f9fafb' }}
      {...props}
    >
      {children}
    </select>
  )
}

// ── Divider ───────────────────────────────────────────────────────────────────

export function Divider() {
  return <div className="border-t" style={{ borderColor: '#1f2937' }} />
}

// ── SectionTitle ──────────────────────────────────────────────────────────────

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: '#6b7280' }}>
      {children}
    </h2>
  )
}
