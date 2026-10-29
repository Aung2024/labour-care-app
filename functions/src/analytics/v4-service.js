'use strict'

const crypto = require('node:crypto')
const {
  ANALYTICS_V4_SCHEMA_VERSION,
  ANALYTICS_V4_DEFINITION_VERSION
} = require('./v4-registry')
const {
  dateKey,
  monthKey,
  calculateV4Metrics,
  mergeNumericTrees
} = require('./v4-metrics')

const CONTRIBUTION_COLLECTION = 'analytics_v4_contributions'
const CACHE_COLLECTION = 'analytics_v4_range_cache'
const UNDATED_MONTH = 'undated'
const ADDITIVE_PATHS = new Set([
  'anc.services',
  'pnc.visits',
  'newborn.births',
  'highRisk.ancAverage.highRisk.visits',
  'highRisk.ancAverage.nonHighRisk.visits'
])
const MAP_PATHS = new Set([
  'anc.td.byLatestStatus',
  'highRisk.factors',
  'highRisk.completion.byReason',
  'delivery.modes',
  'delivery.places',
  'delivery.maternalOutcomes',
  'delivery.newbornOutcomes',
  'referral.maternal.byStage',
  'referral.maternal.byDestination',
  'referral.baby.byStage',
  'referral.baby.byDestination',
  'jointCare.byReceivingFacilityType',
  'serviceClosure.mother.byOutcome',
  'serviceClosure.baby.byOutcome'
])

const contributionId = (month, patientId) =>
  `${encodeURIComponent(month)}_${encodeURIComponent(patientId)}`

const contributionRef = (db, month, patientId) =>
  db.collection(CONTRIBUTION_COLLECTION).doc(contributionId(month, patientId))

const monthEnd = (month) => {
  const [year, value] = month.split('-').map(Number)
  return new Date(Date.UTC(year, value, 0)).toISOString().slice(0, 10)
}

const monthsBetween = (start, end) => {
  const first = new Date(`${start}-01T00:00:00Z`)
  const last = new Date(`${end}-01T00:00:00Z`)
  const months = []
  for (const cursor = first; cursor <= last; cursor.setUTCMonth(cursor.getUTCMonth() + 1)) {
    months.push(cursor.toISOString().slice(0, 7))
  }
  return months
}

const candidateMonths = (facts) => {
  const values = []
  const add = (value) => {
    const month = monthKey(value)
    if (month) values.push(month)
  }
  const unwrap = (item) => item && item.data && typeof item.data === 'object'
    ? item.data
    : (item || {})
  const addItems = (items, fields) => (items || []).forEach((item) => {
    const data = unwrap(item)
    fields.forEach((field) => add(data[field]))
    ;(data.otherVisits || []).forEach((visit) => {
      const external = unwrap(visit)
      fields.forEach((field) => add(external[field]))
    })
  })

  add(facts.profile && (
    facts.profile.registration_date ||
    facts.profile.registrationDate ||
    facts.profile.createdAt ||
    facts.profile.created_at
  ))
  addItems(facts.antenatalVisits, [
    'visitDate', 'visit_date', 'recordedAt', 'recorded_at', 'timestamp', 'createdAt'
  ])
  addItems(facts.postpartumVisits, [
    'visitDate', 'visit_date', 'recordedAt', 'recorded_at', 'timestamp', 'createdAt'
  ])
  addItems(facts.newbornVisits, [
    'visitDate', 'visit_date', 'recordedAt', 'recorded_at', 'timestamp',
    'createdAt', 'created_at', 'birthTime', 'birth_time'
  ])
  addItems(facts.immediateNewbornCare, [
    'visitDate', 'visit_date', 'recordedAt', 'recorded_at', 'timestamp',
    'createdAt', 'created_at', 'birthTime', 'birth_time'
  ])
  addItems(facts.hrtActions, [
    'recordedAt', 'recorded_at', 'completedAt', 'completed_at', 'createdAt'
  ])
  addItems(facts.kmcActions, [
    'recordedAt', 'recorded_at', 'completedAt', 'completed_at', 'createdAt'
  ])
  const delivery = facts.deliveryNotes && (facts.deliveryNotes.data || facts.deliveryNotes)
  const deliveryDetails = delivery && (
    delivery.deliveryDetails ||
    delivery.delivery_details ||
    delivery
  )
  add(deliveryDetails && (
    deliveryDetails.deliveryDate ||
    deliveryDetails.delivery_date ||
    deliveryDetails.deliveryDateTime ||
    deliveryDetails.delivery_datetime ||
    deliveryDetails.birthDate ||
    deliveryDetails.birth_date ||
    deliveryDetails.birthTime ||
    deliveryDetails.birth_time ||
    deliveryDetails.deliveredDateTime ||
    deliveryDetails.delivered_datetime ||
    deliveryDetails.createdAt
  ))
  ;(deliveryDetails && deliveryDetails.babies || []).forEach((baby) => {
    const birth = unwrap(baby)
    add(
      birth.birthTime ||
      birth.birth_time ||
      birth.birthDate ||
      birth.birth_date
    )
  })
  add(delivery && (delivery.deliveryDate || delivery.createdAt))
  const closure = facts.profile && facts.profile.serviceClosure
  add(closure && (closure.closedAt || closure.closed_at))
  const referral = facts.transferRecord && (facts.transferRecord.data || facts.transferRecord)
  add(referral && (referral.referralTime || referral.timestamp || referral.createdAt))
  const months = Array.from(new Set(values)).sort()
  return months.length ? months : [UNDATED_MONTH]
}

const pathEntries = (value, prefix = '') => {
  if (typeof value === 'number') return [[prefix, value]]
  if (!value || typeof value !== 'object' || Array.isArray(value)) return []
  return Object.entries(value).flatMap(([key, child]) =>
    pathEntries(child, prefix ? `${prefix}.${key}` : key)
  )
}

const setAtPath = (target, path, value) => {
  const parts = path.split('.')
  let cursor = target
  parts.forEach((part, index) => {
    if (index === parts.length - 1) cursor[part] = value
    else cursor = cursor[part] || (cursor[part] = {})
  })
}

const dailyMetricsForMonth = (facts, month) => {
  if (month === UNDATED_MONTH) {
    return [{
      date: null,
      metrics: calculateV4Metrics(facts, {
        startDate: '2025-01-01',
        endDate: '2025-01-01'
      })
    }]
  }
  const days = []
  const end = monthEnd(month)
  for (let day = 1; day <= Number(end.slice(-2)); day += 1) {
    const date = `${month}-${String(day).padStart(2, '0')}`
    days.push({
      date,
      metrics: calculateV4Metrics(facts, { startDate: date, endDate: date })
    })
  }
  return days
}

const buildV4Contribution = (facts, month) => ({
  schemaVersion: ANALYTICS_V4_SCHEMA_VERSION,
  definitionVersion: ANALYTICS_V4_DEFINITION_VERSION,
  patientId: facts.id,
  month,
  scope: facts.scope || {},
  scopeProviderId: facts.scope && facts.scope.providerId || '',
  scopeTownship: facts.scope && facts.scope.township || '',
  scopeRegion: facts.scope && facts.scope.region || '',
  scopeFacilityCode: facts.scope && facts.scope.facilityCode || '',
  scopeDepartment: facts.scope && facts.scope.department || '',
  scopeFacilityType: facts.scope && facts.scope.facilityType || '',
  dailyMetrics: dailyMetricsForMonth(facts, month),
  sourceHash: facts.sourceHash || '',
  updatedAt: new Date().toISOString()
})

const refreshPatientAnalyticsV4 = async (db, facts) => {
  if (!facts || !facts.id) return { deleted: true, months: [] }
  const existing = await db.collection(CONTRIBUTION_COLLECTION)
    .where('patientId', '==', facts.id)
    .get()
  const months = new Set(candidateMonths(facts))
  existing.docs.forEach((doc) => months.add(doc.get('month')))
  const writer = db.bulkWriter()
  Array.from(months).filter(Boolean).forEach((month) => {
    writer.set(contributionRef(db, month, facts.id), buildV4Contribution(facts, month))
  })
  await writer.close()
  return { deleted: false, months: Array.from(months).sort() }
}

const deletePatientAnalyticsV4 = async (db, patientId) => {
  const snapshot = await db.collection(CONTRIBUTION_COLLECTION)
    .where('patientId', '==', patientId)
    .get()
  const writer = db.bulkWriter()
  snapshot.docs.forEach((doc) => writer.delete(doc.ref))
  await writer.close()
  return snapshot.size
}

const cacheKey = (request) => crypto.createHash('sha256').update(JSON.stringify({
  schema: ANALYTICS_V4_SCHEMA_VERSION,
  definition: ANALYTICS_V4_DEFINITION_VERSION,
  scope: request.scope,
  periodMode: request.periodMode || 'months',
  startDate: request.startDate,
  endDate: request.endDate,
  department: request.department || '',
  facilityTypes: (request.facilityTypes || []).slice().sort(),
  facilityCode: request.facilityCode || '',
  trendMode: request.trendMode || 'month'
})).digest('hex')

const addUnique = (state, path, value, patientId) => {
  const entries = state.unique[path] || (state.unique[path] = new Map())
  entries.set(patientId, Math.max(Number(entries.get(patientId) || 0), Number(value || 0)))
}

const addMapUnique = (state, path, map, patientId) => {
  Object.entries(map || {}).forEach(([key, value]) => {
    const mapState = state.maps[path] || (state.maps[path] = new Map())
    const entityKey = `${patientId}|${key}`
    mapState.set(entityKey, Math.max(Number(mapState.get(entityKey) || 0), Number(value || 0)))
  })
}

const reduceMetrics = (state, metrics, patientId) => {
  pathEntries(metrics).forEach(([path, value]) => {
    const parentPath = path.slice(0, path.lastIndexOf('.'))
    const leaf = path.slice(path.lastIndexOf('.') + 1)
    const parent = parentPath ? parentPath.split('.').reduce((cursor, key) => cursor && cursor[key], metrics) : null
    if (MAP_PATHS.has(parentPath)) {
      addMapUnique(state, parentPath, parent, patientId)
      return
    }
    if (ADDITIVE_PATHS.has(path)) {
      state.additive[path] = Number(state.additive[path] || 0) + Number(value || 0)
      return
    }
    addUnique(state, path, value, patientId)
  })
}

const materializeState = (state) => {
  const metrics = {}
  Object.entries(state.additive).forEach(([path, value]) => setAtPath(metrics, path, value))
  Object.entries(state.unique).forEach(([path, values]) => {
    setAtPath(metrics, path, Array.from(values.values()).reduce((total, value) => total + value, 0))
  })
  Object.entries(state.maps).forEach(([path, values]) => {
    const map = {}
    values.forEach((value, entityKey) => {
      const category = entityKey.slice(entityKey.indexOf('|') + 1)
      map[category] = Number(map[category] || 0) + value
    })
    setAtPath(metrics, path, map)
  })
  return metrics
}

const aggregateContributions = (
  contributions,
  startDate,
  endDate,
  options = {}
) => {
  const state = { additive: {}, unique: {}, maps: {} }
  contributions.forEach((contribution) => {
    const patientState = { additive: {}, unique: {}, maps: {} }
    ;(contribution.dailyMetrics || []).forEach((day) => {
      if (!day.date && !options.includeUndated) return
      if (day.date && (day.date < startDate || day.date > endDate)) return
      reduceMetrics(patientState, day.metrics || {}, contribution.patientId)
    })
    reduceMetrics(state, materializeState(patientState), contribution.patientId)
  })
  return materializeState(state)
}

const matchesScope = (contribution, scope) => {
  if (!scope) return true
  return Object.entries(scope).every(([key, value]) => {
    if (!value) return true
    return contribution[key] === value
  })
}

module.exports = {
  CONTRIBUTION_COLLECTION,
  CACHE_COLLECTION,
  UNDATED_MONTH,
  contributionId,
  contributionRef,
  monthsBetween,
  candidateMonths,
  buildV4Contribution,
  refreshPatientAnalyticsV4,
  deletePatientAnalyticsV4,
  cacheKey,
  aggregateContributions,
  matchesScope,
  mergeNumericTrees
}
