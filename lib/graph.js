'use strict'
const { ConfidentialClientApplication } = require('@azure/msal-node')
const { DateTime } = require('luxon')
const { getCredentials } = require('./config')

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0'

const _tokenCache = { token: null, expires: null }
let   _msalApp    = null

// Creates or reuses a ConfidentialClientApplication instance, re-creating it if the tenant or client ID has changed since the last call.
async function _getMsalApp() {
  const { tenantId, clientId, clientSecret } = await getCredentials()
  if (!tenantId || !clientId || !clientSecret) {
    throw new Error('Azure credentials are not configured. Open Settings to add them.')
  }
  // Re-create if credentials changed.
  if (
    !_msalApp ||
    _msalApp._tenantId !== tenantId ||
    _msalApp._clientId !== clientId
  ) {
    _msalApp = new ConfidentialClientApplication({
      auth: {
        clientId,
        authority: `https://login.microsoftonline.com/${tenantId}`,
        clientSecret,
      },
    })
    _msalApp._tenantId = tenantId
    _msalApp._clientId = clientId
    _tokenCache.token   = null
    _tokenCache.expires = null
  }
  return _msalApp
}

// Returns a valid Bearer token for Microsoft Graph, acquiring a new one via client credentials flow when the cached token is missing or within 60 seconds of expiry.
async function getToken() {
  if (_tokenCache.token && _tokenCache.expires && Date.now() < _tokenCache.expires) {
    return _tokenCache.token
  }
  const app    = await _getMsalApp()
  const result = await app.acquireTokenByClientCredential({
    scopes: ['https://graph.microsoft.com/.default'],
  })
  _tokenCache.token   = result.accessToken
  _tokenCache.expires = result.expiresOn ? result.expiresOn.getTime() - 60_000 : Date.now() + 3_500_000
  return _tokenCache.token
}

// Clears the in-memory token and MSAL app instance so the next request acquires fresh credentials; called whenever credentials are updated.
function clearTokenCache() {
  _tokenCache.token   = null
  _tokenCache.expires = null
  _msalApp            = null
}

// Returns an Authorization header object containing a valid Bearer token for use in Graph API requests.
async function authHeaders() {
  const token = await getToken()
  return { Authorization: `Bearer ${token}` }
}

// Converts a time window string ('24h', '3d', or '7d') to the UTC ISO start-of-day timestamp in the America/Chicago timezone.
function windowStart(window) {
  const offsets = { '24h': 0, '3d': 2, '7d': 6 }
  return DateTime.now()
    .setZone('America/Chicago')
    .startOf('day')
    .minus({ days: offsets[window] ?? 0 })
    .toUTC()
    .toISO({ suppressMilliseconds: true })
    .replace('+00:00', 'Z')
}

// Derives two-character uppercase initials from a display name (first + last initial, or first two characters for single-word names).
function initials(name) {
  const parts = (name || '').trim().split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  return (name || '??').slice(0, 2).toUpperCase()
}

module.exports = { GRAPH_BASE, getToken, clearTokenCache, authHeaders, windowStart, initials }
