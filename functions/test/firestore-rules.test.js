'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails
} = require('@firebase/rules-unit-testing');
const {
  doc,
  collection,
  getDoc,
  getDocs,
  query,
  setDoc,
  where
} = require('firebase/firestore');

let environment;

async function seed() {
  await environment.withSecurityRulesDisabled(async (context) => {
    const database = context.firestore();
    const users = [
      ['midwife-a', { role: 'Midwife', township: 'Alpha', region: 'North' }],
      ['midwife-b', { role: 'Midwife', township: 'Beta', region: 'North' }],
      ['tmo-a', { role: 'TMO', township: 'Alpha', region: 'North' }],
      ['regional', { role: 'Regional Officer', township: '', region: 'North' }],
      ['super', { role: 'Super Admin', township: '', region: '' }]
    ];
    for (const [id, data] of users) {
      await setDoc(doc(database, 'users', id), data);
    }
    await setDoc(
      doc(database, 'leaderboard_v2_months', '2026-08', 'providers', 'midwife-a'),
      {
        providerId: 'midwife-a',
        providerName: 'Provider A',
        providerType: 'rhc',
        township: 'Alpha',
        region: 'North',
        score: 10
      }
    );
    await setDoc(
      doc(database, 'leaderboard_v2_months', '2026-08', 'providers', 'midwife-b'),
      {
        providerId: 'midwife-b',
        providerName: 'Provider B',
        providerType: 'hospital',
        township: 'Beta',
        region: 'North',
        score: 8
      }
    );
  });
}

test.before(async () => {
  environment = await initializeTestEnvironment({
    projectId: 'mnch-v2-rules-test',
    firestore: {
      rules: fs.readFileSync(
        path.join(__dirname, '..', '..', 'firestore.rules'),
        'utf8'
      )
    }
  });
});

test.beforeEach(async () => {
  await environment.clearFirestore();
  await seed();
});

test.after(async () => {
  if (environment) await environment.cleanup();
});

function providerRef(uid, providerId) {
  return doc(
    environment.authenticatedContext(uid).firestore(),
    'leaderboard_v2_months',
    '2026-08',
    'providers',
    providerId
  );
}

test('midwife can read own and same-township summary only', async () => {
  await assertSucceeds(getDoc(providerRef('midwife-a', 'midwife-a')));
  await assertFails(getDoc(providerRef('midwife-a', 'midwife-b')));
});

test('TMO can read summaries in their township only', async () => {
  await assertSucceeds(getDoc(providerRef('tmo-a', 'midwife-a')));
  await assertFails(getDoc(providerRef('tmo-a', 'midwife-b')));
});

test('scoped leaderboard list queries are authorized', async () => {
  const midwifeDb = environment.authenticatedContext('midwife-a').firestore();
  const tmoDb = environment.authenticatedContext('tmo-a').firestore();
  const regionalDb = environment.authenticatedContext('regional').firestore();
  const providersPath = ['leaderboard_v2_months', '2026-08', 'providers'];
  await assertSucceeds(getDocs(query(
    collection(midwifeDb, ...providersPath),
    where('township', '==', 'Alpha')
  )));
  await assertSucceeds(getDocs(query(
    collection(tmoDb, ...providersPath),
    where('township', '==', 'Alpha')
  )));
  await assertSucceeds(getDocs(query(
    collection(regionalDb, ...providersPath),
    where('region', '==', 'North')
  )));
});

test('regional officer can read summaries in their region', async () => {
  await assertSucceeds(getDoc(providerRef('regional', 'midwife-a')));
  await assertSucceeds(getDoc(providerRef('regional', 'midwife-b')));
});

test('Super Admin can read all provider summaries', async () => {
  await assertSucceeds(getDoc(providerRef('super', 'midwife-a')));
  await assertSucceeds(getDoc(providerRef('super', 'midwife-b')));
});

test('unauthenticated users cannot read summaries', async () => {
  const database = environment.unauthenticatedContext().firestore();
  await assertFails(getDoc(doc(
    database,
    'leaderboard_v2_months',
    '2026-08',
    'providers',
    'midwife-a'
  )));
});

test('browser clients cannot write summaries, contributions, or jobs', async () => {
  const database = environment.authenticatedContext('super').firestore();
  await assertFails(setDoc(
    doc(database, 'leaderboard_v2_months', '2026-08', 'providers', 'midwife-a'),
    { score: 999 },
    { merge: true }
  ));
  await assertFails(setDoc(
    doc(database, 'leaderboard_v2_contributions', '2026-08_patient'),
    { score: 999 }
  ));
  await assertFails(setDoc(
    doc(database, 'leaderboard_v2_jobs', 'job'),
    { status: 'running' }
  ));
});

test('rules fixture is initialized', () => {
  assert.ok(environment);
});
