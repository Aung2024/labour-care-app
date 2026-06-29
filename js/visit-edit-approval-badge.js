/**
 * Small approved-edit counter for ANC/PNC/Newborn hub cards.
 * Counts approved, unused requests for the current user and selected patient.
 */
(function () {
  async function refresh(visitType, badgeId) {
    var badge = document.getElementById(badgeId);
    if (!badge || !window.firebase || !firebase.auth || !firebase.firestore) return;

    var user = firebase.auth().currentUser || (window.resolvePilotAuthUser ? window.resolvePilotAuthUser(null) : null);
    var patientId = sessionStorage.getItem('selectedPatientId');
    if (!user || !patientId || typeof navigator !== 'undefined' && navigator.onLine === false) {
      badge.style.display = 'none';
      return;
    }

    try {
      var snap = await firebase.firestore()
        .collection('visit_edit_requests')
        .where('requesterId', '==', user.uid)
        .limit(100)
        .get();

      var count = 0;
      snap.forEach(function (doc) {
        var data = doc.data() || {};
        if (
          data.patientId === patientId &&
          data.visitType === visitType &&
          data.status === 'approved' &&
          data.used !== true
        ) {
          count += 1;
        }
      });

      if (count > 0) {
        badge.textContent = count > 99 ? '99+' : String(count);
        badge.style.display = 'inline-flex';
        badge.setAttribute('aria-label', count + ' approved edit request' + (count === 1 ? '' : 's'));
      } else {
        badge.style.display = 'none';
      }
    } catch (error) {
      console.warn('Visit edit approval badge failed:', error);
      badge.style.display = 'none';
    }
  }

  window.VisitEditApprovalBadge = { refresh: refresh };
})();
