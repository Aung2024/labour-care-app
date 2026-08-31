'use strict';

const crypto = require('node:crypto');
const { FieldValue } = require('firebase-admin/firestore');
const {
  HRT_COLLECTION,
  KMC_COLLECTION,
  buildHrtProjection,
  buildKmcProjections
} = require('./projections');
const { loadClinicalFacts } = require('./repository');
const { loadProvider } = require('../leaderboard/repository');

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce((result, key) => {
      if (value[key] !== undefined) result[key] = stableValue(value[key]);
      return result;
    }, {});
  }
  return value;
}

function projectionHash(row) {
  return crypto.createHash('sha256')
    .update(JSON.stringify(stableValue(row)))
    .digest('hex');
}

async function writeIfChanged(ref, row) {
  const hash = projectionHash(row);
  const existing = await ref.get();
  if (existing.exists && existing.data().projectionHash === hash) return false;
  await ref.set({
    ...row,
    projectionHash: hash,
    calculatedAt: FieldValue.serverTimestamp()
  });
  return true;
}

async function savePatientProjections(database, facts, options) {
  const patientId = facts && facts.id;
  if (!patientId) throw new Error('Patient facts require an id.');
  const buildOptions = {
    ...(options || {}),
    asOf: options && options.asOf || new Date()
  };
  const hrt = buildHrtProjection(facts, buildOptions);
  const kmc = buildKmcProjections(facts, buildOptions);
  const hrtRef = database.collection(HRT_COLLECTION).doc(patientId);
  let writes = 0;
  if (hrt) {
    if (await writeIfChanged(hrtRef, hrt)) writes += 1;
  } else {
    const current = await hrtRef.get();
    if (current.exists) {
      await hrtRef.delete();
      writes += 1;
    }
  }

  const existing = await database.collection(KMC_COLLECTION)
    .where('patientId', '==', patientId).get();
  const wantedIds = new Set(kmc.map((row) => row.rowId));
  for (const snapshot of existing.docs) {
    if (!wantedIds.has(snapshot.id)) {
      await snapshot.ref.delete();
      writes += 1;
    }
  }
  for (const row of kmc) {
    if (await writeIfChanged(
      database.collection(KMC_COLLECTION).doc(row.rowId), row
    )) writes += 1;
  }
  return { patientId, hrt: !!hrt, kmc: kmc.length, writes };
}

async function recomputePatientProjections(database, patientId, options) {
  const facts = await loadClinicalFacts(database, patientId);
  if (!facts) {
    const hrtRef = database.collection(HRT_COLLECTION).doc(patientId);
    const kmc = await database.collection(KMC_COLLECTION)
      .where('patientId', '==', patientId).get();
    const writer = database.bulkWriter();
    writer.delete(hrtRef);
    kmc.docs.forEach((snapshot) => writer.delete(snapshot.ref));
    await writer.close();
    return { patientId, deleted: true };
  }
  if (facts.scope && facts.scope.providerId) {
    const provider = await loadProvider(database, facts.scope.providerId);
    facts.scope = {
      ...facts.scope,
      providerName: provider.providerName || facts.scope.providerName,
      providerPhone: provider.phone || '',
      township: provider.township || facts.scope.township,
      region: provider.region || facts.scope.region,
      facilityCode: provider.facilityCode || facts.scope.facilityCode,
      department: provider.department || facts.scope.department,
      facilityType: provider.facilityType || facts.scope.facilityType
    };
  }
  const existingFlags = facts.profile && facts.profile.infection_flags || {};
  if (JSON.stringify(stableValue(existingFlags)) !==
      JSON.stringify(stableValue(facts.infectionFlags || {}))) {
    await database.collection('patients').doc(patientId).set({
      infection_flags: facts.infectionFlags || {},
      infection_alert_updated_at: FieldValue.serverTimestamp()
    }, { merge: true });
  }
  return savePatientProjections(database, facts, options);
}

module.exports = {
  projectionHash,
  writeIfChanged,
  savePatientProjections,
  recomputePatientProjections
};
