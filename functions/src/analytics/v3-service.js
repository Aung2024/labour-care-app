'use strict'

const { FieldValue } = require('firebase-admin/firestore')
const {
  ANALYTICS_V3_SCHEMA_VERSION,
  ANALYTICS_V31_SCHEMA_VERSION
} = require('./v3-registry')
const {
  emptyV3Metrics,
  calculateV3Metrics,
  reportingPeriodsForFacts,
  subtractNumericTrees,
  applyDeltaNonNegative
} = require('./v3-metrics')
const { periodForKey } = require('./metrics')

const CONTRIBUTION_COLLECTION_V3 = 'analytics_v3_contributions'
const PERIOD_COLLECTION_V3 = 'analytics_v3_periods'
const CONTRIBUTION_COLLECTION_V31 = 'analytics_v31_contributions'
const PERIOD_COLLECTION_V31 = 'analytics_v31_periods'

const ANALYTICS_V3_CONTRACT = Object.freeze({
  schemaVersion: ANALYTICS_V3_SCHEMA_VERSION,
  contributionCollection: CONTRIBUTION_COLLECTION_V3,
  periodCollection: PERIOD_COLLECTION_V3,
  corrected: false
})

const ANALYTICS_V31_CONTRACT = Object.freeze({
  schemaVersion: ANALYTICS_V31_SCHEMA_VERSION,
  contributionCollection: CONTRIBUTION_COLLECTION_V31,
  periodCollection: PERIOD_COLLECTION_V31,
  corrected: true
})

const analyticsContract = (value) => value && value.corrected
  ? ANALYTICS_V31_CONTRACT
  : ANALYTICS_V3_CONTRACT

const clean = (value, fallback = 'unknown') => {
  const text = String(value || '').trim()
  return text || fallback
}

const scopeDocIdV3 = (descriptor) => {
  const parts = [
    `geography=${descriptor.geographyType}:${descriptor.geographyId}`
  ]
  if (descriptor.department) parts.push(`department=${descriptor.department}`)
  if (descriptor.facilityType) parts.push(`facilityType=${descriptor.facilityType}`)
  return encodeURIComponent(parts.join('|'))
}

const geographyDescriptors = (facts, contractValue) => {
  const scope = facts && facts.scope || {}
  const result = [{
    geographyType: 'national',
    geographyId: 'all',
    region: '',
    township: '',
    facilityCode: '',
    providerId: ''
  }]
  if (scope.region) {
    result.push({
      geographyType: 'region',
      geographyId: clean(scope.region),
      region: clean(scope.region, ''),
      township: '',
      facilityCode: '',
      providerId: ''
    })
  }
  if (scope.township) {
    result.push({
      geographyType: 'township',
      geographyId: clean(scope.township),
      region: clean(scope.region, ''),
      township: clean(scope.township, ''),
      facilityCode: '',
      providerId: ''
    })
  }
  if (scope.facilityCode) {
    result.push({
      geographyType: 'facility',
      geographyId: clean(scope.facilityCode),
      region: clean(scope.region, ''),
      township: clean(scope.township, ''),
      facilityCode: clean(scope.facilityCode, ''),
      facilityName: clean(scope.facilityName, ''),
      providerId: ''
    })
  }
  const contract = analyticsContract(contractValue)
  const sharedProviderIds = contract.corrected
    ? (scope.activeJointCareProviderIds || [])
    : (scope.careTeamProviderIds || [])
  const providerIds = Array.from(new Set([
    scope.providerId,
    ...(Array.isArray(sharedProviderIds) ? sharedProviderIds : [])
  ].filter(Boolean)))
  providerIds.forEach((providerId) => {
    result.push({
      geographyType: 'provider',
      geographyId: clean(providerId),
      region: clean(scope.region, ''),
      township: clean(scope.township, ''),
      facilityCode: clean(scope.facilityCode, ''),
      facilityName: clean(scope.facilityName, ''),
      providerId: clean(providerId, ''),
      providerName: providerId === scope.providerId
        ? clean(scope.providerName, '')
        : ''
    })
  })
  return result.map((descriptor) => ({
    ...descriptor,
    scopeType: descriptor.geographyType,
    scopeId: descriptor.geographyId
  }))
}

const scopeDescriptorsV3 = (facts, contractValue) => {
  const scope = facts && facts.scope || {}
  const department = clean(scope.department, 'other')
  const facilityType = clean(scope.facilityType, 'other')
  const dimensions = [
    {},
    { department },
    { facilityType },
    { department, facilityType }
  ]
  const unique = new Map()
  geographyDescriptors(facts, contractValue).forEach((geography) => {
    dimensions.forEach((dimension) => {
      const descriptor = {
        ...geography,
        ...dimension,
        sourceDepartment: department,
        sourceFacilityType: facilityType
      }
      descriptor.scopeDocId = scopeDocIdV3(descriptor)
      unique.set(descriptor.scopeDocId, descriptor)
    })
  })
  return Array.from(unique.values())
}

const contributionDocIdV3 = (period, patientId) =>
  `${encodeURIComponent(period)}_${encodeURIComponent(patientId)}`

const contributionRefV3 = (db, period, patientId, contractValue) => db
  .collection(analyticsContract(contractValue).contributionCollection)
  .doc(contributionDocIdV3(period, patientId))

const summaryRefV3 = (db, period, scopeId, contractValue) => db
  .collection(analyticsContract(contractValue).periodCollection)
  .doc(period)
  .collection('scopes')
  .doc(scopeId)

const hasNumericValue = (value) => {
  if (typeof value === 'number') return value !== 0
  if (!value || typeof value !== 'object') return false
  return Object.values(value).some(hasNumericValue)
}

const scopeMap = (contribution) => new Map(
  ((contribution && contribution.scopes) || []).map((descriptor) => [
    descriptor.scopeDocId || scopeDocIdV3(descriptor),
    descriptor
  ])
)

const summaryAfterContributionChange = (
  current,
  oldContribution,
  nextContribution,
  descriptor,
  period,
  contractValue
) => {
  const contract = analyticsContract(contractValue)
  const oldScopes = scopeMap(oldContribution)
  const nextScopes = scopeMap(nextContribution)
  const scopeId = descriptor.scopeDocId || scopeDocIdV3(descriptor)
  const oldMetrics = oldScopes.has(scopeId)
    ? oldContribution.metrics || emptyV3Metrics()
    : emptyV3Metrics()
  const nextMetrics = nextScopes.has(scopeId)
    ? nextContribution.metrics || emptyV3Metrics()
    : emptyV3Metrics()
  const delta = subtractNumericTrees(nextMetrics, oldMetrics)
  const oldPresent = oldScopes.has(scopeId) ? 1 : 0
  const nextPresent = nextScopes.has(scopeId) ? 1 : 0
  return {
    ...descriptor,
    period,
    schemaVersion: contract.schemaVersion,
    patientContributionCount: Math.max(
      0,
      Number(current && current.patientContributionCount || 0) +
        nextPresent - oldPresent
    ),
    metrics: applyDeltaNonNegative(
      current && current.metrics || emptyV3Metrics(),
      delta
    ),
    reconciliationStatus: 'live'
  }
}

const buildContribution = (facts, periodKey, generation, contractValue) => {
  if (!facts || !facts.id) return null
  const contract = analyticsContract(contractValue)
  const metrics = calculateV3Metrics(
    facts,
    periodForKey(periodKey),
    { corrected: contract.corrected }
  )
  if (!hasNumericValue(metrics)) return null
  return {
    patientId: facts.id,
    period: periodKey,
    schemaVersion: contract.schemaVersion,
    generation: generation || 'live',
    scopes: scopeDescriptorsV3(facts, contract),
    metrics
  }
}

const applyPatientPeriodContribution = async (
  db,
  patientId,
  periodKey,
  nextContribution,
  contractValue
) => {
  const contract = analyticsContract(contractValue)
  const contributionRef = contributionRefV3(
    db,
    periodKey,
    patientId,
    contract
  )
  return db.runTransaction(async (transaction) => {
    const previousSnapshot = await transaction.get(contributionRef)
    const previous = previousSnapshot.exists ? previousSnapshot.data() : null
    const previousScopes = scopeMap(previous)
    const nextScopes = scopeMap(nextContribution)
    const scopeIds = Array.from(new Set([
      ...previousScopes.keys(),
      ...nextScopes.keys()
    ])).sort()
    const references = scopeIds.map((id) =>
      summaryRefV3(db, periodKey, id, contract)
    )
    const summarySnapshots = references.length
      ? await transaction.getAll(...references)
      : []
    const summaries = new Map(summarySnapshots.map((snapshot) => [
      snapshot.id,
      snapshot.exists ? snapshot.data() : {}
    ]))

    scopeIds.forEach((scopeId) => {
      const descriptor = nextScopes.get(scopeId) || previousScopes.get(scopeId)
      const summary = summaryAfterContributionChange(
        summaries.get(scopeId),
        previous,
        nextContribution,
        descriptor,
        periodKey,
        contract
      )
      const reference = summaryRefV3(db, periodKey, scopeId, contract)
      if (summary.patientContributionCount === 0 && !hasNumericValue(summary.metrics)) {
        transaction.delete(reference)
      } else {
        transaction.set(reference, {
          ...summary,
          calculatedAt: FieldValue.serverTimestamp()
        }, { merge: false })
      }
    })

    if (nextContribution) {
      transaction.set(contributionRef, {
        ...nextContribution,
        updatedAt: FieldValue.serverTimestamp()
      }, { merge: false })
    } else {
      transaction.delete(contributionRef)
    }
    return {
      patientId,
      period: periodKey,
      scopeCount: scopeIds.length,
      deleted: !nextContribution
    }
  })
}

const refreshPatientAnalyticsV3 = async (db, facts, options) => {
  const patientId = facts && facts.id || options && options.patientId
  if (!patientId) throw new Error('A patient id is required for analytics-v3 refresh')
  const contract = analyticsContract(options && options.contract)
  const existing = await db.collection(contract.contributionCollection)
    .where('patientId', '==', patientId)
    .get()
  const previousPeriods = existing.docs.map((doc) => doc.get('period')).filter(Boolean)
  const currentPeriods = facts ? reportingPeriodsForFacts(facts) : []
  const periods = Array.from(new Set([...previousPeriods, ...currentPeriods])).sort()
  const results = await Promise.all(periods.map(async (period) => {
    const next = facts && currentPeriods.includes(period)
      ? buildContribution(
        facts,
        period,
        options && options.generation,
        contract
      )
      : null
    return applyPatientPeriodContribution(
      db,
      patientId,
      period,
      next,
      contract
    )
  }))
  return { patientId, periods: results }
}

const refreshPatientAnalyticsV31 = (db, facts, options) =>
  refreshPatientAnalyticsV3(db, facts, {
    ...(options || {}),
    contract: ANALYTICS_V31_CONTRACT
  })

module.exports = {
  CONTRIBUTION_COLLECTION_V3,
  PERIOD_COLLECTION_V3,
  CONTRIBUTION_COLLECTION_V31,
  PERIOD_COLLECTION_V31,
  ANALYTICS_V3_CONTRACT,
  ANALYTICS_V31_CONTRACT,
  analyticsContract,
  scopeDocIdV3,
  geographyDescriptors,
  scopeDescriptorsV3,
  contributionDocIdV3,
  contributionRefV3,
  summaryRefV3,
  hasNumericValue,
  summaryAfterContributionChange,
  buildContribution,
  applyPatientPeriodContribution,
  refreshPatientAnalyticsV3,
  refreshPatientAnalyticsV31
}
