(function (global) {
  'use strict';

  var PATIENT_TYPE_MOTHER = 'mother';
  var PATIENT_TYPE_BABY = 'baby';

  function nowServer() {
    return global.firebase && firebase.firestore
      ? firebase.firestore.FieldValue.serverTimestamp()
      : new Date().toISOString();
  }

  function firstOf() {
    for (var i = 0; i < arguments.length; i++) {
      if (arguments[i] !== undefined && arguments[i] !== null && arguments[i] !== '') return arguments[i];
    }
    return '';
  }

  function normalizePatientType(value) {
    var v = String(value || '').toLowerCase();
    if (v === 'baby' || v === 'child' || v === 'newborn') return PATIENT_TYPE_BABY;
    return PATIENT_TYPE_MOTHER;
  }

  function isBabyPatient(patient) {
    return normalizePatientType(patient && patient.patient_type) === PATIENT_TYPE_BABY;
  }

  function isMotherPatient(patient) {
    return !isBabyPatient(patient);
  }

  function dateFromBirthTime(value) {
    if (!value) return '';
    return String(value).split('T')[0] || '';
  }

  function ageInYears(dateOfBirth) {
    if (!dateOfBirth) return null;
    var d = new Date(String(dateOfBirth).split('T')[0]);
    if (isNaN(d.getTime())) return null;
    var today = new Date();
    var years = today.getFullYear() - d.getFullYear();
    var beforeBirthday = today.getMonth() < d.getMonth() ||
      (today.getMonth() === d.getMonth() && today.getDate() < d.getDate());
    return beforeBirthday ? years - 1 : years;
  }

  function babyDisplayName(motherName, birthOrder, explicitName) {
    if (explicitName) return explicitName;
    var base = motherName ? ('Baby ' + motherName) : 'Baby';
    return birthOrder ? (base + ' ' + birthOrder) : base;
  }

  function sanitizeCodeSegment(value, fallback) {
    var raw = String(value || fallback || '').trim().toUpperCase();
    var cleaned = raw.replace(/[^A-Z0-9-]/g, '');
    return cleaned || fallback || 'UNK';
  }

  function facilityCode(value) {
    var code = String(value || '003').trim().padStart(3, '0').substring(0, 3);
    return /^\d{3}$/.test(code) ? code : '003';
  }

  async function generateBabyPatientUniqueId(db, source) {
    source = source || {};
    var tspCode = sanitizeCodeSegment(firstOf(source.tsp_code, source.tspCode), 'UNK');
    var fac = facilityCode(firstOf(source.facility_code, source.facilityCode));
    var yearSuffix = new Date().getFullYear().toString().slice(-2);
    var counterId = tspCode.replace(/[^A-Za-z0-9]/g, '') + '_' + fac + '_B_' + yearSuffix;
    var counterRef = db.collection('patient_counters').doc(counterId);
    var nextSerial = await db.runTransaction(async function (tx) {
      var snap = await tx.get(counterRef);
      var current = 0;
      if (snap.exists && typeof snap.data().lastSerial === 'number') current = snap.data().lastSerial;
      var next = current + 1;
      tx.set(counterRef, {
        lastSerial: next,
        updatedAt: nowServer(),
        patientType: PATIENT_TYPE_BABY
      }, { merge: true });
      return next;
    });
    return tspCode + '-' + fac + '-B' + yearSuffix + String(nextSerial).padStart(4, '0');
  }

  async function fetchLatestAncContext(db, motherId) {
    try {
      var ref = db.collection('patients').doc(motherId).collection('antenatal_visits');
      var snap;
      try { snap = await ref.orderBy('visitDate', 'desc').limit(1).get(); }
      catch (e) {
        try { snap = await ref.orderBy('timestamp', 'desc').limit(1).get(); }
        catch (e2) { snap = await ref.limit(1).get(); }
      }
      if (!snap || snap.empty) return {};
      var data = snap.docs[0].data() || {};
      return {
        maternal_edd: firstOf(data.edd, data.manualEdd, data.manual_edd),
        gestational_age_at_birth: firstOf(data.gestational_age, data.gestationalAge),
        maternal_edd_source: 'antenatal_visits'
      };
    } catch (e) {
      return {};
    }
  }

  function birthGroupId(motherId, notes) {
    var details = notes && notes.deliveryDetails ? notes.deliveryDetails : {};
    var babies = details.babies || [];
    var firstBirth = babies[0] && babies[0].birthTime ? dateFromBirthTime(babies[0].birthTime) : '';
    return firstOf(notes && notes.birth_group_id, details.birthGroupId, motherId + '_delivery_' + (firstBirth || 'unknown'));
  }

  function babyPayload(motherId, mother, baby, birthOrder, groupId, ancContext, userId) {
    mother = mother || {};
    baby = baby || {};
    var dob = dateFromBirthTime(baby.birthTime) || baby.date_of_birth || '';
    var years = ageInYears(dob);
    return {
      patient_type: PATIENT_TYPE_BABY,
      name: babyDisplayName(mother.name || mother.patientName || '', birthOrder, baby.babyName || baby.baby_name),
      mother_patient_id: motherId,
      mother_name: mother.name || mother.patientName || null,
      birth_order: birthOrder,
      birth_group_id: groupId,
      date_of_birth: dob || null,
      birth_time: baby.birthTime || baby.birth_time || null,
      age: years != null ? years : 0,
      sex: baby.gender || baby.sex || null,
      gender: baby.gender || baby.sex || null,
      birth_weight_gram: baby.birthWeightGram != null ? baby.birthWeightGram : (baby.birth_weight_gram || null),
      birth_outcome: baby.outcome || null,
      maternal_edd: firstOf(ancContext.maternal_edd, mother.edd, mother.manualEdd, mother.manual_edd) || null,
      gestational_age_at_birth: firstOf(ancContext.gestational_age_at_birth, mother.gestational_age, mother.gestationalAge) || null,
      maternal_edd_source: ancContext.maternal_edd_source || (mother.edd ? 'mother_patient' : null),
      township: mother.township || null,
      region: mother.region || null,
      region_short_code: mother.region_short_code || null,
      tsp_code: mother.tsp_code || null,
      facility_code: mother.facility_code || mother.facilityCode || '003',
      created_by: mother.created_by || mother.createdBy || userId || null,
      createdBy: mother.created_by || mother.createdBy || userId || null,
      care_team_midwife_ids: mother.care_team_midwife_ids || [mother.created_by || mother.createdBy || userId].filter(Boolean),
      status: 'registered',
      linked_from_delivery_notes: true,
      updated_at: nowServer(),
      updated_by: userId || null
    };
  }

  async function findExistingBaby(db, motherId, groupId, birthOrder) {
    var snap = await db.collection('patients')
      .where('mother_patient_id', '==', motherId)
      .limit(20)
      .get();
    var found = null;
    snap.forEach(function (doc) {
      if (found) return;
      var d = doc.data() || {};
      if (String(d.birth_group_id || '') === String(groupId || '') &&
          (parseInt(d.birth_order, 10) || 1) === birthOrder) {
        found = { id: doc.id, data: d };
      }
    });
    return found;
  }

  async function createOrUpdateBabiesFromDeliveryNotes(motherId, notes, userId) {
    if (!motherId || !global.firebase) return [];
    var db = firebase.firestore();
    var motherRef = db.collection('patients').doc(motherId);
    var motherSnap = await motherRef.get();
    if (!motherSnap.exists) return [];
    var mother = motherSnap.data() || {};
    var normalized = global.DeliveryNotesUtils && DeliveryNotesUtils.normalizeDeliveryNotes
      ? DeliveryNotesUtils.normalizeDeliveryNotes(notes)
      : (notes || {});
    var babies = ((normalized.deliveryDetails || {}).babies || []).filter(function (baby) {
      return String(baby.outcome || '').toLowerCase() !== 'stillbirth';
    });
    if (!babies.length) return [];
    var groupId = birthGroupId(motherId, normalized);
    var ancContext = await fetchLatestAncContext(db, motherId);
    var ids = [];
    for (var i = 0; i < babies.length; i++) {
      var birthOrder = parseInt(babies[i].babyIndex, 10) || (i + 1);
      var existing = await findExistingBaby(db, motherId, groupId, birthOrder);
      var payload = babyPayload(motherId, mother, babies[i], birthOrder, groupId, ancContext, userId);
      var babyRef;
      if (existing) {
        babyRef = db.collection('patients').doc(existing.id);
        await babyRef.set(payload, { merge: true });
      } else {
        babyRef = db.collection('patients').doc();
        payload.patient_unique_id = await generateBabyPatientUniqueId(db, payload);
        payload.created_at = nowServer();
        await babyRef.set(payload, { merge: true });
      }
      ids.push(babyRef.id);
      babies[i].babyPatientId = babyRef.id;
      babies[i].baby_patient_id = babyRef.id;
    }
    await motherRef.set({
      patient_type: PATIENT_TYPE_MOTHER,
      baby_patient_ids: firebase.firestore.FieldValue.arrayUnion.apply(firebase.firestore.FieldValue, ids),
      updated_at: nowServer()
    }, { merge: true });
    return ids;
  }

  function clonePlain(data) {
    var out = {};
    Object.keys(data || {}).forEach(function (key) { out[key] = data[key]; });
    return out;
  }

  function babySpecificVisitPayload(data, birthOrder, babyPatientId, motherId) {
    var copy = clonePlain(data);
    var baby = null;
    if (Array.isArray(data.babies)) {
      baby = data.babies.find(function (item, index) {
        return (parseInt(item.babyIndex || item.baby_index, 10) || (index + 1)) === birthOrder;
      });
    }
    if (baby) {
      copy.baby_name = baby.babyName || baby.baby_name || copy.baby_name;
      copy.gender = baby.gender || baby.sex || copy.gender;
      copy.birth_time = baby.birthTime || baby.birth_time || copy.birth_time;
      copy.body_weight_gram = baby.birthWeightGram != null ? baby.birthWeightGram : (baby.birth_weight_gram != null ? baby.birth_weight_gram : copy.body_weight_gram);
      copy.outcome = baby.outcome || copy.outcome;
    }
    if (Array.isArray(data.kmc_babies)) {
      copy.kmc_babies = data.kmc_babies.filter(function (item, index) {
        return (parseInt(item.babyIndex || item.baby_index, 10) || (index + 1)) === birthOrder;
      });
      var kmc = copy.kmc_babies[0];
      if (kmc) {
        copy.kmc_selected = kmc.kmc_selected || copy.kmc_selected;
        copy.discharge_date = kmc.discharge_date || copy.discharge_date;
        copy.kmc_eligible_reasons = kmc.kmc_eligible_reasons || copy.kmc_eligible_reasons;
      }
    }
    copy.patientId = babyPatientId;
    copy.baby_patient_id = babyPatientId;
    copy.legacy_mother_patient_id = motherId;
    copy.migrated_from_mother_subcollection = true;
    return copy;
  }

  async function copyLegacyBabyCareToBabyPatients(motherId, babyPatientIds) {
    if (!motherId || !Array.isArray(babyPatientIds) || !babyPatientIds.length || !global.firebase) return { newborn: 0, vaccinations: 0, kmcActions: 0 };
    var db = firebase.firestore();
    var result = { newborn: 0, vaccinations: 0, kmcActions: 0 };
    var motherRef = db.collection('patients').doc(motherId);

    var newbornSnap = await motherRef.collection('newborn_care').get();
    for (var n = 0; n < newbornSnap.docs.length; n++) {
      var doc = newbornSnap.docs[n];
      var data = doc.data() || {};
      for (var i = 0; i < babyPatientIds.length; i++) {
        var birthOrder = i + 1;
        if (Array.isArray(data.babies) && !data.babies.some(function (item, index) {
          return (parseInt(item.babyIndex || item.baby_index, 10) || (index + 1)) === birthOrder;
        })) continue;
        await db.collection('patients').doc(babyPatientIds[i]).collection('newborn_care').doc(doc.id)
          .set(babySpecificVisitPayload(data, birthOrder, babyPatientIds[i], motherId), { merge: true });
        result.newborn += 1;
      }
    }

    var vaccineSnap = await motherRef.collection('vaccinations').get();
    if (babyPatientIds.length === 1) {
      for (var v = 0; v < vaccineSnap.docs.length; v++) {
        var vdoc = vaccineSnap.docs[v];
        var vdata = clonePlain(vdoc.data() || {});
        vdata.legacy_mother_patient_id = motherId;
        vdata.migrated_from_mother_subcollection = true;
        await db.collection('patients').doc(babyPatientIds[0]).collection('vaccinations').doc(vdoc.id).set(vdata, { merge: true });
        result.vaccinations += 1;
      }
    }

    var actionSnap = await motherRef.collection('kmc_actions').get();
    for (var a = 0; a < actionSnap.docs.length; a++) {
      var adoc = actionSnap.docs[a];
      var action = adoc.data() || {};
      var actionBabyIndex = parseInt(action.babyIndex || action.baby_index, 10) || 1;
      var targetId = babyPatientIds[actionBabyIndex - 1];
      if (!targetId) continue;
      var actionCopy = clonePlain(action);
      actionCopy.baby_patient_id = targetId;
      actionCopy.legacy_mother_patient_id = motherId;
      actionCopy.migrated_from_mother_subcollection = true;
      await db.collection('patients').doc(targetId).collection('kmc_actions').doc(adoc.id).set(actionCopy, { merge: true });
      result.kmcActions += 1;
    }
    return result;
  }

  async function backfillExistingBabyPatients(options) {
    options = options || {};
    if (!global.firebase) throw new Error('Firebase is required');
    var db = firebase.firestore();
    var limit = parseInt(options.limit, 10) || 50;
    var dryRun = options.dryRun !== false;
    var snap = await db.collection('patients').limit(limit).get();
    var results = { scanned: 0, eligibleMothers: 0, createdOrUpdatedBabies: 0, dryRun: dryRun, errors: [] };
    for (var i = 0; i < snap.docs.length; i++) {
      var doc = snap.docs[i];
      var data = doc.data() || {};
      if (isBabyPatient(data)) continue;
      results.scanned += 1;
      try {
        var notes = null;
        if (global.DeliveryNotesUtils && DeliveryNotesUtils.fetchDeliveryNotes) {
          notes = await DeliveryNotesUtils.fetchDeliveryNotes(doc.id);
        }
        if (!notes) {
          var nc = await doc.ref.collection('newborn_care').where('visit_number', '==', 1).limit(1).get();
          if (!nc.empty && global.DeliveryNotesUtils && DeliveryNotesUtils.deliveryNotesFromNewborn) {
            notes = DeliveryNotesUtils.deliveryNotesFromNewborn(nc.docs[0].data() || {});
          }
        }
        if (!notes) continue;
        results.eligibleMothers += 1;
        if (!dryRun) {
          var ids = await createOrUpdateBabiesFromDeliveryNotes(doc.id, notes, options.userId || null);
          results.createdOrUpdatedBabies += ids.length;
          var copied = await copyLegacyBabyCareToBabyPatients(doc.id, ids);
          results.copiedNewbornCare = (results.copiedNewbornCare || 0) + copied.newborn;
          results.copiedVaccinations = (results.copiedVaccinations || 0) + copied.vaccinations;
          results.copiedKmcActions = (results.copiedKmcActions || 0) + copied.kmcActions;
        }
      } catch (e) {
        results.errors.push({ patientId: doc.id, message: e.message || String(e) });
      }
    }
    return results;
  }

  global.BabyPatientUtils = {
    PATIENT_TYPE_MOTHER: PATIENT_TYPE_MOTHER,
    PATIENT_TYPE_BABY: PATIENT_TYPE_BABY,
    normalizePatientType: normalizePatientType,
    isBabyPatient: isBabyPatient,
    isMotherPatient: isMotherPatient,
    babyDisplayName: babyDisplayName,
    generateBabyPatientUniqueId: generateBabyPatientUniqueId,
    createOrUpdateBabiesFromDeliveryNotes: createOrUpdateBabiesFromDeliveryNotes,
    copyLegacyBabyCareToBabyPatients: copyLegacyBabyCareToBabyPatients,
    backfillExistingBabyPatients: backfillExistingBabyPatients,
    dateFromBirthTime: dateFromBirthTime,
    ageInYears: ageInYears
  };
})(typeof window !== 'undefined' ? window : this);
