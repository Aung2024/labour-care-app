'use strict';

const { loadPatientActivity } = require('../leaderboard/repository');

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
async function loadClinicalFacts(db, patientId) {
  const loaded = await loadPatientActivity(db, patientId);
  return normalizeClinicalFacts(patientId, loaded);
}

function normalizeClinicalFacts(patientId, loaded) {
  if (!loaded.patient) return null;
  const activity = loaded.activity || {};
  return {
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
    newbornCare: latestEntry(activity.newbornCare),
    immediateNewbornCare: latestEntry(activity.immediateNewbornCare),
    hrtActions: collectionEntries(activity.hrtActions),
    // Reserved common facts for later HRT/KMC projections.
    scope: {
      providerId: loaded.patient.created_by || loaded.patient.createdBy || '',
      providerName: loaded.patient.midwife_name || loaded.patient.midwifeName ||
        loaded.patient.created_by_name || loaded.patient.providerName || '',
      careTeamProviderIds: loaded.patient.care_team_midwife_ids || [],
      township: loaded.patient.township || '',
      region: loaded.patient.region || ''
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
}

module.exports = {
  loadClinicalFacts,
  normalizeClinicalFacts,
  collectionEntries,
  entryRecord
};
