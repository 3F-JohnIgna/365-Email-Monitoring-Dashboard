import { useState, useEffect } from 'react'
import { X, Plus, Trash2, Save, Moon, Sun, ChevronRight, AlertTriangle } from 'lucide-react'

const TABS = ['Mailboxes', 'Distribution Lists', 'Connection', 'Theme']

// Full-screen settings panel with tabs for managing mailboxes, distribution lists, Azure credentials, and the UI theme.
export default function SettingsPage({ onClose, dark, setDark }) {
  const [tab, setTab] = useState('Mailboxes')

  // ── Mailbox list ─────────────────────────────────────────────────────────
  const [mbList, setMbList]   = useState([])
  const [mbSaved, setMbSaved] = useState(false)

  useEffect(() => {
    fetch('/api/config/mailboxes')
      .then(r => r.json())
      .then(setMbList)
      .catch(() => {})
  }, [])

  // Appends a blank mailbox row to the local list so the user can fill in its email and name.
  function addMb() {
    setMbList(prev => [...prev, { email: '', name: '' }])
  }

  // Updates a single field of the mailbox row at the given index without affecting other rows.
  function updateMb(idx, field, value) {
    setMbList(prev => prev.map((m, i) => i === idx ? { ...m, [field]: value } : m))
  }

  // Removes the mailbox row at the given index from the local list.
  function removeMb(idx) {
    setMbList(prev => prev.filter((_, i) => i !== idx))
  }

  // Persists the current mailbox list to the server (filtering out blank entries) and shows a "Saved!" confirmation for 2 seconds.
  async function saveMbs() {
    const res = await fetch('/api/config/mailboxes', {
      method:  'PUT',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(mbList.filter(m => m.email.trim())),
    })
    if (res.ok) {
      setMbList(await res.json())
      setMbSaved(true)
      setTimeout(() => setMbSaved(false), 2000)
    }
  }

  // ── DL list ──────────────────────────────────────────────────────────────
  const [dlList, setDlList]   = useState([])
  const [dlSaved, setDlSaved] = useState(false)

  useEffect(() => {
    fetch('/api/config/distribution-lists')
      .then(r => r.json())
      .then(setDlList)
      .catch(() => {})
  }, [])

  // Appends a blank distribution list row to the local list so the user can fill in its email and name.
  function addDL() {
    setDlList(prev => [...prev, { email: '', name: '' }])
  }

  // Updates a single field of the DL row at the given index without affecting other rows.
  function updateDL(idx, field, value) {
    setDlList(prev => prev.map((d, i) => i === idx ? { ...d, [field]: value } : d))
  }

  // Removes the DL row at the given index from the local list.
  function removeDL(idx) {
    setDlList(prev => prev.filter((_, i) => i !== idx))
  }

  // Persists the current DL list to the server (filtering out blank entries) and shows a "Saved!" confirmation for 2 seconds.
  async function saveDLs() {
    const res = await fetch('/api/config/distribution-lists', {
      method:  'PUT',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(dlList.filter(d => d.email.trim())),
    })
    if (res.ok) {
      setDlList(await res.json())
      setDlSaved(true)
      setTimeout(() => setDlSaved(false), 2000)
    }
  }

  // ── Credentials ──────────────────────────────────────────────────────────
  const [creds, setCreds]         = useState({ tenant_id: '', client_id: '', has_secret: false })
  const [secret, setSecret]       = useState('')
  const [credSaved, setCredSaved] = useState(false)

  useEffect(() => {
    fetch('/api/config/credentials')
      .then(r => r.json())
      .then(setCreds)
      .catch(() => {})
  }, [])

  // Saves Azure tenant ID, client ID, and (optionally) client secret to the server; re-fetches the credential status and shows a confirmation for 2 seconds.
  async function saveCreds() {
    const res = await fetch('/api/config/credentials', {
      method:  'PUT',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        tenant_id:     creds.tenant_id,
        client_id:     creds.client_id,
        client_secret: secret || undefined,
      }),
    })
    if (res.ok) {
      setCredSaved(true)
      setSecret('')
      fetch('/api/config/credentials').then(r => r.json()).then(setCreds)
      setTimeout(() => setCredSaved(false), 2000)
    }
  }

  const inputCls = 'bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-cyan-500/50'

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#080f1e] text-slate-900 dark:text-white">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-white/80 dark:bg-[#080f1e]/90 backdrop-blur border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center gap-4">
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X size={18} />
          </button>
          <span className="font-semibold">Settings</span>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-6">
        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-slate-100 dark:bg-slate-800/60 p-1 rounded-xl w-fit">
          {TABS.map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                tab === t
                  ? 'bg-white dark:bg-[#0d1526] text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* ── Mailboxes tab ──────────────────────────────────────────────── */}
        {tab === 'Mailboxes' && (
          <div className="space-y-3">
            {mbList.map((mb, idx) => (
              <div
                key={idx}
                className="flex gap-2 items-center bg-white dark:bg-[#0d1526] border border-slate-200 dark:border-slate-700/50 rounded-xl px-4 py-3"
              >
                <div className="flex-1 grid grid-cols-2 gap-2">
                  <input
                    type="email"
                    placeholder="mailbox@company.com"
                    value={mb.email}
                    onChange={e => updateMb(idx, 'email', e.target.value)}
                    className={inputCls}
                  />
                  <input
                    type="text"
                    placeholder="Display name"
                    value={mb.name}
                    onChange={e => updateMb(idx, 'name', e.target.value)}
                    className={inputCls}
                  />
                </div>
                <button
                  onClick={() => removeMb(idx)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors shrink-0"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}

            <div className="flex gap-2">
              <button
                onClick={addMb}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 text-sm text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:border-slate-400 transition-colors"
              >
                <Plus size={14} /> Add Mailbox
              </button>
              <button
                onClick={saveMbs}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-600 text-white text-sm font-medium transition-colors"
              >
                <Save size={14} /> {mbSaved ? 'Saved!' : 'Save'}
              </button>
            </div>
          </div>
        )}

        {/* ── Distribution Lists tab ─────────────────────────────────────── */}
        {tab === 'Distribution Lists' && (
          <div className="space-y-3">
            {dlList.map((dl, idx) => (
              <div key={idx} className="flex flex-col gap-0">
                <div
                  className={`flex gap-2 items-center bg-white dark:bg-[#0d1526] px-4 py-3 ${
                    dl.is_valid_dl === false
                      ? 'border-2 border-red-500 rounded-t-xl'
                      : 'border border-slate-200 dark:border-slate-700/50 rounded-xl'
                  }`}
                >
                  <div className="flex-1 grid grid-cols-2 gap-2">
                    <input
                      type="email"
                      placeholder="dl@company.com"
                      value={dl.email}
                      onChange={e => updateDL(idx, 'email', e.target.value)}
                      className={inputCls}
                    />
                    <input
                      type="text"
                      placeholder="Display name"
                      value={dl.name}
                      onChange={e => updateDL(idx, 'name', e.target.value)}
                      className={inputCls}
                    />
                  </div>

                  <button
                    onClick={() => removeDL(idx)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors shrink-0"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>

                {dl.is_valid_dl === false && (
                  <div className="flex items-start gap-2 bg-red-500 rounded-b-xl px-4 py-2">
                    <AlertTriangle size={13} className="text-white shrink-0 mt-0.5" />
                    <span className="text-white text-[11px] leading-snug">
                      <span className="font-bold uppercase tracking-wide">Not a Distribution List</span>
                      {dl.error_reason ? ` — ${dl.error_reason}` : ''}
                    </span>
                  </div>
                )}
              </div>
            ))}

            <div className="flex gap-2">
              <button
                onClick={addDL}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 text-sm text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:border-slate-400 transition-colors"
              >
                <Plus size={14} /> Add Distribution List
              </button>
              <button
                onClick={saveDLs}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-600 text-white text-sm font-medium transition-colors"
              >
                <Save size={14} /> {dlSaved ? 'Saved!' : 'Save'}
              </button>
            </div>
          </div>
        )}

        {/* ── Connection tab ────────────────────────────────────────────────── */}
        {tab === 'Connection' && (
          <div className="space-y-4 max-w-lg">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                Tenant ID
              </label>
              <input
                type="text"
                value={creds.tenant_id}
                onChange={e => setCreds(c => ({ ...c, tenant_id: e.target.value }))}
                className="w-full bg-white dark:bg-[#0d1526] border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-cyan-500/50"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                Client ID
              </label>
              <input
                type="text"
                value={creds.client_id}
                onChange={e => setCreds(c => ({ ...c, client_id: e.target.value }))}
                className="w-full bg-white dark:bg-[#0d1526] border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-cyan-500/50"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                Client Secret
              </label>
              <input
                type="password"
                placeholder={creds.has_secret ? '••••••••  (stored in Credential Manager)' : 'Enter client secret…'}
                autoComplete="off"
                data-1p-ignore
                data-lpignore="true"
                value={secret}
                onChange={e => setSecret(e.target.value)}
                className="w-full bg-white dark:bg-[#0d1526] border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-cyan-500/50"
              />
              <p className="text-[11px] text-slate-400 dark:text-slate-500">
                Stored securely in Windows Credential Manager. Leave blank to keep the existing secret.
              </p>
            </div>

            <button
              onClick={saveCreds}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-600 text-white text-sm font-medium transition-colors"
            >
              <Save size={14} /> {credSaved ? 'Saved!' : 'Save Credentials'}
            </button>
          </div>
        )}

        {/* ── Theme tab ─────────────────────────────────────────────────────── */}
        {tab === 'Theme' && (
          <div className="space-y-3 max-w-xs">
            {[
              { label: 'Light', icon: <Sun size={16} />,  value: false },
              { label: 'Dark',  icon: <Moon size={16} />, value: true  },
            ].map(opt => (
              <button
                key={opt.label}
                onClick={() => setDark(opt.value)}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border transition-colors ${
                  dark === opt.value
                    ? 'border-cyan-500 bg-cyan-500/10 text-cyan-500'
                    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0d1526] text-slate-500 dark:text-slate-400'
                }`}
              >
                <div className="flex items-center gap-2">
                  {opt.icon}
                  <span className="text-sm font-medium">{opt.label}</span>
                </div>
                {dark === opt.value && <ChevronRight size={14} />}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
