import SparklineChart from './SparklineChart'

const LOAD_COLORS = {
  high:   'text-red-500    bg-red-500/10    border-red-500/30',
  medium: 'text-amber-500  bg-amber-500/10  border-amber-500/30',
  low:    'text-emerald-500 bg-emerald-500/10 border-emerald-500/30',
}

// Renders a small circular avatar with the staff member's initials; shows a green ring when the member is currently active (replied within the last 30 minutes).
function Avatar({ initials, active }) {
  return (
    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 ring-1 ${active ? 'ring-emerald-500' : 'ring-transparent'}`}>
      {initials}
    </div>
  )
}

// Renders a clickable summary card for a shared mailbox showing its name, load level badge, inbound/outbound counts, sparkline, and up to 6 staff avatars; highlights with a cyan border when selected.
export default function MailboxCard({ mailbox, selected, onSelect }) {
  const loadCls      = LOAD_COLORS[mailbox.load_level] || LOAD_COLORS.low
  const visibleStaff = (mailbox.staff || []).slice(0, 6)
  const extraStaff   = (mailbox.staff || []).length - 6

  return (
    <button
      onClick={() => onSelect(mailbox.email)}
      className={`w-full text-left bg-white dark:bg-[#0d1526] rounded-2xl p-4 transition-colors space-y-3 border ${
        selected
          ? 'border-cyan-500'
          : 'border-slate-200 dark:border-slate-700/50 hover:border-cyan-500/50'
      }`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-semibold text-sm truncate">{mailbox.name}</div>
          <div className="text-xs text-slate-400 dark:text-slate-500 truncate">{mailbox.email}</div>
        </div>
        <span className={`shrink-0 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border ${loadCls}`}>
          {mailbox.load_level}
        </span>
      </div>

      {/* Counts */}
      <div className="flex gap-4">
        <div>
          <div className="text-xl font-bold tabular-nums">{mailbox.inbound ?? '—'}</div>
          <div className="text-[10px] font-semibold tracking-widest text-slate-400 dark:text-slate-500 uppercase">Inbound</div>
        </div>
        <div>
          <div className="text-xl font-bold tabular-nums">{mailbox.outbound ?? '—'}</div>
          <div className="text-[10px] font-semibold tracking-widest text-slate-400 dark:text-slate-500 uppercase">Outbound</div>
        </div>
      </div>

      {/* Sparkline */}
      <SparklineChart data={mailbox.sparkline || []} />

      {/* Staff avatars */}
      {visibleStaff.length > 0 && (
        <div className="flex items-center gap-1">
          {visibleStaff.map((s, i) => (
            <Avatar key={i} initials={s.initials} active={s.active} />
          ))}
          {extraStaff > 0 && (
            <span className="text-[10px] text-slate-400 dark:text-slate-500 ml-1">+{extraStaff}</span>
          )}
        </div>
      )}

      {/* Error state */}
      {mailbox.error && (
        <div className="text-xs text-red-500 truncate">{mailbox.error}</div>
      )}
    </button>
  )
}
