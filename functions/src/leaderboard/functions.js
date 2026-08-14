'use strict';

const admin = require('firebase-admin');
const { FieldPath, FieldValue } = require('firebase-admin/firestore');
const { logger } = require('firebase-functions');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const {
  ALL_TIME_PERIOD,
  isLeaderboardPeriod,
  monthKeyForDate,
  timestampToDate,
  recentMonthKeys
} = require('./scoring');
const {
  recomputePatientMonths,
  rebuildProviderSummariesFromContributions
} = require('./service');
const { loadProvider, summaryRef } = require('./repository');

const REGION = 'us-central1';
const JOB_ID = 'leaderboard-v2-rebuild';
const JOB_COLLECTION = 'leaderboard_v2_jobs';
const PATIENT_BATCH_SIZE = 20;
const SUPPORTED_SUBCOLLECTIONS = new Set([
  'antenatal_visits',
  'postpartum_visits',
  'testRecords',
  'immediate_newborn_care',
  'newborn_care',
  'records'
]);
const SUPPORTED_RECORD_IDS = new Set([
  'summary',
  'startingTime',
  'secondStage',
  'transferRecord'
]);
const EVENT_DATE_FIELDS = [
  'visitDate',
  'testDate',
  'registration_date',
  'referralTime',
  'timestamp',
  'created_at',
  'createdAt',
  'updatedAt',
  'recordedAt',
  'lastUpdated'
];

function db() {
  return admin.firestore();
}

function dataFromSnapshot(snapshot) {
  return snapshot && snapshot.exists ? (snapshot.data() || {}) : {};
}

function monthsFromData(data) {
  const months = new Set();
  EVENT_DATE_FIELDS.forEach((field) => {
    const date = timestampToDate(data && data[field]);
    const month = date && monthKeyForDate(date);
    if (month) months.add(month);
  });
  return months;
}

function eventMonths(before, after) {
  const months = new Set([
    ...monthsFromData(dataFromSnapshot(before)),
    ...monthsFromData(dataFromSnapshot(after))
  ]);
  if (!months.size) months.add(monthKeyForDate(new Date()));
  return Array.from(months);
}

function periodsWithAllTime(months) {
  return Array.from(new Set([...(months || []), ALL_TIME_PERIOD]));
}

async function requireSuperAdmin(request) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in is required.');
  const user = await db().collection('users').doc(request.auth.uid).get();
  if (!user.exists || user.data().role !== 'Super Admin') {
    throw new HttpsError('permission-denied', 'Only Super Admin can rebuild summaries.');
  }
}

async function startRebuildJob(months, requestedBy) {
  const monthList = Array.from(new Set(months || [])).filter(isLeaderboardPeriod);
  if (!monthList.length) throw new Error('At least one valid month is required.');
  const jobRef = db().collection(JOB_COLLECTION).doc(JOB_ID);
  await jobRef.set({
    type: 'leaderboard-rebuild',
    months: monthList,
    status: 'running',
    lastPatientId: null,
    processedPatients: 0,
    requestedBy: requestedBy || 'scheduler',
    startedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    error: FieldValue.delete()
  }, { merge: true });
  return jobRef;
}

async function processActiveRebuildBatch() {
  const database = db();
  const jobRef = database.collection(JOB_COLLECTION).doc(JOB_ID);
  const jobSnapshot = await jobRef.get();
  if (!jobSnapshot.exists || jobSnapshot.data().status !== 'running') {
    return { status: 'idle' };
  }
  const job = jobSnapshot.data();
  const months = job.months || [];
  let query = database.collection('patients')
    .orderBy(FieldPath.documentId())
    .limit(PATIENT_BATCH_SIZE);
  if (job.lastPatientId) query = query.startAfter(job.lastPatientId);
  const patients = await query.get();

  if (patients.empty) {
    for (const month of months) {
      await rebuildProviderSummariesFromContributions(database, month);
    }
    await jobRef.set({
      status: 'complete',
      completedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    return { status: 'complete', months };
  }

  let processed = 0;
  for (const patient of patients.docs) {
    await recomputePatientMonths(database, patient.id, months);
    processed += 1;
  }
  const lastPatientId = patients.docs[patients.docs.length - 1].id;
  await jobRef.set({
    lastPatientId,
    processedPatients: Number(job.processedPatients || 0) + processed,
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });
  return { status: 'running', processed, lastPatientId };
}

const patientWritten = onDocumentWritten({
  document: 'patients/{patientId}',
  region: REGION,
  retry: true,
  maxInstances: 20
}, async (event) => {
  const before = dataFromSnapshot(event.data && event.data.before);
  const after = dataFromSnapshot(event.data && event.data.after);
  const ownerChanged =
    (before.created_by || before.createdBy || null) !==
    (after.created_by || after.createdBy || null);
  const months = ownerChanged
    ? recentMonthKeys(12)
    : eventMonths(event.data && event.data.before, event.data && event.data.after);
  await recomputePatientMonths(db(), event.params.patientId, periodsWithAllTime(months));
});

const patientActivityWritten = onDocumentWritten({
  document: 'patients/{patientId}/{subcollection}/{documentId}',
  region: REGION,
  retry: true,
  maxInstances: 40
}, async (event) => {
  const subcollection = event.params.subcollection;
  if (!SUPPORTED_SUBCOLLECTIONS.has(subcollection)) return;
  if (subcollection === 'records' && !SUPPORTED_RECORD_IDS.has(event.params.documentId)) return;
  const months = eventMonths(event.data && event.data.before, event.data && event.data.after);
  await recomputePatientMonths(db(), event.params.patientId, periodsWithAllTime(months));
});

const providerWritten = onDocumentWritten({
  document: 'users/{providerId}',
  region: REGION,
  retry: true,
  maxInstances: 10
}, async (event) => {
  if (!event.data || !event.data.after || !event.data.after.exists) return;
  const after = dataFromSnapshot(event.data && event.data.after);
  const role = String(after.role || '').toLowerCase();
  if (role && role !== 'midwife') return;
  const metadata = await loadProvider(db(), event.params.providerId);
  const writer = db().bulkWriter();
  periodsWithAllTime(recentMonthKeys(12)).forEach((month) => {
    writer.set(summaryRef(db(), month, event.params.providerId), {
      providerId: metadata.providerId,
      providerName: metadata.providerName,
      providerType: metadata.providerType,
      township: metadata.township,
      region: metadata.region,
      calculatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
  });
  await writer.close();
});

const startLeaderboardRebuild = onCall({
  region: REGION,
  timeoutSeconds: 120,
  memory: '256MiB',
  enforceAppCheck: false
}, async (request) => {
  await requireSuperAdmin(request);
  const requestedCount = Number(request.data && request.data.months || 12);
  const count = Math.min(12, Math.max(1, Math.floor(requestedCount)));
  const months = periodsWithAllTime(recentMonthKeys(count));
  await startRebuildJob(months, request.auth.uid);
  const firstBatch = await processActiveRebuildBatch();
  return { success: true, months, firstBatch };
});

const leaderboardNightlyReconciliation = onSchedule({
  schedule: '0 0 * * *',
  timeZone: 'Asia/Yangon',
  region: REGION,
  timeoutSeconds: 120,
  memory: '256MiB'
}, async () => {
  await startRebuildJob(periodsWithAllTime(recentMonthKeys(1)), 'nightly-scheduler');
  return processActiveRebuildBatch();
});

const leaderboardReconciliationWorker = onSchedule({
  schedule: 'every 15 minutes',
  timeZone: 'Asia/Yangon',
  region: REGION,
  timeoutSeconds: 540,
  memory: '512MiB',
  maxInstances: 1
}, async () => {
  try {
    return await processActiveRebuildBatch();
  } catch (error) {
    logger.error('Leaderboard reconciliation batch failed', error);
    await db().collection(JOB_COLLECTION).doc(JOB_ID).set({
      error: error.message || String(error),
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    throw error;
  }
});

module.exports = {
  patientWritten,
  patientActivityWritten,
  providerWritten,
  startLeaderboardRebuild,
  leaderboardNightlyReconciliation,
  leaderboardReconciliationWorker,
  processActiveRebuildBatch,
  eventMonths
};
