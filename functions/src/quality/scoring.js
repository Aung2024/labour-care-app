'use strict';

const QI_SCHEMA_VERSION = 'quality-improvement-v1';
const QI_TIME_ZONE = 'Asia/Yangon';

const REASON_CATEGORIES = Object.freeze([
  'knowledge_training',
  'infrastructure',
  'drugs',
  'supplies_equipment',
  'laboratory_test',
  'other'
]);

const INDICATOR_DEFS = Object.freeze([
  {
    id: 'skin_to_skin',
    source: 'immediate',
    field: 'skin_to_skin_contact',
    en: 'Immediate skin to skin contact with mother after birth',
    mm: 'မွေးကင်းစကလေးတိုင်းကို မွေးပြီးပြီးချင်း မိခင်နှင့်ကလေး အသားချင်းထိကပ်ထားသည်။',
    defaultTarget: 60
  },
  {
    id: 'thorough_drying',
    source: 'immediate',
    field: 'thorough_drying',
    en: 'Immediate drying after birth',
    mm: 'မွေးကင်းစကလေးတိုင်းကို မွေးပြီးပြီးချင်း ချက်ချင်း ကလေး၏တစ်ကိုယ်လုံးအား သန့်ရှင်းခြောက်သွေ့သော မျက်နှာသုတ်ပဝါ/အနှီးဖြင့် သေချာစွာသုတ်သည်။',
    defaultTarget: 80
  },
  {
    id: 'delayed_cord_clamping',
    source: 'immediate',
    field: 'delayed_cord_clamping',
    en: 'Delayed cord clamping (1-3 min) after birth',
    mm: 'မွေးကင်းစကလေးတိုင်းအားမွေးပြီး၁မိနစ်မှ၃မိနစ်အထိ စောင့်ဆိုင်းပြီးမှချက်ကြိုးကို ချက်ကြိုးညှပ်ကလစ်ဖြင့် ညှပ်ရမည်။',
    defaultTarget: 80
  },
  {
    id: 'early_breastfeeding',
    source: 'immediate',
    field: 'support_early_exclusive_breastfeeding',
    en: 'Breastfeeding within one hour of birth',
    mm: 'မွေးကင်းစကလေးများကို မွေးပြီးတစ်နာရီအတွင်း မိခင်နို့ တိုက်ကျွေးသည်။',
    defaultTarget: 80
  },
  {
    id: 'eye_care_teo',
    source: 'immediate',
    field: 'eye_care_teo',
    en: 'Provision of eye care with Tetra Eye Ointment (TEO)',
    mm: 'မွေးကင်းစကလေး မျက်စိပြုစုစောင့်ရှောက်မှုအတွက် TEO (Tetra Eye Ointment) မျက်စင်းဆေးရည်ကိုပေးသည်။',
    defaultTarget: 80
  },
  {
    id: 'vitamin_k',
    source: 'immediate',
    field: 'vitamin_k',
    en: 'Provision of vitamin K on first day of life',
    mm: 'ကလေးအသက် တစ်ရက်သားတွင် ဗိုက်တာမင်ကေ (vitamin K) ထိုးဆေးထိုးပေးသည်။',
    defaultTarget: 80
  },
  {
    id: 'vital_signs',
    source: 'newborn_visit',
    en: 'Vital signs monitoring (temperature, RR, HR)',
    mm: 'Vital signs စောင့်ကြည့်ဆန်းစစ်ခြင်း (ကိုယ်အပူချိန်၊အသက်ရှူနှုန်း၊နှလုံးခုန်နှုန်း)',
    defaultTarget: 80
  },
  {
    id: 'birth_weight',
    source: 'newborn_visit',
    en: 'Newborn birth weight',
    mm: 'မွေးကင်းစကလေး ကိုယ်အလေးချိန် တိုင်းတာခြင်း။',
    defaultTarget: 80
  },
  {
    id: 'pre_discharge_exam',
    source: 'newborn_visit',
    en: 'Full clinical examination before discharge (Infection, Jaundice, Cord, visible congenital anomalies)',
    mm: 'ကျေးလက်ကျန်းမာရေးဌာန/ဌာနခွဲများတွင် မွေးဖွား သော မွေးကင်းစကလေး တိုင်း အားကျန်းမာရေးဌာန မှ မဆင်းမီ ရောဂါပိုး ဝင်ရောက် ခြင်းရှိ၊မရှိ၊  အသားဝါ ခြင်းရှိ၊မရှိ၊ မျက်စိဖြင့် တွေ့နိုင်သောမွေးရာပါချို့ယွင်းချက်များရှိမရှိစသည်တို့ကိုသေချာစွာစမ်းသပ်စစ်ဆေးသည်။',
    defaultTarget: 80
  },
  {
    id: 'exclusive_breastfeeding',
    source: 'newborn_visit',
    en: 'Newborns received exclusively breastfeed from birth to discharge',
    mm: 'မွေးကင်းစကလေးများကို မွေးဖွားချိန်မှစ၍ ကျန်းမာရေးဌာနမှဆင်းသည်အထိ မိခင်နို့တစ်မျိုးတည်းကိုသာ တိုက်ကျွေးသည်။',
    defaultTarget: 80
  },
  {
    id: 'follow_up_schedule',
    source: 'newborn_visit',
    en: 'Mothers are scheduled follow up 3 times within 6 weeks (day 3, 7, 14 & 6 week)',
    mm: 'မိခင်အား ကလေးမွေးပြီးနောက်ပိုင်း မွေးကင်းစကလေးပြုစုစောင့်ရှောက်ခြင်းအတွက် ရက်ချိန်းပြန်ပြရန် အောက်ပါအတိုင်းသတ်မှတ်ထားရှိသည်။',
    defaultTarget: 80
  }
]);

const NEWBORN_INDICATOR_DEFS = INDICATOR_DEFS;

const ANC_INDICATOR_DEFS = Object.freeze([
  {
    id: 'anc_early',
    domain: 'antenatal',
    source: 'anc_visit',
    en: 'Early ANC visit (before 14 weeks)',
    mm: 'ကိုယ်ဝန် (၁၄)ပတ်အတွင်း ပထမဆုံး ANC ပြသခြင်း',
    defaultTarget: 80
  },
  {
    id: 'anc_dating',
    domain: 'antenatal',
    source: 'anc_visit',
    en: 'Pregnancy dating recorded (LMP and EDD, or manual dating)',
    mm: 'ကိုယ်ဝန်သက်တမ်း သတ်မှတ်ခြင်း (LMP နှင့် EDD)',
    defaultTarget: 80
  },
  {
    id: 'anc_bp',
    domain: 'antenatal',
    source: 'anc_visit',
    en: 'Blood pressure recorded',
    mm: 'သွေးပေါင်ချိန် တိုင်းတာမှတ်တမ်းတင်ခြင်း',
    defaultTarget: 80
  },
  {
    id: 'anc_weight',
    domain: 'antenatal',
    source: 'anc_visit',
    en: 'Weight recorded',
    mm: 'ကိုယ်အလေးချိန် တိုင်းတာမှတ်တမ်းတင်ခြင်း',
    defaultTarget: 80
  },
  {
    id: 'anc_ifa',
    domain: 'antenatal',
    source: 'anc_visit',
    en: 'Iron and folic acid prescribed',
    mm: 'သံဓာတ်နှင့် ဖောလစ်အက်ဆစ် ပေးခြင်း',
    defaultTarget: 80
  },
  {
    id: 'anc_td',
    domain: 'antenatal',
    source: 'anc_visit',
    en: 'Tetanus diphtheria (TD) status recorded',
    mm: 'မေးခိုင်၊ ဆုံဆို့နာ ကာကွယ်ဆေး (TD) မှတ်တမ်းတင်ခြင်း',
    defaultTarget: 80
  },
  {
    id: 'anc_danger_screen',
    domain: 'antenatal',
    source: 'anc_visit',
    en: 'Danger signs screened',
    mm: 'အန္တရာယ်လက္ခဏာ စစ်ဆေးခြင်း',
    defaultTarget: 80
  },
  {
    id: 'anc_high_risk',
    domain: 'antenatal',
    source: 'anc_visit',
    en: 'High-risk status documented',
    mm: 'အန္တရာယ်ဖြစ်နိုင်ခြေ မှတ်တမ်းတင်ခြင်း',
    defaultTarget: 80
  },
  {
    id: 'anc_next_visit',
    domain: 'antenatal',
    source: 'anc_visit',
    en: 'Next ANC visit date scheduled',
    mm: 'နောက်တစ်ကြိမ် ANC ပြန်ပြရက် သတ်မှတ်ခြင်း',
    defaultTarget: 80
  },
  {
    id: 'anc_diagnosis',
    domain: 'antenatal',
    source: 'anc_visit',
    en: 'Provisional diagnosis recorded',
    mm: 'ယာယီရောဂါသတ်မှတ်ချက် မှတ်တမ်းတင်ခြင်း',
    defaultTarget: 80
  },
  {
    id: 'anc_hiv_syphilis',
    domain: 'antenatal',
    source: 'anc_test',
    en: 'HIV and syphilis test results recorded',
    mm: 'HIV နှင့် ကာလသားရောဂါ စစ်ဆေးမှု ရလဒ် မှတ်တမ်းတင်ခြင်း',
    defaultTarget: 80
  },
  {
    id: 'anc_hemoglobin',
    domain: 'antenatal',
    source: 'anc_test',
    en: 'Hemoglobin result recorded',
    mm: 'သွေးအား (Hb) ရလဒ် မှတ်တမ်းတင်ခြင်း',
    defaultTarget: 80
  }
]);

function indicatorDefsForDomain(domain) {
  if (domain === 'antenatal') return ANC_INDICATOR_DEFS;
  if (domain === 'all') return INDICATOR_DEFS.concat(ANC_INDICATOR_DEFS);
  return INDICATOR_DEFS;
}

function isAffirmative(value) {
  return value === true || ['yes', 'y', 'true', '1'].includes(String(value || '').toLowerCase().trim());
}

function hasNumericValue(value) {
  return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
}

function timestampToDate(value) {
  if (value == null || value === '') return null;
  if (typeof value.toDate === 'function') return value.toDate();
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value : null;
  if (typeof value === 'object' && typeof value.seconds === 'number') {
    return new Date(value.seconds * 1000 + Math.floor((value.nanoseconds || 0) / 1e6));
  }
  if (typeof value === 'number') {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date : null;
  }
  const text = String(value).trim();
  if (!text || /^\d{1,2}:\d{2}(:\d{2})?$/.test(text)) return null;
  const parsed = new Date(text.length === 10 ? text + 'T00:00:00+06:30' : text);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function monthKeyForDate(date) {
  const value = timestampToDate(date);
  if (!value) return null;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: QI_TIME_ZONE,
    year: 'numeric',
    month: '2-digit'
  }).formatToParts(value);
  const year = parts.find((part) => part.type === 'year').value;
  const month = parts.find((part) => part.type === 'month').value;
  return year + '-' + month;
}

function dateFromFields(data, fields) {
  for (const field of fields || []) {
    const date = timestampToDate(data && data[field]);
    if (date) return date;
  }
  return null;
}

function emptyIndicatorTotals(defs) {
  return (defs || INDICATOR_DEFS).reduce((result, indicator) => {
    result[indicator.id] = { numerator: 0, denominator: 0, percentage: 0 };
    return result;
  }, {});
}

function percentage(numerator, denominator) {
  if (!denominator) return 0;
  return Math.round((numerator / denominator) * 1000) / 10;
}

function providerFromRecord(record, patient) {
  const data = record || {};
  const profile = patient || {};
  return data.recordedBy || data.recorded_by || data.createdBy || data.created_by ||
    profile.created_by || profile.createdBy || null;
}

function hasImmediateCareRecord(record) {
  if (!record || typeof record !== 'object') return false;
  return INDICATOR_DEFS.filter((item) => item.source === 'immediate').some((item) => {
    return Object.prototype.hasOwnProperty.call(record, item.field);
  }) || isAffirmative(record.spontaneous_breathing) ||
    isAffirmative(record.gasping_or_no_breathing) ||
    hasNumericValue(record.apgar_1min) ||
    hasNumericValue(record.apgar_5min);
}

function visitNumberOf(data) {
  return Number((data && (data.visit_number || data.visitNumber)) || 0);
}

function sortedNewbornVisits(visits) {
  return (visits || []).slice().sort((left, right) => {
    const leftNumber = visitNumberOf(left) || 999;
    const rightNumber = visitNumberOf(right) || 999;
    if (leftNumber !== rightNumber) return leftNumber - rightNumber;
    const leftDate = dateFromFields(left, ['visitDate', 'visit_date', 'timestamp', 'createdAt']);
    const rightDate = dateFromFields(right, ['visitDate', 'visit_date', 'timestamp', 'createdAt']);
    return (leftDate ? leftDate.getTime() : 0) - (rightDate ? rightDate.getTime() : 0);
  });
}

function babyKeysFromVisit(visit, patientId) {
  const babies = Array.isArray(visit && visit.babies) ? visit.babies : [];
  if (babies.length) {
    return babies.map((baby, index) => {
      const babyIndex = Number(baby.babyIndex || baby.baby_index || index + 1) || (index + 1);
      return String(patientId) + ':baby:' + babyIndex;
    });
  }
  const count = Math.max(1, Number(visit && (visit.baby_count || visit.babyCount)) || 1);
  return Array.from({ length: count }, (_, index) => String(patientId) + ':baby:' + (index + 1));
}

function hasCompleteVitals(visit) {
  return hasNumericValue(visit.temperature) &&
    hasNumericValue(visit.heart_rate) &&
    hasNumericValue(visit.respiration_rate);
}

function hasBirthWeight(visit) {
  return hasNumericValue(visit.body_weight_gram) ||
    hasNumericValue(visit.birth_weight_gram) ||
    hasNumericValue(visit.body_weight_kg) ||
    hasNumericValue(visit.birth_weight_kg);
}

function hasPreDischargeExam(visit) {
  const cordSet = visit.cord_care === 'yes' || visit.cord_care === 'no' || isAffirmative(visit.cord_care);
  const eyeSet = !!visit.eye_infection_status || !!visit.eye_care_status;
  const anatomyReviewed = Object.prototype.hasOwnProperty.call(visit, 'anatomy_abnormalities');
  const dangerReviewed = Array.isArray(visit.danger_signs) ||
    Object.prototype.hasOwnProperty.call(visit, 'danger_signs');
  return cordSet && eyeSet && anatomyReviewed && dangerReviewed;
}

function hasExclusiveBreastfeeding(visit) {
  return isAffirmative(visit.exclusive_breastfeeding_on_demand);
}

function hasFollowUpSchedule(visit) {
  if (visit.follow_up_appointment_date || visit.followUpAppointmentDate) return true;
  const other = Array.isArray(visit.otherVisits) ? visit.otherVisits : [];
  if (other.length >= 2) return true;
  return false;
}

function evaluateVisitIndicator(indicatorId, visit) {
  if (indicatorId === 'vital_signs') return hasCompleteVitals(visit);
  if (indicatorId === 'birth_weight') return hasBirthWeight(visit);
  if (indicatorId === 'pre_discharge_exam') return hasPreDischargeExam(visit);
  if (indicatorId === 'exclusive_breastfeeding') return hasExclusiveBreastfeeding(visit);
  if (indicatorId === 'follow_up_schedule') return hasFollowUpSchedule(visit);
  return false;
}

function emptyProviderBucket(providerId, month) {
  return {
    providerId: providerId || '',
    month,
    indicators: emptyIndicatorTotals(),
    babyKeys: {
      immediate: new Set(),
      newborn_visit: new Set()
    }
  };
}

function ensureProviderBucket(map, providerId, month) {
  const key = String(providerId || 'unknown');
  if (!map.has(key)) map.set(key, emptyProviderBucket(key, month));
  return map.get(key);
}

/**
 * Builds per-provider monthly QI indicator totals for one patient.
 * Counts each unique baby once per indicator source within the month.
 */
function calculatePatientQualityContribution(patient, activity, month) {
  const profile = patient || {};
  const patientId = profile.id || profile.patientId || 'unknown';
  const immediateRecords = Array.isArray(activity && activity.immediateNewbornCare)
    ? activity.immediateNewbornCare
    : (activity && activity.immediateNewbornCare ? [activity.immediateNewbornCare] : []);
  const newbornVisits = Array.isArray(activity && activity.newbornCare)
    ? activity.newbornCare
    : [];
  const byProvider = new Map();

  immediateRecords.forEach((record) => {
    if (!hasImmediateCareRecord(record)) return;
    const eventDate = dateFromFields(record, ['timestamp', 'createdAt', 'created_at', 'recordedAt', 'visitDate']);
    if (!eventDate || (month !== 'all' && monthKeyForDate(eventDate) !== month)) return;
    const providerId = providerFromRecord(record, profile);
    if (!providerId) return;
    const bucket = ensureProviderBucket(byProvider, providerId, month);
    const visitForBabies = sortedNewbornVisits(newbornVisits)[0] || {};
    const babyKeys = babyKeysFromVisit(visitForBabies, patientId);
    babyKeys.forEach((babyKey) => {
      if (bucket.babyKeys.immediate.has(babyKey)) return;
      bucket.babyKeys.immediate.add(babyKey);
      INDICATOR_DEFS.filter((item) => item.source === 'immediate').forEach((indicator) => {
        const totals = bucket.indicators[indicator.id];
        totals.denominator += 1;
        if (isAffirmative(record[indicator.field])) totals.numerator += 1;
      });
    });
  });

  const monthVisits = sortedNewbornVisits(newbornVisits).filter((visit) => {
    const eventDate = dateFromFields(visit, ['visitDate', 'visit_date', 'timestamp', 'createdAt', 'created_at']);
    return eventDate && (month === 'all' || monthKeyForDate(eventDate) === month);
  });

  const firstVisitByBaby = new Map();
  monthVisits.forEach((visit) => {
    babyKeysFromVisit(visit, patientId).forEach((babyKey) => {
      if (!firstVisitByBaby.has(babyKey)) firstVisitByBaby.set(babyKey, visit);
    });
  });

  firstVisitByBaby.forEach((visit, babyKey) => {
    const providerId = providerFromRecord(visit, profile);
    if (!providerId) return;
    const bucket = ensureProviderBucket(byProvider, providerId, month);
    if (bucket.babyKeys.newborn_visit.has(babyKey)) return;
    bucket.babyKeys.newborn_visit.add(babyKey);
    INDICATOR_DEFS.filter((item) => item.source === 'newborn_visit').forEach((indicator) => {
      const totals = bucket.indicators[indicator.id];
      totals.denominator += 1;
      if (evaluateVisitIndicator(indicator.id, visit)) totals.numerator += 1;
    });
  });

  const providers = {};
  byProvider.forEach((bucket, providerId) => {
    const indicators = {};
    INDICATOR_DEFS.forEach((indicator) => {
      const totals = bucket.indicators[indicator.id];
      indicators[indicator.id] = {
        numerator: totals.numerator,
        denominator: totals.denominator,
        percentage: percentage(totals.numerator, totals.denominator)
      };
    });
    providers[providerId] = {
      providerId,
      month,
      patientId,
      schemaVersion: QI_SCHEMA_VERSION,
      indicators,
      immediateBabyCount: bucket.babyKeys.immediate.size,
      newbornVisitBabyCount: bucket.babyKeys.newborn_visit.size
    };
  });

  return {
    patientId,
    month,
    schemaVersion: QI_SCHEMA_VERSION,
    providers
  };
}

function visitNumberOfAnc(data) {
  return Number((data && (data.visit_number || data.visitNumber)) || 0);
}

function sortedAncVisits(visits) {
  return (visits || []).slice().sort((left, right) => {
    const leftDate = dateFromFields(left, ['visitDate', 'visit_date', 'timestamp', 'createdAt', 'created_at']);
    const rightDate = dateFromFields(right, ['visitDate', 'visit_date', 'timestamp', 'createdAt', 'created_at']);
    const leftTime = leftDate ? leftDate.getTime() : 0;
    const rightTime = rightDate ? rightDate.getTime() : 0;
    if (leftTime !== rightTime) return leftTime - rightTime;
    return visitNumberOfAnc(left) - visitNumberOfAnc(right);
  });
}

function sortedAncTests(tests) {
  return (tests || []).slice().sort((left, right) => {
    const leftDate = dateFromFields(left, ['testDate', 'test_date', 'timestamp', 'createdAt', 'created_at']);
    const rightDate = dateFromFields(right, ['testDate', 'test_date', 'timestamp', 'createdAt', 'created_at']);
    return (leftDate ? leftDate.getTime() : 0) - (rightDate ? rightDate.getTime() : 0);
  });
}

function isAncMedicationRecorded(value) {
  const key = String(value || '').trim();
  return key === 'Prescribed' || key === 'Given' || key === 'Already Prescribed';
}

function hasTdStatus(visit) {
  const key = String((visit && (visit.tetanusToxoid || visit.td)) || '').trim();
  if (!key || key === 'Not Prescribed') return false;
  return ['TD1', 'TD2', 'Completed', 'Prescribed', 'Already Prescribed', 'Given'].includes(key);
}

function hasBloodPressure(visit) {
  if (hasNumericValue(visit && visit.systolicBP) && hasNumericValue(visit && visit.diastolicBP)) return true;
  const raw = String((visit && (visit.bloodPressure || visit.bp)) || '').trim();
  const match = raw.match(/^(\d{2,3})\s*\/\s*(\d{2,3})$/);
  return !!(match && Number(match[1]) > 0 && Number(match[2]) > 0);
}

function hasPregnancyDating(visit) {
  const status = String((visit && visit.lmpStatus) || '').toLowerCase();
  const lmp = visit && visit.lmp;
  const edd = visit && (visit.edd || visit.manualEdd);
  if (status === 'unknown') {
    return hasNumericValue(visit.manualGestationalAge) || !!(visit.manualEdd || visit.manualEDD);
  }
  return !!(lmp && edd);
}

function isEarlyAncVisit(visit, patient) {
  if (!visit) return false;
  if (visit.early_anc_visit === true || isAffirmative(visit.early_anc_visit)) return true;
  if (visit.early_anc_visit === false) return false;
  const visitDate = dateFromFields(visit, ['visitDate', 'visit_date', 'timestamp', 'createdAt', 'created_at']);
  const profile = patient || {};
  const lmp = visit.lmp || profile.lmp || (profile.profile && profile.profile.lmp);
  if (lmp && visit.lmpStatus !== 'unknown' && visitDate) {
    const lmpDate = timestampToDate(lmp);
    if (lmpDate) {
      const days = Math.floor((visitDate.getTime() - lmpDate.getTime()) / 86400000);
      if (days >= 0) return days < 98;
    }
  }
  const ga = parseFloat(
    visit.gestationalAge ?? visit.gestational_age ?? visit.ga_weeks ?? visit.manualGestationalAge
  );
  return Number.isFinite(ga) && ga > 0 && ga < 14;
}

function hasHighRiskDocumented(visit) {
  const hr = String((visit && (visit.high_risk || visit.highRisk)) || '').toLowerCase();
  if (hr === 'no' || hr === 'false') return true;
  if (hr === 'yes' || hr === 'true') {
    const factors = (visit && (visit.risk_factors || visit.riskFactors)) || [];
    return Array.isArray(factors) && factors.length >= 1;
  }
  return false;
}

function hasProvisionalDiagnosis(visit) {
  const type = String((visit && visit.provisionalDiagnosisType) || '').trim();
  if (!type) return false;
  if (type.toLowerCase() === 'other') {
    return !!String((visit && visit.provisionalDiagnosisOther) || '').trim();
  }
  return true;
}

function hasLabResult(value) {
  const text = String(value == null ? '' : value).trim();
  if (!text) return false;
  return text.toLowerCase() !== 'no test yet';
}

function evaluateAncIndicator(indicatorId, record, patient) {
  if (indicatorId === 'anc_early') return isEarlyAncVisit(record, patient);
  if (indicatorId === 'anc_dating') return hasPregnancyDating(record);
  if (indicatorId === 'anc_bp') return hasBloodPressure(record);
  if (indicatorId === 'anc_weight') return hasNumericValue(record && record.weight);
  if (indicatorId === 'anc_ifa') return isAncMedicationRecorded(record && record.ironFolicAcid);
  if (indicatorId === 'anc_td') return hasTdStatus(record);
  if (indicatorId === 'anc_danger_screen') {
    const danger = String((record && record.dangerSignsPresent) || '').toLowerCase();
    return danger === 'yes' || danger === 'no';
  }
  if (indicatorId === 'anc_high_risk') return hasHighRiskDocumented(record);
  if (indicatorId === 'anc_next_visit') return !!(record && (record.nextVisitDate || record.next_visit_date));
  if (indicatorId === 'anc_diagnosis') return hasProvisionalDiagnosis(record);
  if (indicatorId === 'anc_hiv_syphilis') {
    return hasLabResult(record && record.hivResult) &&
      hasLabResult(record && (record.syphilisResult || record.vdrlResult));
  }
  if (indicatorId === 'anc_hemoglobin') return hasNumericValue(record && record.hemoglobinResult);
  return false;
}

function calculatePatientAncContribution(patient, activity, month) {
  const profile = patient || {};
  const patientId = profile.id || profile.patientId || 'unknown';
  const visits = Array.isArray(activity && activity.antenatalVisits) ? activity.antenatalVisits : [];
  const tests = Array.isArray(activity && activity.testRecords) ? activity.testRecords : [];
  const byProvider = {};

  function ensure(providerId) {
    if (!byProvider[providerId]) {
      byProvider[providerId] = {
        providerId,
        indicators: emptyIndicatorTotals(ANC_INDICATOR_DEFS)
      };
    }
    return byProvider[providerId];
  }

  const monthVisits = sortedAncVisits(visits).filter((visit) => {
    const eventDate = dateFromFields(visit, ['visitDate', 'visit_date', 'timestamp', 'createdAt', 'created_at']);
    return eventDate && (month === 'all' || monthKeyForDate(eventDate) === month);
  });
  const firstVisit = monthVisits[0];
  if (firstVisit) {
    const visitProviderId = providerFromRecord(firstVisit, profile);
    if (visitProviderId) {
      const visitBucket = ensure(visitProviderId);
      ANC_INDICATOR_DEFS.filter((item) => item.source === 'anc_visit').forEach((indicator) => {
        const totals = visitBucket.indicators[indicator.id];
        totals.denominator += 1;
        if (evaluateAncIndicator(indicator.id, firstVisit, profile)) totals.numerator += 1;
      });
    }
  }

  const monthTests = sortedAncTests(tests).filter((test) => {
    const eventDate = dateFromFields(test, ['testDate', 'test_date', 'timestamp', 'createdAt', 'created_at']);
    return eventDate && (month === 'all' || monthKeyForDate(eventDate) === month);
  });
  const firstTest = monthTests[0];
  if (firstTest) {
    const testProviderId = providerFromRecord(firstTest, profile);
    if (testProviderId) {
      const testBucket = ensure(testProviderId);
      ANC_INDICATOR_DEFS.filter((item) => item.source === 'anc_test').forEach((indicator) => {
        const totals = testBucket.indicators[indicator.id];
        totals.denominator += 1;
        if (evaluateAncIndicator(indicator.id, firstTest, profile)) totals.numerator += 1;
      });
    }
  }

  Object.keys(byProvider).forEach((providerId) => {
    const bucket = byProvider[providerId];
    ANC_INDICATOR_DEFS.forEach((indicator) => {
      const totals = bucket.indicators[indicator.id];
      totals.percentage = percentage(totals.numerator, totals.denominator);
    });
  });

  return { patientId, month, schemaVersion: QI_SCHEMA_VERSION, providers: byProvider };
}

function mergeIndicatorTotals(left, right) {
  const result = emptyIndicatorTotals();
  INDICATOR_DEFS.forEach((indicator) => {
    const a = (left && left[indicator.id]) || { numerator: 0, denominator: 0 };
    const b = (right && right[indicator.id]) || { numerator: 0, denominator: 0 };
    const numerator = (a.numerator || 0) + (b.numerator || 0);
    const denominator = (a.denominator || 0) + (b.denominator || 0);
    result[indicator.id] = {
      numerator,
      denominator,
      percentage: percentage(numerator, denominator)
    };
  });
  return result;
}

function summarizeProviderFromContributions(contributions, providerMeta, month) {
  const indicators = emptyIndicatorTotals();
  (contributions || []).forEach((contribution) => {
    const providerPart = contribution && contribution.providers &&
      contribution.providers[providerMeta.providerId];
    if (!providerPart) return;
    Object.assign(indicators, mergeIndicatorTotals(indicators, providerPart.indicators));
  });
  let scored = 0;
  let totalPct = 0;
  INDICATOR_DEFS.forEach((indicator) => {
    const item = indicators[indicator.id];
    if (item.denominator > 0) {
      scored += 1;
      totalPct += item.percentage;
    }
  });
  return {
    month,
    providerId: providerMeta.providerId,
    providerName: providerMeta.providerName || '',
    township: providerMeta.township || '',
    region: providerMeta.region || '',
    facilityCode: providerMeta.facilityCode || '',
    schemaVersion: QI_SCHEMA_VERSION,
    indicators,
    summaryPercentage: scored ? Math.round((totalPct / scored) * 10) / 10 : 0,
    indicatorCount: INDICATOR_DEFS.length,
    scoredIndicatorCount: scored,
    calculatedAt: null
  };
}

function isValidReasonCategory(value) {
  return REASON_CATEGORIES.includes(String(value || ''));
}

function isValidTargetPercent(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && number <= 100;
}

function scoreBand(percent) {
  const value = Number(percent);
  if (!Number.isFinite(value) || value < 50) return 'red';
  if (value < 80) return 'yellow';
  return 'green';
}

function nextMonthKey(month) {
  const match = String(month || '').match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;
  let year = Number(match[1]);
  let monthNumber = Number(match[2]) + 1;
  if (monthNumber > 12) {
    monthNumber = 1;
    year += 1;
  }
  return year + '-' + String(monthNumber).padStart(2, '0');
}

function previousMonthKey(month) {
  const match = String(month || '').match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;
  let year = Number(match[1]);
  let monthNumber = Number(match[2]) - 1;
  if (monthNumber < 1) {
    monthNumber = 12;
    year -= 1;
  }
  return year + '-' + String(monthNumber).padStart(2, '0');
}

function currentYangonMonthKey(now) {
  return monthKeyForDate(now || new Date());
}

module.exports = {
  QI_SCHEMA_VERSION,
  QI_TIME_ZONE,
  REASON_CATEGORIES,
  INDICATOR_DEFS,
  NEWBORN_INDICATOR_DEFS,
  ANC_INDICATOR_DEFS,
  indicatorDefsForDomain,
  isAffirmative,
  monthKeyForDate,
  timestampToDate,
  emptyIndicatorTotals,
  percentage,
  calculatePatientQualityContribution,
  calculatePatientAncContribution,
  evaluateAncIndicator,
  mergeIndicatorTotals,
  summarizeProviderFromContributions,
  isValidReasonCategory,
  isValidTargetPercent,
  nextMonthKey,
  scoreBand,
  previousMonthKey,
  currentYangonMonthKey,
  evaluateVisitIndicator,
  hasImmediateCareRecord,
  babyKeysFromVisit
};
