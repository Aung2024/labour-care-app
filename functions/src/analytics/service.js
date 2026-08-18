'use strict';

const { FieldValue } = require('firebase-admin/firestore');
const {
  ANALYTICS_SCHEMA_VERSION,
  calculatePatientMetrics,
  emptyMetrics,
  mergeMetrics,
  isAnalyticsPeriod
} = require('./metrics');

const CONTRIBUTION_COLLECTION = 'analytics_v2_contributions';
const PERIOD_COLLECTION = 'analytics_v2_periods';

function scopeDocId(scopeType, scopeId) {
  return scopeType + ':' + encodeURIComponent(String(scopeId || 'unknown'));
}

function contributionDocId(period, patientId) {
  return period + '_' + patientId;
}

function contributionRef(db, period, patientId) {
  return db.collection(CONTRIBUTION_COLLECTION).doc(contributionDocId(period, patientId));
}

function scopeRef(db, period, scopeType, scopeId) {
  return db.collection(PERIOD_COLLECTION)
    .doc(period)
    .collection('scopes')
    .doc(scopeDocId(scopeType, scopeId));
}

function scopeDescriptors(facts) {
  const scope = facts.scope || {};
  const result = [{
    scopeType: 'national',
    scopeId: 'all',
    region: '',
    township: '',
    providerId: ''
  }];
  if (scope.region) {
    result.push({
      scopeType: 'region',
      scopeId: scope.region,
      region: scope.region,
      township: '',
      providerId: ''
    });
  }
  if (scope.township) {
    result.push({
      scopeType: 'township',
      scopeId: scope.township,
      region: scope.region || '',
      township: scope.township,
      providerId: ''
    });
  }
  if (scope.providerId) {
    result.push({
      scopeType: 'provider',
      scopeId: scope.providerId,
      providerName: scope.providerName || '',
      region: scope.region || '',
      township: scope.township || '',
      providerId: scope.providerId
    });
  }
  return result;
}

async function saveAnalyticsContribution(db, facts, period, runId) {
  if (!facts || !facts.id || !isAnalyticsPeriod(period)) return null;
  const metrics = calculatePatientMetrics(facts, period);
  const contribution = {
    patientId: facts.id,
    period: period.key,
    schemaVersion: ANALYTICS_SCHEMA_VERSION,
    runId: runId || 'live',
    scopes: scopeDescriptors(facts),
    metrics,
    updatedAt: FieldValue.serverTimestamp()
  };
  await contributionRef(db, period.key, facts.id).set(contribution);
  return contribution;
}

async function saveAnalyticsContributions(db, facts, periods, runId) {
  const valid = Array.from(new Map((periods || [])
    .filter(isAnalyticsPeriod)
    .map((period) => [period.key, period])).values());
  const results = [];
  for (const period of valid) {
    results.push(await saveAnalyticsContribution(db, facts, period, runId));
  }
  return results;
}

function addScopeTotal(totals, descriptor, metrics) {
  const key = scopeDocId(descriptor.scopeType, descriptor.scopeId);
  if (!totals.has(key)) {
    totals.set(key, {
      descriptor,
      metrics: emptyMetrics()
    });
  }
  const current = totals.get(key);
  current.metrics = mergeMetrics(current.metrics, metrics);
}

async function rebuildAnalyticsScopes(db, period, runId) {
  if (!isAnalyticsPeriod(period)) throw new Error('A valid analytics period is required.');
  const snapshot = await db.collection(CONTRIBUTION_COLLECTION)
    .where('period', '==', period.key)
    .get();
  const totals = new Map();
  let activeContributionCount = 0;
  snapshot.forEach((doc) => {
    const contribution = doc.data() || {};
    if (runId && contribution.runId !== runId) return;
    activeContributionCount += 1;
    (contribution.scopes || []).forEach((descriptor) => {
      addScopeTotal(totals, descriptor, contribution.metrics || {});
    });
  });

  const scopes = db.collection(PERIOD_COLLECTION).doc(period.key).collection('scopes');
  const existing = await scopes.get();
  const writer = db.bulkWriter();
  if (runId) {
    snapshot.forEach((doc) => {
      if ((doc.data() || {}).runId !== runId) writer.delete(doc.ref);
    });
  }
  existing.forEach((doc) => {
    if (!totals.has(doc.id)) writer.delete(doc.ref);
  });
  for (const [id, total] of totals.entries()) {
    writer.set(scopes.doc(id), Object.assign({}, total.descriptor, {
      period: period.key,
      schemaVersion: ANALYTICS_SCHEMA_VERSION,
      metrics: total.metrics,
      calculatedAt: FieldValue.serverTimestamp(),
      reconciliationStatus: 'complete'
    }));
  }
  await writer.close();

  await db.collection(PERIOD_COLLECTION).doc(period.key).set({
    period: period.key,
    periodType: period.type,
    start: period.start ? period.start.toISOString() : null,
    end: period.end ? period.end.toISOString() : null,
    schemaVersion: ANALYTICS_SCHEMA_VERSION,
    scopeCount: totals.size,
    contributionCount: activeContributionCount,
    runId: runId || 'live',
    calculatedAt: FieldValue.serverTimestamp(),
    reconciliationStatus: 'complete'
  }, { merge: true });
  return { period: period.key, scopeCount: totals.size, contributionCount: snapshot.size };
}

module.exports = {
  CONTRIBUTION_COLLECTION,
  PERIOD_COLLECTION,
  scopeDocId,
  contributionDocId,
  scopeDescriptors,
  saveAnalyticsContribution,
  saveAnalyticsContributions,
  rebuildAnalyticsScopes
};
