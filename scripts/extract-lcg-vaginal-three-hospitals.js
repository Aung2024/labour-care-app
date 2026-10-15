#!/usr/bin/env node
'use strict';

/**
 * LCG fill-up for normal vaginal births at three hospitals.
 * Caesarean, assisted, and unknown modes are counted only so they can be
 * excluded. No patient names are written.
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
const HOSPITALS = ['024', '007', '023'];
const SHORT_NAME = {
  '024': 'Shwe Myo Hospital',
  '007': 'Pyinmana General Hospital',
  '023': 'Tatkon Township Hospital',
};
const RECORD_DOCS = [
  ['records', 'summary'],
  ['records', 'startingTime'],
  ['records', 'secondStage'],
  ['records', 'deliveryNotes'],
  ['plotData', 'cervix'],
  ['plotData', 'descent'],
];

const FILL_ITEMS = [
  ['Supportive care', 'Companion', 'Companion'],
  ['Supportive care', 'Pain relief', 'Pain_Relief'],
  ['Supportive care', 'Oral fluids', 'Oral_fluids'],
  ['Supportive care', 'Posture', 'Mobility'],
  ['Fetal heart rate', 'Baseline fetal heart rate', 'Baseline_FHR'],
  ['Fetal heart rate', 'Deceleration', 'FHR_deceleration'],
  ['Baby', 'Amniotic fluid', 'Amniotic_fluid'],
  ['Baby', 'Fetal position', 'Fetal_position'],
  ['Baby', 'Caput', 'Caput'],
  ['Baby', 'Moulding', 'Moulding'],
  ['Woman', 'Pulse', 'Pulse'],
  ['Woman', 'Systolic blood pressure', 'Systolic_BP'],
  ['Woman', 'Diastolic blood pressure', 'Diastolic_BP'],
  ['Woman', 'Temperature', 'Temperature_C'],
  ['Woman', 'Urine', 'Urine'],
  ['Contractions', 'Contractions per 10 min', 'Contractions_per_10_min'],
  ['Contractions', 'Duration', 'Duration_of_contractions'],
  ['Medication', 'Oxytocin', 'Medication_Oxytocin'],
  ['Medication', 'Medicine', 'Medication_Medicine'],
  ['Medication', 'IV fluids', 'Medication_IV_Fluids'],
];

const PLAN_FIELDS = [
  'ASSESSMENT_Womans_condition',
  'ASSESSMENT_Babys_condition',
  'ASSESSMENT_Labour_progress',
  'ASSESSMENT_Other_concerns',
  'PLAN',
];

function pct(numerator, denominator) {
  if (!denominator) return null;
  return Math.round((numerator / denominator) * 1000) / 10;
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

function strictTime(value) {
  if (value === null || value === undefined || value === false) return false;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'string') return true;
  const text = value.trim();
  return text !== '' && text !== 'null' && text !== 'undefined';
}

function fieldHasValue(summary, field) {
  return Object.keys(summary || {}).some((key) => {
    if (key !== field && !key.startsWith(`${field}_`)) return false;
    return meaningful(summary[key]);
  });
}

function prefixHasValue(summary, prefix) {
  return Object.keys(summary || {}).some((key) => key.startsWith(prefix) && meaningful(summary[key]));
}

function hasPlot(data) {
  if (!data || typeof data !== 'object') return false;
  if (Array.isArray(data.data)) return data.data.length > 0;
  if (Array.isArray(data.points)) return data.points.length > 0;
  return false;
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

function stageFlags(summary, starting, second) {
  const firstValues = [
    summary && summary.startingTime,
    summary && summary.activeFirstStage_Time,
    starting && starting.startingTime,
  ];
  const secondValues = [
    summary && summary.secondStageTime,
    summary && summary.secondStage_Time,
    second && second.secondStageStartTime,
    second && second.secondStageTime,
  ];
  const firstStage = firstValues.some(strictTime);
  const secondStage = secondValues.some(strictTime);
  return { firstStage, secondStage, bothStages: firstStage && secondStage };
}

function analyzeChart(docs) {
  const summary = docs.summary || {};
  const filled = {};
  FILL_ITEMS.forEach(([, , field]) => {
    filled[field] = fieldHasValue(summary, field);
  });
  const cervix = prefixHasValue(summary, 'Cervix_Plot_') || hasPlot(docs.cervix);
  const descent = prefixHasValue(summary, 'Descent_Plot_') || hasPlot(docs.descent);
  const assessmentPlan = PLAN_FIELDS.some((field) => fieldHasValue(summary, field));
  const times = new Set();
  Object.keys(summary).forEach((key) => {
    if (!meaningful(summary[key])) return;
    const match = key.match(/_(\d{1,2})_(\d{2})(?:_|$)/);
    if (!match) return;
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    if (hour <= 23 && minute <= 59) {
      times.add(`${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`);
    }
  });
  return { filled, cervix, descent, assessmentPlan, timepoints: times.size, anyCell: times.size > 0 || cervix || descent || assessmentPlan || Object.values(filled).some(Boolean) };
}

function emptyBucket() {
  return {
    notes: 0,
    firstStage: 0,
    bothStages: 0,
    anyObservation: 0,
    cervix: 0,
    descent: 0,
    assessmentPlan: 0,
    timepointSum: 0,
    timepointMothers: 0,
    filled: Object.fromEntries(FILL_ITEMS.map(([, , field]) => [field, 0])),
    modes: {},
  };
}

function addVaginal(bucket, chart, stages) {
  bucket.notes += 1;
  if (stages.firstStage) bucket.firstStage += 1;
  if (stages.bothStages) bucket.bothStages += 1;
  if (!stages.firstStage) return;
  if (chart.anyCell) bucket.anyObservation += 1;
  if (chart.cervix) bucket.cervix += 1;
  if (chart.descent) bucket.descent += 1;
  if (chart.assessmentPlan) bucket.assessmentPlan += 1;
  FILL_ITEMS.forEach(([, , field]) => {
    if (chart.filled[field]) bucket.filled[field] += 1;
  });
  if (chart.anyCell) {
    bucket.timepointSum += chart.timepoints;
    bucket.timepointMothers += 1;
  }
}

function createTemporaryAdcFile() {
  const account = firebaseAuth.getGlobalDefaultAccount();
  const refreshToken = account && account.tokens && account.tokens.refresh_token;
  if (!refreshToken) throw new Error('No Firebase CLI login found. Run `firebase login` and retry.');
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mnch-lcg-vaginal-'));
  const credentialPath = path.join(tempDir, 'application-default-credentials.json');
  fs.writeFileSync(credentialPath, JSON.stringify({
    type: 'authorized_user',
    client_id: firebaseApi.clientId(),
    client_secret: firebaseApi.clientSecret(),
    refresh_token: refreshToken,
    quota_project_id: PROJECT_ID,
  }), { encoding: 'utf8', mode: 0o600 });
  return { path: credentialPath, cleanup() { fs.rmSync(tempDir, { recursive: true, force: true }); } };
}

async function initializeFirestore() {
  const temporaryAdc = createTemporaryAdcFile();
  process.env.GOOGLE_APPLICATION_CREDENTIALS = temporaryAdc.path;
  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: PROJECT_ID });
  }
  const db = admin.firestore();
  db.settings({ ignoreUndefinedProperties: true });
  return { db, cleanup: temporaryAdc.cleanup };
}

function normalizeRole(role) {
  return String(role || '').trim().toLowerCase();
}

async function loadMothers(db) {
  const usersSnapshot = await db.collection('users').get();
  const midwives = new Map();
  usersSnapshot.docs.forEach((doc) => {
    const user = doc.data() || {};
    if (normalizeRole(user.role) !== 'midwife') return;
    const code = String(user.facility_code || user.facilityCode || '').trim();
    if (!HOSPITALS.includes(code)) return;
    midwives.set(doc.id, code);
  });
  const patientsSnapshot = await db.collection('patients').get();
  const mothers = new Map();
  patientsSnapshot.docs.forEach((doc) => {
    const data = doc.data() || {};
    const creatorId = String(data.created_by || data.createdBy || '').trim();
    if (!midwives.has(creatorId)) return;
    const patientType = String(data.patient_type || data.patientType || 'mother').trim().toLowerCase();
    if (patientType === 'baby') return;
    mothers.set(doc.id, midwives.get(creatorId));
  });
  return mothers;
}

async function scan(db, mothers) {
  const byHospital = new Map(HOSPITALS.map((code) => [code, emptyBucket()]));
  const combined = emptyBucket();
  const ids = [...mothers.keys()];
  const groupSize = 10;
  for (let index = 0; index < ids.length; index += groupSize) {
    const group = ids.slice(index, index + groupSize);
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
    snaps.forEach((snap, snapIndex) => {
      const item = meta[snapIndex];
      if (!byId.has(item.id)) byId.set(item.id, {});
      if (snap.exists) byId.get(item.id)[item.docId] = snap.data() || {};
    });
    group.forEach((id) => {
      const docs = byId.get(id) || {};
      if (!docs.deliveryNotes) return;
      const details = docs.deliveryNotes.deliveryDetails || docs.deliveryNotes.labourDetails || {};
      const mode = normalizeDeliveryMode(details.modeOfDelivery || details.mode_of_delivery || docs.deliveryNotes.modeOfDelivery);
      const code = mothers.get(id);
      const hospital = byHospital.get(code);
      hospital.modes[mode] = (hospital.modes[mode] || 0) + 1;
      combined.modes[mode] = (combined.modes[mode] || 0) + 1;
      if (mode !== 'Normal vaginal') return;
      const stages = stageFlags(docs.summary, docs.startingTime, docs.secondStage);
      const chart = analyzeChart(docs);
      addVaginal(hospital, chart, stages);
      addVaginal(combined, chart, stages);
    });
    if ((index + group.length) % 200 < groupSize || index + group.length === ids.length) {
      console.log(`  scanned ${Math.min(index + group.length, ids.length)} / ${ids.length} mothers`);
    }
  }
  return { byHospital, combined };
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

function addSheet(workbook, name, headers, rows, widths) {
  const sheet = workbook.addWorksheet(name);
  headers.forEach((header, index) => {
    const cell = sheet.getCell(1, index + 1);
    cell.value = header;
    styleHeader(cell);
    sheet.getColumn(index + 1).width = (widths && widths[index]) || 18;
  });
  sheet.getRow(1).height = 32;
  rows.forEach((row, rowIndex) => {
    row.forEach((value, index) => {
      const cell = sheet.getCell(rowIndex + 2, index + 1);
      cell.value = value === null || value === undefined ? '' : value;
      styleBody(cell, index <= 1 ? 'left' : 'center');
    });
  });
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  return sheet;
}

function show(value) {
  return value === null || value === undefined ? '' : value;
}

function hospitalRows(result) {
  return HOSPITALS.map((code) => {
    const bucket = result.byHospital.get(code);
    const facility = FacilityConfig.getFacilityByCode(code);
    return {
      code,
      name: SHORT_NAME[code],
      officialName: facility ? facility.name_en : code,
      ...bucket,
      rates: {
        bothOfNotes: pct(bucket.bothStages, bucket.notes),
        firstOfNotes: pct(bucket.firstStage, bucket.notes),
        bothOfStarted: pct(bucket.bothStages, bucket.firstStage),
        cervixOfStarted: pct(bucket.cervix, bucket.firstStage),
        descentOfStarted: pct(bucket.descent, bucket.firstStage),
        planOfStarted: pct(bucket.assessmentPlan, bucket.firstStage),
        meanTimepoints: bucket.timepointMothers
          ? Math.round((bucket.timepointSum / bucket.timepointMothers) * 10) / 10
          : null,
        filledOfStarted: Object.fromEntries(FILL_ITEMS.map(([, , field]) => [
          field,
          pct(bucket.filled[field], bucket.firstStage),
        ])),
      },
    };
  });
}

async function writeWorkbook(filePath, payload) {
  const workbook = new ExcelJS.Workbook();
  const readme = workbook.addWorksheet('How to read');
  const lines = [
    'Normal vaginal births only. Caesarean and assisted vaginal births are excluded from every rate.',
    'Hospitals: Shwe Myo Station Hospital (024), Pyinmana General Hospital (007), Tatkon Township Hospital (023).',
    'Database mnch-1cbda. Extract 15 October 2026. Mothers created by Midwife accounts at these hospitals. No patient names.',
    'LCG timing = both the active first-stage time and the second-stage time on a normal vaginal Delivery Note.',
    'Fill-up rate = the item was entered at least once, among normal vaginal labours that already have a first-stage time. A blank guide that was never opened is not in that denominator.',
    'Cervix is any cervix plot mark, including a saved plot chart. Descent is any descent mark. Assessment and plan is any assessment note or plan text.',
    'Posture is the WHO mobility item: mobile or supine.',
  ];
  lines.forEach((text, index) => {
    readme.getCell(index + 1, 1).value = text;
    readme.getCell(index + 1, 1).alignment = { wrapText: true, vertical: 'middle' };
    readme.getRow(index + 1).height = 28;
  });
  readme.getColumn(1).width = 130;

  addSheet(workbook, 'Vaginal timing', [
    'Hospital', 'All delivery notes', 'Caesarean notes set aside', 'Assisted notes set aside',
    'Normal vaginal notes', 'First stage saved', 'Both stage times', 'Timing % of vaginal notes',
    'Started guides', 'Both stages % of started guides',
  ], payload.hospitals.map((row) => [
    row.name,
    Object.values(row.modes).reduce((sum, value) => sum + value, 0),
    (row.modes['C-section'] || 0) + (row.modes['Emergency C-section'] || 0) + (row.modes['Elective C-section'] || 0),
    row.modes['Assisted vaginal'] || 0,
    row.notes,
    row.firstStage,
    row.bothStages,
    show(row.rates.bothOfNotes),
    row.firstStage,
    show(row.rates.bothOfStarted),
  ]).concat([[
    'Three hospitals',
    payload.hospitals.reduce((sum, row) => sum + Object.values(row.modes).reduce((inner, value) => inner + value, 0), 0),
    payload.hospitals.reduce((sum, row) => sum + (row.modes['C-section'] || 0) + (row.modes['Emergency C-section'] || 0) + (row.modes['Elective C-section'] || 0), 0),
    payload.hospitals.reduce((sum, row) => sum + (row.modes['Assisted vaginal'] || 0), 0),
    payload.combined.notes,
    payload.combined.firstStage,
    payload.combined.bothStages,
    show(pct(payload.combined.bothStages, payload.combined.notes)),
    payload.combined.firstStage,
    show(pct(payload.combined.bothStages, payload.combined.firstStage)),
  ]]), [28, 18, 26, 24, 22, 18, 18, 26, 16, 30]);

  const fillRows = [];
  FILL_ITEMS.forEach(([group, label, field]) => {
    fillRows.push([
      group,
      label,
      ...payload.hospitals.flatMap((row) => [
        row.filled[field],
        row.firstStage,
        show(row.rates.filledOfStarted[field]),
      ]),
      payload.combined.filled[field],
      payload.combined.firstStage,
      show(pct(payload.combined.filled[field], payload.combined.firstStage)),
    ]);
  });
  const singleItems = [
    ['Cervix and descent', 'Cervix plot', 'cervix'],
    ['Cervix and descent', 'Descent plot', 'descent'],
    ['Assessment and plan', 'Assessment or plan', 'assessmentPlan'],
  ];
  singleItems.forEach(([group, label, key]) => {
    fillRows.push([
      group,
      label,
      ...payload.hospitals.flatMap((row) => [
        row[key],
        row.firstStage,
        show(pct(row[key], row.firstStage)),
      ]),
      payload.combined[key],
      payload.combined.firstStage,
      show(pct(payload.combined[key], payload.combined.firstStage)),
    ]);
  });
  addSheet(workbook, 'Fill-up by item', [
    'Section', 'Item',
    'Shwe Myo filled', 'Shwe Myo started', 'Shwe Myo %',
    'Pyinmana filled', 'Pyinmana started', 'Pyinmana %',
    'Tatkon Township filled', 'Tatkon Township started', 'Tatkon Township %',
    'Three hospitals filled', 'Three hospitals started', 'Three hospitals %',
  ], fillRows, [22, 28, 16, 16, 14, 16, 16, 14, 22, 22, 18, 22, 24, 18]);

  await workbook.xlsx.writeFile(filePath);
}

async function main() {
  const extractedAt = '2026-10-15';
  const workbookPath = path.join(ROOT, 'docs', `LCG three hospitals - normal vaginal - ${extractedAt}.xlsx`);
  const jsonPath = path.join(ROOT, 'docs', `lcg-three-hospitals-vaginal-${extractedAt}.json`);
  const { db, cleanup } = await initializeFirestore();
  try {
    console.log('Loading the three hospital midwives and mothers...');
    const mothers = await loadMothers(db);
    console.log(`Mothers: ${mothers.size}`);
    const result = await scan(db, mothers);
    const hospitals = hospitalRows(result);
    const payload = {
      extractedAt,
      projectId: PROJECT_ID,
      definition: 'Normal vaginal Delivery Notes only. Fill-up is among those with a first-stage time.',
      hospitals,
      combined: {
        ...result.combined,
        rates: {
          bothOfNotes: pct(result.combined.bothStages, result.combined.notes),
          firstOfNotes: pct(result.combined.firstStage, result.combined.notes),
        },
      },
    };
    fs.writeFileSync(jsonPath, JSON.stringify(payload, null, 2));
    await writeWorkbook(workbookPath, payload);
    console.log(`Wrote ${workbookPath}`);
    hospitals.forEach((row) => {
      console.log(`${row.name}: vaginal ${row.bothStages}/${row.notes} both stages; started ${row.firstStage}; modes ${JSON.stringify(row.modes)}`);
    });
    console.log(`Combined vaginal ${result.combined.bothStages}/${result.combined.notes}; started ${result.combined.firstStage}`);
  } finally {
    cleanup();
  }
}

module.exports = {
  fieldHasValue,
  normalizeDeliveryMode,
  stageFlags,
  analyzeChart,
  pct,
};

if (require.main === module) {
  main().catch((error) => {
    console.error(error && error.stack ? error.stack : error);
    process.exit(1);
  });
}
