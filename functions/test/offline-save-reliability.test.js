const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const root = path.resolve(__dirname, '../..')
const readAppFile = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8')

const createStorage = () => {
  const values = new Map()
  return {
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key)
  }
}

const fastTimers = {
  setTimeout: (fn, ms) => setTimeout(fn, ms >= 1000 ? 5 : ms),
  clearTimeout: (timer) => clearTimeout(timer)
}

const createFakeIndexedDb = () => {
  const stores = new Map()
  const fire = (request, result) => {
    setImmediate(() => {
      request.result = result
      if (request.onsuccess) request.onsuccess({ target: request })
    })
    return request
  }
  const database = {
    objectStoreNames: { contains: (name) => stores.has(name) },
    createObjectStore: (name, options) => stores.set(name, { keyPath: options.keyPath, rows: new Map() }),
    transaction: (storeName) => {
      const tx = {}
      let pending = 0
      const done = () => {
        pending -= 1
        if (pending === 0) setImmediate(() => tx.oncomplete && tx.oncomplete())
      }
      const track = (request, result) => {
        pending += 1
        fire(request, result)
        setImmediate(() => setImmediate(done))
        return request
      }
      tx.objectStore = () => {
        const store = stores.get(storeName)
        return {
          put: (record) => {
            store.rows.set(record[store.keyPath], JSON.parse(JSON.stringify(record)))
            return track({}, undefined)
          },
          get: (key) => track({}, store.rows.get(key)),
          delete: (key) => {
            store.rows.delete(key)
            return track({}, undefined)
          },
          getAll: () => track({}, Array.from(store.rows.values())),
          count: () => track({}, store.rows.size)
        }
      }
      return tx
    }
  }
  return {
    stores,
    open: () => {
      const request = {}
      setImmediate(() => {
        request.onupgradeneeded && request.onupgradeneeded({ target: { result: database } })
        request.onsuccess && request.onsuccess({ target: { result: database } })
      })
      return request
    }
  }
}

const createBrowserContext = (overrides = {}) => {
  const window = {
    addEventListener: () => {},
    navigator: { onLine: true },
    localStorage: createStorage(),
    ...overrides
  }
  const context = {
    window,
    navigator: window.navigator,
    localStorage: window.localStorage,
    document: {
      readyState: 'complete',
      addEventListener: () => {},
      getElementById: () => null,
      querySelector: () => null,
      createElement: () => ({ style: {}, classList: { add: () => {}, remove: () => {} }, appendChild: () => {} }),
      body: { appendChild: () => {} }
    },
    console: { log: () => {}, warn: () => {}, error: () => {} },
    Promise,
    Symbol,
    JSON,
    Date,
    Math,
    ...fastTimers
  }
  window.window = window
  Object.setPrototypeOf(context, window)
  vm.createContext(context)
  return context
}

test('refresh queue never blocks a save while offline or on a stalled connection', async () => {
  const writes = []
  const neverResolves = new Promise(() => {})
  const firebase = {
    auth: () => ({ currentUser: { uid: 'midwife-1' } }),
    firestore: Object.assign(() => ({
      collection: (name) => ({
        doc: (id) => ({
          set: (payload) => {
            writes.push({ name, id, payload })
            return neverResolves
          }
        })
      })
    }), { FieldValue: { serverTimestamp: () => 'server-time' } })
  }
  const context = createBrowserContext({ firebase })
  context.firebase = firebase
  vm.runInContext(readAppFile('js/analytics-refresh-queue.js'), context)
  const queue = context.window.AnalyticsRefreshQueue

  context.window.navigator.onLine = false
  assert.equal(await queue.requestSafely('patient-1', 'anc_visit'), false)
  assert.equal(writes.length, 0)
  assert.ok(queue.lastLocalChangeAt('patient-1') > 0)

  context.window.navigator.onLine = true
  assert.equal(await queue.requestSafely('patient-2', 'anc_visit'), false)
  assert.equal(writes.length, 1)
  assert.equal(writes[0].name, 'clinical_refresh_v1_queue')
  assert.ok(queue.lastLocalChangeAt('patient-2') > 0)
})

const loadOfflineManager = () => {
  const indexedDB = createFakeIndexedDb()
  const context = createBrowserContext({ indexedDB })
  context.indexedDB = indexedDB
  vm.runInContext(readAppFile('js/offline-policy.js'), context)
  vm.runInContext(readAppFile('js/offline-manager.js'), context)
  return { manager: context.window.OfflineManager, indexedDB }
}

test('ANC save keeps the queued copy and returns when the cloud write stalls', async () => {
  const { manager } = loadOfflineManager()
  let resolveCloud
  const cloudWrite = new Promise((resolve) => { resolveCloud = resolve })

  const result = await manager.saveLocalFirstAndTryCloud(
    'pending_anc_visits',
    { patientId: 'patient-1', visitDate: '2026-11-10', _docId: 'visit-1' },
    () => cloudWrite
  )

  assert.equal(result.cloud, false)
  assert.equal(result.queued, true)
  assert.equal(result.timedOut, true)
  const pending = await manager.getPendingRecords('pending_anc_visits')
  assert.equal(pending.length, 1)
  assert.equal(pending[0].data._docId, 'visit-1')

  resolveCloud({ cloudId: 'visit-1' })
  await new Promise((resolve) => setTimeout(resolve, 20))
  assert.equal((await manager.getPendingRecords('pending_anc_visits')).length, 0)
})

test('ANC save clears the queue when the cloud write succeeds in time', async () => {
  const { manager } = loadOfflineManager()

  const result = await manager.saveLocalFirstAndTryCloud(
    'pending_anc_visits',
    { patientId: 'patient-1', visitDate: '2026-11-10', _docId: 'visit-1' },
    async () => ({ cloudId: 'visit-1' })
  )

  assert.equal(result.cloud, true)
  assert.equal(result.queued, false)
  assert.equal((await manager.getPendingRecords('pending_anc_visits')).length, 0)
})

const loadSyncManager = (existingDocs) => {
  const calls = { sets: [], adds: [], gets: [], synced: [] }
  const pending = [{
    localId: 'OFFLINE-1',
    createdAt: '2026-11-10T00:00:00.000Z',
    data: { patientId: 'patient-1', visitDate: '2026-11-10', _docId: 'visit-1', _needsVisitNumber: true }
  }]
  const subCollection = (patientId, name) => ({
    doc: (id) => ({
      get: async () => {
        calls.gets.push(`${patientId}/${name}/${id}`)
        return { exists: existingDocs.has(`${patientId}/${name}/${id}`) }
      },
      set: async (payload) => calls.sets.push({ path: `${patientId}/${name}/${id}`, payload })
    }),
    add: async (payload) => {
      calls.adds.push(payload)
      return { id: 'random-id' }
    },
    orderBy: () => ({ limit: () => ({ get: async () => ({ empty: false, docs: [{ data: () => ({ visitNumber: 3 }) }] }) }) }),
    get: async () => ({ size: 3 })
  })
  const firebase = {
    firestore: Object.assign(() => ({
      collection: () => ({
        doc: (patientId) => ({ collection: (name) => subCollection(patientId, name) })
      })
    }), { FieldValue: { serverTimestamp: () => 'server-time' } })
  }
  const OfflineManager = {
    getPendingRecords: async (store) => (store === 'pending_anc_visits' ? pending : []),
    getAllRecords: async () => [],
    markSynced: async (store, localId, cloudId) => calls.synced.push({ store, localId, cloudId }),
    clearSyncedRecords: async () => {},
    updateSyncBadge: () => {}
  }
  const context = createBrowserContext({ firebase, OfflineManager })
  context.firebase = firebase
  vm.runInContext(readAppFile('js/offline-policy.js'), context)
  vm.runInContext(readAppFile('js/sync-manager.js'), context)
  return { syncManager: context.window.SyncManager, calls }
}

test('sync does not rewrite or renumber an ANC visit whose slow save already landed', async () => {
  const { syncManager, calls } = loadSyncManager(new Set(['patient-1/antenatal_visits/visit-1']))

  const result = await syncManager.syncAll()

  assert.equal(result.success, true)
  assert.equal(result.results.ancVisits.synced, 1)
  assert.equal(calls.sets.length, 0)
  assert.equal(calls.adds.length, 0)
  assert.deepEqual(calls.synced, [{ store: 'pending_anc_visits', localId: 'OFFLINE-1', cloudId: 'visit-1' }])
})

test('sync creates a queued ANC visit at its reserved document id', async () => {
  const { syncManager, calls } = loadSyncManager(new Set())

  const result = await syncManager.syncAll()

  assert.equal(result.success, true)
  assert.equal(calls.adds.length, 0)
  assert.equal(calls.sets.length, 1)
  assert.equal(calls.sets[0].path, 'patient-1/antenatal_visits/visit-1')
  assert.equal(calls.sets[0].payload.visitNumber, 4)
  assert.equal(calls.sets[0].payload._docId, undefined)
})
