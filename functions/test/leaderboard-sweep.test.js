'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const service = require('../src/leaderboard/service');
const recomputeCalls = [];
service.recomputeLoadedPatientMonths = async (db, patientId, months) => {
  recomputeCalls.push({ patientId, months: months.slice() });
  return [];
};
const { sweepPatient, refreshLoadedPatientLeaderboard } = require('../src/leaderboard/functions');

function createFakeFirestore(seed) {
  const docs = new Map(Object.entries(seed || {}));
  const stats = { patientReads: 0, stateWrites: 0 };

  function snapshot(docPath) {
    const data = docs.get(docPath);
    return { id: docPath.split('/').pop(), exists: !!data, data: () => data };
  }

  function docRef(docPath) {
    return {
      path: docPath,
      collection: (name) => collectionRef(docPath + '/' + name),
      get: async () => {
        if (/^patients\/[^/]+$/.test(docPath)) stats.patientReads += 1;
        return snapshot(docPath);
      },
      set: async (data) => {
        stats.stateWrites += 1;
        docs.set(docPath, Object.assign({}, docs.get(docPath) || {}, data));
      }
    };
  }

  function collectionRef(collectionPath) {
    const query = {
      orderBy: () => query,
      limit: () => query,
      get: async () => {
        const prefix = collectionPath + '/';
        const rows = Array.from(docs.keys())
          .filter((key) => key.startsWith(prefix) && !key.slice(prefix.length).includes('/'))
          .map((key) => snapshot(key));
        return { docs: rows, size: rows.length };
      },
      doc: (id) => docRef(collectionPath + '/' + id)
    };
    return query;
  }

  return { docs, stats, collection: collectionRef };
}

const patient = {
  created_by: 'midwife-1',
  name: 'Synthetic Patient',
  age: 28,
  phone: '000000000',
  registration_date: '2026-10-02'
};

test('sweep recomputes a patient once, then skips it until its data changes', async () => {
  recomputeCalls.length = 0;
  const db = createFakeFirestore({
    'patients/p1': patient,
    'patients/p1/antenatal_visits/v1': { visitDate: '2026-10-02', visitNumber: 1, lmp: '2026-06-01' }
  });
  const months = ['2026-10', '2026', 'all'];

  assert.equal(await sweepPatient(db, 'p1', patient, months, false), true);
  assert.deepEqual(recomputeCalls[0].months, months);
  assert.equal(db.stats.patientReads, 0);

  assert.equal(await sweepPatient(db, 'p1', patient, months, false), false);
  assert.equal(recomputeCalls.length, 1);
  assert.equal(db.stats.stateWrites, 1);

  db.docs.set('patients/p1/testRecords/t1', { testDate: '2026-10-20', hemoglobinResult: 12 });
  assert.equal(await sweepPatient(db, 'p1', patient, months, false), true);
  assert.equal(recomputeCalls.length, 2);
  assert.ok(recomputeCalls[1].months.includes('2026-10'));

  assert.equal(await sweepPatient(db, 'p1', patient, months, true), true);
  assert.deepEqual(recomputeCalls[2].months, months);
});

test('queue refresh re-checks periods the patient was scored in before', async () => {
  recomputeCalls.length = 0;
  const db = createFakeFirestore({
    'leaderboard_v2_patient_state/p2': { fingerprints: { '2026-09': 'old-score', all: 'old-score' } }
  });
  const loaded = { patient, activity: {} };

  assert.equal(await refreshLoadedPatientLeaderboard(db, 'p2', loaded, ['2026-10', 'all'], {
    includePreviousPeriods: true
  }), true);
  assert.deepEqual(recomputeCalls[0].months.slice().sort(), ['2026-09', '2026-10', 'all']);

  assert.equal(await refreshLoadedPatientLeaderboard(db, 'p2', loaded, ['2026-10', 'all'], {
    includePreviousPeriods: true
  }), false);
  assert.equal(recomputeCalls.length, 1);
});
