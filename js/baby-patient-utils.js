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

  function formatBabyAgeDisplay(patient, language) {
    var birthDate = babyBirthDateValue(patient);
    if (!birthDate) return '-';
    var now = new Date();
    var diffDays = Math.floor((now - birthDate) / (1000 * 60 * 60 * 24));
    var months = Math.floor(diffDays / 30);
    var years = Math.floor(months / 12);
    var remainingMonths = months % 12;
    var lang = language || 'en';
    if (lang === 'mm') {
      if (years > 0) return years + ' နှစ်' + (remainingMonths ? ' ' + remainingMonths + ' လ' : '');
      if (months > 0) return months + ' လ';
      return Math.max(0, diffDays) + ' ရက်';
    }
    if (years > 0) return years + 'y' + (remainingMonths ? ' ' + remainingMonths + 'm' : '');
    if (months > 0) return months + 'm';
    return Math.max(0, diffDays) + 'd';
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

  function babyDisplayName(motherName, birthOrder, explicitName, babyCount) {
    if (explicitName) return explicitName;
    motherName = String(motherName || '').replace(/^Baby\s+/i, '').trim();
    var base = motherName ? ('Baby ' + motherName) : 'Baby';
    var total = parseInt(babyCount, 10) || 1;
    var order = parseInt(birthOrder, 10) || 1;
    return total > 1 ? (base + ' ' + order) : base;
  }

  function uniqueIds(ids) {
    var seen = {};
    var out = [];
    (ids || []).forEach(function (id) {
      if (!id || seen[id]) return;
      seen[id] = true;
      out.push(id);
    });
    return out;
  }

  function buildCareTeamIds(mother, userId) {
    return uniqueIds([].concat(
      mother && mother.care_team_midwife_ids ? mother.care_team_midwife_ids : [],
      mother && (mother.created_by || mother.createdBy) ? [mother.created_by || mother.createdBy] : [],
      userId ? [userId] : []
    ).filter(Boolean));
  }

  async function resolveMotherPatientId(db, patientId) {
    if (!patientId || !db) return patientId;
    try {
      var snap = await db.collection('patients').doc(patientId).get();
      if (!snap.exists) return patientId;
      var data = snap.data() || {};
      if (isBabyPatient(data) && data.mother_patient_id) return data.mother_patient_id;
      return patientId;
    } catch (e) {
      console.warn('resolveMotherPatientId failed:', e);
      return patientId;
    }
  }

  async function ensureCareTeamMidwife(db, patientId, userId) {
    if (!patientId || !userId || !db || !global.firebase) return false;
    try {
      await db.collection('patients').doc(patientId).set({
        care_team_midwife_ids: firebase.firestore.FieldValue.arrayUnion(userId),
        updated_at: nowServer(),
        updated_by: userId
      }, { merge: true });
      return true;
    } catch (e) {
      console.warn('ensureCareTeamMidwife failed:', e);
      return false;
    }
  }

  function isRateLimitError(error) {
    var code = error && error.code ? String(error.code) : '';
    var message = error && error.message ? String(error.message) : String(error || '');
    return code === 'resource-exhausted' ||
      /429/.test(message) ||
      /too many requests/i.test(message) ||
      /quota exceeded/i.test(message);
  }

  function formatBabyLinkError(message) {
    if (isRateLimitError({ message: message })) {
      return 'Server was busy (too many requests). Delivery notes are saved — wait a few seconds and tap Save again to link the baby record.';
    }
    return 'Baby record(s) saved, but linking to the mother chart failed. Please save again or contact support.';
  }

  function delay(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  async function retryFirestoreOp(fn, maxAttempts) {
    maxAttempts = maxAttempts || 5;
    var lastError = null;
    for (var attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (e) {
        lastError = e;
        if (!isRateLimitError(e) || attempt >= maxAttempts - 1) throw e;
        await delay(Math.min(8000, 400 * Math.pow(2, attempt)));
      }
    }
    throw lastError;
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
    var persisted = firstOf(notes && notes.birth_group_id, notes && notes.deliveryDetails && notes.deliveryDetails.birthGroupId);
    if (persisted) return persisted;
    var details = notes && notes.deliveryDetails ? notes.deliveryDetails : {};
    var babies = details.babies || [];
    var firstBirth = babies[0] && babies[0].birthTime ? dateFromBirthTime(babies[0].birthTime) : '';
    if (firstBirth) return motherId + '_delivery_' + firstBirth;
    return motherId + '_delivery';
  }

  function ensureBirthGroupId(motherId, notes, existingNotes) {
    return firstOf(
      existingNotes && existingNotes.birth_group_id,
      notes && notes.birth_group_id,
      birthGroupId(motherId, notes)
    );
  }

  function babyPayload(motherId, mother, baby, birthOrder, groupId, ancContext, userId, babyCount) {
    mother = mother || {};
    baby = baby || {};
    var dob = dateFromBirthTime(baby.birthTime) || baby.date_of_birth || '';
    var years = ageInYears(dob);
    return {
      patient_type: PATIENT_TYPE_BABY,
      name: babyDisplayName(mother.name || mother.patientName || '', birthOrder, baby.babyName || baby.baby_name, babyCount),
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
      township: mother.township || null,
      region: mother.region || null,
      region_short_code: mother.region_short_code || null,
      tsp_code: mother.tsp_code || null,
      facility_code: mother.facility_code || mother.facilityCode || '003',
      created_by: userId || mother.created_by || mother.createdBy || null,
      createdBy: userId || mother.created_by || mother.createdBy || null,
      care_team_midwife_ids: buildCareTeamIds(mother, userId),
      status: 'registered',
      linked_from_delivery_notes: true,
      updated_at: nowServer(),
      updated_by: userId || null
    };
  }

  function babyMatchesOrder(data, birthOrder) {
    return (parseInt(data.birth_order, 10) || 1) === birthOrder;
  }

  function babyCandidateScore(item) {
    var d = (item && item.data) || {};
    var score = 0;
    if (d.linked_from_delivery_notes) score += 20;
    if (d.patient_unique_id) score += 5;
    if (d.birth_time || d.date_of_birth) score += 3;
    if (d.created_at && d.created_at.toDate) score -= d.created_at.toDate().getTime() / 1e14;
    else if (d.created_at && d.created_at.seconds) score -= d.created_at.seconds / 1e10;
    return score;
  }

  async function fetchMotherBabyPatients(db, motherId) {
    var snap = await db.collection('patients')
      .where('mother_patient_id', '==', motherId)
      .get();
    var babies = [];
    snap.forEach(function (doc) {
      var data = doc.data() || {};
      if (!isBabyPatient(data)) return;
      babies.push({ id: doc.id, data: data, ref: doc.ref });
    });
    return babies;
  }

  async function findExistingBabyFast(db, motherId, groupId, birthOrder) {
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

  async function countPatientSubcollections(db, patientId) {
    var total = 0;
    var names = ['newborn_care', 'vaccinations', 'kmc_actions', 'postpartum_visits'];
    for (var i = 0; i < names.length; i++) {
      try {
        var snap = await db.collection('patients').doc(patientId).collection(names[i]).limit(1).get();
        if (!snap.empty) total += 10;
      } catch (e) { /* ignore */ }
    }
    return total;
  }

  async function mergeBabySubcollections(db, fromId, toId) {
    var names = ['newborn_care', 'vaccinations', 'kmc_actions'];
    for (var i = 0; i < names.length; i++) {
      var snap = await db.collection('patients').doc(fromId).collection(names[i]).get();
      for (var j = 0; j < snap.docs.length; j++) {
        var doc = snap.docs[j];
        var data = clonePlain(doc.data() || {});
        data.merged_from_patient_id = fromId;
        data.migrated_from_duplicate = true;
        await db.collection('patients').doc(toId).collection(names[i]).doc(doc.id).set(data, { merge: true });
      }
    }
  }

  function otherGroupBabyIdsFromList(babies, groupId) {
    return babies.filter(function (item) {
      var gid = item.data && item.data.birth_group_id;
      return gid && String(gid) !== String(groupId || '');
    }).map(function (item) { return item.id; });
  }

  async function otherGroupBabyIds(db, motherId, groupId, cachedBabies) {
    var babies = cachedBabies || await fetchMotherBabyPatients(db, motherId);
    return otherGroupBabyIdsFromList(babies, groupId);
  }

  async function createOrUpdateBabiesFromDeliveryNotes(motherId, notes, userId) {
    if (!motherId || !global.firebase) return [];
    var db = firebase.firestore();
    motherId = await resolveMotherPatientId(db, motherId);
    var motherRef = db.collection('patients').doc(motherId);
    var motherSnap = await motherRef.get();
    if (!motherSnap.exists) return [];
    var mother = motherSnap.data() || {};
    if (isBabyPatient(mother)) return [];
    var normalized = global.DeliveryNotesUtils && DeliveryNotesUtils.normalizeDeliveryNotes
      ? DeliveryNotesUtils.normalizeDeliveryNotes(notes)
      : (notes || {});
    var babies = ((normalized.deliveryDetails || {}).babies || []).filter(function (baby) {
      return String(baby.outcome || '').toLowerCase() !== 'stillbirth';
    });
    if (!babies.length) return [];
    var groupId = birthGroupId(motherId, normalized);
    var babyCount = babies.length;
    var ids = [];
    for (var i = 0; i < babies.length; i++) {
      var birthOrder = parseInt(babies[i].babyIndex, 10) || (i + 1);
      var existing = await findExistingBabyFast(db, motherId, groupId, birthOrder);
      var payload = babyPayload(motherId, mother, babies[i], birthOrder, groupId, {}, userId, babyCount);
      var babyRef;
      if (existing) {
        babyRef = db.collection('patients').doc(existing.id);
        delete payload.created_by;
        delete payload.createdBy;
        await babyRef.set(payload, { merge: true });
      } else {
        babyRef = db.collection('patients').doc();
        payload.patient_unique_id = await generateBabyPatientUniqueId(db, payload);
        payload.created_at = nowServer();
        await babyRef.set(payload, { merge: true });
      }
      ids.push(babyRef.id);
    }
    var motherUpdate = {
      patient_type: PATIENT_TYPE_MOTHER,
      baby_patient_ids: firebase.firestore.FieldValue.arrayUnion.apply(firebase.firestore.FieldValue, ids),
      updated_at: nowServer(),
      updated_by: userId || null
    };
    if (userId) {
      motherUpdate.care_team_midwife_ids = firebase.firestore.FieldValue.arrayUnion(userId);
    }
    await motherRef.set(motherUpdate, { merge: true });
    return ids;
  }

  async function deduplicateBabyPatientsForMother(motherId, options) {
    options = options || {};
    if (!motherId || !global.firebase) return { motherId: motherId, merged: [], archived: [], dryRun: options.dryRun !== false };
    var db = firebase.firestore();
    var dryRun = options.dryRun !== false;
    var result = { motherId: motherId, merged: [], archived: [], renamed: [], dryRun: dryRun, errors: [] };
    var motherRef = db.collection('patients').doc(motherId);
    var motherSnap = await motherRef.get();
    if (!motherSnap.exists) return result;
    var babies = await fetchMotherBabyPatients(db, motherId);
    if (babies.length < 2) {
      if (babies.length === 1 && !dryRun) {
        var only = babies[0];
        var onlyData = only.data || {};
        var expectedName = babyDisplayName(onlyData.mother_name || motherSnap.data().name || '', 1, null, 1);
        if (onlyData.name !== expectedName) {
          await only.ref.set({ name: expectedName, updated_at: nowServer() }, { merge: true });
          result.renamed.push({ id: only.id, name: expectedName });
        }
      }
      return result;
    }

    var groups = {};
    babies.forEach(function (item) {
      var d = item.data || {};
      var key = String(d.birth_group_id || 'legacy') + '::' + (parseInt(d.birth_order, 10) || 1);
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    });
    var expectedBabyCount = Object.keys(groups).length;

    var canonicalIds = [];
    for (var groupKey in groups) {
      if (!Object.prototype.hasOwnProperty.call(groups, groupKey)) continue;
      var group = groups[groupKey];
      if (group.length === 1) {
        canonicalIds.push(group[0].id);
        continue;
      }
      var scored = [];
      for (var i = 0; i < group.length; i++) {
        var subScore = await countPatientSubcollections(db, group[i].id);
        scored.push({
          item: group[i],
          score: babyCandidateScore(group[i]) + subScore
        });
      }
      scored.sort(function (a, b) { return b.score - a.score; });
      var winner = scored[0].item;
      canonicalIds.push(winner.id);
      var birthOrder = parseInt(winner.data.birth_order, 10) || 1;
      var winnerName = babyDisplayName(
        winner.data.mother_name || motherSnap.data().name || '',
        birthOrder,
        null,
        expectedBabyCount
      );
      if (!dryRun && winner.data.name !== winnerName) {
        await winner.ref.set({ name: winnerName, updated_at: nowServer() }, { merge: true });
        result.renamed.push({ id: winner.id, name: winnerName });
      }
      for (var j = 1; j < scored.length; j++) {
        var loser = scored[j].item;
        result.merged.push({ keep: winner.id, remove: loser.id, groupKey: groupKey });
        if (!dryRun) {
          try {
            await mergeBabySubcollections(db, loser.id, winner.id);
            await loser.ref.set({
              status: 'duplicate_archived',
              merged_into_patient_id: winner.id,
              archived_at: nowServer(),
              updated_at: nowServer()
            }, { merge: true });
            result.archived.push(loser.id);
          } catch (e) {
            result.errors.push({ patientId: loser.id, message: e.message || String(e) });
          }
        }
      }
    }

    if (!dryRun) {
      await motherRef.set({
        baby_patient_ids: uniqueIds(canonicalIds),
        updated_at: nowServer()
      }, { merge: true });
    }
    return result;
  }

  async function deduplicateBabyPatients(options) {
    options = options || {};
    if (!global.firebase) throw new Error('Firebase is required');
    var db = firebase.firestore();
    var dryRun = options.dryRun !== false;
    var limit = parseInt(options.limit, 10) || 50;
    var motherId = options.motherId || null;
    var summary = { dryRun: dryRun, mothersScanned: 0, mothersWithDuplicates: 0, mergedGroups: 0, archived: 0, renamed: 0, details: [], errors: [] };

    if (motherId) {
      var one = await deduplicateBabyPatientsForMother(motherId, options);
      summary.mothersScanned = 1;
      summary.mergedGroups += one.merged.length;
      summary.archived += one.archived.length;
      summary.renamed += one.renamed.length;
      if (one.merged.length) summary.mothersWithDuplicates = 1;
      summary.details.push(one);
      return summary;
    }

    var snap = await db.collection('patients').limit(limit).get();
    for (var i = 0; i < snap.docs.length; i++) {
      var doc = snap.docs[i];
      var data = doc.data() || {};
      if (isBabyPatient(data)) continue;
      summary.mothersScanned += 1;
      try {
        var babies = await fetchMotherBabyPatients(db, doc.id);
        if (babies.length < 2) continue;
        var detail = await deduplicateBabyPatientsForMother(doc.id, options);
        if (detail.merged.length) {
          summary.mothersWithDuplicates += 1;
          summary.mergedGroups += detail.merged.length;
          summary.archived += detail.archived.length;
          summary.renamed += detail.renamed.length;
          summary.details.push(detail);
        }
      } catch (e) {
        summary.errors.push({ patientId: doc.id, message: e.message || String(e) });
      }
    }
    return summary;
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
          results.createdOrUpdatedBabies += (ids && ids.length) || 0;
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
    formatBabyLinkError: formatBabyLinkError,
    retryFirestoreOp: retryFirestoreOp,
    resolveMotherPatientId: resolveMotherPatientId,
    ensureCareTeamMidwife: ensureCareTeamMidwife,
    buildCareTeamIds: buildCareTeamIds,
    createOrUpdateBabiesFromDeliveryNotes: createOrUpdateBabiesFromDeliveryNotes,
    deduplicateBabyPatients: deduplicateBabyPatients,
    deduplicateBabyPatientsForMother: deduplicateBabyPatientsForMother,
    copyLegacyBabyCareToBabyPatients: copyLegacyBabyCareToBabyPatients,
    backfillExistingBabyPatients: backfillExistingBabyPatients,
    ensureBirthGroupId: ensureBirthGroupId,
    birthGroupId: birthGroupId,
    dateFromBirthTime: dateFromBirthTime,
    ageInYears: ageInYears,
    formatBabyAgeDisplay: formatBabyAgeDisplay,
    findExistingMotherPatient: findExistingMotherPatient,
    normalizePersonName: normalizePersonName
  };
})(typeof window !== 'undefined' ? window : this);
