#!/usr/bin/env node
'use strict';

/**
 * One-time all-time facility export for the Ministry application-data workbook.
 *
 * Scope:
 * - patients created by users whose role is Midwife (case-insensitive)
 * - metrics grouped by the creating midwife's facility_code
 * - Total Registered counts mothers and babies
 * - ANC / PNC / deliveries stay mother-centric; linked baby NBC records are
 *   used only when the mother is not in the midwife set, to avoid double-count
 *
 * Authentication uses the existing Firebase CLI login. No service-account key
 * is read or written.
 */

const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { createRequire } = require('node:module');
const ExcelJS = require('exceljs');

const ROOT = path.resolve(__dirname, '..');
const FUNCTIONS_REQUIRE = createRequire(path.join(ROOT, 'functions', 'package.json'));
const admin = FUNCTIONS_REQUIRE('firebase-admin');
const firebaseAuth = FUNCTIONS_REQUIRE('firebase-tools/lib/auth.js');
const firebaseApi = FUNCTIONS_REQUIRE('firebase-tools/lib/api.js');
const { FacilityConfig } = require(path.join(ROOT, 'js', 'facility-config.js'));

const PROJECT_ID = 'labourcare-2481a';
const BLOCKED_PROJECT_IDS = new Set(['mnch-1cbda']);

if (BLOCKED_PROJECT_IDS.has(PROJECT_ID)) {
  throw new Error(`Refusing to export from protected Firebase project: ${PROJECT_ID}`);
}
const DEFAULT_WORKBOOK = path.join(ROOT, 'docs', 'Application data by facility.xlsx');
const EARLY_ANC_MAX_DAYS = 14 * 7;
const LOW_BIRTH_WEIGHT_GRAM = 2000;
const PRETERM_DAYS_BEFORE_EDD = 21;

const METRIC_KEYS = [
  'totalRegistered',
  'mothers',
  'babies',
  'ancHeadcount',
  'ancServices',
  'earlyAnc',
  'anc4Plus',
  'anc8Plus',
  'anemiaMild',
  'anemiaSevere',
  'hrt',
  'deliveries',
  'lcgSecondStage',
  'pncHeadcount',
  'pncServices',
  'pnc48h',
  'pnc42d',
  'nbcHeadcount',
  'nbcServices',
  'pretermLbw',
  'kmc',
];

const FACILITY_METRIC_COLUMNS = [
  'totalRegistered',
  'ancHeadcount',
  'ancServices',
  'earlyAnc',
  'anc4Plus',
  'anc8Plus',
  'anemiaMild',
  'anemiaSevere',
  'hrt',
  'deliveries',
  'lcgSecondStage',
  'pncHeadcount',
  'pncServices',
  'pnc48h',
  'pnc42d',
  'nbcHeadcount',
  'nbcServices',
  'pretermLbw',
  'kmc',
  'mothers',
  'babies',
];

function emptyMetrics() {
  return Object.fromEntries(METRIC_KEYS.map((key) => [key, 0]));
}

function normalizeRole(role) {
  return String(role || '').trim().toLowerCase();
}

function normalizePatientType(patient) {
  return String(patient.patient_type || 'mother').trim().toLowerCase();
}

function asDate(value) {
  if (!value) return null;
  if (typeof value.toDate === 'function') {
    const date = value.toDate();
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dateFromFields(data, fields) {
  for (const field of fields) {
    const date = asDate(data && data[field]);
    if (date) return date;
  }
  return null;
}

function numberFromFields(data, fields) {
  for (const field of fields) {
    const value = Number.parseFloat(data && data[field]);
    if (Number.isFinite(value) && value > 0) return value;
  }
  return null;
}

function textFromFields(data, fields) {
  for (const field of fields) {
    const value = data && data[field];
    if (value !== null && value !== undefined && String(value).trim()) {
      return String(value).trim();
    }
  }
  return '';
}

function isAffirmative(value) {
  if (value === true) return true;
  return ['yes', 'y', 'true'].includes(String(value || '').trim().toLowerCase());
}

function patientIdFromSubcollectionDoc(doc) {
  const patientRef = doc.ref.parent && doc.ref.parent.parent;
  if (!patientRef || !patientRef.parent || patientRef.parent.id !== 'patients') return null;
  return patientRef.id;
}

function makeEntry(doc) {
  return { id: doc.id, path: doc.ref.path, data: doc.data() || {} };
}

function addToPatientMap(map, doc) {
  const patientId = patientIdFromSubcollectionDoc(doc);
  if (!patientId) return;
  if (!map.has(patientId)) map.set(patientId, []);
  map.get(patientId).push(makeEntry(doc));
}

function createTemporaryAdcFile() {
  const account = firebaseAuth.getGlobalDefaultAccount();
  const refreshToken = account && account.tokens && account.tokens.refresh_token;
  if (!refreshToken) {
    throw new Error('No Firebase CLI login found. Run `firebase login` and retry.');
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mnch-facility-export-'));
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

async function loadCollectionGroup(db, collectionId, selectedPatientIds) {
  const result = new Map();
  const snapshot = await db.collectionGroup(collectionId).get();
  snapshot.docs.forEach((doc) => {
    const patientId = patientIdFromSubcollectionDoc(doc);
    if (patientId && selectedPatientIds.has(patientId)) addToPatientMap(result, doc);
  });
  return result;
}

function mergePatientMaps(...maps) {
  const merged = new Map();
  maps.forEach((map) => {
    map.forEach((entries, patientId) => {
      if (!merged.has(patientId)) merged.set(patientId, []);
      merged.get(patientId).push(...entries);
    });
  });
  return merged;
}

async function loadData(db) {
  console.log('Loading Midwife accounts...');
  const usersSnapshot = await db.collection('users').get();
  const midwives = new Map();
  usersSnapshot.docs.forEach((doc) => {
    const user = doc.data() || {};
    if (normalizeRole(user.role) === 'midwife') {
      midwives.set(doc.id, {
        id: doc.id,
        facilityCode: String(user.facility_code || '').trim(),
      });
    }
  });

  if (!midwives.size) throw new Error('No Midwife-role users were found.');

  console.log(`Loading patients created by ${midwives.size} Midwife accounts...`);
  const patientsSnapshot = await db.collection('patients').get();
  const patients = new Map();
  patientsSnapshot.docs.forEach((doc) => {
    const data = doc.data() || {};
    const creatorId = String(data.created_by || data.createdBy || '').trim();
    if (!midwives.has(creatorId)) return;
    patients.set(doc.id, {
      id: doc.id,
      data,
      creatorId,
      facilityCode: midwives.get(creatorId).facilityCode,
    });
  });

  const selectedPatientIds = new Set(patients.keys());
  console.log(`Loading clinical records for ${patients.size} selected patients...`);
  const [
    antenatalVisits,
    postpartumVisits,
    testRecords,
    testRecordsLegacy,
    labTests,
    records,
    newbornCare,
    immediateNewbornCare,
  ] = await Promise.all([
    loadCollectionGroup(db, 'antenatal_visits', selectedPatientIds),
    loadCollectionGroup(db, 'postpartum_visits', selectedPatientIds),
    loadCollectionGroup(db, 'testRecords', selectedPatientIds),
    loadCollectionGroup(db, 'test_records', selectedPatientIds),
    loadCollectionGroup(db, 'lab_tests', selectedPatientIds),
    loadCollectionGroup(db, 'records', selectedPatientIds),
    loadCollectionGroup(db, 'newborn_care', selectedPatientIds),
    loadCollectionGroup(db, 'immediate_newborn_care', selectedPatientIds),
  ]);

  return {
    midwives,
    patients,
    antenatalVisits,
    postpartumVisits,
    tests: mergePatientMaps(testRecords, testRecordsLegacy, labTests),
    records,
    newbornCare,
    immediateNewbornCare,
  };
}

function sortedByDate(entries, fields) {
  return (entries || []).slice().sort((left, right) => {
    const leftDate = dateFromFields(left.data, fields);
    const rightDate = dateFromFields(right.data, fields);
    return (leftDate ? leftDate.getTime() : 0) - (rightDate ? rightDate.getTime() : 0);
  });
}

function getEarliestAncDate(firstVisit) {
  const dates = [];
  const direct = dateFromFields(firstVisit, ['visitDate', 'visit_date', 'timestamp', 'createdAt', 'created_at']);
  if (direct) dates.push(direct);
  if (Array.isArray(firstVisit.otherVisits)) {
    firstVisit.otherVisits.forEach((visit) => {
      const date = dateFromFields(visit, ['visitDate', 'visit_date', 'timestamp', 'createdAt']);
      if (date) dates.push(date);
    });
  }
  dates.sort((a, b) => a.getTime() - b.getTime());
  return dates[0] || null;
}

function isEarlyAnc(patient, visits) {
  if (!visits.length) return false;
  const first = sortedByDate(
    visits,
    ['visitDate', 'visit_date', 'timestamp', 'createdAt', 'created_at'],
  )[0].data;
  const firstVisitDate = getEarliestAncDate(first);
  const lmp = first.lmp || patient.lmp;
  const lmpStatus = String(first.lmpStatus || patient.lmpStatus || '').toLowerCase();
  const lmpDate = asDate(lmp);
  if (lmpDate && firstVisitDate && lmpStatus !== 'unknown') {
    const days = Math.floor((firstVisitDate.getTime() - lmpDate.getTime()) / 86400000);
    if (days >= 0) return days < EARLY_ANC_MAX_DAYS;
  }

  const gestationalAge = numberFromFields(first, [
    'gestationalAge',
    'gestational_age',
    'ga_weeks',
    'manualGestationalAge',
  ]);
  return gestationalAge !== null && gestationalAge < 14;
}

function latestHemoglobin(tests, visits) {
  const labEntries = (tests || [])
    .map((entry) => ({
      value: numberFromFields(entry.data, ['hemoglobinResult', 'hemoglobin', 'hb']),
      date: dateFromFields(entry.data, ['testDate', 'visitDate', 'timestamp', 'createdAt', 'created_at']),
      path: entry.path,
    }))
    .filter((entry) => entry.value !== null);

  const source = labEntries.length
    ? labEntries
    : (visits || [])
      .map((entry) => ({
        value: numberFromFields(entry.data, ['hemoglobin', 'hemoglobinResult', 'hb']),
        date: dateFromFields(entry.data, ['visitDate', 'timestamp', 'createdAt', 'created_at']),
        path: entry.path,
      }))
      .filter((entry) => entry.value !== null);

  source.sort((a, b) => {
    const dateDiff = (a.date ? a.date.getTime() : 0) - (b.date ? b.date.getTime() : 0);
    return dateDiff || a.path.localeCompare(b.path);
  });
  return source.length ? source[source.length - 1].value : null;
}

function isHighRisk(visits) {
  return (visits || []).some((entry) => {
    const data = entry.data;
    return isAffirmative(data.high_risk || data.highRisk);
  });
}

function statusBucket(patient) {
  const status = String(patient.status || patient.treatmentStatus || 'registered')
    .toLowerCase()
    .replace(/[_-]+/g, ' ');
  if (status.includes('postnatal') || status.includes('postpartum') ||
      status.includes('pnc') || status.includes('birthed') || status.includes('delivered')) return 'pnc';
  if (status.includes('intrapartum') || status.includes('labour') || status.includes('labor')) return 'labour';
  if (status.includes('antenatal') || status.includes('anc')) return 'anc';
  return 'registered';
}

function recordsById(entries) {
  const result = new Map();
  (entries || []).forEach((entry) => result.set(entry.id, entry.data));
  return result;
}

function isDelivered(patient, pncVisits, records, newbornEntries, immediateEntries) {
  if (statusBucket(patient) === 'pnc') return true;
  if (pncVisits.length || newbornEntries.length || immediateEntries.length) return true;
  const birth = records.get('birthRecord') || {};
  return Boolean(textFromFields(birth, [
    'deliveryDate',
    'birthDate',
    'birthTime',
    'deliveredDateTime',
    'deliveryDateTime',
  ]));
}

function hasSecondStage(records) {
  const summary = records.get('summary') || {};
  const secondStage = records.get('secondStage') || {};
  return Boolean(
    textFromFields(summary, ['secondStageTime', 'secondStage_Time']) ||
    textFromFields(secondStage, ['secondStageStartTime', 'secondStageTime']),
  );
}

function firstPncDays(pncVisits, records) {
  if (!pncVisits.length) return null;
  const first = sortedByDate(
    pncVisits,
    ['visitDate', 'visit_date', 'timestamp', 'createdAt', 'created_at', 'date'],
  )[0].data;
  const explicit = numberFromFields(first, [
    'postpartumDays',
    'postpartum_days',
    'daysPostpartum',
    'days_since_delivery',
  ]);
  if (explicit !== null) return explicit;

  const visitDate = dateFromFields(first, [
    'visitDate',
    'visit_date',
    'timestamp',
    'createdAt',
    'created_at',
    'date',
  ]);
  let deliveryDate = dateFromFields(first, ['deliveredDateTime', 'deliveryDate', 'delivery_date']);
  if (!deliveryDate) {
    deliveryDate = dateFromFields(records.get('birthRecord') || {}, [
      'deliveryDate',
      'birthDate',
      'birthTime',
      'timestamp',
      'date',
    ]);
  }
  if (!visitDate || !deliveryDate) return null;
  const days = Math.floor((visitDate.getTime() - deliveryDate.getTime()) / 86400000);
  return days >= 0 ? days : null;
}

function getLatestAncData(visits) {
  if (!visits.length) return {};
  return sortedByDate(
    visits,
    ['visitDate', 'visit_date', 'timestamp', 'createdAt', 'created_at'],
  )[visits.length - 1].data;
}

function getNewbornBabies(newbornEntries) {
  const babies = [];
  (newbornEntries || []).forEach((entry) => {
    const data = entry.data;
    if (Array.isArray(data.babies) && data.babies.length) {
      data.babies.forEach((baby) => babies.push({ ...data, ...baby }));
    } else {
      babies.push(data);
    }
  });
  return babies;
}

function newbornIsPretermOrLbw(patient, babies, latestAnc) {
  const edd = asDate(
    patient.edd || patient.EDD || patient.maternal_edd ||
    patient.manualEdd || patient.manual_edd ||
    latestAnc.edd || latestAnc.manualEdd || latestAnc.manual_edd,
  );
  return babies.some((baby) => {
    const weight = numberFromFields(baby, [
      'birthWeightGram',
      'birth_weight_gram',
      'body_weight_gram',
    ]);
    if (weight !== null && weight < LOW_BIRTH_WEIGHT_GRAM) return true;
    const birthDate = dateFromFields(baby, ['birthTime', 'birth_time', 'birthDate', 'birth_date']);
    if (!birthDate || !edd) return false;
    const daysBeforeEdd = Math.floor((edd.getTime() - birthDate.getTime()) / 86400000);
    return daysBeforeEdd >= PRETERM_DAYS_BEFORE_EDD;
  });
}

function newbornHasKmcYes(newbornEntries, antenatalVisits) {
  const entries = [...(newbornEntries || []), ...(antenatalVisits || [])];
  return entries.some((entry) => {
    const data = entry.data;
    if (String(data.kmc_selected || '').toLowerCase() === 'yes') return true;
    const babyArrays = [data.babies, data.kmc_babies];
    return babyArrays.some((babies) => Array.isArray(babies) && babies.some(
      (baby) => String(baby.kmc_selected || '').toLowerCase() === 'yes',
    ));
  });
}

function canonicalNewbornPatientIds(patients) {
  const selectedIds = new Set(patients.keys());
  const canonical = new Set();
  patients.forEach((patient, patientId) => {
    const data = patient.data;
    if (normalizePatientType(data) !== 'baby') {
      canonical.add(patientId);
      return;
    }
    const motherId = String(data.mother_patient_id || '').trim();
    if (!motherId || !selectedIds.has(motherId)) canonical.add(patientId);
  });
  return canonical;
}

function aggregate(data) {
  const metricsByFacility = new Map();
  const ensureFacility = (facilityCode) => {
    const code = facilityCode || '__UNMAPPED__';
    if (!metricsByFacility.has(code)) metricsByFacility.set(code, emptyMetrics());
    return metricsByFacility.get(code);
  };

  FacilityConfig.getFacilities().forEach((facility) => ensureFacility(facility.code));
  const canonicalNbcIds = canonicalNewbornPatientIds(data.patients);

  data.patients.forEach((patient, patientId) => {
    const profile = patient.data;
    const facility = ensureFacility(patient.facilityCode);
    const anc = data.antenatalVisits.get(patientId) || [];
    const pnc = data.postpartumVisits.get(patientId) || [];
    const tests = data.tests.get(patientId) || [];
    const records = recordsById(data.records.get(patientId) || []);
    const newborn = data.newbornCare.get(patientId) || [];
    const immediate = data.immediateNewbornCare.get(patientId) || [];
    const allNewborn = [...newborn, ...immediate];
    const isMother = normalizePatientType(profile) !== 'baby';
    facility.totalRegistered++;
    if (isMother) facility.mothers++;
    else facility.babies++;

    if (isMother) {
      if (anc.length) {
        facility.ancHeadcount++;
        facility.ancServices += anc.length;
        if (isEarlyAnc(profile, anc)) facility.earlyAnc++;
        if (anc.length >= 4) facility.anc4Plus++;
        if (anc.length >= 8) facility.anc8Plus++;
      }

      const hb = latestHemoglobin(tests, anc);
      if (hb !== null && hb < 7) facility.anemiaSevere++;
      else if (hb !== null && hb <= 11) facility.anemiaMild++;
      if (isHighRisk(anc)) facility.hrt++;

      if (isDelivered(profile, pnc, records, newborn, immediate)) facility.deliveries++;
      if (hasSecondStage(records)) facility.lcgSecondStage++;

      if (pnc.length) {
        facility.pncHeadcount++;
        facility.pncServices += pnc.length;
        const days = firstPncDays(pnc, records);
        if (days !== null && days <= 2) facility.pnc48h++;
        if (days !== null && days <= 42) facility.pnc42d++;
      }
    }

    if (canonicalNbcIds.has(patientId) && allNewborn.length) {
      facility.nbcHeadcount++;
      facility.nbcServices += allNewborn.length;
      const babies = getNewbornBabies(allNewborn);
      if (newbornIsPretermOrLbw(profile, babies, getLatestAncData(anc))) {
        facility.pretermLbw++;
      }
      if (newbornHasKmcYes(allNewborn, anc)) facility.kmc++;
    }
  });

  return metricsByFacility;
}

function buildFacilityRows(metricsByFacility) {
  const facilities = FacilityConfig.getFacilities();
  const rows = [];
  let number = 1;

  const addGroup = (township, groupFacilities) => {
    groupFacilities.forEach((facility) => {
      rows.push({
        number: number++,
        township,
        facilityCode: facility.code,
        facilityName: facility.name_en,
        metrics: metricsByFacility.get(facility.code) || emptyMetrics(),
      });
    });
  };

  addGroup('Pyinmana', facilities.filter((facility) => facility.township === 'Pyinmana'));
  addGroup('Tatkon', facilities.filter((facility) => facility.township === 'Tatkon'));

  const otherFacilities = facilities.filter((facility) => !facility.township);
  const knownCodes = new Set(facilities.map((facility) => facility.code));
  const unknownCodes = [...metricsByFacility.keys()]
    .filter((code) => code !== '__UNMAPPED__' && !knownCodes.has(code))
    .sort()
    .map((code) => ({ code, name_en: `Unknown facility (${code})` }));

  const otherRows = [...otherFacilities, ...unknownCodes];
  if (metricsByFacility.has('__UNMAPPED__')) {
    otherRows.push({ code: '__UNMAPPED__', name_en: 'Missing facility code' });
  }
  if (otherRows.length) addGroup('Other / Unmapped', otherRows);

  return rows;
}

function cloneStyle(style) {
  return JSON.parse(JSON.stringify(style || {}));
}

function pct(numerator, denominator) {
  if (!denominator) return 0;
  return Math.round((numerator / denominator) * 1000) / 10;
}

function addMetrics(target, source) {
  METRIC_KEYS.forEach((key) => { target[key] += source[key] || 0; });
}

function townshipTotals(rows) {
  const totals = new Map();
  rows.forEach((row) => {
    if (!totals.has(row.township)) totals.set(row.township, emptyMetrics());
    addMetrics(totals.get(row.township), row.metrics);
  });
  return totals;
}

function coverageRows(metrics) {
  return [
    { label: 'Early ANC among ANC clients', value: pct(metrics.earlyAnc, metrics.ancHeadcount) },
    { label: 'ANC 4+ among ANC clients', value: pct(metrics.anc4Plus, metrics.ancHeadcount) },
    { label: 'ANC 8+ among ANC clients', value: pct(metrics.anc8Plus, metrics.ancHeadcount) },
    { label: 'PNC within 48 hours among PNC clients', value: pct(metrics.pnc48h, metrics.pncHeadcount) },
    { label: 'PNC within 42 days among PNC clients', value: pct(metrics.pnc42d, metrics.pncHeadcount) },
    { label: 'LCG 2nd stage among deliveries', value: pct(metrics.lcgSecondStage, metrics.deliveries) },
  ];
}

function styleHeaderCell(cell) {
  cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } };
  cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  cell.border = {
    top: { style: 'thin', color: { argb: 'FFFFFFFF' } },
    left: { style: 'thin', color: { argb: 'FFFFFFFF' } },
    bottom: { style: 'thin', color: { argb: 'FFFFFFFF' } },
    right: { style: 'thin', color: { argb: 'FFFFFFFF' } },
  };
}

function styleBodyCell(cell, options) {
  options = options || {};
  cell.border = {
    top: { style: 'thin', color: { argb: 'FFD9E2F3' } },
    left: { style: 'thin', color: { argb: 'FFD9E2F3' } },
    bottom: { style: 'thin', color: { argb: 'FFD9E2F3' } },
    right: { style: 'thin', color: { argb: 'FFD9E2F3' } },
  };
  cell.alignment = {
    vertical: 'middle',
    horizontal: options.horizontal || 'center',
    wrapText: true,
  };
}

function writeHeaderRow(worksheet, rowNumber, headers) {
  headers.forEach((header, index) => {
    const cell = worksheet.getCell(rowNumber, index + 1);
    cell.value = header;
    styleHeaderCell(cell);
  });
  worksheet.getRow(rowNumber).height = 28;
}

function createWorkbookTemplate() {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Application data by facility');
  worksheet.getCell('A1').value =
    'Total Registered = mothers + baby patient records. Midwife-created patients only. All-time extract from live MNCH data.';
  worksheet.mergeCells('A1:X1');
  worksheet.getCell('A1').font = { italic: true, size: 9, color: { argb: 'FF1F4E78' } };
  worksheet.getRow(1).height = 18;

  const headers = {
    A2: 'No.',
    B2: 'Township',
    C2: 'Health Facilities',
    D2: 'Total Registered',
    E2: 'Total ANC Headcount ',
    F2: 'Total ANC services received',
    G2: 'ANC',
    J2: 'Anemia',
    L2: 'HRT',
    M2: 'Total Deliveries',
    N2: 'LCG application (2nd stage)',
    O2: 'Total PNC Headcount',
    P2: 'Total PNC services received',
    Q2: 'PNC within 48 hr',
    R2: 'PNC within 42 Ds',
    S2: 'Total NBC Headcount',
    T2: 'Total NBC services received',
    U2: 'Preterm/LBW',
    V2: 'KMC',
    W2: 'Mothers',
    X2: 'Babies',
    G3: 'Early ANC',
    H3: 'ANC 4+ visit',
    I3: 'ANC 8+ visit',
    J3: 'Mild',
    K3: 'Sever',
  };
  Object.entries(headers).forEach(([cell, value]) => {
    worksheet.getCell(cell).value = value;
  });

  [
    'A2:A3', 'B2:B3', 'C2:C3', 'D2:D3', 'E2:E3', 'F2:F3',
    'G2:I2', 'J2:K2', 'L2:L3', 'M2:M3', 'N2:N3', 'O2:O3',
    'P2:P3', 'Q2:Q3', 'R2:R3', 'S2:S3', 'T2:T3', 'U2:U3', 'V2:V3',
    'W2:W3', 'X2:X3',
  ].forEach((range) => worksheet.mergeCells(range));

  const widths = [
    4.3, 12.1, 24, 12.7, 15.3, 20.9, 10.6, 11.7, 11.9, 6.9, 6.9,
    7.3, 13.4, 15.1, 13.4, 17.1, 11, 11.6, 13.4, 17.3, 13, 9, 10, 10,
  ];
  widths.forEach((width, index) => { worksheet.getColumn(index + 1).width = width; });
  worksheet.getRow(2).height = 32;
  worksheet.getRow(3).height = 35.25;

  for (let row = 2; row <= 3; row++) {
    for (let column = 1; column <= 24; column++) {
      styleHeaderCell(worksheet.getCell(row, column));
    }
  }
  return workbook;
}

function addPivotSourceSheet(workbook, rows) {
  const sheet = workbook.addWorksheet('Pivot source');
  const headers = [
    'Township', 'Facility code', 'Health facility', 'Total registered', 'Mothers', 'Babies',
    'ANC headcount', 'ANC services', 'Early ANC', 'ANC 4+', 'ANC 8+',
    'Anemia mild', 'Anemia severe', 'HRT', 'Deliveries', 'LCG 2nd stage',
    'PNC headcount', 'PNC services', 'PNC 48h', 'PNC 42d',
    'NBC headcount', 'NBC services', 'Preterm/LBW', 'KMC',
    'Early ANC %', 'ANC 4+ %', 'PNC 48h %', 'PNC 42d %', 'LCG 2nd stage %',
  ];
  writeHeaderRow(sheet, 1, headers);
  const widths = [16, 12, 36, 14, 10, 10, 14, 14, 12, 10, 10, 12, 14, 10, 12, 14, 14, 14, 12, 12, 14, 14, 12, 10, 12, 12, 12, 12, 14];
  widths.forEach((width, index) => { sheet.getColumn(index + 1).width = width; });

  rows.forEach((row, index) => {
    const m = row.metrics;
    const values = [
      row.township, row.facilityCode, row.facilityName, m.totalRegistered, m.mothers, m.babies,
      m.ancHeadcount, m.ancServices, m.earlyAnc, m.anc4Plus, m.anc8Plus,
      m.anemiaMild, m.anemiaSevere, m.hrt, m.deliveries, m.lcgSecondStage,
      m.pncHeadcount, m.pncServices, m.pnc48h, m.pnc42d,
      m.nbcHeadcount, m.nbcServices, m.pretermLbw, m.kmc,
      pct(m.earlyAnc, m.ancHeadcount), pct(m.anc4Plus, m.ancHeadcount),
      pct(m.pnc48h, m.pncHeadcount), pct(m.pnc42d, m.pncHeadcount),
      pct(m.lcgSecondStage, m.deliveries),
    ];
    values.forEach((value, offset) => {
      const cell = sheet.getCell(index + 2, offset + 1);
      cell.value = value;
      styleBodyCell(cell, { horizontal: offset < 3 ? 'left' : 'center' });
    });
  });

  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: rows.length + 1, column: headers.length },
  };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.getCell('A' + (rows.length + 3)).value =
    'Excel: select this sheet from A1, then Insert → PivotTable. Rows = Township or Health facility. Values = the indicator to present.';
  sheet.getCell('A' + (rows.length + 3)).font = { italic: true, size: 9, color: { argb: 'FF334155' } };
}

function addTownshipSummarySheet(workbook, rows) {
  const sheet = workbook.addWorksheet('Township summary');
  const headers = [
    'Township', 'Facilities with data', 'Total registered', 'Mothers', 'Babies',
    'ANC headcount', 'Early ANC', 'ANC 4+', 'ANC 8+', 'HRT', 'Deliveries',
    'LCG 2nd stage', 'PNC headcount', 'PNC 48h', 'PNC 42d', 'NBC', 'Preterm/LBW', 'KMC',
    'Early ANC %', 'ANC 4+ %', 'PNC 48h %', 'PNC 42d %', 'LCG %',
  ];
  writeHeaderRow(sheet, 1, headers);
  headers.forEach((_, index) => { sheet.getColumn(index + 1).width = index === 0 ? 20 : 14; });

  const grouped = townshipTotals(rows);
  let rowNumber = 2;
  grouped.forEach((metrics, township) => {
    const facilitiesWithData = rows.filter(
      (row) => row.township === township && row.metrics.totalRegistered > 0,
    ).length;
    const values = [
      township, facilitiesWithData, metrics.totalRegistered, metrics.mothers, metrics.babies,
      metrics.ancHeadcount, metrics.earlyAnc, metrics.anc4Plus, metrics.anc8Plus, metrics.hrt,
      metrics.deliveries, metrics.lcgSecondStage, metrics.pncHeadcount, metrics.pnc48h,
      metrics.pnc42d, metrics.nbcHeadcount, metrics.pretermLbw, metrics.kmc,
      pct(metrics.earlyAnc, metrics.ancHeadcount), pct(metrics.anc4Plus, metrics.ancHeadcount),
      pct(metrics.pnc48h, metrics.pncHeadcount), pct(metrics.pnc42d, metrics.pncHeadcount),
      pct(metrics.lcgSecondStage, metrics.deliveries),
    ];
    values.forEach((value, offset) => {
      const cell = sheet.getCell(rowNumber, offset + 1);
      cell.value = value;
      styleBodyCell(cell, { horizontal: offset === 0 ? 'left' : 'center' });
    });
    rowNumber++;
  });

  const overall = totalsForRows(rows);
  const totalValues = [
    'All townships',
    rows.filter((row) => row.metrics.totalRegistered > 0).length,
    overall.totalRegistered, overall.mothers, overall.babies, overall.ancHeadcount,
    overall.earlyAnc, overall.anc4Plus, overall.anc8Plus, overall.hrt, overall.deliveries,
    overall.lcgSecondStage, overall.pncHeadcount, overall.pnc48h, overall.pnc42d,
    overall.nbcHeadcount, overall.pretermLbw, overall.kmc,
    pct(overall.earlyAnc, overall.ancHeadcount), pct(overall.anc4Plus, overall.ancHeadcount),
    pct(overall.pnc48h, overall.pncHeadcount), pct(overall.pnc42d, overall.pncHeadcount),
    pct(overall.lcgSecondStage, overall.deliveries),
  ];
  totalValues.forEach((value, offset) => {
    const cell = sheet.getCell(rowNumber, offset + 1);
    cell.value = value;
    styleHeaderCell(cell);
  });
}

function addBriefingSheet(workbook, rows, extras) {
  const sheet = workbook.addWorksheet('Ministry briefing', { properties: { tabColor: { argb: 'FF1F4E78' } } });
  sheet.columns = [
    { width: 28 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 16 },
    { width: 16 }, { width: 16 }, { width: 16 },
  ];
  const totals = totalsForRows(rows);
  sheet.mergeCells('A1:H1');
  sheet.getCell('A1').value = 'm-MNCH Care — Ministry briefing (midwife-created patients, all time)';
  sheet.getCell('A1').font = { bold: true, size: 16, color: { argb: 'FF1F4E78' } };
  sheet.getRow(1).height = 24;
  sheet.mergeCells('A2:H2');
  sheet.getCell('A2').value =
    `Live extract from ${PROJECT_ID}. ${extras.midwifeCount} midwife accounts. ` +
    `${totals.totalRegistered} registered patients (${totals.mothers} mothers, ${totals.babies} babies).`;
  sheet.getCell('A2').font = { size: 10, color: { argb: 'FF334155' } };

  const kpis = [
    ['Registered patients', totals.totalRegistered],
    ['Mothers', totals.mothers],
    ['Babies', totals.babies],
    ['ANC clients', totals.ancHeadcount],
    ['Deliveries', totals.deliveries],
    ['PNC clients', totals.pncHeadcount],
    ['NBC records', totals.nbcHeadcount],
    ['High-risk (HRT)', totals.hrt],
  ];
  kpis.forEach((item, index) => {
    const col = index + 1;
    const labelCell = sheet.getCell(4, col);
    const valueCell = sheet.getCell(5, col);
    labelCell.value = item[0];
    valueCell.value = item[1];
    styleHeaderCell(labelCell);
    valueCell.font = { bold: true, size: 16, color: { argb: 'FF1F4E78' } };
    valueCell.alignment = { vertical: 'middle', horizontal: 'center' };
    sheet.getRow(5).height = 28;
  });

  sheet.getCell('A7').value = 'Why these numbers matter';
  sheet.getCell('A7').font = { bold: true, size: 12, color: { argb: 'FF1F4E78' } };
  const notes = [
    'Total registered now matches the dashboard idea of counting every patient document: mothers and linked babies.',
    'Early ANC, ANC 4+ and ANC 8+ show whether antenatal contact is starting on time and being completed.',
    'PNC within 48 hours and 42 days are standard postnatal coverage checks for township and regional review.',
    'LCG 2nd stage shows whether the Labour Care Guide was actually applied during labour, not only that a delivery occurred.',
    'Preterm/LBW and KMC show whether small and early babies are identified and offered kangaroo mother care.',
  ];
  notes.forEach((note, index) => {
    sheet.mergeCells(8 + index, 1, 8 + index, 8);
    sheet.getCell(8 + index, 1).value = `${index + 1}. ${note}`;
    sheet.getCell(8 + index, 1).alignment = { wrapText: true, vertical: 'middle' };
    sheet.getRow(8 + index).height = 22;
  });

  sheet.getCell('A14').value = 'Coverage snapshot';
  sheet.getCell('A14').font = { bold: true, size: 12, color: { argb: 'FF1F4E78' } };
  writeHeaderRow(sheet, 15, ['Indicator', 'Numerator', 'Denominator', 'Coverage %']);
  coverageRows(totals).forEach((row, index) => {
    const numerators = [
      totals.earlyAnc, totals.anc4Plus, totals.anc8Plus,
      totals.pnc48h, totals.pnc42d, totals.lcgSecondStage,
    ];
    const denominators = [
      totals.ancHeadcount, totals.ancHeadcount, totals.ancHeadcount,
      totals.pncHeadcount, totals.pncHeadcount, totals.deliveries,
    ];
    const values = [row.label, numerators[index], denominators[index], row.value];
    values.forEach((value, offset) => {
      const cell = sheet.getCell(16 + index, offset + 1);
      cell.value = value;
      styleBodyCell(cell, { horizontal: offset === 0 ? 'left' : 'center' });
    });
  });

  sheet.getCell('A23').value = 'Charts for presentation are on the Charts sheet. Use Pivot source for custom Ministry tables.';
  sheet.getCell('A23').font = { italic: true, size: 9, color: { argb: 'FF334155' } };
}

function renderChartImages(rows) {
  const totals = totalsForRows(rows);
  const grouped = townshipTotals(rows);
  const townships = [];
  grouped.forEach((metrics, township) => {
    townships.push({
      township,
      mothers: metrics.mothers,
      babies: metrics.babies,
      ancHeadcount: metrics.ancHeadcount,
      deliveries: metrics.deliveries,
      pncHeadcount: metrics.pncHeadcount,
      nbcHeadcount: metrics.nbcHeadcount,
    });
  });
  const topFacilities = rows
    .slice()
    .sort((a, b) => b.metrics.totalRegistered - a.metrics.totalRegistered)
    .filter((row) => row.metrics.totalRegistered > 0)
    .slice(0, 10)
    .map((row) => ({ facility: row.facilityName, registered: row.metrics.totalRegistered }));

  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mnch-facility-charts-'));
  const payload = {
    outDir,
    townships,
    topFacilities,
    coverage: coverageRows(totals),
  };
  const scriptPath = path.join(__dirname, 'render-facility-charts.py');
  const result = spawnSync('python3', [scriptPath], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    console.warn('Chart rendering skipped:', result.stderr || result.stdout || result.error);
    return { outDir, files: [] };
  }
  const files = [
    'registered-by-township.png',
    'continuum-by-township.png',
    'coverage-rates.png',
    'top-facilities.png',
  ].filter((name) => fs.existsSync(path.join(outDir, name)));
  return { outDir, files };
}

function addChartsSheet(workbook, chartResult) {
  const sheet = workbook.addWorksheet('Charts');
  sheet.getCell('A1').value = 'Illustrative charts for Ministry presentation';
  sheet.getCell('A1').font = { bold: true, size: 14, color: { argb: 'FF1F4E78' } };
  sheet.getCell('A2').value = 'Generated from the same midwife-only extract as Application data by facility.';
  sheet.getCell('A2').font = { italic: true, size: 9, color: { argb: 'FF334155' } };
  sheet.getColumn(1).width = 18;
  if (!chartResult.files.length) {
    sheet.getCell('A4').value = 'Charts could not be rendered in this environment. Use Township summary and Pivot source instead.';
    return;
  }
  const placements = [
    { file: 'registered-by-township.png', tl: { col: 0, row: 3 }, ext: { width: 620, height: 320 } },
    { file: 'continuum-by-township.png', tl: { col: 10, row: 3 }, ext: { width: 620, height: 320 } },
    { file: 'coverage-rates.png', tl: { col: 0, row: 22 }, ext: { width: 620, height: 320 } },
    { file: 'top-facilities.png', tl: { col: 10, row: 22 }, ext: { width: 620, height: 360 } },
  ];
  placements.forEach((item) => {
    const filename = path.join(chartResult.outDir, item.file);
    if (!fs.existsSync(filename)) return;
    const imageId = workbook.addImage({ filename, extension: 'png' });
    sheet.addImage(imageId, { tl: item.tl, ext: item.ext });
  });
}

async function writeWorkbook(workbookPath, rows, extras) {
  const workbook = createWorkbookTemplate();
  const worksheet = workbook.worksheets[0];
  const lastDataRow = 3 + rows.length;

  rows.forEach((row, index) => {
    const rowNumber = 4 + index;
    const values = [
      row.number,
      row.township,
      row.facilityName,
      ...FACILITY_METRIC_COLUMNS.map((key) => row.metrics[key]),
    ];
    values.forEach((value, offset) => {
      const cell = worksheet.getCell(rowNumber, offset + 1);
      cell.value = value;
      styleBodyCell(cell, { horizontal: offset >= 3 ? 'center' : 'left' });
    });
    worksheet.getRow(rowNumber).height = 28;
  });

  let groupStart = 0;
  while (groupStart < rows.length) {
    let groupEnd = groupStart;
    while (
      groupEnd + 1 < rows.length &&
      rows[groupEnd + 1].township === rows[groupStart].township
    ) groupEnd++;
    if (groupEnd > groupStart) {
      worksheet.mergeCells(4 + groupStart, 2, 4 + groupEnd, 2);
    }
    worksheet.getCell(4 + groupStart, 2).alignment = {
      vertical: 'middle',
      horizontal: 'center',
      wrapText: true,
    };
    groupStart = groupEnd + 1;
  }

  worksheet.views = [{ state: 'frozen', ySplit: 3 }];
  worksheet.pageSetup = {
    orientation: 'landscape',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
  };
  worksheet.headerFooter.oddFooter = 'Generated from MNCH live data — Midwife accounts only';
  worksheet.autoFilter = {
    from: { row: 3, column: 1 },
    to: { row: lastDataRow, column: 24 },
  };

  addBriefingSheet(workbook, rows, extras);
  addTownshipSummarySheet(workbook, rows);
  addPivotSourceSheet(workbook, rows);
  const chartResult = renderChartImages(rows);
  try {
    addChartsSheet(workbook, chartResult);
    await workbook.xlsx.writeFile(workbookPath);
  } finally {
    fs.rmSync(chartResult.outDir, { recursive: true, force: true });
  }
}

function totalsForRows(rows) {
  const totals = emptyMetrics();
  rows.forEach((row) => {
    METRIC_KEYS.forEach((key) => { totals[key] += row.metrics[key]; });
  });
  return totals;
}

async function main() {
  const workbookPath = path.resolve(process.argv[2] || DEFAULT_WORKBOOK);
  console.log(`Target project: ${PROJECT_ID}`);
  console.log(`Workbook: ${workbookPath}`);

  const { db, cleanup } = await initializeFirestore();
  try {
    const data = await loadData(db);
    const metricsByFacility = aggregate(data);
    const rows = buildFacilityRows(metricsByFacility);
    await writeWorkbook(workbookPath, rows, { midwifeCount: data.midwives.size });

    const totals = totalsForRows(rows);
    console.log(`Wrote ${rows.length} facility rows.`);
    console.log(`Midwife accounts: ${data.midwives.size}`);
    console.log(`Selected patients: ${data.patients.size}`);
    console.log(`Registered patients: ${totals.totalRegistered} (${totals.mothers} mothers, ${totals.babies} babies)`);
    console.log(`ANC services: ${totals.ancServices}; PNC services: ${totals.pncServices}; NBC services: ${totals.nbcServices}`);
    console.log('Export complete.');
  } finally {
    cleanup();
    delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
  }
}

main().catch((error) => {
  console.error('Export failed:', error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
