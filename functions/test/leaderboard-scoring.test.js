'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  SCORE_VERSION,
  calculatePatientContribution,
  monthKeyForDate,
  recentMonthKeys
} = require('../src/leaderboard/scoring');

test('scores only activity from the selected month', () => {
  const result = calculatePatientContribution({
    name: 'Patient',
    age: 28,
    phone: '091234567',
    address: 'Village',
    township: 'Test Township',
    village: 'Test Village',
    registration_date: '2026-08-02'
  }, {
    ancVisits: [
      { visitDate: '2026-08-05', lmp: '2026-01-01', visitNumber: 1 },
      { visitDate: '2026-07-05', lmp: '2026-01-01', visitNumber: 1 }
    ],
    pncVisits: [],
    labTests: [{ testDate: '2026-08-06' }],
    immediateNewbornCare: [],
    newbornCare: [],
    summary: null,
    startingTime: null,
    secondStage: null,
    transferRecord: null
  }, '2026-08');

  assert.equal(result.scoreVersion, SCORE_VERSION);
  assert.equal(result.categories.registration, 1);
  assert.equal(result.categories.completeRegistration, 2);
  assert.equal(result.categories.ancVisits, 1);
  assert.equal(result.categories.completeANC, 2);
  assert.equal(result.categories.labTests, 1);
  assert.equal(result.score, 7);
  assert.equal(result.activePatientCount, 1);
});

test('returns zero for a patient without selected-month activity', () => {
  const result = calculatePatientContribution({
    registration_date: '2026-07-02'
  }, {
    ancVisits: [{ visitDate: '2026-07-05' }]
  }, '2026-08');

  assert.equal(result.score, 0);
  assert.equal(result.activePatientCount, 0);
});

test('scores ANC visit milestones using selected-month visits', () => {
  const visits = Array.from({ length: 8 }, (_, index) => ({
    visitDate: `2026-08-${String(index + 1).padStart(2, '0')}`,
    lmp: '2026-01-01',
    visit_number: index + 1
  }));
  const result = calculatePatientContribution({}, { ancVisits: visits }, '2026-08');

  assert.equal(result.categories.ancVisits, 1);
  assert.equal(result.categories.anc4Plus, 1);
  assert.equal(result.categories.anc8Plus, 1);
  assert.equal(result.categories.completeANC, 2);
  assert.equal(result.score, 5);
});

test('scores completed labour care only when recorded in selected month', () => {
  const result = calculatePatientContribution({}, {
    summary: { startingTime: '09:00', timestamp: '2026-08-03T09:00:00Z' },
    secondStage: { secondStageStartTime: '12:00', timestamp: '2026-08-03T12:00:00Z' }
  }, '2026-08');

  assert.equal(result.categories.lcgCompleted, 1);
});

test('returns current and previous month keys', () => {
  assert.deepEqual(
    recentMonthKeys(3, new Date('2026-01-15T00:00:00Z')),
    ['2026-01', '2025-12', '2025-11']
  );
});

test('uses the Asia/Yangon month at UTC month boundaries', () => {
  assert.equal(monthKeyForDate(new Date('2026-07-31T18:30:00Z')), '2026-08');
});
