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
    if (v === 'c_section' || v === 'caesarean_section' || v === 'cesarean_section' || v.indexOf('section') !== -1) return 'caesarean_section';
    return value;
  }

  function normalizeBirthPlaceForNewborn(value) {
    var v = String(value || '').toLowerCase();
    if (!v) return '';
    if (v.indexOf('private') !== -1 || v.indexOf('home') !== -1 || v.indexOf('အိမ်') !== -1) return 'Private';
    return 'Facility';
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

  function normalizeBaby(raw, index) {
    raw = raw || {};
    index = typeof index === 'number' ? index : 0;
    return {
      babyIndex: index + 1,
      babyName: firstOf(raw.babyName, raw.baby_name, raw.name),
      outcome: normalizeOutcome(raw.outcome),
      gender: normalizeGender(firstOf(raw.gender, raw.sex)),
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
      birthplace: normalizeBirthPlaceForNewborn(notes.deliveryDetails.birthPlace) || null
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

  async function saveDeliveryNotes(patientId, notes, userId) {
    if (!patientId || !global.firebase) throw new Error('Patient ID is required');
    var normalized = normalizeDeliveryNotes(notes);
    var payload = {
      thirdStage: normalized.thirdStage,
      deliveryDetails: normalized.deliveryDetails,
      updatedAt: nowServer(),
      updatedBy: userId || null
    };
    await firebase.firestore()
      .collection('patients')
      .doc(patientId)
      .collection('records')
      .doc(DELIVERY_DOC_ID)
      .set(payload, { merge: true });
    return payload;
  }

  async function syncFromNewbornIfMissing(patientId, newbornData, userId) {
    var existing = await fetchDeliveryNotes(patientId);
    if (existing && existing.deliveryDetails && existing.deliveryDetails.babies && existing.deliveryDetails.babies.length) return existing;
    return saveDeliveryNotes(patientId, deliveryNotesFromNewborn(newbornData), userId);
  }

  global.DeliveryNotesUtils = {
    DELIVERY_DOC_ID: DELIVERY_DOC_ID,
    normalizeDeliveryNotes: normalizeDeliveryNotes,
    deliveryNotesFromNewborn: deliveryNotesFromNewborn,
    legacyFieldsFromDelivery: legacyFieldsFromDelivery,
    fetchDeliveryNotes: fetchDeliveryNotes,
    saveDeliveryNotes: saveDeliveryNotes,
    syncFromNewbornIfMissing: syncFromNewbornIfMissing,
    defaultBabies: defaultBabies,
    normalizeBaby: normalizeBaby,
    normalizeDeliveryModeForNewborn: normalizeDeliveryModeForNewborn,
    normalizeBirthPlaceForNewborn: normalizeBirthPlaceForNewborn,
    toDatetimeLocal: toDatetimeLocal
  };
})(typeof window !== 'undefined' ? window : this);
