(function (global) {
  'use strict';

  var DELIVERY_DOC_ID = 'deliveryNotes';
  var LEGACY_THIRD_STAGE_DOC_ID = 'thirdStage';

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

  function normalizePregnancyType(value) {
    var v = String(value || '').toLowerCase();
    return v === 'twins' || v === 'twin' || v === 'multiple' ? 'twins' : 'single';
  }

  function normalizeOutcome(value) {
    var v = String(value || '').toLowerCase();
    if (v === 'dead' || v === 'death' || v === 'neonatal_death') return 'death';
    if (v === 'stillbirth' || v === 'still_birth') return 'stillbirth';
    return v === 'alive' ? 'alive' : '';
  }

  function normalizeGender(value) {
    var v = String(value || '').toLowerCase();
    if (v === 'm') return 'male';
    if (v === 'f') return 'female';
    return v === 'male' || v === 'female' ? v : '';
  }

  function normalizeDeliveryModeForNewborn(value) {
    var v = String(value || '').toLowerCase();
    if (!v) return '';
    if (v === 'normal' || v === 'normal_vaginal' || v.indexOf('normal') !== -1) return 'normal_vaginal';
    if (v === 'assisted' || v === 'assisted_vaginal' || v.indexOf('assisted') !== -1 || v.indexOf('forceps') !== -1 || v.indexOf('vacuum') !== -1) return 'assisted_vaginal';
    if (v === 'elective_c_section' || v === 'elective_caesarean_section') return 'elective_caesarean_section';
    if (v === 'emergency_c_section' || v === 'emergency_caesarean_section') return 'emergency_caesarean_section';
    if (v === 'c_section' || v === 'caesarean_section' || v === 'cesarean_section' || v.indexOf('section') !== -1) return 'caesarean_section';
    return value;
  }

  function normalizeBirthPlaceForNewborn(value) {
    var raw = String(value || '').trim();
    if (!raw) return '';
    var v = raw.toLowerCase().replace(/[_\s-]+/g, ' ');

    if (
      v === 'government hospital' ||
      v === 'government_hospital'
    ) {
      return 'government_hospital';
    }

    if (
      v === 'health facility' ||
      v === 'health facility subfacility' ||
      v === 'health_facility_subfacility' ||
      v === 'subfacility' ||
      v === 'rhc' ||
      v === 'srhc' ||
      v === 'rhc srhc' ||
      v === 'rhc/srhc' ||
      raw.indexOf('ကျန်းမာရေးဌာန') !== -1
    ) {
      return 'health_facility_subfacility';
    }

    if (
      v === 'public facility' ||
      v === 'public_facility' ||
      v === 'facility' ||
      v.indexOf('public') !== -1 ||
      v.indexOf('အစိုးရ') !== -1
    ) {
      return 'public_facility';
    }

    if (
      v === 'private facility' ||
      v === 'private_facility' ||
      v.indexOf('private facility') !== -1 ||
      v.indexOf('ပုဂ္ဂလိက') !== -1
    ) {
      return 'private_facility';
    }

    // Legacy "Private" alone was used before home/private facility split.
    if (v === 'private') return 'private_facility';

    if (
      v === 'home' ||
      v === 'home delivery' ||
      v.indexOf('home') !== -1 ||
      v.indexOf('အိမ်') !== -1
    ) {
      return 'home';
    }

    if (
      v === 'other' ||
      v === 'others' ||
      v.indexOf('other') !== -1 ||
      v.indexOf('အခြား') !== -1
    ) {
      return 'other';
    }

    return raw;
  }

  function birthPlaceLabel(value, language) {
    var key = normalizeBirthPlaceForNewborn(value);
    var mm = language === 'mm';
    if (key === 'government_hospital') return mm ? 'အစိုးရဆေးရုံ' : 'Government Hospital';
    if (key === 'health_facility_subfacility') return mm ? 'ကျန်းမာရေးဌာန/ဌာနခွဲ' : 'RHC/SRHC';
    if (key === 'public_facility') return mm ? 'ကျန်းမာရေးဌာန/ဌာနခွဲ' : 'RHC/SRHC';
    if (key === 'private_facility') return mm ? 'ပုဂ္ဂလိက' : 'Private Facility';
    if (key === 'home') return mm ? 'အိမ်မွေး' : 'Home Delivery';
    if (key === 'other') return mm ? 'အခြား' : 'Other';
    return value || '';
  }

  function myanmarDigits(value) {
    return String(value == null ? '' : value).replace(/\d/g, function (digit) {
      return '၀၁၂၃၄၅၆၇၈၉'[digit];
    });
  }

  function splitGestationalAge(value) {
    var n = toNumber(value);
    if (n == null) return null;
    var weeks = Math.floor(n);
    var days = Math.round((n - weeks) * 7);
    if (days === 7) {
      weeks += 1;
      days = 0;
    }
    if (days < 0) days = 0;
    return { weeks: weeks, days: days, decimal: weeks + (days / 7) };
  }

  function combineGestationalAge(weeks, days) {
    var w = parseInt(weeks, 10);
    var d = parseInt(days, 10);
    if (isNaN(w)) return null;
    if (isNaN(d) || d < 0) d = 0;
    if (d > 6) d = 6;
    return w + (d / 7);
  }

  function formatGestationalAgeWeeksDays(value, language) {
    var parts = splitGestationalAge(value);
    if (!parts) return '';
    if (language === 'mm') {
      return myanmarDigits(parts.weeks) + ' ပတ် ' + myanmarDigits(parts.days) + ' ရက်';
    }
    return parts.weeks + (parts.weeks === 1 ? ' week ' : ' weeks ') +
      parts.days + (parts.days === 1 ? ' day' : ' days');
  }

  function normalizeBirthProvider(value) {
    var v = String(value || '').toLowerCase().replace(/[_\s-]+/g, '_');
    if (!v) return '';
    if (v === 'self') return 'self';
    if (v === 'skilled_birth_attendant' || v === 'skilled_birth_attendance' || v === 'sba') {
      return 'skilled_birth_attendant';
    }
    if (v === 'amw') return 'amw';
    if (v === 'tba' || v === 'tba_other') return 'tba';
    if (v === 'other' || v === 'others') return 'other';
    return value;
  }

  function birthProviderLabel(value, language) {
    var key = normalizeBirthProvider(value);
    var mm = language === 'mm';
    if (key === 'self') return mm ? 'ကိုယ်တိုင်' : 'Self';
    if (key === 'skilled_birth_attendant') return mm ? 'ကျွမ်းကျင် မွေးဖွားသူ' : 'Skilled Birth Attendance';
    if (key === 'amw') return mm ? 'အရံသားဖွား' : 'AMW';
    if (key === 'tba') return 'အရပ်လက်သည်';
    if (key === 'other') return mm ? 'အခြား' : 'Other';
    return value || '';
  }

  function normalizeDeliveryModeForForm(value) {
    var v = String(value || '').toLowerCase();
    if (!v) return '';
    if (v === 'normal' || v === 'normal_vaginal') return 'normal';
    if (v === 'assisted' || v === 'assisted_vaginal') return 'assisted';
    if (v === 'elective_c_section' || v === 'elective_caesarean_section') return 'elective_c_section';
    if (v === 'emergency_c_section' || v === 'emergency_caesarean_section') return 'emergency_c_section';
    if (v === 'c_section' || v === 'caesarean_section' || v === 'cesarean_section') return 'emergency_c_section';
    return v;
  }

  function normalizeBirthPlaceForForm(value) {
    var key = normalizeBirthPlaceForNewborn(value);
    if (key === 'public_facility') return 'health_facility_subfacility';
    return key;
  }

  async function promptDeliveryNotesRequired(patientId, language, options) {
    options = options || {};
    var mm = language === 'mm';
    var title = options.title || (mm ? 'Delivery Notes လိုအပ်သည်' : 'Delivery Notes required');
    var message = options.message || (mm
      ? 'PNC မစတင်မီ Delivery Notes ကို အရင်သိမ်းပါ။'
      : 'Save Delivery Notes before starting a PNC visit.');
    var okLabel = options.okLabel || (mm ? 'Delivery Notes ဖွင့်ရန်' : 'Open Delivery Notes');
    var cancelLabel = options.cancelLabel || (mm ? 'ပိတ်ရန်' : 'Close');
    var allowCancel = options.allowCancel === true;
    var go = true;
    if (allowCancel && global.AppDialog && typeof global.AppDialog.confirm === 'function') {
      go = await global.AppDialog.confirm(message, { title: title, okLabel: okLabel, cancelLabel: cancelLabel });
    } else if (global.AppDialog && typeof global.AppDialog.alert === 'function') {
      await global.AppDialog.alert(message, { title: title, okLabel: okLabel });
    } else if (allowCancel && global.confirm) {
      go = global.confirm(message);
    } else if (global.alert) {
      global.alert(message);
    }
    if (go && patientId) {
      global.location.href = 'patient-care-hub.html?patient=' + encodeURIComponent(patientId);
    }
    return false;
  }

  function toDatetimeLocal(value, fallbackDate) {
    if (!value) return '';
    var s = String(value).trim();
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)) return s.slice(0, 16);
    if (/^\d{2}:\d{2}$/.test(s)) {
      var date = fallbackDate || new Date().toISOString().split('T')[0];
      return date + 'T' + s;
    }
    var d = new Date(s);
    if (!isNaN(d.getTime())) {
      return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') +
        'T' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    }
    return s;
  }

  function toNumber(value) {
    if (value === undefined || value === null || value === '') return null;
    var n = parseFloat(value);
    return isNaN(n) ? null : n;
  }

  function gramsToKilograms(value) {
    var grams = toNumber(value);
    return grams == null ? null : grams / 1000;
  }

  function normalizeBaby(raw, index) {
    raw = raw || {};
    index = typeof index === 'number' ? index : 0;
    return {
      babyIndex: index + 1,
      babyName: firstOf(raw.babyName, raw.baby_name, raw.name),
      outcome: normalizeOutcome(raw.outcome),
      gender: normalizeGender(firstOf(raw.gender, raw.sex)),
      anusPresent: firstOf(raw.anusPresent, raw.anus_present),
      birthWeightGram: toNumber(firstOf(raw.birthWeightGram, raw.birth_weight_gram, raw.body_weight_gram)),
      birthTime: firstOf(raw.birthTime, raw.birth_time),
      causeOfDeath: firstOf(raw.causeOfDeath, raw.cause_of_death)
    };
  }

  function defaultBabies(count) {
    var total = Math.max(1, parseInt(count, 10) || 1);
    var out = [];
    for (var i = 0; i < total; i++) out.push(normalizeBaby({}, i));
    return out;
  }

  function babiesFromLegacy(data) {
    data = data || {};
    if (Array.isArray(data.babies) && data.babies.length) {
      return data.babies.map(normalizeBaby);
    }
    return [normalizeBaby({
      babyName: data.baby_name || data.babyName,
      outcome: data.outcome,
      gender: data.gender,
      birthWeightGram: data.body_weight_gram || data.birthWeightGram,
      birthTime: data.birth_time || data.birthTime,
      causeOfDeath: data.cause_of_death || data.causeOfDeath
    }, 0)];
  }

  function normalizeDeliveryNotes(data) {
    data = data || {};
    var details = data.deliveryDetails || data.labourDetails || data;
    var babies = babiesFromLegacy(details);
    var pregnancyType = normalizePregnancyType(firstOf(details.pregnancyType, data.pregnancyType));
    if (pregnancyType === 'twins' && babies.length < 2) babies = defaultBabies(2).map(function (baby, index) {
      return babies[index] || baby;
    });
    return {
      thirdStage: {
        oxytocinGiven: !!firstOf(data.thirdStage && data.thirdStage.oxytocinGiven, data.oxytocinGiven),
        controlledCordTraction: !!firstOf(data.thirdStage && data.thirdStage.controlledCordTraction, data.controlledCordTraction)
      },
      deliveryDetails: {
        pregnancyType: pregnancyType,
        gestationalWeek: toNumber(firstOf(details.gestationalWeek, details.gestational_week, data.gestationalWeek)),
        anusPresent: firstOf(details.anusPresent, details.anus_present, data.anusPresent),
        birthProvider: normalizeBirthProvider(firstOf(details.birthProvider, details.birth_provider, data.birthProvider)),
        modeOfDelivery: firstOf(details.modeOfDelivery, details.mode_of_delivery),
        birthPlace: firstOf(details.birthPlace, details.birthplace),
        babies: babies
      },
      updatedAt: data.updatedAt || data.timestamp || null,
      updatedBy: data.updatedBy || null
    };
  }

  function legacyFieldsFromDelivery(notes) {
    notes = normalizeDeliveryNotes(notes);
    var firstBaby = (notes.deliveryDetails.babies || [])[0] || {};
    return {
      pregnancy_type: notes.deliveryDetails.pregnancyType,
      baby_count: notes.deliveryDetails.babies.length || 1,
      babies: notes.deliveryDetails.babies.map(function (baby) {
        var copy = {};
        Object.keys(baby).forEach(function (key) { copy[key] = baby[key]; });
        copy.birthTime = toDatetimeLocal(copy.birthTime);
        return copy;
      }),
      gender: firstBaby.gender || null,
      birth_time: toDatetimeLocal(firstBaby.birthTime) || null,
      body_weight_gram: firstBaby.birthWeightGram || null,
      outcome: firstBaby.outcome === 'death' ? 'dead' : (firstBaby.outcome || null),
      cause_of_death: firstBaby.causeOfDeath || null,
      mode_of_delivery: normalizeDeliveryModeForNewborn(notes.deliveryDetails.modeOfDelivery) || null,
      birthplace: normalizeBirthPlaceForNewborn(notes.deliveryDetails.birthPlace) || null,
      gestational_week: notes.deliveryDetails.gestationalWeek,
      anus_present: firstBaby.anusPresent || notes.deliveryDetails.anusPresent || null,
      birth_provider: notes.deliveryDetails.birthProvider || null
    };
  }

  function deliveryNotesFromNewborn(data) {
    data = data || {};
    var babies = babiesFromLegacy(data);
    var pregnancyType = normalizePregnancyType(firstOf(data.pregnancy_type, data.pregnancyType, babies.length > 1 ? 'twins' : 'single'));
    return normalizeDeliveryNotes({
      thirdStage: data.thirdStage || {},
      deliveryDetails: {
        pregnancyType: pregnancyType,
        modeOfDelivery: firstOf(data.mode_of_delivery, data.modeOfDelivery),
        birthPlace: firstOf(data.birthplace, data.birthPlace),
        babies: babies
      }
    });
  }

  async function fetchDeliveryNotes(patientId) {
    if (!patientId || !global.firebase) return null;
    var db = firebase.firestore();
    var ref = db.collection('patients').doc(patientId).collection('records').doc(DELIVERY_DOC_ID);
    var doc = await ref.get();
    if (doc.exists) return normalizeDeliveryNotes(doc.data());

    var legacy = await db.collection('patients').doc(patientId).collection('records').doc(LEGACY_THIRD_STAGE_DOC_ID).get();
    if (legacy.exists) return normalizeDeliveryNotes(legacy.data());
    return null;
  }

  async function syncLegacyFieldsToNewbornIfEmpty(patientId, notes) {
    if (!patientId || !global.firebase) return;
    var legacy = legacyFieldsFromDelivery(notes);
    if (!legacy) return;
    var db = firebase.firestore();
    var collectionRef = db.collection('patients').doc(patientId).collection('newborn_care');
    var existing;
    try {
      existing = await collectionRef.orderBy('visit_number', 'asc').limit(1).get();
    } catch (error) {
      existing = await collectionRef.get();
    }
    var firstDoc = existing.empty ? null : existing.docs.slice().sort(function (a, b) {
      var av = parseInt((a.data() || {}).visit_number, 10) || 999;
      var bv = parseInt((b.data() || {}).visit_number, 10) || 999;
      return av - bv;
    })[0];
    var current = firstDoc ? (firstDoc.data() || {}) : {};
    var patch = {};
    if (!current.birth_time && legacy.birth_time) patch.birth_time = legacy.birth_time;
    if (!current.birthplace && legacy.birthplace) patch.birthplace = legacy.birthplace;
    if (!current.mode_of_delivery && legacy.mode_of_delivery) patch.mode_of_delivery = legacy.mode_of_delivery;
    if (legacy.pregnancy_type) patch.pregnancy_type = legacy.pregnancy_type;
    patch.baby_count = legacy.baby_count;
    patch.babies = legacy.babies.map(function (baby, index) {
      var merged = Object.assign({}, Array.isArray(current.babies) ? current.babies[index] : null);
      Object.keys(baby).forEach(function (key) {
        if (baby[key] !== undefined && baby[key] !== null && baby[key] !== '') {
          merged[key] = baby[key];
        }
      });
      return merged;
    });
    if (!current.gender && legacy.gender) patch.gender = legacy.gender;
    if ((current.body_weight_gram == null || current.body_weight_gram === '') && legacy.body_weight_gram != null) {
      patch.body_weight_gram = legacy.body_weight_gram;
    }
    if (!current.outcome && legacy.outcome) patch.outcome = legacy.outcome;
    if (!Object.keys(patch).length) return;
    if (firstDoc) {
      await collectionRef.doc(firstDoc.id).set(patch, { merge: true });
    }
  }

  async function syncDeliverySummaryToPatient(patientId, notes) {
    if (!patientId || !global.firebase) return;
    var legacy = legacyFieldsFromDelivery(notes);
    if (!legacy) return;
    var updates = {
      updatedAt: nowServer()
    };
    if (legacy.birth_time) {
      updates.birth_time = legacy.birth_time;
      updates.deliveredDateTime = legacy.birth_time;
    }
    if (legacy.birthplace) updates.birthplace = legacy.birthplace;
    if (legacy.mode_of_delivery) updates.mode_of_delivery = legacy.mode_of_delivery;
    if (legacy.pregnancy_type) updates.pregnancy_type = legacy.pregnancy_type;
    await firebase.firestore().collection('patients').doc(patientId).set(updates, { merge: true });
  }

  async function saveDeliveryNotes(patientId, notes, userId, options) {
    options = options || {};
    if (!patientId || !global.firebase) throw new Error('Patient ID is required');
    if (!global.BabyPatientUtils || !BabyPatientUtils.createOrUpdateBabiesFromDeliveryNotes) {
      throw new Error('Baby patient module not loaded. Please refresh the app.');
    }
    var normalized = normalizeDeliveryNotes(notes);
    var payload = {
      thirdStage: normalized.thirdStage,
      deliveryDetails: normalized.deliveryDetails,
      updatedAt: nowServer(),
      updatedBy: userId || null
    };
    var ref = firebase.firestore()
      .collection('patients')
      .doc(patientId)
      .collection('records')
      .doc(DELIVERY_DOC_ID);
    await firebase.firestore().runTransaction(async function (transaction) {
      var existing = await transaction.get(ref);
      if (existing.exists && !options.allowUpdate) {
        var error = new Error('Delivery Notes already exist. Use the supervised edit approval workflow to make a correction.');
        error.code = 'delivery-notes/already-exists';
        throw error;
      }
      if (!existing.exists) {
        payload.createdAt = nowServer();
        payload.createdBy = userId || null;
      } else {
        payload.correctionApprovalId = options.approvalId || null;
      }
      transaction.set(ref, payload, { merge: !!existing.exists });
    });

    var babyIds = await BabyPatientUtils.createOrUpdateBabiesFromDeliveryNotes(patientId, payload, userId, {
      motherData: options.motherData || null
    });
    if (!Array.isArray(babyIds)) babyIds = [];
    payload.linkedBabyPatientIds = babyIds;

    try {
      await syncDeliverySummaryToPatient(patientId, normalized);
    } catch (e) {
      console.warn('[DeliveryNotes] could not sync summary to patient:', e);
    }
    try {
      await syncLegacyFieldsToNewbornIfEmpty(patientId, normalized);
    } catch (e) {
      console.warn('[DeliveryNotes] could not sync identity fields to newborn care:', e);
    }
    if (global.BirthDeliveryAnchor && BirthDeliveryAnchor.syncDatetimeToNewbornCareIfEmpty) {
      var legacy = legacyFieldsFromDelivery(normalized);
      if (legacy && legacy.birth_time) {
        BirthDeliveryAnchor.syncDatetimeToNewbornCareIfEmpty(patientId, legacy.birth_time).catch(function () {});
      }
    }
    return {
      payload: payload,
      babyIds: babyIds
    };
  }

  async function syncFromNewbornIfMissing(patientId, newbornData, userId) {
    var existing = await fetchDeliveryNotes(patientId);
    if (existing && existing.deliveryDetails && existing.deliveryDetails.babies && existing.deliveryDetails.babies.length) return existing;
    await saveDeliveryNotes(patientId, deliveryNotesFromNewborn(newbornData), userId);
    return fetchDeliveryNotes(patientId);
  }

  global.DeliveryNotesUtils = {
    DELIVERY_DOC_ID: DELIVERY_DOC_ID,
    normalizeDeliveryNotes: normalizeDeliveryNotes,
    deliveryNotesFromNewborn: deliveryNotesFromNewborn,
    legacyFieldsFromDelivery: legacyFieldsFromDelivery,
    fetchDeliveryNotes: fetchDeliveryNotes,
    saveDeliveryNotes: saveDeliveryNotes,
    syncFromNewbornIfMissing: syncFromNewbornIfMissing,
    syncLegacyFieldsToNewbornIfEmpty: syncLegacyFieldsToNewbornIfEmpty,
    syncDeliverySummaryToPatient: syncDeliverySummaryToPatient,
    defaultBabies: defaultBabies,
    normalizeBaby: normalizeBaby,
    normalizeDeliveryModeForNewborn: normalizeDeliveryModeForNewborn,
    normalizeDeliveryModeForForm: normalizeDeliveryModeForForm,
    normalizeBirthPlaceForNewborn: normalizeBirthPlaceForNewborn,
    normalizeBirthPlaceForForm: normalizeBirthPlaceForForm,
    normalizeBirthProvider: normalizeBirthProvider,
    birthPlaceLabel: birthPlaceLabel,
    birthProviderLabel: birthProviderLabel,
    splitGestationalAge: splitGestationalAge,
    combineGestationalAge: combineGestationalAge,
    formatGestationalAgeWeeksDays: formatGestationalAgeWeeksDays,
    promptDeliveryNotesRequired: promptDeliveryNotesRequired,
    toDatetimeLocal: toDatetimeLocal,
    gramsToKilograms: gramsToKilograms
  };
})(typeof window !== 'undefined' ? window : this);
