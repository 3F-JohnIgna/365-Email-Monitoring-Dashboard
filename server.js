'use strict'
require('dotenv').config()

const express      = require('express')
const path         = require('path')
const cookieParser = require('cookie-parser')
const {
  getAllCredentials, getCredentials, saveCredentials,
  loadDLConfig, saveDLConfig,
  loadMailboxConfig, saveMailboxConfig,
} = require('./lib/config')
const { clearTokenCache } = require('./lib/graph')
const { hasSettingsPassword, verifySettingsPassword } = require('./lib/auth')
const { hasUsers, authenticateUser, signToken, verifyToken } = require('./lib/localAuth')
const {
  getDLDashboard, getProxyCache, debugDL, getDLValidation,
} = require('./lib/dlGraph')
const { getMailboxSummary, getMailboxDetail } = require('./lib/mailboxGraph')

const app  = express()
const PORT = process.env.PORT || 3000

app.use(express.json())
app.use(cookieParser())

const VALID_WINDOWS = new Set(['24h', '3d', '7d'])

// ── Auth middleware ───────────────────────────────────────────────────────────

async function requireAuth(req, res, next) {
  const token = req.cookies?.auth_token
  if (!token) return res.status(401).json({ error: 'Unauthorized' })
  try {
    req.user = await verifyToken(token)
    next()
  } catch {
    res.status(401).json({ error: 'Unauthorized' })
  }
}

// ── Auth routes ───────────────────────────────────────────────────────────────

// Returns whether any users have been created yet.
app.get('/auth/setup-status', (_req, res) => {
  res.json({ hasUsers: hasUsers() })
})

// Authenticates a user and issues a signed JWT in an httpOnly cookie.
app.post('/auth/login', async (req, res) => {
  const { email, password } = req.body
  if (!email || !password) return res.status(400).json({ error: 'Email and password required.' })
  const user = authenticateUser(email, password)
  if (!user) return res.status(401).json({ error: 'Invalid email or password.' })
  const token = await signToken(user)
  res.cookie('auth_token', token, {
    httpOnly: true,
    sameSite: 'strict',
    maxAge:   8 * 60 * 60 * 1000,
  })
  res.json({ ok: true, user: { email: user.email, name: user.name, oid: user.oid } })
})

// Clears the auth cookie.
app.post('/auth/logout', (_req, res) => {
  res.clearCookie('auth_token', { httpOnly: true, sameSite: 'strict' })
  res.json({ ok: true })
})

// Returns the current user from the JWT; used by the frontend to restore session on page load.
app.get('/auth/me', async (req, res) => {
  const token = req.cookies?.auth_token
  if (!token) return res.status(401).json({ error: 'Unauthorized' })
  try {
    const user = await verifyToken(token)
    res.json({ email: user.email, name: user.name, oid: user.oid })
  } catch {
    res.status(401).json({ error: 'Unauthorized' })
  }
})

// ── Protect all /api/* routes ─────────────────────────────────────────────────
app.use('/api', requireAuth)

// ── API routes ────────────────────────────────────────────────────────────────

// Returns aggregated DL dashboard data (email counts, member lists, top recipients) for the given time window.
app.get('/api/dl-dashboard', async (req, res) => {
  const window = req.query.window || '24h'
  if (!VALID_WINDOWS.has(window)) return res.status(400).json({ error: 'window must be 24h, 3d, or 7d' })
  try {
    res.json(await getDLDashboard(window))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Returns the saved distribution list config enriched with proxy and validation info from the in-memory cache.
app.get('/api/config/distribution-lists', async (_req, res) => {
  const dlList  = loadDLConfig()
  const proxies = getProxyCache()
  const result  = dlList.map(dl => {
    const p = proxies[dl.email] || {}
    const v = getDLValidation(dl.email)
    return { ...dl, proxy: p.proxy || null, proxy_name: p.proxy_name || null, is_valid_dl: v.isValidDL, error_reason: v.errorReason }
  })
  res.json(result)
})

// Saves the distribution list config, deduplicating entries by email (case-insensitive).
app.put('/api/config/distribution-lists', (req, res) => {
  const raw = Array.isArray(req.body) ? req.body : []
  const entries = raw
    .map(d => ({ email: (d.email || '').trim(), name: (d.name || '').trim() }))
    .filter(d => d.email)
  const seen   = new Set()
  const deduped = []
  for (const e of entries) {
    const key = e.email.toLowerCase()
    if (!seen.has(key)) { seen.add(key); deduped.push(e) }
  }
  saveDLConfig(deduped)
  res.json(deduped)
})

// Returns the in-memory proxy cache mapping each DL email to its resolved proxy member.
app.get('/api/dl-proxies', (_req, res) => {
  res.json(getProxyCache())
})

// Returns raw debug info for a single DL: group validation result, proxy, and a sample of 10 recent messages.
app.get('/api/debug/dl/*', async (req, res) => {
  const dlEmail = req.params[0]
  const window  = req.query.window || '24h'
  if (!VALID_WINDOWS.has(window)) return res.status(400).json({ error: 'window must be 24h, 3d, or 7d' })
  try {
    res.json(await debugDL(dlEmail, window))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Returns whether a settings password has been configured (does not reveal the value).
app.get('/api/auth/settings-password-status', async (_req, res) => {
  const configured = await hasSettingsPassword()
  res.json({ configured })
})

// Verifies the settings admin password against the hash in Windows Credential Manager.
app.post('/api/auth/verify-settings-password', async (req, res) => {
  const { password } = req.body
  if (!password) return res.status(400).json({ ok: false })
  const ok = await verifySettingsPassword(password)
  res.json({ ok })
})

// Returns the stored Azure credentials (tenant ID and client ID only; never returns the secret).
app.get('/api/config/credentials', (_req, res) => {
  res.json(getAllCredentials())
})

// Saves new Azure credentials and clears the cached token so subsequent requests use the updated values.
app.put('/api/config/credentials', async (req, res) => {
  const { tenant_id, client_id, client_secret } = req.body
  try {
    await saveCredentials(
      (tenant_id    || '').trim(),
      (client_id    || '').trim(),
      (client_secret || '').trim() || null,
    )
    clearTokenCache()
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── Mailbox routes ────────────────────────────────────────────────────────────

// Returns summary data for all configured shared mailboxes (inbound/outbound counts, load level, sparkline, staff).
app.get('/api/mailboxes', async (req, res) => {
  const window = req.query.window || '24h'
  if (!VALID_WINDOWS.has(window)) return res.status(400).json({ error: 'window must be 24h, 3d, or 7d' })
  const mailboxes = loadMailboxConfig()
  if (!mailboxes.length) return res.json([])
  try {
    const summaries = await Promise.all(
      mailboxes.map(mb =>
        getMailboxSummary(mb.email, mb.name, window)
          .catch(err => ({ email: mb.email, name: mb.name, error: err.message }))
      )
    )
    res.json(summaries)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Returns detailed data for a single mailbox including hourly chart, full staff roster, and oldest unread emails today.
app.get('/api/mailboxes/:email/detail', async (req, res) => {
  const window = req.query.window || '24h'
  if (!VALID_WINDOWS.has(window)) return res.status(400).json({ error: 'window must be 24h, 3d, or 7d' })
  const mailboxEmail = req.params.email
  const mailboxes    = loadMailboxConfig()
  const mb = mailboxes.find(m => m.email.toLowerCase() === mailboxEmail.toLowerCase())
  if (!mb) return res.status(404).json({ error: 'Mailbox not found in config' })
  try {
    res.json(await getMailboxDetail(mb.email, mb.name, window))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Returns the saved mailbox config as a JSON array of { email, name } objects.
app.get('/api/config/mailboxes', (_req, res) => {
  res.json(loadMailboxConfig())
})

// Saves the mailbox config, deduplicating entries by email (case-insensitive).
app.put('/api/config/mailboxes', (req, res) => {
  const raw = Array.isArray(req.body) ? req.body : []
  const entries = raw
    .map(m => ({ email: (m.email || '').trim(), name: (m.name || '').trim() }))
    .filter(m => m.email)
  const seen    = new Set()
  const deduped = []
  for (const e of entries) {
    const key = e.email.toLowerCase()
    if (!seen.has(key)) { seen.add(key); deduped.push(e) }
  }
  saveMailboxConfig(deduped)
  res.json(deduped)
})

// ── Static frontend (production build) ───────────────────────────────────────

app.use(express.static(path.join(__dirname, 'public')))

// Falls back to index.html for all unmatched routes so the React SPA handles client-side routing.
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'))
})

// ── Start ─────────────────────────────────────────────────────────────────────

// Starts the HTTP server and logs a credential sanity-check so misconfiguration is immediately visible.
app.listen(PORT, async () => {
  const { getCredentials } = require('./lib/config')
  const c = await getCredentials()
  console.log(`DL Monitor Dashboard running on http://localhost:${PORT}`)
  console.log(`  tenantId:     ${c.tenantId     ? c.tenantId.slice(0,8)+'...'  : 'MISSING'}`)
  console.log(`  clientId:     ${c.clientId     ? c.clientId.slice(0,8)+'...'  : 'MISSING'}`)
  console.log(`  clientSecret: ${c.clientSecret ? '(length '+c.clientSecret.length+')' : 'MISSING'}`)
})
