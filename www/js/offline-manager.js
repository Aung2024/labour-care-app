/**
 * Offline Manager for MCH Care App
 * Handles IndexedDB storage, offline mode toggle, and connection detection.
 */
(function () {
  'use strict';

  const DB_NAME = 'mch_offline_db';
  const DB_VERSION = 1;
  const OFFLINE_MODE_KEY = 'offlineMode';

  const STORE_NAMES = [
    'pending_patients',
    'pending_anc_visits',
    'pending_pnc_visits',
    'pending_lcg_records',
    'pending_newborn_records',
    'offline_user_profile'
  ];

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
      const record = {
        localId: data.localId || generateLocalId(),
        data: data,
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
      { selector: '#townshipReportCard', label: 'Online only' },
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

  // --------------- Initialization ---------------

  async function init() {
    try {
      await openDB();
      setupConnectionListeners();

      if (isOfflineMode()) {
        updateOfflineUI(true);
      }

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

  // --------------- Expose global API ---------------

  window.OfflineManager = {
    isOfflineMode,
    setOfflineMode,
    saveOfflineRecord,
    getPendingRecords,
    getAllRecords,
    getPendingCount,
    markSynced,
    deleteRecord,
    clearSyncedRecords,
    cacheUserProfile,
    getCachedUserProfile,
    updateSyncBadge,
    updateOfflineUI,
    generateLocalId,
    showConnectionToast
  };
})();
