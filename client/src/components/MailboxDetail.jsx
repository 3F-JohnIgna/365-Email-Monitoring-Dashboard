import { X } from 'lucide-react'
import HourlyChart from './HourlyChart'

// ── Subject grouping helpers ───────────────────────────────────────────────────

// Strips common reply/forward prefixes (Re:, Fw:, Fwd:, Aw:, etc.) from a subject line and lowercases it for comparison.
function normalizeSubject(subject) {
  let s = (subject || '').trim()
  const PREFIX = /^(re|fw|fwd|aw|res|wg|tr|ref)\s*:\s*/i
  while (PREFIX.test(s)) s = s.replace(PREFIX, '').trim()
  return s.toLowerCase()
}

// Computes the Levenshtein edit distance between two strings using a single-row DP array.
function editDistance(a, b) {
  const dp = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0]; dp[0] = i
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j]
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1])
      prev = tmp
    }
  }
  return dp[b.length]
}

// Returns a similarity score between 0 and 1 for two strings based on edit distance relative to the longer string's length.
function similarity(a, b) {
  if (a === b) return 1
  if (!a || !b) return 0
  const longer = a.length >= b.length ? a : b
  const shorter = a.length >= b.length ? b : a
  return 1 - editDistance(longer, shorter) / longer.length
}

// Formats a received timestamp as a time string for today or a short date + time for older messages.
function formatReceived(iso) {
  if (!iso) return '—'
  const d     = new Date(iso)
  const today = new Date()
  const time  = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  if (d.toDateString() === today.toDateString()) return time
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + time
}

// Groups an array of emails by normalized subject similarity (≥ 90%), returning one representative row per group (the oldest message) with a count of how many emails are in the group.
function groupEmails(emails) {
  const used   = new Set()
  const groups = []
  for (let i = 0; i < emails.length; i++) {
    if (used.has(i)) continue
    const normI = normalizeSubject(emails[i].subject)
    const members = [emails[i]]
    used.add(i)
    for (let j = i + 1; j < emails.length; j++) {
      if (used.has(j)) continue
      if (similarity(normI, normalizeSubject(emails[j].subject)) >= 0.9) {
        members.push(emails[j])
        used.add(j)
      }
    }
    // emails are sorted oldest-first from the API, so members[0] is the oldest
    const rep = members[0]
    groups.push({ ...rep, count: members.length })
  }
  return groups
}

const LOAD_COLORS = {
  high:   'text-red-500    bg-red-500/10    border-red-500/30',
  medium: 'text-amber-500  bg-amber-500/10  border-amber-500/30',
  low:    'text-emerald-500 bg-emerald-500/10 border-emerald-500/30',
}

// Renders a larger circular avatar for the staff roster with a green ring when the member is active.
function Avatar({ initials, active }) {
  return (
    <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 ring-2 ${active ? 'ring-emerald-500' : 'ring-transparent'}`}>
      {initials}
    </div>
  )
}

// Renders the expanded detail panel for a selected mailbox showing inbound/outbound counts, hourly activity chart, full staff roster with reply percentages, and a grouped table of the oldest unread emails received today.
export default function MailboxDetail({ mailbox, loading, onClose }) {
  if (loading && !mailbox) {
    return (
      <div className="bg-white dark:bg-[#0d1526] border border-slate-200 dark:border-slate-700/50 rounded-2xl p-5 flex items-center justify-center min-h-[200px]">
        <div className="text-slate-400 dark:text-slate-500 text-sm animate-pulse">Loading…</div>
      </div>
    )
  }

  if (!mailbox) return null

  const loadCls = LOAD_COLORS[mailbox.load_level] || LOAD_COLORS.low

  return (
    <div className="bg-white dark:bg-[#0d1526] border border-slate-200 dark:border-slate-700/50 rounded-2xl p-5 space-y-5">

      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-base">{mailbox.name}</span>
            {mailbox.load_level && (
              <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border ${loadCls}`}>
                {mailbox.load_level}
              </span>
            )}
          </div>
          <div className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{mailbox.email}</div>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"
        >
          <X size={15} />
        </button>
      </div>

      {/* Counts */}
      <div className="flex gap-6">
        <div>
          <div className="text-2xl font-bold tabular-nums">{mailbox.inbound ?? '—'}</div>
          <div className="text-[10px] font-semibold tracking-widest text-slate-400 dark:text-slate-500 uppercase">Inbound</div>
        </div>
        <div>
          <div className="text-2xl font-bold tabular-nums">{mailbox.outbound ?? '—'}</div>
          <div className="text-[10px] font-semibold tracking-widest text-slate-400 dark:text-slate-500 uppercase">Outbound</div>
        </div>
      </div>

      {/* Hourly chart */}
      {(mailbox.hourly || []).length > 0 && (
        <div>
          <div className="text-xs font-semibold tracking-widest text-slate-400 dark:text-slate-500 uppercase mb-2">
            Activity — last 8 hours
          </div>
          <HourlyChart data={mailbox.hourly} />
        </div>
      )}

      {/* Staff roster */}
      {(mailbox.staff || []).length > 0 && (
        <div>
          <div className="text-xs font-semibold tracking-widest text-slate-400 dark:text-slate-500 uppercase mb-2">
            Staff
          </div>
          <div className="space-y-2">
            {mailbox.staff.map((s, i) => (
              <div key={i} className="flex items-center gap-3">
                <Avatar initials={s.initials} active={s.active} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{s.name}</div>
                  <div className="text-xs">
                    {s.active ? (
                      <span className="text-emerald-500 font-medium">Active now</span>
                    ) : (
                      <span className="text-slate-400 dark:text-slate-500">
                        {s.last_seen || 'No recent activity'}
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm font-bold tabular-nums">{s.replies}</div>
                  <div className="text-[10px] text-slate-400 dark:text-slate-500">{s.pct}%</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Oldest unresponded emails — grouped table */}
      {(mailbox.oldest_emails || []).length > 0 && (() => {
        const mbEmail = (mailbox.email || '').toLowerCase()
        const filtered = mailbox.oldest_emails.filter(
          e => (e.from_addr || '').toLowerCase() !== mbEmail
        )
        const rows = groupEmails(filtered).slice(0, 20)
        if (!rows.length) return null
        return (
          <div>
            <div className="text-xs font-semibold tracking-widest text-slate-400 dark:text-slate-500 uppercase mb-2">
              Oldest Unread — Today
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700">
                    {['Subject', 'Sender', 'Date', 'Folder', '# Emails'].map((h, i) => (
                      <th
                        key={h}
                        className={`py-2 text-[10px] font-semibold tracking-widest text-slate-400 dark:text-slate-500 uppercase whitespace-nowrap ${
                          i === 4 ? 'text-right pl-3' : 'text-left pr-3'
                        }`}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((e, i) => (
                    <tr
                      key={i}
                      className="border-b border-slate-100 dark:border-slate-800/60 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-800/30"
                    >
                      <td className="py-2 pr-3 max-w-[220px]">
                        <span className="font-medium truncate block">
                          {e.subject}
                        </span>
                      </td>
                      <td className="py-2 pr-3 max-w-[160px]">
                        <span className="text-slate-500 dark:text-slate-400 truncate block">
                          {e.from_name || e.from_addr}
                        </span>
                      </td>
                      <td className="py-2 pr-3 whitespace-nowrap text-slate-500 dark:text-slate-400">
                        {formatReceived(e.received)}
                      </td>
                      <td className="py-2 pr-3 whitespace-nowrap text-slate-500 dark:text-slate-400">
                        {e.folder || '—'}
                      </td>
                      <td className="py-2 pl-3 text-right">
                        {e.count > 1 ? (
                          <span className="inline-flex items-center justify-center min-w-[22px] h-5 rounded-full bg-cyan-500/15 text-cyan-500 font-bold px-1.5">
                            {e.count}
                          </span>
                        ) : (
                          <span className="text-slate-400">1</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
