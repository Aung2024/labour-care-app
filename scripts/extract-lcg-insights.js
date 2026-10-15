#!/usr/bin/env node
'use strict';

/**
 * Read-only LCG briefing extract for the Pyinmana/Tatkon pilot.
 *
 * Layer 1: analytics_v32_periods (dashboard "LCG usage" = both stage times
 * among completed Delivery Notes).
 * Layer 2: midwife-created mothers at facility codes 006-043, scored from
 * records/summary, startingTime, secondStage, deliveryNotes, and plotData.
 *
 * Writes aggregate tables only. No patient names or identifiers.
 * Auth matches scripts/export-facility-application-data.js (Firebase CLI login).
 */

const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { createRequire } = require('node:module');

const ROOT = path.resolve(__dirname, '..');
const FUNCTIONS_REQUIRE = createRequire(path.join(ROOT, 'functions', 'package.json'));
const SCRIPTS_REQUIRE = createRequire(path.join(ROOT, 'scripts', 'package.json'));
const admin = FUNCTIONS_REQUIRE('firebase-admin');
const firebaseAuth = FUNCTIONS_REQUIRE('firebase-tools/lib/auth.js');
const firebaseApi = FUNCTIONS_REQUIRE('firebase-tools/lib/api.js');
const ExcelJS = SCRIPTS_REQUIRE('exceljs');
const { FacilityConfig } = require(path.join(ROOT, 'js', 'facility-config.js'));

const PROJECT_ID = 'mnch-1cbda';
const PILOT_TOWNSHIPS = ['Pyinmana', 'Tatkon'];
const RECORD_DOCS = [
  ['records', 'summary'],
  ['records', 'startingTime'],
  ['records', 'secondStage'],
  ['records', 'deliveryNotes'],
  ['plotData', 'cervix'],
  ['plotData', 'descent'],
];

const SECTION_FIELDS = [
  ['support', 'Companion'],
  ['support', 'Pain_Relief'],
  ['support', 'Oral_fluids'],
  ['support', 'Mobility'],
  ['fhr', 'Baseline_FHR'],
  ['fhr', 'FHR_deceleration'],
  ['baby', 'Amniotic_fluid'],
  ['baby', 'Fetal_position'],
  ['baby', 'Caput'],
  ['baby', 'Moulding'],
  ['woman', 'Pulse'],
  ['woman', 'Systolic_BP'],
  ['woman', 'Diastolic_BP'],
  ['woman', 'Temperature_C'],
  ['woman', 'Urine'],
  ['contractions', 'Contractions_per_10_min'],
  ['contractions', 'Duration_of_contractions'],
  ['cervix', 'Cervix_Plot_10'],
  ['cervix', 'Cervix_Plot_9'],
  ['cervix', 'Cervix_Plot_8'],
  ['cervix', 'Cervix_Plot_7'],
  ['cervix', 'Cervix_Plot_6'],
  ['cervix', 'Cervix_Plot_5'],
  ['cervix', 'Cervix_Plot_P'],
  ['descent', 'Descent_Plot_5'],
  ['descent', 'Descent_Plot_4'],
  ['descent', 'Descent_Plot_3'],
  ['descent', 'Descent_Plot_2'],
  ['descent', 'Descent_Plot_1'],
  ['descent', 'Descent_Plot_0'],
  ['meds', 'Medication_Oxytocin'],
  ['meds', 'Medication_Medicine'],
  ['meds', 'Medication_IV_Fluids'],
  ['sdm', 'ASSESSMENT_Womans_condition'],
  ['sdm', 'ASSESSMENT_Babys_condition'],
  ['sdm', 'ASSESSMENT_Labour_progress'],
  ['sdm', 'ASSESSMENT_Other_concerns'],
  ['sdm', 'PLAN'],
  ['sdm', 'INITIALS'],
].sort((left, right) => right[1].length - left[1].length);

const META_KEYS = new Set([
  'startingTime',
  'secondStageTime',
  'activeFirstStage_Time',
  'secondStage_Time',
  'timestamp',
  'lastUpdated',
  'setupCompleted',
  'synced_from_offline',
  'offline_created_at',
  'savedBy',
  'updatedBy',
  'createdAt',
  'updatedAt',
]);

const VITAL_FIELDS = new Set(['Pulse', 'Systolic_BP', 'Diastolic_BP', 'Temperature_C']);
const CHOICE_FIELDS = ['Companion', 'Pain_Relief', 'Oral_fluids', 'Mobility'];
const SECTION_ORDER = ['support', 'fhr', 'baby', 'woman', 'contractions', 'cervix', 'descent', 'meds', 'sdm'];
const SECTION_LABELS = {
  support: 'Supportive care',
  fhr: 'Fetal heart rate',
  baby: 'Fetal condition',
  woman: 'Woman vitals',
  contractions: 'Contractions',
  cervix: 'Cervix plot',
  descent: 'Descent plot',
  meds: 'Medication',
  sdm: 'Shared decision-making',
};

function townshipForFacilityCode(code) {
  const facility = FacilityConfig.getFacilityByCode(code);
  return facility && facility.township ? facility.township : '';
}

function isPilotFacilityCode(code) {
  return PILOT_TOWNSHIPS.includes(townshipForFacilityCode(code));
}

function facilityMeta(code) {
  const facility = FacilityConfig.getFacilityByCode(String(code || '').trim());
  if (!facility) {
    return {
      code: String(code || '').trim(),
      name: String(code || '').trim() || 'Unknown facility',
      township: '',
      facilityType: 'other',
    };
  }
  return {
    code: facility.code,
    name: facility.name_en || facility.code,
    township: facility.township || '',
    facilityType: facility.facilityType || 'other',
  };
}

function pct(numerator, denominator) {
  if (!denominator) return null;
  return Math.round((numerator / denominator) * 1000) / 10;
}

function asDate(value) {
  if (!value) return null;
  if (typeof value.toDate === 'function') {
    const date = value.toDate();
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'object' && typeof value.seconds === 'number') {
    return new Date(value.seconds * 1000);
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

function yangonMonth(value) {
  const date = asDate(value);
  if (!date) return null;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Yangon',
    year: 'numeric',
    month: '2-digit',
  }).format(date);
  return parts.slice(0, 7);
}

function todayIso() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Yangon',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function meaningful(value) {
  if (value === null || value === undefined || value === false) return false;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'string') {
    const text = value.trim();
    return text !== '' && text !== 'null' && text !== 'undefined';
  }
  return false;
}

function dashboardTruthyTime(value) {
  if (value === null || value === undefined || value === false) return false;
  if (typeof value === 'string') return value.trim() !== '';
  if (typeof value === 'number') return Number.isFinite(value);
  return true;
}

function strictTime(value) {
  if (!dashboardTruthyTime(value)) return false;
  if (typeof value !== 'string') return true;
  const text = value.trim();
  return text !== 'null' && text !== 'undefined';
}

function firstPresent(values, predicate) {
  return values.some((value) => predicate(value));
}

function stageTimes(summary, starting, second) {
  const summaryData = summary || {};
  const startingData = starting || {};
  const secondData = second || {};
  const firstValues = [
    summaryData.startingTime,
    summaryData.activeFirstStage_Time,
    startingData.startingTime,
  ];
  const secondValues = [
    summaryData.secondStageTime,
    summaryData.secondStage_Time,
    secondData.secondStageStartTime,
    secondData.secondStageTime,
  ];
  return {
    firstStrict: firstPresent(firstValues, strictTime),
    secondStrict: firstPresent(secondValues, strictTime),
    firstDashboard: firstPresent(firstValues, dashboardTruthyTime),
    secondDashboard: firstPresent(secondValues, dashboardTruthyTime),
  };
}

function fieldForKey(key) {
  for (const [section, field] of SECTION_FIELDS) {
    if (key === field || key.startsWith(`${field}_`)) return { section, field };
  }
  return null;
}

function choiceBucket(field, value) {
  const text = String(value || '').trim().toUpperCase();
  if (field === 'Mobility') {
    if (text === 'M' || text === 'MOBILE') return 'yes';
    if (text === 'SP' || text === 'SUPINE' || text === 'SUPINE POSITION') return 'no';
    return 'other';
  }
  if (text === 'Y' || text === 'YES') return 'yes';
  if (text === 'N' || text === 'NO') return 'no';
  if (text === 'D' || text === 'DECLINED') return 'declined';
  return 'other';
}

function isAlertValue(field, value) {
  const text = String(value).trim();
  const num = Number(text);
  if (field === 'Companion' || field === 'Pain_Relief' || field === 'Oral_fluids') return text === 'N';
  if (field === 'Mobility') return text === 'SP';
  if (field === 'Baseline_FHR') return Number.isFinite(num) && (num < 110 || num > 160);
  if (field === 'FHR_deceleration') return text === 'L';
  if (field === 'Pulse') return Number.isFinite(num) && (num < 60 || num > 120);
  if (field === 'Systolic_BP') return Number.isFinite(num) && (num < 80 || num > 140);
  if (field === 'Diastolic_BP') return Number.isFinite(num) && num > 90;
  if (field === 'Temperature_C') return Number.isFinite(num) && (num < 35 || num > 37.5);
  if (field === 'Amniotic_fluid') return text === 'M+++' || text === 'B';
  if (field === 'Contractions_per_10_min') return Number.isFinite(num) && (num < 2.1 || num > 5);
  if (field === 'Duration_of_contractions') return Number.isFinite(num) && (num < 20 || num > 60);
  return false;
}

function analyzeSummary(summary) {
  const data = summary || {};
  const sections = Object.fromEntries(SECTION_ORDER.map((name) => [name, false]));
  const choices = Object.fromEntries(CHOICE_FIELDS.map((field) => [field, { yes: 0, no: 0, declined: 0, other: 0 }]));
  const times = new Set();
  let cells = 0;
  let alertCells = 0;
  let supportiveAlertCells = 0;
  let clinicalAlertCells = 0;
  let hasBaselineFhr = false;
  let fhrReadings = 0;
  let fhrOutOfRange = 0;
  let lateDecel = false;
  let fhrDecelReadings = 0;
  let numericVitals = 0;
  let nonNumericVitals = 0;
  let oxytocin = false;
  let sdmAssessmentOrPlan = false;

  Object.keys(data).forEach((key) => {
    if (META_KEYS.has(key)) return;
    const match = fieldForKey(key);
    if (!match) return;
    const value = data[key];
    if (!meaningful(value)) return;
    cells += 1;
    sections[match.section] = true;
    const timeMatch = key.slice(match.field.length + 1).match(/^(\d{1,2})_(\d{2})(?:_|$)/);
    if (timeMatch) {
      const hour = Number(timeMatch[1]);
      const minute = Number(timeMatch[2]);
      if (hour <= 23 && minute <= 59) {
        times.add(`${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`);
      }
    }
    if (CHOICE_FIELDS.includes(match.field)) {
      choices[match.field][choiceBucket(match.field, value)] += 1;
    }
    if (match.field === 'Baseline_FHR') {
      fhrReadings += 1;
      if (isAlertValue(match.field, value)) fhrOutOfRange += 1;
    }
    if (match.field === 'FHR_deceleration') {
      fhrDecelReadings += 1;
      if (String(value).trim() === 'L') lateDecel = true;
    }
    if (VITAL_FIELDS.has(match.field)) {
      if (Number.isFinite(Number(String(value).trim()))) numericVitals += 1;
      else nonNumericVitals += 1;
    }
    if (match.field === 'Medication_Oxytocin') oxytocin = true;
    if ([
      'ASSESSMENT_Womans_condition',
      'ASSESSMENT_Babys_condition',
      'ASSESSMENT_Labour_progress',
      'ASSESSMENT_Other_concerns',
      'PLAN',
    ].includes(match.field)) sdmAssessmentOrPlan = true;
    if (isAlertValue(match.field, value)) {
      alertCells += 1;
      if (['Companion', 'Pain_Relief', 'Oral_fluids', 'Mobility'].includes(match.field)) {
        supportiveAlertCells += 1;
      } else {
        clinicalAlertCells += 1;
      }
    }
    if (match.field === 'Baseline_FHR') hasBaselineFhr = true;
  });

  return {
    sections,
    choices,
    timepoints: times.size,
    cells,
    alertCells,
    supportiveAlertCells,
    clinicalAlertCells,
    hasBaselineFhr,
    fhrReadings,
    fhrOutOfRange,
    lateDecel,
    fhrDecelReadings,
    numericVitals,
    nonNumericVitals,
    oxytocin,
    sdmAssessmentOrPlan,
    anyCell: cells > 0,
  };
}

function hasPlot(data) {
  if (!data || typeof data !== 'object') return false;
  if (Array.isArray(data.data)) return data.data.length > 0;
  if (Array.isArray(data.points)) return data.points.length > 0;
  return false;
}

function normalizeBirthPlace(value) {
  const key = String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (!key) return 'Other/Unknown';
  if (key.includes('home') || key.includes('အိမ်')) return 'Home';
  if (key.includes('private') || key.includes('ပုဂ္ဂလိက')) return 'Private Facility';
  if (
    key.includes('hospital') ||
    key.includes('facility') ||
    key.includes('rhc') ||
    key.includes('srhc') ||
    key.includes('ကျန်းမာရေး') ||
    key.includes('ဌာန')
  ) {
    return 'Public Health Facility';
  }
  return 'Other/Unknown';
}

function normalizeDeliveryMode(value) {
  const key = String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (!key) return 'Other/Unknown';
  if (key.includes('emergency') && key.includes('section')) return 'Emergency C-section';
  if (key.includes('elective') && key.includes('section')) return 'Elective C-section';
  if (key.includes('section') || key.includes('caesarean') || key.includes('cesarean')) return 'C-section';
  if (key.includes('assist') || key.includes('forceps') || key.includes('vacuum')) return 'Assisted vaginal';
  if (key.includes('normal') || key.includes('vaginal')) return 'Normal vaginal';
  return 'Other/Unknown';
}

function providerBucket(value) {
  const key = String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (!key) return 'Not recorded';
  if (['skilled_birth_attendant', 'sba', 'skilled_birth_attendance'].includes(key)) return 'Skilled birth attendant';
  if (key === 'amw') return 'AMW';
  if (key.includes('midwife') || key.includes('ဆရာမ')) return 'Midwife, other label';
  if (key.includes('doctor') || key.includes('ဆရာဝန်')) return 'Doctor, other label';
  if (key.includes('nurse')) return 'Nurse, other label';
  return 'Other or unlisted label';
}

function normalizeOnset(value) {
  const text = String(value || '').trim().toLowerCase();
  if (!text) return 'Not recorded';
  if (text.includes('induc')) return 'Induced';
  if (text.includes('spont')) return 'Spontaneous';
  return 'Other';
}

function birthMonthFromNotes(notes) {
  if (!notes) return null;
  const details = notes.deliveryDetails || notes.labourDetails || {};
  const babies = Array.isArray(details.babies) ? details.babies : [];
  for (const baby of babies) {
    const month = yangonMonth(baby.birthTime || baby.birth_time);
    if (month) return month;
  }
  return yangonMonth(details.deliveryDate || details.birthTime || notes.createdAt || notes.updatedAt || notes.timestamp);
}

function choicePatientClass(counts) {
  if (!counts) return 'none';
  const total = counts.yes + counts.no + counts.declined + counts.other;
  if (!total) return 'none';
  if (counts.yes > 0) return 'yes';
  if (counts.declined > 0 && counts.no === 0) return 'declined';
  if (counts.no > 0) return 'no';
  return 'other';
}

function emptySections() {
  return Object.fromEntries(SECTION_ORDER.map((name) => [name, 0]));
}

function emptyCounter() {
  return {
    mothers: 0,
    deliveryNotes: 0,
    firstStage: 0,
    secondStage: 0,
    bothStages: 0,
    bothAmongNotes: 0,
    firstAmongNotes: 0,
    secondOnlyAmongNotes: 0,
    notesWithoutStage: 0,
    startedWithoutNotes: 0,
    dashboardBothAmongNotes: 0,
    anyObservationAmongStarted: 0,
    anyObservationAmongBoth: 0,
    cervixAmongStarted: 0,
    descentAmongStarted: 0,
    sdmAmongStarted: 0,
    sdmPlanAmongStarted: 0,
    cervixAmongBoth: 0,
    sdmPlanAmongBoth: 0,
    sectionsAmongStarted: emptySections(),
    sectionsAmongBoth: emptySections(),
    companionRecorded: 0,
    companionYes: 0,
    companionNo: 0,
    companionDeclined: 0,
    painRecorded: 0,
    painYes: 0,
    painNo: 0,
    oralRecorded: 0,
    oralYes: 0,
    oralNo: 0,
    mobilityRecorded: 0,
    mobilityMobile: 0,
    oxytocinOnLcg: 0,
    alertMothers: 0,
    clinicalAlertMothers: 0,
    supportiveGapMothers: 0,
    baselineFhrMothers: 0,
    providers: {},
    observedCells: 0,
    alertCells: 0,
    fhrReadings: 0,
    fhrOutOfRange: 0,
    lateDecelMothers: 0,
    numericVitals: 0,
    nonNumericVitals: 0,
    timepointHist: {},
    timepointSum: 0,
    timepointMothers: 0,
    onset: { Spontaneous: 0, Induced: 0, 'Not recorded': 0, Other: 0 },
  };
}

function bumpHist(hist, value) {
  const key = value >= 13 ? '13+' : String(value);
  hist[key] = (hist[key] || 0) + 1;
}

function addCase(counter, labourCase) {
  counter.mothers += 1;
  if (labourCase.deliveryNotes) {
    counter.deliveryNotes += 1;
    if (labourCase.firstStage) counter.firstAmongNotes += 1;
    if (labourCase.secondStage && !labourCase.firstStage) counter.secondOnlyAmongNotes += 1;
    if (labourCase.bothStages) counter.bothAmongNotes += 1;
    if (labourCase.dashboardBoth) counter.dashboardBothAmongNotes += 1;
    if (!labourCase.firstStage && !labourCase.secondStage) counter.notesWithoutStage += 1;
  }
  if (labourCase.firstStage) counter.firstStage += 1;
  if (labourCase.secondStage) counter.secondStage += 1;
  if (labourCase.bothStages) counter.bothStages += 1;
  if (labourCase.firstStage && !labourCase.deliveryNotes) counter.startedWithoutNotes += 1;
  if (labourCase.firstStage && labourCase.anyObservation) counter.anyObservationAmongStarted += 1;
  if (labourCase.bothStages && labourCase.anyObservation) counter.anyObservationAmongBoth += 1;
  if (labourCase.firstStage && labourCase.cervix) counter.cervixAmongStarted += 1;
  if (labourCase.firstStage && labourCase.descent) counter.descentAmongStarted += 1;
  if (labourCase.firstStage && labourCase.sdm) counter.sdmAmongStarted += 1;
  if (labourCase.firstStage && labourCase.sdmPlan) counter.sdmPlanAmongStarted += 1;
  if (labourCase.bothStages && labourCase.cervix) counter.cervixAmongBoth += 1;
  if (labourCase.bothStages && labourCase.sdmPlan) counter.sdmPlanAmongBoth += 1;
  if (labourCase.firstStage) {
    SECTION_ORDER.forEach((name) => {
      if (labourCase.sections[name]) counter.sectionsAmongStarted[name] += 1;
    });
  }
  if (labourCase.bothStages) {
    SECTION_ORDER.forEach((name) => {
      if (labourCase.sections[name]) counter.sectionsAmongBoth[name] += 1;
    });
  }
  if (labourCase.companionClass !== 'none') counter.companionRecorded += 1;
  if (labourCase.companionClass === 'yes') counter.companionYes += 1;
  if (labourCase.companionClass === 'no') counter.companionNo += 1;
  if (labourCase.companionClass === 'declined') counter.companionDeclined += 1;
  if (labourCase.painClass !== 'none') counter.painRecorded += 1;
  if (labourCase.painClass === 'yes') counter.painYes += 1;
  if (labourCase.painClass === 'no') counter.painNo += 1;
  if (labourCase.oralClass !== 'none') counter.oralRecorded += 1;
  if (labourCase.oralClass === 'yes') counter.oralYes += 1;
  if (labourCase.oralClass === 'no') counter.oralNo += 1;
  if (labourCase.mobilityClass !== 'none') counter.mobilityRecorded += 1;
  if (labourCase.mobilityClass === 'yes') counter.mobilityMobile += 1;
  if (labourCase.oxytocin) counter.oxytocinOnLcg += 1;
  if (labourCase.anyObservation && labourCase.alertCells > 0) counter.alertMothers += 1;
  if (labourCase.anyObservation && labourCase.clinicalAlertCells > 0) counter.clinicalAlertMothers += 1;
  if (labourCase.anyObservation && labourCase.supportiveAlertCells > 0) counter.supportiveGapMothers += 1;
  if (labourCase.firstStage && labourCase.hasBaselineFhr) counter.baselineFhrMothers += 1;
  if (labourCase.deliveryNotes && labourCase.provider) {
    counter.providers[labourCase.provider] = (counter.providers[labourCase.provider] || 0) + 1;
  }
  if (labourCase.lateDecel) counter.lateDecelMothers += 1;
  counter.observedCells += labourCase.cells;
  counter.alertCells += labourCase.alertCells;
  counter.fhrReadings += labourCase.fhrReadings;
  counter.fhrOutOfRange += labourCase.fhrOutOfRange;
  counter.numericVitals += labourCase.numericVitals;
  counter.nonNumericVitals += labourCase.nonNumericVitals;
  if (labourCase.anyObservation) {
    bumpHist(counter.timepointHist, labourCase.timepoints);
    counter.timepointSum += labourCase.timepoints;
    counter.timepointMothers += 1;
  }
  if (labourCase.firstStage) {
    const onset = labourCase.onset || 'Not recorded';
    counter.onset[onset] = (counter.onset[onset] || 0) + 1;
  }
}

function medianFromHist(hist) {
  const order = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13+'];
  const total = order.reduce((sum, key) => sum + (hist[key] || 0), 0);
  if (!total) return null;
  const target = Math.ceil(total / 2);
  let seen = 0;
  for (const key of order) {
    seen += hist[key] || 0;
    if (seen >= target) return key === '13+' ? 13 : Number(key);
  }
  return null;
}

function rates(counter) {
  const facilityBirths = (counter.places && counter.places['Public Health Facility']
    ? counter.places['Public Health Facility'].deliveryNotes : 0) +
    (counter.places && counter.places['Private Facility']
      ? counter.places['Private Facility'].deliveryNotes : 0);
  const facilityBoth = (counter.places && counter.places['Public Health Facility']
    ? counter.places['Public Health Facility'].bothAmongNotes : 0) +
    (counter.places && counter.places['Private Facility']
      ? counter.places['Private Facility'].bothAmongNotes : 0);
  const home = counter.places && counter.places.Home ? counter.places.Home : null;
  return {
    lcgOfNotes: pct(counter.bothAmongNotes, counter.deliveryNotes),
    dashboardLcgOfNotes: pct(counter.dashboardBothAmongNotes, counter.deliveryNotes),
    firstOfNotes: pct(counter.firstAmongNotes, counter.deliveryNotes),
    bothOfStarted: pct(counter.bothStages, counter.firstStage),
    observationOfStarted: pct(counter.anyObservationAmongStarted, counter.firstStage),
    observationOfBoth: pct(counter.anyObservationAmongBoth, counter.bothStages),
    cervixOfStarted: pct(counter.cervixAmongStarted, counter.firstStage),
    descentOfStarted: pct(counter.descentAmongStarted, counter.firstStage),
    sdmOfStarted: pct(counter.sdmAmongStarted, counter.firstStage),
    sdmPlanOfStarted: pct(counter.sdmPlanAmongStarted, counter.firstStage),
    cervixOfBoth: pct(counter.cervixAmongBoth, counter.bothStages),
    sdmPlanOfBoth: pct(counter.sdmPlanAmongBoth, counter.bothStages),
    companionYesOfRecorded: pct(counter.companionYes, counter.companionRecorded),
    painYesOfRecorded: pct(counter.painYes, counter.painRecorded),
    oralYesOfRecorded: pct(counter.oralYes, counter.oralRecorded),
    mobilityOfRecorded: pct(counter.mobilityMobile, counter.mobilityRecorded),
    alertOfObserved: pct(counter.alertMothers, counter.timepointMothers),
    fhrOutOfRangeOfReadings: pct(counter.fhrOutOfRange, counter.fhrReadings),
    lateDecelOfStarted: pct(counter.lateDecelMothers, counter.firstStage),
    clinicalAlertOfObserved: pct(counter.clinicalAlertMothers, counter.timepointMothers),
    supportiveGapOfObserved: pct(counter.supportiveGapMothers, counter.timepointMothers),
    baselineFhrOfStarted: pct(counter.baselineFhrMothers, counter.firstStage),
    facilityLcg: pct(facilityBoth, facilityBirths),
    homeLcg: home ? pct(home.bothAmongNotes, home.deliveryNotes) : null,
    facilityBirths,
    facilityBoth,
    medianTimepoints: medianFromHist(counter.timepointHist),
    meanTimepoints: counter.timepointMothers
      ? Math.round((counter.timepointSum / counter.timepointMothers) * 10) / 10
      : null,
    sectionsOfStarted: Object.fromEntries(SECTION_ORDER.map((name) => [
      name,
      pct(counter.sectionsAmongStarted[name], counter.firstStage),
    ])),
    sectionsOfBoth: Object.fromEntries(SECTION_ORDER.map((name) => [
      name,
      pct(counter.sectionsAmongBoth[name], counter.bothStages),
    ])),
  };
}

function buildCase(mother, docs) {
  const summary = docs.summary || {};
  const stages = stageTimes(summary, docs.startingTime, docs.secondStage);
  const observation = analyzeSummary(summary);
  const cervixPlot = hasPlot(docs.cervix);
  const descentPlot = hasPlot(docs.descent);
  const sections = { ...observation.sections };
  if (cervixPlot) sections.cervix = true;
  if (descentPlot) sections.descent = true;
  const anyObservation = observation.anyCell || cervixPlot || descentPlot;
  const notes = docs.deliveryNotes || null;
  const details = notes ? (notes.deliveryDetails || notes.labourDetails || {}) : {};
  const place = notes
    ? normalizeBirthPlace(details.birthPlace || details.birthplace || notes.birthplace)
    : null;
  const mode = notes
    ? normalizeDeliveryMode(details.modeOfDelivery || details.mode_of_delivery || notes.modeOfDelivery)
    : null;
  return {
    creatorFacilityCode: mother.creatorFacilityCode,
    patientFacilityCode: mother.patientFacilityCode,
    patientTownship: mother.patientTownship,
    onset: normalizeOnset(mother.labourOnset),
    deliveryNotes: Boolean(notes),
    place,
    mode,
    noteMonth: birthMonthFromNotes(notes),
    firstStage: stages.firstStrict,
    secondStage: stages.secondStrict,
    bothStages: stages.firstStrict && stages.secondStrict,
    dashboardBoth: stages.firstDashboard && stages.secondDashboard,
    anyObservation,
    cervix: sections.cervix,
    descent: sections.descent,
    sdm: sections.sdm,
    sdmPlan: observation.sdmAssessmentOrPlan,
    sections,
    companionClass: choicePatientClass(observation.choices.Companion),
    painClass: choicePatientClass(observation.choices.Pain_Relief),
    oralClass: choicePatientClass(observation.choices.Oral_fluids),
    mobilityClass: choicePatientClass(observation.choices.Mobility),
    oxytocin: observation.oxytocin,
    provider: notes
      ? providerBucket(details.birthProvider || details.birth_provider || notes.birthProvider)
      : null,
    alertCells: observation.alertCells,
    supportiveAlertCells: observation.supportiveAlertCells,
    clinicalAlertCells: observation.clinicalAlertCells,
    hasBaselineFhr: observation.hasBaselineFhr,
    cells: observation.cells,
    fhrReadings: observation.fhrReadings,
    fhrOutOfRange: observation.fhrOutOfRange,
    lateDecel: observation.lateDecel,
    numericVitals: observation.numericVitals,
    nonNumericVitals: observation.nonNumericVitals,
    timepoints: observation.timepoints,
  };
}

function ensureCounter(map, key) {
  if (!map.has(key)) map.set(key, emptyCounter());
  return map.get(key);
}

function ensurePlace(counter, place) {
  if (!counter.places) counter.places = {};
  if (!counter.places[place]) {
    counter.places[place] = { deliveryNotes: 0, bothAmongNotes: 0, firstAmongNotes: 0 };
  }
  return counter.places[place];
}

function ensureMode(counter, mode) {
  if (!counter.modes) counter.modes = {};
  if (!counter.modes[mode]) {
    counter.modes[mode] = { deliveryNotes: 0, bothAmongNotes: 0 };
  }
  return counter.modes[mode];
}

function ensureMonth(counter, month) {
  if (!counter.months) counter.months = {};
  if (!counter.months[month]) {
    counter.months[month] = { deliveryNotes: 0, bothAmongNotes: 0, firstAmongNotes: 0 };
  }
  return counter.months[month];
}

function addMappedCase(counter, labourCase) {
  addCase(counter, labourCase);
  if (labourCase.deliveryNotes && labourCase.place) {
    const place = ensurePlace(counter, labourCase.place);
    place.deliveryNotes += 1;
    if (labourCase.bothStages) place.bothAmongNotes += 1;
    if (labourCase.firstStage) place.firstAmongNotes += 1;
    const mode = ensureMode(counter, labourCase.mode || 'Other/Unknown');
    mode.deliveryNotes += 1;
    if (labourCase.bothStages) mode.bothAmongNotes += 1;
    if (labourCase.noteMonth) {
      const month = ensureMonth(counter, labourCase.noteMonth);
      month.deliveryNotes += 1;
      if (labourCase.bothStages) month.bothAmongNotes += 1;
      if (labourCase.firstStage) month.firstAmongNotes += 1;
    }
  }
}

function createRollup() {
  return {
    total: emptyCounter(),
    byTownship: new Map(),
    byFacility: new Map(),
    byFacilityType: new Map(),
    creatorPatientMismatch: 0,
    patientOutsidePilot: 0,
  };
}

function addToRollup(rollup, labourCase, facility) {
  addMappedCase(rollup.total, labourCase);
  const townshipKey = facility.township || 'Unknown';
  addMappedCase(ensureCounter(rollup.byTownship, townshipKey), labourCase);
  addMappedCase(ensureCounter(rollup.byFacility, facility.code || 'unknown'), labourCase);
  addMappedCase(ensureCounter(rollup.byFacilityType, facility.facilityType || 'other'), labourCase);
}

function counterToJson(counter) {
  const placeRows = Object.entries(counter.places || {}).map(([place, row]) => ({
    place,
    deliveryNotes: row.deliveryNotes,
    bothAmongNotes: row.bothAmongNotes,
    firstAmongNotes: row.firstAmongNotes,
    lcgPercent: pct(row.bothAmongNotes, row.deliveryNotes),
  })).sort((left, right) => right.deliveryNotes - left.deliveryNotes);
  const modeRows = Object.entries(counter.modes || {}).map(([mode, row]) => ({
    mode,
    deliveryNotes: row.deliveryNotes,
    bothAmongNotes: row.bothAmongNotes,
    lcgPercent: pct(row.bothAmongNotes, row.deliveryNotes),
  })).sort((left, right) => right.deliveryNotes - left.deliveryNotes);
  const monthRows = Object.keys(counter.months || {}).sort().map((month) => ({
    month,
    ...counter.months[month],
    lcgPercent: pct(counter.months[month].bothAmongNotes, counter.months[month].deliveryNotes),
  }));
  const published = { ...counter };
  delete published.places;
  delete published.modes;
  delete published.months;
  return {
    ...published,
    rates: rates(counter),
    places: placeRows,
    modes: modeRows,
    months: monthRows,
  };
}

function periodKeys() {
  const keys = ['all'];
  [2024, 2025, 2026].forEach((year) => {
    keys.push(String(year));
    for (let quarter = 1; quarter <= 4; quarter += 1) keys.push(`${year}-Q${quarter}`);
    for (let month = 1; month <= 12; month += 1) {
      keys.push(`${year}-${String(month).padStart(2, '0')}`);
    }
  });
  return keys;
}

function isBaseScope(id, data) {
  const decoded = decodeURIComponent(id);
  if (decoded.includes('department=') || decoded.includes('facilityType=')) return false;
  if (data && (data.department || data.facilityType)) return false;
  return decoded.startsWith('geography=');
}

function scopeIdentity(id, data) {
  const decoded = decodeURIComponent(id);
  const match = decoded.match(/^geography=([^:]+):([^|]+)/);
  const geographyType = (data && data.geographyType) || (match && match[1]) || '';
  const geographyId = (data && data.geographyId) || (match && match[2]) || '';
  return {
    geographyType,
    geographyId,
    township: (data && data.township) || (geographyType === 'township' ? geographyId : ''),
    facilityCode: (data && data.facilityCode) || (geographyType === 'facility' ? geographyId : ''),
    facilityName: (data && data.facilityName) || '',
  };
}

function wantedScope(identity) {
  if (identity.geographyType === 'national' && identity.geographyId === 'all') return true;
  if (identity.geographyType === 'township' && PILOT_TOWNSHIPS.includes(identity.geographyId)) return true;
  if (identity.geographyType === 'facility' && isPilotFacilityCode(identity.facilityCode || identity.geographyId)) {
    return true;
  }
  return false;
}

function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function deliverySlice(metrics) {
  const delivery = (metrics && metrics.delivery) || {};
  const places = delivery.places || {};
  const modes = delivery.modes || {};
  return {
    completedNotes: numberOrZero(delivery.completedNotes),
    lcgUsed: numberOrZero(delivery.lcgUsed),
    lcgPercent: pct(numberOrZero(delivery.lcgUsed), numberOrZero(delivery.completedNotes)),
    uterotonic: numberOrZero(delivery.uterotonic),
    uterotonicPercent: pct(numberOrZero(delivery.uterotonic), numberOrZero(delivery.completedNotes)),
    homeSkilled: numberOrZero(delivery.homeSkilled),
    institutionalSkilled: numberOrZero(delivery.institutionalSkilled),
    places: {
      Home: numberOrZero(places.Home),
      'Public Health Facility': numberOrZero(places['Public Health Facility']),
      'Private Facility': numberOrZero(places['Private Facility']),
      'Other/Unknown': numberOrZero(places['Other/Unknown']),
    },
    modes: Object.fromEntries(Object.entries(modes).map(([key, value]) => [key, numberOrZero(value)])),
  };
}

function createTemporaryAdcFile() {
  const account = firebaseAuth.getGlobalDefaultAccount();
  const refreshToken = account && account.tokens && account.tokens.refresh_token;
  if (!refreshToken) {
    throw new Error('No Firebase CLI login found. Run `firebase login` and retry.');
  }
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mnch-lcg-insights-'));
  const credentialPath = path.join(tempDir, 'application-default-credentials.json');
  fs.writeFileSync(credentialPath, JSON.stringify({
    type: 'authorized_user',
    client_id: firebaseApi.clientId(),
    client_secret: firebaseApi.clientSecret(),
    refresh_token: refreshToken,
    quota_project_id: PROJECT_ID,
  }), { encoding: 'utf8', mode: 0o600 });
  return {
    path: credentialPath,
    cleanup() {
      fs.rmSync(tempDir, { recursive: true, force: true });
    },
  };
}

async function initializeFirestore() {
  const temporaryAdc = createTemporaryAdcFile();
  process.env.GOOGLE_APPLICATION_CREDENTIALS = temporaryAdc.path;
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      projectId: PROJECT_ID,
    });
  }
  const db = admin.firestore();
  db.settings({ ignoreUndefinedProperties: true });
  return { db, cleanup: temporaryAdc.cleanup };
}

async function getAllChunked(db, refs) {
  const chunkSize = 80;
  const snaps = [];
  for (let index = 0; index < refs.length; index += chunkSize) {
    const chunk = refs.slice(index, index + chunkSize);
    const part = await db.getAll(...chunk);
    snaps.push(...part);
  }
  return snaps;
}

async function loadDashboard(db) {
  console.log('Reading dashboard scope list for period "all"...');
  const allScopes = await db.collection('analytics_v32_periods').doc('all').collection('scopes').get();
  const selected = [];
  allScopes.docs.forEach((doc) => {
    if (!isBaseScope(doc.id, doc.data() || {})) return;
    const identity = scopeIdentity(doc.id, doc.data() || {});
    if (!wantedScope(identity)) return;
    selected.push({ id: doc.id, identity, allTime: deliverySlice((doc.data() || {}).metrics) });
  });
  console.log(`Dashboard base scopes kept: ${selected.length} of ${allScopes.size}`);

  const periods = periodKeys().filter((key) => key !== 'all');
  const refs = [];
  const meta = [];
  selected.forEach((scope) => {
    periods.forEach((period) => {
      refs.push(db.collection('analytics_v32_periods').doc(period).collection('scopes').doc(scope.id));
      meta.push({ period, id: scope.id });
    });
  });
  console.log(`Reading ${refs.length} dashboard period scopes...`);
  const snaps = refs.length ? await getAllChunked(db, refs) : [];
  const rows = [];
  selected.forEach((scope) => {
    rows.push({
      period: 'all',
      ...scope.identity,
      scopeId: scope.id,
      ...scope.allTime,
    });
  });
  snaps.forEach((snap, index) => {
    if (!snap.exists) return;
    const scope = selected.find((item) => item.id === meta[index].id);
    const slice = deliverySlice((snap.data() || {}).metrics);
    if (!slice.completedNotes && !slice.lcgUsed) return;
    rows.push({
      period: meta[index].period,
      ...scope.identity,
      scopeId: scope.id,
      ...slice,
    });
  });
  return {
    scopeCountRead: allScopes.size,
    rows,
  };
}

function normalizeRole(role) {
  return String(role || '').trim().toLowerCase();
}

function normalizePatientType(patient) {
  return String(patient.patient_type || patient.patientType || 'mother').trim().toLowerCase();
}

async function loadMothers(db) {
  console.log('Loading users...');
  const usersSnapshot = await db.collection('users').get();
  const midwives = new Map();
  usersSnapshot.docs.forEach((doc) => {
    const user = doc.data() || {};
    if (normalizeRole(user.role) !== 'midwife') return;
    const facilityCode = String(user.facility_code || user.facilityCode || '').trim();
    if (!isPilotFacilityCode(facilityCode)) return;
    midwives.set(doc.id, facilityMeta(facilityCode));
  });
  console.log(`Pilot midwives: ${midwives.size}`);

  console.log('Loading patients...');
  const patientsSnapshot = await db.collection('patients').get();
  const mothers = new Map();
  patientsSnapshot.docs.forEach((doc) => {
    const data = doc.data() || {};
    const creatorId = String(data.created_by || data.createdBy || '').trim();
    if (!midwives.has(creatorId)) return;
    if (normalizePatientType(data) === 'baby') return;
    const creatorFacility = midwives.get(creatorId);
    const patientFacilityCode = String(data.facility_code || data.facilityCode || '').trim();
    mothers.set(doc.id, {
      creatorFacilityCode: creatorFacility.code,
      creatorTownship: creatorFacility.township,
      patientFacilityCode,
      patientTownship: String(data.township || '').trim(),
      labourOnset: data.labour_onset || data.labourOnset || '',
    });
  });
  console.log(`Mothers created by pilot midwives: ${mothers.size}`);
  return { midwives: midwives.size, mothers };
}

async function scanMothers(db, mothers) {
  const ids = [...mothers.keys()];
  const rollupByCreator = createRollup();
  const rollupByPatient = createRollup();
  const groupSize = 10;
  const groups = [];
  for (let index = 0; index < ids.length; index += groupSize) {
    groups.push(ids.slice(index, index + groupSize));
  }
  let cursor = 0;
  let done = 0;
  async function worker() {
    while (cursor < groups.length) {
      const group = groups[cursor];
      cursor += 1;
      const refs = [];
      const meta = [];
      group.forEach((id) => {
        RECORD_DOCS.forEach(([collectionName, docId]) => {
          refs.push(db.doc(`patients/${id}/${collectionName}/${docId}`));
          meta.push({ id, docId });
        });
      });
      const snaps = await db.getAll(...refs);
      const byId = new Map();
      snaps.forEach((snap, index) => {
        const item = meta[index];
        if (!byId.has(item.id)) byId.set(item.id, {});
        if (snap.exists) byId.get(item.id)[item.docId] = snap.data() || {};
      });
      group.forEach((id) => {
        const mother = mothers.get(id);
        const labourCase = buildCase(mother, byId.get(id) || {});
        const creatorFacility = facilityMeta(mother.creatorFacilityCode);
        addToRollup(rollupByCreator, labourCase, creatorFacility);
        const patientFacility = mother.patientFacilityCode
          ? facilityMeta(mother.patientFacilityCode)
          : { code: '', name: 'No facility on patient', township: mother.patientTownship || 'Unknown', facilityType: 'other' };
        if (patientFacility.code && patientFacility.code !== creatorFacility.code) {
          rollupByCreator.creatorPatientMismatch += 1;
        }
        if (patientFacility.township && !PILOT_TOWNSHIPS.includes(patientFacility.township)) {
          rollupByCreator.patientOutsidePilot += 1;
        }
        if (PILOT_TOWNSHIPS.includes(patientFacility.township) || isPilotFacilityCode(patientFacility.code)) {
          addToRollup(rollupByPatient, labourCase, patientFacility.township
            ? patientFacility
            : { ...patientFacility, township: mother.patientTownship || 'Unknown' });
        }
      });
      done += group.length;
      if (done % 200 < groupSize || done === ids.length) {
        console.log(`  scanned ${done} / ${ids.length} mothers`);
      }
    }
  }
  const workers = Math.min(6, groups.length || 1);
  await Promise.all(Array.from({ length: workers }, () => worker()));
  return { byCreator: rollupByCreator, byPatient: rollupByPatient };
}

function mapToObject(map, labeler) {
  return [...map.entries()].map(([key, counter]) => ({
    key,
    ...(labeler ? labeler(key) : {}),
    ...counterToJson(counter),
  }));
}

function rollupToJson(rollup) {
  return {
    total: counterToJson(rollup.total),
    creatorPatientMismatch: rollup.creatorPatientMismatch,
    patientOutsidePilot: rollup.patientOutsidePilot,
    townships: mapToObject(rollup.byTownship),
    facilityTypes: mapToObject(rollup.byFacilityType),
    facilities: mapToObject(rollup.byFacility, (code) => {
      const facility = facilityMeta(code);
      return {
        facilityCode: facility.code,
        facilityName: facility.name,
        township: facility.township,
        facilityType: facility.facilityType,
      };
    }).sort((left, right) => String(left.township).localeCompare(String(right.township))
      || String(left.facilityCode).localeCompare(String(right.facilityCode))),
  };
}

function weakestSection(total) {
  const ratesBySection = total.rates.sectionsOfStarted || {};
  const ranked = SECTION_ORDER
    .filter((name) => ratesBySection[name] !== null && ratesBySection[name] !== undefined)
    .map((name) => ({ name, label: SECTION_LABELS[name], percent: ratesBySection[name] }))
    .sort((left, right) => left.percent - right.percent);
  return ranked;
}

function formatPct(value) {
  if (value === null || value === undefined) return 'n/a';
  return `${value}%`;
}

function buildNarrative(report) {
  const scan = report.scan.byCreatorFacility.total;
  const home = scan.places.find((row) => row.place === 'Home') || { deliveryNotes: 0, bothAmongNotes: 0 };
  const publicPlace = scan.places.find((row) => row.place === 'Public Health Facility') || { deliveryNotes: 0 };
  const cs = scan.modes.find((row) => row.mode === 'C-section') || { deliveryNotes: 0, bothAmongNotes: 0 };
  const vaginal = scan.modes.find((row) => row.mode === 'Normal vaginal') || { deliveryNotes: 0, bothAmongNotes: 0 };
  const rankedSections = weakestSection(scan);
  const weakest = rankedSections[0];
  const strongest = rankedSections[rankedSections.length - 1];
  const facilities = report.scan.byCreatorFacility.facilities
    .filter((row) => row.deliveryNotes > 0)
    .slice()
    .sort((left, right) => right.bothAmongNotes - left.bothAmongNotes);
  const top = facilities[0];
  const rankable = report.scan.byCreatorFacility.facilities
    .filter((row) => row.deliveryNotes >= 10)
    .slice()
    .sort((left, right) => (right.rates.lcgOfNotes || 0) - (left.rates.lcgOfNotes || 0));
  const dashboardTownships = report.dashboard.rows.filter((row) =>
    row.period === 'all' && row.geographyType === 'township'
  );
  const activeMonths = scan.months.filter((row) =>
    row.month >= '2026-01' && row.month <= report.extractedAt.slice(0, 7) && row.deliveryNotes >= 10
  );
  const lines = [
    {
      title: 'Say what LCG usage means',
      text: 'The dashboard LCG figure means both the active first-stage time and the second-stage time were saved on a completed Delivery Note. It does not mean the WHO chart was filled over time.',
    },
    {
      title: 'One number for the room',
      text: `Among ${scan.deliveryNotes} delivery notes entered by Pyinmana and Tatkon midwives, ${scan.bothAmongNotes} (${formatPct(scan.rates.lcgOfNotes)}) have both stage times. ${scan.notesWithoutStage} delivery notes have no labour stage time at all. Only ${scan.startedWithoutNotes} labours were started in LCG and still have no Delivery Note.`,
    },
  ];
  if (top) {
    const restNotes = scan.deliveryNotes - top.deliveryNotes;
    const restBoth = scan.bothAmongNotes - top.bothAmongNotes;
    lines.push({
      title: 'Most LCG timing is one hospital',
      text: `${top.facilityName} accounts for ${top.bothAmongNotes} of ${scan.bothAmongNotes} labours with both stage times (${formatPct(pct(top.bothAmongNotes, scan.bothAmongNotes))}), at ${formatPct(top.rates.lcgOfNotes)} of its own ${top.deliveryNotes} delivery notes. Everywhere else combined is ${restBoth} of ${restNotes} (${formatPct(pct(restBoth, restNotes))}).`,
    });
  }
  lines.push({
    title: 'This is not the township birth census',
    text: `${publicPlace.deliveryNotes} of ${scan.deliveryNotes} delivery notes are public-facility births. Home births are ${home.deliveryNotes}, of which ${home.bothAmongNotes} have both stage times. Home is too small to explain the LCG rate. Births that were never entered in the app are not in this percentage.`,
  });
  lines.push({
    title: 'C-section does not explain the gap',
    text: `Recorded mode is C-section for ${cs.deliveryNotes} notes (LCG ${formatPct(cs.lcgPercent)}) and normal vaginal for ${vaginal.deliveryNotes} (LCG ${formatPct(vaginal.lcgPercent)}). The high-volume hospital with low LCG has both modes. Low use is a workflow gap, not an elective-surgery effect.`,
  });
  lines.push({
    title: 'A start time is usually one column, not a serial chart',
    text: `Where any observation was saved, the median chart has ${scan.rates.medianTimepoints} timepoint (mean ${scan.rates.meanTimepoints}). ${formatPct(scan.rates.observationOfStarted)} of started labours have at least one WHO cell, but cervix is ${formatPct(scan.rates.cervixOfStarted)} and an assessment or plan is ${formatPct(scan.rates.sdmPlanOfStarted)}. Baseline fetal heart rate was saved on ${scan.baselineFhrMothers} of ${scan.firstStage} started labours (${formatPct(scan.rates.baselineFhrOfStarted)}).`,
  });
  if (weakest && strongest) {
    lines.push({
      title: 'Train the thin sections',
      text: `Among started labours, the section flag for ${strongest.label} is ${formatPct(strongest.percent)} because any related cell counts. A baseline fetal heart rate, which is the actual monitoring value, was saved on only ${formatPct(scan.rates.baselineFhrOfStarted)}. ${weakest.label} is the least filled section (${formatPct(weakest.percent)}). Companion was Yes at least once in ${scan.companionYes} of ${scan.companionRecorded} recorded labours (${formatPct(scan.rates.companionYesOfRecorded)}). Pain relief was Yes in ${scan.painYes} of ${scan.painRecorded} (${formatPct(scan.rates.painYesOfRecorded)}); No in ${scan.painNo}.`,
    });
  }
  if (activeMonths.length) {
    const monthText = activeMonths.map((row) =>
      `${row.month} ${row.bothAmongNotes}/${row.deliveryNotes} (${formatPct(row.lcgPercent)})`
    ).join('; ');
    lines.push({
      title: 'LCG timing starts in June 2026',
      text: `Months with at least 10 delivery notes: ${monthText}. October ${report.extractedAt.slice(0, 7)} is a partial month through ${report.extractedAt} and should not be read as a jump in performance. A few birth dates fall outside 2026 and look like typing errors.`,
    });
  }
  if (rankable.length) {
    const low = rankable[rankable.length - 1];
    lines.push({
      title: 'Do not rank facilities with tiny numbers',
      text: `Among facilities with at least 10 delivery notes, the spread runs from ${rankable[0].facilityName} at ${formatPct(rankable[0].rates.lcgOfNotes)} (${rankable[0].bothAmongNotes}/${rankable[0].deliveryNotes}) to ${low.facilityName} at ${formatPct(low.rates.lcgOfNotes)} (${low.bothAmongNotes}/${low.deliveryNotes}). Smaller sites are listed in the workbook but should not be ranked in the meeting.`,
    });
  }
  lines.push({
    title: 'Do not call supportive-care gaps clinical alerts',
    text: `${scan.clinicalAlertMothers} labours with observations have a clinical value in the WHO alert range (late deceleration: ${scan.lateDecelMothers}; fetal heart readings under 110 or over 160: ${scan.fhrOutOfRange} of ${scan.fhrReadings}). ${scan.supportiveGapMothers} have a supportive-care gap such as pain relief or oral fluids marked No. The app does not store an alert log.`,
  });
  if (dashboardTownships.length) {
    const bits = dashboardTownships.map((row) =>
      `${row.geographyId} ${row.lcgUsed}/${row.completedNotes} (${formatPct(row.lcgPercent)}; uterotonic ${formatPct(row.uterotonicPercent)})`
    );
    const scanBits = report.scan.byCreatorFacility.townships.map((row) =>
      `${row.key} ${row.bothAmongNotes}/${row.deliveryNotes}`
    );
    lines.push({
      title: 'Dashboard and this extract agree',
      text: `All-time dashboard, by the township on the patient: ${bits.join('; ')}. Midwife-creator cohort: ${scanBits.join('; ')}. Uterotonic on the delivery note is high. Oxytocin written on the LCG medication row is not: ${scan.oxytocinOnLcg} of ${scan.firstStage} started labours.`,
    });
  }
  const providerBits = Object.entries(scan.providers || {})
    .sort((left, right) => right[1] - left[1])
    .map(([label, count]) => `${label} ${count}`)
    .join('; ');
  if (providerBits) {
    lines.push({
      title: 'Do not quote the skilled-attendant dashboard line yet',
      text: `Birth-attendant labels on these delivery notes: ${providerBits}. The dashboard counts skilled only for the exact labels skilled birth attendant and AMW. Other labels are excluded, so a very low skilled-birth percentage is a coding gap, not evidence that births were unattended.`,
    });
  }
  lines.push({
    title: 'What to improve after the meeting',
    text: 'Ask Tatkon Township Hospital and Pyinmana General Hospital why stage times are missing, using Shwe Myo as the working example for timing. Then ask every site, including Shwe Myo, to record more than one time column, cervix, and the shared plan. Make LCG usable offline. Show institutional LCG separately from a single pooled percentage. Add cervix or timepoint count beside the timing indicator. Put that pair on the monthly report. Do not use LCG percentage as a penalty score while it is still a timing proxy and the app is online-only.',
  });
  return lines;
}

function styleHeader(cell) {
  cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } };
  cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
}

function styleBody(cell, align) {
  cell.alignment = { vertical: 'middle', horizontal: align || 'center', wrapText: true };
  cell.border = {
    top: { style: 'thin', color: { argb: 'FFD9E2F3' } },
    left: { style: 'thin', color: { argb: 'FFD9E2F3' } },
    bottom: { style: 'thin', color: { argb: 'FFD9E2F3' } },
    right: { style: 'thin', color: { argb: 'FFD9E2F3' } },
  };
}

function addSheet(workbook, name, headers, rows, options) {
  const sheet = workbook.addWorksheet(name);
  const aligns = (options && options.aligns) || [];
  headers.forEach((header, index) => {
    const cell = sheet.getCell(1, index + 1);
    cell.value = header;
    styleHeader(cell);
    sheet.getColumn(index + 1).width = (options && options.widths && options.widths[index]) || 18;
  });
  sheet.getRow(1).height = 32;
  rows.forEach((row, rowIndex) => {
    row.forEach((value, index) => {
      const cell = sheet.getCell(rowIndex + 2, index + 1);
      cell.value = value === null || value === undefined ? '' : value;
      styleBody(cell, aligns[index] || (index === 0 ? 'left' : 'center'));
    });
  });
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: headers.length },
  };
  return sheet;
}

function displayPct(value) {
  return value === null || value === undefined ? '' : value;
}

async function writeWorkbook(filePath, report) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'MNCH LCG extract';
  const scan = report.scan.byCreatorFacility;
  const total = scan.total;
  const readme = workbook.addWorksheet('How to read');
  const notes = [
    `LCG pilot insights. Database: ${report.projectId}. Extract date: ${report.extractedAt}.`,
    'No patient names or record identifiers are in this workbook.',
    'Dashboard sheets use analytics_v32. LCG usage there means both labour stage times exist on a completed Delivery Note. The denominator includes home births. Geography is the facility code and township stored on the patient.',
    'Quality sheets use mothers created by Midwife accounts at Pyinmana and Tatkon facilities (codes 006-043), excluding baby records. This matches the September 2026 facility application cohort rule.',
    'Both-stage timing in the quality sheets ignores blank and the literal text null. The dashboard counts any non-empty value. The two definitions are shown side by side when they differ.',
    'WHO section rates are among labours with a first-stage time, unless a column says otherwise. Cervix and descent also count a saved plot chart.',
    'Alert-range counts are calculated from stored observation values. The app does not keep a log of on-screen alerts.',
    'LCG entry is online-only in the current pilot. A missing chart can mean the network failed, not that paper LCG was skipped.',
    `Creator facility and patient facility differ for ${scan.creatorPatientMismatch} mothers. ${scan.patientOutsidePilot} mothers have a patient township outside Pyinmana and Tatkon.`,
  ];
  notes.forEach((note, index) => {
    readme.mergeCells(index + 1, 1, index + 1, 6);
    readme.getCell(index + 1, 1).value = note;
    readme.getCell(index + 1, 1).alignment = { wrapText: true, vertical: 'middle' };
    readme.getRow(index + 1).height = 32;
  });
  readme.getColumn(1).width = 120;
  report.narrative.forEach((item, index) => {
    const row = notes.length + 2 + index;
    readme.getCell(row, 1).value = `${index + 1}. ${item.title}: ${item.text}`;
    readme.getCell(row, 1).alignment = { wrapText: true, vertical: 'middle' };
    readme.getRow(row).height = 48;
  });

  const dashboardRows = report.dashboard.rows
    .filter((row) => row.geographyType === 'township' || row.geographyType === 'national')
    .sort((left, right) => String(left.period).localeCompare(String(right.period))
      || String(left.geographyType).localeCompare(String(right.geographyType))
      || String(left.geographyId).localeCompare(String(right.geographyId)));
  addSheet(workbook, 'Dashboard LCG', [
    'Period', 'Geography', 'Name', 'Delivery notes', 'LCG both stages', 'LCG %',
    'Uterotonic', 'Uterotonic %', 'Skilled home', 'Skilled institutional',
    'Home', 'Public facility', 'Private facility', 'Other or unknown place',
  ], dashboardRows.map((row) => [
    row.period,
    row.geographyType,
    row.geographyType === 'township' ? row.geographyId : 'All facilities in database',
    row.completedNotes,
    row.lcgUsed,
    displayPct(row.lcgPercent),
    row.uterotonic,
    displayPct(row.uterotonicPercent),
    row.homeSkilled,
    row.institutionalSkilled,
    row.places.Home,
    row.places['Public Health Facility'],
    row.places['Private Facility'],
    row.places['Other/Unknown'],
  ]), { widths: [14, 14, 32, 16, 18, 12, 14, 14, 14, 20, 12, 16, 16, 22] });

  const facilityDashboard = report.dashboard.rows
    .filter((row) => row.period === 'all' && row.geographyType === 'facility');
  const facilityByCode = new Map(facilityDashboard.map((row) => [row.facilityCode || row.geographyId, row]));
  addSheet(workbook, 'Dashboard by facility', [
    'Township', 'Code', 'Facility', 'Type', 'Delivery notes', 'LCG both stages', 'LCG %',
    'Uterotonic %', 'Home', 'Public facility', 'Private facility',
  ], FacilityConfig.getFacilities().filter((facility) => PILOT_TOWNSHIPS.includes(facility.township)).map((facility) => {
    const row = facilityByCode.get(facility.code);
    const slice = row || {
      completedNotes: 0, lcgUsed: 0, lcgPercent: null, uterotonicPercent: null,
      places: { Home: 0, 'Public Health Facility': 0, 'Private Facility': 0 },
    };
    return [
      facility.township,
      facility.code,
      facility.name_en,
      facility.facilityType || '',
      slice.completedNotes,
      slice.lcgUsed,
      displayPct(slice.lcgPercent),
      displayPct(slice.uterotonicPercent),
      slice.places.Home,
      slice.places['Public Health Facility'],
      slice.places['Private Facility'],
    ];
  }), { widths: [14, 10, 42, 28, 16, 18, 12, 14, 12, 16, 16] });

  const funnelRows = [['Pilot total', total]];
  scan.townships.forEach((row) => funnelRows.push([row.key, row]));
  addSheet(workbook, 'LCG funnel', [
    'Group', 'Mothers', 'Delivery notes', 'First stage among notes', 'Both stages among notes',
    'LCG % of notes', 'Notes with no stage time', 'Started LCG, no delivery note',
    'Any observation among started %', 'Cervix among started %', 'Assessment or plan among started %',
  ], funnelRows.map(([label, row]) => [
    label,
    row.mothers,
    row.deliveryNotes,
    row.firstAmongNotes,
    row.bothAmongNotes,
    displayPct(row.rates.lcgOfNotes),
    row.notesWithoutStage,
    row.startedWithoutNotes,
    displayPct(row.rates.observationOfStarted),
    displayPct(row.rates.cervixOfStarted),
    displayPct(row.rates.sdmPlanOfStarted),
  ]), { widths: [16, 12, 16, 24, 24, 16, 24, 28, 30, 24, 34] });

  addSheet(workbook, 'Place and mode', [
    'Kind', 'Group', 'Delivery notes', 'Both stage times', 'LCG %',
  ], [
    ...total.places.map((row) => ['Birthplace', row.place, row.deliveryNotes, row.bothAmongNotes, displayPct(row.lcgPercent)]),
    ...total.modes.map((row) => ['Mode', row.mode, row.deliveryNotes, row.bothAmongNotes, displayPct(row.lcgPercent)]),
    ['Derived', 'Facility births (public + private)', total.rates.facilityBirths, total.rates.facilityBoth, displayPct(total.rates.facilityLcg)],
    ['Derived', 'Home births', (total.places.find((row) => row.place === 'Home') || {}).deliveryNotes || 0,
      (total.places.find((row) => row.place === 'Home') || {}).bothAmongNotes || 0, displayPct(total.rates.homeLcg)],
  ], { widths: [14, 42, 16, 18, 12] });

  addSheet(workbook, 'WHO sections', [
    'Section', 'Started labours with section', 'Percent of started', 'Both-stage labours with section', 'Percent of both-stage',
  ], SECTION_ORDER.map((name) => [
    SECTION_LABELS[name],
    total.sectionsAmongStarted[name],
    displayPct(total.rates.sectionsOfStarted[name]),
    total.sectionsAmongBoth[name],
    displayPct(total.rates.sectionsOfBoth[name]),
  ]), { widths: [28, 30, 20, 32, 24] });

  addSheet(workbook, 'Supportive care', [
    'Item', 'Labours with a value', 'At least one Yes or mobile', 'Percent of recorded',
  ], [
    ['Companion', total.companionRecorded, total.companionYes, displayPct(total.rates.companionYesOfRecorded)],
    ['Pain relief', total.painRecorded, total.painYes, displayPct(total.rates.painYesOfRecorded)],
    ['Oral fluids', total.oralRecorded, total.oralYes, displayPct(total.rates.oralYesOfRecorded)],
    ['Mobility (mobile, not supine)', total.mobilityRecorded, total.mobilityMobile, displayPct(total.rates.mobilityOfRecorded)],
    ['Oxytocin text on the LCG', total.firstStage, total.oxytocinOnLcg, displayPct(pct(total.oxytocinOnLcg, total.firstStage))],
  ], { widths: [36, 24, 32, 22] });

  addSheet(workbook, 'Observation signals', [
    'Signal', 'Numerator', 'Denominator', 'Percent', 'How to read it',
  ], [
    ['Labours with a clinical value in the WHO alert range', total.clinicalAlertMothers, total.timepointMothers, displayPct(total.rates.clinicalAlertOfObserved), 'FHR, vitals, liquor, or contractions. Not an alert-log count.'],
    ['Labours with a supportive-care gap', total.supportiveGapMothers, total.timepointMothers, displayPct(total.rates.supportiveGapOfObserved), 'Companion, pain relief, or oral fluids marked No, or posture supine. This is not a danger-sign count.'],
    ['Baseline FHR saved on a started labour', total.baselineFhrMothers, total.firstStage, displayPct(total.rates.baselineFhrOfStarted), 'At least one numeric or text baseline FHR. Deceleration alone does not count.'],
    ['FHR readings under 110 or over 160', total.fhrOutOfRange, total.fhrReadings, displayPct(total.rates.fhrOutOfRangeOfReadings), 'Reading-level, not woman-level.'],
    ['Labours with a late deceleration', total.lateDecelMothers, total.firstStage, displayPct(total.rates.lateDecelOfStarted), 'Any stored FHR deceleration marked L.'],
    ['Median timepoints on a chart with data', total.rates.medianTimepoints, total.timepointMothers, '', 'Median count of distinct times with any cell.'],
    ['Mean timepoints on a chart with data', total.rates.meanTimepoints, total.timepointMothers, '', 'Mean count of distinct times with any cell.'],
    ['Non-numeric vital cells', total.nonNumericVitals, total.numericVitals + total.nonNumericVitals, displayPct(pct(total.nonNumericVitals, total.numericVitals + total.nonNumericVitals)), 'Older classic entries sometimes stored vital bands instead of numbers.'],
  ], { widths: [46, 16, 16, 12, 70], aligns: ['left', 'center', 'center', 'center', 'left'] });

  addSheet(workbook, 'Monthly quality', [
    'Month', 'Delivery notes with a birth month', 'Both stage times', 'LCG %', 'First stage among those notes',
  ], total.months.map((row) => [
    row.month, row.deliveryNotes, row.bothAmongNotes, displayPct(row.lcgPercent), row.firstAmongNotes,
  ]), { widths: [16, 34, 18, 12, 30] });

  addSheet(workbook, 'Facility quality', [
    'Township', 'Code', 'Facility', 'Type', 'Mothers', 'Delivery notes', 'Both stages', 'LCG %',
    'Rankable (10+ notes)', 'Facility births', 'Facility LCG %', 'Home births', 'Home LCG %',
    'Started LCG', 'Observation % of started', 'Cervix % of started', 'Plan % of started', 'Median timepoints',
  ], scan.facilities.map((row) => {
    const home = row.places.find((item) => item.place === 'Home') || { deliveryNotes: 0, lcgPercent: null };
    return [
      row.township,
      row.facilityCode,
      row.facilityName,
      row.facilityType,
      row.mothers,
      row.deliveryNotes,
      row.bothAmongNotes,
      displayPct(row.rates.lcgOfNotes),
      row.deliveryNotes >= 10 ? 'Yes' : 'No',
      row.rates.facilityBirths,
      displayPct(row.rates.facilityLcg),
      home.deliveryNotes,
      displayPct(home.lcgPercent),
      row.firstStage,
      displayPct(row.rates.observationOfStarted),
      displayPct(row.rates.cervixOfStarted),
      displayPct(row.rates.sdmPlanOfStarted),
      row.rates.medianTimepoints === null ? '' : row.rates.medianTimepoints,
    ];
  }), {
    widths: [14, 10, 42, 24, 12, 16, 14, 12, 18, 16, 16, 14, 14, 14, 22, 18, 18, 18],
  });

  addSheet(workbook, 'Recommendations', [
    'Point', 'What to say',
  ], report.narrative.map((item, index) => [index + 1, `${item.title}. ${item.text}`]), {
    widths: [10, 140],
    aligns: ['center', 'left'],
  });

  await workbook.xlsx.writeFile(filePath);
}

function stripForJson(rollupJson) {
  const clone = JSON.parse(JSON.stringify(rollupJson));
  const dropHist = (counter) => {
    if (counter && counter.timepointHist) delete counter.timepointHist;
  };
  dropHist(clone.total);
  clone.townships.forEach(dropHist);
  clone.facilityTypes.forEach(dropHist);
  clone.facilities.forEach(dropHist);
  return clone;
}

async function main() {
  const extractedAt = todayIso();
  const workbookPath = path.resolve(process.argv[2] || path.join(ROOT, 'docs', `LCG pilot insights - ${extractedAt}.xlsx`));
  const jsonPath = process.argv[3]
    ? path.resolve(process.argv[3])
    : path.join(ROOT, 'docs', `lcg-pilot-insights-${extractedAt}.json`);
  fs.mkdirSync(path.dirname(workbookPath), { recursive: true });
  console.log(`Target project: ${PROJECT_ID}`);
  const { db, cleanup } = await initializeFirestore();
  try {
    const dashboard = await loadDashboard(db);
    const loaded = await loadMothers(db);
    const scanned = await scanMothers(db, loaded.mothers);
    const report = {
      extractedAt,
      projectId: PROJECT_ID,
      cohort: 'Mothers created by Midwife users at Pyinmana and Tatkon facility codes 006-043. Baby records excluded.',
      dashboardDefinition: 'analytics_v32 delivery.lcgUsed / delivery.completedNotes. Both stage times on a completed Delivery Note. Patient facility and township.',
      midwives: loaded.midwives,
      mothers: loaded.mothers.size,
      dashboard,
      scan: {
        byCreatorFacility: stripForJson(rollupToJson(scanned.byCreator)),
        byPatientFacility: stripForJson(rollupToJson(scanned.byPatient)),
      },
    };
    report.narrative = buildNarrative(report);
    fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
    await writeWorkbook(workbookPath, report);
    const total = report.scan.byCreatorFacility.total;
    console.log(`Wrote ${workbookPath}`);
    console.log(`Wrote ${jsonPath}`);
    console.log(`Mothers ${total.mothers}; delivery notes ${total.deliveryNotes}; both stages ${total.bothAmongNotes} (${total.rates.lcgOfNotes}%)`);
    console.log(`Facility LCG ${total.rates.facilityLcg}% of ${total.rates.facilityBirths}; home LCG ${total.rates.homeLcg}%`);
  } finally {
    cleanup();
  }
}

module.exports = {
  analyzeSummary,
  stageTimes,
  buildCase,
  normalizeBirthPlace,
  normalizeDeliveryMode,
  isAlertValue,
  pct,
  addCase,
  emptyCounter,
  rates,
  medianFromHist,
  choicePatientClass,
};

if (require.main === module) {
  main().catch((error) => {
    console.error(error && error.stack ? error.stack : error);
    process.exit(1);
  });
}
