'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const {
  ANALYTICS_V31_CONTRACT,
  ANALYTICS_V32_CONTRACT,
  scopeDocIdV3,
  scopeDescriptorsV3,
  summaryAfterContributionChange,
  buildContribution,
  hasNumericValue
} = require('../src/analytics/v3-service')
const {
  emptyV3Metrics,
  applyDeltaNonNegative
} = require('../src/analytics/v3-metrics')

const facts = (scope) => ({
  id: 'patient-1',
  profile: {
    created_at: '2026-08-01',
    age: 25
  },
  scope: {
    region: 'Yangon Region',
    township: 'Hlaing',
    facilityCode: '013',
    providerId: 'provider-1',
    providerName: 'Provider One',
    department: 'doph',
    facilityType: 'rhc',
    ...scope
  },
  antenatalVisits: [{
    data: { visitDate: '2026-08-02', visitNumber: 1 }
  }],
  postpartumVisits: [],
  testRecords: [],
  newbornVisits: []
})

const assertNumericTree = (value) => {
  if (typeof value === 'number') {
    assert.ok(Number.isFinite(value))
    return
  }
  assert.ok(value && typeof value === 'object' && !Array.isArray(value))
  Object.values(value).forEach(assertNumericTree)
}

test('scope descriptors support geography and department/facilityType combinations', () => {
  const scopes = scopeDescriptorsV3(facts())
  assert.equal(scopes.length, 20)
  assert.equal(new Set(scopes.map((scope) => scope.scopeDocId)).size, 20)
  assert.ok(scopes.some((scope) =>
    scope.geographyType === 'national' &&
    scope.department === 'doph' &&
    scope.facilityType === 'rhc'
  ))
  assert.ok(scopes.some((scope) =>
    scope.geographyType === 'provider' &&
    scope.geographyId === 'provider-1' &&
    !scope.department &&
    !scope.facilityType
  ))
  scopes.forEach((scope) => {
    assert.equal(scope.scopeDocId, scopeDocIdV3(scope))
    assert.equal(scope.scopeDocId.includes('/'), false)
    assert.equal(scope.scopeType, scope.geographyType)
    assert.equal(scope.scopeId, scope.geographyId)
  })
})

test('provider scopes include linked Joint Care midwives without duplicating owners', () => {
  const scopes = scopeDescriptorsV3(facts({
    careTeamProviderIds: ['provider-1', 'provider-2']
  }))
  const providerScopes = scopes.filter((scope) =>
    scope.geographyType === 'provider' &&
    !scope.department &&
    !scope.facilityType
  )
  assert.deepEqual(
    providerScopes.map((scope) => scope.providerId).sort(),
    ['provider-1', 'provider-2']
  )
})

test('analytics-v3 contribution metrics contain numeric counters/maps and no arrays', () => {
  const contribution = buildContribution(facts(), '2026-08', 'test-generation')
  assert.equal(contribution.patientId, 'patient-1')
  assert.equal(contribution.period, '2026-08')
  assert.equal(contribution.generation, 'test-generation')
  assert.equal(hasNumericValue(contribution.metrics), true)
  assertNumericTree(contribution.metrics)
})

test('replaying the same contribution is idempotent', () => {
  const contribution = buildContribution(facts(), '2026-08')
  const descriptor = contribution.scopes[0]
  const current = {
    patientContributionCount: 1,
    metrics: contribution.metrics
  }
  const summary = summaryAfterContributionChange(
    current,
    contribution,
    contribution,
    descriptor,
    '2026-08'
  )
  assert.equal(summary.patientContributionCount, 1)
  assert.deepEqual(summary.metrics, contribution.metrics)
})

test('scope moves subtract the old scope and add the new scope', () => {
  const previous = buildContribution(facts(), '2026-08')
  const next = buildContribution(facts({
    region: 'Bago Region',
    township: 'Bago'
  }), '2026-08')
  const oldScope = previous.scopes.find((scope) =>
    scope.geographyType === 'region' && !scope.department && !scope.facilityType
  )
  const newScope = next.scopes.find((scope) =>
    scope.geographyType === 'region' && !scope.department && !scope.facilityType
  )
  const removed = summaryAfterContributionChange(
    {
      patientContributionCount: 1,
      metrics: previous.metrics
    },
    previous,
    next,
    oldScope,
    '2026-08'
  )
  const added = summaryAfterContributionChange(
    {
      patientContributionCount: 0,
      metrics: emptyV3Metrics()
    },
    previous,
    next,
    newScope,
    '2026-08'
  )
  assert.equal(removed.patientContributionCount, 0)
  assert.equal(removed.metrics.anc.clients, 0)
  assert.equal(removed.metrics.registration.total, 0)
  assert.equal(added.patientContributionCount, 1)
  assert.equal(added.metrics.anc.clients, 1)
  assert.equal(added.metrics.registration.total, 1)
})

test('non-negative delta application protects summaries after retries', () => {
  const current = emptyV3Metrics()
  current.anc.clients = 1
  const delta = emptyV3Metrics()
  delta.anc.clients = -2
  delta.highRisk.factors.Hypertension = -1
  const next = applyDeltaNonNegative(current, delta)
  assert.equal(next.anc.clients, 0)
  assert.equal(next.highRisk.factors.Hypertension, 0)
})

test('v3.1 contributions use parallel collections and active Joint Care scopes', () => {
  const correctedFacts = facts({
    careTeamProviderIds: ['owner-only-history'],
    activeJointCareProviderIds: ['provider-2']
  })
  const contribution = buildContribution(
    correctedFacts,
    'all',
    'v31-test',
    ANALYTICS_V31_CONTRACT
  )
  assert.equal(contribution.schemaVersion, 'analytics-v3.1.0')
  assert.equal(ANALYTICS_V31_CONTRACT.contributionCollection,
    'analytics_v31_contributions')
  assert.equal(ANALYTICS_V31_CONTRACT.periodCollection,
    'analytics_v31_periods')
  const providerIds = contribution.scopes.filter((scope) =>
    scope.geographyType === 'provider' &&
    !scope.department &&
    !scope.facilityType
  ).map((scope) => scope.providerId).sort()
  assert.deepEqual(providerIds, ['provider-1', 'provider-2'])
  assert.equal(contribution.metrics.registration.total, 1)
})

test('v3.2 contributions use the registered-baby truth contract', () => {
  const babyFacts = facts()
  babyFacts.id = 'baby-1'
  babyFacts.profile = {
    created_at: '2026-08-01',
    patient_type: 'baby',
    birth_weight_gram: 2300
  }
  babyFacts.newbornFacts = {
    patientType: 'baby',
    birthOrder: 1,
    birthDate: '2026-08-01',
    birthWeightGram: 2300
  }
  const contribution = buildContribution(
    babyFacts,
    'all',
    'v32-test',
    ANALYTICS_V32_CONTRACT
  )
  assert.equal(contribution.schemaVersion, 'analytics-v3.2.0')
  assert.equal(ANALYTICS_V32_CONTRACT.contributionCollection,
    'analytics_v32_contributions')
  assert.equal(ANALYTICS_V32_CONTRACT.periodCollection,
    'analytics_v32_periods')
  assert.equal(contribution.metrics.registration.babies, 1)
  assert.equal(contribution.metrics.newborn.canonicalBabies, 1)
  assert.equal(contribution.metrics.newborn.lowBirthWeight, 1)
})
