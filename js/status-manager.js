/**
 * Status Management Utility
 * Handles automatic patient status updates based on care activities.
 * Keeps Firestore, sessionStorage, and offline patient cache aligned.
 */
(function (global) {
  'use strict';

  const PATIENT_STATUSES = {
    REGISTERED: 'registered',
    ANTENATAL: 'antenatal_care',
    IN_LABOUR: 'in_labour',
    BIRTHED: 'birthed',
    POSTNATAL: 'postnatal_care',
    ANC_TRANSFER: 'anc_transfer',
    LABOUR_TRANSFER: 'labour_transfer',
    PNC_TRANSFER: 'pnc_transfer'
  };

  const ADVANCED_STATUSES = new Set([
    PATIENT_STATUSES.IN_LABOUR,
    PATIENT_STATUSES.BIRTHED,
    PATIENT_STATUSES.POSTNATAL,
    PATIENT_STATUSES.ANC_TRANSFER,
    PATIENT_STATUSES.LABOUR_TRANSFER,
    PATIENT_STATUSES.PNC_TRANSFER
  ]);

  function normalizePatientStatus(status) {
    if (status == null || status === '') return PATIENT_STATUSES.REGISTERED;
    const s = String(status).toLowerCase().trim().replace(/[\s-]+/g, '_');
    if (s === 'antenatal' || s === 'anc' || s === 'antenatal_care') return PATIENT_STATUSES.ANTENATAL;
    if (s === 'in_labour' || s === 'labour' || s === 'labour_care') return PATIENT_STATUSES.IN_LABOUR;
    if (s === 'birthed' || s === 'birthed_postnatal') return PATIENT_STATUSES.BIRTHED;
    if (s === 'postnatal' || s === 'postnatal_care' || s === 'postpartum') return PATIENT_STATUSES.POSTNATAL;
    if (s === 'registered' || s === 'register') return PATIENT_STATUSES.REGISTERED;
    return s;
  }

  function isRegisteredLikeStatus(status) {
    const n = normalizePatientStatus(status);
    return n === PATIENT_STATUSES.REGISTERED;
  }

  function updateLocalPatientStatusMirror(patientId, newStatus) {
    if (!patientId || !newStatus) return;

    try {
      if (sessionStorage.getItem('selectedPatientId') === patientId) {
        const raw = sessionStorage.getItem('selectedPatientData');
        if (raw) {
          const parsed = JSON.parse(raw);
          parsed.status = newStatus;
          sessionStorage.setItem('selectedPatientData', JSON.stringify(parsed));
        }
      }
    } catch (e) {
      console.warn('[StatusManager] sessionStorage status mirror failed:', e);
    }

    if (global.OfflineManager && typeof global.OfflineManager.patchCachedPatient === 'function') {
      global.OfflineManager.patchCachedPatient(patientId, { status: newStatus }).catch(function (err) {
        console.warn('[StatusManager] cached patient status patch failed:', err);
      });
    }

    if (String(patientId).indexOf('OFFLINE-') === 0 &&
        global.OfflineManager &&
        typeof global.OfflineManager.patchPendingPatientData === 'function') {
      global.OfflineManager.patchPendingPatientData(patientId, { status: newStatus }).catch(function (err) {
        console.warn('[StatusManager] pending patient status patch failed:', err);
      });
    }
  }

  async function patientHasAntenatalVisit(patientId) {
    if (!patientId || typeof firebase === 'undefined' || !firebase.firestore) return false;
    try {
      const snap = await firebase.firestore()
        .collection('patients')
        .doc(patientId)
        .collection('antenatal_visits')
        .limit(1)
        .get();
      return !snap.empty;
    } catch (error) {
      console.warn('[StatusManager] Could not check ANC visits:', error);
      return false;
    }
  }

  /**
   * Update patient status in Firestore
   */
  async function updatePatientStatus(patientId, newStatus, reason) {
    reason = reason || '';
    try {
      await firebase.firestore()
        .collection('patients')
        .doc(patientId)
        .update({
          status: newStatus,
          status_updated_at: firebase.firestore.FieldValue.serverTimestamp(),
          status_update_reason: reason
        });

      updateLocalPatientStatusMirror(patientId, newStatus);
      return true;
    } catch (error) {
      console.error('[StatusManager] Error updating patient status:', error);
      return false;
    }
  }

  /**
   * Move patient to Antenatal Care when an ANC visit exists.
   * @param {string} patientId
   * @param {Object} [options]
   * @param {boolean} [options.localOnly] - Skip Firestore (offline queue save)
   * @param {boolean} [options.assumeVisitRecorded] - Trust caller (visit just saved/synced)
   */
  async function checkAndUpdateToAntenatalCare(patientId, options) {
    options = options || {};

    if (!patientId || String(patientId).indexOf('OFFLINE-') === 0) {
      if (options.assumeVisitRecorded) {
        updateLocalPatientStatusMirror(patientId, PATIENT_STATUSES.ANTENATAL);
      }
      return false;
    }

    let currentStatus = PATIENT_STATUSES.REGISTERED;
    let patientExists = false;

    if (!options.localOnly && typeof navigator !== 'undefined' && navigator.onLine) {
      try {
        const patientDoc = await firebase.firestore()
          .collection('patients')
          .doc(patientId)
          .get();

        if (!patientDoc.exists) {
          console.error('[StatusManager] Patient not found:', patientId);
          return false;
        }

        patientExists = true;
        currentStatus = normalizePatientStatus(patientDoc.data().status);
      } catch (error) {
        console.error('[StatusManager] Error reading patient for ANC status:', error);
        if (!options.assumeVisitRecorded) return false;
      }
    }

    if (currentStatus === PATIENT_STATUSES.ANTENATAL) {
      updateLocalPatientStatusMirror(patientId, PATIENT_STATUSES.ANTENATAL);
      return true;
    }

    if (ADVANCED_STATUSES.has(currentStatus)) {
      return true;
    }

    const hasVisit = options.assumeVisitRecorded
      ? true
      : await patientHasAntenatalVisit(patientId);

    if (!hasVisit && !options.assumeVisitRecorded) {
      return true;
    }

    if (!isRegisteredLikeStatus(currentStatus) && patientExists) {
      return true;
    }

    updateLocalPatientStatusMirror(patientId, PATIENT_STATUSES.ANTENATAL);

    if (options.localOnly || (typeof navigator !== 'undefined' && !navigator.onLine)) {
      return true;
    }

    return updatePatientStatus(
      patientId,
      PATIENT_STATUSES.ANTENATAL,
      options.reason || 'ANC visit recorded'
    );
  }

  async function checkAndUpdateToInLabour(patientId) {
    try {
      const patientDoc = await firebase.firestore()
        .collection('patients')
        .doc(patientId)
        .get();

      if (!patientDoc.exists) {
        console.error('[StatusManager] Patient not found:', patientId);
        return false;
      }

      const currentStatus = normalizePatientStatus(patientDoc.data().status);

      if (currentStatus === PATIENT_STATUSES.REGISTERED ||
          currentStatus === PATIENT_STATUSES.ANTENATAL) {
        return updatePatientStatus(
          patientId,
          PATIENT_STATUSES.IN_LABOUR,
          'Active first stage time recorded'
        );
      }

      return true;
    } catch (error) {
      console.error('[StatusManager] Error checking in labour status:', error);
      return false;
    }
  }

  async function checkAndUpdateToBirthed(patientId, reason) {
    reason = reason || 'Birth recorded';
    try {
      const patientDoc = await firebase.firestore()
        .collection('patients')
        .doc(patientId)
        .get();

      if (!patientDoc.exists) {
        console.error('[StatusManager] Patient not found:', patientId);
        return false;
      }

      const currentStatus = normalizePatientStatus(patientDoc.data().status);

      if (currentStatus === PATIENT_STATUSES.IN_LABOUR) {
        return updatePatientStatus(patientId, PATIENT_STATUSES.BIRTHED, reason);
      }

      return true;
    } catch (error) {
      console.error('[StatusManager] Error checking birthed status:', error);
      return false;
    }
  }

  async function checkAndUpdateToPostnatalCare(patientId, reason) {
    reason = reason || 'Postnatal activity';
    try {
      const patientDoc = await firebase.firestore()
        .collection('patients')
        .doc(patientId)
        .get();

      if (!patientDoc.exists) {
        console.error('[StatusManager] Patient not found:', patientId);
        return false;
      }

      const currentStatus = normalizePatientStatus(patientDoc.data().status);

      if (currentStatus !== PATIENT_STATUSES.POSTNATAL) {
        return updatePatientStatus(patientId, PATIENT_STATUSES.POSTNATAL, reason);
      }

      return true;
    } catch (error) {
      console.error('[StatusManager] Error checking postnatal care status:', error);
      return false;
    }
  }

  async function getPatientStatus(patientId) {
    try {
      const patientDoc = await firebase.firestore()
        .collection('patients')
        .doc(patientId)
        .get();

      if (!patientDoc.exists) {
        console.error('[StatusManager] Patient not found:', patientId);
        return null;
      }

      return normalizePatientStatus(patientDoc.data().status);
    } catch (error) {
      console.error('[StatusManager] Error getting patient status:', error);
      return null;
    }
  }

  async function checkAndUpdateToTransfer(patientId, transferType, reason) {
    try {
      const validTransferTypes = [
        PATIENT_STATUSES.ANC_TRANSFER,
        PATIENT_STATUSES.LABOUR_TRANSFER,
        PATIENT_STATUSES.PNC_TRANSFER
      ];

      if (!validTransferTypes.includes(transferType)) {
        console.error('[StatusManager] Invalid transfer type:', transferType);
        return false;
      }

      const patientDoc = await firebase.firestore()
        .collection('patients')
        .doc(patientId)
        .get();

      if (!patientDoc.exists) {
        console.error('[StatusManager] Patient not found:', patientId);
        return false;
      }

      return updatePatientStatus(
        patientId,
        transferType,
        reason || ('Transferred during ' + transferType.replace(/_/g, ' '))
      );
    } catch (error) {
      console.error('[StatusManager] Error updating transfer status:', error);
      return false;
    }
  }

  /**
   * Reconcile patients who have ANC visits but are still marked registered.
   */
  async function reconcileAntenatalStatuses(patientIds) {
    if (!patientIds || !patientIds.length) return;
    const seen = new Set();
    for (let i = 0; i < patientIds.length; i++) {
      const pid = patientIds[i];
      if (!pid || seen.has(pid) || String(pid).indexOf('OFFLINE-') === 0) continue;
      seen.add(pid);
      try {
        await checkAndUpdateToAntenatalCare(pid, { assumeVisitRecorded: true });
      } catch (e) {
        console.warn('[StatusManager] Reconcile failed for', pid, e);
      }
    }
  }

  function getStatusDisplayName(status) {
    switch (normalizePatientStatus(status)) {
      case PATIENT_STATUSES.REGISTERED:
        return 'Registered';
      case PATIENT_STATUSES.ANTENATAL:
        return 'Antenatal Care';
      case PATIENT_STATUSES.IN_LABOUR:
        return 'In Labour';
      case PATIENT_STATUSES.BIRTHED:
        return 'Birthed';
      case PATIENT_STATUSES.POSTNATAL:
        return 'Postnatal Care';
      case PATIENT_STATUSES.ANC_TRANSFER:
        return 'ANC Transfer';
      case PATIENT_STATUSES.LABOUR_TRANSFER:
        return 'Labour Transfer';
      case PATIENT_STATUSES.PNC_TRANSFER:
        return 'PNC Transfer';
      default:
        return status || 'Unknown';
    }
  }

  function getStatusBadgeClass(status) {
    switch (normalizePatientStatus(status)) {
      case PATIENT_STATUSES.REGISTERED:
        return 'badge bg-secondary';
      case PATIENT_STATUSES.ANTENATAL:
        return 'badge bg-success';
      case PATIENT_STATUSES.IN_LABOUR:
        return 'badge bg-danger';
      case PATIENT_STATUSES.BIRTHED:
        return 'badge bg-warning';
      case PATIENT_STATUSES.POSTNATAL:
        return 'badge bg-info';
      case PATIENT_STATUSES.ANC_TRANSFER:
      case PATIENT_STATUSES.LABOUR_TRANSFER:
      case PATIENT_STATUSES.PNC_TRANSFER:
        return 'badge bg-warning text-dark';
      default:
        return 'badge bg-secondary';
    }
  }

  global.StatusManager = {
    updatePatientStatus,
    checkAndUpdateToAntenatalCare,
    checkAndUpdateToInLabour,
    checkAndUpdateToBirthed,
    checkAndUpdateToPostnatalCare,
    checkAndUpdateToTransfer,
    getPatientStatus,
    reconcileAntenatalStatuses,
    normalizePatientStatus,
    updateLocalPatientStatusMirror,
    getStatusDisplayName,
    getStatusBadgeClass,
    STATUSES: PATIENT_STATUSES
  };
})(typeof window !== 'undefined' ? window : this);
