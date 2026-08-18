'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  ANALYTICS_SCHEMA_VERSION,
  INDICATOR_REGISTRY,
  periodForKey,
  periodKeyForDate,
  normalizePeriod,
  emptyMetrics,
  calculatePatientMetrics,
  mergeMetrics,
  calculateMetrics
} = require('../src/analytics/metrics');

function wrapped(data, id = 'record') {
  return { id, data };
}

function fullLab(overrides) {
  return wrapped(Object.assign({
    testDate: '2026-08-04',
    hivResult: 'Reactive',
    malariaResult: 'Negative',
    syphilisResult: 'Negative',
    hepatitisBResult: 'Negative',
    hepatitisCResult: 'Negative',
    hemoglobinResult: '6.8',
    bloodGroup: 'O',
    rhFactor: 'Positive',
    ultrasoundServices: 'Yes'
  }, overrides));
}

test('exports a versioned registry and complete empty metric shape', () => {
  assert.match(ANALYTICS_SCHEMA_VERSION, /^analytics-v\d+$/);
  assert.ok(INDICATOR_REGISTRY.some((indicator) => indicator.key === 'total'));
  assert.ok(INDICATOR_REGISTRY.some((indicator) => indicator.key === 'monthlyHighRiskByTsp'));
  assert.ok(INDICATOR_REGISTRY.some((indicator) => indicator.key === 'hrtCompletedTransfer'));

  const metrics = emptyMetrics();
  assert.equal(metrics.total, 0);
  assert.equal(metrics.hrtOnTrack, 0);
  assert.deepEqual(metrics.monthlyCoinfection, {
    hiv: {}, syphilis: {}, malaria: {}, hepB: {}, hepC: {}
  });
  assert.equal(metrics.pncTimingGroups['Not recorded'], 0);
});

test('builds deterministic Asia/Yangon all, month, quarter, and year periods', () => {
  assert.deepEqual(periodForKey('all'), { key: 'all', start: null, end: null });
  assert.equal(periodKeyForDate('2026-08-01T00:15:00+06:30', 'month'), '2026-08');
  assert.equal(periodKeyForDate('2026-08-01T00:15:00+06:30', 'quarter'), '2026-Q3');
  assert.equal(periodKeyForDate('2026-08-01T00:15:00+06:30', 'year'), '2026');
  assert.equal(periodKeyForDate('2026-07-31T18:00:00Z', 'month'), '2026-08');

  const month = periodForKey('2026-08');
  assert.equal(month.start.toISOString(), '2026-07-31T17:30:00.000Z');
  assert.equal(month.end.toISOString(), '2026-08-31T17:29:59.999Z');
  const quarter = periodForKey('2026-Q3');
  assert.equal(quarter.start.toISOString(), '2026-06-30T17:30:00.000Z');
  assert.equal(quarter.end.toISOString(), '2026-09-30T17:29:59.999Z');
  assert.equal(periodForKey('2026').end.toISOString(), '2026-12-31T17:29:59.999Z');

  const custom = normalizePeriod({ key: 'custom', start: '2026-08-02', end: '2026-08-03' });
  assert.equal(custom.start.toISOString(), '2026-08-01T17:30:00.000Z');
  assert.equal(custom.end.toISOString(), '2026-08-03T17:29:59.999Z');
});

test('calculates registration, ANC, risk, lab, delivery, PNC, newborn, and transfer metrics', () => {
  const patient = {
    id: 'patient-1',
    profile: {
      name: 'Representative patient',
      status: 'postnatal',
      age: '36',
      township: 'Hlaing',
      region: 'Yangon',
      created_by: 'midwife-1',
      created_at: '2026-08-01'
    },
    antenatalVisits: [
      wrapped({
        visitDate: '2026-08-01',
        visitNumber: 1,
        lmp: '2026-06-20',
        gestationalAge: 6,
        high_risk: 'yes',
        risk_factors: ['Hypertension'],
        hemoglobin: 6.9,
        gbvSuspected: 'yes',
        ttTdCompletion: 'Complete',
        ironFolicAcid: 'Given'
      }, 'anc-1'),
      wrapped({
        visitDate: '2026-08-08',
        visitNumber: 2,
        high_risk: 'yes',
        risk_factors: ['Hypertension', 'Age > 35'],
        nextVisitDate: '2099-01-01',
        ironFolicAcid: 'Given',
        vitaminB1: 'Given'
      }, 'anc-2')
    ],
    testRecords: [fullLab()],
    summary: {
      startingTime: '08:00',
      secondStageTime: '12:00',
      Medication_Oxytocin_1: 'Yes'
    },
    thirdStage: { oxytocinGiven: 'Yes' },
    birthRecord: wrapped({
      deliveryDate: '2026-08-10',
      newbornOutcome: 'alive',
      maternalOutcome: 'alive'
    }),
    deliveryNotes: wrapped({
      deliveryDetails: { babies: [{ outcome: 'alive' }] }
    }),
    newbornCare: wrapped({
      birthplace: 'public facility',
      birth_weight_gram: 1800
    }),
    immediateNewbornCare: wrapped({ gasping_or_no_breathing: true }),
    postpartumVisits: [
      wrapped({
        visitDate: '2026-08-11',
        visitNumber: 1,
        deliveredDateTime: '2026-08-10',
        vitaminBComplex: true,
        vitaminA: true,
        ironFolic: true,
        contraception: true,
        vaginalBleeding: 'Heavy bleeding',
        maternalOutcome: 'alive',
        dangerSigns: { heavyBleeding: true },
        referralGiven: 'Yes',
        referralReason: 'Severe bleeding'
      }, 'pnc-1')
    ],
    transferRecord: wrapped({
      transferDate: '2026-08-12',
      reasonForReferral: 'Needs specialist review'
    }),
    hrtActions: []
  };

  const metrics = calculatePatientMetrics(patient, { key: '2026-08' });
  assert.equal(metrics.total, 1);
  assert.equal(metrics.newClients, 1);
  assert.equal(metrics.statusPnc, 1);
  assert.equal(metrics.ageGroups['Over 35'], 1);
  assert.equal(metrics.ancReceived, 1);
  assert.equal(metrics.earlyAnc, 1);
  assert.equal(metrics.highRisk, 1);
  assert.equal(metrics.riskFactors['Hypertension'], 1);
  assert.equal(metrics.riskFactors['Age > 35'], 1);
  assert.equal(metrics.hrtCurrent, 1);
  assert.equal(metrics.hrtOnTrack, 1);

  assert.equal(metrics.labComplete, 1);
  assert.equal(metrics.ultrasound, 1);
  assert.equal(metrics.severeAnemia, 1);
  assert.equal(metrics.ancSevereAnemia, 1);
  assert.equal(metrics.hivPos, 1);
  assert.equal(metrics.hivSyphScreenedPatients, 1);
  assert.equal(metrics.monthlyCoinfection.hiv['2026-08'], 1);

  assert.equal(metrics.lcgCompleted, 1);
  assert.equal(metrics.totalDeliveries, 1);
  assert.equal(metrics.uterotonic, 1);
  assert.equal(metrics.instDel, 1);
  assert.equal(metrics.lowBW, 1);
  assert.equal(metrics.resuscitated, 1);
  assert.equal(metrics.newbornOutcomeAlive, 1);
  assert.equal(metrics.bwGroups['1.5-2'], 1);

  assert.equal(metrics.pncReceived, 1);
  assert.equal(metrics.pnc48h, 1);
  assert.equal(metrics.pnc42d, 1);
  assert.equal(metrics.pphCases, 1);
  assert.equal(metrics.maternalOutcomeAlive, 1);
  assert.equal(metrics.pncVitA, 1);
  assert.equal(metrics.pncVitB, 1);
  assert.equal(metrics.pncIronFolic, 1);
  assert.equal(metrics.pncContraception, 1);
  assert.equal(metrics.dangerSignCounts.heavyBleeding, 1);
  assert.equal(metrics.pncTransfer, 1);
  assert.equal(metrics.referralReasonCounts['Severe bleeding'], 1);
  assert.equal(metrics.referralReasonCounts['Needs specialist review'], 1);
  assert.equal(metrics.tspAggregates.Hlaing.instDel, 1);
});

test('supports plain nested records and HRT completion outcomes', () => {
  const contribution = calculatePatientMetrics({
    data: {
      profile: { status: 'antenatal', township: 'Bago', created_at: '2026-08-01' },
      antenatalVisits: [{
        visitDate: '2026-08-02',
        visitNumber: 1,
        highRisk: 'Yes',
        risk_factors: ['Previous complication']
      }],
      hrtActions: [{ type: 'resolved', resolvedReason: 'transferred' }]
    }
  }, '2026-08');

  assert.equal(contribution.highRisk, 1);
  assert.equal(contribution.hrtCurrent, 0);
  assert.equal(contribution.hrtCompleted, 1);
  assert.equal(contribution.hrtCompletedTransfer, 1);
});

test('period filtering excludes out-of-period records and inactive patients', () => {
  const metrics = calculateMetrics([
    {
      profile: { status: 'antenatal', created_at: '2026-07-01' },
      antenatalVisits: [wrapped({ visitDate: '2026-07-02', high_risk: 'yes' })]
    },
    {
      profile: { status: 'antenatal', created_at: '2026-08-01' },
      antenatalVisits: [wrapped({ visitDate: '2026-08-02', gestationalAge: 10 })],
      testRecords: [fullLab({ testDate: '2026-07-20' })]
    }
  ], '2026-08');

  assert.equal(metrics.total, 1);
  assert.equal(metrics.ancReceived, 1);
  assert.equal(metrics.highRisk, 0);
  assert.equal(metrics.labComplete, 0);
  assert.equal(metrics.ultrasound, 0);
});

test('patient contributions merge additively, including nested maps and point arrays', () => {
  const first = calculatePatientMetrics({
    profile: { status: 'antenatal', township: 'A', created_at: '2026-08-01' },
    antenatalVisits: [wrapped({
      visitDate: '2026-08-02', visitNumber: 1, gestationalAge: 10,
      high_risk: 'yes', risk_factors: ['Hypertension']
    })]
  }, '2026-08');
  const second = calculatePatientMetrics({
    profile: { status: 'antenatal', township: 'A', created_at: '2026-08-03' },
    antenatalVisits: [wrapped({
      visitDate: '2026-08-04', visitNumber: 1, gestationalAge: 12,
      high_risk: 'yes', risk_factors: ['Hypertension']
    })]
  }, '2026-08');

  const merged = mergeMetrics(first, second);
  const calculated = calculateMetrics([
    {
      profile: { status: 'antenatal', township: 'A', created_at: '2026-08-01' },
      antenatalVisits: [wrapped({
        visitDate: '2026-08-02', visitNumber: 1, gestationalAge: 10,
        high_risk: 'yes', risk_factors: ['Hypertension']
      })]
    },
    {
      profile: { status: 'antenatal', township: 'A', created_at: '2026-08-03' },
      antenatalVisits: [wrapped({
        visitDate: '2026-08-04', visitNumber: 1, gestationalAge: 12,
        high_risk: 'yes', risk_factors: ['Hypertension']
      })]
    }
  ], '2026-08');

  assert.equal(merged.total, 2);
  assert.equal(merged.newClients, 2);
  assert.equal(merged.highRisk, 2);
  assert.equal(merged.riskFactors.Hypertension, 2);
  assert.equal(merged.tspAggregates.A.highRisk, 2);
  assert.equal(merged.gaVisitPoints.length, 2);
  assert.deepEqual(merged, calculated);
});
