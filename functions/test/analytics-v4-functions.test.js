'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const {
  validateInput,
  allowedScope,
  contributionMatches,
  processDashboardV4BackfillBatch
} = require('../src/analytics/v4-functions')

test('v4 callable validates exact inclusive date ranges and filters', () => {
  const input = validateInput({
    startDate: '2026-01-01',
    endDate: '2026-01-31',
    department: 'doph',
    facilityTypes: ['rhc']
  })
  assert.equal(input.startDate, '2026-01-01')
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
