'use strict'
const fs     = require('fs')
const path   = require('path')
const crypto = require('crypto')
const jwt    = require('jsonwebtoken')

const USERS_PATH   = path.join(__dirname, '..', 'data', 'users.json')
const SERVICE_NAME = 'DLMonitorDashboard'
const JWT_ACCOUNT  = 'jwt_secret'

// ── Encryption (mirrors lib/config.js) ───────────────────────────────────────

const _KEY = crypto.scryptSync('DLMonitorDashboard-config', '3FoldIT-data-salt', 32)

function _encrypt(obj) {
  const iv     = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv('aes-256-gcm', _KEY, iv)
  const enc    = Buffer.concat([cipher.update(JSON.stringify(obj), 'utf8'), cipher.final()])
  return JSON.stringify({ iv: iv.toString('hex'), tag: cipher.getAuthTag().toString('hex'), data: enc.toString('hex') })
}

function _decrypt(raw) {
  const { iv, tag, data } = JSON.parse(raw)
  const decipher = crypto.createDecipheriv('aes-256-gcm', _KEY, Buffer.from(iv, 'hex'))
  decipher.setAuthTag(Buffer.from(tag, 'hex'))
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(data, 'hex')), decipher.final()]).toString('utf8'))
}

function _isEncrypted(raw) {
  try { const p = JSON.parse(raw); return !!(p && p.iv && p.tag && p.data) } catch { return false }
}

// ── User store ────────────────────────────────────────────────────────────────

function loadUsers() {
  try {
    if (fs.existsSync(USERS_PATH)) {
      const raw = fs.readFileSync(USERS_PATH, 'utf8')
      return _isEncrypted(raw) ? _decrypt(raw) : JSON.parse(raw)
    }
  } catch (_) {}
  return []
}

function saveUsers(users) {
  fs.mkdirSync(path.dirname(USERS_PATH), { recursive: true })
  fs.writeFileSync(USERS_PATH, _encrypt(users), 'utf8')
}

function hasUsers() {
  return loadUsers().length > 0
}

// ── Password hashing ──────────────────────────────────────────────────────────

function _hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

function _verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':')
  const attempt = crypto.scryptSync(password, salt, 64).toString('hex')
  return crypto.timingSafeEqual(Buffer.from(attempt, 'hex'), Buffer.from(hash, 'hex'))
}

// ── User operations ───────────────────────────────────────────────────────────

function createUser(email, name, password) {
  const users = loadUsers()
  if (users.find(u => u.email.toLowerCase() === email.toLowerCase())) {
    throw new Error(`User ${email} already exists`)
  }
  const user = {
    oid:                crypto.randomUUID(),
    email:              email.trim().toLowerCase(),
    name:               name.trim(),
    preferred_username: email.trim().toLowerCase(),
    passwordHash:       _hashPassword(password),
    createdAt:          new Date().toISOString(),
  }
  users.push(user)
  saveUsers(users)
  return { oid: user.oid, email: user.email, name: user.name }
}

function authenticateUser(email, password) {
  const users = loadUsers()
  const user  = users.find(u => u.email.toLowerCase() === email.toLowerCase())
  if (!user) return null
  try {
    if (!_verifyPassword(password, user.passwordHash)) return null
  } catch { return null }
  return {
    oid:                user.oid,
    email:              user.email,
    name:               user.name,
    preferred_username: user.preferred_username,
  }
}

// ── JWT ───────────────────────────────────────────────────────────────────────

async function _keytar() {
  try { return require('keytar') } catch (_) { return null }
}

let _cachedSecret = null

async function _getJwtSecret() {
  if (_cachedSecret) return _cachedSecret
  const kt = await _keytar()
  if (kt) {
    let secret = await kt.getPassword(SERVICE_NAME, JWT_ACCOUNT)
    if (secret) { _cachedSecret = secret.replace(/\0/g, ''); return _cachedSecret }
    secret = crypto.randomBytes(64).toString('hex')
    await kt.setPassword(SERVICE_NAME, JWT_ACCOUNT, secret)
    _cachedSecret = secret
    return _cachedSecret
  }
  // Fallback when keytar is unavailable
  _cachedSecret = crypto.scryptSync('DLMonitorDashboard-jwt', '3FoldIT-jwt-salt', 64).toString('hex')
  return _cachedSecret
}

async function signToken(user) {
  const secret = await _getJwtSecret()
  return jwt.sign(
    {
      oid:                user.oid,
      tid:                'local',
      email:              user.email,
      name:               user.name,
      preferred_username: user.preferred_username,
    },
    secret,
    { expiresIn: '8h' }
  )
}

async function verifyToken(token) {
  const secret = await _getJwtSecret()
  return jwt.verify(token, secret)
}

module.exports = { hasUsers, createUser, authenticateUser, signToken, verifyToken }
