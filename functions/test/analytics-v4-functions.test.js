'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const {
  validateInput,
  allowedScope,
  contributionMatches,
  buildResult,
  processDashboardV4BackfillBatch,
  processDashboardV4DailyRefreshBatch
} = require('../src/analytics/v4-functions')

test('v4 callable validates exact inclusive date ranges and filters', () => {
  const input = validateInput({
    startDate: '2026-01-01',
    endDate: '2026-01-31',
    department: 'doph',
    facilityTypes: ['rhc']
  })
  assert.equal(input.startDate, '2026-01-01')
  assert.equal(input.periodMode, 'months')
  assert.equal(
    validateInput({
      periodMode: 'all_time',
      startDate: '1970-01-01',
      endDate: '2026-10-29'
    }).periodMode,
    'all_time'
  )
  assert.throws(() => validateInput({
    startDate: '2026-02-01',
    endDate: '2026-01-31'
  }), /startDate/)
  assert.throws(() => validateInput({
    startDate: '2026-01-01',
    endDate: '2026-01-31',
    department: 'invalid'
  }), /Unsupported department/)
})

test('role scope is derived from the authenticated profile', () => {
  assert.deepEqual(
    allowedScope({ role: 'midwife', uid: 'mw-1' }, { region: 'Other' }),
    { scopeProviderId: 'mw-1' }
  )
  assert.deepEqual(
    allowedScope({ role: 'tmo', township: 'Pyinmana' }, { township: 'Other' }),
    { scopeTownship: 'Pyinmana' }
  )
  assert.deepEqual(
    allowedScope({ role: 'regional officer', region: 'Nay Pyi Taw' }, {}),
    { scopeRegion: 'Nay Pyi Taw' }
  )
  assert.deepEqual(
    allowedScope(
      { role: 'regional officer', region: 'Nay Pyi Taw' },
      { township: 'Pyinmana' }
    ),
    { scopeRegion: 'Nay Pyi Taw', scopeTownship: 'Pyinmana' }
  )
})

test('contribution filters cannot widen a role scope', () => {
  assert.equal(
    contributionMatches(
      { scopeTownship: 'Pyinmana', scopeDepartment: 'doph', scopeFacilityType: 'rhc' },
      { scopeTownship: 'Pyinmana' },
      { department: 'doph', facilityTypes: ['rhc'], facilityCode: '' }
    ),
    true
  )
  assert.equal(
    contributionMatches(
      { scopeTownship: 'Tatkon', scopeDepartment: 'doph', scopeFacilityType: 'rhc' },
      { scopeTownship: 'Pyinmana' },
      { department: 'doph', facilityTypes: ['rhc'], facilityCode: '' }
    ),
    false
  )
  assert.equal(
    contributionMatches(
      { scopeRegion: 'Nay  Pyi  Taw', scopeTownship: ' PYINMANA ' },
      { scopeRegion: 'nay pyi taw', scopeTownship: 'Pyinmana' },
      { department: '', facilityTypes: [], facilityCode: '' }
    ),
    true
  )
})

test('v4 backfill completes an empty job without touching patient records', async () => {
  const writes = []
  const jobRef = {
    async get() {
      return {
        exists: true,
        data() {
          return { status: 'running' }
        },
        get(field) {
          return field === 'status' ? 'running' : null
        }
      }
    },
    async set(value) {
      writes.push(value)
    }
  }
  const database = {
    collection(name) {
      if (name === 'analytics_v4_jobs') {
        return { doc: () => jobRef }
      }
      if (name === 'patients') {
        return {
          orderBy: () => ({
            limit: () => ({
              async get() {
                return { empty: true, docs: [] }
              }
            })
          })
        }
      }
      throw new Error(`Unexpected collection: ${name}`)
    }
  }

  const result = await processDashboardV4BackfillBatch(database)

  assert.deepEqual(result, { status: 'complete', processed: 0 })
  assert.deepEqual(writes, [{
    status: 'complete',
    completedAt: writes[0].completedAt,
    updatedAt: writes[0].updatedAt
  }])
})

test('daily v4 refresh is idle without queued clinical changes', async () => {
  const database = {
    collection(name) {
      assert.equal(name, 'dashboard_v4_refresh_queue')
      return {
        orderBy: () => ({
          limit: () => ({
            async get() {
              return { empty: true, docs: [] }
            }
          })
        })
      }
    }
  }

  assert.deepEqual(
    await processDashboardV4DailyRefreshBatch(database),
    { status: 'idle', processed: 0, failed: 0 }
  )
})

test('all-time result aggregation includes undated registration contributions', () => {
  const result = buildResult({
    periodMode: 'all_time',
    startDate: '2025-01-01',
    endDate: '2026-10-29',
    allowedModes: ['month']
  }, [{
    patientId: 'undated-baby',
    month: 'undated',
    dailyMetrics: [{
      date: null,
      metrics: { registration: { total: 1, babies: 1 } }
    }]
  }], {})

  assert.equal(result.metrics.registration.total, 1)
  assert.equal(result.metrics.registration.babies, 1)
})
