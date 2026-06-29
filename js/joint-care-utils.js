/**
 * Joint Care and visit-edit policy helpers.
 * Keeps shared-care access separate from patient ownership so dashboards stay owner-attributed.
 */
(function () {
  const LINK_COLLECTION = 'joint_care_links';
  const EDIT_REQUEST_COLLECTION = 'visit_edit_requests';

  function nowServer() {
    return firebase.firestore.FieldValue.serverTimestamp();
  }

  function normalizePatientUniqueId(value) {
    return String(value || '').trim().toUpperCase();
  }

  function userRoleKey(profile) {
    return String((profile && profile.role) || '').toLowerCase().replace(/\s+/g, ' ');
  }

  async function getUserProfile(uid) {
    if (!uid) return null;
    if (window.UserCache && typeof UserCache.get === 'function') {
      try {
        const cached = await UserCache.get(uid);
        if (cached) return cached;
      } catch (e) { /* fallback below */ }
    }
    const snap = await firebase.firestore().collection('users').doc(uid).get();
    return snap.exists ? snap.data() : null;
  }

  function isPatientOwner(patientData, uid) {
    return !!patientData && !!uid && (patientData.created_by === uid || patientData.createdBy === uid);
  }

  function canRoleAccessPatient(patientData, profile) {
    const role = userRoleKey(profile);
    if (role === 'super admin' || role === 'admin') return true;
    if (role === 'regional officer') return !!patientData && !!profile && patientData.region === profile.region;
    if (role === 'tmo') return !!patientData && !!profile && patientData.township === profile.township;
    return false;
  }

  async function getActiveJointCareLink(patientId, uid) {
    if (!patientId || !uid) return null;
    const snap = await firebase.firestore().collection(LINK_COLLECTION)
      .where('patientId', '==', patientId)
      .where('linkedMidwifeId', '==', uid)
      .where('status', '==', 'active')
      .limit(1)
      .get();
    if (snap.empty) return null;
    return { id: snap.docs[0].id, ...snap.docs[0].data() };
  }

  async function canAccessPatient(patientId, patientData, user, profile) {
    if (!patientId || !user) return false;
    if (canRoleAccessPatient(patientData, profile)) return true;
    if (isPatientOwner(patientData, user.uid)) return true;
    return !!(await getActiveJointCareLink(patientId, user.uid));
  }

  function buildLinkId(uid, patientId) {
    return String(uid || '').replace(/[^\w-]/g, '_') + '_' + String(patientId || '').replace(/[^\w-]/g, '_');
  }

  async function createJointCareLink(patientDoc, user, profile) {
    if (!patientDoc || !patientDoc.exists || !user) throw new Error('Missing patient or user.');
    const patient = patientDoc.data() || {};
    const patientId = patientDoc.id;
    const patientUniqueId = normalizePatientUniqueId(patient.patient_unique_id || patient.patientUniqueId);
    const ownerMidwifeId = patient.created_by || patient.createdBy || null;
    if (isPatientOwner(patient, user.uid)) {
      return { alreadyOwner: true, patientId, patient: { id: patientId, ...patient } };
    }

    const linkId = buildLinkId(user.uid, patientId);
    const link = {
      patientId,
      patientUniqueId,
      linkedMidwifeId: user.uid,
      linkedMidwifeEmail: user.email || null,
      linkedMidwifeName: (profile && (profile.midwife_name || profile.name || profile.displayName)) || null,
      ownerMidwifeId,
      status: 'active',
      linkedAt: nowServer(),
      updatedAt: nowServer(),
      patientName: patient.name || '',
      patientAge: patient.age || '',
      patientTownship: patient.township || '',
      patientRegion: patient.region || '',
      patientStatus: patient.status || patient.treatmentStatus || 'registered'
    };

    const db = firebase.firestore();
    await db.collection(LINK_COLLECTION).doc(linkId).set(link, { merge: true });
    await logJointCareEvent('joint_care_link_created', user.uid, patientId, {
      patientUniqueId,
      ownerMidwifeId,
      linkedMidwifeId: user.uid
    });
    return { linkId, link, patientId, patient: { id: patientId, ...patient } };
  }

  async function logJointCareEvent(action, uid, patientId, details) {
    try {
      await firebase.firestore().collection('audit_logs').add({
        action,
        userId: uid,
        patientId,
        details: details || {},
        timestamp: nowServer()
      });
    } catch (e) {
      console.warn('[JointCare] audit log failed:', e);
    }
  }

  const VISIT_TYPES = {
    anc: { collection: 'antenatal_visits', label: 'ANC', form: 'antenatal-form.html' },
    pnc: { collection: 'postpartum_visits', label: 'PNC', form: 'postpartum-form.html' },
    newborn: { collection: 'newborn_care', label: 'Newborn', form: 'newborn-care-page.html' },
    immediate_newborn: { collection: 'immediate_newborn_care', label: 'Immediate Newborn', form: 'immediate-newborn-care-form.html' }
  };

  function getVisitTypeConfig(type) {
    return VISIT_TYPES[type] || null;
  }

  function timestampToDate(value) {
    if (!value) return null;
    if (value.toDate && typeof value.toDate === 'function') return value.toDate();
    if (value.seconds) return new Date(value.seconds * 1000);
    const parsed = new Date(value);
    return isNaN(parsed.getTime()) ? null : parsed;
  }

  function visitCreatorId(visit) {
    return visit && (visit.createdBy || visit.recordedBy || visit.providerId || visit.userId || visit.created_by || '');
  }

  function visitCreatedDate(visit) {
    return timestampToDate(visit && (visit.createdAt || visit.timestamp || visit.offline_created_at || visit.localCreatedAt || visit.visitCreatedAt));
  }

  function isWithinEditWindow(visit, nowMs) {
    const created = visitCreatedDate(visit);
    if (!created) return false;
    return ((nowMs || Date.now()) - created.getTime()) <= 7 * 24 * 60 * 60 * 1000;
  }

  function canUserEditVisitNow(visit, uid) {
    return !!uid && visitCreatorId(visit) === uid && isWithinEditWindow(visit);
  }

  async function findUnusedApproval(patientId, visitType, visitId, uid) {
    const snap = await firebase.firestore().collection(EDIT_REQUEST_COLLECTION)
      .where('patientId', '==', patientId)
      .where('visitType', '==', visitType)
      .where('visitId', '==', visitId)
      .where('requesterId', '==', uid)
      .where('status', '==', 'approved')
      .where('used', '==', false)
      .limit(1)
      .get();
    if (snap.empty) return null;
    return { id: snap.docs[0].id, ...snap.docs[0].data() };
  }

  async function requestVisitEdit(patient, visitType, visitId, visit, user, reason) {
    if (!patient || !patient.id || !user) throw new Error('Missing patient or user.');
    const db = firebase.firestore();
    const existing = await db.collection(EDIT_REQUEST_COLLECTION)
      .where('patientId', '==', patient.id)
      .where('visitType', '==', visitType)
      .where('visitId', '==', visitId)
      .where('requesterId', '==', user.uid)
      .where('status', '==', 'pending')
      .limit(1)
      .get();
    if (!existing.empty) return { id: existing.docs[0].id, alreadyPending: true };

    const ref = await db.collection(EDIT_REQUEST_COLLECTION).add({
      patientId: patient.id,
      patientName: patient.name || '',
      patientUniqueId: normalizePatientUniqueId(patient.patient_unique_id || patient.patientUniqueId),
      ownerMidwifeId: patient.created_by || patient.createdBy || null,
      township: patient.township || '',
      region: patient.region || '',
      visitType,
      visitId,
      visitNumber: visit && (visit.visitNumber || visit.visit_number || null),
      visitDate: visit && (visit.visitDate || visit.visit_date || null),
      requesterId: user.uid,
      requesterEmail: user.email || '',
      reason: reason || '',
      status: 'pending',
      used: false,
      requestedAt: nowServer()
    });
    return { id: ref.id, alreadyPending: false };
  }

  async function markApprovalUsed(approvalId, uid) {
    if (!approvalId) return;
    await firebase.firestore().collection(EDIT_REQUEST_COLLECTION).doc(approvalId).update({
      used: true,
      usedBy: uid || null,
      usedAt: nowServer(),
      status: 'used'
    });
  }

  window.JointCareUtils = {
    LINK_COLLECTION,
    EDIT_REQUEST_COLLECTION,
    normalizePatientUniqueId,
    getUserProfile,
    isPatientOwner,
    getActiveJointCareLink,
    canAccessPatient,
    createJointCareLink,
    logJointCareEvent,
    getVisitTypeConfig,
    timestampToDate,
    visitCreatorId,
    visitCreatedDate,
    isWithinEditWindow,
    canUserEditVisitNow,
    findUnusedApproval,
    requestVisitEdit,
    markApprovalUsed
  };
})();
