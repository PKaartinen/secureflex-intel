import { Outlet, NavLink, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useAuth } from '../auth'
import {
  LayoutDashboard, Map, FileText, Kanban, Building2,
  Eye, Rss, BookOpen, BarChart3, ScanLine, Settings,
  Shield, Activity, ChevronRight, LogOut
} from 'lucide-react'
import { cn } from '../lib/utils'

const navItems = [
  { path: '/', label: 'Command Center', icon: LayoutDashboard },
  { path: '/map', label: 'Intelligence Map', icon: Map },
  { path: '/tenders', label: 'Tender Radar', icon: FileText },
  { path: '/pipeline', label: 'Pipeline Manager', icon: Kanban },
  { path: '/prospects', label: 'Prospect Explorer', icon: Building2 },
  { path: '/competitors', label: 'Competitor Watch', icon: Eye },
  { path: '/signals', label: 'Signal Feed', icon: Rss },
  { path: '/briefs', label: 'Research Briefs', icon: BookOpen },
  { path: '/analytics', label: 'Analytics', icon: BarChart3 },
  { path: '/scans', label: 'Scan Control', icon: ScanLine },
  { path: '/settings', label: 'Settings', icon: Settings },
]

export default function Layout() {
  const location = useLocation()
  const { user, logout } = useAuth()

  const { data: status } = useQuery({
    queryKey: ['status'],
    queryFn: api.status,
    refetchInterval: 60_000,
  })

  const isMapPage = location.pathname === '/map'

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: '#0a0a0f' }}>
      {/* Sidebar */}
      <aside
        className="flex flex-col flex-shrink-0 border-r"
        style={{ width: 240, background: '#0d1117', borderColor: '#1f2937' }}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 px-4 py-4 border-b" style={{ borderColor: '#1f2937' }}>
          <div
            className="flex items-center justify-center rounded-lg"
            style={{ width: 36, height: 36, background: 'rgba(59,130,246,0.2)', border: '1px solid rgba(59,130,246,0.4)' }}
          >
            <Shield size={18} style={{ color: '#3b82f6' }} />
          </div>
          <div>
            <div className="font-bold text-sm leading-tight" style={{ color: '#f9fafb', letterSpacing: '0.05em' }}>
              SECUREFLEX
            </div>
            <div className="text-xs" style={{ color: '#6b7280' }}>Intel Command Center</div>
          </div>
        </div>

        {/* Status indicator */}
        <div className="px-4 py-2 border-b" style={{ borderColor: '#1f2937' }}>
          <div className="flex items-center gap-2">
            <div
              className="rounded-full pulse-dot"
              style={{ width: 6, height: 6, background: status?.status === 'ok' ? '#22c55e' : '#ef4444' }}
            />
            <span className="text-xs" style={{ color: '#6b7280' }}>
              {status?.status === 'ok' ? 'System Online' : 'Connecting...'}
            </span>
            {status && (
              <span className="ml-auto text-xs font-mono" style={{ color: '#374151' }}>
                {status.pipeline?.lead_count || 0} leads
              </span>
            )}
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-2">
          {navItems.map(({ path, label, icon: Icon }) => (
            <NavLink
              key={path}
              to={path}
              end={path === '/'}
              className={({ isActive }) => cn(
                'flex items-center gap-3 px-4 py-2.5 mx-2 rounded-lg text-sm transition-all group',
                isActive ? 'text-white' : 'hover:text-gray-200'
              )}
              style={({ isActive }) => ({
                background: isActive ? 'rgba(59,130,246,0.15)' : 'transparent',
                color: isActive ? '#f9fafb' : '#9ca3af',
                border: isActive ? '1px solid rgba(59,130,246,0.25)' : '1px solid transparent',
              })}
            >
              {({ isActive }) => (
                <>
                  <Icon size={15} style={{ color: isActive ? '#3b82f6' : '#6b7280', flexShrink: 0 }} />
                  <span className="flex-1 truncate">{label}</span>
                  {isActive && <ChevronRight size={12} style={{ color: '#3b82f6' }} />}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Data counts */}
        <div className="px-4 py-2 border-t" style={{ borderColor: '#1f2937' }}>
          <div className="flex items-center gap-2">
            <Activity size={12} style={{ color: '#374151' }} />
            <span className="text-xs" style={{ color: '#374151' }}>
              {status ? `${status.data_counts.tenders} tenders · ${status.data_counts.signals} signals · ${status.data_counts.prospects} prospects` : 'Loading...'}
            </span>
          </div>
        </div>

        {/* User / logout */}
        {user && (
          <div className="px-4 py-3 border-t flex items-center gap-3" style={{ borderColor: '#1f2937' }}>
            <div
              className="flex items-center justify-center rounded-full text-xs font-bold flex-shrink-0"
              style={{ width: 30, height: 30, background: 'rgba(59,130,246,0.2)', color: '#3b82f6', border: '1px solid rgba(59,130,246,0.3)' }}
            >
              {user.initials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium truncate" style={{ color: '#f9fafb' }}>{user.displayName}</p>
              <p className="text-xs truncate" style={{ color: '#4b5563' }}>Internal</p>
            </div>
            <button
              onClick={logout}
              title="Sign out"
              className="flex items-center justify-center rounded-lg p-1.5 transition-colors hover:bg-red-900/20"
              style={{ color: '#6b7280' }}
            >
              <LogOut size={14} />
            </button>
          </div>
        )}
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col overflow-hidden" style={{ background: '#0a0a0f' }}>
        <Outlet />
      </main>
    </div>
  )
}
