import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Eye, EyeSlash, LockKey, User, Buildings, WarningCircle } from '@phosphor-icons/react'
import { VantraLogo } from '@/components/layout/VantraLogo'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import { useAuth } from '@/lib/auth'
import { ApiError } from '@/lib/api'

type Role = 'holder' | 'agent'

export default function Login() {
  const [role, setRole] = useState<Role>('holder')
  const [signupMode, setSignupMode] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [employeeId, setEmployeeId] = useState('')
  const [department, setDepartment] = useState('Compliance')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const { login, signup } = useAuth()
  const navigate = useNavigate()
  const dark = role === 'agent'

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    if (signupMode && password !== confirmPassword) {
      setError("Passwords don't match")
      return
    }

    setLoading(true)
    try {
      if (signupMode) {
        await signup(fullName, email, password)
        navigate('/app')
      } else if (role === 'holder') {
        await login(email, password, 'account_holder')
        navigate('/app')
      } else {
        await login(email, password, 'agent', { employee_id: employeeId, department })
        navigate('/agent')
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Brand panel */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-[#0a0a0a] p-12 text-white lg:flex">
        <div className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(60% 50% at 30% 20%, rgba(232,178,61,0.18), transparent 70%)' }} />
        <Link to="/" className="relative">
          <VantraLogo />
        </Link>
        <div className="relative">
          <h2 className="text-balance font-display text-3xl font-bold leading-tight">Your money, watched over by an assistant that never sleeps.</h2>
          <p className="mt-4 max-w-sm text-sm text-white/60">Real-time fraud protection, instant answers, and a KYC process that takes minutes, not days.</p>
        </div>
        <p className="relative text-xs text-white/40">© 2026 Vantra Bank</p>
      </div>

      {/* Form panel */}
      <motion.div
        animate={{ backgroundColor: dark ? '#14171c' : '#fafaf9' }}
        transition={{ duration: 0.35 }}
        className={cn('flex flex-col justify-center px-6 py-16 sm:px-16', dark ? 'agent-mode text-ink' : 'text-ink')}
      >
        <div className="mx-auto w-full max-w-sm">
          <div className="mb-8 flex justify-center lg:hidden">
            <VantraLogo className="text-ink" />
          </div>

          {!signupMode ? (
            <div className="mb-8 flex rounded-full border border-border-hair bg-surface p-1">
              <button
                type="button"
                onClick={() => setRole('holder')}
                className={cn('flex flex-1 items-center justify-center gap-1.5 rounded-full py-2.5 text-sm font-medium transition-colors', role === 'holder' ? 'bg-accent text-accent-ink' : 'text-ink-muted')}
              >
                <User size={15} /> Account Holder
              </button>
              <button
                type="button"
                onClick={() => setRole('agent')}
                className={cn('flex flex-1 items-center justify-center gap-1.5 rounded-full py-2.5 text-sm font-medium transition-colors', role === 'agent' ? 'bg-accent text-accent-ink' : 'text-ink-muted')}
              >
                <Buildings size={15} /> Bank Agent
              </button>
            </div>
          ) : null}

          <h1 className="font-display text-2xl font-bold text-ink">{signupMode ? 'Create your account' : 'Welcome back'}</h1>
          <p className="mt-1 text-sm text-ink-muted">
            {signupMode ? 'Open a Vantra account in under a minute.' : role === 'holder' ? 'Log in to manage your accounts.' : 'Employee sign-in for the Vantra Ops console.'}
          </p>

          <form onSubmit={submit} className="mt-7 space-y-4">
            {signupMode ? (
              <div>
                <label htmlFor="fullName" className="mb-1.5 block text-xs font-semibold text-ink-muted">
                  Full name
                </label>
                <input
                  id="fullName"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full rounded-xl border border-border-hair bg-surface px-4 py-3 text-sm text-ink outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  placeholder="Jordan Lee"
                />
              </div>
            ) : null}

            <div>
              <label htmlFor="email" className="mb-1.5 block text-xs font-semibold text-ink-muted">
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl border border-border-hair bg-surface px-4 py-3 text-sm text-ink outline-none focus-visible:ring-2 focus-visible:ring-accent"
                placeholder="you@example.com"
              />
            </div>

            {role === 'agent' && !signupMode ? (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="empId" className="mb-1.5 block text-xs font-semibold text-ink-muted">
                    Employee ID
                  </label>
                  <input
                    id="empId"
                    value={employeeId}
                    onChange={(e) => setEmployeeId(e.target.value)}
                    className="w-full rounded-xl border border-border-hair bg-surface px-4 py-3 text-sm text-ink outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    placeholder="EMP-0000"
                  />
                </div>
                <div>
                  <label htmlFor="branch" className="mb-1.5 block text-xs font-semibold text-ink-muted">
                    Branch / Dept.
                  </label>
                  <select
                    id="branch"
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    className="w-full rounded-xl border border-border-hair bg-surface px-3 py-3 text-sm text-ink outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    <option>Compliance</option>
                    <option>Fraud Ops</option>
                    <option>Credit Risk</option>
                    <option>Support</option>
                  </select>
                </div>
              </div>
            ) : null}

            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label htmlFor="password" className="block text-xs font-semibold text-ink-muted">
                  Password
                </label>
                {!signupMode ? (
                  <button type="button" className="text-xs font-medium text-accent hover:underline">
                    Forgot password?
                  </button>
                ) : null}
              </div>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={signupMode ? 8 : undefined}
                  autoComplete={signupMode ? 'new-password' : 'current-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-xl border border-border-hair bg-surface px-4 py-3 pr-11 text-sm text-ink outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink"
                >
                  {showPassword ? <EyeSlash size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </div>

            {signupMode ? (
              <div>
                <label htmlFor="confirmPassword" className="mb-1.5 block text-xs font-semibold text-ink-muted">
                  Confirm password
                </label>
                <input
                  id="confirmPassword"
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full rounded-xl border border-border-hair bg-surface px-4 py-3 text-sm text-ink outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  placeholder="••••••••"
                />
              </div>
            ) : null}

            {!signupMode && role === 'holder' ? (
              <label className="flex items-center gap-2 text-xs text-ink-muted">
                <input type="checkbox" className="h-4 w-4 rounded border-border-hair accent-[#e8b23d]" />
                Remember this device
              </label>
            ) : null}

            {error ? (
              <div className="flex items-start gap-2 rounded-xl bg-negative/10 px-3.5 py-2.5 text-sm text-negative">
                <WarningCircle size={16} weight="fill" className="mt-0.5 shrink-0" />
                {error}
              </div>
            ) : null}

            <Button type="submit" className="w-full" size="lg" disabled={loading}>
              {loading ? 'Please wait…' : signupMode ? 'Create Account' : 'Log In'}
            </Button>
          </form>

          {role === 'holder' ? (
            <p className="mt-6 text-center text-sm text-ink-muted">
              {signupMode ? (
                <>
                  Already have an account?{' '}
                  <button onClick={() => { setSignupMode(false); setError(null) }} className="font-semibold text-accent hover:underline">
                    Log in
                  </button>
                </>
              ) : (
                <>
                  New here?{' '}
                  <button onClick={() => { setSignupMode(true); setError(null) }} className="font-semibold text-accent hover:underline">
                    Create an account
                  </button>
                </>
              )}
            </p>
          ) : null}

          <p className="mt-8 flex items-center justify-center gap-1.5 text-xs text-ink-muted">
            <LockKey size={13} /> 256-bit encrypted · Vantra never asks for your password by phone or email
          </p>
        </div>
      </motion.div>
    </div>
  )
}
