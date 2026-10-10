/**
 * Declarative retroactive-data rules.
 * Pure detection and write planning. No Firestore and no deletes.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.RetroactiveDataRules = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var RULE_VERSION = 'retroactive-v1';
  var BIRTH_PLACES = ['government_hospital', 'health_facility_subfacility', 'private_facility', 'home', 'other'];
  var DELIVERY_MODES = ['normal', 'assisted', 'elective_c_section', 'emergency_c_section'];
  var BLOCKED_KEYS = {
    created_by: true,
    createdBy: true,
    patient_type: true,
    baby_patient_ids: true,
    care_team_midwife_ids: true
  };

  function choice(value, en, mm) {
    return { value: value, en: en, mm: mm || en };
  }

  function yesNoUnknown() {
    return [choice('Yes', 'Yes', 'ရှိ'), choice('No', 'No', 'မရှိ'), choice('Unknown', 'Unknown', 'မသိ')];
  }

  function yesNo() {
    return [choice('Yes', 'Yes', 'ရှိ'), choice('No', 'No', 'မရှိ')];
  }

  function medicationOptions() {
    return [
      choice('Prescribed', 'Prescribed', 'ဆေးပေးသည်'),
      choice('Already Prescribed', 'Already Prescribed', 'ဆေးလက်ကျန်ရှိသည်'),
      choice('Not Prescribed', 'Not Prescribed', 'ဆေးမပေး')
    ];
  }

  function urineOptions() {
    return ['Not tested', 'Negative', 'Trace', '+', '++', '+++'].map(function (value) {
      return choice(value, value, value);
    });
  }

  function assessedOptions() {
    return [choice('Yes', 'Yes', 'ရှိ'), choice('No', 'No', 'မရှိ'), choice('Not assessed', 'Not assessed', 'မစစ်ဆေး')];
  }

  function text(value) {
    return value == null ? '' : String(value).trim();
  }

  function getPath(source, path) {
    var current = source || {};
    for (var i = 0; i < path.length; i++) {
      if (current == null) return '';
      current = current[path[i]];
    }
    if (current && typeof current.toDate === 'function') {
      try { return current.toDate().toISOString(); } catch (error) { return ''; }
    }
    return current == null ? '' : current;
  }

  function setPath(target, path, value) {
    if (!path.length || BLOCKED_KEYS[path[0]]) return;
    if (path.length === 1) {
      target[path[0]] = value;
      return;
    }
    var current = target;
    for (var i = 0; i < path.length - 1; i++) {
      if (!current[path[i]] || typeof current[path[i]] !== 'object') current[path[i]] = {};
      current = current[path[i]];
    }
    current[path[path.length - 1]] = value;
  }

  function cloneData(value) {
    if (Array.isArray(value)) return value.map(cloneData);
    if (!value || typeof value !== 'object') return value;
    if (typeof value.toDate === 'function') {
      try { return value.toDate().toISOString(); } catch (error) { return ''; }
    }
    var copy = {};
    Object.keys(value).forEach(function (key) { copy[key] = cloneData(value[key]); });
    return copy;
  }

  function isDangerous(value) {
    if (!value || typeof value !== 'object') return false;
    if (value._methodName || value.operand || value._delegate) return true;
    if (Array.isArray(value)) return value.some(isDangerous);
    return Object.keys(value).some(function (key) { return isDangerous(value[key]); });
  }

  function todayIso(now) {
    var date = now ? new Date(now) : new Date();
    if (isNaN(date.getTime())) date = new Date();
    return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
  }

  function normalizeMedication(value) {
    var raw = text(value).toLowerCase();
    if (!raw) return '';
    if (raw === 'prescribed' || raw === 'given' || raw === 'yes') return 'Prescribed';
    if (raw === 'already prescribed' || raw === 'already_prescribed') return 'Already Prescribed';
    if (raw === 'not prescribed' || raw === 'not_prescribed' || raw === 'no') return 'Not Prescribed';
    return text(value);
  }

  function normalizeTd(value) {
    var raw = text(value).toLowerCase().replace(/[\s_-]+/g, '');
    if (!raw) return '';
    if (raw === 'td1') return 'TD1';
    if (raw === 'td2') return 'TD2';
    if (raw === 'notgiven' || raw === 'မထိုးရသေး') return 'not_given';
    if (raw === 'completed' || raw === 'complete') return 'Completed';
    return text(value);
  }

  function normalizeDeliveryMode(value) {
    var raw = text(value).toLowerCase();
    if (!raw) return '';
    if (raw === 'normal' || raw === 'normal_vaginal') return 'normal';
    if (raw === 'assisted' || raw === 'assisted_vaginal') return 'assisted';
    if (raw === 'elective_c_section' || raw === 'elective_caesarean_section') return 'elective_c_section';
    if (raw === 'emergency_c_section' || raw === 'emergency_caesarean_section') return 'emergency_c_section';
    if (raw === 'c_section' || raw === 'caesarean_section' || raw === 'cesarean_section') return 'elective_c_section';
    return text(value);
  }

  function normalizeBirthPlace(value) {
    var raw = text(value);
    if (!raw) return '';
    var compact = raw.toLowerCase().replace(/[_\s-]+/g, ' ');
    if (compact === 'government hospital' || compact === 'government_hospital') return 'government_hospital';
    if (
      compact === 'health facility' || compact === 'health facility subfacility' ||
      compact === 'subfacility' || compact === 'rhc' || compact === 'srhc' ||
      compact === 'rhc srhc' || compact === 'rhc/srhc' || compact === 'public facility' ||
      compact === 'public_facility' || raw.indexOf('ကျန်းမာရေးဌာန') !== -1
    ) return 'health_facility_subfacility';
    if (compact === 'private facility' || compact === 'private' || raw.indexOf('ပုဂ္ဂလိက') !== -1) return 'private_facility';
    if (compact === 'home' || compact === 'home delivery' || raw.indexOf('အိမ်') !== -1) return 'home';
    if (compact === 'other' || compact === 'others' || raw.indexOf('အခြား') !== -1) return 'other';
    if (BIRTH_PLACES.indexOf(raw) >= 0) return raw;
    return '';
  }

  function normalizeBirthProvider(value) {
    var raw = text(value).toLowerCase().replace(/[\s-]+/g, '_');
    if (!raw) return '';
    if (raw === 'self') return 'self';
    if (raw === 'skilled_birth_attendant' || raw === 'skilled_birth_attendance' || raw === 'sba') return 'skilled_birth_attendant';
    if (raw === 'amw') return 'amw';
    if (raw === 'tba' || raw === 'tba_other') return 'tba';
    if (raw === 'other' || raw === 'others') return 'other';
    return text(value);
  }

  function booleanOrNull(value) {
    if (value === true || value === false) return value;
    var raw = text(value).toLowerCase();
    if (!raw) return null;
    if (raw === 'yes' || raw === 'true' || raw === '1') return true;
    if (raw === 'no' || raw === 'false' || raw === '0') return false;
    return null;
  }

  function normalizeOutcome(value) {
    var raw = text(value).toLowerCase();
    if (!raw) return '';
    if (raw === 'dead' || raw === 'death') return 'death';
    if (raw === 'alive' || raw === 'stillbirth' || raw === 'referred') return raw;
    return text(value);
  }

  function allowedValue(field, value) {
    if (!field.options) return value;
    var match = field.options.some(function (option) { return option.value === value; });
    return match ? value : '';
  }

function readField(record, field) {
  if (field.type === 'obstetric') {
    var rows = getPath(record, field.path || [field.key]);
    var complete = Array.isArray(rows) && rows.some(function (row) {
      return text(row && row.year) && text(row && (row.deliveryType || row.outcome));
    });
    if (complete || !field.required) return { status: 'ok', current: complete ? rows : '', legacy: '', proposed: '' };
    return { status: 'missing', current: '', legacy: '', proposed: '' };
  }
  if (field.type === 'babies' || field.type === 'age') return { status: 'ok', current: '', legacy: '', proposed: '' };
  var canonicalRaw = getPath(record, field.path || [field.key]);
    var legacyRaw = '';
    (field.aliases || []).forEach(function (alias) {
      if (legacyRaw !== '' && legacyRaw != null) return;
      var value = getPath(record, alias);
      if (value !== '' && value != null) legacyRaw = value;
    });
    var normalize = field.normalize || text;
    var canonical = allowedValue(field, normalize(canonicalRaw));
    var legacy = allowedValue(field, normalize(legacyRaw));
    var canonicalFilled = field.type === 'boolean' ? booleanOrNull(canonicalRaw) !== null : canonical !== '' && canonical != null;
    var legacyFilled = field.type === 'boolean' ? booleanOrNull(legacyRaw) !== null : legacy !== '' && legacy != null;
    if (field.type === 'boolean') {
      canonical = booleanOrNull(canonicalRaw);
      legacy = booleanOrNull(legacyRaw);
      canonicalFilled = canonical !== null;
      legacyFilled = legacy !== null;
    }
    if (canonicalFilled && legacyFilled && String(canonical) !== String(legacy)) {
      return { status: 'conflict', current: canonicalRaw, legacy: legacyRaw, proposed: '' };
    }
    if (canonicalFilled) return { status: 'ok', current: canonical };
    if (legacyFilled) return { status: 'conflict', current: '', legacy: legacyRaw, proposed: legacy };
    if (legacyRaw !== '' && legacyRaw != null && !legacyFilled) {
      return { status: 'conflict', current: '', legacy: legacyRaw, proposed: '' };
    }
    return { status: field.required ? 'missing' : 'ok', current: '', legacy: '' };
  }

  function gapFromField(recordKey, field, reading) {
    return {
      id: recordKey + ':' + field.key,
      field: field.key,
      labelEn: field.labelEn,
      labelMm: field.labelMm,
      section: field.section || 'details',
      kind: reading.status,
      counts: true,
      currentValue: reading.current == null ? '' : reading.current,
      legacyValue: reading.legacy == null ? '' : reading.legacy,
      proposedValue: reading.proposed == null ? '' : reading.proposed,
      editor: {
        type: field.type,
        options: field.options || null,
        min: field.min == null ? null : field.min,
        max: field.max == null ? null : field.max,
        step: field.step || null
      }
    };
  }

  function evaluateFields(record, fields, recordKey) {
    var gaps = [];
    fields.forEach(function (field) {
      if (field.when && !field.when(record)) return;
      var reading = readField(record, field);
      if (reading.status === 'ok') return;
      var gap = gapFromField(recordKey, field, reading);
      gap.required = true;
      gaps.push(gap);
    });
    return gaps;
  }

  function gravidaOf(patient, visit) {
    var raw = (patient && (patient.gravida_value || patient.gravida)) || (visit && (visit.gravida_value || visit.gravida));
    var number = parseInt(raw, 10);
    return isNaN(number) ? null : number;
  }

  function gestationalWeeks(record) {
    var raw = record.gestationalAge || record.gestational_age || record.manualGestationalAge || record.gestationalWeek;
    var number = parseFloat(raw);
    return isNaN(number) ? null : number;
  }

  function visitNumberOf(data) {
    var number = parseInt(data && (data.visitNumber || data.visit_number), 10);
    return isNaN(number) ? null : number;
  }

  function visitDateOf(data) {
    return text(data && (data.visitDate || data.visit_date)).slice(0, 10);
  }

  function findDuplicateVisit(visits, visitNumber, visitDate, ignoreId) {
    var match = null;
    var numberTaken = null;
    (visits || []).forEach(function (visit) {
      if (!visit || visit.id === ignoreId) return;
      var data = visit.data || visit;
      if (visitNumberOf(data) !== visitNumber) return;
      if (visitDateOf(data) === visitDate) match = visit;
      else if (!numberTaken) numberTaken = visit;
    });
    if (match) return { type: 'match', id: match.id };
    if (numberTaken) return { type: 'number-taken', id: numberTaken.id };
    return null;
  }

  function historicalVisitId(moduleName, visitNumber, visitDate) {
    return 'bf_' + moduleName + '_v' + visitNumber + '_' + text(visitDate).replace(/[^0-9]/g, '');
  }

  function isOwnedMother(patient, uid) {
    if (!patient || !uid) return false;
    if (patient.patient_type === 'baby') return false;
    return patient.created_by === uid || patient.createdBy === uid;
  }

  function riskFactorsOf(record) {
    var factors = record.risk_factors || record.riskFactors || [];
    return Array.isArray(factors) ? factors.map(text) : [];
  }

  function hasOtherRisk(record) {
    return riskFactorsOf(record).indexOf('Other Medical Conditions') >= 0;
  }

  function flagOn(record, key) {
    var value = record[key];
    return value === true || value === 'yes' || value === 'Yes' || value === 1;
  }

  var MEDICATION_FIELDS = [
    ['ironFolicAcid', 'Iron and folic acid', 'သံဓာတ်နှင့် ဖောလစ်အက်ဆစ်'],
    ['micronutrientsTablet', 'Micronutrient tablets', 'အဏုအာဟာရဆေးပြား'],
    ['vitaminB1', 'Vitamin B1', 'ဘီဝမ်း'],
    ['deworming', 'Deworming', 'သန်ချဆေးပြား']
  ].map(function (item) {
    return {
      key: item[0], path: [item[0]], type: 'select', required: true, section: 'medication',
      labelEn: item[1], labelMm: item[2], options: medicationOptions(), normalize: normalizeMedication
    };
  });

  function ancFields(patient) {
    return [
      { key: 'visitDate', path: ['visitDate'], aliases: [['visit_date']], type: 'date', required: true, section: 'visit', labelEn: 'Visit date', labelMm: 'လာရောက်ပြသသည့် ရက်စွဲ', sync: function (value) { return { visit_date: value }; } },
      { key: 'previousObstetricHistory', path: ['previousObstetricHistory'], type: 'obstetric', section: 'history', labelEn: 'Previous pregnancies', labelMm: 'ယခင်ကိုယ်ဝန်များ', required: gravidaOf(patient) >= 2 },
      { key: 'lastPregnancyOutcome', path: ['lastPregnancyOutcome'], type: 'select', section: 'history', labelEn: 'Last pregnancy outcome', labelMm: 'နောက်ဆုံးကိုယ်ဝန် အခြေအနေ', required: gravidaOf(patient) >= 2, options: [choice('Alive', 'Alive', 'မွေး'), choice('Death', 'Death', 'သေ'), choice('Miscarriage', 'Miscarriage', 'ပျက်')] },
      { key: 'goiterStatus', path: ['goiterStatus'], type: 'select', required: true, section: 'exam', labelEn: 'Goiter', labelMm: 'လည်ပင်းကြီးရောဂါ ရှိ/မရှိ', options: yesNoUnknown() },
      { key: 'tbSymptoms', path: ['tbSymptoms'], type: 'select', required: true, section: 'exam', labelEn: 'Tuberculosis', labelMm: 'တီဘီရောဂါ ရှိ/မရှိ', options: yesNo() },
      { key: 'weight', path: ['weight'], type: 'number', required: true, section: 'exam', min: 20, max: 200, step: '0.1', labelEn: 'Weight (kg)', labelMm: 'ကိုယ်အလေးချိန် (ကီလိုဂရမ်)' },
      { key: 'systolicBP', path: ['systolicBP'], type: 'number', required: true, section: 'exam', min: 50, max: 300, step: '1', labelEn: 'Systolic BP', labelMm: 'သွေးပေါင် အပေါ်' },
      { key: 'diastolicBP', path: ['diastolicBP'], type: 'number', required: true, section: 'exam', min: 20, max: 200, step: '1', labelEn: 'Diastolic BP', labelMm: 'သွေးပေါင် အောက်' },
      { key: 'pulseRate', path: ['pulseRate'], type: 'number', required: true, section: 'exam', min: 20, max: 250, step: '1', labelEn: 'Pulse', labelMm: 'သွေးခုန်နှုန်း' },
      { key: 'temperature', path: ['temperature'], type: 'number', required: true, section: 'exam', min: 30, max: 45, step: '0.1', labelEn: 'Temperature (°C)', labelMm: 'ကိုယ်အပူချိန်' },
      { key: 'urineProtein', path: ['urineProtein'], type: 'select', required: true, section: 'exam', labelEn: 'Urine protein', labelMm: 'ဆီးပရိုတင်း', options: urineOptions() },
      { key: 'urineSugar', path: ['urineSugar'], type: 'select', required: true, section: 'exam', labelEn: 'Urine glucose', labelMm: 'ဆီးဂလူးကို့စ်', options: urineOptions() },
      { key: 'anemiaStatus', path: ['anemiaStatus'], type: 'select', required: true, section: 'exam', labelEn: 'Anemia', labelMm: 'သွေးအားနည်းခြင်း', options: assessedOptions() },
      { key: 'pittingEdema', path: ['pittingEdema'], type: 'select', required: true, section: 'exam', labelEn: 'Leg edema', labelMm: 'ခြေဖောယောင်ခြင်း', options: assessedOptions() },
      { key: 'fundalHeight', path: ['fundalHeight'], type: 'number', section: 'exam', min: 5, max: 50, step: '0.1', labelEn: 'Fundal height (cm)', labelMm: 'သားအိမ်အမြင့်', required: true, when: function (record) { var weeks = gestationalWeeks(record); return weeks == null || weeks >= 12; } },
      { key: 'fetalHeartRate', path: ['fetalHeartRate'], type: 'number', section: 'exam', min: 60, max: 220, step: '1', labelEn: 'Fetal heart rate', labelMm: 'သားအိမ်တွင်း နှလုံးခုန်နှုန်း', when: function (record) { var weeks = gestationalWeeks(record); return weeks != null && weeks >= 20; }, required: true },
      { key: 'fetalMovement', path: ['fetalMovement'], type: 'select', section: 'exam', labelEn: 'Fetal movement', labelMm: 'ကလေးလှုပ်ရှားမှု', options: [choice('Yes', 'Yes', 'ရှိ'), choice('No', 'No', 'မရှိ'), choice('Not assessed', 'Not assessed', 'မစစ်ဆေး')], when: function (record) { var weeks = gestationalWeeks(record); return weeks != null && weeks >= 20; }, required: true },
      { key: 'fetalLie', path: ['fetalLie'], type: 'text', section: 'exam', labelEn: 'Fetal lie', labelMm: 'ကလေးအနေအထား', when: function (record) { var weeks = gestationalWeeks(record); return weeks != null && weeks >= 36; }, required: true },
      { key: 'fetalPresentation', path: ['fetalPresentation'], type: 'text', section: 'exam', labelEn: 'Fetal presentation', labelMm: 'ကလေးဦးတည်ရာ', when: function (record) { var weeks = gestationalWeeks(record); return weeks != null && weeks >= 36; }, required: true }
    ].concat(MEDICATION_FIELDS).concat([
      { key: 'tetanusToxoid', path: ['tetanusToxoid'], aliases: [['td']], type: 'select', required: true, section: 'medication', labelEn: 'Tetanus diphtheria', labelMm: 'မေးခိုင်၊ ဆုံဆို့နာကာကယ်ဆေး', options: [choice('TD1', 'TD1', 'TD1'), choice('TD2', 'TD2', 'TD2'), choice('not_given', 'Not Given', 'မထိုးရသေး'), choice('Completed', 'Completed', 'ပြီးမြောက်ပြီ')], normalize: normalizeTd, sync: function (value) { return { td: value }; } },
      { key: 'otherMedicalConditionName', path: ['otherMedicalConditionName'], aliases: [['other_medical_condition_name']], type: 'text', section: 'diagnosis', labelEn: 'Other medical condition', labelMm: 'အခြားကျန်းမာရေးပြဿနာ', when: hasOtherRisk, required: true, sync: function (value) { return { other_medical_condition_name: value }; } },
      { key: 'provisionalDiagnosisType', path: ['provisionalDiagnosisType'], aliases: [['provisionalDiagnosis']], type: 'select', required: true, section: 'diagnosis', labelEn: 'Provisional diagnosis', labelMm: 'ယာယီရောဂါသတ်မှတ်ချက်', options: [choice('Routine ANC', 'Routine ANC', 'ပုံမှန် ANC'), choice('Abortion', 'Abortion', 'သားပျက်'), choice('Other', 'Other', 'အခြား')] },
      { key: 'provisionalDiagnosisOther', path: ['provisionalDiagnosisOther'], type: 'text', section: 'diagnosis', labelEn: 'Other diagnosis', labelMm: 'အခြားရောဂါအမည်', when: function (record) { return text(record.provisionalDiagnosisType || record.provisionalDiagnosis) === 'Other'; }, required: true },
      { key: 'nextVisitDate', path: ['nextVisitDate'], type: 'date', required: true, section: 'diagnosis', labelEn: 'Next visit date', labelMm: 'နောက်တစ်ကြိမ်ပြသမည့်ရက်' },
      { key: 'initial', path: ['initial'], type: 'text', required: true, section: 'diagnosis', labelEn: 'Initials', labelMm: 'လက်မှတ်အတိုကောက်' }
    ]);
  }

  function registrationFields(patient) {
    return [
      { key: 'name', path: ['name'], type: 'text', required: true, section: 'registration', labelEn: 'Name', labelMm: 'အမည်' },
      { key: 'age', path: ['age'], type: 'number', required: true, section: 'registration', min: 10, max: 60, step: '1', labelEn: 'Age', labelMm: 'အသက်' },
      { key: 'phone', path: ['phone'], aliases: [['phone_number'], ['phoneNumber']], type: 'text', required: true, section: 'registration', labelEn: 'Phone', labelMm: 'ဖုန်းနံပါတ်' },
      { key: 'registration_date', path: ['registration_date'], aliases: [['registrationDate']], type: 'date', required: true, section: 'registration', labelEn: 'Registration date', labelMm: 'မှတ်ပုံတင်သည့်နေ့', sync: function (value) { return { registrationDate: value }; } },
      { key: 'youngestChildAge', path: ['youngest_child_age_years'], type: 'age', section: 'registration', labelEn: 'Youngest child age', labelMm: 'အငယ်ဆုံးကလေး အသက်', required: gravidaOf(patient) >= 2 }
    ];
  }

  function deliveryFieldDefs() {
    return [
      { key: 'oxytocinGiven', path: ['thirdStage', 'oxytocinGiven'], aliases: [['oxytocinGiven']], type: 'boolean', required: true, section: 'third', labelEn: 'Oxytocin within one minute', labelMm: 'Oxytocin ၁၀ ယူနစ် ထိုးခြင်း' },
      { key: 'controlledCordTraction', path: ['thirdStage', 'controlledCordTraction'], aliases: [['controlledCordTraction']], type: 'boolean', required: true, section: 'third', labelEn: 'Controlled cord traction', labelMm: 'ချက်ကြိုးဆွဲ၍ အချင်းချခြင်း' },
      { key: 'gestationalWeek', path: ['deliveryDetails', 'gestationalWeek'], aliases: [['gestationalWeek'], ['gestational_week']], type: 'number', required: true, section: 'delivery', min: 1, max: 45, step: '1', labelEn: 'Gestational week', labelMm: 'ကိုယ်ဝန်ပတ်' },
      { key: 'birthProvider', path: ['deliveryDetails', 'birthProvider'], aliases: [['birthProvider'], ['birth_provider']], type: 'select', required: true, section: 'delivery', labelEn: 'Birth provider', labelMm: 'မွေးဖွားပေးသူ', normalize: normalizeBirthProvider, options: [choice('self', 'Self', 'ကိုယ်တိုင်'), choice('skilled_birth_attendant', 'Skilled birth attendant', 'ကျွမ်းကျင်မွေးဖွားသူ'), choice('amw', 'AMW', 'အရံသားဖွား'), choice('tba', 'TBA', 'အရပ်လက်သည်'), choice('other', 'Other', 'အခြား')] },
      { key: 'modeOfDelivery', path: ['deliveryDetails', 'modeOfDelivery'], aliases: [['deliveryDetails', 'mode_of_delivery'], ['modeOfDelivery'], ['mode_of_delivery']], type: 'select', required: true, section: 'delivery', labelEn: 'Mode of delivery', labelMm: 'မွေးဖွားနည်း', normalize: normalizeDeliveryMode, options: [choice('normal', 'Normal vaginal', 'ရိုးရိုးမွေး'), choice('assisted', 'Assisted', 'ကူညီမွေး'), choice('elective_c_section', 'Elective C-section', 'စီစဉ်ထားသောဗိုက်ခွဲ'), choice('emergency_c_section', 'Emergency C-section', 'အရေးပေါ်ဗိုက်ခွဲ')] },
      { key: 'birthPlace', path: ['deliveryDetails', 'birthPlace'], aliases: [['deliveryDetails', 'birthplace'], ['birthPlace'], ['birthplace']], type: 'select', required: true, section: 'delivery', labelEn: 'Birth place', labelMm: 'မွေးဖွားရာနေရာ', normalize: normalizeBirthPlace, options: [choice('government_hospital', 'Government hospital', 'အစိုးရဆေးရုံ'), choice('health_facility_subfacility', 'RHC/SRHC', 'ကျန်းမာရေးဌာန/ဌာနခွဲ'), choice('private_facility', 'Private facility', 'ပုဂ္ဂလိက'), choice('home', 'Home', 'အိမ်မွေး'), choice('other', 'Other', 'အခြား')] },
      { key: 'maternalCondition', path: ['deliveryDetails', 'maternalCondition'], aliases: [['deliveryDetails', 'maternal_condition'], ['maternalCondition'], ['maternal_condition']], type: 'select', required: true, section: 'delivery', labelEn: 'Maternal condition', labelMm: 'မိခင်အခြေအနေ', options: [choice('alive', 'Alive', 'အသက်ရှင်'), choice('dead', 'Dead', 'သေဆုံး')] },
      { key: 'pregnancyType', path: ['deliveryDetails', 'pregnancyType'], aliases: [['pregnancyType'], ['pregnancy_type']], type: 'select', required: true, section: 'delivery', labelEn: 'Pregnancy type', labelMm: 'ကိုယ်ဝန်အမျိုးအစား', options: [choice('single', 'Single', 'တစ်ဦး'), choice('twins', 'Twins', 'အမွှာ')] },
      { key: 'babies', path: ['deliveryDetails', 'babies'], aliases: [['babies']], type: 'babies', required: true, section: 'baby', labelEn: 'Newborn details', labelMm: 'မွေးကင်းစအချက်အလက်' }
    ];
  }

  function babiesOf(record) {
    var details = record.deliveryDetails || {};
    if (Array.isArray(details.babies) && details.babies.length) return details.babies;
    if (Array.isArray(record.babies) && record.babies.length) return record.babies;
    return [];
  }

  function babyGaps(babies, recordKey, twins) {
    var gaps = [];
    var rows = babies.slice();
    if (!rows.length) rows = [{}];
    if (twins && rows.length < 2) rows.push({});
    rows.forEach(function (baby, index) {
      var prefix = recordKey + ':baby' + (index + 1);
      [
        ['babyName', 'Baby name', 'ကလေးအမည်', 'text'],
        ['gender', 'Sex', 'ကျား/မ', 'select'],
        ['outcome', 'Outcome', 'ရလဒ်', 'select'],
        ['birthWeightGram', 'Birth weight (kg)', 'မွေးကင်းစကိုယ်အလေးချိန်', 'weight'],
        ['birthTime', 'Birth time', 'မွေးချိန်', 'datetime'],
        ['anusPresent', 'Anus present', 'စအိုပေါက် ရှိ/မရှိ', 'select']
      ].forEach(function (item) {
        var missing = item[0] === 'birthWeightGram' ? baby.birthWeightGram == null || baby.birthWeightGram === '' : text(baby[item[0]]) === '';
        if (!missing && item[0] === 'outcome' && (baby.outcome === 'death' || baby.outcome === 'stillbirth') && text(baby.causeOfDeath || baby.cause_of_death) === '') {
          gaps.push({ id: prefix + ':causeOfDeath', field: 'babies', babyIndex: index, babyField: 'causeOfDeath', labelEn: 'Cause of death', labelMm: 'သေဆုံးရသည့်အကြောင်း', section: 'baby', kind: 'missing', counts: true, currentValue: '', legacyValue: '', proposedValue: '', editor: { type: 'text', options: null } });
        }
        if (!missing) return;
        gaps.push({
          id: prefix + ':' + item[0], field: 'babies', babyIndex: index, babyField: item[0],
          labelEn: 'Baby ' + (index + 1) + ' ' + item[1], labelMm: 'ကလေး ' + (index + 1) + ' ' + item[2],
          section: 'baby', kind: 'missing', counts: true, currentValue: '', legacyValue: '', proposedValue: '',
          editor: { type: item[3], options: item[3] === 'select' ? babyOptions(item[0]) : null, min: item[3] === 'weight' ? 0.3 : null, max: item[3] === 'weight' ? 7 : null, step: item[3] === 'weight' ? '0.001' : null }
        });
      });
    });
    return gaps;
  }

  function babyOptions(fieldName) {
    if (fieldName === 'gender') return [choice('male', 'Male', 'ကျား'), choice('female', 'Female', 'မ')];
    if (fieldName === 'outcome') return [choice('alive', 'Alive', 'ရှင်'), choice('death', 'Death', 'သေ'), choice('stillbirth', 'Stillbirth', 'သေမွေး')];
    if (fieldName === 'anusPresent') return [choice('yes', 'Yes', 'ရှိ'), choice('no', 'No', 'မရှိ')];
    return null;
  }

  function pncFields() {
    return [
      { key: 'visitDate', path: ['visitDate'], aliases: [['visit_date']], type: 'date', required: true, section: 'visit', labelEn: 'PNC visit date', labelMm: 'PNC ပြသသည့်ရက်', sync: function (value) { return { visit_date: value }; } },
      { key: 'maternalOutcome', path: ['maternalOutcome'], type: 'select', required: true, section: 'visit', labelEn: 'Maternal outcome', labelMm: 'မိခင်ရလဒ်', options: [choice('alive', 'Alive', 'အသက်ရှင်'), choice('dead', 'Dead', 'သေဆုံး')] },
      { key: 'birthPlace', path: ['birthplace'], aliases: [['birthPlace']], type: 'select', required: false, section: 'visit', labelEn: 'Birth place', labelMm: 'မွေးဖွားရာနေရာ', normalize: normalizeBirthPlace, options: deliveryFieldDefs()[5].options, sync: function (value) { return { birthPlace: value }; } },
      { key: 'modeOfDelivery', path: ['mode_of_delivery'], aliases: [['modeOfDelivery']], type: 'select', required: false, section: 'visit', labelEn: 'Mode of delivery', labelMm: 'မွေးဖွားနည်း', normalize: normalizeDeliveryMode, options: deliveryFieldDefs()[4].options, sync: function (value) { return { modeOfDelivery: value }; } }
    ];
  }

  function immediateFields() {
    return [
      { key: 'breathing_status', path: ['breathing_status'], type: 'select', required: true, section: 'immediate', labelEn: 'Breathing status', labelMm: 'အသက်ရှူမှုအခြေအနေ', options: [choice('spontaneous', 'Spontaneous breathing', 'အသက်ရှူသည်'), choice('gasping_or_no_breathing', 'Gasping or not breathing', 'အသက်မရှူ / မောနေသည်')] },
      { key: 'tactile_stimulation', path: ['tactile_stimulation'], type: 'boolean', section: 'immediate', labelEn: 'Tactile stimulation', labelMm: 'အသက်ရှူစေရန် နှိုးဆွခြင်း', when: function (record) { return breathingOf(record) === 'gasping_or_no_breathing'; }, required: true },
      { key: 'bag_and_mask', path: ['bag_and_mask'], type: 'boolean', section: 'immediate', labelEn: 'Bag and mask', labelMm: 'လေအိတ်နှင့် မျက်နှာဖုံး', when: function (record) { return breathingOf(record) === 'gasping_or_no_breathing'; }, required: true },
      { key: 'resuscitation_outcome', path: ['resuscitation_outcome'], type: 'select', section: 'immediate', labelEn: 'Baby condition after resuscitation', labelMm: 'ကလေးအခြေအနေ', options: [choice('alive', 'Alive', 'အရှင်'), choice('death', 'Death', 'အသေ'), choice('referred', 'Referred', 'လွှဲပြောင်း')], when: function (record) { return breathingOf(record) === 'gasping_or_no_breathing'; }, required: true }
    ];
  }

  function breathingOf(record) {
    if (text(record.breathing_status)) return text(record.breathing_status);
    if (flagOn(record, 'gasping_or_no_breathing')) return 'gasping_or_no_breathing';
    if (flagOn(record, 'spontaneous_breathing')) return 'spontaneous';
    return '';
  }

  function newbornFields(record) {
    var followUp = visitNumberOf(record) > 1;
    return [
      { key: 'visitDate', path: ['visitDate'], aliases: [['visit_date']], type: 'date', required: true, section: 'visit', labelEn: 'Visit date', labelMm: 'ပြသသည့်ရက်', sync: function (value) { return { visit_date: value }; } },
      { key: 'gender', path: ['gender'], type: 'select', required: true, section: 'exam', labelEn: 'Sex', labelMm: 'ကျား/မ', options: [choice('male', 'Male', 'ကျား'), choice('female', 'Female', 'မ')] },
      { key: 'birth_length_cm', path: ['birth_length_cm'], type: 'number', required: true, section: 'exam', min: 20, max: 70, step: '0.1', labelEn: 'Birth length (cm)', labelMm: 'မွေးကင်းစ ကိုယ်အရပ်အမြင့်' },
      { key: 'head_circumference_cm', path: ['head_circumference_cm'], type: 'number', required: true, section: 'exam', min: 20, max: 50, step: '0.1', labelEn: 'Head circumference (cm)', labelMm: 'ဦးခေါင်းပတ်လည်' },
      { key: 'current_weight_gram', path: ['current_weight_gram'], type: 'weight', required: followUp, section: 'exam', min: 0.3, max: 10, step: '0.001', labelEn: 'Current weight (kg)', labelMm: 'ယခုအကြိမ် ကိုယ်အလေးချိန်' },
      { key: 'temperature', path: ['temperature'], type: 'number', required: true, section: 'exam', min: 30, max: 42, step: '0.1', labelEn: 'Temperature (°C)', labelMm: 'ကိုယ်အပူချိန်' },
      { key: 'heart_rate', path: ['heart_rate'], type: 'number', required: true, section: 'exam', min: 40, max: 250, step: '1', labelEn: 'Heart rate', labelMm: 'နှလုံးခုန်နှုန်း' },
      { key: 'respiration_rate', path: ['respiration_rate'], type: 'number', required: true, section: 'exam', min: 10, max: 120, step: '1', labelEn: 'Respiration rate', labelMm: 'အသက်ရှူနှုန်း' },
      { key: 'difficult_breathing', path: ['difficult_breathing'], type: 'select', required: true, section: 'exam', labelEn: 'Difficult breathing', labelMm: 'အသက်ရှူရန်ခက်ခဲခြင်း', options: [choice('yes', 'Yes', 'ရှိ'), choice('no', 'No', 'မရှိ')] },
      { key: 'eye_infection_status', path: ['eye_infection_status'], type: 'select', required: true, section: 'exam', labelEn: 'Eye infection', labelMm: 'မျက်စိပိုးဝင်ခြင်း', options: [choice('nad', 'NAD', 'NAD'), choice('ad', 'AD', 'AD')] },
      { key: 'eye_care_status', path: ['eye_care_status'], type: 'select', required: true, section: 'exam', labelEn: 'Eye care', labelMm: 'မျက်စိစောင့်ရှောက်မှု', options: [choice('clean_and_dry', 'Clean and dry', 'ခြောက်သွေ့သန့်ရှင်း'), choice('discharge_present', 'Discharge present', 'အရည်ထွက်နေသည်')] },
      { key: 'cord_care', path: ['cord_care'], type: 'select', required: true, section: 'exam', labelEn: 'Cord care', labelMm: 'ချက်တိုင်စောင့်ရှောက်မှု', options: [choice('yes', 'Yes', 'ရှိ'), choice('no', 'No', 'မရှိ')] },
      { key: 'feeding_type', path: ['feeding_type'], type: 'select', required: true, section: 'exam', labelEn: 'Feeding type', labelMm: 'နို့တိုက်ကျွေးမှု အမျိုးအစား', options: [choice('Breastfeeding', 'Breastfeeding', 'မိခင်နို့'), choice('Formula', 'Formula', 'နို့မှုန့်'), choice('Mixed', 'Mixed', 'ရောနှော')] },
      { key: 'feeding_method', path: ['feeding_method'], type: 'select', required: true, section: 'exam', labelEn: 'Feeding method', labelMm: 'နို့တိုက်ကျွေးသည့်နည်း', options: [choice('Breastfeeding', 'Breastfeeding', 'မိခင်နို့'), choice('Bottle', 'Bottle', 'ပုလင်း'), choice('Cup/Spoon', 'Cup/Spoon', 'ခွက်/ဇွန်း'), choice('Nasal Tube', 'Nasal Tube', 'Nasal Tube'), choice('Mixed', 'Mixed', 'ရောနှော')] },
      { key: 'baby_outcome', path: ['baby_outcome'], aliases: [['outcome']], type: 'select', required: true, section: 'outcome', labelEn: 'Outcome', labelMm: 'ရလဒ်', normalize: normalizeOutcome, options: [choice('alive', 'Alive', 'အသက်ရှင်'), choice('death', 'Death', 'သေဆုံး')], sync: function (value) { return { outcome: value === 'death' ? 'dead' : value }; } },
      { key: 'anatomy_abnormality_details', path: ['anatomy_abnormality_details'], type: 'text', section: 'exam', labelEn: 'Anatomy abnormality details', labelMm: 'ခန္ဓာကိုယ်ပုံမမှန်မှု အသေးစိတ်', when: function (item) { return flagOn(item, 'anatomy_abnormalities'); }, required: true }
    ];
  }

  function recordShell(moduleName, labels, recordId, labelEn, labelMm) {
    return {
      key: moduleName + ':' + (recordId || 'new'),
      module: moduleName,
      recordId: recordId || null,
      create: !recordId,
      labelEn: labelEn,
      labelMm: labelMm,
      moduleLabelEn: labels.en,
      moduleLabelMm: labels.mm,
      gaps: [],
      optional: []
    };
  }

  function moduleShell(id, en, mm, canAdd) {
    return { id: id, labelEn: en, labelMm: mm, canAdd: !!canAdd, records: [] };
  }

  function pushRecord(mod, record) {
    if (record.gaps.length || record.optional.length) mod.records.push(record);
  }

  function otherVisitEditor() {
    return {
      id: 'otherVisits', field: 'otherVisits', kind: 'optional', counts: false, section: 'optional',
      labelEn: 'Other-facility visits', labelMm: 'အခြားဌာနတွင် ပြသခဲ့သောအကြိမ်များ',
      currentValue: '', legacyValue: '', proposedValue: '',
      editor: { type: 'other-visits', options: [choice('Public', 'Public', 'အစိုးရ'), choice('Private', 'Private', 'ပုဂ္ဂလိက')] }
    };
  }

  function contextOf(bundle) {
    var patient = bundle.patient || {};
    var delivery = bundle.delivery && bundle.delivery.data;
    var pnc = bundle.pncVisits || [];
    var newborn = bundle.newbornVisits || [];
    var immediate = bundle.immediateRecords || [];
    var provider = '';
    if (delivery) provider = normalizeBirthProvider(getPath(delivery, ['deliveryDetails', 'birthProvider']) || delivery.birthProvider || delivery.birth_provider);
    return {
      hasDelivery: !!delivery,
      hasPnc: pnc.length > 0,
      hasNewborn: newborn.length > 0,
      hasImmediate: immediate.length > 0,
      birthProvider: provider,
      maternalDead: delivery && text(getPath(delivery, ['deliveryDetails', 'maternalCondition']) || delivery.maternalCondition) === 'dead',
      gravida: gravidaOf(patient)
    };
  }

  function needsDelivery(ctx) {
    return ctx.hasPnc || ctx.hasNewborn || ctx.hasImmediate;
  }

  function scanPatient(bundle) {
    bundle = bundle || {};
    var patient = bundle.patient || {};
    var ctx = contextOf(bundle);
    var modules = [];

    var registration = moduleShell('registration', 'Registration', 'လူနာမှတ်ပုံတင်ခြင်း', false);
    var registrationRecord = recordShell('registration', { en: 'Registration', mm: 'လူနာမှတ်ပုံတင်ခြင်း' }, patient.id, 'Patient profile', 'လူနာအချက်အလက်');
    registrationRecord.create = false;
    registrationFields(patient).forEach(function (field) {
      if (field.key === 'youngestChildAge') {
        if (gravidaOf(patient) < 2) return;
        var years = patient.youngest_child_age_years;
        var months = patient.youngest_child_age_months;
        var blankYears = years == null || years === '';
        var blankMonths = months == null || months === '';
        if (blankYears && blankMonths) {
          registrationRecord.gaps.push(gapFromField(registrationRecord.key, field, { status: 'missing', current: '', legacy: '', proposed: '' }));
        }
        return;
      }
      if (field.when && !field.when(patient)) return;
      var reading = readField(patient, field);
      if (reading.status !== 'ok') registrationRecord.gaps.push(gapFromField(registrationRecord.key, field, reading));
    });
    pushRecord(registration, registrationRecord);
    modules.push(registration);

    var anc = moduleShell('anc', 'Antenatal care', 'ကိုယ်ဝန်ဆောင်စောင့်ရှောက်မှု', (bundle.ancVisits || []).length > 0);
    if (!(bundle.ancVisits || []).length) {
      var absentAnc = recordShell('anc', anc, null, 'Add historical ANC visit', 'ANC ပြသမှု ပြန်ဖြည့်ရန်');
      absentAnc.gaps.push(groupGap(absentAnc, ancFields(patient)));
      anc.records.push(absentAnc);
      anc.canAdd = false;
    } else {
      bundle.ancVisits.forEach(function (visit) {
        var data = visit.data || {};
        var record = recordShell('anc', anc, visit.id, 'ANC visit ' + (visitNumberOf(data) || '?') + (visitDateOf(data) ? ' · ' + visitDateOf(data) : ''), 'ANC အကြိမ် ' + (visitNumberOf(data) || '?'));
        record.gaps = evaluateFields(data, ancFields(patient).map(function (field) {
          if (field.key === 'previousObstetricHistory' || field.key === 'lastPregnancyOutcome') {
            var copy = Object.assign({}, field, { required: gravidaOf(patient, data) >= 2 });
            return copy;
          }
          return field;
        }), record.key);
        record.optional.push(otherVisitEditor());
        pushRecord(anc, record);
      });
    }
    modules.push(anc);

    var tests = moduleShell('test', 'Lab tests', 'ဓာတ်ခွဲစစ်ဆေးမှု', true);
    (bundle.testRecords || []).forEach(function (test) {
      var data = test.data || {};
      if (visitDateOf({ visitDate: data.testDate })) return;
      var record = recordShell('test', tests, test.id, 'Lab test', 'ဓာတ်ခွဲမှတ်တမ်း');
      record.gaps.push(gapFromField(record.key, { key: 'testDate', path: ['testDate'], type: 'date', labelEn: 'Test date', labelMm: 'စစ်ဆေးသည့်ရက်', section: 'test' }, { status: 'missing', current: '', legacy: '', proposed: '' }));
      pushRecord(tests, record);
    });
    modules.push(tests);

    var deliveryModule = moduleShell('delivery', 'Delivery Notes', 'မွေးဖွားခြင်းမှတ်တမ်း', false);
    if (!bundle.delivery || !bundle.delivery.data) {
      if (needsDelivery(ctx)) {
        var absentDelivery = recordShell('delivery', deliveryModule, null, 'Add Delivery Notes', 'မွေးဖွားခြင်းမှတ်တမ်း ဖြည့်ရန်');
        absentDelivery.gaps.push(groupGap(absentDelivery, deliveryFieldDefs()));
        deliveryModule.records.push(absentDelivery);
      }
    } else {
      var deliveryData = bundle.delivery.data;
      var deliveryRecord = recordShell('delivery', deliveryModule, bundle.delivery.id, 'Delivery Notes', 'မွေးဖွားခြင်းမှတ်တမ်း');
      deliveryRecord.create = false;
      deliveryRecord.canonical = bundle.delivery.canonical === true;
      deliveryFieldDefs().forEach(function (field) {
        if (field.key === 'babies') {
          var twins = text(getPath(deliveryData, ['deliveryDetails', 'pregnancyType']) || deliveryData.pregnancyType) === 'twins';
          babyGaps(babiesOf(deliveryData), deliveryRecord.key, twins).forEach(function (gap) { deliveryRecord.gaps.push(gap); });
          return;
        }
        var reading = readField(deliveryData, field);
        if (reading.status !== 'ok') deliveryRecord.gaps.push(gapFromField(deliveryRecord.key, field, reading));
      });
      pushRecord(deliveryModule, deliveryRecord);
    }
    modules.push(deliveryModule);

    var pnc = moduleShell('pnc', 'Postnatal care', 'မွေးပြီးမိခင်စောင့်ရှောက်မှု', (bundle.pncVisits || []).length > 0 && (bundle.pncVisits || []).length < 4);
    if (!(bundle.pncVisits || []).length && ctx.hasDelivery && !ctx.maternalDead) {
      var absentPnc = recordShell('pnc', pnc, null, 'Add historical PNC visit', 'PNC ပြသမှု ပြန်ဖြည့်ရန်');
      absentPnc.gaps.push(groupGap(absentPnc, pncFields().filter(function (field) { return field.required; })));
      absentPnc.optional.push(otherVisitEditor());
      pnc.records.push(absentPnc);
      pnc.canAdd = false;
    } else {
      (bundle.pncVisits || []).forEach(function (visit) {
        var data = visit.data || {};
        var record = recordShell('pnc', pnc, visit.id, 'PNC visit ' + (visitNumberOf(data) || '?'), 'PNC အကြိမ် ' + (visitNumberOf(data) || '?'));
        record.gaps = evaluateFields(data, pncFields(), record.key);
        record.optional.push(otherVisitEditor());
        pushRecord(pnc, record);
      });
    }
    modules.push(pnc);

    var immediate = moduleShell('immediate', 'Immediate newborn care', 'မွေးပြီးပြီးချင်းကလေးစောင့်ရှောက်မှု', false);
    if (!(bundle.immediateRecords || []).length && ctx.birthProvider === 'self') {
      var absentImmediate = recordShell('immediate', immediate, null, 'Add immediate newborn care', 'မွေးပြီးပြီးချင်း စောင့်ရှောက်မှု ဖြည့်ရန်');
      absentImmediate.gaps.push(groupGap(absentImmediate, immediateFields().filter(function (field) { return field.required && field.key === 'breathing_status'; })));
      immediate.records.push(absentImmediate);
    } else {
      (bundle.immediateRecords || []).forEach(function (item) {
        var data = Object.assign({}, item.data || {});
        if (!data.breathing_status) data.breathing_status = breathingOf(data);
        var record = recordShell('immediate', immediate, item.id, 'Immediate newborn care', 'မွေးပြီးပြီးချင်း စောင့်ရှောက်မှု');
        record.patientId = item.patientId || patient.id;
        record.gaps = evaluateFields(data, immediateFields(), record.key);
        pushRecord(immediate, record);
      });
    }
    modules.push(immediate);

    var newborn = moduleShell('newborn', 'Newborn care', 'မွေးကင်းစကလေးစောင့်ရှောက်မှု', (bundle.newbornVisits || []).length > 0 && (bundle.newbornVisits || []).length < 4);
    if (!(bundle.newbornVisits || []).length && (ctx.hasDelivery || ctx.hasPnc)) {
      var absentNewborn = recordShell('newborn', newborn, null, 'Add historical newborn visit', 'မွေးကင်းစပြသမှု ပြန်ဖြည့်ရန်');
      absentNewborn.gaps.push(groupGap(absentNewborn, newbornFields({ visit_number: 1 })));
      absentNewborn.optional.push(otherVisitEditor());
      newborn.records.push(absentNewborn);
      newborn.canAdd = false;
    } else {
      (bundle.newbornVisits || []).forEach(function (visit) {
        var data = visit.data || {};
        var record = recordShell('newborn', newborn, visit.id, 'Newborn visit ' + (visitNumberOf(data) || '?'), 'မွေးကင်းစ အကြိမ် ' + (visitNumberOf(data) || '?'));
        record.gaps = evaluateFields(data, newbornFields(data), record.key);
        record.optional.push(otherVisitEditor());
        pushRecord(newborn, record);
      });
    }
    modules.push(newborn);

    var gapCount = 0;
    var conflictCount = 0;
    modules.forEach(function (mod) {
      mod.records.forEach(function (record) {
        record.gaps.forEach(function (gap) {
          if (gap.counts === false) return;
          gapCount += 1;
          if (gap.kind === 'conflict') conflictCount += 1;
        });
      });
    });

    return {
      patientId: patient.id || '',
      patientName: patient.name || '',
      age: patient.age == null ? '' : patient.age,
      gapCount: gapCount,
      conflictCount: conflictCount,
      truncated: !!bundle.truncated,
      modules: modules
    };
  }

  function groupGap(record, fields) {
    return {
      id: record.key + ':create',
      field: '*',
      labelEn: record.labelEn,
      labelMm: record.labelMm,
      section: 'create',
      kind: 'absent',
      counts: true,
      currentValue: '',
      legacyValue: '',
      proposedValue: '',
      editor: {
        type: 'group',
        fields: fields.filter(function (field) {
          if (field.when && !field.when({})) return false;
          return !!field.required;
        }).map(publicEditorField)
      }
    };
  }

  function publicEditorField(field) {
    return {
      key: field.key,
      labelEn: field.labelEn,
      labelMm: field.labelMm,
      section: field.section || 'details',
      required: field.required === true,
      editor: { type: field.type, options: field.options || null, min: field.min == null ? null : field.min, max: field.max == null ? null : field.max, step: field.step || null }
    };
  }

  function createTemplate(moduleName, bundle) {
    bundle = bundle || {};
    var patient = bundle.patient || {};
    var visitNumber = 1;
    var fields = [];
    if (moduleName === 'anc') {
      visitNumber = nextNumber(bundle.ancVisits);
      fields = ancFields(patient);
    } else if (moduleName === 'test') {
      fields = [
        { key: 'testDate', labelEn: 'Test date', labelMm: 'စစ်ဆေးသည့်ရက်', section: 'test', type: 'date', required: true },
        { key: 'hivResult', labelEn: 'HIV', labelMm: 'HIV', section: 'test', type: 'text', optional: true },
        { key: 'malariaResult', labelEn: 'Malaria', labelMm: 'ငှက်ဖျား', section: 'test', type: 'text', optional: true },
        { key: 'syphilisResult', labelEn: 'Syphilis', labelMm: 'ဆစ်ဖလစ်', section: 'test', type: 'text', optional: true },
        { key: 'hepatitisBResult', labelEn: 'Hepatitis B', labelMm: 'အသည်းရောင် ဘီ', section: 'test', type: 'text', optional: true },
        { key: 'hepatitisCResult', labelEn: 'Hepatitis C', labelMm: 'အသည်းရောင် စီ', section: 'test', type: 'text', optional: true },
        { key: 'hemoglobinResult', labelEn: 'Hb', labelMm: 'Hb', section: 'test', type: 'number', min: 1, max: 25, step: '0.1', optional: true },
        { key: 'bloodGroup', labelEn: 'Blood group', labelMm: 'သွေးအုပ်စု', section: 'test', type: 'select', optional: true, options: ['A', 'B', 'AB', 'O'].map(function (value) { return choice(value, value, value); }) },
        { key: 'rhFactor', labelEn: 'Rh factor', labelMm: 'Rh', section: 'test', type: 'select', optional: true, options: [choice('Positive', 'Positive', 'Positive'), choice('Negative', 'Negative', 'Negative')] },
        { key: 'ultrasoundServices', labelEn: 'Ultrasound', labelMm: 'အာထရာဆောင်း', section: 'test', type: 'text', optional: true }
      ];
    } else if (moduleName === 'delivery') {
      fields = deliveryFieldDefs();
    } else if (moduleName === 'pnc') {
      visitNumber = nextNumber(bundle.pncVisits);
      fields = pncFields().filter(function (field) { return field.required; });
    } else if (moduleName === 'immediate') {
      fields = immediateFields();
    } else if (moduleName === 'newborn') {
      visitNumber = nextNumber(bundle.newbornVisits);
      fields = newbornFields({ visit_number: visitNumber });
    }
    return {
      module: moduleName,
      create: true,
      recordId: null,
      visitNumber: visitNumber,
      fields: fields.filter(function (field) {
      if (field.when && !field.when({})) return false;
      return field.required === true || field.optional === true;
    }).map(publicEditorField)
    };
  }

  function nextNumber(visits) {
    var max = 0;
    (visits || []).forEach(function (visit) {
      var number = visitNumberOf(visit.data || visit);
      if (number && number > max) max = number;
    });
    return max + 1;
  }

  function fieldMap(moduleName, patient) {
    var lists = {
      registration: registrationFields(patient || {}),
      anc: ancFields(patient || {}),
      pnc: pncFields(),
      immediate: immediateFields(),
      newborn: newbornFields({ visit_number: 2 }),
      delivery: deliveryFieldDefs()
    };
    var map = {};
    (lists[moduleName] || []).forEach(function (field) { map[field.key] = field; });
    if (moduleName === 'test') {
      createTemplate('test').fields.forEach(function (field) {
        map[field.key] = { key: field.key, path: [field.key], type: field.editor.type, options: field.editor.options, min: field.editor.min, max: field.editor.max, labelEn: field.labelEn, labelMm: field.labelMm };
      });
    }
    return map;
  }

  function error(en, mm) {
    return { en: en, mm: mm };
  }

  function coerceValue(field, raw, now) {
    if (isDangerous(raw)) return { error: error('This value cannot be saved.', 'ဤတန်ဖိုးကို မသိမ်းနိုင်ပါ။') };
    if (field.type === 'boolean') {
      var bool = booleanOrNull(raw);
      if (bool === null) return { error: error('Choose yes or no for ' + field.labelEn + '.', field.labelMm + ' အတွက် ရှိ/မရှိ ရွေးပါ။') };
      return { value: bool };
    }
    if (field.type === 'number' || field.type === 'weight') {
      if (raw === '' || raw == null) return { error: error(field.labelEn + ' is required.', field.labelMm + ' ဖြည့်ပါ။') };
      var number = parseFloat(raw);
      if (isNaN(number)) return { error: error(field.labelEn + ' must be a number.', field.labelMm + ' ကို ကိန်းဂဏန်းဖြည့်ပါ။') };
      if (field.min != null && number < field.min) return { error: error(field.labelEn + ' is below the allowed range.', field.labelMm + ' သည် ခွင့်ပြုအပိုင်းအခြားအောက် ရောက်နေသည်။') };
      if (field.max != null && number > field.max) return { error: error(field.labelEn + ' is above the allowed range.', field.labelMm + ' သည် ခွင့်ပြုအပိုင်းအခြားအထက် ရောက်နေသည်။') };
      if (field.type === 'weight') return { value: Math.round(number * 1000) };
      return { value: number };
    }
    if (field.type === 'date' || field.type === 'datetime') {
      var dateText = text(raw);
      var datePart = dateText.slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return { error: error('Enter a valid date for ' + field.labelEn + '.', field.labelMm + ' အတွက် ရက်စွဲမှန်ကန်စွာ ဖြည့်ပါ။') };
      if (datePart > todayIso(now)) return { error: error('A back-fill date cannot be in the future.', 'ပြန်ဖြည့်သည့်ရက်သည် ယနေ့ထက် နောက်မကျရပါ။') };
      if (field.type === 'datetime' && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(dateText)) {
        return { error: error('Enter a birth date and time.', 'မွေးသည့်ရက်နှင့် အချိန်ဖြည့်ပါ။') };
      }
      return { value: field.type === 'date' ? datePart : dateText.slice(0, 16) };
    }
    if (field.type === 'select') {
      var normalized = field.normalize ? field.normalize(raw) : text(raw);
      if (!allowedValue(field, normalized)) return { error: error('Choose a current option for ' + field.labelEn + '.', field.labelMm + ' အတွက် လက်ရှိရွေးချယ်မှုတစ်ခု ရွေးပါ။') };
      return { value: normalized };
    }
    if (field.type === 'obstetric') {
      if (!Array.isArray(raw) || !raw.length) return { error: error('Add at least one previous pregnancy.', 'ယခင်ကိုယ်ဝန် အနည်းဆုံးတစ်ခု ဖြည့်ပါ။') };
      var rows = raw.map(function (row, index) {
        return {
          serial: index + 1,
          year: text(row.year),
          deliveryType: text(row.deliveryType),
          birthPlace: text(row.birthPlace),
          attendant: text(row.attendant),
          birthWeightKg: text(row.birthWeightKg),
          conditionAfterBirth: text(row.conditionAfterBirth),
          remark: text(row.remark),
          outcome: text(row.deliveryType),
          notes: text(row.remark)
        };
      }).filter(function (row) { return row.year || row.deliveryType; });
      if (!rows.length || rows.some(function (row) { return !row.year || !row.deliveryType; })) {
        return { error: error('Each previous pregnancy needs a year and delivery type.', 'ယခင်ကိုယ်ဝန်တစ်ခုစီအတွက် ခုနှစ်နှင့် မွေးဖွားနည်း ဖြည့်ပါ။') };
      }
      return { value: rows };
    }
    if (field.type === 'other-visits') {
      var visits = (Array.isArray(raw) ? raw : []).map(function (row) {
        return { visitDate: text(row.visitDate).slice(0, 10), facilityType: text(row.facilityType), facilityName: text(row.facilityName) };
      }).filter(function (row) { return row.visitDate || row.facilityType || row.facilityName; });
      if (visits.some(function (row) { return !/^\d{4}-\d{2}-\d{2}$/.test(row.visitDate) || (row.facilityType !== 'Public' && row.facilityType !== 'Private') || !row.facilityName; })) {
        return { error: error('Each other-facility visit needs a date, facility type, and name.', 'အခြားဌာနပြသမှုတစ်ခုစီအတွက် ရက်စွဲ၊ ဌာနအမျိုးအစားနှင့် အမည်ဖြည့်ပါ။') };
      }
      return { value: visits };
    }
    if (field.type === 'age') {
      var ageYears = raw && raw.years !== '' && raw.years != null ? parseInt(raw.years, 10) : null;
      var ageMonths = raw && raw.months !== '' && raw.months != null ? parseInt(raw.months, 10) : null;
      if (ageYears == null && ageMonths == null) return { error: error('Enter the youngest child age.', 'အငယ်ဆုံးကလေးအသက် ဖြည့်ပါ။') };
      if ((ageYears != null && (isNaN(ageYears) || ageYears < 0 || ageYears > 30)) || (ageMonths != null && (isNaN(ageMonths) || ageMonths < 0 || ageMonths > 11))) {
        return { error: error('Enter a valid child age.', 'ကလေးအသက်ကို မှန်ကန်စွာ ဖြည့်ပါ။') };
      }
      return { value: { years: ageYears, months: ageMonths } };
    }
    var written = text(raw);
    if (!written) return { error: error(field.labelEn + ' is required.', field.labelMm + ' ဖြည့်ပါ။') };
    return { value: written };
  }

  function existingFor(bundle, request) {
    var collections = {
      anc: bundle.ancVisits,
      test: bundle.testRecords,
      pnc: bundle.pncVisits,
      newborn: bundle.newbornVisits,
      immediate: bundle.immediateRecords
    };
    var rows = collections[request.module] || [];
    for (var i = 0; i < rows.length; i++) if (rows[i].id === request.recordId) return rows[i];
    return null;
  }

  function planWrites(bundle, requests, actor) {
    bundle = bundle || {};
    requests = requests || [];
    actor = actor || {};
    var patient = bundle.patient || {};
    var errors = [];
    var operations = [];
    if (!patient.id) errors.push(error('Choose a patient before saving.', 'မသိမ်းမီ လူနာရွေးပါ။'));
    if (actor.uid && !isOwnedMother(patient, actor.uid)) errors.push(error('Back Fill can update only patients you registered.', 'သင်မှတ်ပုံတင်ထားသော လူနာများကိုသာ ပြန်ဖြည့်နိုင်သည်။'));
    if (!requests.length) errors.push(error('Select at least one item to save.', 'သိမ်းမည့်အချက် အနည်းဆုံးတစ်ခု ရွေးပါ။'));

    requests.forEach(function (request) {
      if (errors.length) return;
if (request.module === 'delivery') {
      planDelivery(bundle, request, actor, operations, errors);
      return;
    }
    if (request.module === 'registration') request.recordId = patient.id;
    planFlat(bundle, request, actor, operations, errors);
    });

    return { ok: errors.length === 0, errors: errors, operations: errors.length ? [] : operations, ruleVersion: RULE_VERSION };
  }

function planFlat(bundle, request, actor, operations, errors) {
  if (!request.values || !Object.keys(request.values).length) return;
  var patient = bundle.patient || {};
    var fields = fieldMap(request.module, patient);
    var existing = request.module === 'registration' ? { id: patient.id, data: patient } : existingFor(bundle, request);
    var creating = !request.recordId;
    var data = {};
    var changes = [];
    var values = request.values || {};

    if (creating && (request.module === 'anc' || request.module === 'pnc' || request.module === 'newborn')) {
      var duplicate = findDuplicateVisit(collectionOf(bundle, request.module), parseInt(request.visitNumber, 10), text(values.visitDate).slice(0, 10), null);
      if (duplicate && duplicate.type === 'number-taken') {
        errors.push(error('That visit number already exists on another date. Open the existing visit instead of adding a duplicate.', 'ထိုအကြိမ်နံပါတ်သည် အခြားရက်စွဲတွင် ရှိပြီးသားဖြစ်သည်။ အသစ်ထပ်မထည့်ဘဲ ရှိပြီးသားမှတ်တမ်းကို ပြင်ပါ။'));
        return;
      }
      if (duplicate && duplicate.type === 'match') request.recordId = duplicate.id;
      else request.recordId = historicalVisitId(request.module, request.visitNumber || 1, values.visitDate || 'undated');
      data.visitNumber = parseInt(request.visitNumber, 10) || 1;
      data.visit_number = data.visitNumber;
      creating = !existingFor(bundle, request);
    }

    if (creating && request.module === 'test') {
      var testDate = text(values.testDate).slice(0, 10);
      var matched = (bundle.testRecords || []).find(function (test) { return text((test.data || {}).testDate).slice(0, 10) === testDate; });
      request.recordId = matched ? matched.id : historicalVisitId('test', 1, testDate || 'undated');
      creating = !matched;
    }

    if (creating && request.module === 'immediate') {
      var existingImmediate = (bundle.immediateRecords || [])[0];
      if (existingImmediate) {
        request.recordId = existingImmediate.id;
        creating = false;
        existing = existingImmediate;
      } else {
        request.recordId = 'bf_immediate_1';
      }
    }

    Object.keys(values).forEach(function (key) {
      if (BLOCKED_KEYS[key]) {
        errors.push(error('Patient identity fields cannot be changed here.', 'လူနာပိုင်ဆိုင်မှုအချက်အလက်ကို ဤနေရာတွင် မပြောင်းနိုင်ပါ။'));
        return;
      }
      var field = fields[key] || (key === 'otherVisits' ? { key: key, path: ['otherVisits'], type: 'other-visits', labelEn: 'Other-facility visits', labelMm: 'အခြားဌာနပြသမှု' } : null);
      if (!field) return;
      var coerced = coerceValue(field, values[key], actor.now);
      if (coerced.error) {
        errors.push(coerced.error);
        return;
      }
      if (key === 'otherVisits' && Array.isArray(coerced.value) && !coerced.value.length) return;
      var before = existing && existing.data ? getPath(existing.data, field.path || [key]) : '';
      if (before !== '' && before != null && (coerced.value === '' || coerced.value == null)) {
        errors.push(error('Existing clinical values cannot be cleared.', 'ရှိပြီးသား ဆေးမှတ်တမ်းကို ဖျက်၍ မရပါ။'));
        return;
      }
      if (key === 'youngestChildAge') {
        data.youngest_child_age_years = coerced.value.years;
        data.youngest_child_age_months = coerced.value.months;
      } else {
        setPath(data, field.path || [key], coerced.value);
        if (field.sync) Object.assign(data, field.sync(coerced.value));
      }
      changes.push({ field: key, before: before === '' ? null : before, after: coerced.value, kind: before === '' || before == null ? 'missing' : 'conflict' });
    });

    if (creating || request.create) {
      createTemplate(request.module, bundle).fields.forEach(function (field) {
        if (!field.required) return;
        var present = values[field.key];
        if (present == null || present === '' || (Array.isArray(present) && !present.length)) {
          errors.push(error('Complete ' + field.labelEn + ' before saving the new record.', 'မှတ်တမ်းအသစ်မသိမ်းမီ ' + field.labelMm + ' ဖြည့်ပါ။'));
        }
      });
    }
    if (!Object.keys(data).length || errors.length) return;
    var path = request.module === 'registration'
      ? 'patients/' + patient.id
      : 'patients/' + (request.patientId || patient.id) + '/' + collectionName(request.module) + '/' + request.recordId;
    operations.push({
      kind: 'merge',
      path: path,
      create: creating,
      module: request.module,
      data: data,
      audit: changes.length ? { recordPath: path, changes: changes, reason: 'retroactive_backfill' } : null
    });
  }

  function collectionName(moduleName) {
    return {
      anc: 'antenatal_visits',
      test: 'testRecords',
      pnc: 'postpartum_visits',
      newborn: 'newborn_care',
      immediate: 'immediate_newborn_care'
    }[moduleName];
  }

  function collectionOf(bundle, moduleName) {
    return {
      anc: bundle.ancVisits,
      pnc: bundle.pncVisits,
      newborn: bundle.newbornVisits,
      test: bundle.testRecords,
      immediate: bundle.immediateRecords
    }[moduleName] || [];
  }

function planDelivery(bundle, request, actor, operations, errors) {
  var values = request.values || {};
  if (!Object.keys(values).length) return;
  var existing = bundle.delivery && bundle.delivery.data ? cloneData(bundle.delivery.data) : { thirdStage: {}, deliveryDetails: { babies: [{}] } };
    if (!existing.thirdStage) existing.thirdStage = {};
    if (!existing.deliveryDetails) existing.deliveryDetails = {};
var fields = fieldMap('delivery');
    var changes = [];
    Object.keys(values).forEach(function (key) {
      if (key === 'babies') return;
      var field = fields[key];
      if (!field) return;
      var coerced = coerceValue(field, values[key], actor.now);
      if (coerced.error) {
        errors.push(coerced.error);
        return;
      }
      var before = getPath(existing, field.path);
      setPath(existing, field.path, coerced.value);
      changes.push({ field: key, before: before === '' ? null : before, after: coerced.value, kind: before === '' || before == null ? 'missing' : 'conflict' });
    });
    if (Array.isArray(values.babies)) {
      var babies = values.babies.map(function (baby, index) { return sanitizeBaby(baby, index, actor, errors); });
      if (text(existing.deliveryDetails.pregnancyType) === 'twins' && babies.length < 2) {
        errors.push(error('Twins need two baby rows.', 'အမွှာအတွက် ကလေးနှစ်ဦးစာ ဖြည့်ပါ။'));
      }
      changes.push({ field: 'babies', before: babiesOf(bundle.delivery && bundle.delivery.data || {}), after: babies, kind: 'missing' });
      existing.deliveryDetails.babies = babies;
    }
    if (request.create || !(bundle.delivery && bundle.delivery.data)) {
      deliveryFieldDefs().forEach(function (field) {
        if (field.key === 'babies') {
          if (!babiesOf(existing).length) errors.push(error('Enter the newborn details.', 'မွေးကင်းစအချက်အလက် ဖြည့်ပါ။'));
          return;
        }
        var present = field.type === 'boolean' ? booleanOrNull(getPath(existing, field.path)) !== null : text(getPath(existing, field.path)) !== '';
        if (field.required && !present) errors.push(error('Complete the Delivery Notes before saving.', 'မသိမ်းမီ မွေးဖွားခြင်းမှတ်တမ်းကို ပြည့်စုံအောင် ဖြည့်ပါ။'));
      });
    }
    operations.push({
      kind: 'delivery',
      path: 'patients/' + (bundle.patient || {}).id + '/records/deliveryNotes',
      create: !(bundle.delivery && bundle.delivery.canonical),
      allowUpdate: !!(bundle.delivery && bundle.delivery.canonical),
      module: 'delivery',
      notes: {
        thirdStage: existing.thirdStage,
        deliveryDetails: existing.deliveryDetails
      },
      audit: { recordPath: 'patients/' + (bundle.patient || {}).id + '/records/deliveryNotes', changes: changes, reason: 'retroactive_backfill' }
    });
  }

  function sanitizeBaby(baby, index, actor, errors) {
    baby = baby || {};
    var weight = coerceValue({ type: 'weight', min: 0.3, max: 7, labelEn: 'Birth weight', labelMm: 'မွေးကင်းစကိုယ်အလေးချိန်' }, baby.birthWeightKg != null ? baby.birthWeightKg : (baby.birthWeightGram > 20 ? baby.birthWeightGram / 1000 : baby.birthWeightGram), actor.now);
    if (weight.error) errors.push(weight.error);
    var time = coerceValue({ type: 'datetime', labelEn: 'Birth time', labelMm: 'မွေးချိန်' }, baby.birthTime, actor.now);
    if (time.error) errors.push(time.error);
    var outcome = normalizeOutcome(baby.outcome);
    if (['alive', 'death', 'stillbirth'].indexOf(outcome) < 0) errors.push(error('Choose the baby outcome.', 'ကလေးရလဒ် ရွေးပါ။'));
    if ((outcome === 'death' || outcome === 'stillbirth') && !text(baby.causeOfDeath)) errors.push(error('Enter the cause of death.', 'သေဆုံးရသည့်အကြောင်း ဖြည့်ပါ။'));
    return {
      babyIndex: index + 1,
      babyName: text(baby.babyName),
      gender: text(baby.gender),
      outcome: outcome,
      anusPresent: text(baby.anusPresent),
      birthWeightGram: weight.value,
      birthTime: time.value,
      causeOfDeath: text(baby.causeOfDeath)
    };
  }

  return {
    RULE_VERSION: RULE_VERSION,
    isOwnedMother: isOwnedMother,
    scanPatient: scanPatient,
    createTemplate: createTemplate,
    planWrites: planWrites,
    findDuplicateVisit: findDuplicateVisit,
    historicalVisitId: historicalVisitId,
    normalizeBirthPlace: normalizeBirthPlace,
    normalizeDeliveryMode: normalizeDeliveryMode,
    normalizeTd: normalizeTd
  };
});
