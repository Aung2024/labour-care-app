'use strict'

const admin = require('firebase-admin')
const { FieldPath, FieldValue } = require('firebase-admin/firestore')
const { onCall, HttpsError } = require('firebase-functions/v2/https')
const { onSchedule } = require('firebase-functions/v2/scheduler')
const { logger } = require('firebase-functions')
const { refreshClinicalPatient } = require('./refresh-queue-functions')

const REGION = 'us-central1'
const RECONCILIATION_JOB_COLLECTION = 'analytics_v3_jobs'
const RECONCILIATION_JOB_ID = 'dashboard-summary-reconciliation'
const RECONCILIATION_INTERVAL_MS = 48 * 60 * 60 * 1000
const RECONCILIATION_BATCH_SIZE = 100
const RECONCILIATION_CONCURRENCY = 10

const db = () => admin.firestore()

const requireSuperAdmin = async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in is required.')
  const user = await db().collection('users').doc(request.auth.uid).get()
  if (!user.exists || user.get('role') !== 'Super Admin') {
    throw new HttpsError(
      'permission-denied',
      'Only Super Admin can reconcile dashboard summaries.'
    )
  }
}

const reconciliationJobRef = (database) => (database || db())
  .collection(RECONCILIATION_JOB_COLLECTION)
  .doc(RECONCILIATION_JOB_ID)

const shouldStartReconciliation = (job, now) => {
  if (!job) return true
  if (job.status === 'running') return false
  const completed = Number(job.lastCompletedAtMillis || 0)
  return !completed || (now || Date.now()) - completed >= RECONCILIATION_INTERVAL_MS
}

const startAnalyticsV3Reconciliation = async (
  database,
  requestedBy,
  now,
  force
) => {
  const firestore = database || db()
  const ref = reconciliationJobRef(firestore)
  const startedAt = now instanceof Date ? now : new Date(now || Date.now())
  return firestore.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref)
    const previous = snapshot.exists ? snapshot.data() : null
    if (previous && previous.status === 'running') {
      return {
        alreadyRunning: true,
        generation: previous.generation,
        status: 'running'
      }
    }
    if (!force && !shouldStartReconciliation(previous, startedAt.getTime())) {
      return {
        alreadyRunning: false,
        skipped: true,
        generation: previous && previous.generation || 0,
        status: previous && previous.status || 'complete'
      }
    }
    const generation = Number(previous && previous.generation || 0) + 1
    transaction.set(ref, {
      type: 'analytics-v3-reconciliation',
      status: 'running',
      generation,
      cursor: null,
      processedPatients: 0,
      failedPatients: 0,
      lastErrors: {},
      requestedBy: requestedBy || '48-hour-scheduler',
      startedAt: FieldValue.serverTimestamp(),
      startedAtMillis: startedAt.getTime(),
      updatedAt: FieldValue.serverTimestamp(),
      completedAt: FieldValue.delete()
    }, { merge: true })
    return {
      alreadyRunning: false,
      skipped: false,
      generation,
      status: 'running'
    }
  })
}

const mapWithConcurrency = async (items, concurrency, worker) => {
  const output = []
  for (let offset = 0; offset < items.length; offset += concurrency) {
    output.push(...await Promise.all(
      items.slice(offset, offset + concurrency).map(worker)
    ))
  }
  return output
}

const processAnalyticsV3ReconciliationBatch = async (
  database,
  now,
  options
) => {
  const firestore = database || db()
  const ref = reconciliationJobRef(firestore)
  const jobSnapshot = await ref.get()
  if (!jobSnapshot.exists || jobSnapshot.get('status') !== 'running') {
    return { status: 'idle' }
  }
  const job = jobSnapshot.data()
  const batchSize = Math.max(
    1,
    Number(options && options.batchSize || RECONCILIATION_BATCH_SIZE)
  )
  const concurrency = Math.max(
    1,
    Number(options && options.concurrency || RECONCILIATION_CONCURRENCY)
  )
  let query = firestore.collection('patients')
    .orderBy(FieldPath.documentId())
    .limit(batchSize)
  if (job.cursor) query = query.startAfter(job.cursor)
  const patients = await query.get()

  if (patients.empty) {
    const completedAt = now instanceof Date ? now : new Date(now || Date.now())
    const status = Number(job.failedPatients || 0) > 0
      ? 'complete_with_errors'
      : 'complete'
    await ref.set({
      status,
      completedAt: FieldValue.serverTimestamp(),
      lastCompletedAtMillis: completedAt.getTime(),
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true })
    return {
      status,
      generation: job.generation,
      processedPatients: Number(job.processedPatients || 0),
      failedPatients: Number(job.failedPatients || 0)
    }
  }

  const results = await mapWithConcurrency(
    patients.docs,
    concurrency,
    async (patient) => {
      try {
        await refreshClinicalPatient(
          firestore,
          patient.id,
          now || new Date(),
          { generation: `reconciliation-${job.generation}` }
        )
        return { patientId: patient.id, success: true }
      } catch (error) {
        logger.error('Analytics-v3 reconciliation patient failed', {
          patientId: patient.id,
          generation: job.generation,
          error
        })
        return {
          patientId: patient.id,
          success: false,
          error: String(error && error.message || error).slice(0, 500)
        }
      }
    }
  )
  const failures = results.filter((result) => !result.success)
  const lastErrors = {}
  failures.slice(-20).forEach((failure) => {
    lastErrors[failure.patientId] = failure.error
  })
  const lastPatientId = patients.docs[patients.docs.length - 1].id
  await ref.set({
    cursor: lastPatientId,
    processedPatients: FieldValue.increment(patients.size),
    failedPatients: FieldValue.increment(failures.length),
    lastErrors: failures.length ? lastErrors : job.lastErrors || {},
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true })
  return {
    status: 'running',
    generation: job.generation,
    processed: patients.size,
    failed: failures.length,
    cursor: lastPatientId
  }
}

const processAnalyticsV3ReconciliationUntilDeadline = async (
  database,
  now,
  maxRuntimeMs = 480000
) => {
  const started = Date.now()
  let processed = 0
  let failed = 0
  let result = { status: 'idle' }
  while (Date.now() - started < maxRuntimeMs) {
    result = await processAnalyticsV3ReconciliationBatch(database, now)
    processed += Number(result.processed || 0)
    failed += Number(result.failed || 0)
    if (result.status !== 'running') break
  }
  return {
    ...result,
    processedThisRun: processed,
    failedThisRun: failed,
    deadlineReached: result.status === 'running'
  }
}

const startDashboardV3Reconciliation = onCall({
  region: REGION,
  timeoutSeconds: 60,
  memory: '256MiB',
  enforceAppCheck: false
}, async (request) => {
  await requireSuperAdmin(request)
  return startAnalyticsV3Reconciliation(
    db(),
    request.auth.uid,
    new Date(),
    true
  )
})

const dashboardV3ReconciliationWorker = onSchedule({
  // The worker wakes frequently only while a generation is active. A new
  // generation is started when the previous full pass is at least 48h old.
  schedule: 'every 5 minutes',
  timeZone: 'Asia/Yangon',
  region: REGION,
  timeoutSeconds: 540,
  memory: '1GiB',
  maxInstances: 1,
  concurrency: 1
}, async () => {
  const firestore = db()
  const ref = reconciliationJobRef(firestore)
  const snapshot = await ref.get()
  const current = snapshot.exists ? snapshot.data() : null
  if (!current || current.status !== 'running') {
    await startAnalyticsV3Reconciliation(
      firestore,
      '48-hour-scheduler',
      new Date(),
      false
    )
  }
  return processAnalyticsV3ReconciliationUntilDeadline(firestore, new Date())
})

module.exports = {
  RECONCILIATION_JOB_COLLECTION,
  RECONCILIATION_JOB_ID,
  RECONCILIATION_INTERVAL_MS,
  RECONCILIATION_BATCH_SIZE,
  RECONCILIATION_CONCURRENCY,
  shouldStartReconciliation,
  startAnalyticsV3Reconciliation,
  mapWithConcurrency,
  processAnalyticsV3ReconciliationBatch,
  processAnalyticsV3ReconciliationUntilDeadline,
  startDashboardV3Reconciliation,
  dashboardV3ReconciliationWorker
}
