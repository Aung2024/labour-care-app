'use strict';

const { FieldValue } = require('firebase-admin/firestore');
const { facilityTaxonomy } = require('../shared/facility-taxonomy');

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
  newbornCare: 'newborn_care',
  hrtActions: 'hrt_actions',
  kmcActions: 'kmc_actions'
};

async function collectionData(ref, options) {
  const opts = options || {};
  let query = ref;
  if (opts.orderBy) query = query.orderBy(opts.orderBy, opts.direction || 'desc');
  if (opts.limit) query = query.limit(opts.limit);
  let snapshot;
  try {
    snapshot = await query.get();
  } catch (error) {
    // Legacy documents may not carry the sort field. Keep the read bounded.
    snapshot = await (opts.limit ? ref.limit(opts.limit) : ref).get();
  }
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
    hrtActions,
    kmcActions,
    summary,
    startingTime,
    secondStage,
    thirdStage,
    transferRecord,
    birthRecord,
    endTreatment,
    outcomeRecord,
    deliveryNotes
  ] = await Promise.all([
    collectionData(patientRef.collection(PATIENT_ACTIVITY_COLLECTIONS.ancVisits), {
      orderBy: 'visitDate', limit: 20
    }),
    collectionData(patientRef.collection(PATIENT_ACTIVITY_COLLECTIONS.pncVisits), {
      orderBy: 'visitDate', limit: 10
    }),
    collectionData(patientRef.collection(PATIENT_ACTIVITY_COLLECTIONS.labTests), {
      orderBy: 'testDate', limit: 20
    }),
    collectionData(patientRef.collection(PATIENT_ACTIVITY_COLLECTIONS.immediateNewbornCare), {
      limit: 5
    }),
    collectionData(patientRef.collection(PATIENT_ACTIVITY_COLLECTIONS.newbornCare), {
      orderBy: 'visitDate', limit: 20
    }),
    collectionData(patientRef.collection(PATIENT_ACTIVITY_COLLECTIONS.hrtActions), {
      orderBy: 'recordedAt', limit: 20
    }),
    collectionData(patientRef.collection(PATIENT_ACTIVITY_COLLECTIONS.kmcActions), {
      orderBy: 'recordedAt', limit: 40
    }),
    documentData(patientRef.collection('records').doc('summary')),
    documentData(patientRef.collection('records').doc('startingTime')),
    documentData(patientRef.collection('records').doc('secondStage')),
    documentData(patientRef.collection('records').doc('thirdStage')),
    documentData(patientRef.collection('records').doc('transferRecord')),
    documentData(patientRef.collection('records').doc('birthRecord')),
    documentData(patientRef.collection('records').doc('endTreatment')),
    documentData(patientRef.collection('records').doc('outcomeRecord')),
    documentData(patientRef.collection('records').doc('deliveryNotes'))
  ]);

  return {
    patient: patientSnapshot.data() || {},
    activity: {
      ancVisits,
      pncVisits,
      labTests,
      immediateNewbornCare,
      newbornCare,
      hrtActions,
      kmcActions,
      summary,
      startingTime,
      secondStage,
      thirdStage,
      transferRecord,
      birthRecord,
      endTreatment,
      outcomeRecord,
      deliveryNotes
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
      region: '',
      phone: '',
      facilityCode: '',
      department: 'other',
      facilityType: 'other'
    };
  }
  const data = snapshot.data() || {};
  const providerTypeKey = String(data.provider_type || '').toLowerCase().trim();
  const taxonomy = facilityTaxonomy(data.facility_code);
  return {
    providerId,
    providerName: data.name || data.email || 'Unknown',
    providerType: MIDWIFE_PROVIDER_TYPES.has(providerTypeKey)
      ? providerTypeKey
      : 'midwife',
    township: data.township || '',
    region: data.region || '',
    phone: data.phone || '',
    facilityCode: taxonomy.facilityCode,
    department: taxonomy.department,
    facilityType: taxonomy.facilityType
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

function dailySummaryRef(db, day, providerId) {
  return db.collection('leaderboard_v3_daily')
    .doc(day + '_' + providerId);
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
  dailySummaryRef,
  serverTimestamp
};
