'use strict';

const { FieldValue } = require('firebase-admin/firestore');
const {
  SCORE_VERSION,
  CATEGORY_KEYS,
  emptyCategories,
  calculatePatientContribution,
  subtractCategories,
  isLeaderboardPeriod,
  ALL_TIME_PERIOD,
  dayKeyForDate
} = require('./scoring');
const {
  loadPatientActivity,
  loadProvider,
  contributionRef,
  summaryRef,
  dailySummaryRef,
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
    phone: metadata.phone || '',
    facilityCode: metadata.facilityCode || '',
    department: metadata.department || 'other',
    facilityType: metadata.facilityType || 'other',
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

function dailyBreakdown(achievements, fallbackProviderId) {
  const result = {};
  (achievements || []).forEach((item) => {
    const day = dayKeyForDate(item.achievedAt);
    const providerId = item.providerId || fallbackProviderId || '';
    if (!day || !providerId || !CATEGORY_KEYS.includes(item.key)) return;
    const key = day + '|' + providerId;
    if (!result[key]) {
      result[key] = {
        day,
        providerId,
        score: 0,
        activePatientCount: 1,
        categories: emptyCategories()
      };
    }
    const points = numeric(item.points);
    result[key].score += points;
    result[key].categories[item.key] += points;
  });
  return result;
}

async function applyDailyAchievementDelta(db, previous, next) {
  const previousValues = dailyBreakdown(
    previous && previous.achievements,
    previous && previous.providerId
  );
  const nextValues = dailyBreakdown(next.achievements, next.providerId);
  const keys = Array.from(new Set([
    ...Object.keys(previousValues),
    ...Object.keys(nextValues)
  ]));
  if (!keys.length) return;

  const metadataByProvider = new Map();
  for (const key of keys) {
    const providerId = (nextValues[key] || previousValues[key]).providerId;
    if (!metadataByProvider.has(providerId)) {
      metadataByProvider.set(providerId, await loadProvider(db, providerId));
    }
  }

  const writer = db.bulkWriter();
  keys.forEach((key) => {
    const oldValue = previousValues[key] || {
      score: 0, activePatientCount: 0, categories: emptyCategories()
    };
    const newValue = nextValues[key] || {
      score: 0, activePatientCount: 0, categories: emptyCategories()
    };
    const base = nextValues[key] || previousValues[key];
    const metadata = metadataByProvider.get(base.providerId);
    const categoryDeltas = {};
    CATEGORY_KEYS.forEach((category) => {
      categoryDeltas[category] = FieldValue.increment(
        numeric(newValue.categories[category]) - numeric(oldValue.categories[category])
      );
    });
    writer.set(dailySummaryRef(db, base.day, base.providerId), {
      day: base.day,
      providerId: base.providerId,
      providerName: metadata.providerName,
      providerType: metadata.providerType,
      township: metadata.township,
      region: metadata.region,
      facilityCode: metadata.facilityCode || '',
      department: metadata.department || 'other',
      facilityType: metadata.facilityType || 'other',
      score: FieldValue.increment(numeric(newValue.score) - numeric(oldValue.score)),
      activePatientCount: FieldValue.increment(
        numeric(newValue.activePatientCount) - numeric(oldValue.activePatientCount)
      ),
      categories: categoryDeltas,
      scoreVersion: SCORE_VERSION,
      calculatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
  });
  await writer.close();
}

async function savePatientContribution(db, patientId, month, providerId, calculated) {
  const providerBreakdown = calculated.providerBreakdown &&
    Object.keys(calculated.providerBreakdown).length
    ? calculated.providerBreakdown
    : (providerId && calculated.score > 0 ? {
        [providerId]: {
          score: calculated.score,
          activePatientCount: calculated.activePatientCount,
          categories: calculated.categories
        }
      } : {});
  const nextContribution = Object.assign({}, calculated, {
    patientId,
    providerId: providerId || null,
    providerBreakdown,
    updatedAt: serverTimestamp()
  });

  const contributionDocument = contributionRef(db, patientId, month);

  const previousContribution = await db.runTransaction(async (transaction) => {
    const contributionSnapshot = await transaction.get(contributionDocument);
    const previous = contributionSnapshot.exists
      ? contributionSnapshot.data()
      : zeroContribution(patientId, month);
    const previousBreakdown = previous.providerBreakdown &&
      Object.keys(previous.providerBreakdown).length
      ? previous.providerBreakdown
      : (previous.providerId ? {
          [previous.providerId]: {
            score: previous.score,
            activePatientCount: previous.activePatientCount,
            categories: previous.categories
          }
        } : {});
    const providerIds = Array.from(new Set([
      ...Object.keys(previousBreakdown),
      ...Object.keys(providerBreakdown)
    ]));
    const summaryReferences = providerIds.map((id) => summaryRef(db, month, id));
    const summarySnapshots = summaryReferences.length
      ? await transaction.getAll.apply(transaction, summaryReferences)
      : [];
    const summaryByProvider = new Map();
    summarySnapshots.forEach((snapshot) => {
      summaryByProvider.set(snapshot.id, snapshot.exists ? snapshot.data() : {});
    });

    for (const id of providerIds) {
      const oldValue = previousBreakdown[id] || zeroContribution(patientId, month);
      const newValue = providerBreakdown[id] || zeroContribution(patientId, month);
      const delta = {
        score: numeric(newValue.score) - numeric(oldValue.score),
        activePatientCount:
          numeric(newValue.activePatientCount) - numeric(oldValue.activePatientCount),
        categories: subtractCategories(newValue.categories, oldValue.categories)
      };
      const metadata = await loadProvider(db, id);
      transaction.set(
        summaryRef(db, month, id),
        summaryWithDelta(summaryByProvider.get(id), delta, metadata, month),
        { merge: true }
      );
    }

    if (Object.keys(providerBreakdown).length && nextContribution.score > 0) {
      transaction.set(contributionDocument, nextContribution, { merge: true });
    } else {
      transaction.delete(contributionDocument);
    }
    return previous;
  });

  if (month === ALL_TIME_PERIOD) {
    await applyDailyAchievementDelta(db, previousContribution, nextContribution);
  }
  return nextContribution;
}

async function recomputePatientMonth(db, patientId, month) {
  if (!patientId || !isLeaderboardPeriod(month)) {
    throw new Error('patientId and a valid leaderboard period are required.');
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
  const validMonths = Array.from(new Set((months || []).filter(isLeaderboardPeriod)));
  if (!patientId || !validMonths.length) return [];
  const loaded = await loadPatientActivity(db, patientId);
  return recomputeLoadedPatientMonths(db, patientId, validMonths, loaded);
}

async function recomputeLoadedPatientMonths(db, patientId, months, loaded) {
  const validMonths = Array.from(new Set((months || []).filter(isLeaderboardPeriod)));
  if (!patientId || !validMonths.length) return [];
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
    const breakdown = contribution.providerBreakdown &&
      Object.keys(contribution.providerBreakdown).length
      ? contribution.providerBreakdown
      : (contribution.providerId ? { [contribution.providerId]: contribution } : {});
    Object.entries(breakdown).forEach(([providerId, providerValue]) => {
      if (!providerId || !numeric(providerValue.score)) return;
      const current = totals.get(providerId) || {
        score: 0,
        activePatientCount: 0,
        categories: emptyCategories()
      };
      current.score += numeric(providerValue.score);
      current.activePatientCount += numeric(providerValue.activePatientCount);
      CATEGORY_KEYS.forEach((key) => {
        current.categories[key] += numeric(providerValue.categories && providerValue.categories[key]);
      });
      totals.set(providerId, current);
    });
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
      phone: metadata.phone || '',
      facilityCode: metadata.facilityCode || '',
      department: metadata.department || 'other',
      facilityType: metadata.facilityType || 'other',
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
  recomputeLoadedPatientMonths,
  rebuildProviderSummariesFromContributions,
  summaryWithDelta,
  zeroContribution
};
