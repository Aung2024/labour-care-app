'use strict';

const crypto = require('node:crypto');
const admin = require('firebase-admin');
const { FieldPath, FieldValue } = require('firebase-admin/firestore');
const { logger } = require('firebase-functions');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const {
  ALL_TIME_PERIOD,
  CATEGORY_KEYS,
  SCORE_VERSION,
  calculatePatientContribution,
  emptyCategories,
  isLeaderboardPeriod,
  monthKeyForDate,
  timestampToDate,
  recentMonthKeys
} = require('./scoring');
const {
  recomputeLoadedPatientMonths,
  rebuildProviderSummariesFromContributions
} = require('./service');
const { loadPatientActivity } = require('./repository');

const REGION = 'us-central1';
// The leaderboard is refreshed only by the scheduled sweep below. There are
// no per-write triggers: Firestore is in asia-southeast3 (Bangkok), where
// document triggers are not supported, and per-write recomputes are not needed.
const JOB_ID = 'leaderboard-v2-rebuild';
const JOB_COLLECTION = 'leaderboard_v2_jobs';
const PATIENT_STATE_COLLECTION = 'leaderboard_v2_patient_state';
const PATIENT_BATCH_SIZE = 50;
const PATIENT_CONCURRENCY = 8;
// Leaves headroom inside the 540s worker timeout for the last batch, which can
// take over a minute when every patient in it needs a full recompute.
const WORKER_MAX_RUNTIME_MS = 420000;
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

function eventMonths(before, after, options) {
  const months = new Set([
    ...monthsFromData(dataFromSnapshot(before)),
    ...monthsFromData(dataFromSnapshot(after))
  ]);
  if (!months.size && (!options || options.fallbackToCurrent !== false)) {
    months.add(monthKeyForDate(new Date()));
  }
  return Array.from(months);
}

function periodsWithAllTime(months) {
  const periods = new Set([...(months || []), ALL_TIME_PERIOD]);
  (months || []).forEach((month) => {
    if (/^\d{4}-\d{2}$/.test(month)) periods.add(month.slice(0, 4));
  });
  return Array.from(periods);
}

function aggregateDailyRows(rows, requested) {
  const filters = requested || {};
  const facilityTypes = Array.isArray(filters.facilityTypes)
    ? filters.facilityTypes.map(String).slice(0, 10)
    : [];
  const totals = new Map();
  (rows || []).forEach((row) => {
    if (filters.region && row.region !== filters.region) return;
    if (filters.township && row.township !== filters.township) return;
    if (filters.department && row.department !== filters.department) return;
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
      // A single daily summary has a true distinct count. Across multiple
      // days these become patient-days and cannot be deduplicated.
      activePatientCount: filters.start && filters.start === filters.end ? 0 : null,
      categories: emptyCategories()
    };
    current.score += Number(row.score || 0);
    if (current.activePatientCount != null) {
      current.activePatientCount += Number(row.activePatientCount || 0);
    }
    CATEGORY_KEYS.forEach((key) => {
      current.categories[key] += Number(row.categories && row.categories[key] || 0);
    });
    current.calculatedAt = new Date().toISOString();
    totals.set(row.providerId, current);
  });
  return Array.from(totals.values()).sort((a, b) => b.score - a.score);
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
  const rows = snapshot.docs.map((doc) => doc.data() || {});
  return {
    scoreVersion: require('./scoring').SCORE_VERSION,
    start,
    end,
    providers: aggregateDailyRows(rows, request.data || {})
  };
}

async function startRebuildJob(months, requestedBy, options) {
  const monthList = Array.from(new Set(months || [])).filter(isLeaderboardPeriod);
  if (!monthList.length) throw new Error('At least one valid month is required.');
  const jobRef = db().collection(JOB_COLLECTION).doc(JOB_ID);
  await jobRef.set({
    type: 'leaderboard-rebuild',
    months: monthList,
    status: 'running',
    lastPatientId: null,
    processedPatients: 0,
    changedPatients: 0,
    force: Boolean(options && options.force),
    requestedBy: requestedBy || 'scheduler',
    startedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    error: FieldValue.delete()
  }, { merge: true });
  return jobRef;
}

function scheduledRebuildPeriods(count = 12) {
  const currentYear = Number(monthKeyForDate(new Date()).slice(0, 4));
  const years = Array.from({ length: 5 }, (_, offset) => String(currentYear - offset));
  return Array.from(new Set([
    ...periodsWithAllTime(recentMonthKeys(count)),
    ...years
  ]));
}

function contributionFingerprint(providerId, calculated) {
  return crypto.createHash('sha1')
    .update(JSON.stringify([SCORE_VERSION, providerId || null, calculated]))
    .digest('base64');
}

// Recomputes only the periods whose calculated contribution differs from the
// fingerprint stored by the previous sweep, so unchanged patients cost no
// leaderboard writes. `force` ignores stored fingerprints.
async function sweepPatient(database, patientId, patientData, months, force) {
  const loaded = await loadPatientActivity(database, patientId, patientData);
  const patient = loaded.patient;
  const providerId = patient && (patient.created_by || patient.createdBy) || null;
  const stateRef = database.collection(PATIENT_STATE_COLLECTION).doc(patientId);
  const stateSnapshot = force ? null : await stateRef.get();
  const previous = stateSnapshot && stateSnapshot.exists
    ? (stateSnapshot.data().fingerprints || {})
    : {};
  const fingerprints = {};
  const changed = [];
  months.forEach((month) => {
    const calculated = patient ? calculatePatientContribution(patient, loaded.activity, month) : null;
    fingerprints[month] = contributionFingerprint(providerId, calculated);
    if (previous[month] !== fingerprints[month]) changed.push(month);
  });
  if (!changed.length) return false;
  await recomputeLoadedPatientMonths(database, patientId, changed, loaded);
  await stateRef.set({
    patientId,
    scoreVersion: SCORE_VERSION,
    fingerprints,
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });
  return true;
}

async function mapWithConcurrency(items, concurrency, worker) {
  const results = [];
  for (let offset = 0; offset < items.length; offset += concurrency) {
    results.push(...await Promise.all(items.slice(offset, offset + concurrency).map(worker)));
  }
  return results;
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

  const changedFlags = await mapWithConcurrency(patients.docs, PATIENT_CONCURRENCY, (patient) =>
    sweepPatient(database, patient.id, patient.data() || {}, months, Boolean(job.force))
  );
  const changed = changedFlags.filter(Boolean).length;
  // A timeout before this checkpoint repeats at most one batch; sweepPatient
  // is idempotent because contributions are saved as deltas from the stored value.
  const lastPatientId = patients.docs[patients.docs.length - 1].id;
  await jobRef.set({
    lastPatientId,
    processedPatients: FieldValue.increment(patients.size),
    changedPatients: FieldValue.increment(changed),
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });
  return { status: 'running', processed: patients.size, changed, lastPatientId };
}

async function processRebuildUntilDeadline(maxRuntimeMs = WORKER_MAX_RUNTIME_MS) {
  const started = Date.now();
  let result = await processActiveRebuildBatch();
  while (result.status === 'running' && Date.now() - started < maxRuntimeMs) {
    result = await processActiveRebuildBatch();
  }
  return result;
}

const startLeaderboardRebuild = onCall({
  region: REGION,
  timeoutSeconds: 120,
  memory: '256MiB',
  enforceAppCheck: false
}, async (request) => {
  await requireSuperAdmin(request);
  const requestedCount = Number(request.data && request.data.months || 4);
  const count = Math.min(12, Math.max(1, Math.floor(requestedCount)));
  const months = scheduledRebuildPeriods(count);
  await startRebuildJob(months, request.auth.uid, { force: true });
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
  schedule: 'every 48 hours',
  timeZone: 'Asia/Yangon',
  region: REGION,
  timeoutSeconds: 120,
  memory: '256MiB'
}, async () => {
  const jobRef = db().collection(JOB_COLLECTION).doc(JOB_ID);
  const jobSnapshot = await jobRef.get();
  if (jobSnapshot.exists && jobSnapshot.data().status === 'running') {
    return { status: 'running', owner: 'leaderboardReconciliationWorker' };
  }
  await startRebuildJob(scheduledRebuildPeriods(), '48-hour-scheduler');
  return { status: 'queued', owner: 'leaderboardReconciliationWorker' };
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
    return await processRebuildUntilDeadline();
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
  startLeaderboardRebuild,
  getLeaderboardCustomRange,
  leaderboardNightlyReconciliation,
  leaderboardReconciliationWorker,
  processActiveRebuildBatch,
  processRebuildUntilDeadline,
  sweepPatient,
  contributionFingerprint,
  eventMonths,
  periodsWithAllTime,
  aggregateDailyRows
};
