'use strict';

const SCORE_VERSION = 'leaderboard-v2-1';
const LEADERBOARD_TIME_ZONE = 'Asia/Yangon';

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
  'immediateNewbornCare',
  'newbornCare',
  'transferRecords'
];

function emptyCategories() {
  return CATEGORY_KEYS.reduce((result, key) => {
    result[key] = 0;
    return result;
  }, {});
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

function isPatientRegistrationComplete(patientData) {
  const requiredFields = ['name', 'age', 'phone', 'address', 'township', 'village'];
  return requiredFields.every((field) => {
    const value = patientData[field] || patientData[field + 'Number'];
    return value && String(value).trim() !== '';
  });
}

function isAncFormComplete(ancVisits) {
  return (ancVisits || []).some((visit) => {
    return visit.visitDate &&
      visit.lmp !== undefined &&
      (visit.visitNumber !== undefined || visit.visit_number !== undefined);
  });
}

function isPncFormComplete(pncVisits) {
  return (pncVisits || []).some((visit) => visit.visitDate && visit.deliveredDateTime);
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

function calculatePatientContribution(patientData, activity, month) {
  const categories = emptyCategories();
  const patient = patientData || {};
  const records = activity || {};

  if (recordIsInMonth(patient, month, ['registration_date', 'created_at', 'createdAt', 'timestamp'])) {
    categories.registration = 1;
    if (isPatientRegistrationComplete(patient)) categories.completeRegistration = 2;
  }

  const ancVisits = recordsInMonth(
    records.ancVisits,
    month,
    ['visitDate', 'timestamp', 'createdAt']
  );
  if (ancVisits.length >= 1) categories.ancVisits = 1;
  if (ancVisits.length >= 4) categories.anc4Plus = 1;
  if (ancVisits.length >= 8) categories.anc8Plus = 1;
  if (ancVisits.length && isAncFormComplete(ancVisits)) categories.completeANC = 2;

  const pncVisits = recordsInMonth(
    records.pncVisits,
    month,
    ['visitDate', 'createdAt', 'updatedAt']
  );
  if (pncVisits.length >= 1) categories.pncVisits = 1;
  if (pncVisits.length && isPncFormComplete(pncVisits)) categories.completePNC = 1;

  if (recordsInMonth(records.labTests, month, ['testDate', 'timestamp']).length) {
    categories.labTests = 1;
  }
  if (recordsInMonth(records.immediateNewbornCare, month, ['timestamp']).length) {
    categories.immediateNewbornCare = 1;
  }
  if (recordsInMonth(
    records.newbornCare,
    month,
    ['visitDate', 'timestamp', 'createdAt']
  ).length) {
    categories.newbornCare = 1;
  }

  const labourRecordedInMonth = [
    records.summary,
    records.startingTime,
    records.secondStage
  ].some((record) => recordIsInMonth(record, month, ['timestamp', 'lastUpdated']));
  if (labourRecordedInMonth && isLcgCompleted(
    records.summary,
    records.startingTime,
    records.secondStage
  )) {
    categories.lcgCompleted = 1;
  }

  if (recordIsInMonth(records.transferRecord, month, ['referralTime', 'timestamp'])) {
    categories.transferRecords = 1;
  }

  const score = CATEGORY_KEYS.reduce((sum, key) => sum + categories[key], 0);
  return {
    scoreVersion: SCORE_VERSION,
    month,
    score,
    activePatientCount: score > 0 ? 1 : 0,
    categories
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
  CATEGORY_KEYS,
  emptyCategories,
  monthKeyForDate,
  timestampToDate,
  recordIsInMonth,
  recordsInMonth,
  calculatePatientContribution,
  addCategories,
  subtractCategories,
  recentMonthKeys
};
