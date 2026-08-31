'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildHrtProjection,
  buildKmcProjections,
  addCalendarMonths
} = require('../src/analytics/projections');
const { projectionHash } = require('../src/analytics/tracking-repository');

function facts(overrides) {
  return {
    id: 'mother-1',
    profile: {
      name: 'Mother One',
      patient_id: 'P-1',
      lmp: '2026-01-01',
      edd: '2026-10-08'
    },
    scope: {
      providerId: 'midwife-1',
      providerName: 'Midwife One',
      township: 'Alpha',
      region: 'North',
      facilityCode: '013',
      department: 'doph',
      facilityType: 'rhc'
    },
    antenatalVisits: [{
      data: {
        visitNumber: 1,
        visitDate: '2026-04-01',
        high_risk: 'yes',
        risk_factors: ['hypertension']
      }
    }],
    newbornVisits: [],
    hrtActions: [],
    kmcActions: [],
    ...overrides
  };
}

test('HRT row includes scope and manual next visit is authoritative', () => {
  const row = buildHrtProjection(facts({
    antenatalVisits: [
      { data: { visitNumber: 1, visitDate: '2026-04-01', high_risk: 'yes' } },
      {
        data: {
          visitNumber: 2,
          visitDate: '2026-05-01',
          high_risk: 'yes',
          nextVisitDate: '2026-05-20'
        }
      }
    ]
  }), { asOf: '2026-05-10' });
  assert.equal(row.dueDate, '2026-05-20');
  assert.equal(row.dueDateSource, 'manual_next_visit');
  assert.equal(row.providerId, 'midwife-1');
  assert.equal(row.department, 'doph');
  assert.equal(row.facilityType, 'rhc');
  assert.equal(row.status, 'on_track');
});

test('HRT explicit clinical completion takes precedence', () => {
  const row = buildHrtProjection(facts({
    birthAnchor: {
      value: new Date('2026-05-01T10:00:00Z'),
      source: 'delivery_notes',
      confirmed: true
    },
    hrtActions: [{
      data: {
        type: 'resolved',
        outcome: 'transfer',
        recordedAt: '2026-05-10'
      }
    }]
  }), { asOf: '2026-08-01' });
  assert.equal(row.status, 'complete');
  assert.equal(row.explicitCompletion, true);
  assert.equal(row.derivedCompletion, false);
  assert.equal(row.completionSource, 'clinical_action');
  assert.equal(row.outcome, 'transfer');
  assert.equal(row.completionDate, '2026-05-10');
});

test('HRT preserves structured completion reason and outcomes', () => {
  const row = buildHrtProjection(facts({
    hrtActions: [{
      data: {
        type: 'resolved',
        completionReason: 'completed',
        maternalOutcome: 'alive',
        newbornOutcome: 'death',
        recordedAt: '2026-05-10'
      }
    }]
  }), { asOf: '2026-05-11' });
  assert.equal(row.status, 'complete');
  assert.equal(row.completionReason, 'completed');
  assert.equal(row.maternalOutcome, 'alive');
  assert.equal(row.newbornOutcome, 'death');
});

test('HRT derives completion at confirmed birth plus 42 days', () => {
  const row = buildHrtProjection(facts({
    birthAnchor: {
      value: new Date('2026-05-01T23:30:00Z'),
      source: 'delivery_notes',
      confirmed: true
    }
  }), { asOf: '2026-06-12' });
  assert.equal(row.status, 'complete');
  assert.equal(row.completionDate, '2026-06-12');
  assert.equal(row.completionSource, 'confirmed_birth_plus_42d');
  assert.equal(row.postpartumAgeDays, 42);
});

test('HRT falls back to EDD plus 42 days without a confirmed birth', () => {
  const row = buildHrtProjection(facts({
    profile: {
      name: 'Mother One',
      lmp: '2026-01-01',
      edd: '2026-05-01'
    }
  }), { asOf: '2026-06-12' });
  assert.equal(row.status, 'complete');
  assert.equal(row.completionSource, 'edd_plus_42d');
  assert.equal(row.birthAnchorSource, 'edd');
  assert.equal(row.postpartumAgeDays, null);
});

test('KMC emits independent rows and completion for each baby', () => {
  const rows = buildKmcProjections(facts({
    newbornVisits: [{
      data: {
        visit_number: 1,
        visitDate: '2026-05-02',
        discharge_date: '2026-05-03',
        babies: [
          {
            babyIndex: 1,
            babyName: 'Baby A',
            birthTime: '2026-05-01T10:00:00Z',
            birthWeightGram: 1800
          },
          {
            babyIndex: 2,
            babyName: 'Baby B',
            birthTime: '2026-05-01T10:05:00Z',
            birthWeightGram: 1900
          }
        ],
        kmc_babies: [
          { babyIndex: 1, kmc_selected: 'yes' },
          { babyIndex: 2, kmc_selected: 'yes' }
        ]
      }
    }],
    kmcActions: [{
      data: {
        type: 'kmc_resolved',
        babyIndex: 1,
        outcome: 'alive',
        actionDate: '2026-05-20'
      }
    }]
  }), { asOf: '2026-06-01' });
  assert.equal(rows.length, 2);
  assert.equal(rows[0].status, 'complete');
  assert.equal(rows[0].explicitCompletion, true);
  assert.equal(rows[1].status, 'lost_to_followup');
  assert.equal(rows[1].explicitCompletion, false);
  assert.equal(rows[1].rowId, 'mother-1_2');
});

test('KMC derives completion at birth plus two calendar months', () => {
  const [row] = buildKmcProjections(facts({
    newbornVisits: [{
      data: {
        visit_number: 1,
        babies: [{
          babyIndex: 1,
          birthTime: '2026-01-31T10:00:00Z',
          birthWeightGram: 1800
        }],
        kmc_babies: [{ babyIndex: 1, kmc_selected: 'yes' }]
      }
    }]
  }), { asOf: '2026-03-31' });
  assert.equal(row.status, 'complete');
  assert.equal(row.completionDate, '2026-03-31');
  assert.equal(row.completionSource, 'birth_plus_2_calendar_months');
  assert.equal(row.postpartumAgeDays, 59);
});

test('calendar month addition clamps at month end', () => {
  assert.equal(
    addCalendarMonths('2026-01-31', 1).toISOString().slice(0, 10),
    '2026-02-28'
  );
});

test('projection hashes are stable and sensitive to clinical changes', () => {
  const row = buildHrtProjection(facts(), { asOf: '2026-04-02' });
  assert.equal(projectionHash(row), projectionHash({ ...row }));
  assert.notEqual(projectionHash(row), projectionHash({ ...row, status: 'complete' }));
});
