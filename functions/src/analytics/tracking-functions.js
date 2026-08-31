'use strict';

const admin = require('firebase-admin');
const { FieldPath, FieldValue } = require('firebase-admin/firestore');
const functionsV1 = require('firebase-functions/v1');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { facilityTypes } = require('../shared/facility-taxonomy');
const {
  HRT_COLLECTION,
  KMC_COLLECTION
} = require('./projections');
const { recomputePatientProjections } = require('./tracking-repository');

const REGION = 'us-central1';
const JOB_COLLECTION = 'tracking_v2_jobs';
const JOB_ID = 'tracking-projection-repair';
const BATCH_SIZE = 10;
const MAX_PAGE_SIZE = 100;
const TRACKING_SUBCOLLECTIONS = new Set([
  'antenatal_visits',
  'postpartum_visits',
  'newborn_care',
  'immediate_newborn_care',
  'hrt_actions',
  'kmc_actions',
  'records'
]);
const TRACKING_RECORD_IDS = new Set([
  'birthRecord', 'deliveryNotes', 'outcomeRecord', 'endTreatment', 'summary'
]);
const ALLOWED_STATUSES = new Set([
  'on_track', 'overdue_followup', 'lost_to_followup', 'complete'
]);
const ALLOWED_DEPARTMENTS = new Set(['doph', 'doms', 'other']);

function db() {
  return admin.firestore();
}

function normalizedRole(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

async function authorizedUser(request) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in is required.');
  const snapshot = await db().collection('users').doc(request.auth.uid).get();
  if (!snapshot.exists) throw new HttpsError('permission-denied', 'User profile not found.');
  const user = snapshot.data() || {};
  const role = normalizedRole(user.role);
  if (![
    'super admin', 'central', 'admin', 'regional officer', 'tmo',
    'township medical officer', 'midwife'
  ].includes(role)) {
    throw new HttpsError('permission-denied', 'Role cannot access tracking data.');
  }
  return { ...user, uid: request.auth.uid, role };
}

function requireSuperAdmin(user) {
  if (user.role !== 'super admin') {
    throw new HttpsError('permission-denied', 'Only Super Admin can repair projections.');
  }
}

function validDate(value, field) {
  if (value == null || value === '') return null;
  const text = String(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) ||
      Number.isNaN(new Date(`${text}T00:00:00Z`).getTime())) {
    throw new HttpsError('invalid-argument', `${field} must be YYYY-MM-DD.`);
  }
  return text;
}

function decodePageToken(value) {
  if (!value) return null;
  try {
    const token = JSON.parse(Buffer.from(String(value), 'base64url').toString('utf8'));
    if (!token || typeof token.activeFrom !== 'string' ||
        typeof token.activeUntil !== 'string' || typeof token.id !== 'string') {
      throw new Error('invalid');
    }
    return token;
  } catch (_) {
    throw new HttpsError('invalid-argument', 'Invalid page token.');
  }
}

function encodePageToken(snapshot) {
  if (!snapshot) return null;
  return Buffer.from(JSON.stringify({
    activeFrom: snapshot.get('activeFrom'),
    activeUntil: snapshot.get('activeUntil'),
    id: snapshot.id
  })).toString('base64url');
}

function stringFilter(data, field) {
  if (data[field] == null || data[field] === '') return null;
  const value = String(data[field]).trim();
  if (!value || value.length > 120) {
    throw new HttpsError('invalid-argument', `${field} is invalid.`);
  }
  return value;
}

function applyRoleScope(query, user) {
  if (['super admin', 'central', 'admin'].includes(user.role)) return query;
  if (user.role === 'regional officer') {
    if (!user.region) throw new HttpsError('permission-denied', 'Region is not configured.');
    return query.where('region', '==', user.region);
  }
  if (['tmo', 'township medical officer'].includes(user.role)) {
    if (!user.township) throw new HttpsError('permission-denied', 'Township is not configured.');
    return query.where('township', '==', user.township);
  }
  return query.where('providerId', '==', user.uid);
}

function validateFilters(input) {
  const data = input || {};
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(
    1, Math.floor(Number(data.pageSize) || 25)
  ));
  const status = stringFilter(data, 'status');
  if (status && !ALLOWED_STATUSES.has(status)) {
    throw new HttpsError('invalid-argument', 'Unsupported status.');
  }
  const department = stringFilter(data, 'department');
  if (department && !ALLOWED_DEPARTMENTS.has(department)) {
    throw new HttpsError('invalid-argument', 'Unsupported department.');
  }
  const requestedTypes = data.facilityTypes == null ? [] : data.facilityTypes;
  if (!Array.isArray(requestedTypes) || requestedTypes.length > 10) {
    throw new HttpsError('invalid-argument', 'facilityTypes accepts up to 10 values.');
  }
  const allowedTypes = new Set(facilityTypes());
  const types = Array.from(new Set(requestedTypes.map(String)));
  if (types.some((type) => !allowedTypes.has(type))) {
    throw new HttpsError('invalid-argument', 'Unsupported facility type.');
  }
  return {
    pageSize,
    status,
    department,
    facilityTypes: types,
    region: stringFilter(data, 'region'),
    township: stringFilter(data, 'township'),
    periodStart: validDate(data.periodStart, 'periodStart'),
    periodEnd: validDate(data.periodEnd, 'periodEnd'),
    pageToken: decodePageToken(data.pageToken)
  };
}

async function queryProjectionRows(collectionName, request) {
  const user = await authorizedUser(request);
  const filters = validateFilters(request.data);
  if (filters.periodStart && filters.periodEnd &&
      filters.periodStart > filters.periodEnd) {
    throw new HttpsError('invalid-argument', 'periodStart must not follow periodEnd.');
  }
  let query = applyRoleScope(db().collection(collectionName), user);
  if (filters.periodEnd) query = query.where('activeFrom', '<=', filters.periodEnd);
  if (filters.periodStart) query = query.where('activeUntil', '>=', filters.periodStart);
  // Firestore appends inequality fields that are missing from the explicit
  // ordering. Keep the document key last so the generated order is valid.
  query = query.orderBy('activeFrom')
    .orderBy('activeUntil')
    .orderBy(FieldPath.documentId());
  if (filters.pageToken) {
    query = query.startAfter(
      filters.pageToken.activeFrom,
      filters.pageToken.activeUntil,
      filters.pageToken.id
    );
  }
  // Optional dimensions are filtered in this trusted service. Keeping them
  // out of the Firestore query avoids an unsafe combinatorial index matrix.
  // The scan cursor still advances over non-matching rows.
  const scanLimit = Math.min(500, Math.max(filters.pageSize + 1, filters.pageSize * 10));
  const snapshot = await query.limit(scanLimit).get();
  const matches = snapshot.docs.filter((item) => {
    const row = item.data();
    return (!filters.region || row.region === filters.region) &&
      (!filters.township || row.township === filters.township) &&
      (!filters.department || row.department === filters.department) &&
      (!filters.facilityTypes.length ||
        filters.facilityTypes.includes(row.facilityType)) &&
      (!filters.status || row.status === filters.status);
  });
  const page = matches.slice(0, filters.pageSize);
  const moreMatches = matches.length > filters.pageSize;
  const scanContinues = snapshot.docs.length === scanLimit;
  const cursorSnapshot = moreMatches
    ? page[page.length - 1]
    : (scanContinues ? snapshot.docs[snapshot.docs.length - 1] : null);
  return {
    schemaVersion: collectionName === HRT_COLLECTION
      ? 'tracking-hrt-v1' : 'tracking-kmc-v1',
    rows: page.map((item) => ({ id: item.id, ...item.data() })),
    nextPageToken: cursorSnapshot ? encodePageToken(cursorSnapshot) : null
  };
}

async function runProjectionTrigger(patientId) {
  return recomputePatientProjections(db(), patientId);
}

const trackingPatientWritten = functionsV1.region(REGION).runWith({
  failurePolicy: true,
  memory: '256MB',
  timeoutSeconds: 120,
  maxInstances: 20
}).firestore.document('patients/{patientId}').onWrite((_change, context) =>
  runProjectionTrigger(context.params.patientId));

const trackingPatientActivityWritten = functionsV1.region(REGION).runWith({
  failurePolicy: true,
  memory: '256MB',
  timeoutSeconds: 120,
  maxInstances: 40
}).firestore.document(
  'patients/{patientId}/{subcollection}/{documentId}'
).onWrite((_change, context) => {
  const subcollection = context.params.subcollection;
  if (!TRACKING_SUBCOLLECTIONS.has(subcollection)) return null;
  if (subcollection === 'records' &&
      !TRACKING_RECORD_IDS.has(context.params.documentId)) return null;
  return runProjectionTrigger(context.params.patientId);
});

const queryHrtTracking = onCall({
  region: REGION, timeoutSeconds: 60, memory: '256MiB', enforceAppCheck: false
}, (request) => queryProjectionRows(HRT_COLLECTION, request));

const queryKmcTracking = onCall({
  region: REGION, timeoutSeconds: 60, memory: '256MiB', enforceAppCheck: false
}, (request) => queryProjectionRows(KMC_COLLECTION, request));

async function startTrackingRepair(user) {
  const ref = db().collection(JOB_COLLECTION).doc(JOB_ID);
  const current = await ref.get();
  if (current.exists && current.data().status === 'running') {
    return { status: 'running', alreadyRunning: true };
  }
  await ref.set({
    type: 'tracking-projection-repair',
    status: 'running',
    lastPatientId: null,
    processedPatients: 0,
    requestedBy: user.uid,
    startedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    error: FieldValue.delete()
  });
  return { status: 'running', alreadyRunning: false };
}

async function processTrackingRepairBatch() {
  const database = db();
  const ref = database.collection(JOB_COLLECTION).doc(JOB_ID);
  const snapshot = await ref.get();
  if (!snapshot.exists || snapshot.data().status !== 'running') {
    return { status: 'idle' };
  }
  const job = snapshot.data();
  let query = database.collection('patients')
    .orderBy(FieldPath.documentId()).limit(BATCH_SIZE);
  if (job.lastPatientId) query = query.startAfter(job.lastPatientId);
  const patients = await query.get();
  if (patients.empty) {
    await ref.set({
      status: 'complete',
      completedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    return { status: 'complete' };
  }
  for (const patient of patients.docs) {
    await recomputePatientProjections(database, patient.id);
    await ref.set({
      lastPatientId: patient.id,
      processedPatients: FieldValue.increment(1),
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
  }
  return {
    status: 'running',
    processed: patients.size,
    lastPatientId: patients.docs[patients.docs.length - 1].id
  };
}

const startTrackingProjectionRepair = onCall({
  region: REGION, timeoutSeconds: 60, memory: '256MiB', enforceAppCheck: false
}, async (request) => {
  const user = await authorizedUser(request);
  requireSuperAdmin(user);
  return startTrackingRepair(user);
});

const trackingProjectionRepairWorker = onSchedule({
  schedule: 'every 15 minutes',
  timeZone: 'Asia/Yangon',
  region: REGION,
  timeoutSeconds: 540,
  memory: '512MiB',
  maxInstances: 1,
  concurrency: 1
}, processTrackingRepairBatch);

// Re-evaluates time-derived status, postpartum age, and automatic completion
// even when no clinical document is written on the boundary date.
const trackingWeeklyReconciliation = onSchedule({
  schedule: 'every 168 hours',
  timeZone: 'Asia/Yangon',
  region: REGION,
  timeoutSeconds: 540,
  memory: '512MiB',
  maxInstances: 1,
  concurrency: 1
}, async () => {
  const ref = db().collection(JOB_COLLECTION).doc(JOB_ID);
  const snapshot = await ref.get();
  if (!snapshot.exists || snapshot.data().status !== 'running') {
    await startTrackingRepair({ uid: 'daily-scheduler' });
  }
  return processTrackingRepairBatch();
});

module.exports = {
  trackingPatientWritten,
  trackingPatientActivityWritten,
  queryHrtTracking,
  queryKmcTracking,
  startTrackingProjectionRepair,
  trackingProjectionRepairWorker,
  trackingWeeklyReconciliation,
  queryProjectionRows,
  startTrackingRepair,
  processTrackingRepairBatch,
  validateFilters
};
