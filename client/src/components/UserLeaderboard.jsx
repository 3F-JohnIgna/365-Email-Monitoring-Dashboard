const AVATAR_COLORS = ['#1d4ed8', '#7c3aed', '#0e7490', '#065f46', '#92400e', '#9d174d']

// Derives a consistent avatar background color from a two-character initials string by summing the character codes of both letters.
function avatarColor(initials) {
  const code = (initials.charCodeAt(0) || 0) + (initials.charCodeAt(1) || 0)
  return AVATAR_COLORS[code % AVATAR_COLORS.length]
}

// Derives a consistent chip color for a DL tag by summing the character codes of the DL's email address.
function dlTagColor(dlEmail) {
  let code = 0
  for (let i = 0; i < dlEmail.length; i++) code += dlEmail.charCodeAt(i)
  return AVATAR_COLORS[code % AVATAR_COLORS.length]
}

// Renders the top-20 recipients leaderboard table with rank, avatar, name, per-DL email breakdown chips, a proportional progress bar, and total email count for each user.
export default function UserLeaderboard({ users }) {
  if (!users || users.length === 0) {
    return (
      <p className="text-slate-400 dark:text-slate-500 text-sm text-center py-8">
        No user data available. Configure distribution lists to see results.
      </p>
    )
  }

  const maxEmails = users[0]?.total_emails || 1

  return (
    <div className="space-y-2">
      {users.map((user, idx) => {
        // Find the DL that sent the user the most emails to highlight as the top chip.
        const topDL = user.dl_breakdown.reduce(
          (best, d) => (d.count > best.count ? d : best),
          user.dl_breakdown[0] || { dl_name: '', dl_email: '', count: 0 }
        )
        const barPct = Math.round((user.total_emails / maxEmails) * 100)

        return (
          <div
            key={user.email}
            className="flex items-center gap-3 bg-white dark:bg-[#0d1526] border border-slate-200 dark:border-slate-700/50 rounded-xl px-4 py-3"
          >
            {/* Rank */}
            <div className="w-6 shrink-0 text-center text-xs font-bold text-slate-400 dark:text-slate-500">
              {idx + 1}
            </div>

            {/* Avatar */}
            <div
              className="w-9 h-9 shrink-0 rounded-full flex items-center justify-center text-xs font-bold text-white"
              style={{ backgroundColor: avatarColor(user.initials) }}
            >
              {user.initials}
            </div>

            {/* Name + breakdown */}
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-slate-900 dark:text-white truncate">{user.name}</div>

              {/* Bar */}
              <div className="w-full h-1 bg-slate-200 dark:bg-slate-700/60 rounded-full overflow-hidden mt-1.5 mb-1">
                <div
                  className="h-full rounded-full bg-cyan-500 transition-all"
                  style={{ width: `${barPct}%` }}
                />
              </div>

              {/* DL chips */}
              <div className="flex flex-wrap gap-1 mt-1">
                {user.dl_breakdown.map((d, i) => {
                  const color = dlTagColor(d.dl_email)
                  const isTop = d.dl_email === topDL.dl_email
                  return (
                    <span
                      key={i}
                      className="inline-flex items-center gap-1 text-[14px] font-medium px-1.5 py-0.5 rounded"
                      style={{
                        backgroundColor: color + (isTop ? '28' : '12'),
                        color,
                        outline: isTop ? `1px solid ${color}55` : 'none',
                      }}
                    >
                      {d.dl_name}: {d.count}
                    </span>
                  )
                })}
              </div>
            </div>

            {/* Total */}
            <div className="shrink-0 text-right">
              <div className="text-2xl font-bold text-slate-900 dark:text-white leading-none">
                {user.total_emails.toLocaleString()}
              </div>
              <div className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">emails</div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
