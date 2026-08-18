'use strict';

/**
 * Contracts reserved for later tracking backends. They intentionally do not
 * write collections in the Dashboard V2 phase.
 */
const HRT_PROJECTION_CONTRACT = Object.freeze({
  schemaVersion: 'tracking-hrt-v1',
  collection: 'tracking_v2_hrt',
  documentKey: '{patientId}',
  fields: Object.freeze([
    'patientId', 'eligible', 'status', 'dueDate', 'daysLate', 'riskFactors',
    'visitCount', 'outcome', 'providerId', 'township', 'region', 'updatedAt'
  ])
});

const KMC_PROJECTION_CONTRACT = Object.freeze({
  schemaVersion: 'tracking-kmc-v1',
  collection: 'tracking_v2_kmc',
  documentKey: '{patientId}_{babyIndex}',
  fields: Object.freeze([
    'patientId', 'babyIndex', 'eligible', 'enrolled', 'status', 'dueDate',
    'visitCount', 'outcome', 'providerId', 'township', 'region', 'updatedAt'
  ])
});

function projectionWriterContract(name) {
  if (name === 'hrt') return HRT_PROJECTION_CONTRACT;
  if (name === 'kmc') return KMC_PROJECTION_CONTRACT;
  throw new Error('Unknown projection writer contract: ' + name);
}

module.exports = {
  HRT_PROJECTION_CONTRACT,
  KMC_PROJECTION_CONTRACT,
  projectionWriterContract
};
