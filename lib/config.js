'use strict'
const fs     = require('fs')
const path   = require('path')
const crypto = require('crypto')

const DL_CONFIG_PATH = path.join(__dirname, '..', 'data', 'distribution_lists.json')
const MB_CONFIG_PATH = path.join(__dirname, '..', 'data', 'mailboxes.json')

// ── Config file encryption (AES-256-GCM) ──────────────────────────────────────
// Protects config files from casual plaintext editing. Key is derived from a
// fixed app constant — decryption requires the source, not a user secret.

const _CIPHER_KEY = crypto.scryptSync('DLMonitorDashboard-config', '3FoldIT-data-salt', 32)

function _encrypt(obj) {
  const iv     = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv('aes-256-gcm', _CIPHER_KEY, iv)
  const enc    = Buffer.concat([cipher.update(JSON.stringify(obj), 'utf8'), cipher.final()])
  return JSON.stringify({ iv: iv.toString('hex'), tag: cipher.getAuthTag().toString('hex'), data: enc.toString('hex') })
}

function _decrypt(raw) {
  const { iv, tag, data } = JSON.parse(raw)
  const decipher = crypto.createDecipheriv('aes-256-gcm', _CIPHER_KEY, Buffer.from(iv, 'hex'))
  decipher.setAuthTag(Buffer.from(tag, 'hex'))
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(data, 'hex')), decipher.final()]).toString('utf8'))
}

function _isEncrypted(raw) {
  try { const p = JSON.parse(raw); return !!(p && p.iv && p.tag && p.data) } catch { return false }
}

// ── DL config ─────────────────────────────────────────────────────────────────

function loadDLConfig() {
  try {
    if (fs.existsSync(DL_CONFIG_PATH)) {
      const raw = fs.readFileSync(DL_CONFIG_PATH, 'utf8')
      if (_isEncrypted(raw)) return _decrypt(raw)
      // Legacy plain JSON — re-save as encrypted immediately
      const list = JSON.parse(raw)
      saveDLConfig(list)
      return list
    }
  } catch (_) {}
  return []
}

function saveDLConfig(list) {
  fs.mkdirSync(path.dirname(DL_CONFIG_PATH), { recursive: true })
  fs.writeFileSync(DL_CONFIG_PATH, _encrypt(list), 'utf8')
}

// ── Mailbox config ────────────────────────────────────────────────────────────

function loadMailboxConfig() {
  try {
    if (fs.existsSync(MB_CONFIG_PATH)) {
      const raw = fs.readFileSync(MB_CONFIG_PATH, 'utf8')
      if (_isEncrypted(raw)) return _decrypt(raw)
      // Legacy plain JSON — re-save as encrypted immediately
      const list = JSON.parse(raw)
      saveMailboxConfig(list)
      return list
    }
  } catch (_) {}
  return []
}

function saveMailboxConfig(list) {
  fs.mkdirSync(path.dirname(MB_CONFIG_PATH), { recursive: true })
  fs.writeFileSync(MB_CONFIG_PATH, _encrypt(list), 'utf8')
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
