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
  var MAX_BATCH_OPERATIONS = 200;

  function assertSafeData(data) {
    if (!data || typeof data !== 'object') return;
    Object.keys(data).forEach(function (key) {
      var value = data[key];
      if (value && typeof value === 'object' && (value._methodName === 'FieldValue.delete' || value._methodName === 'delete')) {
        throw new Error('Refusing to delete clinical data.');
      }
    });
  }

  // One query per subcollection; the extra document only detects truncation.
  async function readAll(ref, maxDocs) {
    var snap = await ref.limit(maxDocs + 1).get();
    var rows = [];
    snap.forEach(function (doc) {
      if (rows.length < maxDocs) rows.push({ id: doc.id, data: doc.data() || {} });
    });
    return { rows: rows, truncated: snap.size > maxDocs };
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

  async function listOwnedMothersPage(db, uid, cursors, pageSize) {
    var limit = Math.max(1, parseInt(pageSize, 10) || PAGE_SIZE);
    var definitions = [
      { key: 'created_by', query: db.collection('patients').where('created_by', '==', uid) },
      { key: 'createdBy', query: db.collection('patients').where('createdBy', '==', uid) }
    ];
    var map = new Map();
    var nextCursors = {};
    var hasMore = false;
    for (var i = 0; i < definitions.length; i++) {
      var definition = definitions[i];
      if (cursors && cursors[definition.key] === false) continue;
      var query = definition.query;
      if (cursors && cursors[definition.key]) query = query.startAfter(cursors[definition.key]);
      var snap = await query.limit(limit).get();
      snap.forEach(function (doc) {
        var patient = Object.assign({ id: doc.id }, doc.data() || {});
        if (rules.isOwnedMother(patient, uid)) map.set(doc.id, patient);
      });
      if (snap.size === limit) {
        hasMore = true;
        nextCursors[definition.key] = snap.docs[snap.docs.length - 1];
      } else nextCursors[definition.key] = false;
    }
    return {
      mothers: Array.from(map.values()).sort(function (a, b) {
        return String(a.name || '').localeCompare(String(b.name || ''));
      }),
      cursors: nextCursors,
      hasMore: hasMore
    };
  }

  async function loadBundle(db, patient) {
    var ref = db.collection('patients').doc(patient.id);
    var babyIds = Array.isArray(patient.baby_patient_ids) ? patient.baby_patient_ids.slice(0, 3) : [];
    var results = await Promise.all([
      readAll(ref.collection('antenatal_visits'), MAX_ANC),
      readAll(ref.collection('testRecords'), MAX_TESTS),
      readAll(ref.collection('postpartum_visits'), MAX_PNC),
      readAll(ref.collection('newborn_care'), MAX_NEWBORN),
      readAll(ref.collection('immediate_newborn_care'), MAX_IMMEDIATE),
      ref.collection('records').doc('deliveryNotes').get(),
      Promise.all(babyIds.map(function (babyId) {
        return readAll(db.collection('patients').doc(babyId).collection('immediate_newborn_care'), MAX_IMMEDIATE);
      }))
    ]);
    var anc = results[0];
    var tests = results[1];
    var pnc = results[2];
    var newborn = results[3];
    var immediate = results[4];
    var deliverySnap = results[5];
    var babyImmediate = results[6];
    var truncated = anc.truncated || tests.truncated || pnc.truncated || newborn.truncated || immediate.truncated;
    immediate.rows.forEach(function (row) { row.patientId = patient.id; });
    babyImmediate.forEach(function (babyResult, index) {
      babyResult.rows.forEach(function (row) {
        row.patientId = babyIds[index];
        immediate.rows.push(row);
      });
    });

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

  async function markBackfillComplete(db, patientId, user, patient) {
    if (rules.hasPermanentBackfillCompletion(patient)) return;
    await db.collection('patients').doc(patientId).set({
      retroactiveBackfill: {
        status: 'completed',
        completedAt: firebase.firestore.FieldValue.serverTimestamp(),
        completedBy: user.uid,
        ruleVersion: rules.RULE_VERSION
      }
    }, { merge: true });
  }

  async function markCompletedIfComplete(db, user, bundle, inspection) {
    if (!bundle || !bundle.patient || !inspection || inspection.gapCount || bundle.truncated) {
      return false;
    }
    var fresh = await db.collection('patients').doc(bundle.patient.id).get();
    if (!fresh.exists) throw new Error('Patient record was not found.');
    var patient = Object.assign({ id: fresh.id }, fresh.data() || {});
    if (!rules.isOwnedMother(patient, user.uid)) {
      throw new Error('Back Fill can update only patients you registered.');
    }
    if (rules.hasPermanentBackfillCompletion(patient)) return true;
    await markBackfillComplete(db, patient.id, user, patient);
    return true;
  }

  async function saveRequests(db, user, bundle, requests, options) {
    options = options || {};
    var fresh = await db.collection('patients').doc(bundle.patient.id).get();
    if (!fresh.exists) throw new Error('Patient record was not found.');
    var patient = Object.assign({ id: fresh.id }, fresh.data() || {});
    if (!rules.isOwnedMother(patient, user.uid)) {
      var error = new Error('Back Fill can update only patients you registered.');
      error.errors = [{ en: error.message, mm: 'သင်မှတ်ပုံတင်ထားသော လူနာများကိုသာ ပြန်ဖြည့်နိုင်သည်။' }];
      throw error;
    }
    if (rules.isArchivedPatient(patient)) {
      throw new Error('Archived patients are not available for Back Fill.');
    }
    bundle = Object.assign({}, bundle, { patient: patient });
    var preflight = options.requireComplete === false
      ? { ok: false, plan: rules.planWrites(bundle, requests, { uid: user.uid, now: new Date().toISOString() }), inspection: null }
      : rules.preflightWrites(bundle, requests, { uid: user.uid, now: new Date().toISOString() });
    if (options.requireComplete === false) preflight.ok = preflight.plan.ok;
    var plan = preflight.plan;
    if (!preflight.ok) {
      var planError = new Error(plan.errors[0] ? plan.errors[0].en : 'Complete all required fields before saving.');
      planError.errors = plan.errors;
      planError.inspection = preflight.inspection;
      throw planError;
    }
    if (options.markComplete && bundle.truncated) {
      throw new Error('This patient has more records than the current inspection loaded. Reload the patient before marking Back Fill complete.');
    }

    var mergeOperations = plan.operations.filter(function (operation) { return operation.kind !== 'delivery'; });
    var deliveryOperations = plan.operations.filter(function (operation) { return operation.kind === 'delivery'; });
    plan.operations.forEach(function (operation) { assertSafeData(operation.data || operation.notes); });
    if (deliveryOperations.length && (!root.DeliveryNotesUtils || !root.BabyPatientUtils)) {
      throw new Error('Delivery Notes module is not loaded. Refresh and try again.');
    }

    var completedOperations = 0;
    var affectedBabyIds = [];
    try {
      // Every Firestore batch is capped at 500 writes; each merge adds at most one audit write.
      for (var start = 0; start < mergeOperations.length; start += MAX_BATCH_OPERATIONS) {
        var chunk = mergeOperations.slice(start, start + MAX_BATCH_OPERATIONS);
        var batch = db.batch();
        chunk.forEach(function (operation) {
          batch.set(db.doc(operation.path), Object.assign({}, operation.data, stamp(user, operation.create)), { merge: true });
          if (operation.audit && operation.audit.changes.length) {
            batch.set(db.collection('audit_logs').doc(), auditEntry(user, patient.id, operation.audit));
          }
        });
        await batch.commit();
        completedOperations += chunk.length;
      }

      for (var i = 0; i < deliveryOperations.length; i++) {
        var operation = deliveryOperations[i];
        var deliveryResult = await root.DeliveryNotesUtils.saveDeliveryNotes(patient.id, operation.notes, user.uid, {
          allowUpdate: operation.allowUpdate,
          approvalId: rules.RULE_VERSION,
          motherData: patient,
          extraFields: {
            retroactiveSource: rules.RULE_VERSION,
            retroactiveUpdatedAt: firebase.firestore.FieldValue.serverTimestamp()
          }
        });
        if (deliveryResult && Array.isArray(deliveryResult.babyIds)) {
          affectedBabyIds = affectedBabyIds.concat(deliveryResult.babyIds);
        }
        if (operation.audit && operation.audit.changes.length) {
          await db.collection('audit_logs').add(auditEntry(user, patient.id, operation.audit));
        }
        completedOperations += 1;
      }
    } catch (writeError) {
      writeError.partialFailure = completedOperations > 0;
      writeError.completedOperations = completedOperations;
      writeError.totalOperations = plan.operations.length;
      writeError.errors = [{
        en: completedOperations
          ? 'Some changes were saved, but the rest failed. Reload this patient before trying again.'
          : (writeError.message || 'Back fill could not be saved.'),
        mm: completedOperations
          ? 'ပြောင်းလဲချက်အချို့ သိမ်းပြီး ကျန်အချက်များ မအောင်မြင်ပါ။ ထပ်မလုပ်မီ လူနာကို ပြန်ဖွင့်ပါ။'
          : 'ပြန်ဖြည့်၍ မရပါ။'
      }];
      throw writeError;
    }

    if (!plan.operations.length) {
      var unchangedInspection = rules.scanPatient(bundle);
      if (options.markComplete && !unchangedInspection.gapCount && !bundle.truncated) {
        await markBackfillComplete(db, patient.id, user, patient);
      }
      return { plan: plan, bundle: bundle, inspection: unchangedInspection };
    }
    if (root.AnalyticsRefreshQueue) {
      await root.AnalyticsRefreshQueue.requestSafely(patient.id, 'retroactive_backfill');
      await Promise.all(Array.from(new Set(affectedBabyIds)).map(function (babyId) {
        return root.AnalyticsRefreshQueue.requestSafely(babyId, 'retroactive_backfill_baby');
      }));
    }
    // Delivery Notes also create babies and sync mother fields, so only that path needs a server re-read.
    if (deliveryOperations.length) {
      var refreshed = await db.collection('patients').doc(patient.id).get();
      var refreshedPatient = refreshed.exists ? Object.assign({ id: refreshed.id }, refreshed.data() || {}) : patient;
      var reloaded = await loadBundle(db, refreshedPatient);
      var deliveryInspection = rules.scanPatient(reloaded);
      if (options.markComplete && !deliveryInspection.gapCount && !reloaded.truncated) {
        await markBackfillComplete(db, patient.id, user, refreshedPatient);
      }
      return { plan: plan, bundle: reloaded, inspection: deliveryInspection };
    }
    var patched = Object.assign({}, bundle, {
      patient: Object.assign({}, patient),
      ancVisits: cloneRows(bundle.ancVisits),
      testRecords: cloneRows(bundle.testRecords),
      pncVisits: cloneRows(bundle.pncVisits),
      newbornVisits: cloneRows(bundle.newbornVisits),
      immediateRecords: cloneRows(bundle.immediateRecords)
    });
    plan.operations.forEach(function (operation) { rules.applyPlannedOperation(patched, operation); });
    var patchedInspection = rules.scanPatient(patched);
    if (options.markComplete && !patchedInspection.gapCount && !patched.truncated) {
      await markBackfillComplete(db, patient.id, user, patient);
    }
    return { plan: plan, bundle: patched, inspection: patchedInspection };
  }

  function cloneRows(rows) {
    return (rows || []).map(function (row) {
      return Object.assign({}, row, { data: Object.assign({}, row.data || {}) });
    });
  }

  root.RetroactiveDataService = {
    listOwnedMothers: listOwnedMothers,
    listOwnedMothersPage: listOwnedMothersPage,
    loadBundle: loadBundle,
    markCompletedIfComplete: markCompletedIfComplete,
    saveRequests: saveRequests
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
