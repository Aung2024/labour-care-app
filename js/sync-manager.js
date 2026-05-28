/**
 * Sync Manager for MCH Care App
 * Orchestrates syncing offline data to Firestore when connectivity returns.
 */
(function () {
  'use strict';

  let syncInProgress = false;
  const syncedAncPatientIds = new Set();

  async function applyAntenatalStatusAfterAncSync(patientId) {
    if (!patientId || String(patientId).indexOf('OFFLINE-') === 0) return;
    if (window.StatusManager && typeof window.StatusManager.checkAndUpdateToAntenatalCare === 'function') {
      await window.StatusManager.checkAndUpdateToAntenatalCare(patientId, {
        assumeVisitRecorded: true,
        reason: 'ANC visit synced from offline'
      });
      return;
    }
    try {
      const doc = await firebase.firestore().collection('patients').doc(patientId).get();
      if (!doc.exists) return;
      const st = doc.data().status;
      if (!st || st === 'registered') {
        await firebase.firestore().collection('patients').doc(patientId).update({
          status: 'antenatal_care',
          status_updated_at: firebase.firestore.FieldValue.serverTimestamp(),
          status_update_reason: 'ANC visit synced from offline'
        });
      }
    } catch (e) {
      console.warn('[SyncManager] Inline ANC status update failed:', e);
    }
  }

  /**
   * Generate a real patient unique ID using Firestore transactions.
   * Replicates the logic from patient-enhanced.html generatePatientUniqueId().
   */
  async function generatePatientUniqueId(tspCodeRaw, facilityCodeRaw) {
    const db = firebase.firestore();

    function sanitize(val, fallback) {
      const s = (val || fallback || '').toString().trim();
      return s ? s.replace(/[^A-Za-z0-9-]/g, '').toUpperCase() : fallback;
    }

    const tspCode = sanitize(tspCodeRaw, 'UNK');
    let facilityCode = (facilityCodeRaw || '003').toString().trim().padStart(3, '0').substring(0, 3);
    if (!/^\d{3}$/.test(facilityCode)) facilityCode = '003';

    const yearSuffix = new Date().getFullYear().toString().slice(-2);
    const sanitizedTspCode = tspCode.replace(/[^A-Za-z0-9]/g, '');
    const counterId = `${sanitizedTspCode}_${facilityCode}_${yearSuffix}`;
    const counterRef = db.collection('patient_counters').doc(counterId);

    const nextSerial = await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(counterRef);
      let currentSerial = 0;
      if (snapshot.exists) {
        const data = snapshot.data();
        if (typeof data.lastSerial === 'number') {
          currentSerial = data.lastSerial;
        }
      }
      const updated = currentSerial + 1;
      transaction.set(counterRef, {
        lastSerial: updated,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      return updated;
    });

    const serialStr = String(nextSerial).padStart(4, '0');
    return `${tspCode}-${facilityCode}-${yearSuffix}${serialStr}`;
  }

  // -------- Sync orchestration --------

  async function syncAll(progressCallback) {
    if (syncInProgress) {
      console.warn('[SyncManager] Sync already in progress');
      return { success: false, message: 'Sync already in progress' };
    }

    if (!navigator.onLine) {
      return { success: false, message: 'No internet connection. Please try again when online.' };
    }

    syncInProgress = true;
    syncedAncPatientIds.clear();
    const results = {
      patients: { synced: 0, errors: 0, details: [] },
      ancVisits: { synced: 0, errors: 0, details: [] },
      pncVisits: { synced: 0, errors: 0, details: [] },
      labTests: { synced: 0, errors: 0, details: [] },
      lcgRecords: { synced: 0, errors: 0, details: [] },
      newbornRecords: { synced: 0, errors: 0, details: [] }
    };

    const tempIdToRealId = {};

    try {
      const report = (step, detail) => {
        if (typeof progressCallback === 'function') progressCallback(step, detail);
      };

      // Step 0: upload offline-created patient roots first. Sub-records such as
      // ANC visits and lab tests may depend on the patient document already
      // existing for Firestore rules/status updates.
      if (window.LabourCareOffline && typeof window.LabourCareOffline.flushOutbox === 'function') {
        report('patients', 'Uploading offline patients...');
        await window.LabourCareOffline.flushOutbox();
      }

      // Step 1: Sync patients first (we need real IDs for sub-records)
      report('patients', 'Syncing patients...');
      const pendingPatients = await window.OfflineManager.getPendingRecords('pending_patients');
      const pendingAncAll = await window.OfflineManager.getPendingRecords('pending_anc_visits');

      for (const record of pendingPatients) {
        try {
          const patientData = record.data;
          const tempId = record.localId;

          const tspCode = patientData.tsp_code || 'UNK';
          const facilityCode = patientData.facility_code || '003';

          const realPatientUniqueId = await generatePatientUniqueId(tspCode, facilityCode);

          const firestoreData = { ...patientData };
          delete firestoreData.localId;
          delete firestoreData._isOffline;
          delete firestoreData.facility_code;

          firestoreData.patient_unique_id = realPatientUniqueId;
          firestoreData.created_at = firebase.firestore.FieldValue.serverTimestamp();
          const hasQueuedAnc = pendingAncAll.some(function (anc) {
            const pid = anc.data && (anc.data.patientId || anc.data.offlinePatientId);
            return pid === tempId;
          });
          firestoreData.status = hasQueuedAnc
            ? 'antenatal_care'
            : (firestoreData.status || 'registered');
          firestoreData.hasConsent = firestoreData.hasConsent !== undefined ? firestoreData.hasConsent : true;
          firestoreData.consentStatus = firestoreData.consentStatus || 'consented';
          firestoreData.synced_from_offline = true;
          firestoreData.offline_created_at = record.createdAt;

          const docRef = await firebase.firestore().collection('patients').add(firestoreData);

          tempIdToRealId[tempId] = docRef.id;

          // Remap sessionStorage so patient-care-hub finds the real ID
          try {
            if (sessionStorage.getItem('selectedPatientId') === tempId) {
              sessionStorage.setItem('selectedPatientId', docRef.id);
              var cachedPatientData = sessionStorage.getItem('selectedPatientData');
              if (cachedPatientData) {
                var parsed = JSON.parse(cachedPatientData);
                parsed.id = docRef.id;
                parsed.patient_unique_id = realPatientUniqueId;
                sessionStorage.setItem('selectedPatientData', JSON.stringify(parsed));
              }
            }
          } catch (e) { /* non-critical */ }

          await window.OfflineManager.markSynced('pending_patients', tempId, docRef.id);
          results.patients.synced++;
          results.patients.details.push({
            name: patientData.name,
            tempId,
            realId: docRef.id,
            patientUniqueId: realPatientUniqueId
          });
        } catch (err) {
          console.error('[SyncManager] Error syncing patient:', err);
          results.patients.errors++;
          results.patients.details.push({ tempId: record.localId, error: err.message });
        }
      }

      // Clean up OFFLINE- mirror entries so no duplicates appear in list
      for (var oldTempId in tempIdToRealId) {
        if (oldTempId.startsWith('OFFLINE-')) {
          try {
            if (window.OfflineStore && OfflineStore.deleteDocument) {
              await OfflineStore.deleteDocument('patients/' + oldTempId);
            }
          } catch (e) {
            console.warn('[SyncManager] Could not remove mirrored OFFLINE patient:', e);
          }
        }
      }

      // Step 2: Sync ANC visits
      report('anc', 'Syncing ANC visits...');
      await syncSubRecords(
        'pending_anc_visits', 'antenatal_visits',
        tempIdToRealId, results.ancVisits, report,
        { assignVisitNumber: true }
      );

      // Step 3: Sync PNC visits
      report('pnc', 'Syncing PNC visits...');
      await syncSubRecords(
        'pending_pnc_visits', 'postpartum_visits',
        tempIdToRealId, results.pncVisits, report,
        { assignVisitNumber: true }
      );

      // Step 4: Sync Lab test records
      report('lab', 'Syncing lab tests...');
      await syncSubRecords(
        'pending_lab_tests', 'testRecords',
        tempIdToRealId, results.labTests, report
      );

      // Step 5: Sync LCG records
      report('lcg', 'Syncing LCG records...');
      await syncLCGRecords(tempIdToRealId, results.lcgRecords, report);

      // Step 6: Sync newborn records
      report('newborn', 'Syncing newborn records...');
      await syncSubRecords(
        'pending_newborn_records', 'immediate_newborn_care',
        tempIdToRealId, results.newbornRecords, report,
        {
          collectionResolver: function (_record, visitData, fallbackCollection) {
            return visitData._collection || fallbackCollection;
          }
        }
      );

      if (syncedAncPatientIds.size > 0) {
        if (window.StatusManager && typeof window.StatusManager.reconcileAntenatalStatuses === 'function') {
          await window.StatusManager.reconcileAntenatalStatuses(Array.from(syncedAncPatientIds));
        } else {
          for (const pid of syncedAncPatientIds) {
            await applyAntenatalStatusAfterAncSync(pid);
          }
        }
      }

      // Clean up synced records
      await window.OfflineManager.clearSyncedRecords();

      report('done', 'Sync complete!');
      return { success: true, results };

    } catch (error) {
      console.error('[SyncManager] Sync failed:', error);
      return { success: false, message: error.message, results };
    } finally {
      syncInProgress = false;
      window.OfflineManager.updateSyncBadge();
    }
  }

  async function getNextVisitNumber(patientId, subCollection) {
    const baseRef = firebase.firestore()
      .collection('patients')
      .doc(patientId)
      .collection(subCollection);

    try {
      const latestSnap = await baseRef.orderBy('visitNumber', 'desc').limit(1).get();
      if (!latestSnap.empty) {
        const latest = latestSnap.docs[0].data();
        const latestVisit = parseInt(latest.visitNumber, 10);
        if (!isNaN(latestVisit) && latestVisit > 0) {
          return latestVisit + 1;
        }
      }
    } catch (error) {
      console.warn('[SyncManager] Could not order by visitNumber, using count fallback:', error);
    }

    try {
      const allSnap = await baseRef.get();
      return (allSnap.size || 0) + 1;
    } catch (error) {
      console.warn('[SyncManager] Could not load existing visits, defaulting visitNumber=1:', error);
      return 1;
    }
  }

  async function syncSubRecords(storeName, firestoreSubCollection, tempIdToRealId, resultBucket, report, options) {
    const opts = options || {};
    const pendingRecords = await window.OfflineManager.getPendingRecords(storeName);

    for (const record of pendingRecords) {
      try {
        const visitData = { ...record.data };
        let patientId = visitData.patientId || visitData.offlinePatientId;

        if (patientId && tempIdToRealId[patientId]) {
          patientId = tempIdToRealId[patientId];
        }

        if (!patientId || patientId.startsWith('OFFLINE-')) {
          resultBucket.errors++;
          resultBucket.details.push({
            localId: record.localId,
            error: 'Could not resolve patient ID: ' + patientId
          });
          continue;
        }

        delete visitData.localId;
        delete visitData._isOffline;
        delete visitData.offlinePatientId;
        delete visitData._queueEntity;
        delete visitData.syncState;
        delete visitData.entityType;

        visitData.patientId = patientId;
        visitData.timestamp = firebase.firestore.FieldValue.serverTimestamp();
        visitData.synced_from_offline = true;
        visitData.offline_created_at = record.createdAt;

        if (opts.assignVisitNumber) {
          const hasVisitNumber = !isNaN(parseInt(visitData.visitNumber, 10));
          if (!hasVisitNumber) {
            const nextVisit = await getNextVisitNumber(patientId, firestoreSubCollection);
            visitData.visitNumber = nextVisit;
            if (firestoreSubCollection === 'antenatal_visits') {
              visitData.totalAncVisits = Math.max(0, nextVisit - 1);
            }
          }
          delete visitData._needsVisitNumber;
        }

        const targetCollection = typeof opts.collectionResolver === 'function'
          ? opts.collectionResolver(record, visitData, firestoreSubCollection)
          : firestoreSubCollection;
        delete visitData._collection;
        const targetDocId = visitData._docId || null;
        delete visitData._docId;

        const subRef = firebase.firestore()
          .collection('patients')
          .doc(patientId)
          .collection(targetCollection);
        let cloudId = null;
        if (targetDocId) {
          await subRef.doc(targetDocId).set(visitData, { merge: true });
          cloudId = targetDocId;
        } else {
          const docRef = await subRef.add(visitData);
          cloudId = docRef.id;
        }

        await window.OfflineManager.markSynced(storeName, record.localId, cloudId);
        resultBucket.synced++;

        try {
          if (storeName === 'pending_anc_visits') {
            syncedAncPatientIds.add(patientId);
            await applyAntenatalStatusAfterAncSync(patientId);
          } else if (window.StatusManager && storeName === 'pending_pnc_visits') {
            await StatusManager.checkAndUpdateToPostnatalCare(patientId, 'PNC visit synced from offline');
          } else if (window.StatusManager && storeName === 'pending_newborn_records') {
            await StatusManager.checkAndUpdateToBirthed(patientId, 'Newborn care synced from offline');
          }
        } catch (statusErr) {
          console.warn('[SyncManager] Status update failed (non-critical):', statusErr);
        }

      } catch (err) {
        console.error(`[SyncManager] Error syncing ${storeName} record:`, err);
        resultBucket.errors++;
        resultBucket.details.push({ localId: record.localId, error: err.message });
      }
    }
  }

  async function syncLCGRecords(tempIdToRealId, resultBucket, report) {
    const pendingRecords = await window.OfflineManager.getPendingRecords('pending_lcg_records');

    for (const record of pendingRecords) {
      try {
        const lcgData = { ...record.data };
        let patientId = lcgData.patientId || lcgData.offlinePatientId;

        if (patientId && tempIdToRealId[patientId]) {
          patientId = tempIdToRealId[patientId];
        }

        if (!patientId || patientId.startsWith('OFFLINE-')) {
          resultBucket.errors++;
          resultBucket.details.push({
            localId: record.localId,
            error: 'Could not resolve patient ID: ' + patientId
          });
          continue;
        }

        delete lcgData.localId;
        delete lcgData._isOffline;
        delete lcgData.offlinePatientId;
        delete lcgData.syncState;
        delete lcgData.entityType;

        const docName = lcgData._docName || 'summary';
        delete lcgData._docName;

        lcgData.timestamp = firebase.firestore.FieldValue.serverTimestamp();
        lcgData.synced_from_offline = true;
        lcgData.offline_created_at = record.createdAt;

        const recordsBase = firebase.firestore()
          .collection('patients')
          .doc(patientId)
          .collection('records');

        await recordsBase.doc(docName).set(lcgData, { merge: true });

        if (docName === 'summary' && lcgData.startingTime) {
          await recordsBase.doc('startingTime').set({
            startingTime: lcgData.startingTime,
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            synced_from_offline: true
          }, { merge: true });
        }

        if (docName === 'summary' && lcgData.secondStageTime) {
          await recordsBase.doc('secondStage').set({
            secondStageStartTime: lcgData.secondStageTime,
            isSecondStageActive: true,
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            synced_from_offline: true
          }, { merge: true });
        }

        if (lcgData.startingTime && window.StatusManager) {
          try {
            await StatusManager.checkAndUpdateToInLabour(patientId);
          } catch (e) {
            console.warn('[SyncManager] Status update failed (non-critical):', e);
          }
        }

        await window.OfflineManager.markSynced('pending_lcg_records', record.localId, docName);
        resultBucket.synced++;

      } catch (err) {
        console.error('[SyncManager] Error syncing LCG record:', err);
        resultBucket.errors++;
        resultBucket.details.push({ localId: record.localId, error: err.message });
      }
    }
  }

  // -------- Sync UI --------

  function showSyncModal() {
    let modal = document.getElementById('syncProgressModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'syncProgressModal';
      modal.style.cssText = `
        position:fixed;top:0;left:0;width:100%;height:100%;
        background:rgba(0,0,0,0.6);z-index:100000;
        display:flex;align-items:center;justify-content:center;
      `;
      modal.innerHTML = `
        <div style="background:#fff;border-radius:16px;padding:2rem;max-width:420px;width:90%;text-align:center;box-shadow:0 8px 32px rgba(0,0,0,0.2);">
          <h4 style="margin-bottom:1rem;"><i class="fas fa-sync fa-spin me-2" id="syncSpinIcon"></i>
            <span class="lang-text" data-en="Syncing Offline Data" data-mm="အော့ဖ်လိုင်း ဒေတာ စင့်ခ်လုပ်နေသည်">Syncing Offline Data</span>
          </h4>
          <div id="syncProgressText" style="margin-bottom:1rem;color:#6b7280;font-size:0.95rem;">Preparing...</div>
          <div style="background:#e5e7eb;border-radius:8px;height:8px;overflow:hidden;margin-bottom:1.5rem;">
            <div id="syncProgressBar" style="background:linear-gradient(90deg,#2563eb,#059669);height:100%;width:0%;transition:width 0.5s ease;border-radius:8px;"></div>
          </div>
          <div id="syncResultArea" style="display:none;text-align:left;"></div>
          <button id="syncCloseBtn" class="btn btn-primary" style="display:none;" onclick="window.location.reload()">
            <i class="fas fa-check me-2"></i><span class="lang-text" data-en="Done" data-mm="ပြီးပါပြီ">Done</span>
          </button>
        </div>
      `;
      document.body.appendChild(modal);
    }
    modal.style.display = 'flex';
    document.getElementById('syncCloseBtn').style.display = 'none';
    document.getElementById('syncResultArea').style.display = 'none';
    document.getElementById('syncSpinIcon').className = 'fas fa-sync fa-spin me-2';
    document.getElementById('syncProgressBar').style.width = '0%';
    document.getElementById('syncProgressText').textContent = 'Preparing...';
    return modal;
  }

  function updateSyncProgress(step, detail) {
    const progressText = document.getElementById('syncProgressText');
    const progressBar = document.getElementById('syncProgressBar');
    if (!progressText || !progressBar) return;

    const stepMap = {
      patients: { text: 'Syncing patients...', pct: 20 },
      anc: { text: 'Syncing ANC visits...', pct: 40 },
      pnc: { text: 'Syncing PNC visits...', pct: 60 },
      lab: { text: 'Syncing lab tests...', pct: 75 },
      lcg: { text: 'Syncing LCG records...', pct: 88 },
      newborn: { text: 'Syncing newborn records...', pct: 95 },
      done: { text: 'Sync complete!', pct: 100 }
    };

    const info = stepMap[step];
    if (info) {
      progressText.textContent = info.text;
      progressBar.style.width = info.pct + '%';
    }
  }

  function showSyncResults(result) {
    const area = document.getElementById('syncResultArea');
    const closeBtn = document.getElementById('syncCloseBtn');
    const spinIcon = document.getElementById('syncSpinIcon');

    if (!area || !closeBtn) return;

    if (spinIcon) spinIcon.className = 'fas fa-check-circle me-2';

    let html = '';
    if (result.success && result.results) {
      const r = result.results;
      const totalSynced = r.patients.synced + r.ancVisits.synced + r.pncVisits.synced + r.labTests.synced +
        r.lcgRecords.synced + r.newbornRecords.synced;
      const totalErrors = r.patients.errors + r.ancVisits.errors + r.pncVisits.errors + r.labTests.errors +
        r.lcgRecords.errors + r.newbornRecords.errors;

      html += `<div class="alert ${totalErrors > 0 ? 'alert-warning' : 'alert-success'}" style="font-size:0.9rem;">`;
      html += `<strong>${totalSynced} records synced successfully</strong>`;
      if (totalErrors > 0) html += `<br>${totalErrors} errors occurred`;
      html += '</div>';

      html += '<ul style="list-style:none;padding:0;font-size:0.85rem;color:#374151;">';
      if (r.patients.synced > 0) html += `<li><i class="fas fa-user-plus text-success me-2"></i>${r.patients.synced} patients</li>`;
      if (r.ancVisits.synced > 0) html += `<li><i class="fas fa-notes-medical text-success me-2"></i>${r.ancVisits.synced} ANC visits</li>`;
      if (r.pncVisits.synced > 0) html += `<li><i class="fas fa-baby text-success me-2"></i>${r.pncVisits.synced} PNC visits</li>`;
      if (r.labTests.synced > 0) html += `<li><i class="fas fa-vial text-success me-2"></i>${r.labTests.synced} lab tests</li>`;
      if (r.lcgRecords.synced > 0) html += `<li><i class="fas fa-heartbeat text-success me-2"></i>${r.lcgRecords.synced} LCG records</li>`;
      if (r.newbornRecords.synced > 0) html += `<li><i class="fas fa-child text-success me-2"></i>${r.newbornRecords.synced} newborn records</li>`;
      html += '</ul>';
    } else {
      html += `<div class="alert alert-danger" style="font-size:0.9rem;">${result.message || 'Sync failed'}</div>`;
    }

    area.innerHTML = html;
    area.style.display = 'block';
    closeBtn.style.display = 'inline-block';
  }

  // -------- Public entry point for sync button --------

  async function startSync() {
    const modal = showSyncModal();
    const result = await syncAll(updateSyncProgress);
    showSyncResults(result);

    // Turn off offline mode if everything synced successfully
    if (result.success) {
      const remaining = await window.OfflineManager.getPendingCount();
      if (remaining === 0) {
        window.OfflineManager.setOfflineMode(false);
      }
    }
  }

  // -------- Expose global API --------

  window.SyncManager = {
    syncAll,
    startSync,
    showSyncModal,
    generatePatientUniqueId
  };
})();
