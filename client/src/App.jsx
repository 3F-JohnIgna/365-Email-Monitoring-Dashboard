import { useState, useEffect, useCallback } from 'react'
import { Settings, RefreshCw, Moon, Sun, Mail, List, LogOut } from 'lucide-react'
import DLCard from './components/DLCard'
import UserLeaderboard from './components/UserLeaderboard'
import SettingsPage from './components/SettingsPage'
import SettingsAuthModal from './components/SettingsAuthModal'
import LoginPage from './components/LoginPage'
import MailboxCard from './components/MailboxCard'
import MailboxDetail from './components/MailboxDetail'

const WINDOWS = [
  { label: 'Today', value: '24h' },
  { label: '3 days', value: '3d' },
  { label: '7 days', value: '7d' },
]

const NAV = [
  { label: 'Shared Mailbox Monitoring',   value: 'mailbox', icon: Mail },
  { label: 'Distribution List Monitoring', value: 'dl',      icon: List },
]

const REFRESH_INTERVAL = 5 * 60 // seconds

// Reads the theme preference from localStorage (or the OS preference as fallback), persists changes, and toggles the `dark` class on the document root.
function useDarkMode() {
  const [dark, setDark] = useState(() => {
    const stored = localStorage.getItem('theme')
    return stored ? stored === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches
  })
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    localStorage.setItem('theme', dark ? 'dark' : 'light')
  }, [dark])
  return [dark, setDark]
}

// Root application component that manages page navigation, theme, settings visibility, DL dashboard state, mailbox list state, and mailbox detail state; handles auto-refresh timers for both pages.
export default function App() {
  const [dark, setDark] = useDarkMode()

  // ── Auth state ────────────────────────────────────────────────────────────
  const [authUser, setAuthUser]       = useState(null)
  const [authLoading, setAuthLoading] = useState(true)

  useEffect(() => {
    fetch('/auth/me')
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(user => { setAuthUser(user); setAuthLoading(false) })
      .catch(() => { setAuthUser(null); setAuthLoading(false) })
  }, [])

  async function handleLogout() {
    await fetch('/auth/logout', { method: 'POST' })
    setAuthUser(null)
    setShowSettings(false)
    setSettingsUnlocked(false)
  }

  const [page, setPage]                   = useState('dl')
  const [showSettings, setShowSettings]   = useState(false)
  const [settingsUnlocked, setSettingsUnlocked] = useState(false)

  function openSettings() { setShowSettings(true); setSettingsUnlocked(false) }
  function closeSettings() { setShowSettings(false); setSettingsUnlocked(false); fetchData() }

  // ── DL state ──────────────────────────────────────────────────────────────
  const [dlWindow, setDlWindow]         = useState('24h')
  const [data, setData]                 = useState(null)
  const [loading, setLoading]           = useState(false)
  const [error, setError]               = useState(null)
  const [dlCountdown, setDlCountdown]   = useState(REFRESH_INTERVAL)

  // Fetches the DL dashboard data for the currently selected time window and resets the auto-refresh countdown.
  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/dl-dashboard?window=${dlWindow}`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `HTTP ${res.status}`)
      }
      setData(await res.json())
      setDlCountdown(REFRESH_INTERVAL)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [dlWindow])

  useEffect(() => { fetchData() }, [fetchData])

  // Runs a 1-second tick that decrements the DL countdown and triggers a refresh when it reaches zero.
  useEffect(() => {
    const tick = setInterval(() => {
      setDlCountdown(c => {
        if (c <= 1) { fetchData(); return REFRESH_INTERVAL }
        return c - 1
      })
    }, 1000)
    return () => clearInterval(tick)
  }, [fetchData])

  // ── Mailbox state ─────────────────────────────────────────────────────────
  const [mbWindow, setMbWindow]           = useState('24h')
  const [mbData, setMbData]               = useState([])
  const [mbLoading, setMbLoading]         = useState(false)
  const [mbError, setMbError]             = useState(null)
  const [mbCountdown, setMbCountdown]     = useState(REFRESH_INTERVAL)
  const [selectedEmail, setSelectedEmail] = useState(null)
  const [mbDetail, setMbDetail]           = useState(null)
  const [mbDetailLoading, setMbDetailLoading] = useState(false)

  // Fetches summary data for all configured mailboxes for the currently selected time window and resets the auto-refresh countdown.
  const fetchMailboxes = useCallback(async () => {
    setMbLoading(true)
    setMbError(null)
    try {
      const res = await fetch(`/api/mailboxes?window=${mbWindow}`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `HTTP ${res.status}`)
      }
      setMbData(await res.json())
      setMbCountdown(REFRESH_INTERVAL)
    } catch (err) {
      setMbError(err.message)
    } finally {
      setMbLoading(false)
    }
  }, [mbWindow])

  useEffect(() => {
    if (page === 'mailbox') fetchMailboxes()
  }, [fetchMailboxes, page])

  // Runs a 1-second tick that decrements the mailbox countdown and triggers a refresh when it reaches zero, but only while on the mailbox page.
  useEffect(() => {
    const tick = setInterval(() => {
      setMbCountdown(c => {
        if (c <= 1) {
          if (page === 'mailbox') fetchMailboxes()
          return REFRESH_INTERVAL
        }
        return c - 1
      })
    }, 1000)
    return () => clearInterval(tick)
  }, [fetchMailboxes, page])

  // Fetch detail when a mailbox is selected or window changes
  useEffect(() => {
    if (!selectedEmail) { setMbDetail(null); return }
    setMbDetailLoading(true)
    setMbDetail(null)
    fetch(`/api/mailboxes/${encodeURIComponent(selectedEmail)}/detail?window=${mbWindow}`)
      .then(r => r.ok ? r.json() : r.json().then(b => Promise.reject(b.error || 'Error')))
      .then(d  => { setMbDetail(d); setMbDetailLoading(false) })
      .catch(() => setMbDetailLoading(false))
  }, [selectedEmail, mbWindow])

  const dls         = data?.distribution_lists || []
  const users       = data?.top_users || []
  const totalEmails = dls.reduce((s, d) => s + (d.total_emails || 0), 0)

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-[#080f1e] flex items-center justify-center">
        <p className="text-sm text-slate-400 dark:text-slate-500">Loading…</p>
      </div>
    )
  }

  if (!authUser) {
    return <LoginPage onLogin={user => setAuthUser(user)} />
  }

  if (showSettings && !settingsUnlocked) {
    return <SettingsAuthModal onUnlock={() => setSettingsUnlocked(true)} />
  }

  if (showSettings && settingsUnlocked) {
    return <SettingsPage onClose={closeSettings} dark={dark} setDark={setDark} />
  }

  // Merge summary (load_level, sparkline) with detail data for the detail panel
  const selectedSummary = mbData.find(m => m.email === selectedEmail) || {}
  const detailPayload   = mbDetail ? { ...selectedSummary, ...mbDetail } : null

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#080f1e] text-slate-900 dark:text-white">

      {/* ── Top nav bar ───────────────────────────────────────────────────── */}
      <nav className="bg-white dark:bg-[#0d1526] border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-4 h-12 flex items-center justify-between">

          {/* Left — page tabs */}
          <div className="flex items-center h-full">
            {NAV.map(n => {
              const Icon   = n.icon
              const active = page === n.value
              return (
                <button
                  key={n.value}
                  onClick={() => setPage(n.value)}
                  className={`h-full flex items-center gap-2 px-4 text-sm font-medium border-b-2 transition-colors ${
                    active
                      ? 'border-cyan-500 text-cyan-500'
                      : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                  }`}
                >
                  <Icon size={14} />
                  {n.label}
                </button>
              )
            })}
          </div>

          {/* Right — global controls */}
          <div className="flex items-center gap-1">
            {/* Logged-in user */}
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 mr-1">
              <div className="w-6 h-6 rounded-full bg-cyan-500/20 text-cyan-500 flex items-center justify-center text-[10px] font-bold uppercase shrink-0">
                {authUser.name?.[0] || authUser.email?.[0] || '?'}
              </div>
              <div className="flex flex-col leading-none">
                <span className="text-xs font-medium text-slate-700 dark:text-slate-200 max-w-[140px] truncate">
                  {authUser.name || authUser.email}
                </span>
                {authUser.name && (
                  <span className="text-[10px] text-slate-400 dark:text-slate-500 max-w-[140px] truncate">
                    {authUser.email}
                  </span>
                )}
              </div>
            </div>

            <button
              onClick={() => setDark(d => !d)}
              className="p-2 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              {dark ? <Sun size={15} /> : <Moon size={15} />}
            </button>
            <button
              onClick={openSettings}
              className="p-2 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <Settings size={15} />
            </button>
            <button
              onClick={handleLogout}
              title="Sign out"
              className="p-2 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
            >
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </nav>

      {/* ── Shared Mailbox header ─────────────────────────────────────────── */}
      {page === 'mailbox' && (
        <header className="sticky top-0 z-30 bg-white/90 dark:bg-[#080f1e]/95 backdrop-blur border-b border-slate-200 dark:border-slate-800">
          <div className="max-w-7xl mx-auto px-4 h-14 flex items-center gap-4">
            <span className="font-bold text-[22px] tracking-tight">Shared Mailbox Monitor</span>
          </div>
          <div className="max-w-7xl mx-auto px-4 h-11 flex items-center gap-3">
            <div className="flex gap-1">
              {WINDOWS.map(w => (
                <button
                  key={w.value}
                  onClick={() => setMbWindow(w.value)}
                  className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                    mbWindow === w.value
                      ? 'bg-cyan-500 text-white'
                      : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  {w.label}
                </button>
              ))}
            </div>
            <div className="ml-auto flex items-center gap-2">
              <span className="text-xs text-slate-400 dark:text-slate-500 tabular-nums">
                refresh in {Math.floor(mbCountdown / 60)}:{String(mbCountdown % 60).padStart(2, '0')}
              </span>
              <button
                onClick={fetchMailboxes}
                disabled={mbLoading}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-40"
              >
                <RefreshCw size={14} className={mbLoading ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>
        </header>
      )}

      {/* ── DL header ─────────────────────────────────────────────────────── */}
      {page === 'dl' && (
        <header className="sticky top-0 z-30 bg-white/90 dark:bg-[#080f1e]/95 backdrop-blur border-b border-slate-200 dark:border-slate-800">
          <div className="max-w-7xl mx-auto px-4 h-14 flex items-center gap-4">
            <span className="font-bold text-[22px] tracking-tight">Distribution List Monitor</span>
          </div>
          <div className="max-w-7xl mx-auto px-4 h-11 flex items-center gap-3">
            <div className="flex gap-1">
              {WINDOWS.map(w => (
                <button
                  key={w.value}
                  onClick={() => setDlWindow(w.value)}
                  className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                    dlWindow === w.value
                      ? 'bg-cyan-500 text-white'
                      : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  {w.label}
                </button>
              ))}
            </div>
            <div className="ml-auto flex items-center gap-2">
              <span className="text-xs text-slate-400 dark:text-slate-500 tabular-nums">
                refresh in {Math.floor(dlCountdown / 60)}:{String(dlCountdown % 60).padStart(2, '0')}
              </span>
              <button
                onClick={fetchData}
                disabled={loading}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-40"
              >
                <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>
        </header>
      )}

      {/* ── Page content ──────────────────────────────────────────────────── */}
      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">

        {/* ── Shared Mailbox page ─────────────────────────────────────────── */}
        {page === 'mailbox' && (
          <>
            {mbError && (
              <div className="bg-red-50 dark:bg-red-950/40 border border-red-300 dark:border-red-800 rounded-xl px-4 py-3 text-red-700 dark:text-red-300 text-sm">
                Failed to load data: {mbError}
              </div>
            )}

            {mbData.length > 0 && (
              <div className="space-y-4">
                {/* Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                  {mbData.map(mb => (
                    <MailboxCard
                      key={mb.email}
                      mailbox={mb}
                      selected={selectedEmail === mb.email}
                      onSelect={email => setSelectedEmail(email === selectedEmail ? null : email)}
                    />
                  ))}
                </div>

                {/* Detail panel — below cards */}
                {selectedEmail && (
                  <MailboxDetail
                    mailbox={detailPayload}
                    loading={mbDetailLoading}
                    onClose={() => setSelectedEmail(null)}
                  />
                )}
              </div>
            )}

            {!mbLoading && !mbError && mbData.length === 0 && (
              <div className="text-center py-20 text-slate-400 dark:text-slate-500 text-sm">
                No mailboxes configured.{' '}
                <button onClick={openSettings} className="text-cyan-500 underline">
                  Open Settings
                </button>{' '}
                to add some.
              </div>
            )}
          </>
        )}

        {/* ── DL page ─────────────────────────────────────────────────────── */}
        {page === 'dl' && (
          <>
            {error && (
              <div className="bg-red-50 dark:bg-red-950/40 border border-red-300 dark:border-red-800 rounded-xl px-4 py-3 text-red-700 dark:text-red-300 text-sm">
                Failed to load data: {error}
              </div>
            )}

            {/* Stat badges */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'TOTAL EMAILS',   value: totalEmails.toLocaleString() },
                { label: 'DIST. LISTS',    value: dls.length },
                { label: 'TOP RECIPIENTS', value: users.length },
              ].map(s => (
                <div
                  key={s.label}
                  className="bg-white dark:bg-[#0d1526] border border-slate-200 dark:border-slate-700/50 rounded-xl px-4 py-3 text-center"
                >
                  <div className="text-2xl font-bold">{s.value}</div>
                  <div className="text-[10px] font-semibold tracking-widest text-slate-400 dark:text-slate-500 mt-0.5">{s.label}</div>
                </div>
              ))}
            </div>

            {dls.length > 0 && (
              <div>
                <h2 className="text-xs font-semibold tracking-widest text-slate-400 dark:text-slate-500 uppercase mb-3">
                  Distribution Lists
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                  {dls.map(dl => <DLCard key={dl.email} dl={dl} />)}
                </div>
              </div>
            )}

            {users.length > 0 && (
              <div>
                <h2 className="text-xs font-semibold tracking-widest text-slate-400 dark:text-slate-500 uppercase mb-3">
                  Top 20 Recipients
                </h2>
                <UserLeaderboard users={users} />
              </div>
            )}

            {!loading && !error && dls.length === 0 && (
              <div className="text-center py-20 text-slate-400 dark:text-slate-500 text-sm">
                No distribution lists configured.{' '}
                <button onClick={openSettings} className="text-cyan-500 underline">
                  Open Settings
                </button>{' '}
                to add some.
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}
