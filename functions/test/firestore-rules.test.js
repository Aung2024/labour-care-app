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
  updateDoc,
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
      ['tmo-b', { role: 'TMO', township: 'Beta', region: 'North' }],
      ['regional', { role: 'Regional Officer', township: '', region: 'North' }],
      ['central', { role: 'Central', township: '', region: '' }],
      ['admin', { role: 'admin', township: '', region: '' }],
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
    await setDoc(
      doc(database, 'quality_improvement_v1_months', '2026-09', 'providers', 'midwife-a'),
      {
        providerId: 'midwife-a',
        providerName: 'Provider A',
        township: 'Alpha',
        region: 'North',
        summaryPercentage: 60,
        indicators: {}
      }
    );
    await setDoc(
      doc(database, 'quality_improvement_v1_months', '2026-09', 'providers', 'midwife-b'),
      {
        providerId: 'midwife-b',
        providerName: 'Provider B',
        township: 'Beta',
        region: 'North',
        summaryPercentage: 40,
        indicators: {}
      }
    );
    await setDoc(doc(database, 'quality_improvement_plans', 'midwife-a_2026-09'), {
      providerId: 'midwife-a',
      scoreMonth: '2026-09',
      targetMonth: '2026-10',
      indicators: {
        skin_to_skin: {
          reasonCategory: 'supplies_equipment',
          explanation: 'Need more warm towels',
          nextTargetPercent: 80
        }
      }
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

test('Central and admin can read national provider summaries', async () => {
  await assertSucceeds(getDoc(providerRef('central', 'midwife-a')));
  await assertSucceeds(getDoc(providerRef('central', 'midwife-b')));
  await assertSucceeds(getDoc(providerRef('admin', 'midwife-a')));
  await assertSucceeds(getDoc(providerRef('admin', 'midwife-b')));
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

test('visit edit requests cannot be self-approved or reviewed out of scope', async () => {
  const requestPath = ['visit_edit_requests', 'patient-a__anc__visit-a__midwife-a'];
  const requesterDb = environment.authenticatedContext('midwife-a').firestore();
  await assertSucceeds(setDoc(doc(requesterDb, ...requestPath), {
    patientId: 'patient-a',
    visitType: 'anc',
    visitId: 'visit-a',
    requesterId: 'midwife-a',
    township: 'Alpha',
    status: 'pending',
    used: false
  }));
  await assertFails(updateDoc(doc(requesterDb, ...requestPath), {
    status: 'approved',
    reviewedBy: 'midwife-a',
    reviewerRole: 'TMO'
  }));

  const wrongTmoDb = environment.authenticatedContext('tmo-b').firestore();
  await assertFails(updateDoc(doc(wrongTmoDb, ...requestPath), {
    status: 'approved',
    reviewedBy: 'tmo-b',
    reviewedAt: new Date(),
    reviewerRole: 'TMO',
    rejectionReason: null
  }));
});

test('scoped supervisor approval can be consumed once by its requester', async () => {
  const requestPath = ['visit_edit_requests', 'patient-a__anc__visit-a__midwife-a'];
  await environment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), ...requestPath), {
      patientId: 'patient-a',
      visitType: 'anc',
      visitId: 'visit-a',
      requesterId: 'midwife-a',
      township: 'Alpha',
      status: 'pending',
      used: false
    });
  });
  const tmoDb = environment.authenticatedContext('tmo-a').firestore();
  await assertSucceeds(updateDoc(doc(tmoDb, ...requestPath), {
    status: 'approved',
    reviewedBy: 'tmo-a',
    reviewedAt: new Date(),
    reviewerRole: 'TMO',
    rejectionReason: null
  }));

  const requesterDb = environment.authenticatedContext('midwife-a').firestore();
  await assertSucceeds(updateDoc(doc(requesterDb, ...requestPath), {
    status: 'used',
    used: true,
    usedBy: 'midwife-a',
    usedAt: new Date()
  }));
  await assertFails(updateDoc(doc(requesterDb, ...requestPath), {
    status: 'used',
    used: true,
    usedBy: 'midwife-a',
    usedAt: new Date()
  }));
});

test('visit edit approval reads are limited to requester and scoped supervisors', async () => {
  await environment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'visit_edit_requests', 'request-a'), {
      requesterId: 'midwife-a',
      township: 'Alpha',
      status: 'pending',
      used: false
    });
  });
  await assertSucceeds(getDoc(doc(
    environment.authenticatedContext('midwife-a').firestore(),
    'visit_edit_requests',
    'request-a'
  )));
  await assertSucceeds(getDoc(doc(
    environment.authenticatedContext('tmo-a').firestore(),
    'visit_edit_requests',
    'request-a'
  )));
  await assertFails(getDoc(doc(
    environment.authenticatedContext('midwife-b').firestore(),
    'visit_edit_requests',
    'request-a'
  )));
});

test('ordinary authenticated clinical visit creates and updates remain allowed', async () => {
  const database = environment.authenticatedContext('midwife-a').firestore();
  const ancRef = doc(database, 'patients', 'patient-a', 'antenatal_visits', 'visit-new');
  const newbornRef = doc(database, 'patients', 'patient-a', 'newborn_care', 'visit-new');
  await assertSucceeds(setDoc(ancRef, { createdBy: 'midwife-a', visitNumber: 1 }));
  await assertSucceeds(updateDoc(ancRef, { notes: 'updated' }));
  await assertSucceeds(setDoc(newbornRef, { createdBy: 'midwife-a', visit_number: 1 }));
  await assertSucceeds(updateDoc(newbornRef, { clinical_notes: 'updated' }));
});

function qiProviderRef(uid, providerId) {
  return doc(
    environment.authenticatedContext(uid).firestore(),
    'quality_improvement_v1_months',
    '2026-09',
    'providers',
    providerId
  );
}

test('QI summaries are readable by owner and scoped supervisors only', async () => {
  await assertSucceeds(getDoc(qiProviderRef('midwife-a', 'midwife-a')));
  await assertFails(getDoc(qiProviderRef('midwife-a', 'midwife-b')));
  await assertSucceeds(getDoc(qiProviderRef('tmo-a', 'midwife-a')));
  await assertFails(getDoc(qiProviderRef('tmo-a', 'midwife-b')));
  await assertSucceeds(getDoc(qiProviderRef('regional', 'midwife-a')));
  await assertSucceeds(getDoc(qiProviderRef('super', 'midwife-b')));
});

test('missing QI summary docs remain readable by the owner', async () => {
  const missing = doc(
    environment.authenticatedContext('midwife-a').firestore(),
    'quality_improvement_v1_months',
    '2026-01',
    'providers',
    'midwife-a'
  );
  const snapshot = await assertSucceeds(getDoc(missing));
  assert.equal(snapshot.exists(), false);
});

test('QI summaries and contributions are not client-writable', async () => {
  const database = environment.authenticatedContext('midwife-a').firestore();
  await assertFails(setDoc(
    doc(database, 'quality_improvement_v1_months', '2026-09', 'providers', 'midwife-a'),
    { summaryPercentage: 99 }
  ));
  await assertFails(setDoc(
    doc(database, 'quality_improvement_v1_contributions', 'patient-a_2026-09'),
    { patientId: 'patient-a', month: '2026-09' }
  ));
});

test('midwives can edit only their own QI action plans', async () => {
  const ownerDb = environment.authenticatedContext('midwife-a').firestore();
  const otherDb = environment.authenticatedContext('midwife-b').firestore();
  await assertSucceeds(updateDoc(
    doc(ownerDb, 'quality_improvement_plans', 'midwife-a_2026-09'),
    {
      providerId: 'midwife-a',
      scoreMonth: '2026-09',
      'indicators.skin_to_skin.nextTargetPercent': 85
    }
  ));
  await assertFails(setDoc(
    doc(otherDb, 'quality_improvement_plans', 'midwife-a_2026-09'),
    {
      providerId: 'midwife-a',
      scoreMonth: '2026-09',
      indicators: {}
    }
  ));
  await assertSucceeds(setDoc(
    doc(otherDb, 'quality_improvement_plans', 'midwife-b_2026-09'),
    {
      providerId: 'midwife-b',
      scoreMonth: '2026-09',
      targetMonth: '2026-10',
      indicators: {
        skin_to_skin: {
          reasonCategory: 'knowledge_training',
          explanation: 'Need coaching',
          nextTargetPercent: 70
        }
      }
    }
  ));
  await assertSucceeds(setDoc(
    doc(ownerDb, 'quality_improvement_plans', 'midwife-a_all'),
    {
      providerId: 'midwife-a',
      scoreMonth: 'all',
      targetMonth: '2026-10',
      indicators: {}
    }
  ));
  await assertSucceeds(getDoc(
    doc(ownerDb, 'quality_improvement_plans', 'midwife-a_all')
  ));
});

test('midwives and scoped TMOs can list QI action plans by providerId', async () => {
  const ownerDb = environment.authenticatedContext('midwife-a').firestore();
  const otherDb = environment.authenticatedContext('midwife-b').firestore();
  const tmoDb = environment.authenticatedContext('tmo-a').firestore();
  const outOfScopeTmoDb = environment.authenticatedContext('tmo-b').firestore();
  const ownerQuery = query(
    collection(ownerDb, 'quality_improvement_plans'),
    where('providerId', '==', 'midwife-a')
  );
  const otherQuery = query(
    collection(otherDb, 'quality_improvement_plans'),
    where('providerId', '==', 'midwife-a')
  );
  const tmoQuery = query(
    collection(tmoDb, 'quality_improvement_plans'),
    where('providerId', '==', 'midwife-a')
  );
  const outOfScopeQuery = query(
    collection(outOfScopeTmoDb, 'quality_improvement_plans'),
    where('providerId', '==', 'midwife-a')
  );
  await assertSucceeds(getDocs(ownerQuery));
  await assertFails(getDocs(otherQuery));
  await assertSucceeds(getDocs(tmoQuery));
  await assertFails(getDocs(outOfScopeQuery));
});

test('TMO and above can comment on QI plans in scope', async () => {
  const tmoDb = environment.authenticatedContext('tmo-a').firestore();
  const outOfScopeTmoDb = environment.authenticatedContext('tmo-b').firestore();
  const midwifeDb = environment.authenticatedContext('midwife-a').firestore();

  await assertSucceeds(setDoc(
    doc(tmoDb, 'quality_improvement_plans', 'midwife-a_2026-09', 'comments', 'c1'),
    {
      indicatorId: 'skin_to_skin',
      text: 'Practice skin-to-skin immediately after birth.',
      authorId: 'tmo-a',
      authorName: 'TMO A',
      authorRole: 'TMO',
      createdAt: new Date()
    }
  ));
  await assertFails(setDoc(
    doc(outOfScopeTmoDb, 'quality_improvement_plans', 'midwife-a_2026-09', 'comments', 'c2'),
    {
      indicatorId: 'skin_to_skin',
      text: 'Out of township',
      authorId: 'tmo-b',
      authorName: 'TMO B',
      authorRole: 'TMO',
      createdAt: new Date()
    }
  ));
  await assertFails(setDoc(
    doc(midwifeDb, 'quality_improvement_plans', 'midwife-a_2026-09', 'comments', 'c3'),
    {
      indicatorId: 'skin_to_skin',
      text: 'Midwife cannot comment as supervisor',
      authorId: 'midwife-a',
      authorName: 'Midwife A',
      authorRole: 'Midwife',
      createdAt: new Date()
    }
  ));
  await assertSucceeds(getDoc(
    doc(midwifeDb, 'quality_improvement_plans', 'midwife-a_2026-09', 'comments', 'c1')
  ));
});
