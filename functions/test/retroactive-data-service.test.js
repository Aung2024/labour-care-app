'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../..');
const rulesSource = fs.readFileSync(path.join(root, 'js/retroactive-data-rules.js'), 'utf8');
const serviceSource = fs.readFileSync(path.join(root, 'js/retroactive-data-service.js'), 'utf8');

function createFakeFirestore(seed) {
  const docs = new Map(Object.entries(seed || {}));
  const stats = { queries: 0, docReads: 0, batchCommits: 0, batchWrites: 0, transactions: 0, adds: 0 };
  let autoId = 0;

  function docRef(docPath) {
    return {
      id: docPath.split('/').pop(),
      path: docPath,
      collection: (name) => collectionRef(docPath + '/' + name),
      get: async () => {
        stats.docReads += 1;
        const data = docs.get(docPath);
        return { id: docPath.split('/').pop(), exists: !!data, data: () => data };
      }
    };
  }

  function childrenOf(collectionPath) {
    const prefix = collectionPath + '/';
    return Array.from(docs.keys())
      .filter((key) => key.startsWith(prefix) && !key.slice(prefix.length).includes('/'))
      .sort()
      .map((key) => ({ id: key.slice(prefix.length), data: () => docs.get(key) }));
  }

  function collectionRef(collectionPath) {
    const query = (limit) => ({
      limit: (value) => query(value),
      get: async () => {
        stats.queries += 1;
        const rows = childrenOf(collectionPath).slice(0, limit || undefined);
        return { size: rows.length, docs: rows, forEach: (fn) => rows.forEach(fn) };
      }
    });
    return Object.assign(query(), {
      doc: (id) => docRef(collectionPath + '/' + (id || 'auto-' + (++autoId))),
      add: async (data) => {
        stats.adds += 1;
        docs.set(collectionPath + '/auto-' + (++autoId), data);
      }
    });
  }

  function merge(docPath, data) {
    docs.set(docPath, Object.assign({}, docs.get(docPath) || {}, data));
  }

  return {
    stats,
    docs,
    collection: collectionRef,
    doc: docRef,
    batch: () => {
      const pending = [];
      return {
        set: (ref, data) => pending.push([ref.path, data]),
        commit: async () => {
          stats.batchCommits += 1;
          stats.batchWrites += pending.length;
          pending.forEach(([docPath, data]) => merge(docPath, data));
        }
      };
    },
    runTransaction: async () => {
      stats.transactions += 1;
      throw new Error('Back Fill should batch writes instead of using per-operation transactions.');
    }
  };
}

function loadService(refreshRequests) {
  const context = {
    console,
    navigator: { userAgent: 'test' },
    firebase: { firestore: { FieldValue: { serverTimestamp: () => 'SERVER_TIMESTAMP' } } },
    AnalyticsRefreshQueue: {
      requestSafely: async (patientId, reason) => {
        if (refreshRequests) refreshRequests.push({ patientId, reason });
        return true;
      }
    }
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(rulesSource, context);
  vm.runInContext(serviceSource, context);
  return context.RetroactiveDataService;
}

const motherDoc = {
  patient_type: 'mother',
  created_by: 'midwife-1',
  name: 'Daw Aye',
  age: 28,
  phone: '09111111111',
  registration_date: '2024-01-02',
  gravida_value: 1,
  parity_primary: 0
};

function seed() {
  return {
    'patients/mother-1': Object.assign({}, motherDoc),
    'patients/mother-1/antenatal_visits/v1': { visitNumber: 1, visitDate: '2024-02-01' },
    'patients/mother-1/antenatal_visits/v2': { visitNumber: 2, visitDate: '2024-03-01' }
  };
}

test('loadBundle issues one query per subcollection and reports exact truncation', async () => {
  const service = loadService();
  const db = createFakeFirestore(seed());
  const bundle = await service.loadBundle(db, Object.assign({ id: 'mother-1' }, motherDoc));
  assert.equal(bundle.ancVisits.length, 2);
  assert.equal(bundle.truncated, false);
  assert.equal(db.stats.queries, 5);
  assert.equal(db.stats.docReads, 2);

  const full = seed();
  for (let index = 0; index < 20; index += 1) {
    full['patients/mother-1/testRecords/t' + String(index).padStart(2, '0')] = { testDate: '2024-02-01' };
  }
  const exact = await service.loadBundle(createFakeFirestore(full), Object.assign({ id: 'mother-1' }, motherDoc));
  assert.equal(exact.testRecords.length, 20);
  assert.equal(exact.truncated, false);

  full['patients/mother-1/testRecords/t20'] = { testDate: '2024-02-01' };
  const over = await service.loadBundle(createFakeFirestore(full), Object.assign({ id: 'mother-1' }, motherDoc));
  assert.equal(over.testRecords.length, 20);
  assert.equal(over.truncated, true);
});

test('saveRequests commits merge writes in one batch and does not re-read the bundle', async () => {
  const refreshRequests = [];
  const service = loadService(refreshRequests);
  const db = createFakeFirestore(seed());
  const bundle = await service.loadBundle(db, Object.assign({ id: 'mother-1' }, motherDoc));
  const readsBefore = db.stats.queries + db.stats.docReads;

  const result = await service.saveRequests(db, { uid: 'midwife-1', email: 'mw@example.com' }, bundle, [{
    module: 'anc',
    applyTo: 'all',
    values: { goiterStatus: 'No', tbSymptoms: 'No' }
  }], { requireComplete: false });

  assert.equal(db.stats.transactions, 0);
  assert.equal(db.stats.batchCommits, 1);
  assert.equal(db.stats.batchWrites, 4);
  assert.equal(db.stats.queries + db.stats.docReads - readsBefore, 1);
  assert.equal(db.docs.get('patients/mother-1/antenatal_visits/v1').goiterStatus, 'No');
  assert.equal(db.docs.get('patients/mother-1/antenatal_visits/v2').retroactiveSource, result.plan.ruleVersion);
  assert.equal(result.bundle.ancVisits.find((row) => row.id === 'v2').data.tbSymptoms, 'No');
  assert.equal(bundle.ancVisits.find((row) => row.id === 'v2').data.tbSymptoms, undefined);
  assert.deepEqual(refreshRequests, [{ patientId: 'mother-1', reason: 'retroactive_backfill' }]);
});

test('saveRequests writes nothing when every submitted value is already stored', async () => {
  const refreshRequests = [];
  const service = loadService(refreshRequests);
  const data = seed();
  data['patients/mother-1/antenatal_visits/v1'].goiterStatus = 'No';
  data['patients/mother-1/antenatal_visits/v2'].goiterStatus = 'No';
  const db = createFakeFirestore(data);
  const bundle = await service.loadBundle(db, Object.assign({ id: 'mother-1' }, motherDoc));
  await service.saveRequests(db, { uid: 'midwife-1' }, bundle, [{
    module: 'anc',
    applyTo: 'all',
    values: { goiterStatus: 'No' }
  }], { requireComplete: false });
  assert.equal(db.stats.batchCommits, 0);
  assert.equal(db.stats.adds, 0);
  assert.equal(refreshRequests.length, 0);
});
