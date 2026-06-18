'use strict'
const fs   = require('fs')
const path = require('path')

const DL_CONFIG_PATH = path.join(__dirname, '..', 'data', 'distribution_lists.json')
const MB_CONFIG_PATH = path.join(__dirname, '..', 'data', 'mailboxes.json')

// ── DL config ─────────────────────────────────────────────────────────────────

// Reads and parses the distribution lists JSON file; returns an empty array if the file is missing or unreadable.
function loadDLConfig() {
  try {
    if (fs.existsSync(DL_CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(DL_CONFIG_PATH, 'utf8'))
    }
  } catch (_) {}
  return []
}

// Writes the distribution list array to disk as formatted JSON, creating the data directory if needed.
function saveDLConfig(list) {
  fs.mkdirSync(path.dirname(DL_CONFIG_PATH), { recursive: true })
  fs.writeFileSync(DL_CONFIG_PATH, JSON.stringify(list, null, 2), 'utf8')
}

// ── Mailbox config ────────────────────────────────────────────────────────────

// Reads and parses the mailboxes JSON file; returns an empty array if the file is missing or unreadable.
function loadMailboxConfig() {
  try {
    if (fs.existsSync(MB_CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(MB_CONFIG_PATH, 'utf8'))
    }
  } catch (_) {}
  return []
}

// Writes the mailbox array to disk as formatted JSON, creating the data directory if needed.
function saveMailboxConfig(list) {
  fs.mkdirSync(path.dirname(MB_CONFIG_PATH), { recursive: true })
  fs.writeFileSync(MB_CONFIG_PATH, JSON.stringify(list, null, 2), 'utf8')
}

// ── Credentials ───────────────────────────────────────────────────────────────

const SERVICE_NAME = 'DLMonitorDashboard'
const ACCOUNT_NAME = 'client_secret'

// Attempts to load the keytar module (Windows Credential Manager); returns null if unavailable.
async function _keytar() {
  try { return require('keytar') } catch (_) { return null }
}

// Persists tenant ID and client ID to the .env file and stores the client secret in Windows Credential Manager (falling back to .env if keytar is unavailable).
async function saveCredentials(tenantId, clientId, clientSecret) {
  // TENANT_ID and CLIENT_ID are persisted to the .env file at runtime so they
  // survive server restarts without requiring the user to re-enter them.
  const envPath = path.join(__dirname, '..', '.env')
  let envText   = ''
  try { envText = fs.readFileSync(envPath, 'utf8') } catch (_) {}

  envText = _upsertEnvLine(envText, 'TENANT_ID', tenantId || '')
  envText = _upsertEnvLine(envText, 'CLIENT_ID', clientId || '')
  fs.writeFileSync(envPath, envText, 'utf8')

  // Refresh process.env so the live process picks up the change immediately.
  if (tenantId)  process.env.TENANT_ID  = tenantId
  if (clientId)  process.env.CLIENT_ID  = clientId

  // CLIENT_SECRET goes to Windows Credential Manager (or falls back to .env).
  if (clientSecret) {
    const kt = await _keytar()
    if (kt) {
      await kt.setPassword(SERVICE_NAME, ACCOUNT_NAME, clientSecret)
    } else {
      envText = _upsertEnvLine(envText, 'CLIENT_SECRET', clientSecret)
      fs.writeFileSync(envPath, envText, 'utf8')
      process.env.CLIENT_SECRET = clientSecret
    }
  }
}

// Retrieves the client secret from Windows Credential Manager, stripping null bytes that keytar can introduce on Windows; falls back to the CLIENT_SECRET env var.
async function getClientSecret() {
  const kt = await _keytar()
  if (kt) {
    const stored = await kt.getPassword(SERVICE_NAME, ACCOUNT_NAME)
    // Strip null bytes — keytar on Windows can return UTF-16 LE bytes as individual chars
    if (stored) return stored.replace(/\0/g, '')
  }
  return process.env.CLIENT_SECRET || null
}

// Returns tenant ID and client ID from env vars along with a boolean indicating whether a secret is stored; the secret itself is never returned.
function getAllCredentials() {
  return {
    tenant_id: process.env.TENANT_ID  || '',
    client_id: process.env.CLIENT_ID  || '',
    // Never return the secret — only indicate whether one is stored.
    has_secret: !!(process.env.CLIENT_SECRET),
  }
}

// Returns tenant ID, client ID, and the actual client secret for internal server-side use only.
async function getCredentials() {
  return {
    tenantId:     process.env.TENANT_ID  || '',
    clientId:     process.env.CLIENT_ID  || '',
    clientSecret: await getClientSecret(),
  }
}

// Inserts or replaces a KEY=VALUE line in a .env file string, appending a newline if the key is not already present.
function _upsertEnvLine(text, key, value) {
  const re  = new RegExp(`^${key}=.*$`, 'm')
  const line = `${key}=${value}`
  return re.test(text) ? text.replace(re, line) : text + (text.endsWith('\n') ? '' : '\n') + line + '\n'
}

module.exports = {
  loadDLConfig, saveDLConfig,
  loadMailboxConfig, saveMailboxConfig,
  saveCredentials, getCredentials, getAllCredentials,
}
