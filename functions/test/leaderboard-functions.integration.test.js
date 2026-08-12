'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const admin = require('firebase-admin');

const projectId = process.env.GCLOUD_PROJECT || 'mnch-v2-functions-test';
if (!admin.apps.length) admin.initializeApp({ projectId });
const database = admin.firestore();
const {
  processActiveRebuildBatch
} = require('../src/leaderboard/functions');

function dateOnly(date) {
  return date.getUTCFullYear() + '-' +
    String(date.getUTCMonth() + 1).padStart(2, '0') + '-' +
    String(date.getUTCDate()).padStart(2, '0');
}

function monthOnly(date) {
  return dateOnly(date).slice(0, 7);
}

async function waitForSummary(month, providerId, predicate, timeoutMs) {
  const ref = database.collection('leaderboard_v2_months')
    .doc(month)
    .collection('providers')
    .doc(providerId);
  const deadline = Date.now() + (timeoutMs || 20000);
  while (Date.now() < deadline) {
    const snapshot = await ref.get();
    if (snapshot.exists && predicate(snapshot.data() || {})) return snapshot.data();
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error('Timed out waiting for leaderboard summary.');
}

test('triggers update summaries without double-counting and handle deletes', async () => {
  const now = new Date();
  const month = monthOnly(now);
  const today = dateOnly(now);
  const providerId = 'integration-midwife';
  const patientId = 'integration-patient';
  const providerRef = database.collection('users').doc(providerId);
  const patientRef = database.collection('patients').doc(patientId);
  const ancRef = patientRef.collection('antenatal_visits').doc('visit-1');

  await providerRef.set({
    role: 'Midwife',
    name: 'Integration Midwife',
    provider_type: 'rhc',
    township: 'Integration Township',
    region: 'Integration Region'
  });
  await patientRef.set({
    created_by: providerId,
    name: 'Synthetic Patient',
    age: 28,
    phone: '000000000',
    address: 'Synthetic Address',
    township: 'Integration Township',
    village: 'Synthetic Village',
    registration_date: today
  });
  await ancRef.set({
    visitDate: today,
    lmp: '2026-01-01',
    visitNumber: 1
  });

  const initial = await waitForSummary(
    month,
    providerId,
    (data) => data.score === 6
  );
  assert.equal(initial.activePatientCount, 1);
  assert.equal(initial.categories.registration, 1);
  assert.equal(initial.categories.completeRegistration, 2);
  assert.equal(initial.categories.ancVisits, 1);
  assert.equal(initial.categories.completeANC, 2);

  await ancRef.set({
    visitDate: today,
    lmp: '2026-01-01',
    visitNumber: 1
  }, { merge: true });
  const retried = await waitForSummary(
    month,
    providerId,
    (data) => data.score === 6
  );
  assert.equal(retried.score, 6);

  await ancRef.delete();
  const afterDelete = await waitForSummary(
    month,
    providerId,
    (data) => data.score === 3
  );
  assert.equal(afterDelete.categories.ancVisits, 0);
  assert.equal(afterDelete.categories.completeANC, 0);
});

test('rebuild worker resumes from a checkpoint and completes', async () => {
  const month = monthOnly(new Date());
  const jobRef = database.collection('leaderboard_v2_jobs').doc('leaderboard-v2-rebuild');
  await jobRef.set({
    status: 'running',
    months: [month],
    lastPatientId: null,
    processedPatients: 0
  });

  const first = await processActiveRebuildBatch();
  assert.equal(first.status, 'running');
  const second = await processActiveRebuildBatch();
  assert.equal(second.status, 'complete');

  const completed = await jobRef.get();
  assert.equal(completed.data().status, 'complete');
  assert.ok(completed.data().processedPatients >= 1);
});
