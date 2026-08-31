const test = require('node:test');
const assert = require('node:assert/strict');
const utils = require('../../js/anc-workflow-utils.js');

test('Naegele EDD adds seven days and nine calendar months', () => {
  assert.equal(utils.calculateNaegeleEdd('2026-01-01'), '2026-10-08');
  assert.equal(utils.calculateNaegeleEdd('2024-05-25'), '2025-03-01');
  assert.equal(utils.calculateNaegeleEdd(''), '');
});

test('legacy medication values remain readable', () => {
  assert.equal(utils.normalizeMedicationStatus('Given'), 'Prescribed');
  assert.equal(utils.normalizeMedicationStatus('Not Given'), 'Not Prescribed');
  assert.equal(utils.normalizeMedicationStatus('Yes'), 'Prescribed');
  assert.equal(utils.normalizeMedicationStatus('Already Prescribed'), 'Already Prescribed');
  assert.equal(utils.isMedicationPrescribed('Given'), true);
  assert.equal(utils.isMedicationPrescribed('Prescribed'), true);
});

test('next visit number uses maximum persisted value', () => {
  assert.equal(utils.nextVisitNumber([
    { visitNumber: 1 },
    { visitNumber: 4 },
    { visit_number: 2 }
  ]), 5);
  assert.equal(utils.nextVisitNumber([]), 1);
});
