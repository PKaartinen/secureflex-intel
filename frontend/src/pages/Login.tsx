import { useState, type FormEvent } from 'react'
import { useAuth } from '../auth'
import { Shield, Eye, EyeOff, Lock, User } from 'lucide-react'

export default function Login() {
  const { login } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const ok = await login(username, password)
      if (!ok) {
        setError('Invalid username or password.')
      }
    } catch {
      setError('Connection error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: '#0d1117' }}
    >
      {/* Subtle grid background */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: 'linear-gradient(rgba(59,130,246,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(59,130,246,0.03) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />

      <div className="relative w-full max-w-sm px-6">
        {/* Logo / brand */}
        <div className="flex flex-col items-center mb-8">
          <div
            className="flex items-center justify-center rounded-2xl mb-4"
            style={{ width: 56, height: 56, background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.3)' }}
          >
            <Shield size={28} style={{ color: '#3b82f6' }} />
          </div>
          <h1 className="text-xl font-bold tracking-wide" style={{ color: '#f9fafb' }}>
            SECUREFLEX INTEL
          </h1>
          <p className="text-xs mt-1 tracking-widest uppercase" style={{ color: '#4b5563' }}>
            Internal Command Center
          </p>
        </div>

        {/* Card */}
        <div
          className="rounded-2xl border p-8"
          style={{ background: '#111827', borderColor: '#1f2937' }}
        >
          <h2 className="text-sm font-semibold mb-6" style={{ color: '#9ca3af' }}>
            Sign in to continue
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Username */}
            <div>
              <label className="block text-xs mb-1.5 uppercase tracking-wider" style={{ color: '#6b7280' }}>
                Username
              </label>
              <div className="relative">
                <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: '#4b5563' }} />
                <input
                  type="text"
                  autoComplete="username"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  placeholder="Enter username"
                  required
                  className="w-full pl-9 pr-4 py-2.5 rounded-lg text-sm outline-none transition-all"
                  style={{
                    background: '#0d1117',
                    border: '1px solid #374151',
                    color: '#f9fafb',
                  }}
                  onFocus={e => (e.target.style.borderColor = '#3b82f6')}
                  onBlur={e => (e.target.style.borderColor = '#374151')}
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-xs mb-1.5 uppercase tracking-wider" style={{ color: '#6b7280' }}>
                Password
              </label>
              <div className="relative">
                <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: '#4b5563' }} />
                <input
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Enter password"
                  required
                  className="w-full pl-9 pr-10 py-2.5 rounded-lg text-sm outline-none transition-all"
                  style={{
                    background: '#0d1117',
                    border: '1px solid #374151',
                    color: '#f9fafb',
                  }}
                  onFocus={e => (e.target.style.borderColor = '#3b82f6')}
                  onBlur={e => (e.target.style.borderColor = '#374151')}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2"
                  style={{ color: '#4b5563' }}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div
                className="rounded-lg px-3 py-2 text-xs"
                style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444' }}
              >
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-lg text-sm font-semibold transition-all mt-2"
              style={{
                background: loading ? 'rgba(59,130,246,0.5)' : '#3b82f6',
                color: '#fff',
                cursor: loading ? 'not-allowed' : 'pointer',
              }}
            >
              {loading ? 'Authenticating...' : 'Sign In'}
            </button>
          </form>
        </div>

        <p className="text-center text-xs mt-6" style={{ color: '#374151' }}>
          Authorised personnel only · SecureFlex Ltd
        </p>
      </div>
    </div>
  )
}
