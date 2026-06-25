import { useState } from 'react'
import { Mail, Lock } from 'lucide-react'

export default function LoginPage({ onLogin }) {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res  = await fetch('/auth/login', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email, password }),
      })
      const data = await res.json()
      if (res.ok) {
        onLogin(data.user)
      } else {
        setError(data.error || 'Login failed.')
        setPassword('')
      }
    } catch {
      setError('Could not connect to server.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#080f1e] flex items-center justify-center">
      <div className="w-full max-w-sm bg-white dark:bg-[#0d1526] border border-slate-200 dark:border-slate-700/50 rounded-2xl p-8 shadow-xl">

        <div className="flex flex-col items-center gap-2 mb-8">
          <div className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
            365 Email Monitor
          </div>
          <p className="text-sm text-slate-400 dark:text-slate-500">Sign in to continue</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4" autoComplete="off">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
              Email
            </label>
            <div className="relative">
              <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                type="email"
                placeholder="you@company.com"
                autoFocus
                autoComplete="off"
                data-1p-ignore
                data-lpignore="true"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-sm outline-none focus:ring-2 focus:ring-cyan-500/50 text-slate-900 dark:text-white"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
              Password
            </label>
            <div className="relative">
              <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                type="password"
                placeholder="••••••••"
                autoComplete="off"
                data-1p-ignore
                data-lpignore="true"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-sm outline-none focus:ring-2 focus:ring-cyan-500/50 text-slate-900 dark:text-white"
              />
            </div>
          </div>

          {error && (
            <p className="text-xs text-red-500 text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || !email || !password}
            className="w-full py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-600 disabled:opacity-50 text-white text-sm font-medium transition-colors"
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  )
}
