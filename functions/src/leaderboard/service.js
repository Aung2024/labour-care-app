'use strict';

const { FieldValue } = require('firebase-admin/firestore');
const {
  SCORE_VERSION,
  CATEGORY_KEYS,
  emptyCategories,
  calculatePatientContribution,
  subtractCategories
} = require('./scoring');
const {
  loadPatientActivity,
  loadProvider,
  contributionRef,
  summaryRef,
  serverTimestamp
} = require('./repository');

function numeric(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function normalizedCategories(value) {
  const result = emptyCategories();
  CATEGORY_KEYS.forEach((key) => {
    result[key] = numeric(value && value[key]);
  });
  return result;
}

function summaryWithDelta(current, delta, metadata, month) {
  const currentData = current || {};
  const currentCategories = normalizedCategories(currentData.categories);
  const categories = emptyCategories();
  CATEGORY_KEYS.forEach((key) => {
    categories[key] = Math.max(0, currentCategories[key] + numeric(delta.categories[key]));
  });
  return {
    month,
    providerId: metadata.providerId,
    providerName: metadata.providerName,
    providerType: metadata.providerType,
    township: metadata.township,
    region: metadata.region,
    scoreVersion: SCORE_VERSION,
    score: Math.max(0, numeric(currentData.score) + numeric(delta.score)),
    activePatientCount: Math.max(
      0,
      numeric(currentData.activePatientCount) + numeric(delta.activePatientCount)
    ),
    categories,
    calculatedAt: serverTimestamp(),
    lastEventAt: serverTimestamp(),
    reconciliationStatus: 'live'
  };
}

function zeroContribution(patientId, month) {
  return {
    patientId,
    month,
    providerId: null,
    scoreVersion: SCORE_VERSION,
    score: 0,
    activePatientCount: 0,
    categories: emptyCategories()
  };
}

async function savePatientContribution(db, patientId, month, providerId, calculated) {
  const nextContribution = Object.assign({}, calculated, {
    patientId,
    providerId,
    updatedAt: serverTimestamp()
  });

  const contributionDocument = contributionRef(db, patientId, month);
  const providerMetadata = providerId ? await loadProvider(db, providerId) : null;

  await db.runTransaction(async (transaction) => {
    const contributionSnapshot = await transaction.get(contributionDocument);
    const previous = contributionSnapshot.exists
      ? contributionSnapshot.data()
      : zeroContribution(patientId, month);
    const previousProviderId = previous.providerId || null;
    const providerIds = Array.from(new Set(
      [previousProviderId, providerId].filter(Boolean)
    ));
    const summaryReferences = providerIds.map((id) => summaryRef(db, month, id));
    const summarySnapshots = summaryReferences.length
      ? await transaction.getAll.apply(transaction, summaryReferences)
      : [];
    const summaryByProvider = new Map();
    summarySnapshots.forEach((snapshot) => {
      summaryByProvider.set(snapshot.id, snapshot.exists ? snapshot.data() : {});
    });

    for (const id of providerIds) {
      const oldValue = id === previousProviderId ? previous : zeroContribution(patientId, month);
      const newValue = id === providerId ? nextContribution : zeroContribution(patientId, month);
      const delta = {
        score: numeric(newValue.score) - numeric(oldValue.score),
        activePatientCount:
          numeric(newValue.activePatientCount) - numeric(oldValue.activePatientCount),
        categories: subtractCategories(newValue.categories, oldValue.categories)
      };
      const metadata = id === providerId && providerMetadata
        ? providerMetadata
        : await loadProvider(db, id);
      transaction.set(
        summaryRef(db, month, id),
        summaryWithDelta(summaryByProvider.get(id), delta, metadata, month),
        { merge: true }
      );
    }

    if (providerId && nextContribution.score > 0) {
      transaction.set(contributionDocument, nextContribution, { merge: true });
    } else {
      transaction.delete(contributionDocument);
    }
  });

  return nextContribution;
}

async function recomputePatientMonth(db, patientId, month) {
  if (!patientId || !/^\d{4}-\d{2}$/.test(month || '')) {
    throw new Error('patientId and YYYY-MM month are required.');
  }
  const loaded = await loadPatientActivity(db, patientId);
  const patient = loaded.patient;
  const providerId = patient && (patient.created_by || patient.createdBy) || null;
  const calculated = patient
    ? calculatePatientContribution(patient, loaded.activity, month)
    : zeroContribution(patientId, month);
  return savePatientContribution(db, patientId, month, providerId, calculated);
}

async function recomputePatientMonths(db, patientId, months) {
  const validMonths = Array.from(new Set((months || []).filter(
    (month) => /^\d{4}-\d{2}$/.test(month || '')
  )));
  if (!patientId || !validMonths.length) return [];
  const loaded = await loadPatientActivity(db, patientId);
  const patient = loaded.patient;
  const providerId = patient && (patient.created_by || patient.createdBy) || null;
  const results = [];
  for (const month of validMonths) {
    const calculated = patient
      ? calculatePatientContribution(patient, loaded.activity, month)
      : zeroContribution(patientId, month);
    results.push(await savePatientContribution(
      db,
      patientId,
      month,
      providerId,
      calculated
    ));
  }
  return results;
}

async function rebuildProviderSummariesFromContributions(db, month) {
  const snapshot = await db.collection('leaderboard_v2_contributions')
    .where('month', '==', month)
    .get();
  const totals = new Map();
  snapshot.forEach((doc) => {
    const contribution = doc.data() || {};
    const providerId = contribution.providerId;
    if (!providerId || !contribution.score) return;
    const current = totals.get(providerId) || {
      score: 0,
      activePatientCount: 0,
      categories: emptyCategories()
    };
    current.score += numeric(contribution.score);
    current.activePatientCount += numeric(contribution.activePatientCount);
    CATEGORY_KEYS.forEach((key) => {
      current.categories[key] += numeric(contribution.categories && contribution.categories[key]);
    });
    totals.set(providerId, current);
  });

  const providerCollection = db.collection('leaderboard_v2_months')
    .doc(month)
    .collection('providers');
  const existing = await providerCollection.get();
  const writer = db.bulkWriter();
  existing.forEach((doc) => {
    if (!totals.has(doc.id)) writer.delete(doc.ref);
  });
  for (const [providerId, total] of totals.entries()) {
    const metadata = await loadProvider(db, providerId);
    writer.set(providerCollection.doc(providerId), {
      month,
      providerId,
      providerName: metadata.providerName,
      providerType: metadata.providerType,
      township: metadata.township,
      region: metadata.region,
      scoreVersion: SCORE_VERSION,
      score: total.score,
      activePatientCount: total.activePatientCount,
      categories: total.categories,
      calculatedAt: FieldValue.serverTimestamp(),
      reconciliationStatus: 'complete'
    });
  }
  await writer.close();

  await db.collection('leaderboard_v2_months').doc(month).set({
    month,
    scoreVersion: SCORE_VERSION,
    providerCount: totals.size,
    calculatedAt: FieldValue.serverTimestamp(),
    reconciliationStatus: 'complete'
  }, { merge: true });
  return { month, providerCount: totals.size, contributionCount: snapshot.size };
}

module.exports = {
  recomputePatientMonth,
  recomputePatientMonths,
  rebuildProviderSummariesFromContributions,
  summaryWithDelta,
  zeroContribution
};
