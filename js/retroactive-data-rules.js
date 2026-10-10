/**
 * Categorized retroactive-data rules for midwife Back Fill.
 * Pure detection and write planning. No Firestore and no deletes.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.RetroactiveDataRules = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var RULE_VERSION = 'retroactive-v2';
  var BIRTH_PLACES = ['government_hospital', 'health_facility_subfacility', 'private_facility', 'home', 'other'];
  var BLOCKED_KEYS = {
    created_by: true,
    createdBy: true,
    patient_type: true,
    baby_patient_ids: true,
    care_team_midwife_ids: true
  };
  var TD_RANK = { not_given: 0, TD1: 1, TD2: 2, Completed: 3 };

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

  function tdOptions() {
    return [
      choice('TD1', 'TD1', 'TD1'),
      choice('TD2', 'TD2', 'TD2'),
      choice('not_given', 'Not Given', 'မထိုးရသေး'),
      choice('Completed', 'Completed', 'ပြီးမြောက်ပြီ')
    ];
  }

  function diagnosisOptions() {
    return [
      choice('Routine ANC', 'Routine ANC', 'ပုံမှန် ANC'),
      choice('Abortion', 'Abortion', 'သားပျက်'),
      choice('Other', 'Other', 'အခြား')
    ];
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
    if (!field || !field.options) return value;
    return field.options.some(function (option) { return option.value === value; }) ? value : '';
  }

  function gravidaOf(patient, visit) {
    var raw = (patient && (patient.gravida_value != null ? patient.gravida_value : patient.gravida)) ||
      (visit && (visit.gravida_value != null ? visit.gravida_value : visit.gravida));
    var number = parseInt(raw, 10);
    return isNaN(number) ? null : number;
  }

  function parityOf(patient) {
    var raw = patient && (patient.parity_primary != null ? patient.parity_primary : patient.parity);
    var number = parseInt(raw, 10);
    return isNaN(number) ? null : number;
  }

  function visitNumberOf(data) {
    var number = parseInt(data && (data.visitNumber || data.visit_number), 10);
    return isNaN(number) ? null : number;
  }

  function visitDateOf(data) {
    return text(data && (data.visitDate || data.visit_date || data.testDate)).slice(0, 10);
  }

  function isOwnedMother(patient, uid) {
    if (!patient || !uid) return false;
    if (patient.patient_type === 'baby') return false;
    return patient.created_by === uid || patient.createdBy === uid;
  }

  function riskFactorsOf(record) {
    var factors = record && (record.risk_factors || record.riskFactors) || [];
    return Array.isArray(factors) ? factors.map(text) : [];
  }

  function hasOtherRisk(record) {
    return riskFactorsOf(record).indexOf('Other Medical Conditions') >= 0;
  }

  function obstetricComplete(value) {
    return Array.isArray(value) && value.some(function (row) {
      return text(row && row.year) && text(row && (row.deliveryType || row.outcome));
    });
  }

  function cdkComplete(record) {
    if (!record) return false;
    var status = text(record.cleanDeliveryKitStatus).toLowerCase();
    if (status === 'not_given' || record.cleanDeliveryKitNotGiven === true) return true;
    return !!text(record.cleanDeliveryKitDate);
  }

  function cdkValue(record) {
    if (!record) return '';
    if (text(record.cleanDeliveryKitStatus).toLowerCase() === 'not_given' || record.cleanDeliveryKitNotGiven === true) {
      return 'not_given';
    }
    return text(record.cleanDeliveryKitDate);
  }

  function readValue(record, field) {
    if (field.type === 'obstetric') {
      var rows = getPath(record, field.path || [field.key]);
      return obstetricComplete(rows) ? rows : '';
    }
    if (field.type === 'cdk') return cdkValue(record);
    if (field.type === 'age') {
      var years = record.youngest_child_age_years;
      var months = record.youngest_child_age_months;
      if ((years == null || years === '') && (months == null || months === '')) return '';
      return { years: years, months: months };
    }
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
    if (field.type === 'boolean') {
      var bool = booleanOrNull(canonicalRaw);
      if (bool !== null) return bool;
      return booleanOrNull(legacyRaw);
    }
    if (canonical !== '' && canonical != null) return canonical;
    if (legacy !== '' && legacy != null) return legacy;
    return '';
  }

  function valueFilled(field, value) {
    if (field.type === 'boolean') return value === true || value === false;
    if (field.type === 'obstetric') return obstetricComplete(value);
    if (field.type === 'age') return !!(value && ((value.years != null && value.years !== '') || (value.months != null && value.months !== '')));
    if (field.type === 'other-visits') return Array.isArray(value) && value.length > 0;
    if (Array.isArray(value)) return value.length > 0;
    return value !== '' && value != null;
  }

  function error(en, mm) {
    return { en: en, mm: mm };
  }

  function editorOf(field) {
    return {
      type: field.type,
      options: field.options || null,
      min: field.min == null ? null : field.min,
      max: field.max == null ? null : field.max,
      step: field.step || null
    };
  }

  function visitRows(visits) {
    return (visits || []).map(function (visit) {
      return {
        id: visit.id,
        visitNumber: visitNumberOf(visit.data || {}) || 0,
        visitDate: visitDateOf(visit.data || {}),
        data: visit.data || {}
      };
    }).sort(function (a, b) {
      return (a.visitNumber || 999) - (b.visitNumber || 999);
    });
  }

  function registrationFields() {
    return [
      { key: 'name', path: ['name'], type: 'text', required: true, labelEn: 'Name', labelMm: 'အမည်' },
      { key: 'age', path: ['age'], type: 'number', required: true, min: 10, max: 60, step: '1', labelEn: 'Age', labelMm: 'အသက်' },
      { key: 'phone', path: ['phone'], aliases: [['phone_number'], ['phoneNumber']], type: 'text', required: true, labelEn: 'Phone', labelMm: 'ဖုန်းနံပါတ်' },
      { key: 'registration_date', path: ['registration_date'], aliases: [['registrationDate']], type: 'date', required: true, labelEn: 'Registration date', labelMm: 'မှတ်ပုံတင်သည့်နေ့', sync: function (value) { return { registrationDate: value }; } },
      { key: 'gravida', path: ['gravida'], aliases: [['gravida_value']], type: 'number', required: true, min: 1, max: 20, step: '1', labelEn: 'Gravida', labelMm: 'ကိုယ်ဝန်အကြိမ် (G)', sync: function (value) { return { gravida_value: value }; } },
      { key: 'parity', path: ['parity_primary'], aliases: [['parity']], type: 'number', required: true, min: 0, max: 20, step: '1', labelEn: 'Parity', labelMm: 'မွေးဖွားအကြိမ် (P)', sync: function (value) { return { parity: value }; } },
      { key: 'youngestChildAge', path: ['youngest_child_age_years'], type: 'age', required: false, labelEn: 'Youngest child age', labelMm: 'အငယ်ဆုံးကလေး အသက်' }
    ];
  }

  function ancField(key) {
    var fields = {
      visitDate: { key: 'visitDate', path: ['visitDate'], aliases: [['visit_date']], type: 'date', labelEn: 'Visit date', labelMm: 'လာရောက်ပြသသည့် ရက်စွဲ', sync: function (value) { return { visit_date: value }; } },
      previousObstetricHistory: { key: 'previousObstetricHistory', path: ['previousObstetricHistory'], type: 'obstetric', labelEn: 'Previous pregnancies', labelMm: 'ယခင်ကိုယ်ဝန်များ' },
      lastPregnancyOutcome: { key: 'lastPregnancyOutcome', path: ['lastPregnancyOutcome'], type: 'select', labelEn: 'Last pregnancy outcome', labelMm: 'နောက်ဆုံးကိုယ်ဝန် အခြေအနေ', options: [choice('Alive', 'Alive', 'မွေး'), choice('Death', 'Death', 'သေ'), choice('Miscarriage', 'Miscarriage', 'ပျက်')] },
      goiterStatus: { key: 'goiterStatus', path: ['goiterStatus'], type: 'select', labelEn: 'Goiter', labelMm: 'လည်ပင်းကြီးရောဂါ ရှိ/မရှိ', options: yesNoUnknown() },
      tbSymptoms: { key: 'tbSymptoms', path: ['tbSymptoms'], type: 'select', labelEn: 'Tuberculosis', labelMm: 'တီဘီရောဂါ ရှိ/မရှိ', options: yesNo() },
      otherMedicalConditionName: { key: 'otherMedicalConditionName', path: ['otherMedicalConditionName'], aliases: [['other_medical_condition_name']], type: 'text', labelEn: 'Other medical condition', labelMm: 'အခြားကျန်းမာရေးပြဿနာ', sync: function (value) { return { other_medical_condition_name: value }; } },
      ironFolicAcid: { key: 'ironFolicAcid', path: ['ironFolicAcid'], type: 'select', labelEn: 'Iron and folic acid', labelMm: 'သံဓာတ်နှင့် ဖောလစ်အက်ဆစ်', options: medicationOptions(), normalize: normalizeMedication },
      micronutrientsTablet: { key: 'micronutrientsTablet', path: ['micronutrientsTablet'], type: 'select', labelEn: 'Micronutrient tablets', labelMm: 'အဏုအာဟာရဆေးပြား', options: medicationOptions(), normalize: normalizeMedication },
      vitaminB1: { key: 'vitaminB1', path: ['vitaminB1'], type: 'select', labelEn: 'Vitamin B1', labelMm: 'ဘီဝမ်း', options: medicationOptions(), normalize: normalizeMedication },
      deworming: { key: 'deworming', path: ['deworming'], type: 'select', labelEn: 'Deworming', labelMm: 'သန်ချဆေးပြား', options: medicationOptions(), normalize: normalizeMedication },
      tetanusToxoid: { key: 'tetanusToxoid', path: ['tetanusToxoid'], aliases: [['td']], type: 'select', labelEn: 'Tetanus diphtheria', labelMm: 'မေးခိုင်၊ ဆုံဆို့နာကာကွယ်ဆေး', options: tdOptions(), normalize: normalizeTd, sync: function (value) { return { td: value }; } },
      provisionalDiagnosisType: { key: 'provisionalDiagnosisType', path: ['provisionalDiagnosisType'], aliases: [['provisionalDiagnosis']], type: 'select', labelEn: 'Provisional diagnosis', labelMm: 'ယာယီရောဂါသတ်မှတ်ချက်', options: diagnosisOptions() },
      provisionalDiagnosisOther: { key: 'provisionalDiagnosisOther', path: ['provisionalDiagnosisOther'], type: 'text', labelEn: 'Other diagnosis', labelMm: 'အခြားရောဂါအမည်' },
      cleanDeliveryKit: { key: 'cleanDeliveryKit', path: ['cleanDeliveryKitStatus'], type: 'cdk', labelEn: 'Clean delivery kit', labelMm: 'တစ်ခါသုံးမွေးဖွားအိတ်' }
    };
    return fields[key];
  }

  function deliveryFieldDefs() {
    return [
      { key: 'oxytocinGiven', path: ['thirdStage', 'oxytocinGiven'], aliases: [['oxytocinGiven']], type: 'boolean', required: true, labelEn: 'Oxytocin within one minute', labelMm: 'Oxytocin ၁၀ ယူနစ် ထိုးခြင်း' },
      { key: 'controlledCordTraction', path: ['thirdStage', 'controlledCordTraction'], aliases: [['controlledCordTraction']], type: 'boolean', required: true, labelEn: 'Controlled cord traction', labelMm: 'ချက်ကြိုးဆွဲ၍ အချင်းချခြင်း' },
      { key: 'gestationalWeek', path: ['deliveryDetails', 'gestationalWeek'], aliases: [['gestationalWeek'], ['gestational_week']], type: 'number', required: true, min: 1, max: 45, step: '1', labelEn: 'Gestational week', labelMm: 'ကိုယ်ဝန်ပတ်' },
      { key: 'birthProvider', path: ['deliveryDetails', 'birthProvider'], aliases: [['birthProvider'], ['birth_provider']], type: 'select', required: true, labelEn: 'Birth provider', labelMm: 'မွေးဖွားပေးသူ', normalize: normalizeBirthProvider, options: [choice('self', 'Self', 'ကိုယ်တိုင်'), choice('skilled_birth_attendant', 'Skilled birth attendant', 'ကျွမ်းကျင်မွေးဖွားသူ'), choice('amw', 'AMW', 'အရံသားဖွား'), choice('tba', 'TBA', 'အရပ်လက်သည်'), choice('other', 'Other', 'အခြား')] },
      { key: 'modeOfDelivery', path: ['deliveryDetails', 'modeOfDelivery'], aliases: [['deliveryDetails', 'mode_of_delivery'], ['modeOfDelivery'], ['mode_of_delivery']], type: 'select', required: true, labelEn: 'Mode of delivery', labelMm: 'မွေးဖွားနည်း', normalize: normalizeDeliveryMode, options: [choice('normal', 'Normal vaginal', 'ရိုးရိုးမွေး'), choice('assisted', 'Assisted', 'ကူညီမွေး'), choice('elective_c_section', 'Elective C-section', 'စီစဉ်ထားသောဗိုက်ခွဲ'), choice('emergency_c_section', 'Emergency C-section', 'အရေးပေါ်ဗိုက်ခွဲ')] },
      { key: 'birthPlace', path: ['deliveryDetails', 'birthPlace'], aliases: [['deliveryDetails', 'birthplace'], ['birthPlace'], ['birthplace']], type: 'select', required: true, labelEn: 'Birth place', labelMm: 'မွေးဖွားရာနေရာ', normalize: normalizeBirthPlace, options: [choice('government_hospital', 'Government hospital', 'အစိုးရဆေးရုံ'), choice('health_facility_subfacility', 'RHC/SRHC', 'ကျန်းမာရေးဌာန/ဌာနခွဲ'), choice('private_facility', 'Private facility', 'ပုဂ္ဂလိက'), choice('home', 'Home', 'အိမ်မွေး'), choice('other', 'Other', 'အခြား')] },
      { key: 'maternalCondition', path: ['deliveryDetails', 'maternalCondition'], aliases: [['deliveryDetails', 'maternal_condition'], ['maternalCondition'], ['maternal_condition']], type: 'select', required: true, labelEn: 'Maternal condition', labelMm: 'မိခင်အခြေအနေ', options: [choice('alive', 'Alive', 'အသက်ရှင်'), choice('dead', 'Dead', 'သေဆုံး')] },
      { key: 'pregnancyType', path: ['deliveryDetails', 'pregnancyType'], aliases: [['pregnancyType'], ['pregnancy_type']], type: 'select', required: true, labelEn: 'Pregnancy type', labelMm: 'ကိုယ်ဝန်အမျိုးအစား', options: [choice('single', 'Single', 'တစ်ဦး'), choice('twins', 'Twins', 'အမွှာ')] },
      { key: 'babies', path: ['deliveryDetails', 'babies'], aliases: [['babies']], type: 'babies', required: true, labelEn: 'Newborn details', labelMm: 'မွေးကင်းစအချက်အလက်' }
    ];
  }

  function pncFields() {
    return [
      { key: 'maternalOutcome', path: ['maternalOutcome'], type: 'select', required: true, labelEn: 'Maternal outcome', labelMm: 'မိခင်ရလဒ်', options: [choice('alive', 'Alive', 'အသက်ရှင်'), choice('dead', 'Dead', 'သေဆုံး')] },
      { key: 'otherVisits', path: ['otherVisits'], type: 'other-visits', required: false, labelEn: 'Other-facility visits', labelMm: 'အခြားဌာနတွင် ပြသခဲ့သောအကြိမ်များ' }
    ];
  }

  function testFields() {
    return [
      { key: 'testDate', path: ['testDate'], type: 'date', required: true, labelEn: 'Test date', labelMm: 'စစ်ဆေးသည့်ရက်' },
      { key: 'hivResult', path: ['hivResult'], type: 'text', required: false, labelEn: 'HIV', labelMm: 'HIV' },
      { key: 'malariaResult', path: ['malariaResult'], type: 'text', required: false, labelEn: 'Malaria', labelMm: 'ငှက်ဖျား' },
      { key: 'syphilisResult', path: ['syphilisResult'], type: 'text', required: false, labelEn: 'Syphilis', labelMm: 'ဆစ်ဖလစ်' },
      { key: 'hepatitisBResult', path: ['hepatitisBResult'], type: 'text', required: false, labelEn: 'Hepatitis B', labelMm: 'အသည်းရောင် ဘီ' },
      { key: 'hepatitisCResult', path: ['hepatitisCResult'], type: 'text', required: false, labelEn: 'Hepatitis C', labelMm: 'အသည်းရောင် စီ' },
      { key: 'hemoglobinResult', path: ['hemoglobinResult'], type: 'number', required: false, min: 1, max: 25, step: '0.1', labelEn: 'Hb', labelMm: 'Hb' },
      { key: 'bloodGroup', path: ['bloodGroup'], type: 'select', required: false, labelEn: 'Blood group', labelMm: 'သွေးအုပ်စု', options: ['A', 'B', 'AB', 'O'].map(function (value) { return choice(value, value, value); }) },
      { key: 'rhFactor', path: ['rhFactor'], type: 'select', required: false, labelEn: 'Rh factor', labelMm: 'Rh', options: [choice('Positive', 'Positive', 'Positive'), choice('Negative', 'Negative', 'Negative')] },
      { key: 'ultrasoundServices', path: ['ultrasoundServices'], type: 'text', required: false, labelEn: 'Ultrasound', labelMm: 'အာထရာဆောင်း' }
    ];
  }

  function fieldMap(moduleName) {
    var map = {};
    var lists = {
      registration: registrationFields(),
      anc: ['visitDate', 'previousObstetricHistory', 'lastPregnancyOutcome', 'goiterStatus', 'tbSymptoms', 'otherMedicalConditionName', 'ironFolicAcid', 'micronutrientsTablet', 'vitaminB1', 'deworming', 'tetanusToxoid', 'provisionalDiagnosisType', 'provisionalDiagnosisOther', 'cleanDeliveryKit'].map(ancField),
      pnc: pncFields(),
      test: testFields(),
      delivery: deliveryFieldDefs()
    };
    (lists[moduleName] || []).forEach(function (field) { map[field.key] = field; });
    return map;
  }

  function categoryShell(id, en, mm, extra) {
    return Object.assign({
      id: id,
      labelEn: en,
      labelMm: mm,
      applicable: true,
      optional: false,
      visitCount: 0,
      filledCount: 0,
      missingCount: 0,
      notNeededCount: 0,
      groups: [],
      redirects: []
    }, extra || {});
  }

  function visitState(visit, field) {
    var current = readValue(visit.data, field);
    var filled = field.type === 'cdk' ? cdkComplete(visit.data) : valueFilled(field, current);
    return {
      recordId: visit.id,
      visitNumber: visit.visitNumber,
      visitDate: visit.visitDate,
      status: filled ? 'ok' : 'missing',
      currentValue: current
    };
  }

  function groupFromVisits(spec, visits, field) {
    var states = visits.map(function (visit) { return visitState(visit, field); });
    var filledVisits = states.filter(function (item) { return item.status === 'ok'; }).length;
    var status = spec.notNeeded ? 'not_needed' : (filledVisits === states.length && states.length ? 'ok' : 'missing');
    if (spec.mode === 'once' && !spec.notNeeded) {
      status = filledVisits === states.length && states.length ? 'ok' : 'missing';
    }
    var proposed = '';
    states.forEach(function (item) {
      if (!proposed && valueFilled(field, item.currentValue)) proposed = item.currentValue;
    });
    return {
      key: spec.key,
      keys: spec.keys || [spec.key],
      module: spec.module,
      mode: spec.mode,
      required: spec.required !== false && !spec.notNeeded,
      counts: spec.counts !== false && !spec.optional && !spec.notNeeded,
      optional: !!spec.optional,
      status: status,
      labelEn: spec.labelEn || field.labelEn,
      labelMm: spec.labelMm || field.labelMm,
      hintEn: spec.hintEn || '',
      hintMm: spec.hintMm || '',
      notNeededReasonEn: spec.notNeededReasonEn || '',
      notNeededReasonMm: spec.notNeededReasonMm || '',
      editor: editorOf(field),
      fields: spec.fields || [field],
      visits: states,
      proposedValue: proposed,
      filledVisits: filledVisits,
      totalVisits: states.length
    };
  }

  function summarize(category) {
    category.groups.forEach(function (group) {
      if (group.status === 'not_needed') category.notNeededCount += 1;
      else if (group.status === 'ok') category.filledCount += 1;
      else if (group.counts !== false && !group.optional) category.missingCount += 1;
      else category.filledCount += 0;
    });
    category.redirects.forEach(function (item) {
      if (item.missing) category.missingCount += 1;
      else category.filledCount += 1;
    });
    return category;
  }

  function babiesOf(record) {
    var details = record && record.deliveryDetails || {};
    if (Array.isArray(details.babies) && details.babies.length) return details.babies;
    if (record && Array.isArray(record.babies) && record.babies.length) return record.babies;
    return [];
  }

  function babyOptions(fieldName) {
    if (fieldName === 'gender') return [choice('male', 'Male', 'ကျား'), choice('female', 'Female', 'မ')];
    if (fieldName === 'outcome') return [choice('alive', 'Alive', 'ရှင်'), choice('death', 'Death', 'သေ'), choice('stillbirth', 'Stillbirth', 'သေမွေး')];
    if (fieldName === 'anusPresent') return [choice('yes', 'Yes', 'ရှိ'), choice('no', 'No', 'မရှိ')];
    return null;
  }

  function babyGaps(babies, twins) {
    var gaps = [];
    var rows = babies.slice();
    if (!rows.length) rows = [{}];
    if (twins && rows.length < 2) rows.push({});
    rows.forEach(function (baby, index) {
      [
        ['babyName', 'Baby name', 'ကလေးအမည်', 'text'],
        ['gender', 'Sex', 'ကျား/မ', 'select'],
        ['outcome', 'Outcome', 'ရလဒ်', 'select'],
        ['birthWeightGram', 'Birth weight (kg)', 'မွေးကင်းစကိုယ်အလေးချိန်', 'weight'],
        ['birthTime', 'Birth time', 'မွေးချိန်', 'datetime'],
        ['anusPresent', 'Anus present', 'စအိုပေါက် ရှိ/မရှိ', 'select']
      ].forEach(function (item) {
        var missing = item[0] === 'birthWeightGram'
          ? baby.birthWeightGram == null || baby.birthWeightGram === ''
          : text(baby[item[0]]) === '';
        if (!missing && item[0] === 'outcome' && (baby.outcome === 'death' || baby.outcome === 'stillbirth') && text(baby.causeOfDeath || baby.cause_of_death) === '') {
          gaps.push({ babyIndex: index, babyField: 'causeOfDeath', labelEn: 'Cause of death', labelMm: 'သေဆုံးရသည့်အကြောင်း', editor: { type: 'text', options: null } });
        }
        if (!missing) return;
        gaps.push({
          babyIndex: index,
          babyField: item[0],
          labelEn: 'Baby ' + (index + 1) + ' ' + item[1],
          labelMm: 'ကလေး ' + (index + 1) + ' ' + item[2],
          editor: { type: item[3], options: item[3] === 'select' ? babyOptions(item[0]) : null, min: item[3] === 'weight' ? 0.3 : null, max: item[3] === 'weight' ? 7 : null, step: item[3] === 'weight' ? '0.001' : null }
        });
      });
    });
    return gaps;
  }

  function scanRegistration(patient) {
    var category = categoryShell('registration', 'Registration', 'လူနာမှတ်ပုံတင်ခြင်း');
    var gravida = gravidaOf(patient);
    registrationFields().forEach(function (field) {
      if (field.key === 'youngestChildAge') {
        if (gravida == null || gravida < 2) {
          category.groups.push({
            key: field.key,
            keys: [field.key],
            module: 'registration',
            mode: 'once',
            required: false,
            counts: false,
            status: 'not_needed',
            labelEn: field.labelEn,
            labelMm: field.labelMm,
            notNeededReasonEn: 'Not needed. This mother is in her first pregnancy / has one child only.',
            notNeededReasonMm: 'ဖြည့်ရန် မလိုပါ။ ဤမိခင်မှာ သားဦးကိုယ်ဝန် / ကလေးတစ်ဦးသာ ရှိသည်။',
            editor: editorOf(field),
            fields: [field],
            visits: [],
            proposedValue: ''
          });
          return;
        }
        var years = patient.youngest_child_age_years;
        var months = patient.youngest_child_age_months;
        var filled = !(years == null || years === '') || !(months == null || months === '');
        category.groups.push({
          key: field.key,
          keys: [field.key],
          module: 'registration',
          mode: 'once',
          required: true,
          counts: true,
          status: filled ? 'ok' : 'missing',
          labelEn: field.labelEn,
          labelMm: field.labelMm,
          editor: editorOf(field),
          fields: [field],
          visits: [],
          proposedValue: filled ? { years: years, months: months } : ''
        });
        return;
      }
      var current = readValue(patient, field);
      category.groups.push({
        key: field.key,
        keys: [field.key],
        module: 'registration',
        mode: 'once',
        required: true,
        counts: true,
        status: valueFilled(field, current) ? 'ok' : 'missing',
        labelEn: field.labelEn,
        labelMm: field.labelMm,
        editor: editorOf(field),
        fields: [field],
        visits: [],
        proposedValue: current
      });
    });
    return summarize(category);
  }

  function scanAnc(bundle, patient) {
    var visits = visitRows(bundle.ancVisits);
    var category = categoryShell('anc', 'Antenatal care', 'ကိုယ်ဝန်ဆောင်စောင့်ရှောက်မှု', {
      visitCount: visits.length,
      applicable: visits.length > 0
    });
    if (!visits.length) return category;
    var gravida = gravidaOf(patient);
    var multiPregnancy = gravida >= 2;
    var otherRisk = visits.some(function (visit) { return hasOtherRisk(visit.data); });

    category.groups.push(groupFromVisits({
      key: 'visitDate', module: 'anc', mode: 'per-visit', required: true,
      labelEn: 'Visit dates', labelMm: 'လာရောက်ပြသသည့် ရက်စွဲ',
      hintEn: 'Change a visit date only when the recorded date is wrong.',
      hintMm: 'မှတ်ထားသော ရက်စွဲမှားမှသာ ပြင်ပါ။'
    }, visits, ancField('visitDate')));

    category.groups.push(groupFromVisits({
      key: 'previousObstetricHistory', module: 'anc', mode: 'once', required: multiPregnancy,
      notNeeded: !multiPregnancy,
      notNeededReasonEn: 'Not shown. Gravida is 1, so previous-pregnancy history is not needed.',
      notNeededReasonMm: 'မပြပါ။ ကိုယ်ဝန်အကြိမ် ၁ ဖြစ်၍ ယခင်ကိုယ်ဝန် ရာဇဝင် မလိုပါ။',
      labelEn: 'Previous pregnancies', labelMm: 'ယခင်ကိုယ်ဝန်များ',
      hintEn: 'Fill once. It is copied to every ANC visit.',
      hintMm: 'တစ်ကြိမ်သာ ဖြည့်ပါ။ ANC အကြိမ်အားလုံးသို့ ကူးပါမည်။'
    }, visits, ancField('previousObstetricHistory')));

    category.groups.push(groupFromVisits({
      key: 'lastPregnancyOutcome', module: 'anc', mode: 'once', required: multiPregnancy,
      notNeeded: !multiPregnancy,
      notNeededReasonEn: 'Not shown. Gravida is 1, so last-pregnancy outcome is not needed.',
      notNeededReasonMm: 'မပြပါ။ ကိုယ်ဝန်အကြိမ် ၁ ဖြစ်၍ နောက်ဆုံးကိုယ်ဝန်အခြေအနေ မလိုပါ။',
      labelEn: 'Last pregnancy outcome', labelMm: 'နောက်ဆုံးကိုယ်ဝန် အခြေအနေ',
      hintEn: 'Fill once. It is copied to every ANC visit.',
      hintMm: 'တစ်ကြိမ်သာ ဖြည့်ပါ။ ANC အကြိမ်အားလုံးသို့ ကူးပါမည်။'
    }, visits, ancField('lastPregnancyOutcome')));

    var screening = groupFromVisits({
      key: 'screening', keys: ['goiterStatus', 'tbSymptoms'], module: 'anc', mode: 'apply-choice', required: true,
      labelEn: 'Goiter and tuberculosis', labelMm: 'လည်ပင်းကြီးရောဂါ နှင့် တီဘီ',
      hintEn: 'Apply the same answer to all visits, or set a different answer for each visit.',
      hintMm: 'အကြိမ်အားလုံးသို့ တူညီစွာ သုံးနိုင်သည်။ အကြိမ်အလိုက် ပြင်နိုင်သည်။',
      fields: [ancField('goiterStatus'), ancField('tbSymptoms')]
    }, visits, ancField('goiterStatus'));
    screening.visits = visits.map(function (visit) {
      return {
        recordId: visit.id,
        visitNumber: visit.visitNumber,
        visitDate: visit.visitDate,
        values: {
          goiterStatus: readValue(visit.data, ancField('goiterStatus')),
          tbSymptoms: readValue(visit.data, ancField('tbSymptoms'))
        },
        status: valueFilled(ancField('goiterStatus'), readValue(visit.data, ancField('goiterStatus'))) &&
          valueFilled(ancField('tbSymptoms'), readValue(visit.data, ancField('tbSymptoms'))) ? 'ok' : 'missing'
      };
    });
    screening.status = screening.visits.every(function (item) { return item.status === 'ok'; }) ? 'ok' : 'missing';
    screening.filledVisits = screening.visits.filter(function (item) { return item.status === 'ok'; }).length;
    category.groups.push(screening);

    if (otherRisk) {
      category.groups.push(groupFromVisits({
        key: 'otherMedicalConditionName', module: 'anc', mode: 'once', required: true,
        labelEn: 'Other medical condition', labelMm: 'အခြားကျန်းမာရေးပြဿနာ',
        hintEn: 'Shown because Other medical problems is checked in High Risk. Fill once for all visits.',
        hintMm: 'High Risk တွင် အခြားကျန်းမာရေးပြဿနာ ရွေးထားသောကြောင့် ပြထားသည်။ တစ်ကြိမ်သာ ဖြည့်ပါ။'
      }, visits, ancField('otherMedicalConditionName')));
    }

    category.groups.push(multiFieldGroup('medicines', ['ironFolicAcid', 'micronutrientsTablet', 'vitaminB1'], visits, {
      labelEn: 'Iron/folic, micronutrients, and vitamin B1',
      labelMm: 'သံဓာတ်နှင့် ဖောလစ်၊ အဏုအာဟာရ၊ ဘီဝမ်း',
      hintEn: 'These can change by visit. Prescribed on visit 1 is often Already Prescribed later.',
      hintMm: 'အကြိမ်အလိုက် တန်ဖိုးမတူနိုင်ပါ။ ပထမအကြိမ် Prescribed ဖြစ်လျှင် နောက်အကြိမ် Already Prescribed ဖြစ်တတ်သည်။'
    }));

    category.groups.push(multiFieldGroup('prevention', ['deworming', 'tetanusToxoid'], visits, {
      labelEn: 'Deworming and TD',
      labelMm: 'သန်ချဆေး နှင့် မေးခိုင်ကာကွယ်ဆေး',
      hintEn: 'TD should move forward only: Not given → TD1 → TD2 → Completed.',
      hintMm: 'TD သည် ရှေ့သို့သာ တက်ရမည်။ မထိုးရသေး → TD1 → TD2 → ပြီးမြောက်ပြီ။'
    }));

    category.groups.push(multiFieldGroup('diagnosis', ['provisionalDiagnosisType', 'provisionalDiagnosisOther'], visits, {
      labelEn: 'Provisional diagnosis',
      labelMm: 'ယာယီရောဂါသတ်မှတ်ချက်',
      hintEn: 'Use the same diagnosis for all visits, or change it per visit. Other needs a name.',
      hintMm: 'အကြိမ်အားလုံး တူညီစွာ သုံးနိုင်သည်။ Other ရွေးလျှင် အမည်ဖြည့်ပါ။'
    }, function (visit, values) {
      if (!values.provisionalDiagnosisType) return false;
      if (values.provisionalDiagnosisType === 'Other') return !!text(values.provisionalDiagnosisOther);
      return true;
    }));

    category.groups.push(groupFromVisits({
      key: 'cleanDeliveryKit', module: 'anc', mode: 'apply-choice', required: true,
      labelEn: 'Clean delivery kit', labelMm: 'တစ်ခါသုံးမွေးဖွားအိတ်',
      hintEn: 'Enter the distribution date, or choose Not given.',
      hintMm: 'ဖြန့်ဝေသည့်ရက် ထည့်ပါ။ မပေးခဲ့လျှင် Not given ရွေးပါ။'
    }, visits, ancField('cleanDeliveryKit')));

    return summarize(category);
  }

  function multiFieldGroup(key, keys, visits, labels, completeFn) {
    var fields = keys.map(ancField);
    var group = {
      key: key,
      keys: keys,
      module: 'anc',
      mode: 'apply-choice',
      required: true,
      counts: true,
      optional: false,
      labelEn: labels.labelEn,
      labelMm: labels.labelMm,
      hintEn: labels.hintEn || '',
      hintMm: labels.hintMm || '',
      editor: editorOf(fields[0]),
      fields: fields,
      proposedValue: '',
      visits: visits.map(function (visit) {
        var values = {};
        keys.forEach(function (fieldKey) { values[fieldKey] = readValue(visit.data, ancField(fieldKey)); });
        var ok = completeFn
          ? completeFn(visit, values)
          : keys.every(function (fieldKey) { return valueFilled(ancField(fieldKey), values[fieldKey]); });
        return {
          recordId: visit.id,
          visitNumber: visit.visitNumber,
          visitDate: visit.visitDate,
          values: values,
          status: ok ? 'ok' : 'missing'
        };
      })
    };
    group.filledVisits = group.visits.filter(function (item) { return item.status === 'ok'; }).length;
    group.totalVisits = group.visits.length;
    group.status = group.visits.every(function (item) { return item.status === 'ok'; }) ? 'ok' : 'missing';
    return group;
  }

  function scanLabs(bundle) {
    var tests = visitRows((bundle.testRecords || []).map(function (item) {
      return { id: item.id, data: Object.assign({}, item.data || {}, { visitDate: (item.data || {}).testDate }) };
    }));
    var category = categoryShell('test', 'Lab tests', 'ဓါတ်ခွဲစစ်ဆေးမှုများနှင့် ရလဒ်အဖြေများ', {
      optional: true,
      applicable: (bundle.ancVisits || []).length > 0 || tests.length > 0,
      visitCount: tests.length,
      canAdd: true
    });
    if (!category.applicable) return category;
    tests.forEach(function (test) {
      var field = testFields()[0];
      var current = readValue(test.data, field);
      category.groups.push({
        key: 'testDate',
        keys: ['testDate'],
        module: 'test',
        mode: 'once',
        recordId: test.id,
        required: false,
        counts: false,
        optional: true,
        status: valueFilled(field, current) ? 'ok' : 'missing',
        labelEn: 'Lab test date',
        labelMm: 'ဓာတ်ခွဲစစ်သည့်ရက်',
        editor: editorOf(field),
        fields: testFields(),
        visits: [{ recordId: test.id, visitDate: test.visitDate, currentValue: current, status: valueFilled(field, current) ? 'ok' : 'missing' }],
        proposedValue: current
      });
    });
    return summarize(category);
  }

  function scanDelivery(bundle) {
    var hasPnc = (bundle.pncVisits || []).length > 0;
    var delivery = bundle.delivery && bundle.delivery.data;
    var category = categoryShell('delivery', 'Delivery Notes', 'မွေးဖွားစဉ် စောင့်ရှောက်မှု', {
      applicable: hasPnc || !!delivery
    });
    if (!category.applicable) return category;
    if (!delivery) {
      category.groups.push({
        key: 'deliveryNotes',
        keys: deliveryFieldDefs().map(function (field) { return field.key; }),
        module: 'delivery',
        mode: 'once',
        create: true,
        required: true,
        counts: true,
        status: 'missing',
        labelEn: 'Complete Delivery Notes',
        labelMm: 'မွေးဖွားခြင်းမှတ်တမ်း အပြည့်ဖြည့်ရန်',
        hintEn: 'Every PNC mother needs a complete Delivery Note.',
        hintMm: 'PNC ရှိသော မိခင်တိုင်း Delivery Note အပြည့် ရှိရမည်။',
        editor: { type: 'group', fields: deliveryFieldDefs() },
        fields: deliveryFieldDefs(),
        visits: [],
        proposedValue: ''
      });
      return summarize(category);
    }
    var twins = text(getPath(delivery, ['deliveryDetails', 'pregnancyType']) || delivery.pregnancyType) === 'twins';
    deliveryFieldDefs().forEach(function (field) {
      if (field.key === 'babies') {
        var gaps = babyGaps(babiesOf(delivery), twins);
        category.groups.push({
          key: 'babies',
          keys: ['babies'],
          module: 'delivery',
          mode: 'once',
          required: true,
          counts: true,
          status: gaps.length ? 'missing' : 'ok',
          labelEn: field.labelEn,
          labelMm: field.labelMm,
          editor: editorOf(field),
          fields: [field],
          babyGaps: gaps,
          visits: [],
          proposedValue: babiesOf(delivery)
        });
        return;
      }
      var current = readValue(delivery, field);
      var filled = field.type === 'boolean' ? booleanOrNull(current) !== null : valueFilled(field, current);
      category.groups.push({
        key: field.key,
        keys: [field.key],
        module: 'delivery',
        mode: 'once',
        required: true,
        counts: true,
        status: filled ? 'ok' : 'missing',
        labelEn: field.labelEn,
        labelMm: field.labelMm,
        editor: editorOf(field),
        fields: [field],
        visits: [],
        proposedValue: current
      });
    });
    return summarize(category);
  }

  function scanPnc(bundle) {
    var visits = visitRows(bundle.pncVisits);
    var category = categoryShell('pnc', 'Postnatal care', 'မွေးပြီးမိခင်စောင့်ရှောက်မှု', {
      visitCount: visits.length,
      applicable: visits.length > 0
    });
    if (!visits.length) return category;
    category.groups.push(groupFromVisits({
      key: 'maternalOutcome', module: 'pnc', mode: 'apply-choice', required: true,
      labelEn: 'Maternal outcome', labelMm: 'မိခင်ရလဒ်',
      hintEn: 'This is already required on the PNC form. Fill any missing visit, or apply one value to all visits.',
      hintMm: 'PNC ဖောင်တွင် မဖြစ်မနေ ဖြည့်ရသည်။ လိုအပ်လျှင် အကြိမ်အားလုံးသို့ တူညီစွာ သုံးပါ။'
    }, visits, pncFields()[0]));
    var other = groupFromVisits({
      key: 'otherVisits', module: 'pnc', mode: 'once', required: false, optional: true, counts: false,
      labelEn: 'Other-facility visits', labelMm: 'အခြားဌာနတွင် ပြသခဲ့သောအကြိမ်များ',
      hintEn: 'Optional. Fill once if the mother had PNC elsewhere; it is copied to every PNC visit.',
      hintMm: 'မဖြည့်လည်း ရသည်။ အခြားဌာနတွင် PNC ယူခဲ့လျှင် တစ်ကြိမ်သာ ဖြည့်ပါ။'
    }, visits, pncFields()[1]);
    other.status = other.filledVisits ? 'ok' : 'optional';
    category.groups.push(other);
    return summarize(category);
  }

  function scanNewbornLinks(bundle) {
    var hasPnc = (bundle.pncVisits || []).length > 0;
    var category = categoryShell('newborn-links', 'Newborn care', 'မွေးကင်းစကလေးစောင့်ရှောက်မှု', {
      applicable: hasPnc
    });
    if (!hasPnc) return category;
    category.redirects = [
      {
        care: 'immediate',
        missing: !(bundle.immediateRecords || []).length,
        labelEn: 'Immediate newborn care',
        labelMm: 'မွေးပြီးပြီးချင်း ကလေးစောင့်ရှောက်မှု',
        href: 'immediate-newborn-care.html'
      },
      {
        care: 'newborn',
        missing: !(bundle.newbornVisits || []).length,
        labelEn: 'Newborn care',
        labelMm: 'မွေးကင်းစကလေး စောင့်ရှောက်မှု',
        href: 'newborn-care-page.html'
      }
    ];
    return summarize(category);
  }

  function scanPatient(bundle) {
    bundle = bundle || {};
    var patient = bundle.patient || {};
    var categories = [
      scanRegistration(patient),
      scanAnc(bundle, patient),
      scanLabs(bundle),
      scanDelivery(bundle),
      scanPnc(bundle),
      scanNewbornLinks(bundle)
    ];
    var gapCount = 0;
    categories.forEach(function (category) {
      if (!category.applicable) return;
      gapCount += category.missingCount;
    });
    return {
      patientId: patient.id || '',
      patientName: patient.name || '',
      age: patient.age == null ? '' : patient.age,
      gravida: gravidaOf(patient),
      gapCount: gapCount,
      categories: categories,
      modules: categories
    };
  }

  function coerceValue(field, raw, now) {
    if (isDangerous(raw)) return { error: error('This value cannot be saved.', 'ဤတန်ဖိုးကို မသိမ်းနိုင်ပါ။') };
    if (field.type === 'cdk') {
      if (raw === 'not_given' || (raw && raw.status === 'not_given')) {
        return { value: { status: 'not_given' } };
      }
      var dateValue = text(raw && raw.date != null ? raw.date : raw).slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) return { error: error('Enter the kit date or choose Not given.', 'အိတ်ပေးသည့်ရက် ထည့်ပါ သို့မဟုတ် Not given ရွေးပါ။') };
      if (dateValue > todayIso(now)) return { error: error('A back-fill date cannot be in the future.', 'ပြန်ဖြည့်သည့်ရက်သည် ယနေ့ထက် နောက်မကျရပါ။') };
      return { value: { status: 'given', date: dateValue } };
    }
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

  function collectionName(moduleName) {
    return {
      anc: 'antenatal_visits',
      test: 'testRecords',
      pnc: 'postpartum_visits'
    }[moduleName];
  }

  function collectionOf(bundle, moduleName) {
    return {
      anc: bundle.ancVisits,
      pnc: bundle.pncVisits,
      test: bundle.testRecords
    }[moduleName] || [];
  }

  function existingFor(bundle, request) {
    var rows = collectionOf(bundle, request.module);
    for (var i = 0; i < rows.length; i++) if (rows[i].id === request.recordId) return rows[i];
    return null;
  }

  function historicalVisitId(moduleName, visitNumber, visitDate) {
    return 'bf_' + moduleName + '_v' + visitNumber + '_' + text(visitDate).replace(/[^0-9]/g, '');
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

  function expandRequests(bundle, requests) {
    var out = [];
    (requests || []).forEach(function (request) {
      if (request.applyTo === 'all' && (request.module === 'anc' || request.module === 'pnc')) {
        collectionOf(bundle, request.module).forEach(function (visit) {
          out.push({ module: request.module, recordId: visit.id, values: request.values || {} });
        });
        return;
      }
      if (request.applyTo === 'per-visit' && request.visitValues) {
        Object.keys(request.visitValues).forEach(function (recordId) {
          out.push({ module: request.module, recordId: recordId, values: request.visitValues[recordId] || {} });
        });
        return;
      }
      out.push(request);
    });
    return out;
  }

  function validateTdSequence(bundle, expanded, errors) {
    var planned = {};
    expanded.forEach(function (request) {
      if (request.module !== 'anc' || !request.values || request.values.tetanusToxoid == null) return;
      planned[request.recordId] = normalizeTd(request.values.tetanusToxoid);
    });
    if (!Object.keys(planned).length) return;
    var sequence = visitRows(bundle.ancVisits).map(function (visit) {
      return {
        visitNumber: visit.visitNumber,
        td: planned[visit.id] || normalizeTd(readValue(visit.data, ancField('tetanusToxoid')))
      };
    }).filter(function (item) { return item.td; });
    for (var i = 1; i < sequence.length; i++) {
      if ((TD_RANK[sequence[i].td] == null) || (TD_RANK[sequence[i - 1].td] == null)) continue;
      if (TD_RANK[sequence[i].td] < TD_RANK[sequence[i - 1].td]) {
        errors.push(error(
          'TD on a later ANC visit cannot go backwards. Use Not given → TD1 → TD2 → Completed.',
          'နောက် ANC အကြိမ်တွင် TD နောက်ပြန်ဆုတ်၍ မရပါ။ မထိုးရသေး → TD1 → TD2 → ပြီးမြောက်ပြီ။'
        ));
        return;
      }
    }
  }

  function writeField(data, field, coerced, existing) {
    if (field.key === 'youngestChildAge') {
      data.youngest_child_age_years = coerced.value.years;
      data.youngest_child_age_months = coerced.value.months;
      return;
    }
    if (field.type === 'cdk') {
      data.cleanDeliveryKitStatus = coerced.value.status;
      data.cleanDeliveryKitNotGiven = coerced.value.status === 'not_given';
      if (coerced.value.status === 'given') data.cleanDeliveryKitDate = coerced.value.date;
      return;
    }
    setPath(data, field.path || [field.key], coerced.value);
    if (field.sync) Object.assign(data, field.sync(coerced.value));
  }

  function planFlat(bundle, request, actor, operations, errors) {
    if (!request.values || !Object.keys(request.values).length) return;
    var patient = bundle.patient || {};
    var fields = fieldMap(request.module);
    var existing = request.module === 'registration' ? { id: patient.id, data: patient } : existingFor(bundle, request);
    var creating = !request.recordId;
    var data = {};
    var changes = [];
    var values = request.values || {};

    if (creating && (request.module === 'anc' || request.module === 'pnc')) {
      errors.push(error('Back Fill updates existing visits only. Record a new visit from ANC or PNC care.', 'Back Fill သည် ရှိပြီးသားအကြိမ်များကိုသာ ပြင်သည်။ အသစ်ကို ANC/PNC မှ မှတ်ပါ။'));
      return;
    }
    if (creating && request.module === 'test') {
      var testDate = text(values.testDate).slice(0, 10);
      var matched = (bundle.testRecords || []).find(function (test) { return text((test.data || {}).testDate).slice(0, 10) === testDate; });
      request.recordId = matched ? matched.id : historicalVisitId('test', 1, testDate || 'undated');
      creating = !matched;
    }

    Object.keys(values).forEach(function (key) {
      if (BLOCKED_KEYS[key]) {
        errors.push(error('Patient identity fields cannot be changed here.', 'လူနာပိုင်ဆိုင်မှုအချက်အလက်ကို ဤနေရာတွင် မပြောင်းနိုင်ပါ။'));
        return;
      }
      var field = fields[key];
      if (!field) return;
      if (key === 'provisionalDiagnosisOther' && text(values.provisionalDiagnosisType) && text(values.provisionalDiagnosisType) !== 'Other') return;
      var coerced = coerceValue(field, values[key], actor.now);
      if (coerced.error) {
        errors.push(coerced.error);
        return;
      }
      if (key === 'otherVisits' && Array.isArray(coerced.value) && !coerced.value.length) return;
      var before = existing && existing.data ? (
        field.type === 'cdk' ? cdkValue(existing.data) : getPath(existing.data, field.path || [key])
      ) : '';
      if (before !== '' && before != null && (coerced.value === '' || coerced.value == null)) {
        errors.push(error('Existing clinical values cannot be cleared.', 'ရှိပြီးသား ဆေးမှတ်တမ်းကို ဖျက်၍ မရပါ။'));
        return;
      }
      writeField(data, field, coerced, existing && existing.data);
      changes.push({ field: key, before: before === '' ? null : before, after: coerced.value, kind: before === '' || before == null ? 'missing' : 'conflict' });
    });

    if (!Object.keys(data).length || errors.length) return;
    var path = request.module === 'registration'
      ? 'patients/' + patient.id
      : 'patients/' + patient.id + '/' + collectionName(request.module) + '/' + request.recordId;
    operations.push({
      kind: 'merge',
      path: path,
      create: creating,
      module: request.module,
      data: data,
      audit: changes.length ? { recordPath: path, changes: changes, reason: 'retroactive_backfill' } : null
    });
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
      notes: { thirdStage: existing.thirdStage, deliveryDetails: existing.deliveryDetails },
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

  function planWrites(bundle, requests, actor) {
    bundle = bundle || {};
    actor = actor || {};
    var patient = bundle.patient || {};
    var errors = [];
    var operations = [];
    if (!patient.id) errors.push(error('Choose a patient before saving.', 'မသိမ်းမီ လူနာရွေးပါ။'));
    if (actor.uid && !isOwnedMother(patient, actor.uid)) errors.push(error('Back Fill can update only patients you registered.', 'သင်မှတ်ပုံတင်ထားသော လူနာများကိုသာ ပြန်ဖြည့်နိုင်သည်။'));
    if (!requests || !requests.length) errors.push(error('Select at least one item to save.', 'သိမ်းမည့်အချက် အနည်းဆုံးတစ်ခု ရွေးပါ။'));
    var expanded = expandRequests(bundle, requests);
    validateTdSequence(bundle, expanded, errors);
    expanded.forEach(function (request) {
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

  function createTemplate(moduleName) {
    if (moduleName === 'test') {
      return { module: 'test', fields: testFields().filter(function (field) { return field.key === 'testDate'; }) };
    }
    if (moduleName === 'delivery') {
      return { module: 'delivery', fields: deliveryFieldDefs() };
    }
    return { module: moduleName, fields: [] };
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
    normalizeTd: normalizeTd,
    fieldMap: fieldMap,
    visitRows: visitRows
  };
});
