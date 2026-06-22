#!/usr/bin/env node
'use strict'

const SERVICE  = 'DLMonitorDashboard'
const ACCOUNTS = ['client_secret', 'settings_password']

async function main() {
  let kt
  try { kt = require('keytar') } catch (_) {
    console.log('Credential store unavailable — nothing to clear.')
    process.exit(0)
  }

  for (const account of ACCOUNTS) {
    await kt.deletePassword(SERVICE, account)
  }

  console.log('Previous credentials cleared.')
  process.exit(0)
}

main().catch(err => {
  console.error('ERROR:', err.message)
  process.exit(1)
})
