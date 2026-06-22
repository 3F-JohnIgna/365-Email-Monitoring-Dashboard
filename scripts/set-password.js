#!/usr/bin/env node
'use strict'
const { setSettingsPassword } = require('../lib/auth')

// Reads the password from stdin so it is never exposed as a process argument.
let input = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', chunk => { input += chunk })
process.stdin.on('end', () => {
  const password = input.trim()
  if (!password) {
    console.error('ERROR: No password provided via stdin.')
    process.exit(1)
  }
  setSettingsPassword(password)
    .then(() => {
      console.log('Settings password stored in Windows Credential Manager.')
      process.exit(0)
    })
    .catch(err => {
      console.error('ERROR: Failed to store password —', err.message)
      process.exit(1)
    })
})
