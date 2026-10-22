const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8')
const home = read('home.html')
const list = read('list.html')
const firebase = read('js/firebase.js')

test('Firestore exposes explicit cache-first behavior without changing ordinary reads', () => {
  assert.match(firebase, /cacheFirst = false/)
  assert.match(firebase, /if \(cacheFirst \|\| \(preferCache && isIOSDetected\)\)/)
  assert.match(firebase, /_smartQuerySource/)
})

test('Home uses cached roster data and exposes a retry state for delayed totals', () => {
  assert.match(home, /id="patientStatsStatus"/)
  assert.match(home, /id="patientStatsRetryButton"/)
  assert.match(home, /cacheFirst: true/)
  assert.match(home, /patientStatsRefreshPromise/)
  assert.match(home, /loadPatientStats\(\{ force: true \}\)/)
})

test('Patient List has a page deadline, retry action, deduplication, and resume recovery', () => {
  assert.match(list, /id="retryPatientLoadButton"/)
  assert.match(list, /Patient list loading exceeded the page deadline/)
  assert.match(list, /patientLoadPromise/)
  assert.match(list, /window\.addEventListener\('pageshow'/)
  assert.match(list, /document\.addEventListener\('visibilitychange'/)
  assert.match(list, /cacheFirst: true/)
})
