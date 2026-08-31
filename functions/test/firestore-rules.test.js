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
      ['central', { role: 'Central', township: '', region: '' }],
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
    await setDoc(
      doc(database, 'leaderboard_v2_months', 'all', 'providers', 'midwife-a'),
      {
        providerId: 'midwife-a',
        providerName: 'Provider A',
        providerType: 'rhc',
        township: 'Alpha',
        region: 'North',
        score: 12
      }
    );
    const analyticsScopes = [
      ['national:all', { scopeType: 'national', scopeId: 'all', region: '', township: '', providerId: '' }],
      ['region:North', { scopeType: 'region', scopeId: 'North', region: 'North', township: '', providerId: '' }],
      ['township:Alpha', { scopeType: 'township', scopeId: 'Alpha', region: 'North', township: 'Alpha', providerId: '' }],
      ['township:Beta', { scopeType: 'township', scopeId: 'Beta', region: 'North', township: 'Beta', providerId: '' }],
      ['provider:midwife-a', { scopeType: 'provider', scopeId: 'midwife-a', region: 'North', township: 'Alpha', providerId: 'midwife-a' }],
      ['provider:midwife-b', { scopeType: 'provider', scopeId: 'midwife-b', region: 'North', township: 'Beta', providerId: 'midwife-b' }]
    ];
    for (const [scopeId, scope] of analyticsScopes) {
      await setDoc(
        doc(database, 'analytics_v2_periods', 'all', 'scopes', scopeId),
        Object.assign({ period: 'all', metrics: { total: 1 } }, scope)
      );
    }
    await setDoc(doc(database, 'tracking_v2_hrt', 'patient-a'), {
      patientId: 'patient-a', providerId: 'midwife-a', township: 'Alpha',
      region: 'North', status: 'on_track'
    });
    await setDoc(doc(database, 'tracking_v2_kmc', 'patient-a_1'), {
      patientId: 'patient-a', babyIndex: 1, providerId: 'midwife-a',
      township: 'Alpha', region: 'North', status: 'on_track'
    });
    await setDoc(doc(database, 'tracking_v2_jobs', 'tracking-projection-repair'), {
      status: 'running'
    });
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

test('scoped all-time leaderboard list queries are authorized', async () => {
  const midwifeDb = environment.authenticatedContext('midwife-a').firestore();
  await assertSucceeds(getDocs(query(
    collection(midwifeDb, 'leaderboard_v2_months', 'all', 'providers'),
    where('township', '==', 'Alpha')
  )));
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
  await assertFails(getDoc(doc(database, 'leaderboard_v3_daily', '2026-08-01_midwife-a')));
  await assertFails(setDoc(
    doc(database, 'analytics_v2_periods', 'all', 'scopes', 'national:all'),
    { metrics: { total: 999 } },
    { merge: true }
  ));
  await assertFails(getDoc(doc(database, 'analytics_v2_contributions', 'all_patient')));
  await assertFails(getDoc(doc(database, 'analytics_v2_jobs', 'dashboard-v2-rebuild')));
});

function analyticsScopeRef(uid, scopeId) {
  return doc(
    environment.authenticatedContext(uid).firestore(),
    'analytics_v2_periods',
    'all',
    'scopes',
    scopeId
  );
}

test('Dashboard V2 scopes enforce each healthcare role boundary', async () => {
  await assertSucceeds(getDoc(analyticsScopeRef('midwife-a', 'provider:midwife-a')));
  await assertFails(getDoc(analyticsScopeRef('midwife-a', 'township:Alpha')));
  await assertFails(getDoc(analyticsScopeRef('midwife-a', 'provider:midwife-b')));

  await assertSucceeds(getDoc(analyticsScopeRef('tmo-a', 'township:Alpha')));
  await assertSucceeds(getDoc(analyticsScopeRef('tmo-a', 'provider:midwife-a')));
  await assertFails(getDoc(analyticsScopeRef('tmo-a', 'township:Beta')));

  await assertSucceeds(getDoc(analyticsScopeRef('regional', 'region:North')));
  await assertSucceeds(getDoc(analyticsScopeRef('regional', 'township:Beta')));
  await assertSucceeds(getDoc(analyticsScopeRef('central', 'national:all')));
  await assertSucceeds(getDoc(analyticsScopeRef('super', 'national:all')));
});

test('Dashboard V2 metadata queries must be constrained to the caller scope', async () => {
  const tmoDb = environment.authenticatedContext('tmo-a').firestore();
  const regionalDb = environment.authenticatedContext('regional').firestore();
  const scopesPath = ['analytics_v2_periods', 'all', 'scopes'];
  await assertSucceeds(getDocs(query(
    collection(tmoDb, ...scopesPath),
    where('scopeType', '==', 'provider'),
    where('township', '==', 'Alpha')
  )));
  await assertFails(getDocs(query(
    collection(tmoDb, ...scopesPath),
    where('scopeType', '==', 'provider')
  )));
  await assertSucceeds(getDocs(query(
    collection(regionalDb, ...scopesPath),
    where('scopeType', '==', 'township'),
    where('region', '==', 'North')
  )));
});

test('rules fixture is initialized', () => {
  assert.ok(environment);
});

test('tracking projections and repair checkpoints are server-only', async () => {
  const database = environment.authenticatedContext('super').firestore();
  await assertFails(getDoc(doc(database, 'tracking_v2_hrt', 'patient-a')));
  await assertFails(getDocs(collection(database, 'tracking_v2_kmc')));
  await assertFails(setDoc(
    doc(database, 'tracking_v2_hrt', 'patient-a'),
    { status: 'complete' },
    { merge: true }
  ));
  await assertFails(getDoc(doc(
    database, 'tracking_v2_jobs', 'tracking-projection-repair'
  )));
});

test('authenticated clients can enqueue only their own refresh requests', async () => {
  const database = environment.authenticatedContext('midwife-a').firestore();
  const payload = {
    patientId: 'patient-a',
    requestedBy: 'midwife-a',
    reason: 'anc_visit',
    updatedAt: new Date().toISOString()
  };
  await assertSucceeds(setDoc(
    doc(database, 'tracking_v2_refresh_queue', 'patient-a'),
    payload
  ));
  await assertSucceeds(setDoc(
    doc(database, 'leaderboard_v3_refresh_queue', 'patient-a'),
    payload
  ));
  await assertFails(getDoc(doc(database, 'tracking_v2_refresh_queue', 'patient-a')));
  await assertFails(setDoc(
    doc(database, 'tracking_v2_refresh_queue', 'patient-b'),
    { ...payload, patientId: 'patient-b', requestedBy: 'someone-else' }
  ));
});
