#!/usr/bin/env node
'use strict';

/**
 * Compare ANC contact for women with a high-risk ANC flag (the HRT list)
 * and ANC clients who were never flagged. Pyinmana and Tatkon midwives only.
 * Aggregate counts only.
 */

const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { createRequire } = require('node:module');

const ROOT = path.resolve(__dirname, '..');
const FUNCTIONS_REQUIRE = createRequire(path.join(ROOT, 'functions', 'package.json'));
const admin = FUNCTIONS_REQUIRE('firebase-admin');
const firebaseAuth = FUNCTIONS_REQUIRE('firebase-tools/lib/auth.js');
const firebaseApi = FUNCTIONS_REQUIRE('firebase-tools/lib/api.js');
const { FacilityConfig } = require(path.join(ROOT, 'js', 'facility-config.js'));

const PROJECT_ID = 'mnch-1cbda';
const PILOT_TOWNSHIPS = ['Pyinmana', 'Tatkon'];
const EARLY_ANC_MAX_DAYS = 12 * 7;

function townshipForCode(code) {
  const facility = FacilityConfig.getFacilityByCode(String(code || '').trim());
  return facility && facility.township ? facility.township : '';
}

function asDate(value) {
  if (!value) return null;
  if (typeof value.toDate === 'function') {
    const date = value.toDate();
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'object' && typeof value.seconds === 'number') return new Date(value.seconds * 1000);
  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

function dateFrom(data, fields) {
  for (const field of fields) {
    const date = asDate(data && data[field]);
    if (date) return date;
  }
  return null;
}

function affirmative(value) {
  return value === true || ['yes', 'true', 'y', '1'].includes(String(value || '').trim().toLowerCase());
}

function medicineReceived(value) {
  const normalized = String(value == null ? '' : value).trim().toLowerCase();
  if (!normalized || /not\s+(given|prescribed)/.test(normalized)) return false;
  return normalized === 'given' || normalized === 'prescribed' || normalized === 'already prescribed';
}

function visitDate(visit) {
  return dateFrom(visit, ['visitDate', 'visit_date', 'timestamp', 'createdAt', 'created_at']);
}

function isEarly(patient, visits) {
  const sorted = visits.slice().sort((a, b) => (visitDate(a) || 0) - (visitDate(b) || 0));
  const first = sorted[0];
  if (!first) return false;
  const firstVisit = visitDate(first);
  const lmp = asDate(first.lmp || patient.lmp);
  const lmpStatus = String(first.lmpStatus || patient.lmpStatus || '').toLowerCase();
  if (lmp && firstVisit && lmpStatus !== 'unknown') {
    const days = Math.floor((firstVisit.getTime() - lmp.getTime()) / 86400000);
    if (days >= 0) return days < EARLY_ANC_MAX_DAYS;
  }
  const weeks = Number(first.gestationalAge || first.gestational_age || first.ga_weeks || first.manualGestationalAge);
  return Number.isFinite(weeks) && weeks > 0 && weeks < 12;
}

function emptyGroup() {
  return {
    clients: 0,
    visits: 0,
    visitHist: {},
    atLeast4: 0,
    atLeast8: 0,
    early: 0,
    iron: 0,
    deworming: 0,
    nextVisitDated: 0,
    delivered: 0,
    deliveredAtLeast4: 0,
    deliveredWithPnc: 0,
    deliveredPnc48: 0,
  };
}

function bump(group, row) {
  group.clients += 1;
  group.visits += row.visits;
  const key = row.visits >= 8 ? '8+' : String(row.visits);
  group.visitHist[key] = (group.visitHist[key] || 0) + 1;
  if (row.visits >= 4) group.atLeast4 += 1;
  if (row.visits >= 8) group.atLeast8 += 1;
  if (row.early) group.early += 1;
  if (row.iron) group.iron += 1;
  if (row.deworming) group.deworming += 1;
  if (row.nextVisitDated) group.nextVisitDated += 1;
  if (row.delivered) {
    group.delivered += 1;
    if (row.visits >= 4) group.deliveredAtLeast4 += 1;
    if (row.pnc) group.deliveredWithPnc += 1;
    if (row.pnc48) group.deliveredPnc48 += 1;
  }
}

function medianFromHist(hist) {
  const order = ['1', '2', '3', '4', '5', '6', '7', '8+'];
  const total = order.reduce((sum, key) => sum + (hist[key] || 0), 0);
  if (!total) return null;
  let seen = 0;
  const target = Math.ceil(total / 2);
  for (const key of order) {
    seen += hist[key] || 0;
    if (seen >= target) return key === '8+' ? 8 : Number(key);
  }
  return null;
}

function summarize(group) {
  const round = (value) => Math.round(value * 10) / 10;
  return {
    ...group,
    meanVisits: group.clients ? round(group.visits / group.clients) : null,
    medianVisits: medianFromHist(group.visitHist),
    atLeast4Percent: group.clients ? round((group.atLeast4 / group.clients) * 100) : null,
    atLeast8Percent: group.clients ? round((group.atLeast8 / group.clients) * 100) : null,
    earlyPercent: group.clients ? round((group.early / group.clients) * 100) : null,
    ironPercent: group.clients ? round((group.iron / group.clients) * 100) : null,
    dewormingPercent: group.clients ? round((group.deworming / group.clients) * 100) : null,
    nextVisitPercent: group.clients ? round((group.nextVisitDated / group.clients) * 100) : null,
    deliveredAtLeast4Percent: group.delivered ? round((group.deliveredAtLeast4 / group.delivered) * 100) : null,
    deliveredPncPercent: group.delivered ? round((group.deliveredWithPnc / group.delivered) * 100) : null,
    deliveredPnc48Percent: group.delivered ? round((group.deliveredPnc48 / group.delivered) * 100) : null,
  };
}

function createTemporaryAdcFile() {
  const account = firebaseAuth.getGlobalDefaultAccount();
  const refreshToken = account && account.tokens && account.tokens.refresh_token;
  if (!refreshToken) throw new Error('No Firebase CLI login found. Run `firebase login` and retry.');
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mnch-hrt-anc-'));
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

function patientIdFrom(doc) {
  const patientRef = doc.ref.parent && doc.ref.parent.parent;
  if (!patientRef || !patientRef.parent || patientRef.parent.id !== 'patients') return null;
  return patientRef.id;
}

async function main() {
  const temporaryAdc = createTemporaryAdcFile();
  process.env.GOOGLE_APPLICATION_CREDENTIALS = temporaryAdc.path;
  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: PROJECT_ID });
  }
  const db = admin.firestore();
  db.settings({ ignoreUndefinedProperties: true });
  try {
    const usersSnapshot = await db.collection('users').get();
    const midwives = new Map();
    usersSnapshot.docs.forEach((doc) => {
      const user = doc.data() || {};
      if (String(user.role || '').trim().toLowerCase() !== 'midwife') return;
      const code = String(user.facility_code || user.facilityCode || '').trim();
      if (!PILOT_TOWNSHIPS.includes(townshipForCode(code))) return;
      midwives.set(doc.id, { code, township: townshipForCode(code) });
    });
    const patientsSnapshot = await db.collection('patients').get();
    const mothers = new Map();
    patientsSnapshot.docs.forEach((doc) => {
      const data = doc.data() || {};
      const creatorId = String(data.created_by || data.createdBy || '').trim();
      if (!midwives.has(creatorId)) return;
      if (String(data.patient_type || data.patientType || 'mother').trim().toLowerCase() === 'baby') return;
      mothers.set(doc.id, {
        township: midwives.get(creatorId).township,
        facilityCode: midwives.get(creatorId).code,
        lmp: data.lmp,
        lmpStatus: data.lmpStatus,
      });
    });
    console.log(`Mothers ${mothers.size}`);
    const anc = new Map();
    const pnc = new Map();
    const ancSnap = await db.collectionGroup('antenatal_visits').get();
    ancSnap.docs.forEach((doc) => {
      const patientId = patientIdFrom(doc);
      if (!mothers.has(patientId)) return;
      if (!anc.has(patientId)) anc.set(patientId, []);
      anc.get(patientId).push(doc.data() || {});
    });
    const pncSnap = await db.collectionGroup('postpartum_visits').get();
    pncSnap.docs.forEach((doc) => {
      const patientId = patientIdFrom(doc);
      if (!mothers.has(patientId)) return;
      if (!pnc.has(patientId)) pnc.set(patientId, []);
      pnc.get(patientId).push(doc.data() || {});
    });
    const motherIds = [...anc.keys()];
    const notes = new Map();
    for (let index = 0; index < motherIds.length; index += 80) {
      const slice = motherIds.slice(index, index + 80);
      const snaps = await db.getAll(...slice.map((id) => db.doc(`patients/${id}/records/deliveryNotes`)));
      snaps.forEach((snap, snapIndex) => {
        if (snap.exists) notes.set(slice[snapIndex], snap.data() || {});
      });
    }

    const groups = {
      all: { hrt: emptyGroup(), other: emptyGroup() },
      Pyinmana: { hrt: emptyGroup(), other: emptyGroup() },
      Tatkon: { hrt: emptyGroup(), other: emptyGroup() },
    };
    motherIds.forEach((id) => {
      const profile = mothers.get(id);
      const visits = anc.get(id) || [];
      const hrt = visits.some((visit) => affirmative(visit.high_risk ?? visit.highRisk));
      const birth = birthDate(notes.get(id));
      const pncVisits = pnc.get(id) || [];
      const firstPnc = pncVisits.map(visitDate).filter(Boolean).sort((a, b) => a - b)[0];
      const row = {
        visits: visits.length,
        early: isEarly(profile, visits),
        iron: visits.some((visit) => medicineReceived(visit.ironFolicAcid) || medicineReceived(visit.micronutrientsTablet)),
        deworming: visits.some((visit) => medicineReceived(visit.deworming)),
        nextVisitDated: visits.some((visit) => dateFrom(visit, ['nextVisitDate', 'next_visit_date'])),
        delivered: notes.has(id),
        pnc: pncVisits.length > 0,
        pnc48: Boolean(birth && firstPnc && daysBetween(birth, firstPnc) >= 0 && daysBetween(birth, firstPnc) <= 2),
      };
      bump(groups.all[hrt ? 'hrt' : 'other'], row);
      if (groups[profile.township]) bump(groups[profile.township][hrt ? 'hrt' : 'other'], row);
    });

    const output = {
      extractedAt: '2026-10-15',
      scope: 'ANC clients created by Pyinmana and Tatkon midwives. HRT means the high-risk box was ticked on at least one ANC visit.',
      mothers: mothers.size,
      ancClients: motherIds.length,
      groups: Object.fromEntries(Object.entries(groups).map(([name, pair]) => [name, {
        hrt: summarize(pair.hrt),
        other: summarize(pair.other),
      }])),
    };
    const jsonPath = path.join(ROOT, 'docs', 'hrt-vs-anc-2026-10-15.json');
    fs.writeFileSync(jsonPath, JSON.stringify(output, null, 2));
    console.log(JSON.stringify(output.groups.all, null, 2));
    console.log('Wrote', jsonPath);
  } finally {
    temporaryAdc.cleanup();
  }
}

function birthDate(notes) {
  if (!notes) return null;
  const details = notes.deliveryDetails || notes.labourDetails || {};
  const babies = Array.isArray(details.babies) ? details.babies : [];
  for (const baby of babies) {
    const date = asDate(baby.birthTime || baby.birth_time);
    if (date) return date;
  }
  return dateFrom(details, ['deliveryDate', 'birthTime']) || dateFrom(notes, ['createdAt', 'updatedAt']);
}

function daysBetween(start, end) {
  return Math.floor((end.getTime() - start.getTime()) / 86400000);
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
