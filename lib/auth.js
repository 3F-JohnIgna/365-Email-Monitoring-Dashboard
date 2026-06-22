'use strict'
const crypto = require('crypto')

const SERVICE_NAME = 'DLMonitorDashboard'
const PW_ACCOUNT   = 'settings_password'

async function _keytar() {
  try { return require('keytar') } catch (_) { return null }
}

function _hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

function _verifyHash(password, stored) {
  const [salt, hash] = stored.split(':')
  const attempt = crypto.scryptSync(password, salt, 64).toString('hex')
  return crypto.timingSafeEqual(Buffer.from(attempt, 'hex'), Buffer.from(hash, 'hex'))
}

async function hasSettingsPassword() {
  const kt = await _keytar()
  if (!kt) return false
  const stored = await kt.getPassword(SERVICE_NAME, PW_ACCOUNT)
  return !!(stored && stored.replace(/\0/g, ''))
}

async function setSettingsPassword(password) {
  const kt = await _keytar()
  if (!kt) throw new Error('keytar unavailable — Windows Credential Manager is required')
  await kt.setPassword(SERVICE_NAME, PW_ACCOUNT, _hashPassword(password))
}

async function verifySettingsPassword(password) {
  const kt = await _keytar()
  if (!kt) return false
  const stored = await kt.getPassword(SERVICE_NAME, PW_ACCOUNT)
  if (!stored) return false
  try {
    return _verifyHash(password, stored.replace(/\0/g, ''))
  } catch {
    return false
  }
}

module.exports = { hasSettingsPassword, setSettingsPassword, verifySettingsPassword }
