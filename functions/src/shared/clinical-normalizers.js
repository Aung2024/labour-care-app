'use strict';

const POSITIVE_RESULT_VALUES = new Set([
  'positive', 'reactive', 'detected', 'pos', '+'
]);

function unwrap(value) {
  return value && value.data && typeof value.data === 'object' ? value.data : value;
}

function toDate(value) {
  if (value == null || value === '') return null;
  if (typeof value.toDate === 'function') return value.toDate();
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value : null;
  if (typeof value === 'object' && typeof value.seconds === 'number') {
    return new Date(value.seconds * 1000);
  }
  if (typeof value === 'number') {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date : null;
  }
  const text = String(value).trim();
  if (!text || /^\d{1,2}:\d{2}(:\d{2})?$/.test(text)) return null;
  const date = new Date(text.length === 10 ? text + 'T00:00:00Z' : text);
  return Number.isFinite(date.getTime()) ? date : null;
}

function firstDate(record, fields) {
  const data = unwrap(record) || {};
  for (const field of fields) {
    const date = toDate(data[field]);
    if (date) return date;
  }
  return null;
}

function normalizeOutcome(value) {
  const key = String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (['alive', 'live', 'living', 'discharged_alive'].includes(key)) return 'alive';
  if (['death', 'dead', 'died', 'maternal_death', 'newborn_death'].includes(key)) return 'death';
  if (['stillbirth', 'still_birth', 'stillborn'].includes(key)) return 'stillbirth';
  if (['transfer', 'transferred', 'referred'].includes(key)) return 'transfer';
  if (['abortion', 'miscarriage', 'pregnancy_loss'].includes(key)) return 'abortion';
  if (['loss_of_contact', 'lost_to_followup', 'lost_to_follow_up'].includes(key)) {
    return 'loss_of_contact';
  }
  return key || null;
}

function normalizeInfectionResult(value) {
  const normalized = String(value == null ? '' : value).trim().toLowerCase();
  if (!normalized || ['-', 'n/a', 'na', 'no test yet', 'not tested', 'unknown'].includes(normalized)) {
    return 'unknown';
  }
  if (POSITIVE_RESULT_VALUES.has(normalized)) return 'positive';
  if (['negative', 'non-reactive', 'nonreactive', 'not detected', 'neg'].includes(normalized)) {
    return 'negative';
  }
  if (['indeterminate', 'inconclusive', 'equivocal'].includes(normalized)) return 'indeterminate';
  return normalized;
}

function infectionFlags(testRecords) {
  const definitions = {
    hiv: ['hivResult', 'hiv_result'],
    hepatitisB: ['hepatitisBResult', 'hepatitis_b_result', 'hbsAgResult'],
    hepatitisC: ['hepatitisCResult', 'hepatitis_c_result', 'hcvResult'],
    vdrl: ['syphilisResult', 'vdrlResult', 'vdrl_result']
  };
  const flags = {};
  for (const [infection, fields] of Object.entries(definitions)) {
    let latest = null;
    for (const entry of testRecords || []) {
      const data = unwrap(entry) || {};
      const value = fields.find((field) => data[field] != null && data[field] !== '');
      if (!value) continue;
      const result = normalizeInfectionResult(data[value]);
      if (result !== 'positive') continue;
      const date = firstDate(data, ['testDate', 'visitDate', 'recordedAt', 'createdAt', 'timestamp']);
      if (!latest || (date && (!latest.date || date > latest.date))) {
        latest = { result, date, sourceField: value };
      }
    }
    if (latest) {
      flags[infection] = {
        result: latest.result,
        testedAt: latest.date ? latest.date.toISOString() : null,
        sourceField: latest.sourceField
      };
    }
  }
  return flags;
}

function deliveryNoteBirthDate(deliveryNotes) {
  const notes = unwrap(deliveryNotes) || {};
  const details = notes.deliveryDetails || {};
  const babies = Array.isArray(details.babies) ? details.babies : [];
  for (const baby of babies) {
    const date = firstDate(baby, ['birthTime', 'birth_time', 'dateOfBirth', 'date_of_birth']);
    if (date) return date;
  }
  return firstDate(notes, ['birthTime', 'birth_time', 'deliveredDateTime', 'deliveryDate']);
}

function resolveBirthAnchor(facts) {
  const data = facts || {};
  const candidates = [
    { source: 'delivery_notes', date: deliveryNoteBirthDate(data.deliveryNotes) },
    {
      source: 'pnc_visit_1',
      date: firstDate((data.postpartumVisits || [])[0], [
        'deliveredDateTime', 'birth_time', 'birthTime', 'deliveryDate'
      ])
    },
    {
      source: 'newborn_visit_1',
      date: firstDate((data.newbornVisits || data.newbornCare || [])[0], [
        'birth_time', 'birthTime', 'date_of_birth'
      ])
    },
    {
      source: 'linked_baby',
      date: firstDate(data.linkedBaby || data.newbornFacts, [
        'birthDate', 'date_of_birth', 'birth_time', 'birthTime'
      ])
    },
    {
      source: 'patient',
      date: firstDate(data.patient || data.profile, [
        'birth_time', 'deliveredDateTime', 'date_of_birth', 'deliveryDate'
      ])
    }
  ].filter((candidate) => candidate.date);

  if (!candidates.length) return null;
  const selected = candidates[0];
  const day = 24 * 60 * 60 * 1000;
  const conflicts = candidates.slice(1)
    .filter((candidate) => Math.abs(candidate.date - selected.date) >= day)
    .map((candidate) => ({
      source: candidate.source,
      value: candidate.date.toISOString()
    }));
  return {
    value: selected.date,
    iso: selected.date.toISOString(),
    source: selected.source,
    confirmed: selected.source !== 'patient',
    conflicts
  };
}

function resolveServiceProvider(record, patient) {
  const data = unwrap(record) || {};
  const profile = unwrap(patient) || {};
  const providerId = data.recordedBy || data.recorded_by || data.createdBy ||
    data.created_by || data.updatedBy || profile.created_by || profile.createdBy || '';
  return {
    providerId,
    attributionSource: (
      data.recordedBy || data.recorded_by || data.createdBy || data.created_by || data.updatedBy
    ) ? 'service' : 'patient_owner'
  };
}

module.exports = {
  POSITIVE_RESULT_VALUES,
  unwrap,
  toDate,
  firstDate,
  normalizeOutcome,
  normalizeInfectionResult,
  infectionFlags,
  deliveryNoteBirthDate,
  resolveBirthAnchor,
  resolveServiceProvider
};
