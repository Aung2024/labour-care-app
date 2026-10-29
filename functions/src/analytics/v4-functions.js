'use strict'

const admin = require('firebase-admin')
const { FieldPath, FieldValue } = require('firebase-admin/firestore')
const { onCall, HttpsError } = require('firebase-functions/v2/https')
const { onSchedule } = require('firebase-functions/v2/scheduler')
const { loadPatientActivity } = require('../leaderboard/repository')
const {
  normalizeLoadedClinicalFacts,
  V4_REFRESH_QUEUE
} = require('./refresh-queue-functions')
const {
  ANALYTICS_V4_SCHEMA_VERSION,
  ANALYTICS_V4_DEFINITION_VERSION
} = require('./v4-registry')
const {
  CONTRIBUTION_COLLECTION,
  CACHE_COLLECTION,
  UNDATED_MONTH,
  monthsBetween,
  createAggregationState,
  addMetricsToAggregationState,
  contributionMetricsForRange,
  materializeState,
  cacheKey
} = require('./v4-service')
const {
  refreshPatientAnalyticsV4,
  deletePatientAnalyticsV4
} = require('./v4-service')

const REGION = 'us-central1'
const ALLOWED_ROLES = new Set([
  'midwife',
  'tmo',
  'township medical officer',
  'regional officer',
  'central',
  'super admin',
  'admin'
])
const ALLOWED_DEPARTMENTS = new Set(['', 'doph', 'doms', 'other'])
const MAX_RANGE_DAYS = 3660
const BACKFILL_JOB_ID = 'dashboard-v4-backfill'
const BACKFILL_BATCH_SIZE = 25
const BACKFILL_MAX_RUNTIME_MS = 480000
const DAILY_REFRESH_BATCH_SIZE = 100
const DAILY_REFRESH_CONCURRENCY = 5
const DAILY_REFRESH_MAX_RUNTIME_MS = 480000
const V4_CACHE_TTL_MS = 24 * 60 * 60 * 1000
const CONTRIBUTION_PAGE_SIZE = 500
const CONTRIBUTION_PROJECTION = [
  'month',
  'patientId',
  'scopeProviderId',
  'scopeTownship',
  'scopeRegion',
  'scopeFacilityCode',
  'scopeDepartment',
  'scopeFacilityType',
  'periodMetrics'
]

const db = () => admin.firestore()
const roleKey = (value) => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ')
const geographyValue = (value) => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ')

const backfillJobRef = (database = db()) =>
  database.collection('analytics_v4_jobs').doc(BACKFILL_JOB_ID)

const requireSuperAdmin = async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in is required.')
  const snapshot = await db().collection('users').doc(request.auth.uid).get()
  if (!snapshot.exists || roleKey(snapshot.get('role')) !== 'super admin') {
    throw new HttpsError('permission-denied', 'Only Super Admin can start the v4 backfill.')
  }
  return snapshot.data() || {}
}

const startDashboardV4Backfill = onCall({ region: REGION }, async (request) => {
  await requireSuperAdmin(request)
  const ref = backfillJobRef()
  const force = Boolean(request.data && request.data.force)
  const result = await db().runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref)
    const current = snapshot.exists ? snapshot.data() : {}
    if (!force && current.status === 'running') {
      return { status: 'running', processedPatients: Number(current.processedPatients || 0) }
    }
    const generation = Number(current.generation || 0) + 1
    transaction.set(ref, {
      type: 'analytics-v4-backfill',
      status: 'running',
      generation,
      cursor: null,
      processedPatients: 0,
      failedPatients: 0,
      lastErrors: {},
      requestedBy: request.auth.uid,
      startedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      completedAt: FieldValue.delete()
    }, { merge: true })
    return { status: 'running', generation, processedPatients: 0 }
  })
  return result
})

const processDashboardV4BackfillBatch = async (database = db()) => {
  const ref = backfillJobRef(database)
  const snapshot = await ref.get()
  if (!snapshot.exists || snapshot.get('status') !== 'running') return { status: 'idle' }
  const job = snapshot.data() || {}
  let query = database.collection('patients')
    .orderBy(FieldPath.documentId())
    .limit(BACKFILL_BATCH_SIZE)
  if (job.cursor) query = query.startAfter(job.cursor)
  const patients = await query.get()
  if (patients.empty) {
    await ref.set({
      status: 'complete',
      completedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true })
    return { status: 'complete', processed: 0 }
  }

  let processed = 0
  let failed = 0
  const errors = {}
  for (const patient of patients.docs) {
    try {
      const loaded = await loadPatientActivity(database, patient.id)
      const facts = await normalizeLoadedClinicalFacts(database, patient.id, loaded)
      if (facts) await refreshPatientAnalyticsV4(database, facts)
      else await deletePatientAnalyticsV4(database, patient.id)
      processed += 1
    } catch (error) {
      failed += 1
      errors[patient.id] = String(error && error.message || error).slice(0, 500)
    }
  }
  const lastId = patients.docs[patients.docs.length - 1].id
  await ref.set({
    cursor: lastId,
    processedPatients: FieldValue.increment(processed),
    failedPatients: FieldValue.increment(failed),
    lastErrors: errors,
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true })
  return { status: 'running', processed, failed, cursor: lastId }
}

const dashboardV4BackfillWorker = onSchedule({
  schedule: 'every 5 minutes',
  timeZone: 'Asia/Yangon',
  region: REGION,
  timeoutSeconds: 540,
  memory: '1GiB',
  maxInstances: 1,
  concurrency: 1
}, async () => {
  const started = Date.now()
  let result = await processDashboardV4BackfillBatch()
  while (result.status === 'running' && Date.now() - started < BACKFILL_MAX_RUNTIME_MS) {
    result = await processDashboardV4BackfillBatch()
  }
  return result
})

const processDashboardV4DailyRefreshBatch = async (database = db()) => {
  const queue = await database.collection(V4_REFRESH_QUEUE)
    .orderBy(FieldPath.documentId())
    .limit(DAILY_REFRESH_BATCH_SIZE)
    .get()
  if (queue.empty) return { status: 'idle', processed: 0, failed: 0 }

  let processed = 0
  let failed = 0
  const refreshOne = async (queueDocument) => {
    const patientId = queueDocument.id
    try {
      const loaded = await loadPatientActivity(database, patientId)
      const facts = await normalizeLoadedClinicalFacts(database, patientId, loaded)
      if (facts) await refreshPatientAnalyticsV4(database, facts)
      else await deletePatientAnalyticsV4(database, patientId)
      await queueDocument.ref.delete()
      processed += 1
    } catch (error) {
      failed += 1
      await queueDocument.ref.set({
        status: 'failed',
        lastError: String(error && error.message || error).slice(0, 500),
        failedAt: FieldValue.serverTimestamp()
      }, { merge: true })
    }
  }

  for (let offset = 0; offset < queue.docs.length; offset += DAILY_REFRESH_CONCURRENCY) {
    await Promise.all(queue.docs
      .slice(offset, offset + DAILY_REFRESH_CONCURRENCY)
      .map(refreshOne))
  }
  return {
    status: queue.size === DAILY_REFRESH_BATCH_SIZE && failed === 0 ? 'running' : 'idle',
    processed,
    failed
  }
}

const clearDashboardV4Cache = async (database = db()) => {
  let deleted = 0
  while (true) {
    const snapshot = await database.collection(CACHE_COLLECTION).limit(500).get()
    if (snapshot.empty) break
    const writer = database.bulkWriter()
    snapshot.docs.forEach((doc) => writer.delete(doc.ref))
    await writer.close()
    deleted += snapshot.size
    if (snapshot.size < 500) break
  }
  return deleted
}

const dashboardV4DailyRefreshWorker = onSchedule({
  schedule: 'every 24 hours',
  timeZone: 'Asia/Yangon',
  region: REGION,
  timeoutSeconds: 540,
  memory: '1GiB',
  maxInstances: 1,
  concurrency: 1
}, async () => {
  const started = Date.now()
  let processed = 0
  let failed = 0
  let result = { status: 'idle', processed: 0, failed: 0 }
  while (Date.now() - started < DAILY_REFRESH_MAX_RUNTIME_MS) {
    result = await processDashboardV4DailyRefreshBatch()
    processed += result.processed
    failed += result.failed
    if (result.status !== 'running') break
  }
  const deletedCacheEntries = processed ? await clearDashboardV4Cache() : 0
  return { ...result, processed, failed, deletedCacheEntries }
})

const validDate = (value, field) => {
  const text = String(value || '')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    throw new HttpsError('invalid-argument', `${field} must be YYYY-MM-DD.`)
  }
  const parsed = new Date(`${text}T00:00:00+06:30`)
  if (Number.isNaN(parsed.getTime())) {
    throw new HttpsError('invalid-argument', `${field} is not a real calendar date.`)
  }
  return text
}

const dateDistance = (start, end) =>
  Math.floor((new Date(`${end}T00:00:00+06:30`) - new Date(`${start}T00:00:00+06:30`)) / 86400000)

const authorizedUser = async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in is required.')
  const snapshot = await db().collection('users').doc(request.auth.uid).get()
  if (!snapshot.exists) throw new HttpsError('permission-denied', 'User profile not found.')
  const profile = snapshot.data() || {}
  const role = roleKey(profile.role)
  if (!ALLOWED_ROLES.has(role)) throw new HttpsError('permission-denied', 'Role cannot access the dashboard.')
  return { ...profile, uid: request.auth.uid, role }
}

const allowedScope = (user, input) => {
  const data = input || {}
  if (user.role === 'midwife') {
    return { scopeProviderId: user.uid }
  }
  if (['tmo', 'township medical officer'].includes(user.role)) {
    if (!user.township) throw new HttpsError('permission-denied', 'Township is not configured.')
    return { scopeTownship: user.township }
  }
  if (user.role === 'regional officer') {
    if (!user.region) throw new HttpsError('permission-denied', 'Region is not configured.')
    return {
      scopeRegion: user.region,
      ...(data.township ? { scopeTownship: String(data.township) } : {})
    }
  }
  if (data.facilityCode) return { scopeFacilityCode: String(data.facilityCode) }
  if (data.township) return { scopeTownship: String(data.township) }
  if (data.region) return { scopeRegion: String(data.region) }
  return {}
}

const validateInput = (input) => {
  const data = input || {}
  const periodMode = String(data.periodMode || 'months')
  if (!['all_time', 'months'].includes(periodMode)) {
    throw new HttpsError('invalid-argument', 'Unsupported period mode.')
  }
  const startDate = validDate(data.startDate, 'startDate')
  const endDate = validDate(data.endDate, 'endDate')
  if (startDate > endDate) throw new HttpsError('invalid-argument', 'startDate must not be after endDate.')
  if (periodMode !== 'all_time' && dateDistance(startDate, endDate) > MAX_RANGE_DAYS) {
    throw new HttpsError('invalid-argument', `Date ranges may not exceed ${MAX_RANGE_DAYS} days.`)
  }
  const department = String(data.department || '')
  if (!ALLOWED_DEPARTMENTS.has(department)) {
    throw new HttpsError('invalid-argument', 'Unsupported department.')
  }
  const facilityTypes = data.facilityTypes || []
  if (!Array.isArray(facilityTypes) || facilityTypes.length > 10 ||
    facilityTypes.some((value) => typeof value !== 'string' || value.length > 80)) {
    throw new HttpsError('invalid-argument', 'facilityTypes accepts up to 10 values.')
  }
  return { ...data, periodMode, startDate, endDate, department, facilityTypes }
}

const contributionMatches = (contribution, scope, input) => {
  const scoped = Object.entries(scope).every(([key, value]) => {
    if (!value) return true
    if (key === 'scopeTownship' || key === 'scopeRegion') {
      return geographyValue(contribution[key]) === geographyValue(value)
    }
    return contribution[key] === value
  })
  if (!scoped) return false
  if (input.department && contribution.scopeDepartment !== input.department) return false
  if (input.facilityTypes.length &&
    !input.facilityTypes.includes(contribution.scopeFacilityType)) return false
  if (input.facilityCode && contribution.scopeFacilityCode !== input.facilityCode) return false
  return true
}

const groupKeyFor = (contribution, mode) => {
  if (mode === 'facility') return contribution.scopeFacilityCode || 'Unknown facility'
  if (mode === 'township') return contribution.scopeTownship || 'Unknown township'
  if (mode === 'region') return contribution.scopeRegion || 'Unknown region'
  return contribution.month
}

const readContributionPages = async function* (input, scope) {
  const collection = db().collection(CONTRIBUTION_COLLECTION)
  const queryPages = async function* (createQuery) {
    let cursor = null
    while (true) {
      let query = createQuery()
      if (cursor) query = query.startAfter(cursor)
      const snapshot = await query.select(...CONTRIBUTION_PROJECTION).get()
      if (snapshot.empty) return
      const page = (await Promise.all(snapshot.docs.map(async (doc) => {
        const item = doc.data()
        if (item.periodMetrics) return item
        return (await doc.ref.get()).data()
      }))).filter((item) => contributionMatches(item, scope, input))
      if (page.length) yield page
      if (snapshot.size < CONTRIBUTION_PAGE_SIZE) return
      cursor = snapshot.docs[snapshot.docs.length - 1]
    }
  }
  const startMonth = input.startDate.slice(0, 7)
  const endMonth = input.endDate.slice(0, 7)
  const rangedPages = queryPages(() => collection
    .where('month', '>=', startMonth)
    .where('month', '<=', endMonth)
    .orderBy('month')
    .orderBy(FieldPath.documentId())
    .limit(CONTRIBUTION_PAGE_SIZE))
  for await (const page of rangedPages) yield page
  if (input.periodMode === 'all_time') {
    const undatedPages = queryPages(() => collection
      .where('month', '==', UNDATED_MONTH)
      .orderBy(FieldPath.documentId())
      .limit(CONTRIBUTION_PAGE_SIZE))
    for await (const page of undatedPages) yield page
  }
}

const resultFromAggregationStates = (
  input,
  scope,
  modes,
  overallState,
  modeStates,
  contributionCount
) => {
  const seriesByDimension = {}
  modes.forEach((mode) => {
    seriesByDimension[mode] = Array.from(modeStates[mode].entries())
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([label, state]) => ({
        label,
        metrics: materializeState(state)
      }))
  })
  return {
    schemaVersion: ANALYTICS_V4_SCHEMA_VERSION,
    definitionVersion: ANALYTICS_V4_DEFINITION_VERSION,
    startDate: input.startDate,
    endDate: input.endDate,
    scope,
    metrics: materializeState(overallState),
    seriesByDimension,
    contributionCount,
    calculatedAt: new Date().toISOString(),
    complete: true
  }
}

const buildResult = (input, contributions, scope) => {
  const aggregationOptions = {
    includeUndated: input.periodMode === 'all_time'
  }
  const modes = input.allowedModes || ['month']
  const overallState = createAggregationState()
  const modeStates = Object.fromEntries(modes.map((mode) => [mode, new Map()]))
  contributions.forEach((contribution) => {
    const metrics = contributionMetricsForRange(
      contribution,
      input.startDate,
      input.endDate,
      aggregationOptions
    )
    addMetricsToAggregationState(
      overallState,
      metrics,
      contribution.patientId
    )
    modes.forEach((mode) => {
      const key = groupKeyFor(contribution, mode)
      const state = modeStates[mode].get(key) || createAggregationState()
      addMetricsToAggregationState(
        state,
        metrics,
        contribution.patientId
      )
      modeStates[mode].set(key, state)
    })
  })
  return resultFromAggregationStates(
    input,
    scope,
    modes,
    overallState,
    modeStates,
    contributions.length
  )
}

const buildResultFromPages = async (input, pages, scope) => {
  const aggregationOptions = {
    includeUndated: input.periodMode === 'all_time'
  }
  const modes = input.allowedModes || ['month']
  const overallState = createAggregationState()
  const modeStates = Object.fromEntries(modes.map((mode) => [mode, new Map()]))
  let contributionCount = 0
  for await (const page of pages) {
    contributionCount += page.length
    page.forEach((contribution) => {
      const metrics = contributionMetricsForRange(
        contribution,
        input.startDate,
        input.endDate,
        aggregationOptions
      )
      addMetricsToAggregationState(
        overallState,
        metrics,
        contribution.patientId
      )
      modes.forEach((mode) => {
        const key = groupKeyFor(contribution, mode)
        const state = modeStates[mode].get(key) || createAggregationState()
        addMetricsToAggregationState(
          state,
          metrics,
          contribution.patientId
        )
        modeStates[mode].set(key, state)
      })
    })
  }
  return resultFromAggregationStates(
    input,
    scope,
    modes,
    overallState,
    modeStates,
    contributionCount
  )
}

const queryDashboardV4 = onCall({
  region: REGION,
  timeoutSeconds: 60,
  memory: '1GiB'
}, async (request) => {
  const user = await authorizedUser(request)
  const input = validateInput(request.data)
  const scope = allowedScope(user, input)
  const key = cacheKey({ ...input, scope })
  const cacheRef = db().collection(CACHE_COLLECTION).doc(key)
  const cached = await cacheRef.get()
  if (cached.exists && cached.get('expiresAt') &&
    cached.get('expiresAt').toMillis && cached.get('expiresAt').toMillis() > Date.now()) {
    return { ...cached.data(), cacheKey: key, source: 'cache' }
  }
  const roleModes = user.role === 'midwife'
    ? ['month']
    : user.role === 'tmo' || user.role === 'township medical officer'
      ? ['month', 'facility']
      : user.role === 'regional officer'
        ? ['month', 'facility', 'township']
        : ['month', 'facility', 'township', 'region']
  const result = await buildResultFromPages(
    { ...input, allowedModes: roleModes },
    readContributionPages(input, scope),
    scope
  )
  await cacheRef.set({
    ...result,
    expiresAt: new Date(Date.now() + V4_CACHE_TTL_MS)
  })
  return { ...result, cacheKey: key, source: 'server' }
})

const requestDashboardV4Export = onCall({
  region: REGION,
  timeoutSeconds: 60,
  memory: '1GiB'
}, async (request) => {
  const user = await authorizedUser(request)
  if (user.role === 'midwife') {
    throw new HttpsError('permission-denied', 'Excel export is available to TMO and above.')
  }
  const input = validateInput(request.data)
  const scope = allowedScope(user, input)
  const forcedMode = user.role === 'tmo' || user.role === 'township medical officer'
    ? 'facility'
    : user.role === 'regional officer' ? 'township' : 'region'
  const result = await buildResultFromPages(
    { ...input, allowedModes: [forcedMode] },
    readContributionPages(input, scope),
    scope
  )
  let ExcelJS
  try {
    ExcelJS = require('exceljs')
  } catch (error) {
    throw new HttpsError('failed-precondition', 'Excel export is not available on this server yet.')
  }
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'MNCH Dashboard'
  workbook.created = new Date()
  const summary = workbook.addWorksheet('Summary')
  summary.addRows([
    ['Dashboard export', 'MNCH Dashboard'],
    ['Date range', `${input.startDate} to ${input.endDate}`],
    ['Scope', JSON.stringify(scope)],
    ['Generated at', result.calculatedAt]
  ])
  const trend = workbook.addWorksheet('Trend')
  trend.addRow(['Group', 'Total Clients', 'ANC Clients', 'PNC Clients', 'Deliveries', 'Finalized Outcomes'])
  ;(result.seriesByDimension[forcedMode] || []).forEach((item) => trend.addRow([
    item.label,
    item.metrics.registration && item.metrics.registration.total || 0,
    item.metrics.anc && item.metrics.anc.clients || 0,
    item.metrics.pnc && item.metrics.pnc.clients || 0,
    item.metrics.delivery && item.metrics.delivery.completedNotes || 0,
    item.metrics.serviceClosure && item.metrics.serviceClosure.total || 0
  ]))
  const definitions = workbook.addWorksheet('Definitions')
  definitions.addRows([
    ['Schema', ANALYTICS_V4_SCHEMA_VERSION],
    ['Definition version', ANALYTICS_V4_DEFINITION_VERSION],
    ['Aggregation', `Role-fixed ${forcedMode} rows; no patient identifiers`]
  ])
  const buffer = await workbook.xlsx.writeBuffer()
  return {
    fileName: `mnch-dashboard-${input.startDate}-${input.endDate}.xlsx`,
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    base64: Buffer.from(buffer).toString('base64'),
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
  }
})

const getDashboardV4Result = onCall({ region: REGION }, async (request) => {
  await authorizedUser(request)
  const key = String(request.data && request.data.cacheKey || '')
  if (!/^[a-f0-9]{64}$/.test(key)) throw new HttpsError('invalid-argument', 'Invalid dashboard result key.')
  const snapshot = await db().collection(CACHE_COLLECTION).doc(key).get()
  if (!snapshot.exists) return { status: 'building' }
  return { status: 'ready', ...snapshot.data() }
})

const reconcileDashboardV4Cache = onSchedule({
  region: REGION,
  schedule: 'every 24 hours'
}, async () => {
  const expired = await db().collection(CACHE_COLLECTION)
    .where('expiresAt', '<', new Date())
    .limit(100)
    .get()
  const writer = db().bulkWriter()
  expired.docs.forEach((doc) => writer.delete(doc.ref))
  await writer.close()
})

module.exports = {
  queryDashboardV4,
  requestDashboardV4Export,
  getDashboardV4Result,
  reconcileDashboardV4Cache,
  dashboardV4DailyRefreshWorker,
  processDashboardV4DailyRefreshBatch,
  clearDashboardV4Cache,
  startDashboardV4Backfill,
  dashboardV4BackfillWorker,
  processDashboardV4BackfillBatch,
  authorizedUser,
  validateInput,
  allowedScope,
  buildResult,
  contributionMatches,
  monthsBetween
}
