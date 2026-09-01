'use strict';

const admin = require('firebase-admin');
const { FieldPath, FieldValue, Filter } = require('firebase-admin/firestore');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { facilityTypes } = require('../shared/facility-taxonomy');
const {
  HRT_COLLECTION,
  KMC_COLLECTION,
  resolvePatientAge
} = require('./projections');
const { recomputePatientProjections } = require('./tracking-repository');

const REGION = 'us-central1';
const JOB_COLLECTION = 'tracking_v2_jobs';
const JOB_ID = 'tracking-projection-repair';
const DAILY_RECONCILIATION_ID = 'tracking-daily-reconciliation';
const BATCH_SIZE = 25;
const MAX_PAGE_SIZE = 100;
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
  return query.where(Filter.or(
    Filter.where('providerId', '==', user.uid),
    Filter.where('careTeamProviderIds', 'array-contains', user.uid)
  ));
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
  if (!!filters.periodStart !== !!filters.periodEnd) {
    throw new HttpsError(
      'invalid-argument',
      'Select both the start and end date for a custom period.'
    );
  }
  if (filters.periodStart && filters.periodEnd &&
      filters.periodStart > filters.periodEnd) {
    throw new HttpsError('invalid-argument', 'periodStart must not follow periodEnd.');
  }
  let query = applyRoleScope(db().collection(collectionName), user);
  // Central users may also narrow by region; that uses the same composite
  // index as Regional Officer (region + activeFrom + activeUntil).
  if (filters.region && ['super admin', 'central', 'admin'].includes(user.role)) {
    query = query.where('region', '==', filters.region);
  }
  if (filters.periodEnd) query = query.where('activeFrom', '<=', filters.periodEnd);
  if (filters.periodStart) query = query.where('activeUntil', '>=', filters.periodStart);
  // Firestore appends inequality fields that are missing from the explicit
  // ordering. Keep the document key last so the generated order is valid.
  query = query.orderBy('activeFrom')
    .orderBy('activeUntil')
    .orderBy(FieldPath.documentId());
  let scanCursor = filters.pageToken;
  // Optional dimensions are filtered in this trusted service. Keeping them
  // out of the Firestore query avoids an unsafe combinatorial index matrix.
  // The scan cursor still advances over non-matching rows.
  const extraScan = !!(filters.township || filters.department ||
    filters.status || filters.facilityTypes.length);
  const scanLimit = extraScan
    ? Math.min(500, Math.max(filters.pageSize + 1, filters.pageSize * 10))
    : filters.pageSize + 1;
  const maxScanned = extraScan ? 2000 : filters.pageSize + 1;
  const matches = [];
  let scanned = 0;
  let collectionExhausted = false;
  let lastScanned = null;
  while (matches.length <= filters.pageSize && scanned < maxScanned) {
    let pageQuery = query;
    if (scanCursor) {
      pageQuery = pageQuery.startAfter(
        scanCursor.activeFrom, scanCursor.activeUntil, scanCursor.id
      );
    }
    const snapshot = await pageQuery.limit(scanLimit).get();
    if (snapshot.empty) {
      collectionExhausted = true;
      break;
    }
    scanned += snapshot.size;
    lastScanned = snapshot.docs[snapshot.docs.length - 1];
    snapshot.docs.forEach((item) => {
      const row = item.data();
      if ((!filters.region || row.region === filters.region) &&
          (!filters.township || row.township === filters.township) &&
          (!filters.department || row.department === filters.department) &&
          (!filters.facilityTypes.length ||
            filters.facilityTypes.includes(row.facilityType)) &&
          (!filters.status || row.status === filters.status)) {
        matches.push(item);
      }
    });
    if (snapshot.size < scanLimit) {
      collectionExhausted = true;
      break;
    }
    scanCursor = {
      activeFrom: lastScanned.get('activeFrom'),
      activeUntil: lastScanned.get('activeUntil'),
      id: lastScanned.id
    };
  }
  const page = matches.slice(0, filters.pageSize);
  const moreMatches = matches.length > filters.pageSize;
  const cursorSnapshot = moreMatches
    ? page[page.length - 1]
    : (!collectionExhausted ? lastScanned : null);
  const rows = await attachLivePatientAges(
    page.map((item) => ({ id: item.id, ...item.data() }))
  );
  return {
    schemaVersion: collectionName === HRT_COLLECTION
      ? 'tracking-hrt-v1' : 'tracking-kmc-v1',
    rows,
    nextPageToken: cursorSnapshot ? encodePageToken(cursorSnapshot) : null
  };
}

async function attachLivePatientAges(rows) {
  const missingIds = Array.from(new Set(rows
    .filter((row) => (row.patientAge == null || row.patientAge === '') && row.patientId)
    .map((row) => row.patientId)));
  if (!missingIds.length) return rows;
  try {
    const snapshots = await db().getAll(
      ...missingIds.map((id) => db().collection('patients').doc(id))
    );
    const ages = new Map();
    snapshots.forEach((snapshot) => {
      if (!snapshot.exists) return;
      const age = resolvePatientAge(snapshot.data() || {});
      if (age != null) ages.set(snapshot.id, age);
    });
    return rows.map((row) => {
      if (row.patientAge != null && row.patientAge !== '') return row;
      const age = ages.get(row.patientId);
      return age == null ? row : { ...row, patientAge: age };
    });
  } catch (error) {
    console.warn('Tracking age hydration failed', error);
    return rows;
  }
}

const queryHrtTracking = onCall({
  region: REGION, timeoutSeconds: 120, memory: '512MiB', enforceAppCheck: false
}, (request) => queryProjectionRows(HRT_COLLECTION, request));

const queryKmcTracking = onCall({
  region: REGION, timeoutSeconds: 120, memory: '512MiB', enforceAppCheck: false
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
  }, { merge: true });
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
  for (let offset = 0; offset < patients.docs.length; offset += 5) {
    await Promise.all(patients.docs.slice(offset, offset + 5).map((patient) =>
      recomputePatientProjections(database, patient.id)
    ));
  }
  await ref.set({
    lastPatientId: patients.docs[patients.docs.length - 1].id,
    processedPatients: FieldValue.increment(patients.size),
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });
  return {
    status: 'running',
    processed: patients.size,
    lastPatientId: patients.docs[patients.docs.length - 1].id
  };
}

async function processTrackingRepairUntilDeadline(maxRuntimeMs = 480000) {
  const startedAt = Date.now();
  let processed = 0;
  let result = { status: 'idle' };
  while (Date.now() - startedAt < maxRuntimeMs) {
    result = await processTrackingRepairBatch();
    processed += Number(result.processed || 0);
    if (result.status !== 'running') break;
  }
  return {
    ...result,
    processedThisRun: processed,
    deadlineReached: result.status === 'running'
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
  schedule: 'every 5 minutes',
  timeZone: 'Asia/Yangon',
  region: REGION,
  timeoutSeconds: 540,
  memory: '512MiB',
  maxInstances: 1,
  concurrency: 1
}, () => processTrackingRepairUntilDeadline());

async function processActiveTrackingReconciliation(
  maxRuntimeMs = 480000,
  asOf = new Date()
) {
  const database = db();
  const ref = database.collection(JOB_COLLECTION).doc(DAILY_RECONCILIATION_ID);
  const day = asOf.toISOString().slice(0, 10);
  const current = await ref.get();
  let state = current.exists && current.data().day === day
    ? current.data()
    : {
        day,
        status: 'running',
        hrtCursor: null,
        kmcCursor: null,
        hrtComplete: false,
        kmcComplete: false,
        processedPatients: 0
      };
  if (state.status === 'complete') {
    return { status: 'complete', alreadyComplete: true };
  }
  await ref.set({
    ...state,
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });

  const startedAt = Date.now();
  let processed = 0;
  const targets = [
    { key: 'hrt', collection: HRT_COLLECTION },
    { key: 'kmc', collection: KMC_COLLECTION }
  ];
  while (Date.now() - startedAt < maxRuntimeMs &&
      (!state.hrtComplete || !state.kmcComplete)) {
    for (const target of targets) {
      const completeKey = `${target.key}Complete`;
      const cursorKey = `${target.key}Cursor`;
      if (state[completeKey]) continue;
      let query = database.collection(target.collection)
        .orderBy(FieldPath.documentId()).limit(100);
      if (state[cursorKey]) query = query.startAfter(state[cursorKey]);
      const snapshot = await query.get();
      if (snapshot.empty) {
        state[completeKey] = true;
      } else {
        const patientIds = Array.from(new Set(snapshot.docs
          .filter((row) => row.get('status') !== 'complete')
          .map((row) => row.get('patientId') || row.id)));
        for (let offset = 0; offset < patientIds.length; offset += 5) {
          await Promise.all(patientIds.slice(offset, offset + 5).map((patientId) =>
            recomputePatientProjections(database, patientId, { asOf })
          ));
        }
        processed += patientIds.length;
        state[cursorKey] = snapshot.docs[snapshot.docs.length - 1].id;
        if (snapshot.size < 100) state[completeKey] = true;
      }
      await ref.set({
        day,
        status: state.hrtComplete && state.kmcComplete ? 'complete' : 'running',
        [cursorKey]: state[cursorKey] || null,
        [completeKey]: state[completeKey],
        processedPatients: FieldValue.increment(processed),
        updatedAt: FieldValue.serverTimestamp()
      }, { merge: true });
      processed = 0;
      if (Date.now() - startedAt >= maxRuntimeMs) break;
    }
  }
  const complete = state.hrtComplete && state.kmcComplete;
  if (complete) {
    await ref.set({
      status: 'complete',
      completedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
  }
  return { status: complete ? 'complete' : 'running' };
}

// Retains the deployed function name for compatibility, but runs daily so
// due/overdue/automatic-completion fields do not wait for a clinical write.
const trackingWeeklyReconciliation = onSchedule({
  schedule: 'every 24 hours',
  timeZone: 'Asia/Yangon',
  region: REGION,
  timeoutSeconds: 540,
  memory: '512MiB',
  maxInstances: 1,
  concurrency: 1
}, () => processActiveTrackingReconciliation());

module.exports = {
  queryHrtTracking,
  queryKmcTracking,
  startTrackingProjectionRepair,
  trackingProjectionRepairWorker,
  trackingWeeklyReconciliation,
  queryProjectionRows,
  startTrackingRepair,
  processTrackingRepairBatch,
  processTrackingRepairUntilDeadline,
  processActiveTrackingReconciliation,
  validateFilters
};
