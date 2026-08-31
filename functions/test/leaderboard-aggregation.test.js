'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { aggregateDailyRows } = require('../src/leaderboard/functions');
const {
  periodsForLoadedPatient
} = require('../src/analytics/refresh-queue-functions');

test('custom range totals do not report patient-days as distinct patients', () => {
  const providers = aggregateDailyRows([
    {
      providerId: 'provider-1',
      providerName: 'Provider One',
      score: 2,
      activePatientCount: 1,
      categories: { registration: 2 }
    },
    {
      providerId: 'provider-1',
      providerName: 'Provider One',
      score: 3,
      activePatientCount: 1,
      categories: { ancVisits: 3 }
    }
  ]);

  assert.equal(providers.length, 1);
  assert.equal(providers[0].score, 5);
  assert.equal(providers[0].activePatientCount, null);
  assert.equal(providers[0].categories.registration, 2);
  assert.equal(providers[0].categories.ancVisits, 3);
});

test('single-day custom range retains its accurate distinct patient count', () => {
  const providers = aggregateDailyRows([{
    providerId: 'provider-1',
    score: 2,
    activePatientCount: 2
  }], {
    start: '2026-08-04',
    end: '2026-08-04'
  });

  assert.equal(providers[0].activePatientCount, 2);
});

test('refresh queue includes every loaded achievement month and year', () => {
  const periods = periodsForLoadedPatient({
    patient: {
      created_by: 'provider-1',
      registration_date: '2025-11-20'
    },
    activity: {
      ancVisits: [
        { visitDate: '2026-01-03', visitNumber: 1, lmp: '2025-06-01' },
        { visitDate: '2026-04-03', visitNumber: 2, lmp: '2025-06-01' }
      ],
      labTests: [{ testDate: '2026-03-09' }]
    }
  }, new Date('2026-08-01T00:00:00Z'));

  assert.deepEqual(new Set(periods), new Set([
    'all',
    '2025-11',
    '2025',
    '2026-01',
    '2026-03',
    '2026-04',
    '2026'
  ]));
});
