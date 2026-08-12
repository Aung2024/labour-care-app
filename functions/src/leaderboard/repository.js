'use strict';

const { FieldValue } = require('firebase-admin/firestore');

const MIDWIFE_PROVIDER_TYPES = new Set([
  'midwife',
  'hospital',
  'station_hospital',
  'station_health_unit',
  'rhc',
  'srhc',
  'mch'
]);

const PATIENT_ACTIVITY_COLLECTIONS = {
  ancVisits: 'antenatal_visits',
  pncVisits: 'postpartum_visits',
  labTests: 'testRecords',
  immediateNewbornCare: 'immediate_newborn_care',
  newbornCare: 'newborn_care'
};

async function collectionData(ref) {
  const snapshot = await ref.get();
  return snapshot.docs.map((doc) => doc.data() || {});
}

async function documentData(ref) {
  const snapshot = await ref.get();
  return snapshot.exists ? (snapshot.data() || {}) : null;
}

async function loadPatientActivity(db, patientId) {
  const patientRef = db.collection('patients').doc(patientId);
  const patientSnapshot = await patientRef.get();
  if (!patientSnapshot.exists) {
    return { patient: null, activity: {} };
  }

  const [
    ancVisits,
    pncVisits,
    labTests,
    immediateNewbornCare,
    newbornCare,
    summary,
    startingTime,
    secondStage,
    transferRecord
  ] = await Promise.all([
    collectionData(patientRef.collection(PATIENT_ACTIVITY_COLLECTIONS.ancVisits)),
    collectionData(patientRef.collection(PATIENT_ACTIVITY_COLLECTIONS.pncVisits)),
    collectionData(patientRef.collection(PATIENT_ACTIVITY_COLLECTIONS.labTests)),
    collectionData(patientRef.collection(PATIENT_ACTIVITY_COLLECTIONS.immediateNewbornCare)),
    collectionData(patientRef.collection(PATIENT_ACTIVITY_COLLECTIONS.newbornCare)),
    documentData(patientRef.collection('records').doc('summary')),
    documentData(patientRef.collection('records').doc('startingTime')),
    documentData(patientRef.collection('records').doc('secondStage')),
    documentData(patientRef.collection('records').doc('transferRecord'))
  ]);

  return {
    patient: patientSnapshot.data() || {},
    activity: {
      ancVisits,
      pncVisits,
      labTests,
      immediateNewbornCare,
      newbornCare,
      summary,
      startingTime,
      secondStage,
      transferRecord
    }
  };
}

async function loadProvider(db, providerId) {
  if (!providerId) return null;
  const snapshot = await db.collection('users').doc(providerId).get();
  if (!snapshot.exists) {
    return {
      providerId,
      providerName: 'Unknown',
      providerType: 'midwife',
      township: '',
      region: ''
    };
  }
  const data = snapshot.data() || {};
  const providerTypeKey = String(data.provider_type || '').toLowerCase().trim();
  return {
    providerId,
    providerName: data.name || data.email || 'Unknown',
    providerType: MIDWIFE_PROVIDER_TYPES.has(providerTypeKey)
      ? providerTypeKey
      : 'midwife',
    township: data.township || '',
    region: data.region || ''
  };
}

function contributionId(patientId, month) {
  return month + '_' + patientId;
}

function contributionRef(db, patientId, month) {
  return db.collection('leaderboard_v2_contributions').doc(contributionId(patientId, month));
}

function summaryRef(db, month, providerId) {
  return db.collection('leaderboard_v2_months')
    .doc(month)
    .collection('providers')
    .doc(providerId);
}

function serverTimestamp() {
  return FieldValue.serverTimestamp();
}

module.exports = {
  PATIENT_ACTIVITY_COLLECTIONS,
  loadPatientActivity,
  loadProvider,
  contributionId,
  contributionRef,
  summaryRef,
  serverTimestamp
};
