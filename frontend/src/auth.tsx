import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'

const TOKEN_KEY = 'sf_token'

export interface AuthUser {
  username: string
  displayName: string
  initials: string
  role: string
  email?: string
}

interface AuthContextType {
  user: AuthUser | null
  login: (username: string, password: string) => Promise<boolean>
  logout: () => void
  isAuthenticated: boolean
  loading: boolean
}

const AuthContext = createContext<AuthContextType | null>(null)

function deriveDisplayInfo(username: string): { displayName: string; initials: string } {
  const name = username.charAt(0).toUpperCase() + username.slice(1)
  const initials = name.slice(0, 2).toUpperCase()
  return { displayName: name, initials }
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY)
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  // Validate stored token on mount
  useEffect(() => {
    const token = getToken()
    if (!token) {
      setLoading(false)
      return
    }

    fetch('/api/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(res => {
        if (!res.ok) throw new Error('Invalid token')
        return res.json()
      })
      .then(data => {
        const { displayName, initials } = deriveDisplayInfo(data.username)
        setUser({
          username: data.username,
          displayName,
          initials,
          role: data.role || 'viewer',
          email: data.email || '',
        })
      })
      .catch(() => {
        clearToken()
        setUser(null)
      })
      .finally(() => setLoading(false))
  }, [])

  const login = useCallback(async (username: string, password: string): Promise<boolean> => {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })

      if (!res.ok) return false

      const data = await res.json()
      const token = data.access_token
      if (!token) return false

      localStorage.setItem(TOKEN_KEY, token)

      const serverUser = data.user || {}
      const { displayName, initials } = deriveDisplayInfo(serverUser.username || username)
      setUser({
        username: serverUser.username || username,
        displayName,
        initials,
        role: serverUser.role || 'viewer',
        email: serverUser.email || '',
      })
      return true
    } catch {
      return false
    }
  }, [])

  const logout = useCallback(() => {
    clearToken()
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider value={{ user, login, logout, isAuthenticated: !!user, loading }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
