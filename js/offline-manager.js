/**
 * Offline Manager for MCH Care App
 * Handles IndexedDB storage, offline mode toggle, and connection detection.
 */
(function () {
  'use strict';

  const DB_NAME = 'mch_offline_db';
  const DB_VERSION = 3;
  const OFFLINE_MODE_KEY = 'offlineMode';

  const STORE_NAMES = [
    'pending_patients',
    'pending_anc_visits',
    'pending_pnc_visits',
    'pending_lab_tests',
    'pending_lcg_records',
    'pending_newborn_records',
    'offline_user_profile'
  ];

  const CACHED_PATIENTS_STORE = 'cached_patients';

  let dbInstance = null;

  function openDB() {
    if (dbInstance) return Promise.resolve(dbInstance);

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        STORE_NAMES.forEach((name) => {
          if (!db.objectStoreNames.contains(name)) {
            db.createObjectStore(name, { keyPath: 'localId' });
          }
        });
        if (!db.objectStoreNames.contains(CACHED_PATIENTS_STORE)) {
          db.createObjectStore(CACHED_PATIENTS_STORE, { keyPath: 'id' });
        }
      };

      request.onsuccess = (event) => {
        dbInstance = event.target.result;
        resolve(dbInstance);
      };

      request.onerror = (event) => {
        console.error('[OfflineManager] IndexedDB open error:', event.target.error);
        reject(event.target.error);
      };
    });
  }

  function generateLocalId() {
    const ts = Date.now();
    const rand = Math.random().toString(36).substring(2, 6);
    return `OFFLINE-${ts}-${rand}`;
  }

  function shouldQueueForSync() {
    return isOfflineMode() || (typeof navigator !== 'undefined' && navigator.onLine === false);
  }

  function normalizeQueuedPayload(data, storeName) {
    return {
      ...data,
      entityType: data.entityType || storeName,
      syncState: data.syncState || 'pending'
    };
  }

  /**
   * IndexedDB structured clone cannot store Firestore FieldValue sentinels.
   * Queued payloads often include serverTimestamp() — without this, put() throws DataCloneError
   * and offline ANC/PNC/newborn/LCG saves fail while pending_patients (no FieldValues) still work.
   */
  function isFirestoreFieldValue(val) {
    if (!val || typeof val !== 'object') return false;
    try {
      if (typeof firebase !== 'undefined' && firebase.firestore && firebase.firestore.FieldValue) {
        if (val instanceof firebase.firestore.FieldValue) return true;
      }
    } catch (e) {
      /* ignore */
    }
    if (typeof val._methodName === 'string') {
      var m = val._methodName;
      return (
        m === 'serverTimestamp' ||
        m === 'increment' ||
        m === 'arrayUnion' ||
        m === 'arrayRemove' ||
        m === 'deleteField'
      );
    }
    return false;
  }

  function stripFirestoreFieldValues(input) {
    if (input === null || input === undefined) return input;
    if (isFirestoreFieldValue(input)) {
      if (input._methodName === 'serverTimestamp') {
        return new Date().toISOString();
      }
      return undefined;
    }
    if (typeof input !== 'object') return input;
    if (Object.prototype.toString.call(input) === '[object Date]') {
      return input.toISOString();
    }
    if (Array.isArray(input)) {
      return input.map(function (item) {
        var x = stripFirestoreFieldValues(item);
        return x === undefined ? null : x;
      });
    }
    var out = {};
    Object.keys(input).forEach(function (key) {
      var v = stripFirestoreFieldValues(input[key]);
      if (v !== undefined) {
        out[key] = v;
      }
    });
    return out;
  }

  // --------------- Public API ---------------

  function isOfflineMode() {
    return localStorage.getItem(OFFLINE_MODE_KEY) === 'true';
  }

  function setOfflineMode(enabled) {
    localStorage.setItem(OFFLINE_MODE_KEY, enabled ? 'true' : 'false');
    updateOfflineUI(enabled);

    if (enabled) {
      cacheUserProfile();
    }
  }

  async function saveOfflineRecord(storeName, data) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const normalizedData = normalizeQueuedPayload(data, storeName);
      const storableData = stripFirestoreFieldValues(normalizedData);
      const record = {
        localId: storableData.localId || generateLocalId(),
        data: storableData,
        createdAt: new Date().toISOString(),
        syncStatus: 'pending'
      };

      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).put(record);

      tx.oncomplete = () => {
        updateSyncBadge();
        resolve(record);
      };
      tx.onerror = (e) => {
        console.error('[OfflineManager] saveOfflineRecord error:', e.target.error);
        reject(e.target.error);
      };
    });
  }

  /**
   * Canonical local-first writer:
   * 1) Always writes to local pending queue
   * 2) Tries cloud write immediately when network is available
   * 3) Marks as synced and removes queue item on success
   */
  async function saveLocalFirstAndTryCloud(storeName, data, cloudWriteFn) {
    const queued = await saveOfflineRecord(storeName, data);
    if (shouldQueueForSync() || typeof cloudWriteFn !== 'function') {
      return { local: true, cloud: false, queued: true, localId: queued.localId };
    }

    try {
      const cloudMeta = await cloudWriteFn(queued.data, queued.localId);
      await markSynced(storeName, queued.localId, cloudMeta && cloudMeta.cloudId ? cloudMeta.cloudId : null);
      await deleteRecord(storeName, queued.localId);
      return { local: true, cloud: true, queued: false, localId: queued.localId, cloudMeta: cloudMeta || null };
    } catch (error) {
      console.warn('[OfflineManager] Cloud write failed, keeping queued record:', error);
      return { local: true, cloud: false, queued: true, localId: queued.localId, error };
    }
  }

  async function getPendingRecords(storeName) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const request = tx.objectStore(storeName).getAll();
      request.onsuccess = () => {
        const records = request.result.filter((r) => r.syncStatus === 'pending');
        resolve(records);
      };
      request.onerror = (e) => reject(e.target.error);
    });
  }

  async function getAllRecords(storeName) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const request = tx.objectStore(storeName).getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = (e) => reject(e.target.error);
    });
  }

  async function getPendingCount() {
    const stores = STORE_NAMES.filter((n) => n !== 'offline_user_profile');
    let total = 0;
    for (const store of stores) {
      const records = await getPendingRecords(store);
      total += records.length;
    }
    return total;
  }

  async function markSynced(storeName, localId, cloudId) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const objectStore = tx.objectStore(storeName);
      const getReq = objectStore.get(localId);

      getReq.onsuccess = () => {
        const record = getReq.result;
        if (record) {
          record.syncStatus = 'synced';
          record.cloudId = cloudId;
          record.syncedAt = new Date().toISOString();
          objectStore.put(record);
        }
      };

      tx.oncomplete = () => {
        updateSyncBadge();
        resolve();
      };
      tx.onerror = (e) => reject(e.target.error);
    });
  }

  async function deleteRecord(storeName, localId) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).delete(localId);
      tx.oncomplete = () => {
        updateSyncBadge();
        resolve();
      };
      tx.onerror = (e) => reject(e.target.error);
    });
  }

  async function clearSyncedRecords() {
    const stores = STORE_NAMES.filter((n) => n !== 'offline_user_profile');
    for (const storeName of stores) {
      const all = await getAllRecords(storeName);
      for (const rec of all) {
        if (rec.syncStatus === 'synced') {
          await deleteRecord(storeName, rec.localId);
        }
      }
    }
  }

  // --------------- User profile caching ---------------

  async function cacheUserProfile() {
    try {
      const user = firebase.auth().currentUser;
      if (!user) return;

      const userDoc = await firebase.firestore().collection('users').doc(user.uid).get();
      if (!userDoc.exists) return;

      const userData = userDoc.data();
      const profile = {
        localId: 'current_user',
        uid: user.uid,
        email: user.email,
        role: userData.role || 'Midwife',
        township: userData.township || '',
        region: userData.region || '',
        facility_code: userData.facility_code || '003',
        name: userData.name || user.email,
        cachedAt: new Date().toISOString()
      };

      const db = await openDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('offline_user_profile', 'readwrite');
        tx.objectStore('offline_user_profile').put(profile);
        tx.oncomplete = () => resolve(profile);
        tx.onerror = (e) => reject(e.target.error);
      });
    } catch (error) {
      console.warn('[OfflineManager] Failed to cache user profile:', error);
    }
  }

  async function getCachedUserProfile() {
    try {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('offline_user_profile', 'readonly');
        const req = tx.objectStore('offline_user_profile').get('current_user');
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = (e) => reject(e.target.error);
      });
    } catch {
      return null;
    }
  }

  // --------------- Cached patients (downloaded for offline use) ---------------

  async function cachePatientForOffline(patientData) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const record = {
        ...patientData,
        id: patientData.id,
        cachedAt: new Date().toISOString()
      };
      const tx = db.transaction(CACHED_PATIENTS_STORE, 'readwrite');
      tx.objectStore(CACHED_PATIENTS_STORE).put(record);
      tx.oncomplete = () => resolve(record);
      tx.onerror = (e) => reject(e.target.error);
    });
  }

  async function getCachedPatients() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(CACHED_PATIENTS_STORE, 'readonly');
      const request = tx.objectStore(CACHED_PATIENTS_STORE).getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = (e) => reject(e.target.error);
    });
  }

  async function getCachedPatient(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(CACHED_PATIENTS_STORE, 'readonly');
      const request = tx.objectStore(CACHED_PATIENTS_STORE).get(id);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = (e) => reject(e.target.error);
    });
  }

  async function patchCachedPatient(patientId, patch) {
    if (!patientId || !patch || typeof patch !== 'object') return null;
    const existing = await getCachedPatient(patientId);
    if (!existing) return null;
    const updated = Object.assign({}, existing, patch, { id: patientId });
    return cachePatientForOffline(updated);
  }

  async function patchPendingPatientData(patientId, patch) {
    if (!patientId || !patch || typeof patch !== 'object') return null;
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('pending_patients', 'readwrite');
      const store = tx.objectStore('pending_patients');
      const req = store.get(patientId);
      req.onsuccess = () => {
        const record = req.result;
        if (!record || record.syncStatus !== 'pending') {
          resolve(null);
          return;
        }
        record.data = Object.assign({}, record.data, patch);
        store.put(record);
      };
      tx.oncomplete = () => resolve(true);
      tx.onerror = (e) => reject(e.target.error);
    });
  }

  /**
   * Latest LCG first/second stage times for a patient while offline.
   * Sources: pending_lcg_records (any record), then cached patient (lcgStartingTime from Prepare for Offline).
   */
  async function getOfflineLcgForPatient(patientId) {
    if (!patientId) return null;
    try {
      const db = await openDB();
      const allLcg = await new Promise((resolve, reject) => {
        const tx = db.transaction('pending_lcg_records', 'readonly');
        const req = tx.objectStore('pending_lcg_records').getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = (e) => reject(e.target.error);
      });
      const matches = allLcg.filter((r) => {
        const d = r.data;
        return d && String(d.patientId) === String(patientId);
      });
      if (matches.length > 0) {
        matches.sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
        const latest = matches[matches.length - 1].data;
        const st = latest.startingTime || latest.startTime;
        if (st) {
          return {
            startingTime: st,
            secondStageTime: latest.secondStageTime || null
          };
        }
      }
    } catch (e) {
      console.warn('[OfflineManager] getOfflineLcgForPatient pending scan failed', e);
    }
    try {
      const cached = await getCachedPatient(patientId);
      if (cached && cached.lcgStartingTime) {
        return {
          startingTime: cached.lcgStartingTime,
          secondStageTime: cached.lcgSecondStageTime || null
        };
      }
    } catch (e2) {
      console.warn('[OfflineManager] getOfflineLcgForPatient cache read failed', e2);
    }
    return null;
  }

  async function removeCachedPatient(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(CACHED_PATIENTS_STORE, 'readwrite');
      tx.objectStore(CACHED_PATIENTS_STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = (e) => reject(e.target.error);
    });
  }

  // --------------- UI helpers ---------------

  function updateOfflineUI(enabled) {
    const banner = document.getElementById('offlineBanner');
    const offlineBtn = document.getElementById('offlineModeBtn');
    const syncBtn = document.getElementById('syncBtn');

    if (banner) banner.style.display = enabled ? 'block' : 'none';

    if (offlineBtn) {
      if (enabled) {
        offlineBtn.classList.remove('btn-outline-warning');
        offlineBtn.classList.add('btn-warning');
        offlineBtn.querySelector('i').className = 'fas fa-plug-circle-check me-1';
      } else {
        offlineBtn.classList.remove('btn-warning');
        offlineBtn.classList.add('btn-outline-warning');
        offlineBtn.querySelector('i').className = 'fas fa-plug-circle-xmark me-1';
      }
      const label = document.getElementById('offlineModeBtnLabel');
      if (label) {
        const lang =
          (typeof localStorage !== 'undefined' && localStorage.getItem('appLanguage')) ||
          document.querySelector('.language-btn.active')?.getAttribute('data-lang') ||
          'en';
        if (enabled) {
          label.textContent = lang === 'mm' ? 'အွန်လိုင်းသို့' : 'Go Online';
        } else {
          label.textContent = lang === 'mm' ? 'အော့ဖ်လိုင်းသို့' : 'Go Offline';
        }
      }
    }

    if (syncBtn) {
      syncBtn.style.display = enabled ? 'inline-flex' : 'none';
    }

    disableOnlineOnlyFeatures(enabled);
    updateSyncBadge();
  }

  function disableOnlineOnlyFeatures(offlineActive) {
    const onlineOnlyCards = [
      { selector: '.care-card.dashboard', label: 'Online only' },
      { selector: '#adminCard', label: 'Online only' },
      { selector: '.care-card.scoreboard', label: 'Online only' }
    ];

    onlineOnlyCards.forEach(({ selector }) => {
      const cards = document.querySelectorAll(selector);
      cards.forEach((card) => {
        if (offlineActive) {
          card.style.opacity = '0.45';
          card.style.pointerEvents = 'none';
          if (!card.querySelector('.offline-overlay')) {
            const overlay = document.createElement('div');
            overlay.className = 'offline-overlay';
            overlay.innerHTML =
              '<span class="badge bg-secondary"><i class="fas fa-ban me-1"></i>Online only</span>';
            overlay.style.cssText =
              'position:absolute;top:10px;right:10px;z-index:10;';
            card.style.position = 'relative';
            card.appendChild(overlay);
          }
        } else {
          card.style.opacity = '';
          card.style.pointerEvents = '';
          const overlay = card.querySelector('.offline-overlay');
          if (overlay) overlay.remove();
        }
      });
    });
  }

  async function updateSyncBadge() {
    try {
      const count = await getPendingCount();
      const badge = document.getElementById('syncBadge');
      if (badge) {
        badge.textContent = count;
        badge.style.display = count > 0 ? 'inline-block' : 'none';
      }
      const syncBtn = document.getElementById('syncBtn');
      if (syncBtn && count > 0) {
        syncBtn.style.display = 'inline-flex';
      }
    } catch {
      // Silently ignore if DB not ready
    }
  }

  // --------------- Connection detection ---------------

  function setupConnectionListeners() {
    window.addEventListener('online', () => {
      if (isOfflineMode()) {
        showConnectionToast('Connection restored. Tap Sync to upload offline data.', 'success');
      }
    });

    window.addEventListener('offline', () => {
      if (!isOfflineMode()) {
        showConnectionToast('Internet connection lost. Consider switching to Offline Mode.', 'warning');
      }
    });
  }

  function showConnectionToast(message, type) {
    const existing = document.querySelector('.offline-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'offline-toast';
    const bgColor = type === 'success' ? '#059669' : '#d97706';
    const icon = type === 'success' ? 'fa-wifi' : 'fa-exclamation-triangle';
    toast.style.cssText = `
      position:fixed;top:20px;left:50%;transform:translateX(-50%);
      background:${bgColor};color:#fff;padding:12px 24px;border-radius:12px;
      z-index:99999;font-size:0.95rem;box-shadow:0 4px 12px rgba(0,0,0,0.2);
      display:flex;align-items:center;gap:10px;animation:slideDown 0.3s ease-out;
      max-width:90vw;text-align:center;
    `;
    toast.innerHTML = `<i class="fas ${icon}"></i><span>${message}</span>`;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.animation = 'slideDown 0.3s ease-out reverse';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  // --------------- Global Firestore interceptor ---------------
  // When offline mode is active, intercept ALL Firestore .get() calls
  // and return empty results instantly instead of hitting the network.

  function installFirestoreInterceptor() {
    if (typeof firebase === 'undefined' || !firebase.firestore) return;

    var db;
    try { db = firebase.firestore(); } catch (e) { return; }

    // Mock DocumentSnapshot (for doc().get())
    function MockDocSnapshot(id) {
      this.exists = false;
      this.id = id || '';
      this.data = function () { return undefined; };
      this.get = function () { return undefined; };
    }

    // Mock QuerySnapshot (for collection().get() / where().get())
    // Also includes .exists=false so it works when callers treat it as a DocumentSnapshot
    function MockQuerySnapshot() {
      this.empty = true;
      this.size = 0;
      this.docs = [];
      this.exists = false;
      this.forEach = function () {};
      this.data = function () { return undefined; };
    }

    // Patch DocumentReference.prototype.get
    var DocRefProto = Object.getPrototypeOf(db.collection('_').doc('_'));
    if (DocRefProto && DocRefProto.get && !DocRefProto._originalGet) {
      DocRefProto._originalGet = DocRefProto.get;
      DocRefProto.get = function (opts) {
        if (isOfflineMode()) {
          return Promise.resolve(new MockDocSnapshot(this.id));
        }
        return DocRefProto._originalGet.call(this, opts);
      };
    }

    // Patch Query.prototype.get (covers collection().get(), where().get(), orderBy().get(), etc.)
    var queryRef = db.collection('_').where('__x', '==', '1');
    var QueryProto = Object.getPrototypeOf(queryRef);
    if (QueryProto && QueryProto.get && !QueryProto._originalGet) {
      QueryProto._originalGet = QueryProto.get;
      QueryProto.get = function (opts) {
        if (isOfflineMode()) {
          return Promise.resolve(new MockQuerySnapshot());
        }
        return QueryProto._originalGet.call(this, opts);
      };
    }

    // Patch CollectionReference.prototype.get (inherits from Query but may have its own)
    var CollRefProto = Object.getPrototypeOf(db.collection('_'));
    if (CollRefProto && CollRefProto.get && !CollRefProto._originalGet && CollRefProto !== QueryProto) {
      CollRefProto._originalGet = CollRefProto.get;
      CollRefProto.get = function (opts) {
        if (isOfflineMode()) {
          return Promise.resolve(new MockQuerySnapshot());
        }
        return CollRefProto._originalGet.call(this, opts);
      };
    }

    // Patch smartFirestoreQuery to short-circuit when offline
    if (window.smartFirestoreQuery && !window._originalSmartFirestoreQuery) {
      window._originalSmartFirestoreQuery = window.smartFirestoreQuery;
      window.smartFirestoreQuery = async function (queryPromise, options) {
        if (isOfflineMode()) {
          return new MockQuerySnapshot();
        }
        return window._originalSmartFirestoreQuery(queryPromise, options);
      };
    }

    console.log('[OfflineManager] Firestore interceptor installed');
  }

  // --------------- Initialization ---------------

  async function init() {
    try {
      await openDB();
      setupConnectionListeners();
      installFirestoreInterceptor();

      updateOfflineUI(isOfflineMode());

      updateSyncBadge();
      console.log('[OfflineManager] Initialized');
    } catch (error) {
      console.error('[OfflineManager] Init failed:', error);
    }
  }

  // Auto-init when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  /** Map OFFLINE-* local IDs ↔ Firestore cloud IDs from synced pending_patients records. */
  async function getOfflinePatientIdMap() {
    var byOffline = {};
    var byCloud = {};
    try {
      var all = await getAllRecords('pending_patients');
      (all || []).forEach(function (rec) {
        if (rec.localId && rec.cloudId) {
          byOffline[rec.localId] = rec.cloudId;
          byCloud[rec.cloudId] = rec.localId;
        }
      });
    } catch (e) {
      console.warn('[OfflineManager] Could not build offline patient ID map:', e);
    }
    return { byOffline: byOffline, byCloud: byCloud };
  }

  /** All IDs that refer to the same patient (cloud + offline temp IDs). */
  async function resolvePatientIdAliases(patientOrId) {
    var aliases = [];
    var seen = {};
    function add(id) {
      if (!id || seen[id]) return;
      seen[id] = true;
      aliases.push(id);
    }

    var patient = typeof patientOrId === 'object' && patientOrId ? patientOrId : null;
    var primaryId = patient ? patient.id : patientOrId;
    add(primaryId);
    if (patient && patient.offline_local_id) add(patient.offline_local_id);

    try {
      var map = await getOfflinePatientIdMap();
      if (primaryId && map.byCloud[primaryId]) add(map.byCloud[primaryId]);
      Object.keys(map.byOffline).forEach(function (offlineId) {
        if (map.byOffline[offlineId] === primaryId) add(offlineId);
      });
    } catch (e) {
      /* non-critical */
    }
    return aliases;
  }

  function recordMatchesPatientIds(data, aliasIds) {
    if (!data || !aliasIds || !aliasIds.length) return false;
    var ids = [data.patientId, data.offlinePatientId, data.patient_id].filter(Boolean);
    for (var i = 0; i < ids.length; i++) {
      if (aliasIds.indexOf(ids[i]) >= 0) return true;
    }
    return false;
  }

  // --------------- Expose global API ---------------

  window.OfflineManager = {
    isOfflineMode,
    setOfflineMode,
    saveOfflineRecord,
    saveLocalFirstAndTryCloud,
    shouldQueueForSync,
    getPendingRecords,
    getAllRecords,
    getPendingCount,
    markSynced,
    deleteRecord,
    clearSyncedRecords,
    cacheUserProfile,
    getCachedUserProfile,
    cachePatientForOffline,
    patchCachedPatient,
    patchPendingPatientData,
    getCachedPatients,
    getCachedPatient,
    getOfflineLcgForPatient,
    removeCachedPatient,
    updateSyncBadge,
    updateOfflineUI,
    generateLocalId,
    showConnectionToast,
    getOfflinePatientIdMap,
    resolvePatientIdAliases,
    recordMatchesPatientIds
  };
})();
