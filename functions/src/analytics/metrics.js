'use strict';

const ANALYTICS_SCHEMA_VERSION = 'analytics-v1';
const ANALYTICS_TIME_ZONE = 'Asia/Yangon';
const YANGON_OFFSET_MS = 6.5 * 60 * 60 * 1000;

const SCALAR_KEYS = [
  'total', 'newClients', 'earlyAnc', 'highRisk', 'lcgCompleted', 'labComplete', 'ultrasound',
  'severeAnemia', 'mildAnemia', 'noAnemia', 'hivPos', 'syphilisPos', 'malariaPos', 'hepBPos',
  'hepCPos', 'homeDel', 'instDel', 'totalDeliveries', 'uterotonic', 'pnc48h', 'pnc42d',
  'nbRecords', 'resuscitated', 'lowBW', 'pncReceived', 'pphCases', 'maternalOutcomeAlive',
  'maternalOutcomeDeadObstetric', 'maternalOutcomeDeadOther', 'newbornOutcomeAlive',
  'newbornOutcomeStillbirth', 'newbornOutcomeNeonatalDeath', 'ancTransfer', 'labourTransfer',
  'pncTransfer', 'statusAnc', 'statusLabour', 'statusPnc', 'statusRegistered', 'pncVitB',
  'pncVitA', 'pncIronFolic', 'pncContraception', 'pncDangerSigns', 'pncVisitsTotal',
  'maternalAlive', 'maternalDead', 'newbornAlive', 'newbornDead', 'oxytocinYes', 'oxytocinNo',
  'ttComplete', 'ttIncomplete', 'folicGiven', 'folicNotGiven', 'ancReceived',
  'earlyAncAmongAnc', 'ancVisitsLt4', 'ancVisits4to7', 'ancVisits8Plus', 'ancSevereAnemia',
  'ancMildAnemia', 'ancNoAnemia', 'gbvPatients', 'ironMicroGiven', 'ironMicroNotGiven',
  'vitB1Given', 'vitB1NotGiven', 'hivScreenPositive', 'syphilisScreenPositive',
  'hivScreenNegative', 'notTested', 'patientsWithLabRecord', 'hivSyphScreenedPatients',
  'visits0', 'visits1to3', 'visits4plus', 'visits8plus', 'with4Plus', 'noAnc',
  'hrtCurrent', 'hrtOnTrack', 'hrtOverdue', 'hrtLost', 'hrtCompleted', 'hrtCompletedAlive',
  'hrtCompletedDeath', 'hrtCompletedTransfer'
];

const MAP_KEYS = [
  'monthlyGbv', 'referralReasonCounts', 'monthlyReg', 'monthlyHighRisk',
  'monthlyHighRiskByMidwife', 'monthlyHighRiskByTsp', 'monthlyHighRiskByRegion',
  'monthlyAnemia', 'monthlyCoinfection', 'monthlyLcg', 'ageGroups', 'riskFactors',
  'gaGroups', 'tspAggregates', 'pncTimingGroups', 'dangerSignCounts', 'bwGroups'
];

function requiredFactsForIndicator(key) {
  if (/^hrt/i.test(key)) return ['profile', 'antenatalVisits', 'hrtActions'];
  if (/pnc|maternalOutcome|pph|dangerSign/i.test(key)) return ['profile', 'postpartumVisits', 'birthRecord'];
  if (/newborn|bwGroups|lowBW|resuscitated|nbRecords/i.test(key)) {
    return ['birthRecord', 'deliveryNotes', 'newbornCare', 'immediateNewbornCare'];
  }
  if (/lab|anemia|hiv|syphilis|malaria|hep|ultrasound|Coinfection/i.test(key)) return ['testRecords'];
  if (/delivery|Deliveries|lcg|Lcg|uterotonic|oxytocin|homeDel|instDel/i.test(key)) {
    return ['summary', 'startingTimeDoc', 'secondStageDoc', 'thirdStage', 'birthRecord'];
  }
  if (/transfer|referral/i.test(key)) return ['profile', 'transferRecord', 'postpartumVisits'];
  if (/anc|Anc|highRisk|HighRisk|riskFactors|ga|Ga|tt|folic|vitB1|iron|gbv|visits|with4Plus|noAnc/i.test(key)) {
    return ['profile', 'antenatalVisits'];
  }
  return ['profile'];
}

function indicatorDefinition(key, kind) {
  return Object.freeze({
    key,
    definitionVersion: ANALYTICS_SCHEMA_VERSION,
    definition: `Dashboard metric ${key}, ported from the legacy single-pass dashboard calculation.`,
    requiredFactFields: Object.freeze(requiredFactsForIndicator(key)),
    aggregation: kind === 'points' ? 'concatenate' : 'sum',
    outputShape: kind === 'counter' ? 'number' : kind === 'points' ? 'array' : 'nested-number-map',
    kind
  });
}

const INDICATOR_REGISTRY = Object.freeze([
  ...SCALAR_KEYS.map((key) => indicatorDefinition(key, 'counter')),
  ...MAP_KEYS.map((key) => indicatorDefinition(key, 'map')),
  indicatorDefinition('gaVisitPoints', 'points')
]);

function unwrap(value) {
  if (!value || typeof value !== 'object') return {};
  return value.data && typeof value.data === 'object' ? value.data : value;
}

function parseDateValue(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? new Date(value.getTime()) : null;
  if (typeof value.toDate === 'function') return parseDateValue(value.toDate());
  if (typeof value === 'object' && typeof value.seconds === 'number') {
    const millis = value.seconds * 1000 + Math.floor((value.nanoseconds || 0) / 1e6);
    return new Date(millis);
  }
  if (typeof value === 'number') {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date : null;
  }
  const text = String(value).trim();
  if (!text || /^\d{1,2}:\d{2}(:\d{2})?$/.test(text)) return null;
  let match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) return yangonDate(Number(match[1]), Number(match[2]), Number(match[3]));
  match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (match) return yangonDate(Number(match[3]), Number(match[2]), Number(match[1]));
  const date = new Date(text);
  return Number.isFinite(date.getTime()) ? date : null;
}

function yangonDate(year, month, day, endOfDay) {
  const utc = Date.UTC(year, month - 1, day, endOfDay ? 23 : 0, endOfDay ? 59 : 0,
    endOfDay ? 59 : 0, endOfDay ? 999 : 0) - YANGON_OFFSET_MS;
  return new Date(utc);
}

function yangonParts(value) {
  const date = parseDateValue(value);
  if (!date) return null;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: ANALYTICS_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(date);
  const get = (type) => Number(parts.find((part) => part.type === type).value);
  return { year: get('year'), month: get('month'), day: get('day') };
}

function monthKeyForDate(value) {
  const parts = yangonParts(value);
  return parts ? `${parts.year}-${String(parts.month).padStart(2, '0')}` : 'Unknown';
}

function quarterKeyForDate(value) {
  const parts = yangonParts(value);
  return parts ? `${parts.year}-Q${Math.ceil(parts.month / 3)}` : null;
}

function yearKeyForDate(value) {
  const parts = yangonParts(value);
  return parts ? String(parts.year) : null;
}

function periodKeyForDate(value, grain) {
  if (grain === 'all') return 'all';
  if (grain === 'year') return yearKeyForDate(value);
  if (grain === 'quarter') return quarterKeyForDate(value);
  return monthKeyForDate(value);
}

function analyticsPeriodsForDate(value) {
  return ['all', 'month', 'quarter', 'year'].map((type) => {
    const key = periodKeyForDate(value, type);
    return Object.assign({ type }, periodForKey(key));
  });
}

function periodForKey(key) {
  if (!key || key === 'all') return { key: 'all', start: null, end: null };
  let match = String(key).match(/^(\d{4})-(\d{2})$/);
  let year;
  let startMonth;
  let endMonth;
  if (match) {
    year = Number(match[1]); startMonth = Number(match[2]); endMonth = startMonth;
    if (startMonth < 1 || startMonth > 12) throw new RangeError(`Invalid analytics period: ${key}`);
  } else {
    match = String(key).match(/^(\d{4})-Q([1-4])$/);
    if (match) {
      year = Number(match[1]); startMonth = (Number(match[2]) - 1) * 3 + 1; endMonth = startMonth + 2;
    } else if (/^\d{4}$/.test(String(key))) {
      year = Number(key); startMonth = 1; endMonth = 12;
    } else {
      throw new RangeError(`Invalid analytics period: ${key}`);
    }
  }
  const nextYear = endMonth === 12 ? year + 1 : year;
  const nextMonth = endMonth === 12 ? 1 : endMonth + 1;
  return {
    key: String(key),
    start: yangonDate(year, startMonth, 1),
    end: new Date(yangonDate(nextYear, nextMonth, 1).getTime() - 1)
  };
}

function normalizePeriod(period) {
  if (period == null || period === 'all') return periodForKey('all');
  if (typeof period === 'string') return periodForKey(period);
  const hasExplicitBounds = period.start != null || period.end != null;
  const recognizedKey = !period.key || period.key === 'all' || /^\d{4}(-\d{2}|-Q[1-4])?$/.test(period.key);
  const fromKey = recognizedKey ? periodForKey(period.key || 'all') : periodForKey('all');
  if (!recognizedKey && !hasExplicitBounds) throw new RangeError(`Invalid analytics period: ${period.key}`);
  const start = period.start == null ? fromKey.start : parseDateValue(period.start);
  let end = period.end == null ? fromKey.end : parseDateValue(period.end);
  if (typeof period.end === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(period.end)) {
    const p = yangonParts(period.end);
    end = yangonDate(p.year, p.month, p.day, true);
  }
  if (period.start != null && !start) throw new RangeError('Invalid analytics period start');
  if (period.end != null && !end) throw new RangeError('Invalid analytics period end');
  if (start && end && start > end) throw new RangeError('Analytics period start is after end');
  return { key: period.key || fromKey.key, start, end };
}

function isDateInPeriod(value, period) {
  const normalized = normalizePeriod(period);
  const date = parseDateValue(value);
  if (!date) return false;
  return (!normalized.start || date >= normalized.start) && (!normalized.end || date <= normalized.end);
}

function isAnalyticsPeriod(period) {
  try {
    return !!(period && period.key && normalizePeriod(period));
  } catch (error) {
    return false;
  }
}

function emptyMetrics() {
  const out = {};
  SCALAR_KEYS.forEach((key) => { out[key] = 0; });
  Object.assign(out, {
    gaVisitPoints: [],
    monthlyGbv: {},
    referralReasonCounts: {},
    monthlyReg: {},
    monthlyHighRisk: {},
    monthlyHighRiskByMidwife: {},
    monthlyHighRiskByTsp: {},
    monthlyHighRiskByRegion: {},
    monthlyAnemia: { severe: {}, mild: {}, none: {} },
    monthlyCoinfection: { hiv: {}, syphilis: {}, malaria: {}, hepB: {}, hepC: {} },
    monthlyLcg: {},
    ageGroups: { 'Under 18': 0, '18 to 35': 0, 'Over 35': 0 },
    riskFactors: {},
    gaGroups: { 'Under 14 weeks': 0, '14 to 28 weeks': 0, 'Over 28 weeks': 0 },
    tspAggregates: {},
    pncTimingGroups: { '0-1': 0, '2-3': 0, '4-7': 0, '8-14': 0, '15-42': 0, '>42': 0, 'Not recorded': 0 },
    dangerSignCounts: {},
    bwGroups: { '<1.5': 0, '1.5-2': 0, '2-2.5': 0, '2.5-3': 0, '3-3.5': 0, '3.5-4': 0, '>4': 0, 'Not recorded': 0 }
  });
  return out;
}

function dateFromFields(data, fields) {
  for (const field of fields) {
    const date = parseDateValue(data && data[field]);
    if (date) return date;
  }
  return null;
}

function recordsForPeriod(records, period, fields) {
  const list = Array.isArray(records) ? records : [];
  if (!period.start && !period.end) return list;
  return list.filter((record) => {
    const data = unwrap(record);
    const date = dateFromFields(data, fields);
    return !date || isDateInPeriod(date, period);
  });
}

function recordForPeriod(record, period, fields) {
  if (!record) return null;
  if (!period.start && !period.end) return record;
  const date = dateFromFields(unwrap(record), fields);
  return !date || isDateInPeriod(date, period) ? record : null;
}

function statusBucket(profile) {
  const raw = String(profile.status || profile.treatmentStatus || 'registered').toLowerCase().replace(/[_-]+/g, ' ');
  if (raw.includes('postnatal') || raw.includes('postpartum') || raw.includes('pnc') ||
      raw.includes('birthed') || raw.includes('delivered')) return 'pnc';
  if (raw.includes('intrapartum') || raw.includes('labour') || raw.includes('labor')) return 'labour';
  if (raw.includes('antenatal') || raw.includes('anc')) return 'anc';
  return 'registered';
}

function isAffirmative(value) {
  return value === true || ['yes', 'y', 'true'].includes(String(value || '').toLowerCase().trim());
}

function ensureTownship(metrics, township) {
  const key = township || 'Unknown';
  if (!metrics.tspAggregates[key]) {
    metrics.tspAggregates[key] = {
      earlyAnc: 0, lcgCompleted: 0, homeDel: 0, instDel: 0, anc4to7: 0, anc8Plus: 0,
      newAncPatients: 0, newPncPatients: 0, pnc42d: 0, highRisk: 0
    };
  }
  return metrics.tspAggregates[key];
}

function bump(map, key, amount = 1) {
  const normalized = key == null || key === '' ? 'Unknown' : String(key);
  map[normalized] = (map[normalized] || 0) + amount;
}

function sortedVisits(visits) {
  return visits.slice().sort((a, b) => {
    const da = dateFromFields(unwrap(a), ['visitDate', 'visit_date', 'timestamp', 'createdAt', 'created_at']);
    const db = dateFromFields(unwrap(b), ['visitDate', 'visit_date', 'timestamp', 'createdAt', 'created_at']);
    return (da ? da.getTime() : 0) - (db ? db.getTime() : 0);
  });
}

function isEarlyAnc(patient, visits) {
  if (!visits.length) return false;
  const first = unwrap(sortedVisits(visits)[0]);
  const candidateDates = [first.visitDate, first.visit_date, first.timestamp, first.createdAt];
  (first.otherVisits || []).forEach((visit) => candidateDates.push(visit && visit.visitDate));
  const dates = candidateDates.map(parseDateValue).filter(Boolean).sort((a, b) => a - b);
  const firstDate = dates[0];
  const profile = patient.profile || patient.registration || {};
  const lmp = first.lmp || profile.lmp;
  if (lmp && first.lmpStatus !== 'unknown' && firstDate) {
    const lmpDate = parseDateValue(lmp);
    if (lmpDate) {
      const days = Math.floor((firstDate - lmpDate) / 86400000);
      if (days >= 0) return days < 98;
    }
  }
  const ga = parseFloat(first.gestationalAge ?? first.gestational_age ?? first.ga_weeks ?? first.manualGestationalAge);
  return Number.isFinite(ga) && ga > 0 && ga < 14;
}

function latestVisit(visits) {
  if (!visits.length) return null;
  let best = null;
  let bestNumber = -1;
  let bestTime = -Infinity;
  visits.forEach((visit) => {
    const data = unwrap(visit);
    const number = parseInt(data.visitNumber, 10);
    const date = dateFromFields(data, ['visitDate', 'visit_date', 'timestamp', 'createdAt', 'created_at']);
    if (Number.isFinite(number) && number > bestNumber) {
      best = data; bestNumber = number;
    } else if (bestNumber < 0 && date && date.getTime() > bestTime) {
      best = data; bestTime = date.getTime();
    }
  });
  return best || unwrap(visits[visits.length - 1]);
}

function highRiskInfo(patient, visits) {
  let latest = null;
  let latestTime = -Infinity;
  visits.forEach((visit) => {
    const data = unwrap(visit);
    const date = dateFromFields(data, ['visitDate', 'visit_date', 'timestamp', 'createdAt']);
    const time = date ? date.getTime() : -Infinity;
    if (time >= latestTime) { latest = data; latestTime = time; }
  });
  const high = latest && ['yes', 'true'].includes(String(latest.high_risk ?? latest.highRisk).toLowerCase());
  return { high: !!high, factors: high && Array.isArray(latest.risk_factors) ? latest.risk_factors : [], anchor: high ? dateFromFields(latest, ['visitDate', 'visit_date', 'timestamp', 'createdAt']) : null };
}

function hasRecordData(record) {
  return !!record && Object.keys(unwrap(record)).length > 0;
}

function isDelivered(patient, profile, pncVisits) {
  if (statusBucket(profile) === 'pnc' || pncVisits.length || hasRecordData(patient.newbornCare) ||
      hasRecordData(patient.immediateNewbornCare)) return true;
  const birth = unwrap(patient.birthRecord);
  return !!dateFromFields(birth, ['deliveryDate', 'birthDate', 'birthTime', 'deliveredDateTime', 'deliveryDateTime']);
}

function birthWeightKg(patient) {
  const newborn = unwrap(patient.newbornCare);
  const birth = unwrap(patient.birthRecord);
  const grams = parseFloat(newborn.body_weight_gram || newborn.birth_weight_gram || birth.body_weight_gram || birth.birth_weight_gram);
  if (grams > 0) return grams / 1000;
  const kg = parseFloat(newborn.birth_weight_kg || newborn.birthWeightKg || birth.birth_weight_kg || birth.birthWeightKg);
  if (kg > 0) return kg;
  const pounds = parseFloat(newborn.birth_weight_lb || newborn.birthWeight || birth.birth_weight_lb || birth.birthWeight);
  return pounds > 0 ? pounds / 2.20462 : null;
}

function normalizeNewbornOutcome(value) {
  const outcome = String(value || '').toLowerCase().trim();
  if (['stillbirth', 'still_birth'].includes(outcome)) return 'stillbirth';
  if (['neonatal_death', 'neonatal death', 'neonataldeath', 'death', 'dead'].includes(outcome)) return 'neonatal_death';
  return 'alive';
}

function newbornOutcome(patient) {
  const notes = unwrap(patient.deliveryNotes);
  const babies = (notes.deliveryDetails || {}).babies || notes.babies || [];
  if (babies.length) {
    for (const baby of babies) {
      const outcome = normalizeNewbornOutcome(baby.outcome);
      if (outcome !== 'alive') return outcome;
    }
    return 'alive';
  }
  const newborn = unwrap(patient.newbornCare);
  if (Object.keys(newborn).length) {
    const direct = normalizeNewbornOutcome(newborn.baby_outcome || newborn.outcome);
    if (direct !== 'alive') return direct;
    for (const baby of newborn.babies || []) {
      const outcome = normalizeNewbornOutcome(baby.outcome || baby.baby_outcome);
      if (outcome !== 'alive') return outcome;
    }
    return 'alive';
  }
  const birth = unwrap(patient.birthRecord);
  if (Object.keys(birth).length) return normalizeNewbornOutcome(birth.newbornOutcome || birth.newbornStatus);
  const profile = patient.profile || patient.registration || {};
  return profile.birth_outcome ? normalizeNewbornOutcome(profile.birth_outcome) : null;
}

function firstPncDays(first, patient) {
  const explicit = first.postpartumDays ?? first.postpartum_days ?? first.daysPostpartum ?? first.days_since_delivery;
  if (explicit !== '' && explicit != null && Number(explicit) >= 0) return Number(explicit);
  const visitDate = dateFromFields(first, ['visitDate', 'visit_date', 'timestamp', 'createdAt', 'created_at', 'date']);
  let deliveryDate = dateFromFields(first, ['deliveredDateTime', 'deliveryDate', 'delivery_date']);
  if (!deliveryDate) deliveryDate = dateFromFields(unwrap(patient.birthRecord), ['deliveryDate', 'birthDate', 'birthTime', 'timestamp', 'date']);
  if (visitDate && deliveryDate) {
    const days = Math.floor((visitDate - deliveryDate) / 86400000);
    if (days >= 0) return days;
  }
  return null;
}

function addPncTiming(metrics, days) {
  if (days == null || Number.isNaN(days)) { metrics.pncTimingGroups['Not recorded']++; return false; }
  if (days <= 1) metrics.pncTimingGroups['0-1']++;
  else if (days <= 3) metrics.pncTimingGroups['2-3']++;
  else if (days <= 7) metrics.pncTimingGroups['4-7']++;
  else if (days <= 14) metrics.pncTimingGroups['8-14']++;
  else if (days <= 42) metrics.pncTimingGroups['15-42']++;
  else metrics.pncTimingGroups['>42']++;
  return true;
}

function referralReason(data) {
  const value = data.referralReason || data.reasonForReferral || data.referral_reason || data.mainSymptoms || 'Not documented';
  const clean = String(value).trim().replace(/\s+/g, ' ') || 'Not documented';
  return clean.length > 120 ? `${clean.slice(0, 117)}...` : clean;
}

function addHrtMetrics(metrics, patient, visits, asOf) {
  const actions = (patient.hrtActions || []).map(unwrap);
  const complete = actions.find((action) => action.type === 'resolved' && (
    ['completed', 'delivered_safely', 'death', 'transferred'].includes(action.resolvedReason) ||
    ['alive', 'death', 'transfer'].includes(action.outcome)
  ));
  if (complete) {
    metrics.hrtCompleted++;
    const outcome = complete.outcome || complete.resolvedReason;
    if (outcome === 'death') metrics.hrtCompletedDeath++;
    else if (outcome === 'transfer' || outcome === 'transferred') metrics.hrtCompletedTransfer++;
    else metrics.hrtCompletedAlive++;
    return;
  }
  metrics.hrtCurrent++;
  const latest = latestVisit(visits) || {};
  let due = parseDateValue(latest.nextVisitDate || latest.next_visit_date);
  if (!due) {
    const maxVisit = visits.reduce((max, visit) => Math.max(max, parseInt(unwrap(visit).visitNumber, 10) || 0), 0);
    const completed = maxVisit || Math.min(visits.length, 8);
    const target = completed + 1;
    let lmp = (patient.profile || patient.registration || {}).lmp;
    if (!lmp) {
      const withLmp = visits.map(unwrap).filter((visit) => visit.lmp && !['unknown', 'Unknown', 'Not recorded'].includes(visit.lmp));
      withLmp.sort((a, b) => (parseInt(a.visitNumber, 10) || 999) - (parseInt(b.visitNumber, 10) || 999));
      lmp = withLmp[0] && withLmp[0].lmp;
    }
    const lmpDate = parseDateValue(lmp);
    if (lmpDate && target >= 2 && target <= 8) {
      const monthOffsets = { 2: 5, 3: 6, 4: 7, 5: 8, 6: 8, 7: 9, 8: 9 };
      const parts = yangonParts(lmpDate);
      const shifted = new Date(Date.UTC(parts.year, parts.month - 1 + monthOffsets[target], parts.day) - YANGON_OFFSET_MS);
      due = new Date(shifted.getTime() + ([6, 8].includes(target) ? 14 * 86400000 : 0));
    }
  }
  if (!due) { metrics.hrtOnTrack++; return; }
  const todayParts = yangonParts(asOf);
  const today = yangonDate(todayParts.year, todayParts.month, todayParts.day);
  const daysLate = Math.floor((today - due) / 86400000);
  const nextVisit = Math.min((visits.reduce((max, visit) => Math.max(max, parseInt(unwrap(visit).visitNumber, 10) || 0), 0) || visits.length) + 1, 8);
  if (daysLate < 0) metrics.hrtOnTrack++;
  else if (daysLate <= (nextVisit >= 5 ? 14 : 30)) metrics.hrtOverdue++;
  else metrics.hrtLost++;
}

function patientHasPeriodActivity(patient, period, profile, visits, pncVisits, tests) {
  if (!period.start && !period.end) return true;
  if (isDateInPeriod(dateFromFields(profile, ['createdAt', 'created_at', 'createdDate', 'registrationDate', 'registration_date', 'timestamp', 'date']), period)) return true;
  if (visits.length || pncVisits.length || tests.length) return true;
  return ['birthRecord', 'endTreatment', 'transferRecord', 'outcomeRecord'].some((key) => !!patient[key]);
}

function deriveHighRiskFacts(patient) {
  const visits = Array.isArray(patient && patient.antenatalVisits)
    ? patient.antenatalVisits
    : [];
  const risk = highRiskInfo(patient || {}, visits);
  return {
    eligible: risk.high,
    factors: risk.factors.slice(),
    detectedAt: risk.anchor
  };
}

function deriveAncSchedule(patient, asOf) {
  const visits = Array.isArray(patient && patient.antenatalVisits)
    ? patient.antenatalVisits
    : [];
  const metrics = emptyMetrics();
  addHrtMetrics(metrics, patient || {}, visits, asOf || new Date());
  const status = metrics.hrtLost ? 'lost_to_followup'
    : metrics.hrtOverdue ? 'overdue_followup'
      : metrics.hrtCompleted ? 'completed'
        : 'on_track';
  return {
    status,
    visitCount: visits.length,
    completed: !!metrics.hrtCompleted
  };
}

function calculatePatientMetrics(entry, periodDescriptor) {
  const period = normalizePeriod(periodDescriptor);
  const raw = unwrap(entry);
  const patient = Object.assign({}, raw);
  const profile = unwrap(patient.profile && Object.keys(unwrap(patient.profile)).length ? patient.profile : patient.registration);
  const visits = recordsForPeriod(patient.antenatalVisits, period, ['visitDate', 'visit_date', 'timestamp', 'createdAt', 'created_at', 'date']);
  const pncVisits = recordsForPeriod(patient.postpartumVisits, period, ['visitDate', 'visit_date', 'timestamp', 'createdAt', 'created_at', 'date']);
  const tests = recordsForPeriod(patient.testRecords, period, ['testDate', 'timestamp', 'createdAt', 'created_at', 'date']);
  ['birthRecord', 'endTreatment', 'transferRecord', 'outcomeRecord'].forEach((key) => {
    patient[key] = recordForPeriod(patient[key], period, {
      birthRecord: ['deliveryDate', 'birthDate', 'timestamp', 'date'],
      endTreatment: ['outcomeDate', 'timestamp', 'date'],
      transferRecord: ['transferDate', 'timestamp', 'date'],
      outcomeRecord: ['outcomeDate', 'timestamp', 'date']
    }[key]);
  });
  const metrics = emptyMetrics();
  if (!patientHasPeriodActivity(patient, period, profile, visits, pncVisits, tests)) return metrics;
  metrics.total = 1;
  const township = profile.township || 'Unknown';
  const townshipMetrics = ensureTownship(metrics, township);
  const registrationDate = dateFromFields(profile, ['created_at', 'createdAt', 'registration_date']);
  if (registrationDate && isDateInPeriod(registrationDate, period)) metrics.newClients++;
  if (registrationDate) bump(metrics.monthlyReg, monthKeyForDate(registrationDate));

  const bucket = statusBucket(profile);
  metrics[`status${bucket === 'pnc' ? 'Pnc' : bucket[0].toUpperCase() + bucket.slice(1)}`]++;
  const age = parseInt(profile.age, 10);
  if (age > 0) metrics.ageGroups[age < 18 ? 'Under 18' : age <= 35 ? '18 to 35' : 'Over 35']++;

  const visitCount = visits.length;
  if (!visitCount) { metrics.visits0++; metrics.noAnc++; }
  else if (visitCount >= 8) metrics.visits8plus++;
  else if (visitCount >= 4) metrics.visits4plus++;
  else metrics.visits1to3++;
  if (visitCount >= 4) metrics.with4Plus++;
  if (visitCount >= 8) townshipMetrics.anc8Plus++;
  else if (visitCount >= 4) townshipMetrics.anc4to7++;

  visits.forEach((visit) => {
    const data = unwrap(visit);
    const month = monthKeyForDate(dateFromFields(data, ['visitDate', 'timestamp', 'createdAt']));
    if (data.gbvSuspected === 'yes') bump(metrics.monthlyGbv, month);
    const hb = parseFloat(data.hemoglobin);
    if (hb > 0) bump(metrics.monthlyAnemia[hb < 7 ? 'severe' : hb <= 11 ? 'mild' : 'none'], month);
  });

  const earlyAnc = isEarlyAnc(patient, visits);
  if (earlyAnc) { metrics.earlyAnc++; townshipMetrics.earlyAnc++; }
  const risk = highRiskInfo(patient, visits);
  if (risk.high && (!risk.anchor || isDateInPeriod(risk.anchor, period))) {
    metrics.highRisk++; townshipMetrics.highRisk++;
    const month = monthKeyForDate(risk.anchor || registrationDate);
    bump(metrics.monthlyHighRisk, month);
    const midwife = profile.midwife_name || profile.midwifeName || profile.created_by_name ||
      profile.providerName || profile.midwife || profile.created_by || 'Unknown';
    metrics.monthlyHighRiskByMidwife[midwife] = metrics.monthlyHighRiskByMidwife[midwife] || {};
    metrics.monthlyHighRiskByTsp[township] = metrics.monthlyHighRiskByTsp[township] || {};
    const region = String(profile.region || 'Unknown').trim() || 'Unknown';
    metrics.monthlyHighRiskByRegion[region] = metrics.monthlyHighRiskByRegion[region] || {};
    bump(metrics.monthlyHighRiskByMidwife[midwife], month);
    bump(metrics.monthlyHighRiskByTsp[township], month);
    bump(metrics.monthlyHighRiskByRegion[region], month);
    risk.factors.forEach((factor) => { if (String(factor || '').trim()) bump(metrics.riskFactors, String(factor).trim()); });
    const asOf = period.end && period.end < new Date() ? period.end : new Date();
    addHrtMetrics(metrics, patient, visits, asOf);
  }
  if ((!period.start && !period.end) || (registrationDate && isDateInPeriod(registrationDate, period))) {
    if (bucket === 'anc' || (visits.length && bucket !== 'pnc')) townshipMetrics.newAncPatients++;
  }

  const hasTT = visits.some((visit) => {
    const data = unwrap(visit);
    return data.ttTdCompletion === 'Complete' || (data.tt1 && data.tt1 !== '') || (data.tt2 && data.tt2 !== '');
  });
  metrics[hasTT ? 'ttComplete' : 'ttIncomplete']++;
  const hasFolic = visits.some((visit) => {
    const data = unwrap(visit);
    return data.ironFolicAcid === 'Given' || data.folicAcid === 'Given' ||
      (typeof data.treatmentGiven === 'string' && data.treatmentGiven.toLowerCase().includes('folic'));
  });
  metrics[hasFolic ? 'folicGiven' : 'folicNotGiven']++;

  if (visits.length) {
    const dashboardFirst = unwrap(visits[visits.length - 1]);
    const ga = parseInt(dashboardFirst.gestationalAge || dashboardFirst.gestational_age || dashboardFirst.ga_weeks || profile.gestationalAge, 10);
    if (ga > 0 && ga <= 45) metrics.gaGroups[ga < 14 ? 'Under 14 weeks' : ga <= 28 ? '14 to 28 weeks' : 'Over 28 weeks']++;
  }

  let allEight = false; let ultrasound = false; let anemia = null;
  let hiv = false; let syphilis = false; let malaria = false; let hepB = false; let hepC = false;
  let anyHivSyph = false; let everHiv = false; let everSyph = false;
  tests.forEach((test) => {
    const data = unwrap(test);
    const tested = (value) => !!value && value !== 'No Test Yet';
    const hasHiv = tested(data.hivResult); const hasMalaria = tested(data.malariaResult);
    const hasSyphilis = tested(data.syphilisResult); const hasHepB = tested(data.hepatitisBResult);
    const hasHepC = tested(data.hepatitisCResult);
    const hasHemoglobin = tested(data.hemoglobinResult) && Number.isFinite(parseFloat(data.hemoglobinResult));
    const hasBloodGroup = tested(data.bloodGroup); const hasRh = tested(data.rhFactor);
    everHiv ||= hasHiv; everSyph ||= hasSyphilis;
    allEight ||= hasHiv && hasMalaria && hasSyphilis && hasHepB && hasHepC && hasHemoglobin && hasBloodGroup && hasRh;
    ultrasound ||= ['Yes', true].includes(data.ultrasoundServices) || ['Yes', true].includes(data.usgDone) || ['Yes', true].includes(data.ultrasoundDone);
    const hb = parseFloat(data.hemoglobinResult);
    if (hb > 0) {
      if (hb < 7) anemia = 'severe';
      else if (hb <= 11 && anemia !== 'severe') anemia = 'mild';
      else if (hb > 11 && !anemia) anemia = 'none';
    }
    anyHivSyph ||= hasHiv || hasSyphilis;
    const result = (field) => String(data[field] || '').toLowerCase();
    const positive = (value) => value === 'reactive' || value === 'positive';
    const values = { hiv: result('hivResult'), syphilis: result('syphilisResult'), malaria: result('malariaResult'),
      hepB: result('hepatitisBResult'), hepC: result('hepatitisCResult') };
    hiv ||= positive(values.hiv); syphilis ||= positive(values.syphilis); malaria ||= values.malaria === 'positive';
    hepB ||= positive(values.hepB); hepC ||= positive(values.hepC);
    const month = monthKeyForDate(dateFromFields(data, ['testDate', 'timestamp']));
    Object.keys(values).forEach((key) => {
      if ((key === 'malaria' ? values[key] === 'positive' : positive(values[key]))) bump(metrics.monthlyCoinfection[key], month);
    });
  });
  if (tests.length) metrics.patientsWithLabRecord++;
  if (everHiv && everSyph) metrics.hivSyphScreenedPatients++;
  if (allEight && ultrasound) metrics.labComplete++;
  if (ultrasound) metrics.ultrasound++;
  if (anemia) metrics[`${anemia === 'none' ? 'no' : anemia}Anemia`]++;
  if (hiv) metrics.hivPos++;
  if (syphilis) metrics.syphilisPos++;
  if (malaria) metrics.malariaPos++;
  if (hepB) metrics.hepBPos++;
  if (hepC) metrics.hepCPos++;

  if (visitCount) {
    metrics.ancReceived++;
    if (earlyAnc) metrics.earlyAncAmongAnc++;
    metrics[visitCount < 4 ? 'ancVisitsLt4' : visitCount < 8 ? 'ancVisits4to7' : 'ancVisits8Plus']++;
    const ascending = sortedVisits(visits);
    ascending.forEach((visit, index) => {
      const data = unwrap(visit);
      const visitNumber = parseInt(data.visitNumber, 10) || index + 1;
      const ga = parseFloat(data.gestationalAge ?? data.gestational_age ?? data.ga_weeks);
      if (ga > 0 && ga <= 45) metrics.gaVisitPoints.push({ x: visitNumber, y: Math.round(ga) });
    });
    const latest = unwrap(ascending[ascending.length - 1]);
    metrics[latest.ironFolicAcid === 'Given' || latest.micronutrientsTablet === 'Given' ? 'ironMicroGiven' : 'ironMicroNotGiven']++;
    metrics[latest.vitaminB1 === 'Given' ? 'vitB1Given' : 'vitB1NotGiven']++;
    if (anemia) metrics[`anc${anemia === 'none' ? 'No' : anemia[0].toUpperCase() + anemia.slice(1)}Anemia`]++;
    if (visits.some((visit) => unwrap(visit).gbvSuspected === 'yes')) metrics.gbvPatients++;
  }
  if (!anyHivSyph) metrics.notTested++;
  else if (hiv || syphilis) {
    if (hiv) metrics.hivScreenPositive++;
    if (syphilis) metrics.syphilisScreenPositive++;
  } else metrics.hivScreenNegative++;

  const summary = unwrap(patient.summary);
  const validTime = (value) => !!value && (typeof value !== 'string' || value.trim() !== '');
  let firstStage = validTime(summary.startingTime) || validTime(summary.activeFirstStage_Time);
  let secondStage = validTime(summary.secondStageTime) || validTime(summary.secondStage_Time);
  if (!firstStage) firstStage = validTime(unwrap(patient.startingTimeDoc).startingTime);
  if (!secondStage) secondStage = validTime(unwrap(patient.secondStageDoc).secondStageStartTime) || validTime(unwrap(patient.secondStageDoc).secondStageTime);
  if (firstStage && secondStage) {
    metrics.lcgCompleted++; townshipMetrics.lcgCompleted++;
    const birth = unwrap(patient.birthRecord);
    bump(metrics.monthlyLcg, monthKeyForDate(dateFromFields(birth, ['birthTime', 'deliveryDate']) || registrationDate));
  }
  const oxytocin = Object.keys(summary).some((key) => key.startsWith('Medication_Oxytocin_') &&
    !key.includes('_UL') && !key.includes('_drops') && ['Y', 'Yes'].includes(summary[key]));
  metrics[oxytocin ? 'oxytocinYes' : 'oxytocinNo']++;

  const delivered = isDelivered(patient, profile, pncVisits);
  const birth = unwrap(patient.birthRecord);
  const newborn = unwrap(patient.newbornCare);
  if (delivered) {
    metrics.totalDeliveries++;
    const thirdStage = unwrap(patient.thirdStage);
    if (isAffirmative(thirdStage.oxytocinGiven) || isAffirmative(birth.uterotonicGivenThirdStage) || isAffirmative(birth.uterotonic)) metrics.uterotonic++;
    const birthplace = String(newborn.birthplace || '').toLowerCase().trim().replace(/[-\s]+/g, '_');
    if (['home', 'home_delivery'].includes(birthplace)) { metrics.homeDel++; townshipMetrics.homeDel++; }
    else if (['facility', 'public_facility', 'private_facility', 'private'].includes(birthplace)) { metrics.instDel++; townshipMetrics.instDel++; }
    metrics.nbRecords++;
    const weight = birthWeightKg(patient);
    if (weight) {
      const group = weight < 1.5 ? '<1.5' : weight < 2 ? '1.5-2' : weight < 2.5 ? '2-2.5' :
        weight < 3 ? '2.5-3' : weight < 3.5 ? '3-3.5' : weight < 4 ? '3.5-4' : '>4';
      metrics.bwGroups[group]++;
      if (weight < 2) metrics.lowBW++;
    } else metrics.bwGroups['Not recorded']++;
    if (isAffirmative(unwrap(patient.immediateNewbornCare).gasping_or_no_breathing)) metrics.resuscitated++;
    const outcome = newbornOutcome(patient);
    if (outcome) metrics[outcome === 'alive' ? 'newbornOutcomeAlive' : outcome === 'stillbirth' ? 'newbornOutcomeStillbirth' : 'newbornOutcomeNeonatalDeath']++;
  }

  metrics.pncVisitsTotal += pncVisits.length;
  let vitaminB = false; let vitaminA = false; let ironFolic = false; let contraception = false;
  pncVisits.forEach((visit) => {
    const data = unwrap(visit);
    vitaminB ||= data.vitaminBComplex === true; vitaminA ||= data.vitaminA === true;
    ironFolic ||= data.ironFolic === true;
    contraception ||= data.contraception === true || !!(data.contraceptiveMethod && data.contraceptiveMethod.length);
    if (String(data.referralGiven).toLowerCase() === 'yes') bump(metrics.referralReasonCounts, referralReason(data));
  });
  const latestPnc = latestVisit(pncVisits);
  if (latestPnc && latestPnc.dangerSigns && typeof latestPnc.dangerSigns === 'object') {
    Object.keys(latestPnc.dangerSigns).forEach((sign) => { if (latestPnc.dangerSigns[sign] === true) bump(metrics.dangerSignCounts, sign); });
  }
  if (vitaminB) metrics.pncVitB++;
  if (vitaminA) metrics.pncVitA++;
  if (ironFolic) metrics.pncIronFolic++;
  if (contraception) metrics.pncContraception++;
  if (bucket === 'pnc' || pncVisits.length) {
    const first = sortedVisits(pncVisits)[0];
    const days = first ? firstPncDays(unwrap(first), patient) : null;
    if (addPncTiming(metrics, days)) {
      if (days <= 2) metrics.pnc48h++;
      if (days <= 42) { metrics.pnc42d++; townshipMetrics.pnc42d++; }
    }
  }
  if (pncVisits.length) {
    townshipMetrics.newPncPatients++; metrics.pncReceived++;
    const maternal = String(latestPnc.maternalOutcome || latestPnc.maternal_outcome || '').toLowerCase();
    if (maternal !== 'dead') metrics.maternalOutcomeAlive++;
    else {
      const deathType = String(latestPnc.maternalDeathType || latestPnc.maternal_death_type || '').toLowerCase();
      metrics[deathType === 'other' || deathType.includes('non') || deathType.includes('incidental') ?
        'maternalOutcomeDeadOther' : 'maternalOutcomeDeadObstetric']++;
    }
    if (String(latestPnc.vaginalBleeding || '').trim() === 'Heavy bleeding') metrics.pphCases++;
  }

  if (patient.transferRecord) {
    if (String(profile.status || '').toLowerCase().includes('labour')) metrics.labourTransfer++;
    else if (/pnc|postnatal/.test(String(profile.status || '').toLowerCase())) metrics.pncTransfer++;
    else metrics.ancTransfer++;
    bump(metrics.referralReasonCounts, referralReason(unwrap(patient.transferRecord)));
  }
  const endTreatment = unwrap(patient.endTreatment);
  if (Object.keys(endTreatment).length) {
    if (String(endTreatment.maternalOutcome).toLowerCase() === 'dead') metrics.maternalDead++;
    else if (String(endTreatment.maternalOutcome).toLowerCase() === 'alive' || Object.keys(birth).length) metrics.maternalAlive++;
  } else if (Object.keys(birth).length) metrics.maternalAlive++;
  if (Object.keys(birth).length) {
    if (String(birth.newbornOutcome).toLowerCase() === 'dead' || String(birth.newbornStatus).toLowerCase() === 'dead') metrics.newbornDead++;
    else metrics.newbornAlive++;
  }
  return metrics;
}

function mergeValue(left, right) {
  if (Array.isArray(left) || Array.isArray(right)) return [...(left || []), ...(right || [])];
  if (typeof left === 'number' || typeof right === 'number') return (left || 0) + (right || 0);
  const out = {};
  const a = left && typeof left === 'object' ? left : {};
  const b = right && typeof right === 'object' ? right : {};
  new Set([...Object.keys(a), ...Object.keys(b)]).forEach((key) => { out[key] = mergeValue(a[key], b[key]); });
  return out;
}

function mergeMetrics(...inputs) {
  const metrics = inputs.length === 1 && Array.isArray(inputs[0]) ? inputs[0] : inputs;
  return metrics.reduce((result, contribution) => mergeValue(result, contribution || emptyMetrics()), emptyMetrics());
}

function calculateMetrics(entries, period) {
  return (entries || []).reduce(
    (metrics, entry) => mergeValue(metrics, calculatePatientMetrics(entry, period)),
    emptyMetrics()
  );
}

module.exports = {
  ANALYTICS_SCHEMA_VERSION,
  ANALYTICS_TIME_ZONE,
  INDICATOR_REGISTRY,
  indicatorRegistry: INDICATOR_REGISTRY,
  parseDateValue,
  monthKeyForDate,
  quarterKeyForDate,
  yearKeyForDate,
  periodKeyForDate,
  analyticsPeriodsForDate,
  periodForKey,
  normalizePeriod,
  isAnalyticsPeriod,
  isDateInPeriod,
  deriveHighRiskFacts,
  deriveAncSchedule,
  emptyMetrics,
  calculatePatientMetrics,
  mergeMetrics,
  calculateMetrics
};
