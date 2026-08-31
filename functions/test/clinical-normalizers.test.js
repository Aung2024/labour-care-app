'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {
  FACILITY_TAXONOMY,
  facilityTaxonomy
} = require('../src/shared/facility-taxonomy');
const {
  normalizeOutcome,
  normalizeInfectionResult,
  infectionFlags,
  resolveBirthAnchor,
  resolveServiceProvider
} = require('../src/shared/clinical-normalizers');

test('browser and Functions facility taxonomies remain aligned', () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, '../../js/facility-config.js'),
    'utf8'
  );
  const context = { window: {}, localStorage: { getItem: () => 'en' } };
  vm.runInNewContext(source, context);
  const browserFacilities = context.window.FacilityConfig.getFacilities();
  assert.equal(browserFacilities.length, Object.keys(FACILITY_TAXONOMY).length);
  browserFacilities.forEach((facility) => {
    assert.deepEqual(
      [facility.department, facility.facilityType],
      Array.from(FACILITY_TAXONOMY[facility.code])
    );
  });
});

test('unknown facilities use safe reporting taxonomy', () => {
  assert.deepEqual(facilityTaxonomy('999'), {
    facilityCode: '999',
    department: 'other',
    facilityType: 'other'
  });
});

test('normalizes clinical outcomes and infection results', () => {
  assert.equal(normalizeOutcome('Still Birth'), 'stillbirth');
  assert.equal(normalizeOutcome('Lost to follow up'), 'loss_of_contact');
  assert.equal(normalizeInfectionResult('Reactive'), 'positive');
  assert.equal(normalizeInfectionResult('Non-reactive'), 'negative');
});

test('latest result per analyte determines infection flags', () => {
  const flags = infectionFlags([
    { data: { testDate: '2026-01-01', hivResult: 'Negative' } },
    { data: { testDate: '2026-02-01', hivResult: 'Reactive', syphilisResult: 'Positive' } },
    { data: { testDate: '2026-03-01', hivResult: 'Negative', hepatitisBResult: 'Negative' } },
    { data: { testDate: '2026-04-01', hepatitisBResult: 'Detected' } }
  ]);
  assert.equal(flags.hiv, undefined);
  assert.equal(flags.vdrl.result, 'positive');
  assert.equal(flags.hepatitisB.result, 'positive');
});

test('browser infection alerts also clear an older positive after a newer negative', () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, '../../js/infection-alerts.js'),
    'utf8'
  );
  const context = { window: {} };
  vm.runInNewContext(source, context);
  const flags = context.window.InfectionAlerts.collectFlags([
    { testDate: '2026-02-01', hivResult: 'Reactive', syphilisResult: 'Negative' },
    { testDate: '2026-03-01', hivResult: 'Negative', syphilisResult: 'Positive' }
  ]);
  assert.equal(flags.hiv, undefined);
  assert.equal(flags.vdrl.result, 'positive');
});

test('birth anchor prioritizes delivery notes and reports conflicts', () => {
  const result = resolveBirthAnchor({
    deliveryNotes: {
      data: { deliveryDetails: { babies: [{ birthTime: '2026-03-01T10:00:00Z' }] } }
    },
    postpartumVisits: [
      { data: { deliveredDateTime: '2026-03-03T10:00:00Z' } }
    ]
  });
  assert.equal(result.source, 'delivery_notes');
  assert.equal(result.conflicts.length, 1);
});

test('service provider takes precedence over patient owner', () => {
  assert.deepEqual(
    resolveServiceProvider({ recordedBy: 'provider-b' }, { created_by: 'provider-a' }),
    { providerId: 'provider-b', attributionSource: 'service' }
  );
  assert.deepEqual(
    resolveServiceProvider({}, { created_by: 'provider-a' }),
    { providerId: 'provider-a', attributionSource: 'patient_owner' }
  );
});
