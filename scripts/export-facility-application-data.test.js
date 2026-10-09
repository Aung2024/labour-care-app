'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  canonicalNewbornBabies,
  babyIsPretermOrLbw,
  babyHasKmcYes,
  hasDeliveryNotes,
  isDashboardDelivered,
  isPilotFacilityCode,
  firstPncDays,
  pncTimingBucket,
  aggregateAccountActivity,
} = require('./export-facility-application-data');

function entry(id, data) {
  return { id, path: `test/${id}`, data };
}

test('canonical newborn helpers count twins once across repeated records', () => {
  const records = [
    entry('visit-1', {
      babies: [
        { babyIndex: 1, birth_weight_gram: 1800, birth_time: '2026-01-01' },
        { babyIndex: 2, birth_weight_gram: 2500, birth_time: '2026-01-01' },
      ],
    }),
    entry('visit-2', {
      kmc_babies: [
        { babyIndex: 1, kmc_selected: 'yes' },
        { babyIndex: 2, kmc_selected: 'no' },
      ],
    }),
  ];
  const babies = canonicalNewbornBabies(records);
  assert.equal(babies.length, 2);
  assert.equal(
    babyIsPretermOrLbw({ edd: '2026-02-01' }, babies[0], {}),
    true,
  );
  assert.equal(babyHasKmcYes(records, 1), true);
  assert.equal(babyHasKmcYes(records, 2), false);
});

test('delivery total counts only an actual deliveryNotes record', () => {
  assert.equal(hasDeliveryNotes(new Map([['deliveryNotes', {}]])), true);
  assert.equal(hasDeliveryNotes(new Map([['birthRecord', {}]])), false);
  assert.equal(hasDeliveryNotes(new Map([['thirdStage', {}]])), false);
});

test('dashboard delivery follows the current dashboard rule', () => {
  assert.equal(isDashboardDelivered(
    { status: 'anc' },
    [entry('pnc-1', { visitDate: '2026-01-02' })],
    new Map(),
    [],
    [],
  ), true);
  assert.equal(isDashboardDelivered(
    { status: 'anc' },
    [],
    new Map([['birthRecord', { deliveryDate: '2026-01-01' }]]),
    [],
    [],
  ), true);
  assert.equal(isDashboardDelivered(
    { status: 'anc' },
    [],
    new Map(),
    [],
    [],
  ), false);
});

test('pilot export includes only Pyinmana and Tatkon facilities', () => {
  assert.equal(isPilotFacilityCode('006'), true);
  assert.equal(isPilotFacilityCode('023'), true);
  assert.equal(isPilotFacilityCode('003'), false);
  assert.equal(isPilotFacilityCode(''), false);
});

test('PNC headcount timing buckets are mutually exclusive', () => {
  assert.equal(pncTimingBucket(0), 'pnc48h');
  assert.equal(pncTimingBucket(2), 'pnc48h');
  assert.equal(pncTimingBucket(3), 'pnc42d');
  assert.equal(pncTimingBucket(42), 'pnc42d');
  assert.equal(pncTimingBucket(43), 'pncAfter42d');
  assert.equal(pncTimingBucket(null), 'pncTimingUnknown');
});

test('PNC timing uses Delivery Notes and Yangon calendar days', () => {
  const records = new Map([[
    'deliveryNotes',
    {
      deliveryDetails: {
        babies: [{ birthTime: '2026-01-02T14:30' }],
      },
    },
  ]]);
  assert.equal(firstPncDays([
    entry('pnc-same-day', { visitDate: '2026-01-02' }),
  ], records), 0);
  assert.equal(firstPncDays([
    entry('pnc-day-two', { visitDate: '2026-01-04' }),
  ], records), 2);
  assert.equal(firstPncDays([
    entry('pnc-before-delivery', { visitDate: '2026-01-01' }),
  ], records), null);
});

test('account activity follows Midwife Report New/Old service logic', () => {
  const midwives = new Map([
    ['mw-a', { id: 'mw-a', name: 'A', facilityCode: '001' }],
    ['mw-b', { id: 'mw-b', name: 'B', facilityCode: '002' }],
  ]);
  const patients = new Map([
    ['patient-1', {
      id: 'patient-1',
      creatorId: 'mw-a',
      facilityCode: '001',
      data: { patient_type: 'mother', edd: '2026-02-01' },
    }],
  ]);
  const data = {
    midwives,
    patients,
    jointCareCounts: new Map([['mw-a', 2], ['mw-b', 1]]),
    antenatalVisits: new Map([['patient-1', [
      entry('anc-1', { visitDate: '2026-01-01', createdBy: 'mw-a' }),
      entry('anc-2', { visitDate: '2026-01-02', createdBy: 'mw-a' }),
      entry('anc-3', { visitDate: '2026-01-04' }),
    ]]]),
    postpartumVisits: new Map([['patient-1', [
      entry('pnc-1', { visitDate: '2026-01-03', recordedBy: 'mw-a' }),
    ]]]),
    newbornCare: new Map([['patient-1', [
      entry('nb-1', {
        visitDate: '2026-01-04',
        createdBy: 'mw-b',
        body_weight_gram: 1800,
        birth_time: '2026-01-01',
        kmc_selected: 'yes',
      }),
    ]]]),
    immediateNewbornCare: new Map(),
    labourCare: new Map([['patient-1', [
      entry('labour-1', { labourDate: '2026-01-04', createdBy: 'mw-a' }),
    ]]]),
    records: new Map([['patient-1', [
      entry('transferRecord', { recordedBy: 'mw-b' }),
    ]]]),
  };

  const result = aggregateAccountActivity(data);
  const a = result.get('mw-a');
  const b = result.get('mw-b');
  assert.equal(a.activeJointCare, 2);
  assert.equal(a.ownedRegistered, 1);
  assert.equal(a.ancServices, 3);
  assert.equal(a.ancNew, 1);
  assert.equal(a.ancOld, 2);
  assert.equal(a.pncNew, 0);
  assert.equal(a.pncOld, 1);
  assert.equal(a.fallbackAttributedServices, 1);
  assert.equal(b.activeJointCare, 1);
  assert.equal(b.newbornServices, 1);
  assert.equal(b.newbornNew, 1);
  assert.equal(b.transfersRecorded, 1);
  assert.equal(b.pretermLbwBabies, 1);
  assert.equal(b.kmcYesBabies, 1);
});
