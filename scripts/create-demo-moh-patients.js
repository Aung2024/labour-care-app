#!/usr/bin/env node
/**
 * Copy real patient records into @moh.com Midwife accounts for demos.
 *
 * Defaults to dry-run. Use --write to actually create Firestore documents.
 *
 * Usage:
 *   node create-demo-moh-patients.js
 *   node create-demo-moh-patients.js --min 6 --max 9 --write
 *   node create-demo-moh-patients.js --exclude-email midwife_mrh@moh.com --write
 *   node create-demo-moh-patients.js --keep-identifiers --write
 *
 * Prerequisites:
 *   1. Save a Firebase service account key as scripts/serviceAccountKey.json
 *      or set GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json
 *   2. Run npm install in the scripts folder if firebase-admin is missing.
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const getArg = (name, fallback) => {
  const idx = args.indexOf(name);
  if (idx === -1 || idx === args.length - 1) return fallback;
  return args[idx + 1];
};
const hasFlag = (name) => args.includes(name);

const WRITE = hasFlag('--write');
const MIN = Number(getArg('--min', '6'));
const MAX = Number(getArg('--max', '9'));
const KEEP_IDENTIFIERS = hasFlag('--keep-identifiers');
const COPY_SUBCOLLECTIONS = !hasFlag('--skip-subcollections');
const EXCLUDE_EMAILS = args
  .flatMap((arg, index) => (arg === '--exclude-email' && args[index + 1] ? [args[index + 1]] : []))
  .map(normalizeEmail);

if (!Number.isInteger(MIN) || !Number.isInteger(MAX) || MIN < 1 || MAX < MIN) {
  console.error('Invalid --min/--max. Example: --min 6 --max 9');
  process.exit(1);
}

const possiblePaths = [
  path.join(__dirname, 'serviceAccountKey.json'),
  path.join(__dirname, '..', 'serviceAccountKey.json'),
  process.env.GOOGLE_APPLICATION_CREDENTIALS
].filter(Boolean);

const serviceAccountPath = possiblePaths.find((p) => p && fs.existsSync(p));
if (!serviceAccountPath) {
  console.error('\nService account key not found.');
  console.error('Save it as scripts/serviceAccountKey.json or set GOOGLE_APPLICATION_CREDENTIALS.\n');
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(require(serviceAccountPath))
});

const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;

const SUBCOLLECTIONS = [
  'antenatal_visits',
  'postpartum_visits',
  'testRecords',
  'records',
  'immediate_newborn_care',
  'newborn_care',
  'baby_records',
  'medication',
  'plotData',
  'hrt_actions'
];

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function isMohEmail(email) {
  const normalized = normalizeEmail(email);
  return normalized.includes('@') && normalized.endsWith('moh.com');
}

function isMidwife(user) {
  return String(user.role || '').trim().toLowerCase() === 'midwife';
}

function randomInt(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function shuffle(items) {
  const copy = items.slice();
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function anonymizedPatientFields(index, targetMidwife) {
  const label = String(index + 1).padStart(2, '0');
  return {
    name: `Demo Patient ${label}`,
    patientName: `Demo Patient ${label}`,
    phone: `0990000${label}`,
    phoneNumber: `0990000${label}`,
    phone_number: `0990000${label}`,
    emergency_phone: '',
    address: 'Demo address',
    demoPatientLabel: `Demo Patient ${label}`,
    providerName: targetMidwife.name || targetMidwife.email || 'MOH Midwife'
  };
}

function retargetOwnerFields(data, targetMidwife, sourcePatientId, index) {
  const copied = { ...data };
  copied.created_by = targetMidwife.id;
  copied.createdBy = targetMidwife.id;
  copied.township = targetMidwife.township || copied.township || '';
  copied.region = targetMidwife.region || copied.region || '';
  copied.demoCopy = true;
  copied.demoCopiedFromPatientId = sourcePatientId;
  copied.demoCopiedToMidwifeId = targetMidwife.id;
  copied.demoCopiedToMidwifeEmail = targetMidwife.email || '';
  copied.demoCopiedAt = FieldValue.serverTimestamp();
  copied.care_team_midwife_ids = [];

  if (!KEEP_IDENTIFIERS) {
    Object.assign(copied, anonymizedPatientFields(index, targetMidwife));
  }

  return copied;
}

function retargetSubcollectionDoc(data, targetMidwife, sourcePatientId) {
  const copied = { ...data };
  if ('created_by' in copied) copied.created_by = targetMidwife.id;
  if ('createdBy' in copied) copied.createdBy = targetMidwife.id;
  if ('recordedBy' in copied) copied.recordedBy = targetMidwife.id;
  if ('userId' in copied) copied.userId = targetMidwife.id;
  if ('township' in copied) copied.township = targetMidwife.township || copied.township || '';
  if ('region' in copied) copied.region = targetMidwife.region || copied.region || '';
  copied.demoCopy = true;
  copied.demoCopiedFromPatientId = sourcePatientId;
  copied.demoCopiedToMidwifeId = targetMidwife.id;
  return copied;
}

async function loadMohMidwives() {
  const usersSnap = await db.collection('users').get();
  const midwives = [];
  usersSnap.forEach((doc) => {
    const data = doc.data() || {};
    const email = normalizeEmail(data.email);
    if (isMidwife(data) && isMohEmail(email) && !EXCLUDE_EMAILS.includes(email)) {
      midwives.push({ id: doc.id, ...data, email });
    }
  });
  return midwives.sort((a, b) => normalizeEmail(a.email).localeCompare(normalizeEmail(b.email)));
}

async function loadSourcePatients(mohMidwifeIds) {
  const snap = await db.collection('patients').get();
  const source = [];
  snap.forEach((doc) => {
    const data = doc.data() || {};
    const owner = data.created_by || data.createdBy || '';
    if (data.demoCopy === true) return;
    if (mohMidwifeIds.has(owner)) return;
    source.push({ id: doc.id, data });
  });
  return source;
}

async function countExistingDemoCopiesForMidwife(midwifeId) {
  const snap = await db.collection('patients')
    .where('demoCopy', '==', true)
    .where('demoCopiedToMidwifeId', '==', midwifeId)
    .get();
  return snap.size;
}

async function copySubcollections(sourcePatientId, targetPatientRef, targetMidwife) {
  let copiedDocs = 0;

  for (const subcollection of SUBCOLLECTIONS) {
    const snap = await db.collection('patients').doc(sourcePatientId).collection(subcollection).get();
    if (snap.empty) continue;

    const batch = db.batch();
    snap.forEach((doc) => {
      const targetDoc = targetPatientRef.collection(subcollection).doc(doc.id);
      batch.set(targetDoc, retargetSubcollectionDoc(doc.data() || {}, targetMidwife, sourcePatientId));
      copiedDocs += 1;
    });
    await batch.commit();
  }

  return copiedDocs;
}

async function createDemoCopies(plan) {
  let createdPatients = 0;
  let copiedSubDocs = 0;

  for (const item of plan) {
    for (let i = 0; i < item.patients.length; i += 1) {
      const source = item.patients[i];
      const targetRef = db.collection('patients').doc();
      const patientData = retargetOwnerFields(source.data, item.midwife, source.id, i);
      await targetRef.set(patientData);
      createdPatients += 1;

      if (COPY_SUBCOLLECTIONS) {
        copiedSubDocs += await copySubcollections(source.id, targetRef, item.midwife);
      }
    }
  }

  return { createdPatients, copiedSubDocs };
}

async function main() {
  console.log(`\nMOH demo patient copier (${WRITE ? 'WRITE MODE' : 'DRY RUN'})`);
  console.log(`Patients per @moh.com Midwife: random ${MIN}-${MAX}`);
  if (EXCLUDE_EMAILS.length) console.log(`Excluded emails: ${EXCLUDE_EMAILS.join(', ')}`);
  console.log(`Identifiers: ${KEEP_IDENTIFIERS ? 'KEEP real names/phones' : 'ANONYMIZE names/phones'}`);
  console.log(`Subcollections: ${COPY_SUBCOLLECTIONS ? 'copy known subcollections' : 'skip'}\n`);

  const midwives = await loadMohMidwives();
  if (!midwives.length) {
    console.log('No @moh.com Midwife accounts found.');
    return;
  }

  const sourcePatients = await loadSourcePatients(new Set(midwives.map((m) => m.id)));
  if (!sourcePatients.length) {
    console.log('No source patients found after excluding demo copies and MOH-owned patients.');
    return;
  }

  console.log(`Found ${midwives.length} @moh.com Midwife account(s).`);
  console.log(`Found ${sourcePatients.length} source patient(s).\n`);

  const plan = [];
  for (const midwife of midwives) {
    const existingDemoCount = await countExistingDemoCopiesForMidwife(midwife.id);
    const targetCount = randomInt(MIN, MAX);
    const selected = shuffle(sourcePatients).slice(0, Math.min(targetCount, sourcePatients.length));
    plan.push({ midwife, patients: selected, existingDemoCount });

    console.log(`- ${midwife.email} (${midwife.name || 'No name'})`);
    console.log(`  UID: ${midwife.id}`);
    console.log(`  Township/Region: ${midwife.township || 'N/A'} / ${midwife.region || 'N/A'}`);
    console.log(`  Existing demo copies: ${existingDemoCount}`);
    console.log(`  Planned new copies: ${selected.length}`);
  }

  const totalPlanned = plan.reduce((sum, item) => sum + item.patients.length, 0);
  console.log(`\nTotal planned patient copies: ${totalPlanned}`);

  if (!WRITE) {
    console.log('\nDry run only. Re-run with --write to create these demo copies.\n');
    return;
  }

  const result = await createDemoCopies(plan);
  console.log(`\nCreated ${result.createdPatients} demo patient document(s).`);
  console.log(`Copied ${result.copiedSubDocs} subcollection document(s).`);
  console.log('Done.\n');
}

main().catch((error) => {
  console.error('\nError:', error.message);
  if (error.code) console.error('Code:', error.code);
  process.exit(1);
});
