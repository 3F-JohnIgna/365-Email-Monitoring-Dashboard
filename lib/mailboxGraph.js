'use strict'
const fs    = require('fs')
const path  = require('path')
const axios = require('axios')
const { DateTime } = require('luxon')
const { GRAPH_BASE, authHeaders, initials: getInitials } = require('./graph')

const STAFF_CACHE_PATH = path.join(__dirname, '..', 'cache', 'mb_staff.json')
const STAFF_TTL_MS     = 15 * 60 * 1000
const USER_TTL_MS      = 15 * 60 * 1000

// Reads and parses a JSON cache file from disk; returns an empty object if the file is missing or corrupt.
function _loadCache(p) {
  try { if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8')) } catch (_) {}
  return {}
}

// Writes a cache object to disk as formatted JSON, creating parent directories if needed.
function _saveCache(p, data) {
  try {
    fs.mkdirSync(path.dirname(p), { recursive: true })
    fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf8')
  } catch (_) {}
}

let _staffCache = _loadCache(STAFF_CACHE_PATH)
let _userCache  = { users: null, at: 0 }

// ── Time helpers ──────────────────────────────────────────────────────────────

// Converts a time window string ('24h', '3d', '7d') to a Luxon DateTime (UTC) representing start-of-day in America/Chicago minus the appropriate offset.
function _windowStartDate(window) {
  const offsets = { '24h': 0, '3d': 2, '7d': 6 }
  return DateTime.now()
    .setZone('America/Chicago')
    .startOf('day')
    .minus({ days: offsets[window] ?? 0 })
    .toUTC()
}

// Formats a Luxon DateTime as a compact UTC ISO string (no milliseconds, 'Z' suffix) suitable for Graph OData filters.
function _isoDate(dt) {
  return dt.toISO({ suppressMilliseconds: true }).replace('+00:00', 'Z')
}

// ── Graph helpers ─────────────────────────────────────────────────────────────

// Fetches all pages of a paginated Graph API URL and returns a flat array of all items.
async function _paginate(url) {
  const items = []
  while (url) {
    const resp = await axios.get(url, { headers: await authHeaders() })
    const data = resp.data
    items.push(...(data.value || []))
    url = data['@odata.nextLink'] || null
  }
  return items
}

// Fetches all non-draft messages received by the mailbox after `since`, excluding messages sent from the mailbox itself (to filter out auto-forwards).
async function _getInbox(mailbox, since) {
  const mb  = mailbox.replace(/'/g, "''")
  const url = (
    `${GRAPH_BASE}/users/${mailbox}/messages` +
    `?$filter=receivedDateTime ge ${_isoDate(since)}` +
    ` and isDraft eq false` +
    ` and from/emailAddress/address ne '${mb}'` +
    `&$select=id,receivedDateTime,from,conversationId` +
    `&$top=999`
  )
  return _paginate(url)
}

// Fetches up to 50 unread, non-draft messages received today (always today's window regardless of the selected dashboard window), sorted oldest first, for the "Oldest Unread" panel.
async function _getOldestEmails(mailbox) {
  const mb    = mailbox.replace(/'/g, "''")
  const today = _isoDate(_windowStartDate('24h'))  // always today midnight, regardless of window
  const url = (
    `${GRAPH_BASE}/users/${mailbox}/messages` +
    `?$filter=receivedDateTime ge ${today}` +
    ` and isDraft eq false` +
    ` and isRead eq false` +
    ` and from/emailAddress/address ne '${mb}'` +
    `&$orderby=receivedDateTime asc` +
    `&$top=50` +
    `&$select=id,subject,receivedDateTime,from,parentFolderId,isRead`
  )
  try {
    const resp = await axios.get(url, { headers: await authHeaders() })
    return resp.data.value || []
  } catch (_) { return [] }
}

// Looks up the mailbox as an M365 group and returns its members; used to merge group membership into the staff roster even for members with zero replies.
async function _getGroupMembers(mailboxEmail) {
  try {
    const resp = await axios.get(
      `${GRAPH_BASE}/groups?$filter=mail eq '${mailboxEmail}'&$select=id,displayName`,
      { headers: await authHeaders() }
    )
    const groups = resp.data.value || []
    if (!groups.length) return []
    const resp2 = await axios.get(
      `${GRAPH_BASE}/groups/${groups[0].id}/members?$select=displayName,mail,id`,
      { headers: await authHeaders() }
    )
    return resp2.data.value || []
  } catch (_) { return [] }
}

// Returns all enabled, internal org users (non-guest) with a mail address, caching the full list for 15 minutes to avoid repeated Graph calls.
async function _getAllUsers() {
  const now = Date.now()
  if (_userCache.users && (now - _userCache.at) < USER_TTL_MS) return _userCache.users

  const url = (
    `${GRAPH_BASE}/users` +
    `?$filter=accountEnabled eq true` +
    `&$select=id,displayName,mail,userPrincipalName` +
    `&$top=999`
  )
  let users = await _paginate(url)
  users = users.filter(u => u.mail && !(u.userPrincipalName || '').includes('#EXT#'))
  _userCache.users = users
  _userCache.at    = now
  return users
}

// Discovers which staff members have sent replies from the shared mailbox by querying each user's Sent Items in batches of 20 using the Graph Batch API; returns a map of email → { name, replies, lastSeen }.
async function _discoverStaffBatch(mailboxEmail, since) {
  const users    = await _getAllUsers()
  const mb       = mailboxEmail.replace(/'/g, "''")
  const sinceStr = _isoDate(since)
  const staff    = {}

  for (let i = 0; i < users.length; i += 20) {
    const batch    = users.slice(i, i + 20)
    const requests = batch.map((u, j) => ({
      id:     String(j),
      method: 'GET',
      url: (
        `/users/${u.id}/mailFolders/sentItems/messages` +
        `?$filter=sentDateTime ge ${sinceStr}` +
        ` and from/emailAddress/address eq '${mb}'` +
        `&$select=id,sentDateTime,sender,from` +
        `&$top=100`
      ),
    }))

    try {
      const resp = await axios.post(
        `${GRAPH_BASE}/$batch`,
        { requests },
        { headers: { ...(await authHeaders()), 'Content-Type': 'application/json' } }
      )
      for (const r of (resp.data.responses || [])) {
        if (r.status !== 200) continue
        const idx  = parseInt(r.id, 10)
        const user = batch[idx]
        const msgs = (r.body || {}).value || []
        if (!msgs.length) continue

        const addr = (user.mail || user.userPrincipalName || '').toLowerCase()
        const name = user.displayName || addr
        if (!addr || addr === mailboxEmail.toLowerCase()) continue

        if (!staff[addr]) staff[addr] = { name, email: addr, replies: 0, lastSeen: null }
        staff[addr].replies += msgs.length

        for (const m of msgs) {
          if (m.sentDateTime) {
            const dt = new Date(m.sentDateTime).getTime()
            if (!staff[addr].lastSeen || dt > staff[addr].lastSeen) {
              staff[addr].lastSeen = dt
            }
          }
        }
      }
    } catch (_) {}
  }
  return staff
}

// ── Data builders ─────────────────────────────────────────────────────────────

// Divides the time window into fixed-width buckets and counts messages per bucket to build the sparkline data series shown on mailbox cards.
function _buildSparkline(messages, window) {
  const now    = Date.now()
  const config = {
    '24h': { buckets: 8, deltaMs: 3  * 60 * 60 * 1000 },
    '3d':  { buckets: 6, deltaMs: 12 * 60 * 60 * 1000 },
    '7d':  { buckets: 7, deltaMs: 24 * 60 * 60 * 1000 },
  }
  const { buckets, deltaMs } = config[window] || config['24h']
  const counts = new Array(buckets).fill(0)

  for (const m of messages) {
    if (!m.receivedDateTime) continue
    const dt  = new Date(m.receivedDateTime).getTime()
    const idx = buckets - 1 - Math.floor((now - dt) / deltaMs)
    if (idx >= 0 && idx < buckets) counts[idx]++
  }
  return counts
}

// Builds 8 one-hour buckets covering the last 8 hours (in America/Chicago time) and counts inbox messages per bucket for the hourly activity chart.
function _buildHourly(messages) {
  const now      = Date.now()
  const eightAgo = now - 8 * 60 * 60 * 1000
  const buckets  = []

  for (let i = 0; i < 8; i++) {
    const dt = DateTime.fromMillis(eightAgo + i * 60 * 60 * 1000).setZone('America/Chicago')
    buckets.push({ hour: `${dt.hour}:${String(dt.minute).padStart(2, '0')}`, count: 0 })
  }

  for (const m of messages) {
    if (!m.receivedDateTime) continue
    const dt = new Date(m.receivedDateTime).getTime()
    if (dt < eightAgo) continue
    const idx = Math.floor((dt - eightAgo) / (60 * 60 * 1000))
    if (idx >= 0 && idx < 8) buckets[idx].count++
  }
  return buckets
}

// ── Cache serialization helpers ───────────────────────────────────────────────

// Converts a staff cache entry (ISO string lastSeen) into a runtime map (numeric timestamp lastSeen) for in-memory use.
function _staffCacheToMap(cached) {
  const map = {}
  for (const [addr, s] of Object.entries(cached.staff || {})) {
    map[addr] = { ...s, lastSeen: s.lastSeen ? new Date(s.lastSeen).getTime() : null }
  }
  return map
}

// Converts a runtime staff map (numeric timestamp lastSeen) into a serializable form (ISO string lastSeen) for writing to the cache file.
function _staffMapToCache(map) {
  const obj = {}
  for (const [addr, s] of Object.entries(map)) {
    obj[addr] = { ...s, lastSeen: s.lastSeen ? new Date(s.lastSeen).toISOString() : null }
  }
  return obj
}

// Formats a Unix timestamp into a human-readable "Last seen Xm ago" or "Last seen Xh ago" string; returns null if no timestamp is provided.
function _formatLastSeen(lastSeenMs) {
  if (!lastSeenMs) return null
  const mins = Math.floor((Date.now() - lastSeenMs) / 60_000)
  return mins < 60 ? `Last seen ${mins}m ago` : `Last seen ${Math.floor(mins / 60)}h ago`
}

// ── Folder resolution ─────────────────────────────────────────────────────────

// Resolves a list of folder IDs to their display names via parallel Graph calls; returns 'Unknown' for any folder that cannot be fetched.
async function _resolveFolderNames(mailbox, folderIds) {
  const entries = await Promise.all(
    folderIds.map(async fid => {
      try {
        const resp = await axios.get(
          `${GRAPH_BASE}/users/${mailbox}/mailFolders/${fid}?$select=id,displayName`,
          { headers: await authHeaders() }
        )
        return [fid, resp.status === 200 ? resp.data.displayName : 'Unknown']
      } catch (_) { return [fid, 'Unknown'] }
    })
  )
  return Object.fromEntries(entries)
}

// ── Public API ────────────────────────────────────────────────────────────────

// Returns summary data for a shared mailbox including inbound/outbound counts, load level classification, sparkline, and top staff avatars; staff discovery is cached for 15 minutes.
async function getMailboxSummary(mailboxEmail, mailboxName, window) {
  const since    = _windowStartDate(window)
  const cacheKey = `${mailboxEmail.toLowerCase()}|${window}`
  const now      = Date.now()

  const cached = _staffCache[cacheKey]
  let staffMap = {}
  let cacheHit = false
  if (cached) {
    try {
      if ((now - new Date(cached.cachedAt).getTime()) < STAFF_TTL_MS) {
        staffMap = _staffCacheToMap(cached)
        cacheHit = true
      }
    } catch (_) {}
  }

  let inbox
  if (cacheHit) {
    inbox = await _getInbox(mailboxEmail, since)
  } else {
    ;[inbox, staffMap] = await Promise.all([
      _getInbox(mailboxEmail, since),
      _discoverStaffBatch(mailboxEmail, since).catch(() => ({})),
    ])
    if (Object.keys(staffMap).length) {
      _staffCache[cacheKey] = { cachedAt: new Date().toISOString(), staff: _staffMapToCache(staffMap) }
      _saveCache(STAFF_CACHE_PATH, _staffCache)
    }
  }

  const inbound    = inbox.length
  const outbound   = Object.values(staffMap).reduce((s, x) => s + x.replies, 0)
  const pendingPct = inbound > 0 ? Math.round(Math.max(0, inbound - outbound) / inbound * 100) : 0
  const loadLevel  = pendingPct > 60 ? 'high' : pendingPct >= 35 ? 'medium' : 'low'
  const thirtyAgo  = now - 30 * 60 * 1000

  const staffList = Object.values(staffMap)
    .sort((a, b) => b.replies - a.replies)
    .map(s => ({
      initials: getInitials(s.name),
      name:     s.name,
      active:   !!(s.lastSeen && s.lastSeen >= thirtyAgo),
    }))

  return {
    email:      mailboxEmail,
    name:       mailboxName,
    inbound,
    outbound,
    load_level: loadLevel,
    sparkline:  _buildSparkline(inbox, window),
    staff:      staffList,
  }
}

// Returns full detail data for a shared mailbox including hourly chart, complete staff roster with reply percentages and last-seen times, and oldest unread emails today grouped by folder.
async function getMailboxDetail(mailboxEmail, mailboxName, window) {
  const since    = _windowStartDate(window)
  const cacheKey = `${mailboxEmail.toLowerCase()}|${window}`
  const now      = Date.now()

  const cached = _staffCache[cacheKey]
  let staffMap = {}
  let cacheHit = false
  if (cached) {
    try {
      if ((now - new Date(cached.cachedAt).getTime()) < STAFF_TTL_MS) {
        staffMap = _staffCacheToMap(cached)
        cacheHit = true
      }
    } catch (_) {}
  }

  let inbox, groupMembers, oldestMsgs
  if (cacheHit) {
    ;[inbox, groupMembers, oldestMsgs] = await Promise.all([
      _getInbox(mailboxEmail, since),
      _getGroupMembers(mailboxEmail),
      _getOldestEmails(mailboxEmail),
    ])
  } else {
    ;[inbox, groupMembers, staffMap, oldestMsgs] = await Promise.all([
      _getInbox(mailboxEmail, since),
      _getGroupMembers(mailboxEmail),
      _discoverStaffBatch(mailboxEmail, since).catch(() => ({})),
      _getOldestEmails(mailboxEmail),
    ])
    _staffCache[cacheKey] = { cachedAt: new Date().toISOString(), staff: _staffMapToCache(staffMap) }
    _saveCache(STAFF_CACHE_PATH, _staffCache)
  }

  // Merge in group members (appear even with 0 replies)
  for (const m of groupMembers) {
    const email = (m.mail || '').toLowerCase()
    if (!email || email === mailboxEmail.toLowerCase()) continue
    if (!staffMap[email]) {
      staffMap[email] = { name: m.displayName || email, email, replies: 0, lastSeen: null }
    }
  }

  const inbound  = inbox.length
  const outbound = Object.values(staffMap).reduce((s, x) => s + x.replies, 0)
  const thirtyAgo = now - 30 * 60 * 1000

  const staffList = Object.values(staffMap)
    .sort((a, b) => b.replies - a.replies)
    .map(s => {
      const active = !!(s.lastSeen && s.lastSeen >= thirtyAgo)
      return {
        name:      s.name,
        initials:  getInitials(s.name),
        email:     s.email,
        replies:   s.replies,
        pct:       outbound > 0 ? Math.round(s.replies / outbound * 100) : 0,
        active,
        last_seen: active ? null : _formatLastSeen(s.lastSeen),
      }
    })

  // Resolve folder names for oldest emails
  const folderIds   = [...new Set(oldestMsgs.map(m => m.parentFolderId).filter(Boolean))]
  const folderNames = await _resolveFolderNames(mailboxEmail, folderIds)

  const EXCLUDED = new Set(['Archive', 'Deleted Items', 'Sent Items'])
  const oldestEmails = oldestMsgs
    .map(m => ({
      subject:   m.subject || '(no subject)',
      from_name: m.from?.emailAddress?.name  || '',
      from_addr: m.from?.emailAddress?.address || '',
      received:  m.receivedDateTime || '',
      folder:    folderNames[m.parentFolderId] || 'Unknown',
    }))
    .filter(e => !EXCLUDED.has(e.folder))

  return {
    email:         mailboxEmail,
    name:          mailboxName,
    inbound,
    outbound,
    hourly:        _buildHourly(inbox),
    staff:         staffList,
    oldest_emails: oldestEmails,
  }
}

module.exports = { getMailboxSummary, getMailboxDetail }
