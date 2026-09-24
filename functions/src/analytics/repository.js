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

function linkedBabyIndex(patientId) {
  const match = String(patientId || '').match(
    /_baby_(?:(?:\d{8}|unknown)_)?(\d+)$/
  );
  return match ? (parseInt(match[1], 10) || null) : null;
}

function withVisitSource(data, patientId) {
  const babyIndex = linkedBabyIndex(patientId);
  if (!babyIndex) return data || {};
  return { ...(data || {}), _kmcSourceBabyIndex: babyIndex };
}

function visitDateKey(data) {
  const value = data && (
    data.visitDate || data.visit_date || data.recordedAt || data.recorded_at ||
    data.timestamp || data.createdAt || data.birth_time
  );
  if (!value) return '';
  const date = value && typeof value.toDate === 'function' ? value.toDate() : new Date(value);
  return date && !Number.isNaN(date.getTime()) ? date.toISOString() : String(value);
}

function visitWeightKey(data) {
  const babies = Array.isArray(data && data.babies) ? data.babies.map((baby) => [
    baby.babyIndex || baby.baby_index || '',
    baby.current_weight_gram || baby.currentWeightGram || baby.visit_weight_gram || '',
    baby.birthWeightGram || baby.birth_weight_gram || baby.body_weight_gram || ''
  ]) : [];
  return JSON.stringify([
    data && (data.current_weight_gram || data.currentWeightGram || data.visit_weight_gram || ''),
    data && (data.body_weight_gram || data.birth_weight_gram || data.birthWeightGram || ''),
    babies
  ]);
}

function linkedVisitKey(data) {
  return [
    data && data._kmcSourceBabyIndex || '',
    visitNumberOf(data) || '',
    visitDateKey(data),
    visitWeightKey(data)
  ].join('::');
}

async function readNewbornCare(db, patientId) {
  const ref = db.collection('patients').doc(patientId).collection('newborn_care');
  try {
    const snap = await ref.orderBy('visit_number').get();
    return snap.docs.map((doc) => withVisitSource(doc.data(), patientId));
  } catch (error) {
    const snap = await ref.get();
    return snap.docs.map((doc) => withVisitSource(doc.data(), patientId));
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
  const seen = new Set();
  const merged = [];
  const addVisit = (entry) => {
    const data = unwrapVisit(entry);
    const key = linkedVisitKey(data);
    if (seen.has(key)) return;
    seen.add(key);
    merged.push(entry);
  };
  (facts.newbornVisits || []).forEach(addVisit);
  extras.forEach((data, index) => addVisit({
    id: `linked-${index}`,
    data
  }));
  merged.sort((a, b) => {
    const aData = unwrapVisit(a);
    const bData = unwrapVisit(b);
    const aNumber = visitNumberOf(aData);
    const bNumber = visitNumberOf(bData);
    if (aNumber === 1 && bNumber !== 1) return -1;
    if (bNumber === 1 && aNumber !== 1) return 1;
    const dateDiff = visitDateKey(aData).localeCompare(visitDateKey(bData));
    return dateDiff || aNumber - bNumber ||
      Number(aData._kmcSourceBabyIndex || 0) - Number(bData._kmcSourceBabyIndex || 0);
  });
  facts.newbornVisits = merged;
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
  const facilityCode = loaded.patient.facility_code || loaded.patient.facilityCode || '';
  const taxonomy = facilityTaxonomy(facilityCode);
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
      facilityName: loaded.patient.facility_name || loaded.patient.facilityName ||
        loaded.patient.facility || loaded.patient.healthFacility || '',
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
  mergeLinkedNewbornVisits,
  normalizeClinicalFacts,
  collectionEntries,
  entryRecord
};
