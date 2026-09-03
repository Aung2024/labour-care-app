'use strict';

const { loadPatientActivity } = require('../leaderboard/repository');
const { facilityTaxonomy } = require('../shared/facility-taxonomy');
const {
  infectionFlags,
  resolveBirthAnchor
} = require('../shared/clinical-normalizers');

function entryRecord(data, id) {
  return data && Object.keys(data).length ? { id: id || '', data } : null;
}

function collectionEntries(records) {
  return (records || []).map((data, index) => ({
    id: String(index),
    data: data || {}
  }));
}

function latestEntry(records) {
  const entries = collectionEntries(records);
  return entries.length ? entries[entries.length - 1] : null;
}

/**
 * Loads one normalized clinical bundle shared by leaderboard and dashboard.
 * The browser-readable summaries never contain this patient-level payload.
 */
function unwrapVisit(entry) {
  if (!entry) return {};
  return entry.data || entry;
}

function visitNumberOf(data) {
  return Number((data && (data.visit_number || data.visitNumber)) || 0);
}

function visitHasFollowUpWeight(data) {
  return !!(data && (data.current_weight_gram || data.currentWeightGram || data.visit_weight_gram));
}

async function readNewbornCare(db, patientId) {
  const ref = db.collection('patients').doc(patientId).collection('newborn_care');
  try {
    const snap = await ref.orderBy('visit_number').limit(20).get();
    return snap.docs.map((doc) => doc.data() || {});
  } catch (error) {
    const snap = await ref.limit(20).get();
    return snap.docs.map((doc) => doc.data() || {});
  }
}

async function mergeLinkedNewbornVisits(db, facts) {
  if (!db || !facts || !facts.id) return facts;
  const extraIds = [];
  const type = String((facts.newbornFacts && facts.newbornFacts.patientType) || '').toLowerCase();
  if (type === 'baby' && facts.newbornFacts.motherPatientId) {
    extraIds.push(facts.newbornFacts.motherPatientId);
  } else {
    ((facts.newbornFacts && facts.newbornFacts.babyPatientIds) || []).forEach((id) => {
      if (id && id !== facts.id) extraIds.push(id);
    });
    extraIds.push(facts.id + '_baby_1');
    extraIds.push(facts.id + '_baby_2');
  }
  const unique = Array.from(new Set(extraIds.filter((id) => id && id !== facts.id)));
  if (!unique.length) return facts;
  const extras = (await Promise.all(unique.map((id) => readNewbornCare(db, id).catch(() => []))))
    .reduce((all, rows) => all.concat(rows), []);
  if (!extras.length) return facts;
  const byVisit = new Map();
  (facts.newbornVisits || []).forEach((entry, index) => {
    const data = unwrapVisit(entry);
    const n = visitNumberOf(data) || (index + 1);
    byVisit.set(n, entry);
  });
  extras.forEach((data) => {
    const n = visitNumberOf(data);
    if (!n) return;
    const current = byVisit.get(n);
    const currentData = unwrapVisit(current);
    if (!current || (visitHasFollowUpWeight(data) && !visitHasFollowUpWeight(currentData))) {
      byVisit.set(n, { id: String(n), data });
    }
  });
  facts.newbornVisits = Array.from(byVisit.entries())
    .sort((a, b) => a[0] - b[0])
    .map((item) => item[1]);
  return facts;
}

async function loadClinicalFacts(db, patientId) {
  const loaded = await loadPatientActivity(db, patientId);
  const facts = normalizeClinicalFacts(patientId, loaded);
  if (!facts) return null;
  return mergeLinkedNewbornVisits(db, facts);
}

function normalizeClinicalFacts(patientId, loaded) {
  if (!loaded.patient) return null;
  const activity = loaded.activity || {};
  const taxonomy = facilityTaxonomy(loaded.patient.facility_code);
  const facts = {
    id: patientId,
    profile: loaded.patient,
    registration: loaded.patient,
    antenatalVisits: collectionEntries(activity.ancVisits),
    postpartumVisits: collectionEntries(activity.pncVisits),
    testRecords: collectionEntries(activity.labTests),
    summary: activity.summary || null,
    startingTimeDoc: activity.startingTime || null,
    secondStageDoc: activity.secondStage || null,
    thirdStage: activity.thirdStage || null,
    transferRecord: entryRecord(activity.transferRecord, 'transferRecord'),
    birthRecord: entryRecord(activity.birthRecord, 'birthRecord'),
    endTreatment: entryRecord(activity.endTreatment, 'endTreatment'),
    outcomeRecord: entryRecord(activity.outcomeRecord, 'outcomeRecord'),
    deliveryNotes: entryRecord(activity.deliveryNotes, 'deliveryNotes'),
    newbornVisits: collectionEntries(activity.newbornCare),
    newbornCare: latestEntry(activity.newbornCare),
    immediateNewbornCare: latestEntry(activity.immediateNewbornCare),
    hrtActions: collectionEntries(activity.hrtActions),
    kmcActions: collectionEntries(activity.kmcActions),
    scope: {
      providerId: loaded.patient.created_by || loaded.patient.createdBy || '',
      providerName: loaded.patient.midwife_name || loaded.patient.midwifeName ||
        loaded.patient.created_by_name || loaded.patient.providerName || '',
      careTeamProviderIds: loaded.patient.care_team_midwife_ids || [],
      township: loaded.patient.township || '',
      region: loaded.patient.region || '',
      facilityCode: taxonomy.facilityCode,
      department: taxonomy.department,
      facilityType: taxonomy.facilityType
    },
    newbornFacts: {
      patientType: loaded.patient.patient_type || '',
      motherPatientId: loaded.patient.mother_patient_id || '',
      babyPatientIds: loaded.patient.baby_patient_ids || [],
      birthDate: loaded.patient.date_of_birth || loaded.patient.birth_time || null,
      birthWeightGram: loaded.patient.birth_weight_gram || null,
      maternalEdd: loaded.patient.maternal_edd || loaded.patient.edd || null,
      outcome: loaded.patient.birth_outcome || null
    }
  };
  facts.infectionFlags = infectionFlags(facts.testRecords);
  facts.birthAnchor = resolveBirthAnchor(facts);
  return facts;
}

module.exports = {
  loadClinicalFacts,
  normalizeClinicalFacts,
  collectionEntries,
  entryRecord
};
