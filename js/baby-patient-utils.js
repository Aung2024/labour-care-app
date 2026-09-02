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

  function normalizePersonName(name) {
    return String(name || '').toLowerCase().trim().replace(/\s+/g, ' ');
  }

  function babyBirthDateValue(patient) {
    if (!patient) return null;
    var raw = patient.date_of_birth || patient.birth_time || patient.birthTime || null;
    if (!raw) return null;
    var parsed = new Date(String(raw).split('T')[0]);
    return isNaN(parsed.getTime()) ? null : parsed;
  }

  /** Day of life starts at 1 on the birth calendar day (avoids "0 days"). */
  function formatBabyAgeFromDiffDays(diffDays, language) {
    var days = parseInt(diffDays, 10);
    if (isNaN(days) || days < 0) days = 0;
    var months = Math.floor(days / 30);
    var years = Math.floor(months / 12);
    var remainingMonths = months % 12;
    var dayOfLife = days + 1;
    var lang = language || 'en';
    if (lang === 'mm') {
      if (years > 0) return years + ' နှစ်' + (remainingMonths ? ' ' + remainingMonths + ' လ' : '');
      if (months > 0) return months + ' လ';
      return 'နေ့ ' + dayOfLife;
    }
    if (years > 0) return years + 'y' + (remainingMonths ? ' ' + remainingMonths + 'm' : '');
    if (months > 0) return months + 'm';
    return 'Day ' + dayOfLife;
  }

  function formatBabyAgeDisplay(patient, language) {
    var birthDate = babyBirthDateValue(patient);
    if (!birthDate) return '-';
    var now = new Date();
    var diffDays = Math.floor((now - birthDate) / (1000 * 60 * 60 * 24));
    return formatBabyAgeFromDiffDays(diffDays, language);
  }

  function formatBabyAgeFromBirthDate(birthDate, language) {
    if (!birthDate) return '-';
    var d = birthDate instanceof Date ? birthDate : new Date(birthDate);
    if (isNaN(d.getTime())) return '-';
    var dayOnly = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    var now = new Date();
    var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var diffDays = Math.floor((today - dayOnly) / (1000 * 60 * 60 * 24));
    return formatBabyAgeFromDiffDays(diffDays, language);
  }

  function motherCandidateScore(data) {
    data = data || {};
    var score = 0;
    if (data.age != null && data.age !== '') score += 10;
    if (!data.linked_from_baby_registration) score += 5;
    if (data.hasConsent === true || data.consentStatus === 'consented') score += 3;
    if (data.phone || data.phoneNumber) score += 1;
    return score;
  }

  async function fetchScopedMotherCandidates(db, options) {
    options = options || {};
    var queries = [];
    if (options.userRole === 'Midwife' && options.userId) {
      queries.push(db.collection('patients').where('created_by', '==', options.userId).limit(500));
    } else if (options.township) {
      queries.push(db.collection('patients').where('township', '==', options.township).limit(500));
    } else if (options.region) {
      queries.push(db.collection('patients').where('region', '==', options.region).limit(500));
    } else {
      queries.push(db.collection('patients').limit(500));
    }
    var seen = {};
    var patients = [];
    for (var i = 0; i < queries.length; i++) {
      try {
        var snap = await queries[i].get();
        snap.forEach(function (doc) {
          if (seen[doc.id]) return;
          seen[doc.id] = true;
          patients.push({ id: doc.id, data: doc.data() || {} });
        });
      } catch (e) {
        console.warn('Mother lookup query failed:', e);
      }
    }
    return patients;
  }

  async function findExistingMotherPatient(db, motherName, options) {
    if (!db || !motherName) return null;
    var normalizedTarget = normalizePersonName(motherName);
    if (!normalizedTarget) return null;
    var candidates = await fetchScopedMotherCandidates(db, options || {});
    var matches = candidates.filter(function (item) {
      if (isBabyPatient(item.data)) return false;
      return normalizePersonName(item.data.name || item.data.patientName) === normalizedTarget;
    });
    if (!matches.length) return null;
    matches.sort(function (a, b) {
      return motherCandidateScore(b.data) - motherCandidateScore(a.data);
    });
    var best = matches[0];
    return {
      id: best.id,
      data: best.data,
      serial: best.data.patient_unique_id || best.data.patientUniqueId || null
    };
  }

  function babyDisplayName(motherName, birthOrder, explicitName, totalBabies) {
    if (explicitName) return explicitName;
    motherName = String(motherName || '').replace(/^Baby\s+/i, '').trim();
    var base = motherName ? ('Baby ' + motherName) : 'Baby';
    var order = parseInt(birthOrder, 10) || 1;
    var total = parseInt(totalBabies, 10) || 1;
    if (total > 1 || order > 1) return base + ' ' + order;
    return base;
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

  function copyMotherScopeFields(mother) {
    mother = mother || {};
    var keys = [
      'township', 'region', 'region_short_code', 'tsp_code', 'tspCode',
      'facility_code', 'facilityCode', 'facility_name', 'facilityName',
      'facility_type', 'facilityType', 'department', 'village', 'address',
      'state', 'district'
    ];
    var out = {};
    keys.forEach(function (key) {
      if (mother[key] != null && mother[key] !== '') out[key] = mother[key];
    });
    return out;
  }

  function babyPayload(motherId, mother, baby, birthOrder, groupId, ancContext, userId, totalBabies) {
    mother = mother || {};
    baby = baby || {};
    var dob = dateFromBirthTime(baby.birthTime) || baby.date_of_birth || '';
    var years = ageInYears(dob);
    var careTeam = [];
    (mother.care_team_midwife_ids || []).forEach(function (id) {
      if (id && careTeam.indexOf(id) === -1) careTeam.push(id);
    });
    [userId, mother.created_by, mother.createdBy].forEach(function (id) {
      if (id && careTeam.indexOf(id) === -1) careTeam.push(id);
    });
    var createdBy = userId || mother.created_by || mother.createdBy || null;
    var payload = {
      patient_type: PATIENT_TYPE_BABY,
      name: babyDisplayName(mother.name || mother.patientName || '', birthOrder, baby.babyName || baby.baby_name, totalBabies),
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
      phone: firstOf(mother.phone, mother.phoneNumber) || null,
      phoneNumber: firstOf(mother.phoneNumber, mother.phone) || null,
      created_by: createdBy,
      createdBy: createdBy,
      care_team_midwife_ids: careTeam,
      status: 'registered',
      linked_from_delivery_notes: true,
      updated_at: nowServer(),
      updated_by: userId || null
    };
    Object.assign(payload, copyMotherScopeFields(mother));
    if (!payload.township && mother.township) payload.township = mother.township;
    if (!payload.region && mother.region) payload.region = mother.region;
    payload.tsp_code = firstOf(payload.tsp_code, mother.tsp_code, mother.tspCode) || null;
    payload.facility_code = firstOf(payload.facility_code, mother.facility_code, mother.facilityCode) || '003';
    return payload;
  }

  function babyDocId(motherId, birthOrder) {
    return String(motherId || '') + '_baby_' + (parseInt(birthOrder, 10) || 1);
  }

  function babyUniqueIdFromMother(mother, birthOrder) {
    mother = mother || {};
    var order = parseInt(birthOrder, 10) || 1;
    var motherSerial = String(firstOf(mother.patient_unique_id, mother.patientUniqueId) || '').trim();
    if (motherSerial) return motherSerial + '-B' + order;
    var tspCode = sanitizeCodeSegment(firstOf(mother.tsp_code, mother.tspCode), 'UNK');
    var fac = facilityCode(firstOf(mother.facility_code, mother.facilityCode));
    var yearSuffix = new Date().getFullYear().toString().slice(-2);
    return tspCode + '-' + fac + '-B' + yearSuffix + '-' + String(order).padStart(2, '0');
  }

  async function createOrUpdateBabiesFromDeliveryNotes(motherId, notes, userId, options) {
    options = options || {};
    if (!motherId || !global.firebase) throw new Error('Baby patient service unavailable');
    var db = firebase.firestore();
    var motherRef = db.collection('patients').doc(motherId);
    var mother = {};
    var motherSnap = await motherRef.get();
    if (motherSnap.exists) mother = Object.assign({ id: motherId }, motherSnap.data());
    if (options.motherData) {
      Object.keys(options.motherData).forEach(function (key) {
        if (mother[key] == null || mother[key] === '') mother[key] = options.motherData[key];
      });
    }
    if (!mother || (!motherSnap.exists && !options.motherData)) {
      throw new Error('Patient data required to create baby record');
    }
    if (isBabyPatient(mother)) throw new Error('Save delivery notes on the mother patient');

    var details = (notes && notes.deliveryDetails) || {};
    var rawBabies = Array.isArray(details.babies) ? details.babies : [];
    var babies = rawBabies.filter(function (baby) {
      var outcome = String(baby.outcome || 'alive').toLowerCase();
      return outcome !== 'stillbirth' && outcome !== 'still_birth';
    }).map(function (baby, index) {
      return global.DeliveryNotesUtils && DeliveryNotesUtils.normalizeBaby
        ? DeliveryNotesUtils.normalizeBaby(baby, index)
        : baby;
    });
    if (!babies.length) return [];

    var pregnancyType = String(details.pregnancyType || details.pregnancy_type || '').toLowerCase();
    var totalBabies = babies.length > 1 || pregnancyType === 'twins' ? Math.max(babies.length, 2) : 1;
    var groupId = birthGroupId(motherId, { deliveryDetails: { babies: babies } });
    var ancContext = await fetchLatestAncContext(db, motherId);
    var ids = [];
    var batch = db.batch();

    for (var i = 0; i < babies.length; i++) {
      var birthOrder = parseInt(babies[i].babyIndex, 10) || (i + 1);
      var babyId = babyDocId(motherId, birthOrder);
      var babyRef = db.collection('patients').doc(babyId);
      var existing = await babyRef.get();
      var payload = babyPayload(motherId, mother, babies[i], birthOrder, groupId, ancContext, userId, totalBabies);
      payload.patient_unique_id = babyUniqueIdFromMother(mother, birthOrder);
      if (existing.exists) {
        var existingData = existing.data() || {};
        if (existingData.created_by || existingData.createdBy) {
          delete payload.created_by;
          delete payload.createdBy;
        }
        if (userId && firebase.firestore.FieldValue) {
          payload.care_team_midwife_ids = firebase.firestore.FieldValue.arrayUnion(userId);
        }
      } else {
        payload.created_at = nowServer();
        payload.createdAt = nowServer();
      }
      batch.set(babyRef, payload, { merge: true });
      ids.push(babyId);
    }

    var motherUpdate = {
      patient_type: PATIENT_TYPE_MOTHER,
      baby_patient_ids: ids,
      updated_at: nowServer(),
      updated_by: userId || null
    };
    if (userId) {
      motherUpdate.care_team_midwife_ids = firebase.firestore.FieldValue.arrayUnion(userId);
    }
    batch.set(motherRef, motherUpdate, { merge: true });
    await batch.commit();
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
          var ids = await createOrUpdateBabiesFromDeliveryNotes(doc.id, notes, options.userId || null, {
            motherData: data
          });
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
    ageInYears: ageInYears,
    formatBabyAgeDisplay: formatBabyAgeDisplay,
    formatBabyAgeFromBirthDate: formatBabyAgeFromBirthDate,
    formatBabyAgeFromDiffDays: formatBabyAgeFromDiffDays,
    findExistingMotherPatient: findExistingMotherPatient,
    normalizePersonName: normalizePersonName
  };
})(typeof window !== 'undefined' ? window : this);
