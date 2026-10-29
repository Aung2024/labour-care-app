'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const {
  calculateV4Metrics,
  externalAncVisits,
  normalizePeriod,
  deliveryRecord
} = require('../src/analytics/v4-metrics')

const facts = (overrides = {}) => ({
  id: 'mother-1',
  profile: {
    patient_type: 'mother',
    registration_date: '2026-01-01',
    serviceClosure: { status: 'closed', outcome: 'service_complete', closedAt: '2026-01-20' }
  },
  antenatalVisits: [
    { id: 'a1', visitDate: '2026-01-02', visitNumber: 1, tetanusToxoid: 'TD1' },
    { id: 'a2', visitDate: '2026-01-05', visitNumber: 2, tetanusToxoid: 'TD2' },
    { id: 'a3', visitDate: '2026-01-10', visitNumber: 3, otherVisits: [
      { visitDate: '2026-01-08', facilityType: 'Public', facilityName: 'RHC' }
    ] },
    { id: 'a4', visitDate: '2026-01-15', visitNumber: 4, tetanusToxoid: 'Completed' }
  ],
  postpartumVisits: [
    { id: 'p1', visitDate: '2026-01-21', visitNumber: 1, ironFolic: true }
  ],
  deliveryNotes: {
    deliveryDetails: {
      deliveryDate: '2026-01-19',
      birthPlace: 'home',
      birthProvider: 'self',
      babies: [{ babyIndex: 1, birthWeightGram: 1800, gestationalWeek: 36, outcome: 'alive' }]
    }
  },
  hrtActions: [{ type: 'resolved', completionReason: 'delivered_safely', recordedAt: '2026-01-18' }],
  newbornVisits: [
    { visitDate: '2026-01-20', babies: [{
      babyIndex: 1, body_weight_gram: 1800, kmc_selected: 'yes', visitNumber: 1
    }] },
    { visitDate: '2026-01-25', babies: [{
      babyIndex: 1, current_weight_gram: 1950, kmc_selected: 'yes', visitNumber: 2
    }] }
  ],
  kmcActions: [{ babyIndex: 1, type: 'kmc_resolved', recordedAt: '2026-01-30' }],
  transferRecord: null,
  scope: {},
  ...overrides
})

test('normalizes an inclusive Yangon date range', () => {
  assert.deepEqual(normalizePeriod({ startDate: '2026-01-01', endDate: '2026-01-31' }), {
    start: '2026-01-01',
    end: '2026-01-31'
  })
  assert.throws(() => normalizePeriod({ startDate: '2026-02-01', endDate: '2026-01-31' }))
})

test('deduplicates copied external ANC visits', () => {
  const visits = externalAncVisits([
    { otherVisits: [{ visitDate: '2026-01-08', facilityType: 'Public', facilityName: 'RHC' }] },
    { otherVisits: [{ visitDate: '2026-01-08', facilityType: 'Public', facilityName: 'RHC' }] }
  ])
  assert.equal(visits.length, 1)
})

test('early ANC supports LMP and legacy gestational-age fields', () => {
  const metrics = calculateV4Metrics(facts({
    profile: {
      patient_type: 'mother',
      registration_date: '2026-01-01',
      lmp: '2025-12-01',
      lmpStatus: 'known'
    },
    antenatalVisits: [{
      visitDate: '2025-12-20',
      gestational_age: 3
    }]
  }), { startDate: '2025-12-01', endDate: '2025-12-31' })
  assert.equal(metrics.anc.early, 1)
})

test('newborn birth-time aliases identify newborn clients', () => {
  const metrics = calculateV4Metrics(facts({
    newbornVisits: [{ birth_time: '2026-01-20T10:00:00+06:30' }]
  }), { startDate: '2026-01-01', endDate: '2026-01-31' })
  assert.equal(metrics.newborn.clients, 1)
})

test('calculates the v4 clinical contract from normalized patient facts', () => {
  const metrics = calculateV4Metrics(facts(), {
    startDate: '2026-01-01',
    endDate: '2026-01-31'
  })
  assert.equal(metrics.anc.clients, 1)
  assert.equal(metrics.anc.services, 5)
  assert.equal(metrics.anc.atLeast4, 1)
  assert.equal(metrics.anc.td.protected, 1)
  assert.equal(metrics.highRisk.completion.completed, 1)
  assert.equal(metrics.delivery.homeSba, 1)
  assert.equal(metrics.delivery.institutional, 0)
  assert.equal(metrics.newborn.preterm, 1)
  assert.equal(metrics.newborn.lowBirthWeight, 1)
  assert.equal(metrics.newborn.kmcWeightGain.totalGainGrams, 150)
  assert.equal(metrics.newborn.kmcWeightGain.babiesWithTwoWeights, 1)
  assert.equal(metrics.pnc.ironFolate, 1)
  assert.equal(metrics.serviceClosure.total, 1)
})

test('overview metrics include default service outcome and maternal demographics', () => {
  const metrics = calculateV4Metrics(facts({
    profile: {
      patient_type: 'mother',
      registration_date: '2026-01-01',
      age: '29',
      gravida_value: 3,
      parity_primary: 2,
      parity_secondary: 1
    }
  }), {
    startDate: '2026-01-01',
    endDate: '2026-01-31'
  })
  assert.equal(metrics.serviceClosure.total, 1)
  assert.equal(metrics.serviceClosure.outcomes['In service'], 1)
  assert.equal(metrics.registration.ageGroups['18-35'], 1)
  assert.equal(metrics.registration.gravidaTotal, 3)
  assert.equal(metrics.registration.gravidaCount, 1)
  assert.equal(metrics.registration.parityTotal, 3)
  assert.equal(metrics.registration.parityCount, 1)
})

test('counts institutional delivery independently of the birth provider', () => {
  const delivery = deliveryRecord(facts({
    deliveryNotes: {
      deliveryDetails: {
        deliveryDate: '2026-01-19',
        birthPlace: 'government hospital',
        birthProvider: 'other',
        babies: []
      }
    }
  }))
  assert.equal(delivery.place, 'Public Health Facility')
  assert.equal(delivery.provider, 'other')
})

test('accepts legacy delivery date aliases for range aggregation', () => {
  const delivery = deliveryRecord(facts({
    deliveryNotes: {
      deliveryDetails: {
        deliveredDateTime: '2026-01-19T10:00:00+06:30',
        birthPlace: 'government hospital',
        birthProvider: 'other',
        babies: []
      }
    }
  }))
  assert.equal(delivery.date, '2026-01-19T10:00:00+06:30')
})

test('classifies structured newborn transfers as baby referrals', () => {
  const metrics = calculateV4Metrics(facts({
    profile: { patient_type: 'baby', registration_date: '2026-01-01' },
    transferRecord: {
      careContext: 'newborn',
      referralTime: '2026-01-12',
      referralFacilityType: 'township_hospital'
    }
  }), { startDate: '2026-01-01', endDate: '2026-01-31' })
  assert.equal(metrics.referral.baby.total, 1)
  assert.equal(metrics.referral.maternal.total, 0)
})
