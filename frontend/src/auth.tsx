import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'

// ── Hardcoded internal users ─────────────────────────────────────────────────
const USERS: Record<string, { password: string; displayName: string; initials: string }> = {
  pietari: {
    password: 'SecureFlex2025!',
    displayName: 'Pietari',
    initials: 'PK',
  },
  islam: {
    password: 'SecureFlex2025!',
    displayName: 'Islam',
    initials: 'IC',
  },
}

const SESSION_KEY = 'sf_session'

interface AuthUser {
  username: string
  displayName: string
  initials: string
}

interface AuthContextType {
  user: AuthUser | null
  login: (username: string, password: string) => boolean
  logout: () => void
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => {
    try {
      const stored = sessionStorage.getItem(SESSION_KEY)
      return stored ? JSON.parse(stored) : null
    } catch {
      return null
    }
  })

  useEffect(() => {
    if (user) {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(user))
    } else {
      sessionStorage.removeItem(SESSION_KEY)
    }
  }, [user])

  const login = (username: string, password: string): boolean => {
    const key = username.toLowerCase().trim()
    const record = USERS[key]
    if (record && record.password === password) {
      const authUser: AuthUser = {
        username: key,
        displayName: record.displayName,
        initials: record.initials,
      }
      setUser(authUser)
      return true
    }
    return false
  }

  const logout = () => setUser(null)

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
