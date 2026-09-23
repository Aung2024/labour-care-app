'use strict'

const crypto = require('node:crypto')
const admin = require('firebase-admin')
const { FieldPath, FieldValue } = require('firebase-admin/firestore')
const { onSchedule } = require('firebase-functions/v2/scheduler')
const {
  loadPatientActivity,
  loadProvider
} = require('../leaderboard/repository')
const { recomputeLoadedPatientMonths } = require('../leaderboard/service')
const {
  buildPatientAchievements,
  monthKeyForDate
} = require('../leaderboard/scoring')
const { eventMonths, periodsWithAllTime } = require('../leaderboard/functions')
const { recomputeLoadedPatientQualityMonths } = require('../quality/service')
const {
  normalizeClinicalFacts,
  mergeLinkedNewbornVisits
} = require('./repository')
const {
  HRT_COLLECTION,
  KMC_COLLECTION
} = require('./projections')
const {
  savePatientProjections,
  projectionScopeWithProvider,
  projectionHash
} = require('./tracking-repository')
const { refreshPatientAnalyticsV3 } = require('./v3-service')

const REGION = 'us-central1'
const UNIFIED_QUEUE = 'clinical_refresh_v1_queue'
const TRACKING_QUEUE = 'tracking_v2_refresh_queue'
const LEADERBOARD_QUEUE = 'leaderboard_v3_refresh_queue'
const COMPATIBILITY_QUEUES = Object.freeze([
  UNIFIED_QUEUE,
  TRACKING_QUEUE,
  LEADERBOARD_QUEUE
])
const QUEUE_BATCH_SIZE = 100
const REFRESH_CONCURRENCY = 10
const WORKER_LOCK_COLLECTION = 'clinical_refresh_v1_locks'
const WORKER_LOCK_ID = 'unified-worker'
const WORKER_LEASE_MS = 9 * 60 * 1000

const mapInChunks = async (items, size, worker) => {
  const results = []
  for (let offset = 0; offset < items.length; offset += size) {
    results.push(...await Promise.all(items.slice(offset, offset + size).map(worker)))
  }
  return results
}

const snapshotLike = (data) => ({
  exists: Boolean(data && typeof data === 'object'),
  data: () => data || {}
})

const periodsForLoadedPatient = (loaded, now) => {
  const patient = loaded && loaded.patient
  const activity = loaded && loaded.activity || {}
  const months = new Set()
  const addDataMonths = (data) => {
    eventMonths(null, snapshotLike(data), { fallbackToCurrent: false })
      .forEach((month) => months.add(month))
  }

  if (patient) addDataMonths(patient)
  Object.values(activity).forEach((value) => {
    if (Array.isArray(value)) value.forEach(addDataMonths)
    else if (value) addDataMonths(value)
  })
  buildPatientAchievements(patient || {}, activity).forEach((achievement) => {
    const month = monthKeyForDate(achievement.achievedAt)
    if (month) months.add(month)
  })
  if (!months.size) months.add(monthKeyForDate(now || new Date()))
  return periodsWithAllTime(Array.from(months))
}

const enqueueClinicalRefresh = async (database, patientId, reason, metadata) => {
  if (!patientId) return null
  const db = database || admin.firestore()
  const ref = db.collection(UNIFIED_QUEUE).doc(patientId)
  await ref.set({
    patientId,
    reason: String(reason || 'clinical-write'),
    sourcePath: metadata && metadata.sourcePath || '',
    status: 'pending',
    requestedAt: FieldValue.serverTimestamp(),
    attempts: FieldValue.increment(1)
  }, { merge: true })
  return ref
}

const queuedPatientsFromSnapshots = (snapshots) => {
  const patients = new Map()
  snapshots.forEach((snapshot, index) => {
    const collection = COMPATIBILITY_QUEUES[index]
    snapshot.docs.forEach((doc) => {
      const patientId = String(doc.get('patientId') || doc.id)
      if (!patientId) return
      if (!patients.has(patientId)) patients.set(patientId, [])
      patients.get(patientId).push({ collection, ref: doc.ref })
    })
  })
  return patients
}

const readUnifiedQueueBatch = async (db, limit = QUEUE_BATCH_SIZE) => {
  const snapshots = await Promise.all(COMPATIBILITY_QUEUES.map((collection) =>
    db.collection(collection).orderBy(FieldPath.documentId()).limit(limit).get()
  ))
  return queuedPatientsFromSnapshots(snapshots)
}

const acquireWorkerLease = async (db, nowMillis) => {
  const ref = db.collection(WORKER_LOCK_COLLECTION).doc(WORKER_LOCK_ID)
  const token = crypto.randomUUID()
  const now = Number(nowMillis || Date.now())
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref)
    const lock = snapshot.exists ? snapshot.data() : {}
    if (Number(lock.leaseUntilMillis || 0) > now) return null
    transaction.set(ref, {
      token,
      status: 'running',
      leaseUntilMillis: now + WORKER_LEASE_MS,
      acquiredAt: FieldValue.serverTimestamp()
    }, { merge: true })
    return token
  })
}

const releaseWorkerLease = async (db, token) => {
  if (!token) return false
  const ref = db.collection(WORKER_LOCK_COLLECTION).doc(WORKER_LOCK_ID)
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref)
    if (!snapshot.exists || snapshot.get('token') !== token) return false
    transaction.set(ref, {
      status: 'idle',
      leaseUntilMillis: 0,
      releasedAt: FieldValue.serverTimestamp()
    }, { merge: true })
    return true
  })
}

const deletePatientProjections = async (db, patientId) => {
  const kmc = await db.collection(KMC_COLLECTION)
    .where('patientId', '==', patientId)
    .get()
  const writer = db.bulkWriter()
  writer.delete(db.collection(HRT_COLLECTION).doc(patientId))
  kmc.docs.forEach((doc) => writer.delete(doc.ref))
  await writer.close()
}

const refreshLoadedClinicalProducts = async (
  db,
  patientId,
  loaded,
  now,
  options
) => {
  const periods = new Set(periodsForLoadedPatient(loaded, now))
  const existingLeaderboard = await db.collection('leaderboard_v2_contributions')
    .where('patientId', '==', patientId)
    .get()
  existingLeaderboard.forEach((doc) => {
    const month = doc.get('month')
    if (month) periodsWithAllTime([month]).forEach((period) => periods.add(period))
  })

  let facts = normalizeClinicalFacts(patientId, loaded)
  if (facts) facts = await mergeLinkedNewbornVisits(db, facts)
  if (facts && facts.scope && facts.scope.providerId) {
    const provider = await loadProvider(db, facts.scope.providerId)
    facts.scope = projectionScopeWithProvider(facts.scope, provider)
  }

  if (facts) {
    await savePatientProjections(db, facts, { asOf: now || new Date() })
    const existingFlags = facts.profile && facts.profile.infection_flags || {}
    if (projectionHash(existingFlags) !== projectionHash(facts.infectionFlags || {})) {
      await db.collection('patients').doc(patientId).set({
        infection_flags: facts.infectionFlags || {},
        infection_alert_updated_at: FieldValue.serverTimestamp()
      }, { merge: true })
    }
  } else {
    await deletePatientProjections(db, patientId)
  }
  await recomputeLoadedPatientMonths(
    db,
    patientId,
    Array.from(periods),
    loaded
  )
  const qualityMonths = Array.from(periods).filter((period) =>
    period === 'all' || /^\d{4}-\d{2}$/.test(period)
  )
  await recomputeLoadedPatientQualityMonths(
    db,
    patientId,
    qualityMonths,
    loaded,
    now
  )
  await refreshPatientAnalyticsV3(db, facts, {
    patientId,
    generation: options && options.generation || 'live'
  })
  return {
    patientId,
    periods: Array.from(periods),
    deleted: !facts
  }
}

const refreshClinicalPatient = async (database, patientId, now, options) => {
  const db = database || admin.firestore()
  const loaded = await loadPatientActivity(db, patientId)
  const result = await refreshLoadedClinicalProducts(db, patientId, loaded, now, options)
  const patient = loaded && loaded.patient || {}
  const motherPatientId = patient.mother_patient_id || patient.motherPatientId || ''
  if (motherPatientId && motherPatientId !== patientId &&
      !(options && options.skipRelatedMother)) {
    const motherLoaded = await loadPatientActivity(db, motherPatientId)
    result.relatedMother = await refreshLoadedClinicalProducts(
      db,
      motherPatientId,
      motherLoaded,
      now,
      { ...(options || {}), skipRelatedMother: true }
    )
  }
  return result
}

const processUnifiedRefreshQueue = async (database, now, options) => {
  const db = database || admin.firestore()
  const lease = await acquireWorkerLease(db)
  if (!lease) return { processed: 0, failed: 0, remainingPossible: true, locked: true }
  const started = Date.now()
  const maxRuntimeMs = Number(options && options.maxRuntimeMs || 480000)
  const concurrency = Math.max(
    1,
    Number(options && options.concurrency || REFRESH_CONCURRENCY)
  )
  let processed = 0
  let failed = 0
  let remainingPossible = false

  try {
    while (Date.now() - started < maxRuntimeMs) {
      const queued = await readUnifiedQueueBatch(db)
      if (!queued.size) {
        remainingPossible = false
        break
      }
      const entries = Array.from(queued.entries())
      const results = await mapInChunks(entries, concurrency, async ([patientId, sources]) => {
        try {
          await refreshClinicalPatient(db, patientId, now)
          await Promise.all(sources.map((source) => source.ref.delete()))
          return true
        } catch (error) {
          console.error('Unified clinical refresh failed', patientId, error)
          failed += 1
          await db.collection(UNIFIED_QUEUE).doc(patientId).set({
            patientId,
            status: 'failed',
            lastError: String(error && error.message || error).slice(0, 1000),
            lastFailedAt: FieldValue.serverTimestamp()
          }, { merge: true })
          return false
        }
      })
      processed += results.filter(Boolean).length
      remainingPossible = entries.length >= QUEUE_BATCH_SIZE || failed > 0
      if (failed || entries.length < QUEUE_BATCH_SIZE) break
    }
    return { processed, failed, remainingPossible }
  } finally {
    await releaseWorkerLease(db, lease)
  }
}

const unifiedClinicalRefreshWorker = onSchedule({
  schedule: 'every 5 minutes',
  timeZone: 'Asia/Yangon',
  region: REGION,
  timeoutSeconds: 540,
  memory: '1GiB',
  maxInstances: 1,
  concurrency: 1
}, () => processUnifiedRefreshQueue())

// The old processors and exported function names remain aliases while clients
// migrate from the two legacy queue collections to the unified queue.
const processTrackingRefreshBatch = processUnifiedRefreshQueue
const processLeaderboardRefreshQueue = processUnifiedRefreshQueue
const trackingRefreshQueueWorker = unifiedClinicalRefreshWorker
const leaderboardDailyRefreshWorker = unifiedClinicalRefreshWorker

module.exports = {
  UNIFIED_QUEUE,
  TRACKING_QUEUE,
  LEADERBOARD_QUEUE,
  COMPATIBILITY_QUEUES,
  periodsForLoadedPatient,
  enqueueClinicalRefresh,
  queuedPatientsFromSnapshots,
  readUnifiedQueueBatch,
  acquireWorkerLease,
  releaseWorkerLease,
  refreshLoadedClinicalProducts,
  refreshClinicalPatient,
  processUnifiedRefreshQueue,
  processTrackingRefreshBatch,
  processLeaderboardRefreshQueue,
  unifiedClinicalRefreshWorker,
  trackingRefreshQueueWorker,
  leaderboardDailyRefreshWorker
}
