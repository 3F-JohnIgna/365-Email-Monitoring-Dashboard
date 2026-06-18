import { AlertTriangle } from 'lucide-react'

const AVATAR_COLORS = ['#1d4ed8', '#7c3aed', '#0e7490', '#065f46', '#92400e', '#9d174d']

// Derives a consistent color from a string by summing its character codes and indexing into the AVATAR_COLORS palette.
function tagColor(str) {
  let code = 0
  for (let i = 0; i < str.length; i++) code += str.charCodeAt(i)
  return AVATAR_COLORS[code % AVATAR_COLORS.length]
}

// Renders a card for a single distribution list showing its name, email, member count, and total emails received; displays a red error banner instead when the address is not a valid DL.
export default function DLCard({ dl }) {
  const { email, name, total_emails, member_count, is_valid_dl, error_reason } = dl

  if (is_valid_dl === false) {
    return (
      <div className="rounded-xl p-4 border-2 border-red-500 bg-red-50 dark:bg-red-950/40 flex flex-col gap-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full shrink-0 bg-red-500" />
              <span className="font-semibold text-slate-900 dark:text-white text-sm truncate">{name}</span>
            </div>
            <div className="text-slate-500 dark:text-slate-400 text-xs mt-0.5 ml-4 truncate">{email}</div>
          </div>
        </div>
        <div className="flex items-start gap-2 bg-red-500 rounded-lg px-3 py-2">
          <AlertTriangle size={14} className="text-white shrink-0 mt-0.5" />
          <div>
            <div className="text-white text-xs font-bold uppercase tracking-wide leading-none mb-0.5">
              Not a Distribution List
            </div>
            <div className="text-red-100 text-[11px] leading-snug">
              {error_reason || 'This address is not a valid Distribution List.'}
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-xl p-4 border border-slate-200 dark:border-slate-700/50 bg-white dark:bg-[#0d1526] flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: tagColor(email) }}
            />
            <span className="font-semibold text-slate-900 dark:text-white text-sm truncate">{name}</span>
          </div>
          <div className="text-slate-500 dark:text-slate-400 text-xs mt-0.5 ml-4 truncate">{email}</div>
        </div>
        <div
          className="shrink-0 text-xs font-medium px-2 py-0.5 rounded-full border"
          style={{
            color:           tagColor(email),
            borderColor:     tagColor(email) + '55',
            backgroundColor: tagColor(email) + '18',
          }}
        >
          {member_count} members
        </div>
      </div>

      <div className="flex items-end gap-2 mt-1">
        <span className="text-4xl font-bold text-slate-900 dark:text-white leading-none">
          {total_emails.toLocaleString()}
        </span>
        <span className="text-slate-400 dark:text-slate-500 text-xs mb-1">emails received</span>
      </div>
    </div>
  )
}
