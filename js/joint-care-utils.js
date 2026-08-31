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
    const doc = await firebase.firestore()
      .collection(LINK_COLLECTION)
      .doc(uid)
      .collection('patients')
      .doc(patientId)
      .get();
    if (!doc.exists) return null;
    const data = doc.data() || {};
    if (data.status !== 'active') return null;
    return { id: doc.id, ...data };
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
    await db.collection(LINK_COLLECTION).doc(user.uid).collection('patients').doc(patientId).set({
      ...link,
      linkId
    }, { merge: true });
    try {
      await db.collection('patients').doc(patientId).set({
        care_team_midwife_ids: firebase.firestore.FieldValue.arrayUnion(user.uid),
        updatedAt: nowServer()
      }, { merge: true });
    } catch (e) {
      console.warn('[JointCare] could not add linked midwife to care team:', e);
    }
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
    immediate_newborn: { collection: 'immediate_newborn_care', label: 'Immediate Newborn', form: 'immediate-newborn-care-form.html' },
    delivery: { collection: 'records', fixedDocId: 'deliveryNotes', label: 'Delivery Notes', form: 'patient-care-hub.html', editParam: 'editDelivery=1' }
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

  function canUserEditVisitNow(visit, uid, nowMs) {
    return !!uid && visitCreatorId(visit) === uid && isWithinEditWindow(visit, nowMs);
  }

  function isSupervisorRole(role) {
    const key = String(role || '').toLowerCase().replace(/\s+/g, ' ');
    return key === 'tmo' || key === 'super admin' || key === 'admin';
  }

  function approvalMatchesEdit(data, patientId, visitType, visitId, uid) {
    return !!data &&
      data.status === 'approved' &&
      data.used !== true &&
      data.patientId === patientId &&
      data.visitType === visitType &&
      data.visitId === visitId &&
      data.requesterId === uid &&
      !!data.reviewedBy &&
      data.reviewedBy !== uid &&
      isSupervisorRole(data.reviewerRole);
  }

  function buildEditRequestId(patientId, visitType, visitId, uid) {
    return [patientId, visitType, visitId, uid].map(function (part) {
      return String(part || '').replace(/[^\w-]/g, '_');
    }).join('__');
  }

  async function findUnusedApproval(patientId, visitType, visitId, uid) {
    try {
      const requestId = buildEditRequestId(patientId, visitType, visitId, uid);
      const doc = await firebase.firestore().collection(EDIT_REQUEST_COLLECTION).doc(requestId).get();
      if (!doc.exists) return null;
      const data = doc.data() || {};
      if (data.status !== 'approved' || data.used === true) return null;
      return { id: doc.id, ...data };
    } catch (error) {
      console.warn('[JointCare] approval lookup failed:', error);
      return null;
    }
  }

  async function validateApprovalDoc(doc, patient, visitType, visitId, uid) {
    if (!doc || !doc.exists) return null;
    const data = doc.data() || {};
    if (!approvalMatchesEdit(data, patient.id, visitType, visitId, uid)) return null;
    const reviewerDoc = await firebase.firestore().collection('users').doc(data.reviewedBy).get();
    if (!reviewerDoc.exists) return null;
    const reviewer = reviewerDoc.data() || {};
    if (!isSupervisorRole(reviewer.role)) return null;
    if (String(reviewer.role || '').toLowerCase() === 'tmo' &&
        (!reviewer.township || reviewer.township !== patient.township)) return null;
    return { id: doc.id, ...data };
  }

  async function authorizeVisitEdit(options) {
    const patientId = options && options.patientId;
    const visitType = options && options.visitType;
    const visitId = options && options.visitId;
    const user = options && options.user;
    const approvalId = options && options.approvalId;
    const config = getVisitTypeConfig(visitType);
    if (!patientId || !visitId || !user || !config || config.fixedDocId) {
      throw new Error('This visit edit request is invalid.');
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      throw new Error('Edited visits require an online authorization check.');
    }

    const db = firebase.firestore();
    const patientRef = db.collection('patients').doc(patientId);
    const visitRef = patientRef.collection(config.collection).doc(visitId);
    const results = await Promise.all([
      patientRef.get(),
      visitRef.get(),
      db.collection('users').doc(user.uid).get()
    ]);
    if (!results[0].exists) throw new Error('Patient not found.');
    if (!results[1].exists) throw new Error('The selected visit could not be found.');
    const patient = { id: results[0].id, ...(results[0].data() || {}) };
    const visit = results[1].data() || {};
    const profile = results[2].exists ? results[2].data() : null;
    if (!(await canAccessPatient(patientId, patient, user, profile))) {
      throw new Error('You no longer have access to this patient.');
    }
    if (visitCreatorId(visit) !== user.uid) {
      throw new Error('Only the visit creator can edit this record.');
    }

    let approval = null;
    if (!canUserEditVisitNow(visit, user.uid)) {
      const canonicalId = buildEditRequestId(patientId, visitType, visitId, user.uid);
      if (!approvalId || approvalId !== canonicalId) {
        throw new Error('This visit is outside the 7-day edit window and needs approval.');
      }
      const approvalDoc = await db.collection(EDIT_REQUEST_COLLECTION).doc(approvalId).get();
      approval = await validateApprovalDoc(approvalDoc, patient, visitType, visitId, user.uid);
      if (!approval) throw new Error('The supervised edit approval is invalid or has already been used.');
    }
    return { patient, visit, visitRef, approval };
  }

  async function commitAuthorizedVisitEdit(options, updateData) {
    const patientId = options && options.patientId;
    const visitType = options && options.visitType;
    const visitId = options && options.visitId;
    const user = options && options.user;
    const approvalId = options && options.approvalId;
    const config = getVisitTypeConfig(visitType);
    if (!patientId || !visitId || !user || !config || config.fixedDocId) {
      throw new Error('This visit edit request is invalid.');
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      throw new Error('Edited visits cannot be saved offline.');
    }

    const db = firebase.firestore();
    const patientRef = db.collection('patients').doc(patientId);
    const visitRef = patientRef.collection(config.collection).doc(visitId);
    const userRef = db.collection('users').doc(user.uid);
    return db.runTransaction(async function (transaction) {
      const patientDoc = await transaction.get(patientRef);
      const visitDoc = await transaction.get(visitRef);
      const profileDoc = await transaction.get(userRef);
      if (!patientDoc.exists || !visitDoc.exists) throw new Error('Patient or visit no longer exists.');
      const patient = { id: patientDoc.id, ...(patientDoc.data() || {}) };
      const visit = visitDoc.data() || {};
      const profile = profileDoc.exists ? profileDoc.data() : null;

      let hasAccess = canRoleAccessPatient(patient, profile) || isPatientOwner(patient, user.uid);
      if (!hasAccess) {
        const linkRef = db.collection(LINK_COLLECTION).doc(user.uid).collection('patients').doc(patientId);
        const linkDoc = await transaction.get(linkRef);
        hasAccess = linkDoc.exists && (linkDoc.data() || {}).status === 'active';
      }
      if (!hasAccess) throw new Error('You no longer have access to this patient.');
      if (visitCreatorId(visit) !== user.uid) throw new Error('Only the visit creator can edit this record.');

      let approvalRef = null;
      if (!canUserEditVisitNow(visit, user.uid)) {
        const canonicalId = buildEditRequestId(patientId, visitType, visitId, user.uid);
        if (!approvalId || approvalId !== canonicalId) {
          throw new Error('This visit is outside the 7-day edit window and needs approval.');
        }
        approvalRef = db.collection(EDIT_REQUEST_COLLECTION).doc(approvalId);
        const approvalDoc = await transaction.get(approvalRef);
        const approvalData = approvalDoc.exists ? approvalDoc.data() || {} : null;
        if (!approvalMatchesEdit(approvalData, patientId, visitType, visitId, user.uid)) {
          throw new Error('The supervised edit approval is invalid or has already been used.');
        }
        const reviewerDoc = await transaction.get(db.collection('users').doc(approvalData.reviewedBy));
        const reviewer = reviewerDoc.exists ? reviewerDoc.data() || {} : null;
        if (!reviewer || !isSupervisorRole(reviewer.role) ||
            (String(reviewer.role || '').toLowerCase() === 'tmo' &&
             (!reviewer.township || reviewer.township !== patient.township))) {
          throw new Error('The supervised edit approval is no longer valid.');
        }
      }

      transaction.set(visitRef, updateData, { merge: true });
      if (approvalRef) {
        transaction.update(approvalRef, {
          used: true,
          usedBy: user.uid,
          usedAt: nowServer(),
          status: 'used'
        });
      }
      return { usedApproval: !!approvalRef };
    });
  }

  async function requestVisitEdit(patient, visitType, visitId, visit, user, reason) {
    if (!patient || !patient.id || !user) throw new Error('Missing patient or user.');
    const db = firebase.firestore();
    const requestId = buildEditRequestId(patient.id, visitType, visitId, user.uid);

    await db.collection(EDIT_REQUEST_COLLECTION).doc(requestId).set({
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
      requestedAt: nowServer(),
      updatedAt: nowServer()
    }, { merge: true });
    return { id: requestId, alreadyPending: false };
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
    isSupervisorRole,
    approvalMatchesEdit,
    findUnusedApproval,
    authorizeVisitEdit,
    commitAuthorizedVisitEdit,
    requestVisitEdit,
    markApprovalUsed,
    buildEditRequestId
  };
})();
