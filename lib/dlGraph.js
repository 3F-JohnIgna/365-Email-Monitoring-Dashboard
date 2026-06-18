'use strict'
const fs   = require('fs')
const path = require('path')
const axios = require('axios')
const { GRAPH_BASE, authHeaders, windowStart, initials } = require('./graph')

const CACHE_DIR          = path.join(__dirname, '..', 'cache')
const MEMBERS_CACHE_PATH = path.join(CACHE_DIR, 'dl_members.json')
const COUNTS_CACHE_PATH  = path.join(CACHE_DIR, 'dl_counts.json')
const PROXY_CACHE_PATH   = path.join(CACHE_DIR, 'dl_proxy.json')

const MEMBERS_TTL_MS = 60 * 60 * 1000        // 1 hour
const COUNTS_TTL_MS  =  5 * 60 * 1000        // 5 minutes

// Reads and parses a JSON cache file from disk; returns an empty object if the file is missing or corrupt.
function _loadCache(filePath) {
  try {
    if (fs.existsSync(filePath)) return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch (_) {}
  return {}
}

// Writes a cache object to disk as formatted JSON, creating the cache directory if it does not exist.
function _saveCache(filePath, data) {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true })
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8')
  } catch (_) {}
}

let _membersCache = _loadCache(MEMBERS_CACHE_PATH)
let _countsCache  = _loadCache(COUNTS_CACHE_PATH)
let _proxyCache   = _loadCache(PROXY_CACHE_PATH)

// ── Group validation ──────────────────────────────────────────────────────────

// Queries Graph for a group by email and validates that it is a pure distribution list (not an M365 Group, mail-enabled security group, or non-mail-enabled group).
async function _getDLGroupInfo(dlEmail) {
  const url = `${GRAPH_BASE}/groups?$filter=mail eq '${dlEmail}'&$select=id,mailEnabled,securityEnabled,groupTypes`
  try {
    const resp   = await axios.get(url, { headers: await authHeaders() })
    const groups = resp.data.value || []
    if (!groups.length) return { id: null, isValidDL: false, errorReason: 'Not found as a Distribution List' }
    const g          = groups[0]
    const groupTypes = g.groupTypes || []
    if (groupTypes.includes('Unified'))  return { id: g.id, isValidDL: false, errorReason: 'Not a Distribution List (M365 Group)' }
    if (g.securityEnabled)               return { id: g.id, isValidDL: false, errorReason: 'Not a Distribution List (Mail-Enabled Security Group)' }
    if (!g.mailEnabled)                  return { id: g.id, isValidDL: false, errorReason: 'Not a mail-enabled group' }
    return { id: g.id, isValidDL: true, errorReason: null }
  } catch (err) {
    return { id: null, isValidDL: false, errorReason: `Graph query failed: ${err.message}` }
  }
}

// Returns the cached validation result (isValidDL, errorReason) for a DL without making a Graph call.
function getDLValidation(dlEmail) {
  const cached = _membersCache[dlEmail] || {}
  return { isValidDL: cached.isValidDL ?? null, errorReason: cached.errorReason || null }
}

// ── Member fetching ───────────────────────────────────────────────────────────

// Fetches all user members of a distribution list from Graph, caching the result for 1 hour (or 60 seconds for transient errors); also populates the proxy cache with the first member.
async function getDLMembers(dlEmail) {
  const now    = Date.now()
  const cached = _membersCache[dlEmail]
  if (cached) {
    try {
      const age = now - new Date(cached.cachedAt).getTime()
      // Only honour the cache for successful lookups or permanent DL-type rejections.
      // Transient errors (auth failures, network issues) use a short 60-second TTL
      // so they are retried quickly after credentials are saved.
      const isTransient = cached.isValidDL === false && (cached.errorReason || '').startsWith('Graph query failed:')
      const ttl = isTransient ? 60_000 : MEMBERS_TTL_MS
      if (age < ttl) return cached.members
    } catch (_) {}
  }

  const info = await _getDLGroupInfo(dlEmail)
  if (!info.isValidDL) {
    _membersCache[dlEmail] = { cachedAt: new Date().toISOString(), members: [], isValidDL: false, errorReason: info.errorReason }
    // Don't persist transient errors to disk — they should re-query on next server start too.
    if (!info.errorReason.startsWith('Graph query failed:')) {
      _saveCache(MEMBERS_CACHE_PATH, _membersCache)
    }
    return []
  }

  const members = []
  let url = `${GRAPH_BASE}/groups/${info.id}/members?$select=id,displayName,mail`
  while (url) {
    try {
      const resp = await axios.get(url, { headers: await authHeaders() })
      const data = resp.data
      for (const m of (data.value || [])) {
        if (m.mail && m['@odata.type'] === '#microsoft.graph.user') members.push(m)
      }
      url = data['@odata.nextLink'] || null
    } catch (_) { break }
  }

  _membersCache[dlEmail] = { cachedAt: new Date().toISOString(), members, isValidDL: true, errorReason: null }
  _saveCache(MEMBERS_CACHE_PATH, _membersCache)

  // Auto-resolve proxy from first member.
  if (members.length) {
    const first = members[0]
    _proxyCache[dlEmail] = {
      proxy:      first.mail,
      proxy_name: first.displayName || first.mail,
      resolvedAt: new Date().toISOString(),
    }
    _saveCache(PROXY_CACHE_PATH, _proxyCache)
  }

  return members
}

// Returns the in-memory proxy cache mapping each DL email to its resolved proxy member email and name.
function getProxyCache() { return _proxyCache }

// ── Email counting ────────────────────────────────────────────────────────────

// Counts emails received by a distribution list within the given time window by scanning the proxy member's mailbox for messages addressed to the DL; result is cached for 5 minutes.
async function countEmailsForDL(dlEmail, window) {
  const proxyEntry = _proxyCache[dlEmail]
  if (!proxyEntry) return 0

  const proxyEmail = proxyEntry.proxy
  const cacheKey   = `${dlEmail}|${window}`
  const now        = Date.now()

  const cached = _countsCache[cacheKey]
  if (cached) {
    try {
      if ((now - new Date(cached.cachedAt).getTime()) < COUNTS_TTL_MS) return cached.count
    } catch (_) {}
  }

  const since   = windowStart(window)
  const dlLower = dlEmail.toLowerCase()

  let url = (
    `${GRAPH_BASE}/users/${proxyEmail}/messages` +
    `?$filter=receivedDateTime ge ${since}` +
    `&$select=id,toRecipients,ccRecipients` +
    `&$top=999`
  )

  let count = 0
  let failed = false
  try {
    while (url) {
      const resp = await axios.get(url, { headers: await authHeaders() })
      const data = resp.data
      for (const msg of (data.value || [])) {
        const allRecipients = [
          ...(msg.toRecipients || []),
          ...(msg.ccRecipients || []),
        ]
        if (allRecipients.some(r => (r.emailAddress?.address || '').toLowerCase() === dlLower)) {
          count++
        }
      }
      url = data['@odata.nextLink'] || null
    }
  } catch (_) {
    failed = true
  }

  // Don't cache failures — let them retry immediately on the next request.
  if (!failed) {
    _countsCache[cacheKey] = { cachedAt: new Date().toISOString(), count }
    _saveCache(COUNTS_CACHE_PATH, _countsCache)
  }
  return failed ? 0 : count
}

// ── Debug endpoint ────────────────────────────────────────────────────────────

// Returns a diagnostic object for a single DL including its Graph group info, proxy cache entry, and a sample of 10 recent messages from the proxy member's mailbox.
async function debugDL(dlEmail, window) {
  const out = { dlEmail, window }
  out.groupInfo = await _getDLGroupInfo(dlEmail)
  const proxyEntry = _proxyCache[dlEmail]
  out.proxy = proxyEntry || null

  if (!proxyEntry) {
    out.note = 'No proxy resolved — run the dashboard once first to populate the proxy cache.'
    return out
  }

  const proxyEmail = proxyEntry.proxy
  const since      = windowStart(window)
  const url = (
    `${GRAPH_BASE}/users/${proxyEmail}/messages` +
    `?$filter=receivedDateTime ge ${since}` +
    `&$select=id,receivedDateTime,toRecipients,ccRecipients` +
    `&$top=10`
  )

  try {
    const resp = await axios.get(url, { headers: await authHeaders() })
    out.sampleMessagesStatus = resp.status
    const msgs = resp.data.value || []
    out.totalInWindowSample  = resp.data['@odata.count'] ?? msgs.length
    out.sample = msgs.map(m => ({
      id:           m.id.slice(0, 16) + '…',
      receivedAt:   m.receivedDateTime,
      toRecipients: (m.toRecipients || []).map(r => r.emailAddress?.address),
      ccRecipients: (m.ccRecipients || []).map(r => r.emailAddress?.address),
    }))
  } catch (err) {
    out.sampleMessagesStatus = err.response?.status || 0
    out.errorBody = err.response?.data || err.message
  }

  return out
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

// Fetches member lists and email counts for all configured DLs, then builds the dashboard payload including per-DL cards and a top-20 recipients leaderboard sorted by total emails.
async function getDLDashboard(window) {
  const { loadDLConfig } = require('./config')
  const dlConfigs = loadDLConfig()
  if (!dlConfigs.length) return { distribution_lists: [], top_users: [] }

  // Members first — populates proxy cache used by countEmailsForDL.
  const membersList = await Promise.all(dlConfigs.map(dl => getDLMembers(dl.email)))
  const countsList  = await Promise.all(dlConfigs.map(dl => countEmailsForDL(dl.email, window)))

  const dlCards   = []
  const userTotals = {}

  for (let i = 0; i < dlConfigs.length; i++) {
    const dlCfg    = dlConfigs[i]
    const members  = membersList[i]
    const count    = countsList[i]
    const proxy    = _proxyCache[dlCfg.email] || {}
    const { isValidDL, errorReason } = getDLValidation(dlCfg.email)

    dlCards.push({
      email:        dlCfg.email,
      name:         dlCfg.name,
      total_emails: count,
      member_count: members.length,
      proxy:        proxy.proxy || null,
      proxy_name:   proxy.proxy_name || null,
      is_valid_dl:  isValidDL,
      error_reason: errorReason,
    })

    for (const member of members) {
      const mEmail = (member.mail || '').toLowerCase()
      if (!mEmail) continue
      if (!userTotals[mEmail]) {
        const displayName = member.displayName || mEmail
        userTotals[mEmail] = {
          name:         displayName,
          email:        mEmail,
          initials:     initials(displayName),
          total_emails: 0,
          dl_breakdown: [],
        }
      }
      userTotals[mEmail].total_emails += count
      userTotals[mEmail].dl_breakdown.push({ dl_name: dlCfg.name, dl_email: dlCfg.email, count })
    }
  }

  const topUsers = Object.values(userTotals)
    .sort((a, b) => b.total_emails - a.total_emails)
    .slice(0, 20)

  return { distribution_lists: dlCards, top_users: topUsers }
}

module.exports = { getDLDashboard, getDLMembers, countEmailsForDL, debugDL, getProxyCache, getDLValidation }
