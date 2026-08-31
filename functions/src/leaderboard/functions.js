'use strict';

const admin = require('firebase-admin');
const { FieldPath, FieldValue } = require('firebase-admin/firestore');
const { logger } = require('firebase-functions');
const functionsV1 = require('firebase-functions/v1');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const {
  ALL_TIME_PERIOD,
  CATEGORY_KEYS,
  emptyCategories,
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
// Firestore is in asia-southeast3 (Bangkok). Eventarc 2nd-gen document
// triggers do not support that region yet, so live patient/user triggers
// use 1st-gen Firestore functions in us-central1, matching the existing
// admin Functions.
const JOB_ID = 'leaderboard-v2-rebuild';
const JOB_COLLECTION = 'leaderboard_v2_jobs';
const PATIENT_BATCH_SIZE = 10;
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
  'transferRecord',
  'deliveryNotes',
  'thirdStage'
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
  const periods = new Set([...(months || []), ALL_TIME_PERIOD]);
  (months || []).forEach((month) => {
    if (/^\d{4}-\d{2}$/.test(month)) periods.add(month.slice(0, 4));
  });
  return Array.from(periods);
}

async function requireSuperAdmin(request) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in is required.');
  const user = await db().collection('users').doc(request.auth.uid).get();
  if (!user.exists || user.data().role !== 'Super Admin') {
    throw new HttpsError('permission-denied', 'Only Super Admin can rebuild summaries.');
  }
}

function normalizeDateKey(value) {
  const text = String(value || '');
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

async function queryLeaderboardRange(request) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in is required.');
  const userSnapshot = await db().collection('users').doc(request.auth.uid).get();
  if (!userSnapshot.exists) throw new HttpsError('permission-denied', 'User profile is required.');
  const user = userSnapshot.data() || {};
  const start = normalizeDateKey(request.data && request.data.start);
  const end = normalizeDateKey(request.data && request.data.end);
  if (!start || !end || start > end) {
    throw new HttpsError('invalid-argument', 'A valid start and end date are required.');
  }
  const dayCount = Math.floor((new Date(end + 'T00:00:00Z') -
    new Date(start + 'T00:00:00Z')) / 86400000) + 1;
  if (dayCount > 366) {
    throw new HttpsError('invalid-argument', 'Custom ranges are limited to 366 days.');
  }

  let query = db().collection('leaderboard_v3_daily')
    .where('day', '>=', start)
    .where('day', '<=', end);
  const role = String(user.role || '').toLowerCase();
  if (role === 'regional officer') query = query.where('region', '==', user.region || '');
  if (role === 'tmo') query = query.where('township', '==', user.township || '');
  if (role === 'midwife') query = query.where('providerId', '==', request.auth.uid);
  if (!['super admin', 'admin', 'central', 'regional officer', 'tmo', 'midwife'].includes(role)) {
    throw new HttpsError('permission-denied', 'This account cannot query leaderboard data.');
  }

  const snapshot = await query.get();
  const requested = request.data || {};
  const facilityTypes = Array.isArray(requested.facilityTypes)
    ? requested.facilityTypes.map(String).slice(0, 10)
    : [];
  const totals = new Map();
  snapshot.forEach((doc) => {
    const row = doc.data() || {};
    if (requested.region && row.region !== requested.region) return;
    if (requested.township && row.township !== requested.township) return;
    if (requested.department && row.department !== requested.department) return;
    if (facilityTypes.length && !facilityTypes.includes(row.facilityType)) return;
    const current = totals.get(row.providerId) || {
      providerId: row.providerId,
      providerName: row.providerName,
      providerType: row.providerType,
      township: row.township,
      region: row.region,
      facilityCode: row.facilityCode || '',
      department: row.department || 'other',
      facilityType: row.facilityType || 'other',
      score: 0,
      activePatientCount: 0,
      categories: emptyCategories()
    };
    current.score += Number(row.score || 0);
    current.activePatientCount += Number(row.activePatientCount || 0);
    CATEGORY_KEYS.forEach((key) => {
      current.categories[key] += Number(row.categories && row.categories[key] || 0);
    });
    current.calculatedAt = new Date().toISOString();
    totals.set(row.providerId, current);
  });
  return {
    scoreVersion: require('./scoring').SCORE_VERSION,
    start,
    end,
    providers: Array.from(totals.values()).sort((a, b) => b.score - a.score)
  };
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
    // Persist every completed patient so a cross-region timeout retries only
    // the current patient instead of repeating the whole batch.
    await jobRef.set({
      lastPatientId: patient.id,
      processedPatients: FieldValue.increment(1),
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
  }
  const lastPatientId = patients.docs[patients.docs.length - 1].id;
  return { status: 'running', processed, lastPatientId };
}

const patientWritten = functionsV1
  .region(REGION)
  .runWith({
    failurePolicy: true,
    memory: '256MB',
    timeoutSeconds: 120,
    maxInstances: 20
  })
  .firestore.document('patients/{patientId}')
  .onWrite(async (change, context) => {
    const before = dataFromSnapshot(change.before);
    const after = dataFromSnapshot(change.after);
    const ownerChanged =
      (before.created_by || before.createdBy || null) !==
      (after.created_by || after.createdBy || null);
    const months = ownerChanged
      ? recentMonthKeys(12)
      : eventMonths(change.before, change.after);
    await recomputePatientMonths(db(), context.params.patientId, periodsWithAllTime(months));
  });

const patientActivityWritten = functionsV1
  .region(REGION)
  .runWith({
    failurePolicy: true,
    memory: '256MB',
    timeoutSeconds: 120,
    maxInstances: 40
  })
  .firestore.document('patients/{patientId}/{subcollection}/{documentId}')
  .onWrite(async (change, context) => {
    const subcollection = context.params.subcollection;
    if (!SUPPORTED_SUBCOLLECTIONS.has(subcollection)) return;
    if (subcollection === 'records' && !SUPPORTED_RECORD_IDS.has(context.params.documentId)) {
      return;
    }
    const months = eventMonths(change.before, change.after);
    await recomputePatientMonths(db(), context.params.patientId, periodsWithAllTime(months));
  });

const providerWritten = functionsV1
  .region(REGION)
  .runWith({
    failurePolicy: true,
    memory: '256MB',
    timeoutSeconds: 120,
    maxInstances: 10
  })
  .firestore.document('users/{providerId}')
  .onWrite(async (change, context) => {
    if (!change.after.exists) return;
    const after = dataFromSnapshot(change.after);
    const role = String(after.role || '').toLowerCase();
    if (role && role !== 'midwife') return;
    const metadata = await loadProvider(db(), context.params.providerId);
    const writer = db().bulkWriter();
    periodsWithAllTime(recentMonthKeys(12)).forEach((month) => {
      writer.set(summaryRef(db(), month, context.params.providerId), {
        providerId: metadata.providerId,
        providerName: metadata.providerName,
        providerType: metadata.providerType,
        township: metadata.township,
        region: metadata.region,
        phone: metadata.phone || '',
        facilityCode: metadata.facilityCode || '',
        department: metadata.department || 'other',
        facilityType: metadata.facilityType || 'other',
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
  const requestedCount = Number(request.data && request.data.months || 4);
  const count = Math.min(12, Math.max(1, Math.floor(requestedCount)));
  const currentYear = Number(monthKeyForDate(new Date()).slice(0, 4));
  const years = Array.from({ length: 5 }, (_, offset) => String(currentYear - offset));
  const months = Array.from(new Set([
    ...periodsWithAllTime(recentMonthKeys(count)),
    ...years
  ]));
  await startRebuildJob(months, request.auth.uid);
  // Return as soon as the job is queued. Processing a patient batch here can
  // exceed the callable timeout because Firestore is in Bangkok while the
  // nearest supported Functions runtime is in us-central1. The scheduled
  // worker resumes the job safely in the background.
  return { success: true, months, status: 'queued' };
});

const getLeaderboardCustomRange = onCall({
  region: REGION,
  timeoutSeconds: 120,
  memory: '256MiB',
  enforceAppCheck: false
}, queryLeaderboardRange);

const leaderboardNightlyReconciliation = onSchedule({
  schedule: 'every 72 hours',
  timeZone: 'Asia/Yangon',
  region: REGION,
  timeoutSeconds: 120,
  memory: '256MiB'
}, async () => {
  const jobRef = db().collection(JOB_COLLECTION).doc(JOB_ID);
  const jobSnapshot = await jobRef.get();
  if (jobSnapshot.exists && jobSnapshot.data().status === 'running') {
    return processActiveRebuildBatch();
  }
  // Dashboard V2's combined reconciliation now loads every patient's
  // clinical facts once and refreshes both analytics products. Keep this
  // schedule only as a safe continuation path for an already-running legacy
  // leaderboard job so the two 72-hour schedules never duplicate full scans.
  return { status: 'idle', owner: 'combinedAnalyticsReconciliation' };
});

const leaderboardReconciliationWorker = onSchedule({
  schedule: 'every 15 minutes',
  timeZone: 'Asia/Yangon',
  region: REGION,
  timeoutSeconds: 540,
  memory: '512MiB',
  maxInstances: 1,
  concurrency: 1
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
  getLeaderboardCustomRange,
  leaderboardNightlyReconciliation,
  leaderboardReconciliationWorker,
  processActiveRebuildBatch,
  eventMonths
};
