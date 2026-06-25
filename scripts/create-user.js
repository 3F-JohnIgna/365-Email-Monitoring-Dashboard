#!/usr/bin/env node
'use strict'
// Reads: email and name from CLI args, password from stdin
// Usage: echo <password> | node scripts/create-user.js <email> <name...>

const { createUser } = require('../lib/localAuth')

const [email, ...nameParts] = process.argv.slice(2)
const name = nameParts.join(' ')

if (!email || !name) {
  console.error('Usage: node scripts/create-user.js <email> <display name>')
  process.exit(1)
}

let input = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', chunk => { input += chunk })
process.stdin.on('end', () => {
  const password = input.trim()
  if (!password) {
    console.error('ERROR: No password provided via stdin.')
    process.exit(1)
  }
  try {
    const user = createUser(email, name, password)
    console.log(`User created: ${user.email}`)
    process.exit(0)
  } catch (err) {
    console.error('ERROR:', err.message)
    process.exit(1)
  }
})
