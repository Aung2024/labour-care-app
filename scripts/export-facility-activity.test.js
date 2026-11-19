'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const {
  latestDateFromData,
  getFacilityActivity,
  buildRows,
} = require('./export-facility-activity')

const entry = (id, data) => ({ id, data })

test('latest activity prefers audit/update timestamps and supports Firestore-like timestamps', () => {
  const firestoreTimestamp = { toDate: () => new Date('2026-11-10T10:00:00Z') }
  assert.equal(
    latestDateFromData({
      visitDate: '2026-11-15',
      updatedAt: firestoreTimestamp,
    }).toISOString(),
    '2026-11-10T10:00:00.000Z',
  )
})

test('facility activity includes linked newborn activity and preserves inactive facilities', () => {
  const data = {
    patients: new Map([[
      'mother-1',
      { facilityCode: '006', data: { createdAt: '2026-01-01T00:00:00Z' } },
    ]]),
    linkedBabyIds: new Map([['mother-1', new Set(['baby-1'])]]),
    antenatalVisits: new Map(),
    postpartumVisits: new Map(),
    tests: new Map(),
    records: new Map(),
    labourCare: new Map(),
    newbornCare: new Map([
      ['baby-1', [entry('newborn-1', { updatedAt: '2026-11-12T00:00:00Z' })]],
    ]),
    immediateNewbornCare: new Map(),
    kmcActions: new Map(),
  }

  const rows = buildRows(getFacilityActivity(data), new Date('2026-11-15T00:00:00Z'))
  const active = rows.find((row) => row.facilityCode === '006')
  const inactive = rows.find((row) => row.facilityCode === '007')

  assert.equal(active.latestActivity, '2026-11-12T00:00:00.000Z')
  assert.equal(active.activitySource, 'Linked newborn care')
  assert.equal(active.status, 'Active (last 30 days)')
  assert.equal(inactive.latestActivity, '')
  assert.equal(inactive.status, 'No recorded activity')
})
