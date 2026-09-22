#!/usr/bin/env node
'use strict';

/**
 * One-time all-time facility export for the Ministry application-data workbook.
 *
 * Scope:
 * - patients created by users whose role is Midwife (case-insensitive)
 * - metrics grouped by the creating midwife's facility_code
 * - Total Registered counts mothers and babies
 * - ANC / PNC / delivery notes stay mother-centric
 * - Total KMC matches the KMC tracker "Total KMC patients" card: KMC Yes
 *   on any linked newborn visit, or completed (including auto-complete
 *   two calendar months after birth for LBW/preterm babies)
 * - preterm-LBW also reads linked mother or baby newborn visits
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

const PROJECT_ID = 'mnch-1cbda';
const EXTRACT_DATE_LABEL = '20 September 2026';
const EXTRACT_DATE_ISO = '2026-09-20';
const PILOT_TOWNSHIPS = ['Pyinmana', 'Tatkon'];
const DEFAULT_WORKBOOK = path.join(ROOT, 'docs', `Application data by facility - ${EXTRACT_DATE_ISO}.xlsx`);
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
  'dashboardDeliveries',
  'lcgSecondStage',
  'pncHeadcount',
  'pncServices',
  'pnc48h',
  'pnc42d',
  'pncAfter42d',
  'pncTimingUnknown',
  'nbcHeadcount',
  'immediateNbcHeadcount',
  'nbcServices',
  'pretermLbw',
  'kmc',
  'transfers',
  'jointCare',
];

const ACCOUNT_ACTIVITY_KEYS = [
  'ownedRegistered',
  'ownedMothers',
  'ownedBabies',
  'activeJointCare',
  'ancServices',
  'ancNew',
  'ancOld',
  'pncServices',
  'pncNew',
  'pncOld',
  'newbornServices',
  'newbornNew',
  'newbornOld',
  'transfersRecorded',
  'pretermLbwBabies',
  'kmcYesBabies',
  'fallbackAttributedServices',
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
  'dashboardDeliveries',
  'lcgSecondStage',
  'pncHeadcount',
  'pncServices',
  'pnc48h',
  'pnc42d',
  'pncAfter42d',
  'pncTimingUnknown',
  'nbcHeadcount',
  'immediateNbcHeadcount',
  'nbcServices',
  'pretermLbw',
  'kmc',
  'transfers',
  'jointCare',
  'mothers',
  'babies',
];

function emptyMetrics() {
  return Object.fromEntries(METRIC_KEYS.map((key) => [key, 0]));
}

function emptyAccountActivity() {
  return Object.fromEntries(ACCOUNT_ACTIVITY_KEYS.map((key) => [key, 0]));
}

function townshipForFacilityCode(code) {
  const facility = FacilityConfig.getFacilityByCode(code);
  return facility && facility.township ? facility.township : '';
}

function isPilotFacilityCode(code) {
  return PILOT_TOWNSHIPS.includes(townshipForFacilityCode(code));
}

function hasRecordData(record) {
  if (!record) return false;
  const data = record.data && typeof record.data === 'object' && !Array.isArray(record.data)
    ? record.data
    : record;
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
  return Object.keys(data).length > 0;
}

function isDashboardDelivered(patient, pncVisits, records, newbornEntries, immediateEntries) {
  const bucket = statusBucket(patient);
  if (bucket === 'pnc' || bucket === 'birthed') return true;
  if ((pncVisits || []).length > 0) return true;
  const hasNewborn = (newbornEntries || []).some((entry) => hasRecordData(entry.data || entry));
  const hasImmediate = (immediateEntries || []).some((entry) => hasRecordData(entry.data || entry));
  if (hasNewborn || hasImmediate) return true;
  const birth = records.get('birthRecord') || {};
  return Boolean(
    birth.deliveryDate ||
    birth.birthDate ||
    birth.birthTime ||
    birth.deliveredDateTime ||
    birth.deliveryDateTime
  );
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

function recordCreatorId(data) {
  return textFromFields(data, [
    'createdBy',
    'created_by',
    'recordedBy',
    'recorded_by',
    'midwifeId',
    'midwife_id',
  ]);
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
        name: user.name || user.midwife_name || user.displayName || user.email || doc.id,
        email: user.email || '',
        township: user.township || '',
        region: user.region || '',
        facilityCode: String(user.facility_code || '').trim(),
      });
    }
  });

  if (!midwives.size) throw new Error('No Midwife-role users were found.');

  [...midwives.keys()].forEach((id) => {
    if (!isPilotFacilityCode(midwives.get(id).facilityCode)) midwives.delete(id);
  });
  if (!midwives.size) {
    throw new Error('No Midwife-role users were found for Pyinmana or Tatkon facilities.');
  }

  console.log(`Loading patients created by ${midwives.size} Pyinmana/Tatkon Midwife accounts...`);
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
  const linkedBabyIds = indexLinkedBabyIds(patients, patientsSnapshot.docs);
  const newbornPatientIds = new Set(selectedPatientIds);
  linkedBabyIds.forEach((babyIds) => {
    babyIds.forEach((id) => newbornPatientIds.add(id));
  });
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
    labourCare,
    kmcActions,
  ] = await Promise.all([
    loadCollectionGroup(db, 'antenatal_visits', selectedPatientIds),
    loadCollectionGroup(db, 'postpartum_visits', selectedPatientIds),
    loadCollectionGroup(db, 'testRecords', selectedPatientIds),
    loadCollectionGroup(db, 'test_records', selectedPatientIds),
    loadCollectionGroup(db, 'lab_tests', selectedPatientIds),
    loadCollectionGroup(db, 'records', selectedPatientIds),
    loadCollectionGroup(db, 'newborn_care', newbornPatientIds),
    loadCollectionGroup(db, 'immediate_newborn_care', newbornPatientIds),
    loadCollectionGroup(db, 'labour_care', selectedPatientIds),
    loadCollectionGroup(db, 'kmc_actions', newbornPatientIds),
  ]);

  console.log('Loading active Joint Care links by Midwife account...');
  const jointCareCounts = new Map();
  const jointCarePatientIds = new Map();
  await Promise.all([...midwives.keys()].map(async (midwifeId) => {
    const snapshot = await db.collection('joint_care_links')
      .doc(midwifeId)
      .collection('patients')
      .where('status', '==', 'active')
      .get();
    jointCareCounts.set(midwifeId, snapshot.size);
    jointCarePatientIds.set(midwifeId, new Set(snapshot.docs.map((doc) => doc.id)));
  }));

  return {
    midwives,
    patients,
    antenatalVisits,
    postpartumVisits,
    tests: mergePatientMaps(testRecords, testRecordsLegacy, labTests),
    records,
    newbornCare,
    immediateNewbornCare,
    labourCare,
    kmcActions,
    jointCareCounts,
    jointCarePatientIds,
    linkedBabyIds,
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

function hasDeliveryNotes(records) {
  return records.has('deliveryNotes');
}

function hasSecondStage(records) {
  const summary = records.get('summary') || {};
  const secondStage = records.get('secondStage') || {};
  return Boolean(
    textFromFields(summary, ['secondStageTime', 'secondStage_Time']) ||
    textFromFields(secondStage, ['secondStageStartTime', 'secondStageTime']),
  );
}

function yangonDayOrdinal(value) {
  const date = asDate(value);
  if (!date) return null;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Yangon',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return Math.floor(Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
  ) / 86400000);
}

function deliveryDateFromNotes(notes) {
  const details = (notes && notes.deliveryDetails) || {};
  const direct = dateFromFields(details, [
    'deliveryDate',
    'delivery_date',
    'birthTime',
    'birth_time',
  ]);
  if (direct) return direct;
  const babyDates = (Array.isArray(details.babies) ? details.babies : [])
    .map((baby) => dateFromFields(baby, [
      'birthTime',
      'birth_time',
      'birthDate',
      'birth_date',
    ]))
    .filter(Boolean)
    .sort((left, right) => left.getTime() - right.getTime());
  return babyDates[0] || null;
}

function firstPncDays(pncVisits, records) {
  if (!pncVisits.length) return null;
  const first = sortedByDate(
    pncVisits,
    ['visitDate', 'visit_date', 'timestamp', 'createdAt', 'created_at', 'date'],
  )[0].data;
  let explicit = null;
  [
    'postpartumDays',
    'postpartum_days',
    'daysPostpartum',
    'days_since_delivery',
  ].some((field) => {
    const value = Number.parseFloat(first && first[field]);
    if (Number.isFinite(value) && value >= 0) {
      explicit = value;
      return true;
    }
    return false;
  });
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
    deliveryDate = deliveryDateFromNotes(
      records.get('deliveryNotes') || records.get('thirdStage') || {},
    );
  }
  if (!deliveryDate) {
    deliveryDate = dateFromFields(records.get('birthRecord') || {}, [
      'deliveryDate',
      'birthDate',
      'birthTime',
    ]);
  }
  if (!visitDate || !deliveryDate) return null;
  const visitDay = yangonDayOrdinal(visitDate);
  const deliveryDay = yangonDayOrdinal(deliveryDate);
  if (visitDay === null || deliveryDay === null) return null;
  const days = visitDay - deliveryDay;
  return days >= 0 ? days : null;
}

function pncTimingBucket(days) {
  if (days === null || days === undefined || !Number.isFinite(Number(days))) {
    return 'pncTimingUnknown';
  }
  if (Number(days) <= 2) return 'pnc48h';
  if (Number(days) <= 42) return 'pnc42d';
  return 'pncAfter42d';
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

function canonicalNewbornBabies(newbornEntries) {
  const byIndex = new Map();
  const mergeBaby = (index, base, baby) => {
    const key = Number.parseInt(
      baby && (baby.babyIndex || baby.baby_index),
      10,
    ) || index || 1;
    byIndex.set(key, {
      ...(byIndex.get(key) || {}),
      ...(base || {}),
      ...(baby || {}),
      babyIndex: key,
    });
  };

  (newbornEntries || []).forEach((entry) => {
    const data = entry.data || {};
    if (Array.isArray(data.babies) && data.babies.length) {
      data.babies.forEach((baby, index) => mergeBaby(index + 1, data, baby));
    } else {
      mergeBaby(
        Number.parseInt(data.babyIndex || data.baby_index, 10) || 1,
        data,
        null,
      );
    }
    if (Array.isArray(data.kmc_babies)) {
      data.kmc_babies.forEach((baby, index) => mergeBaby(index + 1, {}, baby));
    }
  });
  return [...byIndex.values()].sort((a, b) => a.babyIndex - b.babyIndex);
}

function babyIsPretermOrLbw(patient, baby, latestAnc) {
  const edd = asDate(
    patient.edd || patient.EDD || patient.maternal_edd ||
    patient.manualEdd || patient.manual_edd ||
    latestAnc.edd || latestAnc.manualEdd || latestAnc.manual_edd,
  );
  const weight = numberFromFields(baby, [
    'birthWeightGram',
    'birth_weight_gram',
    'body_weight_gram',
  ]);
  if (weight !== null && weight < LOW_BIRTH_WEIGHT_GRAM) return true;
  const birthDate = dateFromFields(baby, [
    'birthTime',
    'birth_time',
    'birthDate',
    'birth_date',
  ]);
  if (!birthDate || !edd) return false;
  return Math.floor((edd.getTime() - birthDate.getTime()) / 86400000) >=
    PRETERM_DAYS_BEFORE_EDD;
}

function newbornIsPretermOrLbw(patient, babies, latestAnc) {
  return babies.some((baby) => babyIsPretermOrLbw(patient, baby, latestAnc));
}

function isKmcYes(value) {
  if (value === true || value === 1) return true;
  return ['yes', 'y', 'true', '1'].includes(String(value || '').trim().toLowerCase());
}

function kmcFlag(record) {
  if (!record || typeof record !== 'object') return record;
  return record.kmc_selected != null ? record.kmc_selected : record.kmcSelected;
}

function extractKmcDecisionForBaby(entry, babyIndex) {
  const target = Number.parseInt(babyIndex, 10) || 1;
  const data = (entry && (entry.data || entry)) || {};
  if (Array.isArray(data.kmc_babies) && data.kmc_babies.length) {
    const baby = data.kmc_babies.find((item, index) => {
      const indexValue = Number.parseInt(item && (item.babyIndex || item.baby_index), 10) ||
        index + 1;
      return indexValue === target && kmcFlag(item) != null && kmcFlag(item) !== '';
    });
    return baby || null;
  }
  if (Array.isArray(data.babies) && data.babies.length) {
    const baby = data.babies.find((item, index) => {
      const indexValue = Number.parseInt(item && (item.babyIndex || item.baby_index), 10) ||
        index + 1;
      return indexValue === target && kmcFlag(item) != null && kmcFlag(item) !== '';
    });
    if (baby) return baby;
  }
  if (target === 1 && kmcFlag(data) != null && kmcFlag(data) !== '') return data;
  return null;
}

function newbornHasKmcYes(newbornEntries, antenatalVisits) {
  const entries = [...(newbornEntries || []), ...(antenatalVisits || [])];
  return entries.some((entry) => {
    const data = entry.data || {};
    if (isKmcYes(kmcFlag(data))) return true;
    const babyArrays = [data.babies, data.kmc_babies];
    return babyArrays.some((babies) => Array.isArray(babies) && babies.some(
      (baby) => isKmcYes(kmcFlag(baby)),
    ));
  });
}

function babyHasKmcYes(newbornEntries, babyIndex) {
  return (newbornEntries || []).some((entry) =>
    isKmcYes(kmcFlag(extractKmcDecisionForBaby(entry, babyIndex))),
  );
}

function linkedNewbornPatientIds(patientId, patientData, patients) {
  const ids = new Set();
  const data = patientData || {};
  const type = normalizePatientType(data);
  if (type === 'baby') {
    const motherId = String(data.mother_patient_id || data.motherPatientId || '').trim();
    if (motherId) ids.add(motherId);
    return [...ids];
  }
  const listed = data.baby_patient_ids || data.babyPatientIds || [];
  if (Array.isArray(listed)) {
    listed.forEach((id) => {
      if (id) ids.add(String(id));
    });
  }
  ids.add(`${patientId}_baby_1`);
  ids.add(`${patientId}_baby_2`);
  if (patients) {
    patients.forEach((patient, id) => {
      if (id === patientId) return;
      const linkedMother = String(
        (patient.data || {}).mother_patient_id ||
        (patient.data || {}).motherPatientId ||
        '',
      ).trim();
      if (linkedMother === patientId) ids.add(id);
    });
  }
  ids.delete(patientId);
  return [...ids];
}

function indexLinkedBabyIds(patients, allPatientDocs) {
  const byMother = new Map();
  const add = (motherId, babyId) => {
    if (!motherId || !babyId || motherId === babyId) return;
    if (!byMother.has(motherId)) byMother.set(motherId, new Set());
    byMother.get(motherId).add(String(babyId));
  };
  patients.forEach((patient, id) => {
    linkedNewbornPatientIds(id, patient.data, patients).forEach((linkedId) => {
      if (normalizePatientType(patient.data) === 'baby') add(linkedId, id);
      else add(id, linkedId);
    });
  });
  (allPatientDocs || []).forEach((doc) => {
    const data = (doc.data && doc.data()) || doc.data || {};
    const motherId = String(data.mother_patient_id || data.motherPatientId || '').trim();
    if (motherId && patients.has(motherId)) add(motherId, doc.id);
  });
  return byMother;
}

function collectNewbornEntries(data, patientId) {
  const patient = data.patients.get(patientId);
  const ids = new Set([
    patientId,
    ...linkedNewbornPatientIds(patientId, patient && patient.data, data.patients),
  ]);
  const extra = data.linkedBabyIds && data.linkedBabyIds.get(patientId);
  if (extra) extra.forEach((id) => ids.add(id));
  const entries = [];
  ids.forEach((id) => {
    entries.push(...(data.newbornCare.get(id) || []));
    entries.push(...(data.immediateNewbornCare.get(id) || []));
  });
  return entries;
}

function collectKmcActions(data, patientId) {
  const patient = data.patients.get(patientId);
  const ids = new Set([
    patientId,
    ...linkedNewbornPatientIds(patientId, patient && patient.data, data.patients),
  ]);
  const extra = data.linkedBabyIds && data.linkedBabyIds.get(patientId);
  if (extra) extra.forEach((id) => ids.add(id));
  const actions = [];
  const actionMap = data.kmcActions || new Map();
  ids.forEach((id) => {
    actions.push(...(actionMap.get(id) || []));
  });
  return actions;
}

function asUtcDateOnly(value) {
  if (!value) return null;
  if (typeof value.toDate === 'function') {
    const date = value.toDate();
    if (Number.isNaN(date.getTime())) return null;
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  }
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  }
  const match = String(value).trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    return new Date(Date.UTC(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3]),
    ));
  }
  const parsed = asDate(value);
  if (!parsed) return null;
  return new Date(Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()));
}

function addCalendarMonthsUtc(value, months) {
  const date = asUtcDateOnly(value);
  if (!date) return null;
  const day = date.getUTCDate();
  const result = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
  const lastDay = new Date(Date.UTC(
    result.getUTCFullYear(),
    result.getUTCMonth() + 1,
    0,
  )).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}

function kmcExtractAsOf(data) {
  return asUtcDateOnly((data && data.asOf) || EXTRACT_DATE_ISO);
}

function isPotentialKmcFlag(value) {
  return value === true || ['yes', 'y', 'true', '1'].includes(String(value || '').trim().toLowerCase());
}

function babyHasPotentialKmc(baby, newbornEntries, babyIndex) {
  if (isPotentialKmcFlag(baby && baby.potential_kmc)) return true;
  const target = Number.parseInt(babyIndex || (baby && baby.babyIndex), 10) || 1;
  return (newbornEntries || []).some((entry) => {
    const data = entry.data || {};
    if (Array.isArray(data.kmc_babies) && data.kmc_babies.length) {
      return data.kmc_babies.some((item, index) => {
        const indexValue = Number.parseInt(item && (item.babyIndex || item.baby_index), 10) ||
          index + 1;
        return indexValue === target && isPotentialKmcFlag(item.potential_kmc);
      });
    }
    return target === 1 && isPotentialKmcFlag(data.potential_kmc);
  });
}

function babyHasKmcCompletion(actions, babyIndex) {
  const target = Number.parseInt(babyIndex, 10) || 1;
  return (actions || []).some((entry) => {
    const data = entry.data || entry || {};
    const type = String(data.type || '').toLowerCase();
    if (type !== 'kmc_resolved' && type !== 'resolved') return false;
    const index = Number.parseInt(data.babyIndex || data.baby_index, 10) || 1;
    return index === target;
  });
}

function babyBirthDate(baby) {
  return dateFromFields(baby || {}, [
    'birthTime',
    'birth_time',
    'birthDate',
    'birth_date',
  ]);
}

function babyIsTotalKmcPatient(patient, baby, latestAnc, newbornEntries, actions, asOf) {
  if (babyHasKmcYes(newbornEntries, baby.babyIndex)) return true;
  const eligible = babyIsPretermOrLbw(patient, baby, latestAnc) ||
    babyHasPotentialKmc(baby, newbornEntries, baby.babyIndex);
  if (!eligible) return false;
  if (babyHasKmcCompletion(actions, baby.babyIndex)) return true;
  const autoDate = addCalendarMonthsUtc(babyBirthDate(baby), 2);
  const extractDate = asUtcDateOnly(asOf) || kmcExtractAsOf();
  return !!(autoDate && extractDate && extractDate.getTime() >= autoDate.getTime());
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

function serviceEventDate(type, data) {
  const fieldsByType = {
    anc: ['visitDate', 'visit_date', 'serviceDate', 'service_date'],
    pnc: ['visitDate', 'visit_date', 'serviceDate', 'service_date'],
    newborn: [
      'visitDate',
      'visit_date',
      'serviceDate',
      'birth_time',
      'birthDate',
      'birth_date',
    ],
    labour: [
      'visitDate',
      'visit_date',
      'serviceDate',
      'labourDate',
      'labour_date',
      'admissionDate',
      'deliveryDate',
      'delivery_date',
      'deliveredDateTime',
    ],
  };
  return dateFromFields(data, [
    ...(fieldsByType[type] || []),
    'createdAt',
    'timestamp',
    'created_at',
  ]);
}

function serviceEventSortKey(event) {
  const date = serviceEventDate(event.type, event.data);
  if (!date) return null;
  return [
    date.toISOString().slice(0, 10),
    event.type || '',
    event.id || '',
  ].join('|');
}

function aggregateAccountActivity(data) {
  const result = new Map();
  const ensure = (accountId) => {
    if (!result.has(accountId)) result.set(accountId, emptyAccountActivity());
    return result.get(accountId);
  };
  data.midwives.forEach((_, accountId) => {
    const metrics = ensure(accountId);
    metrics.activeJointCare = data.jointCareCounts.get(accountId) || 0;
  });

  data.patients.forEach((patient) => {
    const metrics = ensure(patient.creatorId);
    metrics.ownedRegistered++;
    if (normalizePatientType(patient.data) === 'baby') metrics.ownedBabies++;
    else metrics.ownedMothers++;
  });

  const eventsByAccountPatient = new Map();
  const addEvents = (map, type) => {
    map.forEach((entries, patientId) => {
      const patient = data.patients.get(patientId);
      if (!patient || normalizePatientType(patient.data) === 'baby') return;
      entries.forEach((entry) => {
        let accountId = recordCreatorId(entry.data);
        let usedFallback = false;
        if (!data.midwives.has(accountId)) {
          accountId = patient.creatorId;
          usedFallback = true;
        }
        const key = `${accountId}|${patientId}`;
        if (!eventsByAccountPatient.has(key)) eventsByAccountPatient.set(key, []);
        eventsByAccountPatient.get(key).push({
          ...entry,
          type,
          accountId,
          patientId,
          usedFallback,
        });
      });
    });
  };
  addEvents(data.antenatalVisits, 'anc');
  addEvents(data.postpartumVisits, 'pnc');
  addEvents(data.newbornCare, 'newborn');
  addEvents(data.labourCare, 'labour');

  eventsByAccountPatient.forEach((events, key) => {
    const accountId = key.split('|')[0];
    const metrics = ensure(accountId);
    const datedKeys = events.map(serviceEventSortKey).filter(Boolean).sort();
    const earliestKey = datedKeys[0] || null;
    events.forEach((event) => {
      if (!['anc', 'pnc', 'newborn'].includes(event.type)) return;
      const prefix = event.type;
      const eventKey = serviceEventSortKey(event);
      const isNew = Boolean(earliestKey && eventKey === earliestKey);
      metrics[`${prefix}Services`]++;
      metrics[`${prefix}${isNew ? 'New' : 'Old'}`]++;
      if (event.usedFallback) metrics.fallbackAttributedServices++;
    });
  });

  data.records.forEach((entries, patientId) => {
    const patient = data.patients.get(patientId);
    if (!patient) return;
    entries.filter((entry) => entry.id === 'transferRecord').forEach((entry) => {
      let accountId = recordCreatorId(entry.data);
      if (!data.midwives.has(accountId)) accountId = patient.creatorId;
      ensure(accountId).transfersRecorded++;
    });
  });

  const canonicalIds = canonicalNewbornPatientIds(data.patients);
  data.patients.forEach((patient, patientId) => {
    if (!canonicalIds.has(patientId)) return;
    const linkedNewborn = collectNewbornEntries(data, patientId);
    if (!linkedNewborn.length) return;
    const latestAnc = getLatestAncData(data.antenatalVisits.get(patientId) || []);
    const babies = canonicalNewbornBabies(linkedNewborn);
    const actions = collectKmcActions(data, patientId);
    const asOf = kmcExtractAsOf(data);
    const participatingAccounts = new Set();
    linkedNewborn.forEach((entry) => {
      const creatorId = recordCreatorId(entry.data);
      participatingAccounts.add(
        data.midwives.has(creatorId) ? creatorId : patient.creatorId,
      );
    });
    participatingAccounts.forEach((accountId) => {
      const metrics = ensure(accountId);
      babies.forEach((baby) => {
        if (babyIsPretermOrLbw(patient.data, baby, latestAnc)) {
          metrics.pretermLbwBabies++;
        }
        if (babyIsTotalKmcPatient(
          patient.data,
          baby,
          latestAnc,
          linkedNewborn,
          actions,
          asOf,
        )) metrics.kmcYesBabies++;
      });
    });
  });
  return result;
}

function aggregate(data) {
  const metricsByFacility = new Map();
  const ensureFacility = (facilityCode) => {
    if (!isPilotFacilityCode(facilityCode)) return null;
    if (!metricsByFacility.has(facilityCode)) metricsByFacility.set(facilityCode, emptyMetrics());
    return metricsByFacility.get(facilityCode);
  };

  FacilityConfig.getFacilities()
    .filter((facility) => PILOT_TOWNSHIPS.includes(facility.township))
    .forEach((facility) => ensureFacility(facility.code));
  const canonicalNbcIds = canonicalNewbornPatientIds(data.patients);

  data.patients.forEach((patient, patientId) => {
    const profile = patient.data;
    const facility = ensureFacility(patient.facilityCode);
    if (!facility) return;
    const anc = data.antenatalVisits.get(patientId) || [];
    const pnc = data.postpartumVisits.get(patientId) || [];
    const tests = data.tests.get(patientId) || [];
    const records = recordsById(data.records.get(patientId) || []);
    const newborn = data.newbornCare.get(patientId) || [];
    const immediate = data.immediateNewbornCare.get(patientId) || [];
    const allNewborn = [...newborn, ...immediate];
    const linkedNewborn = collectNewbornEntries(data, patientId);
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

      if (hasDeliveryNotes(records)) facility.deliveries++;
      if (isDashboardDelivered(profile, pnc, records, newborn, immediate)) {
        facility.dashboardDeliveries++;
      }
      if (hasSecondStage(records)) facility.lcgSecondStage++;

      if (pnc.length) {
        facility.pncHeadcount++;
        facility.pncServices += pnc.length;
        const days = firstPncDays(pnc, records);
        facility[pncTimingBucket(days)]++;
      }
    }

    if (canonicalNbcIds.has(patientId) && allNewborn.length) {
      facility.nbcHeadcount++;
      facility.nbcServices += allNewborn.length;
    }
    if (canonicalNbcIds.has(patientId) && linkedNewborn.length) {
      const babies = canonicalNewbornBabies(linkedNewborn);
      const latestAnc = getLatestAncData(anc);
      const actions = collectKmcActions(data, patientId);
      const asOf = kmcExtractAsOf(data);
      facility.pretermLbw += babies.filter(
        (baby) => babyIsPretermOrLbw(profile, baby, latestAnc),
      ).length;
      facility.kmc += babies.filter(
        (baby) => babyIsTotalKmcPatient(
          profile,
          baby,
          latestAnc,
          linkedNewborn,
          actions,
          asOf,
        ),
      ).length;
    }
    if (canonicalNbcIds.has(patientId) && immediate.length) {
      facility.immediateNbcHeadcount++;
    }
  });

  const jointCareByFacility = new Map();
  data.midwives.forEach((account, accountId) => {
    if (!isPilotFacilityCode(account.facilityCode)) return;
    if (!jointCareByFacility.has(account.facilityCode)) {
      jointCareByFacility.set(account.facilityCode, new Set());
    }
    const patientIds = data.jointCarePatientIds.get(accountId) || new Set();
    patientIds.forEach((patientId) => jointCareByFacility.get(account.facilityCode).add(patientId));
  });
  jointCareByFacility.forEach((patientIds, facilityCode) => {
    const facility = ensureFacility(facilityCode);
    if (facility) facility.jointCare = patientIds.size;
  });

  data.records.forEach((entries, patientId) => {
    const patient = data.patients.get(patientId);
    if (!patient || !entries.some((entry) => entry.id === 'transferRecord')) return;
    const transfer = entries.find((entry) => entry.id === 'transferRecord');
    const creatorId = recordCreatorId(transfer.data);
    const account = data.midwives.get(creatorId) || data.midwives.get(patient.creatorId);
    const facility = ensureFacility(account ? account.facilityCode : patient.facilityCode);
    if (facility) facility.transfers++;
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
  return rows;
}

function buildAccountRows(data, activityByAccount) {
  const facilities = new Map(
    FacilityConfig.getFacilities().map((facility) => [facility.code, facility]),
  );
  return [...data.midwives.values()]
    .filter((account) => isPilotFacilityCode(account.facilityCode))
    .map((account) => {
    const facility = facilities.get(account.facilityCode) || {};
    return {
      accountId: account.id,
      accountName: account.name,
      email: account.email,
      township: facility.township || account.township || '',
      region: account.region || facility.region || '',
      facilityCode: account.facilityCode,
      facilityName: facility.name_en || `Unknown facility (${account.facilityCode || 'missing'})`,
      metrics: activityByAccount.get(account.id) || emptyAccountActivity(),
    };
  }).sort((left, right) => (
    left.township.localeCompare(right.township) ||
    left.facilityName.localeCompare(right.facilityName) ||
    left.accountName.localeCompare(right.accountName)
  ));
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
    {
      label: 'PNC within 42 days (including 48 hours) among PNC clients',
      value: pct(metrics.pnc48h + metrics.pnc42d, metrics.pncHeadcount),
    },
    { label: 'LCG 2nd stage among delivery notes', value: pct(metrics.lcgSecondStage, metrics.deliveries) },
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

function createWorkbookTemplate(extractedAt) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Application data by facility');
  worksheet.getCell('A1').value =
    'Pyinmana and Tatkon only. Total Registered = mothers + baby patient records. Midwife-created patients only. ' +
    `PNC timing columns are mutually exclusive headcounts and reconcile to Total PNC Headcount. ` +
    `Dashboard deliveries uses the Dashboard Total Deliveries rule. Extract date: ${extractedAt}.`;
  worksheet.mergeCells('A1:AD1');
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
    M2: 'Total Delivery Notes',
    N2: 'Total Dashboard Deliveries',
    O2: 'LCG application (2nd stage)',
    P2: 'Total PNC Headcount',
    Q2: 'Total PNC services received',
    R2: 'PNC first-visit timing by headcount',
    V2: 'Total NBC Headcount',
    W2: 'Total Immediate NBC Headcount',
    X2: 'Total NBC services received',
    Y2: 'Preterm/LBW',
    Z2: 'Total KMC',
    AA2: 'Total Transferred Patients',
    AB2: 'Total Patients Joint Cared',
    AC2: 'Mothers',
    AD2: 'Babies',
    G3: 'Early ANC',
    H3: 'ANC 4+ visit',
    I3: 'ANC 8+ visit',
    J3: 'Mild',
    K3: 'Sever',
    R3: 'Within 48 hours',
    S3: 'After 48 hours through day 42',
    T3: 'After 42 days',
    U3: 'Timing unavailable',
  };
  Object.entries(headers).forEach(([cell, value]) => {
    worksheet.getCell(cell).value = value;
  });

  [
    'A2:A3', 'B2:B3', 'C2:C3', 'D2:D3', 'E2:E3', 'F2:F3',
    'G2:I2', 'J2:K2', 'L2:L3', 'M2:M3', 'N2:N3', 'O2:O3',
    'P2:P3', 'Q2:Q3', 'R2:U2', 'V2:V3', 'W2:W3', 'X2:X3', 'Y2:Y3',
    'Z2:Z3', 'AA2:AA3', 'AB2:AB3', 'AC2:AC3', 'AD2:AD3',
  ].forEach((range) => worksheet.mergeCells(range));

  const widths = [
    4.3, 12.1, 24, 12.7, 15.3, 20.9, 10.6, 11.7, 11.9, 6.9, 6.9,
    7.3, 13.4, 18, 15.1, 13.4, 17.1, 13, 19, 14, 17, 15, 20, 17, 13, 9,
    18, 19, 10, 10,
  ];
  widths.forEach((width, index) => { worksheet.getColumn(index + 1).width = width; });
  worksheet.getRow(2).height = 32;
  worksheet.getRow(3).height = 35.25;

  for (let row = 2; row <= 3; row++) {
    for (let column = 1; column <= 30; column++) {
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
    'Anemia mild', 'Anemia severe', 'HRT', 'Delivery notes',
    'Dashboard deliveries', 'LCG 2nd stage',
    'PNC headcount', 'PNC services', 'PNC within 48h headcount',
    'PNC >48h through day 42 headcount', 'PNC after day 42 headcount',
    'PNC timing unavailable headcount', 'NBC headcount', 'Immediate NBC headcount',
    'NBC services', 'Preterm/LBW', 'Total KMC', 'Transferred patients', 'Joint Care patients',
    'Early ANC %', 'ANC 4+ %', 'PNC 48h %', 'PNC within 42d %', 'LCG 2nd stage %',
  ];
  writeHeaderRow(sheet, 1, headers);
  headers.forEach((_, index) => {
    sheet.getColumn(index + 1).width = index === 2 ? 36 : (index < 3 ? 16 : 16);
  });

  rows.forEach((row, index) => {
    const m = row.metrics;
    const values = [
      row.township, row.facilityCode, row.facilityName, m.totalRegistered, m.mothers, m.babies,
      m.ancHeadcount, m.ancServices, m.earlyAnc, m.anc4Plus, m.anc8Plus,
      m.anemiaMild, m.anemiaSevere, m.hrt, m.deliveries,
      m.dashboardDeliveries, m.lcgSecondStage,
      m.pncHeadcount, m.pncServices, m.pnc48h, m.pnc42d, m.pncAfter42d,
      m.pncTimingUnknown, m.nbcHeadcount, m.immediateNbcHeadcount, m.nbcServices,
      m.pretermLbw, m.kmc, m.transfers, m.jointCare,
      pct(m.earlyAnc, m.ancHeadcount), pct(m.anc4Plus, m.ancHeadcount),
      pct(m.pnc48h, m.pncHeadcount),
      pct(m.pnc48h + m.pnc42d, m.pncHeadcount),
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
    'ANC headcount', 'Early ANC', 'ANC 4+', 'ANC 8+', 'HRT', 'Delivery notes',
    'Dashboard deliveries', 'LCG 2nd stage', 'PNC headcount', 'PNC services', 'PNC within 48h',
    'PNC >48h through day 42', 'PNC after day 42', 'PNC timing unavailable',
    'NBC headcount', 'Immediate NBC headcount', 'Preterm/LBW', 'Total KMC',
    'Transferred patients', 'Joint Care patients',
    'Early ANC %', 'ANC 4+ %', 'PNC 48h %', 'PNC within 42d %', 'LCG %',
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
      metrics.deliveries, metrics.dashboardDeliveries, metrics.lcgSecondStage,
      metrics.pncHeadcount, metrics.pncServices,
      metrics.pnc48h, metrics.pnc42d, metrics.pncAfter42d, metrics.pncTimingUnknown,
      metrics.nbcHeadcount, metrics.immediateNbcHeadcount, metrics.pretermLbw, metrics.kmc,
      metrics.transfers, metrics.jointCare,
      pct(metrics.earlyAnc, metrics.ancHeadcount), pct(metrics.anc4Plus, metrics.ancHeadcount),
      pct(metrics.pnc48h, metrics.pncHeadcount),
      pct(metrics.pnc48h + metrics.pnc42d, metrics.pncHeadcount),
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
    overall.dashboardDeliveries, overall.lcgSecondStage, overall.pncHeadcount,
    overall.pncServices, overall.pnc48h,
    overall.pnc42d, overall.pncAfter42d, overall.pncTimingUnknown, overall.nbcHeadcount,
    overall.immediateNbcHeadcount, overall.pretermLbw, overall.kmc, overall.transfers,
    overall.jointCare,
    pct(overall.earlyAnc, overall.ancHeadcount), pct(overall.anc4Plus, overall.ancHeadcount),
    pct(overall.pnc48h, overall.pncHeadcount),
    pct(overall.pnc48h + overall.pnc42d, overall.pncHeadcount),
    pct(overall.lcgSecondStage, overall.deliveries),
  ];
  totalValues.forEach((value, offset) => {
    const cell = sheet.getCell(rowNumber, offset + 1);
    cell.value = value;
    styleHeaderCell(cell);
  });
}

function addDefinitionsSheet(workbook) {
  const sheet = workbook.addWorksheet('Definitions');
  writeHeaderRow(sheet, 1, ['Indicator', 'Definition']);
  sheet.getColumn(1).width = 34;
  sheet.getColumn(2).width = 100;
  const definitions = [
    ['Export scope', 'Pyinmana and Tatkon facilities only. Unmapped, Other, and facilities outside these two townships are excluded.'],
    ['Total Delivery Notes', 'Unique mother patients with a records/deliveryNotes document.'],
    ['Total Dashboard Deliveries', 'Matches the current Dashboard rule: a mother is counted when her status is postnatal/delivered, or she has a PNC visit, newborn/immediate newborn record, or dated birth record.'],
    ['Total PNC headcount', 'Unique mother patients with at least one PNC visit.'],
    ['Total PNC services', 'Number of PNC visit records. One patient can contribute multiple services.'],
    ['PNC within 48 hours', 'Headcount whose first PNC visit was 0–2 days after delivery.'],
    ['PNC after 48 hours through day 42', 'Headcount whose first PNC visit was more than 2 days and no more than 42 days after delivery.'],
    ['PNC after 42 days', 'Headcount whose first PNC visit was more than 42 days after delivery.'],
    ['PNC timing unavailable', 'Headcount with a PNC visit but insufficient delivery/visit timing data for classification.'],
    ['PNC reconciliation', 'The four mutually exclusive PNC timing headcounts sum to Total PNC headcount.'],
    ['Total Immediate NBC headcount', 'Unique canonical mother/baby care cases with at least one immediate_newborn_care record; twins in one case count once.'],
    ['Total Transferred Patients', 'Unique patients with a current records/transferRecord document, attributed to the recording account’s facility. The data model stores one current transfer record per patient.'],
    ['Total Patients Joint Cared', 'Distinct patients with active Joint Care links, deduplicated within each facility. Account activity shows active links for each account.'],
    ['Total KMC', 'Same as the KMC tracker “Total KMC patients” card: a baby counts if any linked newborn visit recorded KMC Yes, or the baby is completed. Completion includes an explicit KMC complete action or automatic completion two calendar months after birth for LBW/preterm or potential-KMC babies. Active and completed babies are both included. This is not limited to current follow-up.'],
  ];
  definitions.forEach((values, index) => {
    values.forEach((value, offset) => {
      const cell = sheet.getCell(index + 2, offset + 1);
      cell.value = value;
      styleBodyCell(cell, { horizontal: 'left' });
    });
    sheet.getRow(index + 2).height = 34;
  });
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
}

function addAccountActivitySheet(workbook, accountRows) {
  const sheet = workbook.addWorksheet('Account activity', {
    properties: { tabColor: { argb: 'FF2D8C6B' } },
  });
  const headers = [
    'Township',
    'Facility code',
    'Health facility',
    'Account name',
    'Account email',
    'Account ID',
    'Owned registered',
    'Owned mothers',
    'Owned babies',
    'Active Joint Care patients',
    'ANC services',
    'ANC New',
    'ANC Old',
    'PNC services',
    'PNC New',
    'PNC Old',
    'Newborn services',
    'Newborn New',
    'Newborn Old',
    'Transfers recorded',
    'LBW/Preterm babies',
    'Total KMC babies',
    'Fallback-attributed services',
  ];
  writeHeaderRow(sheet, 1, headers);
  const widths = [
    15, 12, 34, 24, 28, 32, 15, 14, 13, 20, 13, 11, 11, 13, 11, 11,
    16, 13, 13, 16, 18, 15, 22,
  ];
  widths.forEach((width, index) => { sheet.getColumn(index + 1).width = width; });

  accountRows.forEach((row, index) => {
    const m = row.metrics;
    const values = [
      row.township,
      row.facilityCode,
      row.facilityName,
      row.accountName,
      row.email,
      row.accountId,
      m.ownedRegistered,
      m.ownedMothers,
      m.ownedBabies,
      m.activeJointCare,
      m.ancServices,
      m.ancNew,
      m.ancOld,
      m.pncServices,
      m.pncNew,
      m.pncOld,
      m.newbornServices,
      m.newbornNew,
      m.newbornOld,
      m.transfersRecorded,
      m.pretermLbwBabies,
      m.kmcYesBabies,
      m.fallbackAttributedServices,
    ];
    values.forEach((value, offset) => {
      const cell = sheet.getCell(index + 2, offset + 1);
      cell.value = value;
      styleBodyCell(cell, { horizontal: offset < 6 ? 'left' : 'center' });
    });
  });
  const totalRow = accountRows.length + 2;
  const totals = emptyAccountActivity();
  accountRows.forEach((row) => {
    ACCOUNT_ACTIVITY_KEYS.forEach((key) => {
      totals[key] += row.metrics[key] || 0;
    });
  });
  const totalValues = [
    'All accounts',
    '',
    '',
    '',
    '',
    '',
    totals.ownedRegistered,
    totals.ownedMothers,
    totals.ownedBabies,
    totals.activeJointCare,
    totals.ancServices,
    totals.ancNew,
    totals.ancOld,
    totals.pncServices,
    totals.pncNew,
    totals.pncOld,
    totals.newbornServices,
    totals.newbornNew,
    totals.newbornOld,
    totals.transfersRecorded,
    totals.pretermLbwBabies,
    totals.kmcYesBabies,
    totals.fallbackAttributedServices,
  ];
  totalValues.forEach((value, offset) => {
    const cell = sheet.getCell(totalRow, offset + 1);
    cell.value = value;
    styleHeaderCell(cell);
  });
  sheet.views = [{ state: 'frozen', ySplit: 1, xSplit: 4 }];
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: accountRows.length + 1, column: headers.length },
  };
  const noteRow = totalRow + 2;
  sheet.getCell(`A${noteRow}`).value =
    'New/Old applies to service events, matching Midwife Report: the first dated clinical service ' +
    'for that account and patient is New; later services are Old. Headcount remains unique clients. ' +
    'Fallback-attributed services had no recognized record creator and were assigned to the patient owner.';
  sheet.mergeCells(
    noteRow,
    1,
    noteRow + 1,
    headers.length,
  );
  sheet.getCell(`A${noteRow}`).alignment = {
    vertical: 'middle',
    horizontal: 'left',
    wrapText: true,
  };
  sheet.getCell(`A${noteRow}`).font = {
    italic: true,
    size: 9,
    color: { argb: 'FF334155' },
  };
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
    ['Dashboard deliveries', totals.dashboardDeliveries],
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
      totals.pnc48h, totals.pnc48h + totals.pnc42d, totals.lcgSecondStage,
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

async function writeWorkbook(workbookPath, rows, accountRows, extras) {
  const workbook = createWorkbookTemplate(extras.extractedAt);
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
  worksheet.headerFooter.oddFooter =
    `Generated from MNCH live data — Pyinmana and Tatkon only — ${extras.extractedAt}`;
  worksheet.autoFilter = {
    from: { row: 3, column: 1 },
    to: { row: lastDataRow, column: 30 },
  };

  addBriefingSheet(workbook, rows, extras);
  addTownshipSummarySheet(workbook, rows);
  addDefinitionsSheet(workbook);
  addAccountActivitySheet(workbook, accountRows);
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
    const activityByAccount = aggregateAccountActivity(data);
    const rows = buildFacilityRows(metricsByFacility);
    const accountRows = buildAccountRows(data, activityByAccount);
    const extractedAt = EXTRACT_DATE_LABEL;
    await writeWorkbook(workbookPath, rows, accountRows, {
      midwifeCount: data.midwives.size,
      extractedAt,
    });

    const totals = totalsForRows(rows);
    console.log(`Wrote ${rows.length} facility rows.`);
    console.log(`Midwife accounts: ${data.midwives.size}`);
    console.log(`Selected patients: ${data.patients.size}`);
    console.log(`Registered patients: ${totals.totalRegistered} (${totals.mothers} mothers, ${totals.babies} babies)`);
    console.log(`Delivery notes: ${totals.deliveries}; Dashboard deliveries: ${totals.dashboardDeliveries}`);
    console.log(`ANC services: ${totals.ancServices}; PNC services: ${totals.pncServices}; NBC services: ${totals.nbcServices}`);
    const accountTotals = emptyAccountActivity();
    activityByAccount.forEach((metrics) => {
      ACCOUNT_ACTIVITY_KEYS.forEach((key) => { accountTotals[key] += metrics[key]; });
    });
    console.log(
      `Account activity: Joint Care ${accountTotals.activeJointCare}; ` +
      `transfers ${accountTotals.transfersRecorded}; ` +
      `LBW/Preterm babies ${accountTotals.pretermLbwBabies}; ` +
      `Total KMC babies ${accountTotals.kmcYesBabies}.`,
    );
    console.log('Export complete.');
  } finally {
    cleanup();
    delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Export failed:', error && error.stack ? error.stack : error);
    process.exitCode = 1;
  });
}

module.exports = {
  initializeFirestore,
  loadData,
  emptyAccountActivity,
  recordCreatorId,
  canonicalNewbornBabies,
  canonicalNewbornPatientIds,
  babyIsPretermOrLbw,
  babyHasKmcYes,
  babyIsTotalKmcPatient,
  isKmcYes,
  collectNewbornEntries,
  indexLinkedBabyIds,
  aggregate,
  hasDeliveryNotes,
  isDashboardDelivered,
  isPilotFacilityCode,
  yangonDayOrdinal,
  deliveryDateFromNotes,
  firstPncDays,
  pncTimingBucket,
  serviceEventDate,
  serviceEventSortKey,
  aggregateAccountActivity,
  buildAccountRows,
};
