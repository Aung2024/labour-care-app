'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  SCORE_VERSION,
  calculatePatientContribution,
  buildPatientAchievements,
  hasCompletedImmediateNewbornCare,
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
  // First-ANC is a lifetime achievement and was earned in July.
  assert.equal(result.categories.ancVisits, 0);
  assert.equal(result.categories.completeANC, 0);
  assert.equal(result.categories.labTests, 1);
  assert.equal(result.score, 4);
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

test('all-time scores activity across months', () => {
  const result = calculatePatientContribution({
    name: 'Patient',
    age: 28,
    phone: '091234567',
    address: 'Village',
    township: 'Test Township',
    village: 'Test Village',
    registration_date: '2026-07-02'
  }, {
    ancVisits: [
      { visitDate: '2026-07-05', lmp: '2026-01-01', visitNumber: 1 },
      { visitDate: '2026-08-05', lmp: '2026-01-01', visitNumber: 2 },
      { visitDate: '2026-09-05', lmp: '2026-01-01', visitNumber: 3 },
      { visitDate: '2026-10-05', lmp: '2026-01-01', visitNumber: 4 }
    ],
    pncVisits: [],
    labTests: [{ testDate: '2026-08-06' }],
    immediateNewbornCare: [],
    newbornCare: [],
    summary: null,
    startingTime: null,
    secondStage: null,
    transferRecord: null
  }, 'all');

  assert.equal(result.categories.registration, 1);
  assert.equal(result.categories.completeRegistration, 2);
  assert.equal(result.categories.ancVisits, 1);
  assert.equal(result.categories.anc4Plus, 1);
  assert.equal(result.categories.completeANC, 2);
  assert.equal(result.categories.labTests, 1);
  assert.equal(result.score, 8);
});

test('all-time scores completed labour care regardless of month', () => {
  const result = calculatePatientContribution({}, {
    summary: { startingTime: '09:00', timestamp: '2026-01-03T09:00:00Z' },
    secondStage: { secondStageStartTime: '12:00', timestamp: '2026-01-03T12:00:00Z' }
  }, 'all');

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

test('awards delivery, immediate newborn, and KMC milestones once per patient', () => {
  const result = calculatePatientContribution({ created_by: 'owner' }, {
    deliveryNotes: {
      updatedAt: '2026-08-04',
      deliveryDetails: { babies: [{ birthTime: '2026-08-04', outcome: 'alive' }] },
      recordedBy: 'delivery-provider'
    },
    immediateNewbornCare: [
      { createdAt: '2026-08-04', completed: true, recordedBy: 'newborn-provider' },
      { createdAt: '2026-08-05', completed: true, recordedBy: 'newborn-provider' }
    ],
    newbornCare: [
      { visitDate: '2026-08-05', kmc_selected: 'yes', recordedBy: 'newborn-provider' },
      { visitDate: '2026-08-06', kmc_selected: 'yes', recordedBy: 'newborn-provider' }
    ]
  }, '2026-08');

  assert.equal(result.categories.deliveryNotes, 1);
  assert.equal(result.categories.immediateNewbornCare, 1);
  assert.equal(result.categories.kmcYes, 1);
  assert.equal(result.providerBreakdown['delivery-provider'].score, 1);
  assert.equal(result.providerBreakdown['newborn-provider'].score, 3);
});

test('achievement milestones do not repeat in later monthly periods', () => {
  const patient = { created_by: 'provider', registration_date: '2026-06-01' };
  const activity = {
    ancVisits: [
      { visitDate: '2026-06-02', visitNumber: 1, lmp: '2026-01-01' },
      { visitDate: '2026-07-02', visitNumber: 2, lmp: '2026-01-01' }
    ]
  };
  assert.equal(
    buildPatientAchievements(patient, activity).filter((item) => item.key === 'ancVisits').length,
    1
  );
  assert.equal(calculatePatientContribution(patient, activity, '2026-07').categories.ancVisits, 0);
});

test('scores delivery note and first KMC Yes on year periods and baby arrays', () => {
  const result = calculatePatientContribution({ created_by: 'provider' }, {
    deliveryNotes: {
      updatedAt: '2026-03-12',
      deliveryDetails: { modeOfDelivery: 'vaginal' }
    },
    newbornCare: [
      {
        visitDate: '2026-04-02',
        kmc_babies: [{ kmc_selected: 'yes' }]
      },
      {
        visitDate: '2026-05-02',
        kmc_selected: 'yes'
      }
    ]
  }, '2026');

  assert.equal(result.categories.deliveryNotes, 1);
  assert.equal(result.categories.kmcYes, 1);
  assert.equal(result.categories.newbornCare, 1);
});

test('supports year periods', () => {
  const result = calculatePatientContribution({
    created_by: 'provider',
    registration_date: '2026-06-01'
  }, {}, '2026');
  assert.equal(result.categories.registration, 1);
});

test('immediate newborn completion requires clinical content', () => {
  assert.equal(hasCompletedImmediateNewbornCare({
    patientId: 'patient-1',
    recordedBy: 'provider-1',
    timestamp: '2026-08-04T00:00:00Z',
    thorough_drying: false,
    spontaneous_breathing: false,
    gasping_or_no_breathing: false
  }), false);
  assert.equal(hasCompletedImmediateNewbornCare({
    timestamp: '2026-08-04T00:00:00Z',
    spontaneous_breathing: true
  }), true);
  assert.equal(hasCompletedImmediateNewbornCare({
    timestamp: '2026-08-04T00:00:00Z',
    apgar_1min: 0
  }), true);
});
