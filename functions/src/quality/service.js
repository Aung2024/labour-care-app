'use strict';

const { FieldValue } = require('firebase-admin/firestore');
const { loadProvider } = require('../leaderboard/repository');
const {
  QI_SCHEMA_VERSION,
  calculatePatientQualityContribution,
  summarizeProviderFromContributions,
  monthKeyForDate,
  timestampToDate
} = require('./scoring');

const CONTRIBUTIONS = 'quality_improvement_v1_contributions';
const MONTHS = 'quality_improvement_v1_months';

function contributionId(patientId, month) {
  return String(patientId) + '_' + String(month);
}

function contributionRef(db, patientId, month) {
  return db.collection(CONTRIBUTIONS).doc(contributionId(patientId, month));
}

function providerSummaryRef(db, month, providerId) {
  return db.collection(MONTHS).doc(month).collection('providers').doc(providerId);
}

function monthsTouchedByActivity(patient, activity, now) {
  const months = new Set();
  const add = (data, fields) => {
    for (const field of fields) {
      const date = timestampToDate(data && data[field]);
      const month = date && monthKeyForDate(date);
      if (month) months.add(month);
    }
  };
  add(patient || {}, ['created_at', 'createdAt', 'registration_date']);
  (activity && activity.immediateNewbornCare || []).forEach((record) => {
    add(record, ['timestamp', 'createdAt', 'created_at', 'recordedAt', 'visitDate']);
  });
  (activity && activity.newbornCare || []).forEach((record) => {
    add(record, ['visitDate', 'visit_date', 'timestamp', 'createdAt', 'created_at']);
  });
  if (!months.size) months.add(monthKeyForDate(now || new Date()));
  return Array.from(months);
}

async function savePatientQualityContribution(db, patientId, month, contribution) {
  const ref = contributionRef(db, patientId, month);
  const hasProviders = contribution && contribution.providers &&
    Object.keys(contribution.providers).length > 0;
  if (!hasProviders) {
    await ref.delete().catch(() => null);
    return { patientId, month, deleted: true, providerIds: [] };
  }
  await ref.set({
    patientId,
    month,
    schemaVersion: QI_SCHEMA_VERSION,
    providers: contribution.providers,
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: false });
  return {
    patientId,
    month,
    deleted: false,
    providerIds: Object.keys(contribution.providers)
  };
}

async function rebuildProviderMonthSummary(db, month, providerId) {
  const snapshot = await db.collection(CONTRIBUTIONS)
    .where('month', '==', month)
    .get();
  const contributions = [];
  snapshot.forEach((doc) => {
    const data = doc.data() || {};
    if (data.providers && data.providers[providerId]) contributions.push(data);
  });
  const metadata = await loadProvider(db, providerId);
  const summary = summarizeProviderFromContributions(contributions, {
    providerId,
    providerName: metadata.providerName,
    township: metadata.township,
    region: metadata.region,
    facilityCode: metadata.facilityCode
  }, month);
  summary.calculatedAt = FieldValue.serverTimestamp();
  if (!contributions.length) {
    await providerSummaryRef(db, month, providerId).delete().catch(() => null);
    return { month, providerId, deleted: true };
  }
  await providerSummaryRef(db, month, providerId).set(summary, { merge: false });
  return { month, providerId, deleted: false, summaryPercentage: summary.summaryPercentage };
}

async function recomputeLoadedPatientQualityMonths(db, patientId, months, loaded, now) {
  const patient = loaded && loaded.patient ? Object.assign({ id: patientId }, loaded.patient) : null;
  const activity = loaded && loaded.activity || {};
  const touched = new Set(['all', ...(months || []).filter(Boolean)]);
  monthsTouchedByActivity(patient || {}, activity, now).forEach((month) => touched.add(month));

  const existing = await db.collection(CONTRIBUTIONS)
    .where('patientId', '==', patientId)
    .get();
  existing.forEach((doc) => {
    const month = doc.data() && doc.data().month;
    if (month) touched.add(month);
  });

  const affectedProviders = new Set();
  const results = [];
  for (const month of touched) {
    if (month !== 'all' && !/^\d{4}-\d{2}$/.test(month)) continue;
    const previous = existing.docs.find((doc) => (doc.data() || {}).month === month);
    const previousProviders = previous && previous.data() && previous.data().providers
      ? Object.keys(previous.data().providers)
      : [];
    const contribution = patient
      ? calculatePatientQualityContribution(patient, activity, month)
      : { providers: {} };
    const saved = await savePatientQualityContribution(db, patientId, month, contribution);
    previousProviders.forEach((id) => affectedProviders.add(id));
    (saved.providerIds || []).forEach((id) => affectedProviders.add(id));
    results.push(saved);
  }

  for (const providerId of affectedProviders) {
    for (const month of touched) {
      if (month !== 'all' && !/^\d{4}-\d{2}$/.test(month)) continue;
      await rebuildProviderMonthSummary(db, month, providerId);
    }
  }
  return results;
}

async function recomputePatientQualityMonths(db, patientId, months, now) {
  const { loadPatientActivity } = require('../leaderboard/repository');
  const loaded = await loadPatientActivity(db, patientId);
  return recomputeLoadedPatientQualityMonths(db, patientId, months, loaded, now);
}

module.exports = {
  CONTRIBUTIONS,
  MONTHS,
  contributionId,
  contributionRef,
  providerSummaryRef,
  monthsTouchedByActivity,
  savePatientQualityContribution,
  rebuildProviderMonthSummary,
  recomputeLoadedPatientQualityMonths,
  recomputePatientQualityMonths
};
