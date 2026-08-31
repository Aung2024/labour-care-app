'use strict';

const admin = require('firebase-admin');
const { FieldPath, FieldValue } = require('firebase-admin/firestore');
const { logger } = require('firebase-functions');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const {
  analyticsPeriodsForDate
} = require('./metrics');
const {
  saveAnalyticsContributions,
  rebuildAnalyticsScopes
} = require('./service');
const { normalizeClinicalFacts } = require('./repository');
const { loadPatientActivity } = require('../leaderboard/repository');
const {
  recomputeLoadedPatientMonths,
  rebuildProviderSummariesFromContributions
} = require('../leaderboard/service');
const {
  ALL_TIME_PERIOD,
  monthKeyForDate
} = require('../leaderboard/scoring');

const REGION = 'us-central1';
const JOB_COLLECTION = 'analytics_v2_jobs';
const JOB_ID = 'dashboard-v2-rebuild';
const PATIENT_BATCH_SIZE = 5;

function db() {
  return admin.firestore();
}

async function requireSuperAdmin(request) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in is required.');
  const user = await db().collection('users').doc(request.auth.uid).get();
  if (!user.exists || user.data().role !== 'Super Admin') {
    throw new HttpsError('permission-denied', 'Only Super Admin can rebuild dashboard summaries.');
  }
}

async function startDashboardJob(requestedBy, now) {
  const requestedAt = now || new Date();
  const periods = analyticsPeriodsForDate(requestedAt);
  const runId = 'dashboard-v2-' + requestedAt.getTime();
  const jobRef = db().collection(JOB_COLLECTION).doc(JOB_ID);
  return db().runTransaction(async (transaction) => {
    const existing = await transaction.get(jobRef);
    if (existing.exists && existing.data().status === 'running') {
      const job = existing.data();
      return {
        jobRef,
        periods: periodsFromJob(job),
        runId: job.runId,
        alreadyRunning: true
      };
    }
    transaction.set(jobRef, {
      type: 'dashboard-v2-rebuild',
      status: 'running',
      runId,
      periods: periods.map((period) => ({
        key: period.key,
        type: period.type,
        start: period.start ? period.start.toISOString() : null,
        end: period.end ? period.end.toISOString() : null
      })),
      lastPatientId: null,
      processedPatients: 0,
      requestedBy: requestedBy || 'scheduler',
      startedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      error: FieldValue.delete()
    }, { merge: true });
    return { jobRef, periods, runId, alreadyRunning: false };
  });
}

function periodsFromJob(job) {
  return (job.periods || []).map((period) => ({
    key: period.key,
    type: period.type,
    start: period.start ? new Date(period.start) : null,
    end: period.end ? new Date(period.end) : null
  }));
}

async function processActiveDashboardBatch() {
  const database = db();
  const jobRef = database.collection(JOB_COLLECTION).doc(JOB_ID);
  const jobSnapshot = await jobRef.get();
  if (!jobSnapshot.exists || jobSnapshot.data().status !== 'running') {
    return { status: 'idle' };
  }
  const job = jobSnapshot.data();
  const periods = periodsFromJob(job);
  let query = database.collection('patients')
    .orderBy(FieldPath.documentId())
    .limit(PATIENT_BATCH_SIZE);
  if (job.lastPatientId) query = query.startAfter(job.lastPatientId);
  const patients = await query.get();

  if (patients.empty) {
    for (const period of periods) {
      await rebuildAnalyticsScopes(database, period, job.runId);
    }
    await rebuildProviderSummariesFromContributions(database, ALL_TIME_PERIOD);
    await rebuildProviderSummariesFromContributions(database, monthKeyForDate(new Date()));
    await rebuildProviderSummariesFromContributions(
      database,
      monthKeyForDate(new Date()).slice(0, 4)
    );
    await jobRef.set({
      status: 'complete',
      completedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    return { status: 'complete', periods: periods.map((period) => period.key) };
  }

  let processed = 0;
  for (const patient of patients.docs) {
    // One clinical load serves both products. No second per-patient fan-out.
    const loaded = await loadPatientActivity(database, patient.id);
    const facts = normalizeClinicalFacts(patient.id, loaded);
    if (facts) {
      await saveAnalyticsContributions(database, facts, periods, job.runId);
      await recomputeLoadedPatientMonths(database, patient.id, [
        ALL_TIME_PERIOD,
        monthKeyForDate(new Date()),
        monthKeyForDate(new Date()).slice(0, 4)
      ], loaded);
    }
    processed += 1;
    await jobRef.set({
      lastPatientId: patient.id,
      processedPatients: FieldValue.increment(1),
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
  }
  return {
    status: 'running',
    processed,
    lastPatientId: patients.docs[patients.docs.length - 1].id
  };
}

const startDashboardV2Rebuild = onCall({
  region: REGION,
  timeoutSeconds: 120,
  memory: '256MiB',
  enforceAppCheck: false
}, async (request) => {
  await requireSuperAdmin(request);
  const started = await startDashboardJob(request.auth.uid);
  return {
    success: true,
    status: 'queued',
    periods: started.periods.map((period) => period.key),
    runId: started.runId,
    alreadyRunning: started.alreadyRunning
  };
});

const dashboardV2ReconciliationWorker = onSchedule({
  schedule: 'every 15 minutes',
  timeZone: 'Asia/Yangon',
  region: REGION,
  timeoutSeconds: 540,
  memory: '512MiB',
  maxInstances: 1,
  concurrency: 1
}, async () => {
  try {
    return await processActiveDashboardBatch();
  } catch (error) {
    logger.error('Dashboard V2 reconciliation batch failed', error);
    await db().collection(JOB_COLLECTION).doc(JOB_ID).set({
      error: error.message || String(error),
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    throw error;
  }
});

const combinedAnalyticsReconciliation = onSchedule({
  schedule: 'every 72 hours',
  timeZone: 'Asia/Yangon',
  region: REGION,
  timeoutSeconds: 120,
  memory: '256MiB'
}, async () => {
  const jobRef = db().collection(JOB_COLLECTION).doc(JOB_ID);
  const snapshot = await jobRef.get();
  if (!snapshot.exists || snapshot.data().status !== 'running') {
    await startDashboardJob('72-hour-scheduler');
  }
  return processActiveDashboardBatch();
});

module.exports = {
  startDashboardV2Rebuild,
  dashboardV2ReconciliationWorker,
  combinedAnalyticsReconciliation,
  startDashboardJob,
  processActiveDashboardBatch
};
