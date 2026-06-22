import { useState, useEffect } from 'react'
import { Lock, AlertTriangle } from 'lucide-react'

export default function SettingsAuthModal({ onUnlock }) {
  const [password, setPassword]       = useState('')
  const [error, setError]             = useState('')
  const [checking, setChecking]       = useState(false)
  const [configured, setConfigured]   = useState(null) // null = loading

  useEffect(() => {
    fetch('/api/auth/settings-password-status')
      .then(r => r.json())
      .then(d => setConfigured(d.configured))
      .catch(() => setConfigured(false))
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!password) return
    setChecking(true)
    setError('')
    try {
      const res  = await fetch('/api/auth/verify-settings-password', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ password }),
      })
      const { ok } = await res.json()
      if (ok) {
        onUnlock()
      } else {
        setError('Incorrect password.')
        setPassword('')
      }
    } catch {
      setError('Could not verify password. Is the server running?')
    } finally {
      setChecking(false)
    }
  }

  if (configured === null) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-[#080f1e] flex items-center justify-center">
        <p className="text-sm text-slate-400 dark:text-slate-500">Checking…</p>
      </div>
    )
  }

  if (!configured) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-[#080f1e] flex items-center justify-center">
        <div className="w-full max-w-sm bg-white dark:bg-[#0d1526] border border-red-400 dark:border-red-600 rounded-2xl p-8 shadow-xl">
          <div className="flex flex-col items-center gap-3 mb-5">
            <div className="p-3 rounded-xl bg-red-500/10 text-red-500">
              <AlertTriangle size={22} />
            </div>
            <h1 className="text-lg font-semibold text-slate-900 dark:text-white">Reinstallation Required</h1>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 text-center leading-relaxed">
            The application configuration could not be verified. Please run the installer again to restore access.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#080f1e] flex items-center justify-center">
      <div className="w-full max-w-sm bg-white dark:bg-[#0d1526] border border-slate-200 dark:border-slate-700/50 rounded-2xl p-8 shadow-xl">

        <div className="flex flex-col items-center gap-3 mb-6">
          <div className="p-3 rounded-xl bg-cyan-500/10 text-cyan-500">
            <Lock size={22} />
          </div>
          <h1 className="text-lg font-semibold text-slate-900 dark:text-white">Settings</h1>
          <p className="text-sm text-slate-400 dark:text-slate-500 text-center">
            Enter the admin password to access settings.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="password"
            placeholder="Admin password"
            autoFocus
            value={password}
            onChange={e => setPassword(e.target.value)}
            className="w-full bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-cyan-500/50 text-slate-900 dark:text-white"
          />

          {error && (
            <p className="text-xs text-red-500 text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={checking || !password}
            className="w-full py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-600 disabled:opacity-50 text-white text-sm font-medium transition-colors"
          >
            {checking ? 'Verifying…' : 'Unlock'}
          </button>
        </form>
      </div>
    </div>
  )
}
