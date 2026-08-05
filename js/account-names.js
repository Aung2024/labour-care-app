/**
 * Shared helpers for resolving user account display names.
 */
(function () {
  function getDisplayName(profile, fallback) {
    const data = profile || {};
    return data.name ||
      data.midwife_name ||
      data.midwifeName ||
      data.displayName ||
      data.email ||
      fallback ||
      '';
  }

  async function loadByIds(userIds) {
    const ids = Array.from(new Set((userIds || []).filter(Boolean)));
    const names = {};
    if (!ids.length || typeof firebase === 'undefined' || !firebase.firestore) return names;

    const db = firebase.firestore();
    const documentId = firebase.firestore.FieldPath.documentId();
    const batchSize = 10;

    for (let start = 0; start < ids.length; start += batchSize) {
      const batch = ids.slice(start, start + batchSize);
      try {
        const snapshot = await db.collection('users')
          .where(documentId, 'in', batch)
          .get();
        snapshot.forEach(function (doc) {
          names[doc.id] = getDisplayName(doc.data(), '');
        });
      } catch (error) {
        console.warn('[AccountNames] Could not resolve an account-name batch:', error);
      }
    }

    return names;
  }

  window.AccountNames = {
    getDisplayName,
    loadByIds
  };
})();
