'use strict';

const { resolveServiceProvider } = require('../shared/clinical-normalizers');

const SCORE_VERSION = 'leaderboard-v3-1';
const LEADERBOARD_TIME_ZONE = 'Asia/Yangon';
const ALL_TIME_PERIOD = 'all';

const CATEGORY_KEYS = [
  'registration',
  'completeRegistration',
  'ancVisits',
  'anc4Plus',
  'anc8Plus',
  'completeANC',
  'lcgCompleted',
  'pncVisits',
  'completePNC',
  'labTests',
  'deliveryNotes',
  'immediateNewbornCare',
  'kmcYes',
  'newbornCare',
  'transferRecords'
];

function emptyCategories() {
  return CATEGORY_KEYS.reduce((result, key) => {
    result[key] = 0;
    return result;
  }, {});
}

function isAllTimePeriod(month) {
  return month === ALL_TIME_PERIOD;
}

function isLeaderboardPeriod(month) {
  return isAllTimePeriod(month) ||
    /^\d{4}-\d{2}$/.test(month || '') ||
    /^\d{4}$/.test(month || '');
}

function monthKeyForDate(date) {
  const value = date instanceof Date ? date : new Date(date);
  if (!Number.isFinite(value.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: LEADERBOARD_TIME_ZONE,
    year: 'numeric',
    month: '2-digit'
  }).formatToParts(value);
  const year = parts.find((part) => part.type === 'year').value;
  const month = parts.find((part) => part.type === 'month').value;
  return year + '-' + month;
}

function dayKeyForDate(date) {
  const value = date instanceof Date ? date : new Date(date);
  if (!Number.isFinite(value.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: LEADERBOARD_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(value);
  const valueFor = (type) => parts.find((part) => part.type === type).value;
  return valueFor('year') + '-' + valueFor('month') + '-' + valueFor('day');
}

function timestampToDate(value) {
  if (value == null || value === '') return null;
  if (typeof value.toDate === 'function') return value.toDate();
  if (value instanceof Date) return value;
  if (typeof value === 'object' && typeof value.seconds === 'number') {
    return new Date(value.seconds * 1000);
  }
  if (typeof value === 'number') return new Date(value);
  const text = String(value).trim();
  if (!text || /^\d{1,2}:\d{2}(:\d{2})?$/.test(text)) return null;
  const parsed = new Date(text.length === 10 ? text + 'T00:00:00Z' : text);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function recordIsInMonth(data, month, fields) {
  if (!data || !month) return false;
  const dateFields = fields || [
    'visitDate',
    'testDate',
    'registration_date',
    'referralTime',
    'timestamp',
    'created_at',
    'createdAt',
    'recordedAt',
    'lastUpdated'
  ];
  return dateFields.some((field) => {
    const date = timestampToDate(data[field]);
    return date && monthKeyForDate(date) === month;
  });
}

function recordsInMonth(records, month, fields) {
  return (records || []).filter((record) => recordIsInMonth(record, month, fields));
}

function recordIsInPeriod(data, month, fields) {
  if (isAllTimePeriod(month)) return !!(data && typeof data === 'object');
  if (/^\d{4}$/.test(month || '')) {
    return (fields || []).some((field) => {
      const date = timestampToDate(data && data[field]);
      return date && String(new Intl.DateTimeFormat('en-US', {
        timeZone: LEADERBOARD_TIME_ZONE,
        year: 'numeric'
      }).format(date)) === month;
    });
  }
  return recordIsInMonth(data, month, fields);
}

function recordsInPeriod(records, month, fields) {
  if (isAllTimePeriod(month)) return records || [];
  return recordsInMonth(records, month, fields);
}

function isPatientRegistrationComplete(patientData) {
  const requiredFields = ['name', 'age', 'phone', 'address', 'township', 'village'];
  return requiredFields.every((field) => {
    const value = patientData[field] || patientData[field + 'Number'];
    return value && String(value).trim() !== '';
  });
}

function isAncFormComplete(ancVisits) {
  return (ancVisits || []).some((visit) => {
    if (Number(visit.completionPercentage || visit.completion_percentage) >= 100) return true;
    const hasDating = visit.lmp ||
      (String(visit.lmpStatus || '').toLowerCase() === 'unknown' &&
        Number(visit.manualGestationalAge || visit.gestationalAge) >= 0);
    return visit.visitDate &&
      hasDating &&
      (visit.visitNumber !== undefined || visit.visit_number !== undefined);
  });
}

function isPncFormComplete(pncVisits) {
  return (pncVisits || []).some((visit) =>
    Number(visit.completionPercentage || visit.completion_percentage) >= 100 ||
    (visit.visitDate && visit.deliveredDateTime)
  );
}

function isValidTime(value) {
  if (!value) return false;
  if (typeof value !== 'string') return true;
  const text = value.trim();
  return text !== '' && text !== 'null' && text !== 'undefined';
}

function isLcgCompleted(summary, startingTime, secondStage) {
  const summaryData = summary || {};
  const startingData = startingTime || {};
  const secondData = secondStage || {};
  const firstStage = isValidTime(summaryData.startingTime) ||
    isValidTime(summaryData.activeFirstStage_Time) ||
    isValidTime(startingData.startingTime);
  const secondStageComplete = isValidTime(summaryData.secondStageTime) ||
    isValidTime(summaryData.secondStage_Time) ||
    isValidTime(secondData.secondStageStartTime) ||
    isValidTime(secondData.secondStageTime);
  return firstStage && secondStageComplete;
}

function dateFromRecord(record, fields) {
  const data = record || {};
  for (const field of fields || []) {
    const date = timestampToDate(data[field]);
    if (date) return date;
  }
  return null;
}

function sortedDatedRecords(records, fields) {
  return (records || []).map((record) => ({
    record,
    date: dateFromRecord(record, fields)
  })).filter((entry) => entry.date)
    .sort((left, right) => left.date - right.date);
}

function hasCompletedImmediateNewbornCare(record) {
  if (!record || typeof record !== 'object') return false;
  return Boolean(
    record.completed === true ||
    record.status === 'complete' ||
    record.timestamp || record.createdAt || record.recordedAt ||
    Object.keys(record).some((key) => ![
      'id', 'patientId', 'createdBy', 'recordedBy', 'timestamp', 'createdAt'
    ].includes(key) && record[key] != null && record[key] !== '')
  );
}

function hasCompletedDeliveryNote(record) {
  if (!record || typeof record !== 'object') return false;
  const details = record.deliveryDetails || {};
  const babies = Array.isArray(details.babies) ? details.babies : [];
  return Boolean(
    record.completed === true ||
    babies.some((baby) => baby && (
      baby.birthTime || baby.birth_time || baby.outcome || baby.birthWeightGram
    )) ||
    details.modeOfDelivery || record.birth_time || record.deliveredDateTime
  );
}

function firstKmcYes(newbornCare) {
  return sortedDatedRecords(newbornCare, [
    'visitDate', 'timestamp', 'createdAt', 'recordedAt'
  ]).find(({ record }) => {
    if (record.kmc_selected === 'yes' || record.kmcSelected === 'yes') return true;
    return (record.kmc_babies || []).some((baby) =>
      baby && (baby.kmc_selected === 'yes' || baby.kmcSelected === 'yes')
    );
  }) || null;
}

function achievement(key, points, record, patient, dateFields) {
  const date = dateFromRecord(record, dateFields);
  if (!date) return null;
  const provider = resolveServiceProvider(record, patient);
  return {
    key,
    points,
    achievedAt: date,
    providerId: provider.providerId,
    attributionSource: provider.attributionSource
  };
}

function buildPatientAchievements(patientData, activity) {
  const patient = patientData || {};
  const records = activity || {};
  const achievements = [];
  const add = (value) => { if (value) achievements.push(value); };
  const registrationFields = ['registration_date', 'created_at', 'createdAt', 'timestamp'];
  const registrationDate = dateFromRecord(patient, registrationFields);
  if (registrationDate) {
    add(achievement('registration', 1, patient, patient, registrationFields));
    if (isPatientRegistrationComplete(patient)) {
      add(achievement('completeRegistration', 2, patient, patient, registrationFields));
    }
  }

  const anc = sortedDatedRecords(records.ancVisits, ['visitDate', 'timestamp', 'createdAt']);
  if (anc[0]) add(achievement('ancVisits', 1, anc[0].record, patient, ['visitDate', 'timestamp', 'createdAt']));
  if (anc[3]) add(achievement('anc4Plus', 1, anc[3].record, patient, ['visitDate', 'timestamp', 'createdAt']));
  if (anc[7]) add(achievement('anc8Plus', 1, anc[7].record, patient, ['visitDate', 'timestamp', 'createdAt']));
  const completeAnc = anc.find(({ record }) => isAncFormComplete([record]));
  if (completeAnc) add(achievement('completeANC', 2, completeAnc.record, patient, ['visitDate', 'timestamp', 'createdAt']));

  const pnc = sortedDatedRecords(records.pncVisits, ['visitDate', 'createdAt', 'updatedAt']);
  if (pnc[0]) add(achievement('pncVisits', 1, pnc[0].record, patient, ['visitDate', 'createdAt', 'updatedAt']));
  const completePnc = pnc.find(({ record }) => isPncFormComplete([record]));
  if (completePnc) add(achievement('completePNC', 1, completePnc.record, patient, ['visitDate', 'createdAt', 'updatedAt']));

  const tests = sortedDatedRecords(records.labTests, ['testDate', 'timestamp', 'createdAt']);
  if (tests[0]) add(achievement('labTests', 1, tests[0].record, patient, ['testDate', 'timestamp', 'createdAt']));

  if (hasCompletedDeliveryNote(records.deliveryNotes)) {
    add(achievement('deliveryNotes', 1, records.deliveryNotes, patient, [
      'updatedAt', 'createdAt', 'timestamp', 'deliveryDate', 'birth_time'
    ]));
  }

  const immediate = sortedDatedRecords(records.immediateNewbornCare, [
    'recordedAt', 'timestamp', 'createdAt', 'visitDate'
  ]).find(({ record }) => hasCompletedImmediateNewbornCare(record));
  if (immediate) add(achievement('immediateNewbornCare', 1, immediate.record, patient, [
    'recordedAt', 'timestamp', 'createdAt', 'visitDate'
  ]));

  const kmc = firstKmcYes(records.newbornCare);
  if (kmc) add(achievement('kmcYes', 1, kmc.record, patient, [
    'visitDate', 'timestamp', 'createdAt', 'recordedAt'
  ]));

  const newborn = sortedDatedRecords(records.newbornCare, [
    'visitDate', 'timestamp', 'createdAt'
  ]);
  if (newborn[0]) add(achievement('newbornCare', 1, newborn[0].record, patient, [
    'visitDate', 'timestamp', 'createdAt'
  ]));

  if (isLcgCompleted(records.summary, records.startingTime, records.secondStage)) {
    const labourRecord = records.secondStage || records.summary || records.startingTime;
    add(achievement('lcgCompleted', 1, labourRecord, patient, ['timestamp', 'lastUpdated', 'updatedAt']));
  }
  if (records.transferRecord) {
    add(achievement('transferRecords', 1, records.transferRecord, patient, [
      'referralTime', 'timestamp', 'createdAt'
    ]));
  }
  return achievements;
}

function achievementIsInPeriod(item, period) {
  if (isAllTimePeriod(period)) return true;
  if (/^\d{4}$/.test(period || '')) {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: LEADERBOARD_TIME_ZONE,
      year: 'numeric'
    }).format(item.achievedAt) === period;
  }
  return monthKeyForDate(item.achievedAt) === period;
}

function contributionsByProvider(patientData, activity, period) {
  const grouped = {};
  buildPatientAchievements(patientData, activity)
    .filter((item) => achievementIsInPeriod(item, period))
    .forEach((item) => {
      const providerId = item.providerId || patientData.created_by || patientData.createdBy || '';
      if (!providerId) return;
      if (!grouped[providerId]) {
        grouped[providerId] = { score: 0, activePatientCount: 1, categories: emptyCategories() };
      }
      grouped[providerId].score += item.points;
      grouped[providerId].categories[item.key] += item.points;
    });
  return grouped;
}

function calculatePatientContribution(patientData, activity, month) {
  const categories = emptyCategories();
  const achievements = buildPatientAchievements(patientData || {}, activity || {})
    .filter((item) => achievementIsInPeriod(item, month));
  achievements.forEach((item) => { categories[item.key] += item.points; });
  const score = CATEGORY_KEYS.reduce((sum, key) => sum + categories[key], 0);
  return {
    scoreVersion: SCORE_VERSION,
    month,
    score,
    activePatientCount: score > 0 ? 1 : 0,
    categories,
    achievements: achievements.map((item) => ({
      key: item.key,
      points: item.points,
      achievedAt: item.achievedAt.toISOString(),
      providerId: item.providerId,
      attributionSource: item.attributionSource
    })),
    providerBreakdown: contributionsByProvider(patientData || {}, activity || {}, month)
  };
}

function addCategories(left, right) {
  const total = emptyCategories();
  CATEGORY_KEYS.forEach((key) => {
    total[key] = Number((left && left[key]) || 0) + Number((right && right[key]) || 0);
  });
  return total;
}

function subtractCategories(left, right) {
  const delta = emptyCategories();
  CATEGORY_KEYS.forEach((key) => {
    delta[key] = Number((left && left[key]) || 0) - Number((right && right[key]) || 0);
  });
  return delta;
}

function recentMonthKeys(count, now) {
  const months = [];
  const base = now instanceof Date ? now : new Date(now || Date.now());
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: LEADERBOARD_TIME_ZONE,
    year: 'numeric',
    month: 'numeric'
  }).formatToParts(base);
  const year = Number(parts.find((part) => part.type === 'year').value);
  const month = Number(parts.find((part) => part.type === 'month').value) - 1;
  for (let offset = 0; offset < count; offset += 1) {
    months.push(monthKeyForDate(new Date(Date.UTC(
      year,
      month - offset,
      1
    ))));
  }
  return months;
}

module.exports = {
  SCORE_VERSION,
  LEADERBOARD_TIME_ZONE,
  ALL_TIME_PERIOD,
  CATEGORY_KEYS,
  emptyCategories,
  isAllTimePeriod,
  isLeaderboardPeriod,
  monthKeyForDate,
  dayKeyForDate,
  timestampToDate,
  recordIsInMonth,
  recordsInMonth,
  buildPatientAchievements,
  contributionsByProvider,
  hasCompletedDeliveryNote,
  hasCompletedImmediateNewbornCare,
  calculatePatientContribution,
  addCategories,
  subtractCategories,
  recentMonthKeys
};
