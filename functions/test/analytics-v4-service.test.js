'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const {
  aggregateContributions,
  cacheKey,
  contributionId
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
