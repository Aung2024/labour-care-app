'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const {
  aggregateContributions,
  cacheKey,
  contributionId,
  candidateMonths,
  buildV4Contribution,
  UNDATED_MONTH
} = require('../src/analytics/v4-service')

const contribution = (patientId, month, dates) => ({
  patientId,
  month,
  dailyMetrics: dates.map((date) => ({
    date,
    metrics: {
      registration: { total: 1 },
      anc: { clients: 1, services: 2 },
      referral: { maternal: { total: 1, byStage: { ANC: 1 } } }
    }
  }))
})

test('range reduction unions unique patients but sums dated services', () => {
  const result = aggregateContributions([
    contribution('patient-1', '2026-01', ['2026-01-01', '2026-01-15']),
    contribution('patient-1', '2026-02', ['2026-02-01']),
    contribution('patient-2', '2026-02', ['2026-02-10'])
  ], '2026-01-10', '2026-02-10')
  assert.equal(result.registration.total, 2)
  assert.equal(result.anc.clients, 2)
  assert.equal(result.anc.services, 6)
  assert.equal(result.referral.maternal.total, 2)
  assert.equal(result.referral.maternal.byStage.ANC, 2)
})

test('cache keys include exact range and authorized scope inputs', () => {
  const first = cacheKey({
    scope: { scopeTownship: 'Pyinmana' },
    startDate: '2026-01-01',
    endDate: '2026-01-31',
    facilityTypes: ['rhc']
  })
  const second = cacheKey({
    scope: { scopeTownship: 'Pyinmana' },
    startDate: '2026-02-01',
    endDate: '2026-02-28',
    facilityTypes: ['rhc']
  })
  assert.match(first, /^[a-f0-9]{64}$/)
  assert.notEqual(first, second)
  assert.equal(contributionId('2026-01', 'patient/1'), '2026-01_patient%2F1')
})

test('candidate months include dates inside normalized activity entries', () => {
  assert.deepEqual(candidateMonths({
    profile: { registration_date: '2025-01-15' },
    antenatalVisits: [
      { id: 'anc-1', data: { visitDate: '2025-02-02' } },
      { id: 'anc-2', data: { otherVisits: [{ visitDate: '2025-03-03' }] } }
    ],
    postpartumVisits: [
      { id: 'pnc-1', data: { visitDate: '2025-04-04' } }
    ],
    hrtActions: [
      { id: 'hrt-1', data: { recordedAt: '2025-05-05' } }
    ],
    deliveryNotes: {
      data: {
        deliveryDetails: { deliveredDateTime: '2025-06-06T10:00:00+06:30' }
      }
    }
  }), ['2025-01', '2025-02', '2025-03', '2025-04', '2025-05', '2025-06'])
})

test('undated registrations are included only in all-time aggregation', () => {
  const undated = buildV4Contribution({
    id: 'undated-baby',
    profile: { patient_type: 'baby' },
    antenatalVisits: [],
    postpartumVisits: [],
    newbornVisits: [],
    immediateNewbornCare: [],
    hrtActions: [],
    kmcActions: [],
    scope: {}
  }, UNDATED_MONTH)

  const monthResult = aggregateContributions(
    [undated],
    '2025-01-01',
    '2026-10-29'
  )
  assert.equal(monthResult.registration ? monthResult.registration.total : 0, 0)
  assert.equal(
    aggregateContributions(
      [undated],
      '2025-01-01',
      '2026-10-29',
      { includeUndated: true }
    ).registration.babies,
    1
  )
})
