import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { api, ApiError } from './api'

interface AuthUser {
  fullName: string
  email: string
  role: 'account_holder' | 'agent'
}

interface AuthContextValue {
  user: AuthUser | null
  loading: boolean
  login: (email: string, password: string, role: 'account_holder' | 'agent', extra?: { employee_id?: string; department?: string }) => Promise<void>
  signup: (fullName: string, email: string, password: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = api.token.get()
    if (!token) {
      setLoading(false)
      return
    }
    api
      .get<{ email: string; full_name: string; role: 'account_holder' | 'agent' }>('/api/auth/me')
      .then((me) => setUser({ fullName: me.full_name, email: me.email, role: me.role }))
      .catch(() => api.token.clear())
      .finally(() => setLoading(false))
  }, [])

  async function login(email: string, password: string, role: 'account_holder' | 'agent', extra?: { employee_id?: string; department?: string }) {
    const res = await api.post<{ access_token: string; role: 'account_holder' | 'agent'; full_name: string; email: string }>('/api/auth/login', {
      email,
      password,
      role,
      ...extra,
    })
    api.token.set(res.access_token)
    setUser({ fullName: res.full_name, email: res.email, role: res.role })
  }

  async function signup(fullName: string, email: string, password: string) {
    const res = await api.post<{ access_token: string; role: 'account_holder' | 'agent'; full_name: string; email: string }>('/api/auth/signup', {
      full_name: fullName,
      email,
      password,
    })
    api.token.set(res.access_token)
    setUser({ fullName: res.full_name, email: res.email, role: res.role })
  }

  function logout() {
    api.token.clear()
    setUser(null)
  }

  return <AuthContext.Provider value={{ user, loading, login, signup, logout }}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}

export function RequireRole({ role, children }: { role: 'account_holder' | 'agent'; children: ReactNode }) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-paper text-sm text-ink-muted">
        Loading Vantra…
      </div>
    )
  }
  if (!user) return <Navigate to="/login" replace />
  if (user.role !== role) return <Navigate to={user.role === 'agent' ? '/agent' : '/app'} replace />
  return <>{children}</>
}

export { ApiError }
