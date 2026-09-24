'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const {
  COMPATIBILITY_QUEUES,
  queuedPatientsFromSnapshots,
  periodsForLoadedPatient
} = require('../src/analytics/refresh-queue-functions')
const {
  RECONCILIATION_INTERVAL_MS,
  RECONCILIATION_BATCH_SIZE,
  RECONCILIATION_CONCURRENCY,
  shouldStartReconciliation,
  mapWithConcurrency
} = require('../src/analytics/v3-functions')
const {
  RECONCILIATION_JOB_COLLECTION_V31,
  shouldStartReconciliationV31
} = require('../src/analytics/v31-functions')
const {
  RECONCILIATION_JOB_COLLECTION_V32,
  shouldStartReconciliationV32
} = require('../src/analytics/v32-functions')

const queuedDoc = (id, patientId) => ({
  id,
  ref: { path: `queue/${id}` },
  get: (field) => field === 'patientId' ? patientId : undefined
})

test('unified queue deduplicates patients across migration queue collections', () => {
  assert.deepEqual(COMPATIBILITY_QUEUES, [
    'clinical_refresh_v1_queue',
    'tracking_v2_refresh_queue',
    'leaderboard_v3_refresh_queue'
  ])
  const patients = queuedPatientsFromSnapshots([
    { docs: [queuedDoc('patient-1')] },
    { docs: [queuedDoc('patient-1'), queuedDoc('legacy-id', 'patient-2')] },
    { docs: [queuedDoc('patient-1')] }
  ])
  assert.equal(patients.size, 2)
  assert.equal(patients.get('patient-1').length, 3)
  assert.equal(patients.get('patient-2').length, 1)
  assert.deepEqual(
    patients.get('patient-1').map((source) => source.collection),
    COMPATIBILITY_QUEUES
  )
})

test('unified refresh periods include all, month, and year from loaded activity', () => {
  const periods = periodsForLoadedPatient({
    patient: { created_at: '2026-07-31T17:30:00.000Z' },
    activity: {
      ancVisits: [{ visitDate: '2026-09-01T00:00:00+06:30' }]
    }
  }, new Date('2026-09-01T00:00:00Z'))
  assert.deepEqual(periods.sort(), ['2026', '2026-08', '2026-09', 'all'])
})

test('reconciliation starts only when due and never overlaps a running generation', () => {
  const now = Date.parse('2026-09-23T00:00:00Z')
  assert.equal(shouldStartReconciliation(null, now), true)
  assert.equal(shouldStartReconciliation({ status: 'running' }, now), false)
  assert.equal(shouldStartReconciliation({
    status: 'complete',
    lastCompletedAtMillis: now - RECONCILIATION_INTERVAL_MS + 1
  }, now), false)
  assert.equal(shouldStartReconciliation({
    status: 'complete',
    lastCompletedAtMillis: now - RECONCILIATION_INTERVAL_MS
  }, now), true)
})

test('reconciliation bounds shared-summary transaction contention', () => {
  assert.equal(RECONCILIATION_BATCH_SIZE, 25)
  assert.equal(RECONCILIATION_CONCURRENCY, 1)
})

test('reconciliation concurrency helper processes scalable chunks', async () => {
  let active = 0
  let maximumActive = 0
  const values = Array.from({ length: 27 }, (_, index) => index)
  const results = await mapWithConcurrency(values, 10, async (value) => {
    active += 1
    maximumActive = Math.max(maximumActive, active)
    await new Promise((resolve) => setImmediate(resolve))
    active -= 1
    return value * 2
  })
  assert.equal(results.length, 27)
  assert.equal(maximumActive, 10)
  assert.equal(results[26], 52)
})

test('v3.1 reconciliation uses an independent 48-hour generation', () => {
  const now = Date.parse('2026-09-24T00:00:00Z')
  assert.equal(RECONCILIATION_JOB_COLLECTION_V31, 'analytics_v31_jobs')
  assert.equal(shouldStartReconciliationV31(null, now), true)
  assert.equal(shouldStartReconciliationV31({ status: 'running' }, now), false)
  assert.equal(shouldStartReconciliationV31({
    status: 'complete',
    lastCompletedAtMillis: now - RECONCILIATION_INTERVAL_MS
  }, now), true)
})

test('v3.2 reconciliation uses an independent 48-hour generation', () => {
  const now = Date.parse('2026-09-24T00:00:00Z')
  assert.equal(RECONCILIATION_JOB_COLLECTION_V32, 'analytics_v32_jobs')
  assert.equal(shouldStartReconciliationV32(null, now), true)
  assert.equal(shouldStartReconciliationV32({ status: 'running' }, now), false)
  assert.equal(shouldStartReconciliationV32({
    status: 'complete',
    lastCompletedAtMillis: now - RECONCILIATION_INTERVAL_MS
  }, now), true)
})
