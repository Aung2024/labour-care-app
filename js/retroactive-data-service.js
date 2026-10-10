/**
 * Owner-scoped loading and merge-only saves for retroactive data entry.
 * This module never deletes patients, visits, babies, or legacy fields.
 */
(function (root) {
  'use strict';

  var rules = root.RetroactiveDataRules;
  var PAGE_SIZE = 20;
  var MAX_ANC = 40;
  var MAX_TESTS = 20;
  var MAX_PNC = 8;
  var MAX_NEWBORN = 8;
  var MAX_IMMEDIATE = 4;

  function assertSafeData(data) {
    if (!data || typeof data !== 'object') return;
    Object.keys(data).forEach(function (key) {
      var value = data[key];
      if (value && typeof value === 'object' && (value._methodName === 'FieldValue.delete' || value._methodName === 'delete')) {
        throw new Error('Refusing to delete clinical data.');
      }
    });
  }

  async function readAll(ref, maxDocs) {
    var rows = [];
    var cursor = null;
    var truncated = false;
    while (rows.length < maxDocs) {
      var query = ref.limit(PAGE_SIZE);
      if (cursor) query = query.startAfter(cursor);
      var snap = await query.get();
      if (!snap.size) break;
      snap.forEach(function (doc) {
        if (rows.length < maxDocs) rows.push({ id: doc.id, data: doc.data() || {} });
      });
      if (snap.size < PAGE_SIZE) break;
      if (rows.length >= maxDocs) {
        truncated = true;
        break;
      }
      cursor = snap.docs[snap.docs.length - 1];
    }
    return { rows: rows, truncated: truncated };
  }

  async function listOwnedMothers(db, uid) {
    var map = new Map();
    var queries = [
      db.collection('patients').where('created_by', '==', uid),
      db.collection('patients').where('createdBy', '==', uid)
    ];
    for (var i = 0; i < queries.length; i++) {
      var snap = await queries[i].get();
      snap.forEach(function (doc) {
        var patient = Object.assign({ id: doc.id }, doc.data() || {});
        if (!rules.isOwnedMother(patient, uid)) return;
        map.set(doc.id, patient);
      });
    }
    return Array.from(map.values()).sort(function (a, b) {
      return String(a.name || '').localeCompare(String(b.name || ''));
    });
  }

  async function loadBundle(db, patient) {
    var ref = db.collection('patients').doc(patient.id);
    var truncated = false;
    var anc = await readAll(ref.collection('antenatal_visits'), MAX_ANC);
    var tests = await readAll(ref.collection('testRecords'), MAX_TESTS);
    var pnc = await readAll(ref.collection('postpartum_visits'), MAX_PNC);
    var newborn = await readAll(ref.collection('newborn_care'), MAX_NEWBORN);
    var immediate = await readAll(ref.collection('immediate_newborn_care'), MAX_IMMEDIATE);
    truncated = anc.truncated || tests.truncated || pnc.truncated || newborn.truncated || immediate.truncated;
    immediate.rows.forEach(function (row) { row.patientId = patient.id; });

    var babyIds = Array.isArray(patient.baby_patient_ids) ? patient.baby_patient_ids.slice(0, 3) : [];
    for (var i = 0; i < babyIds.length; i++) {
      var babyImmediate = await readAll(db.collection('patients').doc(babyIds[i]).collection('immediate_newborn_care'), MAX_IMMEDIATE);
      babyImmediate.rows.forEach(function (row) {
        row.patientId = babyIds[i];
        immediate.rows.push(row);
      });
    }

    var deliverySnap = await ref.collection('records').doc('deliveryNotes').get();
    var delivery = null;
    if (deliverySnap.exists) {
      delivery = { id: deliverySnap.id, data: deliverySnap.data() || {}, canonical: true };
    } else {
      var legacySnap = await ref.collection('records').doc('thirdStage').get();
      if (legacySnap.exists) delivery = { id: legacySnap.id, data: legacySnap.data() || {}, canonical: false };
    }

    return {
      patient: patient,
      ancVisits: anc.rows,
      testRecords: tests.rows,
      pncVisits: pnc.rows,
      newbornVisits: newborn.rows,
      immediateRecords: immediate.rows,
      delivery: delivery,
      truncated: truncated
    };
  }

  function auditEntry(user, patientId, audit) {
    return {
      userId: user.uid,
      userEmail: user.email || 'unknown',
      userRole: user.role || 'Midwife',
      action: 'retroactive_data_entry',
      resource: 'patient',
      resourceId: patientId,
      details: 'Retroactive back fill',
      metadata: {
        ruleVersion: rules.RULE_VERSION,
        recordPath: audit.recordPath,
        changes: audit.changes,
        reason: audit.reason || 'retroactive_backfill'
      },
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      clientIP: '',
      userAgent: (root.navigator && root.navigator.userAgent) || 'unknown',
      sessionId: 'retroactive',
      deviceInfo: {},
      unauthenticated: false
    };
  }

  function stamp(user, create) {
    var payload = {
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedBy: user.uid,
      retroactiveSource: rules.RULE_VERSION,
      retroactiveUpdatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    if (create) {
      payload.createdAt = firebase.firestore.FieldValue.serverTimestamp();
      payload.createdBy = user.uid;
      payload.recordedBy = user.uid;
    }
    return payload;
  }

  async function saveRequests(db, user, bundle, requests) {
    var fresh = await db.collection('patients').doc(bundle.patient.id).get();
    if (!fresh.exists) throw new Error('Patient record was not found.');
    var patient = Object.assign({ id: fresh.id }, fresh.data() || {});
    if (!rules.isOwnedMother(patient, user.uid)) {
      var error = new Error('Back Fill can update only patients you registered.');
      error.errors = [{ en: error.message, mm: 'သင်မှတ်ပုံတင်ထားသော လူနာများကိုသာ ပြန်ဖြည့်နိုင်သည်။' }];
      throw error;
    }
    bundle = Object.assign({}, bundle, { patient: patient });
    var plan = rules.planWrites(bundle, requests, { uid: user.uid, now: new Date().toISOString() });
    if (!plan.ok) {
      var planError = new Error(plan.errors[0] ? plan.errors[0].en : 'Back fill could not be saved.');
      planError.errors = plan.errors;
      throw planError;
    }

    for (var i = 0; i < plan.operations.length; i++) {
      var operation = plan.operations[i];
      assertSafeData(operation.data);
      if (operation.kind === 'delivery') {
        if (!root.DeliveryNotesUtils || !root.BabyPatientUtils) {
          throw new Error('Delivery Notes module is not loaded. Refresh and try again.');
        }
        await root.DeliveryNotesUtils.saveDeliveryNotes(patient.id, operation.notes, user.uid, {
          allowUpdate: operation.allowUpdate,
          approvalId: rules.RULE_VERSION,
          motherData: patient
        });
        await db.collection('patients').doc(patient.id).collection('records').doc('deliveryNotes').set({
          retroactiveSource: rules.RULE_VERSION,
          retroactiveUpdatedAt: firebase.firestore.FieldValue.serverTimestamp(),
          updatedBy: user.uid
        }, { merge: true });
        if (operation.audit && operation.audit.changes.length) {
          await db.collection('audit_logs').add(auditEntry(user, patient.id, operation.audit));
        }
        continue;
      }

      var payload = Object.assign({}, operation.data, stamp(user, operation.create));
      assertSafeData(operation.data);
      await db.runTransaction(async function (transaction) {
        transaction.set(db.doc(operation.path), payload, { merge: true });
        if (operation.audit && operation.audit.changes.length) {
          transaction.set(db.collection('audit_logs').doc(), auditEntry(user, patient.id, operation.audit));
        }
      });
    }

    if (root.AnalyticsRefreshQueue) {
      await root.AnalyticsRefreshQueue.requestSafely(patient.id, 'retroactive_backfill');
    }
    var reloaded = await loadBundle(db, patient);
    return { plan: plan, bundle: reloaded, inspection: rules.scanPatient(reloaded) };
  }

  root.RetroactiveDataService = {
    listOwnedMothers: listOwnedMothers,
    loadBundle: loadBundle,
    saveRequests: saveRequests
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
