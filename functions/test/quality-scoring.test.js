'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  QI_SCHEMA_VERSION,
  INDICATOR_DEFS,
  ANC_INDICATOR_DEFS,
  emptyIndicatorTotals,
  calculatePatientQualityContribution,
  calculatePatientAncContribution,
  summarizeProviderFromContributions,
  isValidReasonCategory,
  isValidTargetPercent,
  nextMonthKey,
  scoreBand,
  previousMonthKey,
  monthKeyForDate,
  babyKeysFromVisit,
  evaluateVisitIndicator,
  evaluateAncIndicator
} = require('../src/quality/scoring');

test('defines eleven newborn competency indicators', () => {
  assert.equal(INDICATOR_DEFS.length, 11);
  assert.equal(INDICATOR_DEFS.filter((item) => item.source === 'immediate').length, 6);
  assert.equal(INDICATOR_DEFS.filter((item) => item.source === 'newborn_visit').length, 5);
});

test('counts unique babies once for immediate indicators in a month', () => {
  const result = calculatePatientQualityContribution({
    id: 'p1',
    created_by: 'mw1'
  }, {
    immediateNewbornCare: [{
      skin_to_skin_contact: true,
      thorough_drying: true,
      delayed_cord_clamping: false,
      support_early_exclusive_breastfeeding: true,
      eye_care_teo: true,
      vitamin_k: false,
      recordedBy: 'mw1',
      timestamp: '2026-09-10T08:00:00+06:30'
    }],
    newbornCare: [{
      visit_number: 1,
      visitDate: '2026-09-10',
      baby_count: 2,
      babies: [{ babyIndex: 1 }, { babyIndex: 2 }],
      recordedBy: 'mw1'
    }]
  }, '2026-09');

  const provider = result.providers.mw1;
  assert.ok(provider);
  assert.equal(provider.indicators.skin_to_skin.numerator, 2);
  assert.equal(provider.indicators.skin_to_skin.denominator, 2);
  assert.equal(provider.indicators.skin_to_skin.percentage, 100);
  assert.equal(provider.indicators.delayed_cord_clamping.numerator, 0);
  assert.equal(provider.indicators.delayed_cord_clamping.denominator, 2);
  assert.equal(provider.indicators.delayed_cord_clamping.percentage, 0);
  assert.equal(provider.indicators.vitamin_k.numerator, 0);
  assert.equal(provider.indicators.vitamin_k.denominator, 2);
});

test('ignores records outside the selected Yangon month', () => {
  const result = calculatePatientQualityContribution({
    id: 'p2',
    created_by: 'mw1'
  }, {
    immediateNewbornCare: [{
      skin_to_skin_contact: true,
      thorough_drying: true,
      delayed_cord_clamping: true,
      support_early_exclusive_breastfeeding: true,
      eye_care_teo: true,
      vitamin_k: true,
      recordedBy: 'mw1',
      timestamp: '2026-08-10T08:00:00+06:30'
    }],
    newbornCare: []
  }, '2026-09');

  assert.deepEqual(result.providers, {});
});

test('all-time scoring includes records across months', () => {
  const result = calculatePatientQualityContribution({
    id: 'p-all',
    created_by: 'mw1'
  }, {
    immediateNewbornCare: [
      {
        skin_to_skin_contact: true,
        thorough_drying: true,
        delayed_cord_clamping: true,
        support_early_exclusive_breastfeeding: true,
        eye_care_teo: true,
        vitamin_k: true,
        timestamp: '2026-07-01T08:00:00+06:30'
      }
    ],
    newbornCare: [
      {
        visit_number: 1,
        visitDate: '2026-09-01',
        temperature: 36.8,
        heart_rate: 130,
        respiration_rate: 46,
        body_weight_gram: 2900
      }
    ]
  }, 'all');

  assert.equal(result.providers.mw1.indicators.skin_to_skin.denominator, 1);
  assert.equal(result.providers.mw1.indicators.vital_signs.denominator, 1);
});

test('attributes newborn visit indicators to recordedBy provider', () => {
  const result = calculatePatientQualityContribution({
    id: 'p3',
    created_by: 'owner1'
  }, {
    immediateNewbornCare: [],
    newbornCare: [{
      visit_number: 1,
      visitDate: '2026-09-12',
      temperature: 36.8,
      heart_rate: 130,
      respiration_rate: 48,
      body_weight_gram: 2800,
      cord_care: 'yes',
      eye_infection_status: 'nad',
      anatomy_abnormalities: false,
      danger_signs: [],
      exclusive_breastfeeding_on_demand: true,
      follow_up_appointment_date: '2026-09-15',
      recordedBy: 'mw2'
    }]
  }, '2026-09');

  assert.ok(result.providers.mw2);
  assert.equal(result.providers.mw2.indicators.vital_signs.percentage, 100);
  assert.equal(result.providers.mw2.indicators.birth_weight.percentage, 100);
  assert.equal(result.providers.mw2.indicators.pre_discharge_exam.percentage, 100);
  assert.equal(result.providers.mw2.indicators.exclusive_breastfeeding.percentage, 100);
  assert.equal(result.providers.mw2.indicators.follow_up_schedule.percentage, 100);
  assert.equal(result.providers.owner1, undefined);
});

test('deduplicates multiple newborn visits for the same baby in one month', () => {
  const result = calculatePatientQualityContribution({
    id: 'p4',
    created_by: 'mw1'
  }, {
    immediateNewbornCare: [],
    newbornCare: [
      {
        visit_number: 1,
        visitDate: '2026-09-02',
        temperature: 36.8,
        heart_rate: 130,
        respiration_rate: 48,
        body_weight_gram: 3000,
        cord_care: 'yes',
        eye_infection_status: 'nad',
        anatomy_abnormalities: false,
        danger_signs: [],
        exclusive_breastfeeding_on_demand: false,
        follow_up_appointment_date: '2026-09-05',
        recordedBy: 'mw1'
      },
      {
        visit_number: 2,
        visitDate: '2026-09-20',
        temperature: 37,
        heart_rate: 128,
        respiration_rate: 46,
        exclusive_breastfeeding_on_demand: true,
        recordedBy: 'mw1'
      }
    ]
  }, '2026-09');

  const provider = result.providers.mw1;
  assert.equal(provider.indicators.vital_signs.denominator, 1);
  assert.equal(provider.indicators.exclusive_breastfeeding.numerator, 0);
  assert.equal(provider.indicators.exclusive_breastfeeding.denominator, 1);
});

test('falls back to patient owner when record attribution is missing', () => {
  const result = calculatePatientQualityContribution({
    id: 'p5',
    created_by: 'mw-owner'
  }, {
    immediateNewbornCare: [{
      skin_to_skin_contact: true,
      thorough_drying: false,
      delayed_cord_clamping: false,
      support_early_exclusive_breastfeeding: false,
      eye_care_teo: false,
      vitamin_k: false,
      timestamp: '2026-09-01T10:00:00+06:30'
    }],
    newbornCare: []
  }, '2026-09');

  assert.ok(result.providers['mw-owner']);
  assert.equal(result.providers['mw-owner'].indicators.skin_to_skin.numerator, 1);
});

test('summarizes provider contributions and validates plan fields', () => {
  const contribution = calculatePatientQualityContribution({
    id: 'p6',
    created_by: 'mw1'
  }, {
    immediateNewbornCare: [{
      skin_to_skin_contact: true,
      thorough_drying: true,
      delayed_cord_clamping: true,
      support_early_exclusive_breastfeeding: true,
      eye_care_teo: true,
      vitamin_k: true,
      recordedBy: 'mw1',
      timestamp: '2026-09-08T09:00:00+06:30'
    }],
    newbornCare: []
  }, '2026-09');

  const summary = summarizeProviderFromContributions([contribution], {
    providerId: 'mw1',
    providerName: 'Midwife One',
    township: 'Demo',
    region: 'Yangon'
  }, '2026-09');

  assert.equal(summary.schemaVersion, QI_SCHEMA_VERSION);
  assert.equal(summary.indicators.skin_to_skin.percentage, 100);
  assert.ok(summary.summaryPercentage > 0);
  assert.equal(isValidReasonCategory('knowledge_training'), true);
  assert.equal(isValidReasonCategory('invalid'), false);
  assert.equal(isValidTargetPercent(80), true);
  assert.equal(isValidTargetPercent(101), false);
  assert.equal(scoreBand(80), 'green');
  assert.equal(scoreBand(79.9), 'yellow');
  assert.equal(scoreBand(50), 'yellow');
  assert.equal(scoreBand(49.9), 'red');
  assert.equal(nextMonthKey('2026-09'), '2026-10');
  assert.equal(previousMonthKey('2026-01'), '2025-12');
  assert.equal(monthKeyForDate('2026-09-15T12:00:00+06:30'), '2026-09');
});

test('baby key and visit indicator helpers handle missing data', () => {
  assert.deepEqual(babyKeysFromVisit({}, 'p9'), ['p9:baby:1']);
  assert.equal(evaluateVisitIndicator('vital_signs', { temperature: 36.5 }), false);
  assert.equal(evaluateVisitIndicator('follow_up_schedule', { follow_up_appointment_date: '2026-09-20' }), true);
  assert.equal(evaluateVisitIndicator('pre_discharge_exam', {
    cord_care: 'yes',
    eye_care_status: 'clean_and_dry',
    anatomy_abnormalities: false,
    danger_signs: []
  }), true);
});

test('keeps newborn indicator defs unchanged while adding twelve ANC indicators', () => {
  assert.equal(INDICATOR_DEFS.length, 11);
  assert.equal(ANC_INDICATOR_DEFS.length, 12);
  assert.equal(Object.keys(emptyIndicatorTotals()).length, 11);
  assert.ok(!Object.keys(emptyIndicatorTotals()).some((id) => id.indexOf('anc_') === 0));
  assert.equal(ANC_INDICATOR_DEFS.filter((item) => item.source === 'anc_visit').length, 10);
  assert.equal(ANC_INDICATOR_DEFS.filter((item) => item.source === 'anc_test').length, 2);
});

test('newborn scoring ignores antenatal collections', () => {
  const result = calculatePatientQualityContribution({
    id: 'p-anc-ignore',
    created_by: 'mw1'
  }, {
    immediateNewbornCare: [],
    newbornCare: [],
    antenatalVisits: [{
      visitDate: '2026-09-10',
      recordedBy: 'mw1',
      ironFolicAcid: 'Prescribed'
    }],
    testRecords: [{
      testDate: '2026-09-10',
      createdBy: 'mw1',
      hivResult: 'Non-reactive',
      syphilisResult: 'Non-reactive',
      hemoglobinResult: 11.2
    }]
  }, '2026-09');

  assert.deepEqual(result.providers, {});
});

test('scores the first ANC visit in the month against existing form fields', () => {
  const result = calculatePatientAncContribution({
    id: 'p-anc-1',
    created_by: 'mw1'
  }, {
    antenatalVisits: [
      {
        visitDate: '2026-09-04',
        recordedBy: 'mw1',
        lmp: '2026-07-01',
        edd: '2027-04-07',
        lmpStatus: 'known',
        early_anc_visit: true,
        systolicBP: 110,
        diastolicBP: 70,
        weight: 52,
        ironFolicAcid: 'Already Prescribed',
        tetanusToxoid: 'TD1',
        dangerSignsPresent: 'no',
        high_risk: 'no',
        nextVisitDate: '2026-10-02',
        provisionalDiagnosisType: 'Routine ANC'
      },
      {
        visitDate: '2026-09-20',
        recordedBy: 'mw1',
        ironFolicAcid: 'Not Prescribed',
        tetanusToxoid: 'Not Prescribed'
      }
    ],
    testRecords: []
  }, '2026-09');

  const provider = result.providers.mw1;
  assert.ok(provider);
  assert.equal(provider.indicators.anc_early.numerator, 1);
  assert.equal(provider.indicators.anc_dating.numerator, 1);
  assert.equal(provider.indicators.anc_bp.numerator, 1);
  assert.equal(provider.indicators.anc_weight.numerator, 1);
  assert.equal(provider.indicators.anc_ifa.numerator, 1);
  assert.equal(provider.indicators.anc_td.numerator, 1);
  assert.equal(provider.indicators.anc_danger_screen.numerator, 1);
  assert.equal(provider.indicators.anc_high_risk.numerator, 1);
  assert.equal(provider.indicators.anc_next_visit.numerator, 1);
  assert.equal(provider.indicators.anc_diagnosis.numerator, 1);
  assert.equal(provider.indicators.anc_ifa.denominator, 1);
  assert.equal(provider.indicators.anc_hiv_syphilis.denominator, 0);
});

test('attributes ANC lab indicators to the first test in the month', () => {
  const result = calculatePatientAncContribution({
    id: 'p-anc-2',
    created_by: 'owner1'
  }, {
    antenatalVisits: [],
    testRecords: [
      {
        testDate: '2026-09-08',
        createdBy: 'mw2',
        hivResult: 'Non-reactive',
        syphilisResult: 'Non-reactive',
        hemoglobinResult: 10.8
      },
      {
        testDate: '2026-09-22',
        createdBy: 'mw2',
        hivResult: 'No Test Yet',
        syphilisResult: 'No Test Yet'
      }
    ]
  }, '2026-09');

  assert.ok(result.providers.mw2);
  assert.equal(result.providers.mw2.indicators.anc_hiv_syphilis.percentage, 100);
  assert.equal(result.providers.mw2.indicators.anc_hemoglobin.percentage, 100);
  assert.equal(result.providers.owner1, undefined);
  assert.equal(result.providers.mw2.indicators.anc_ifa.denominator, 0);
});

test('fails incomplete ANC documentation on existing fields only', () => {
  assert.equal(evaluateAncIndicator('anc_ifa', { ironFolicAcid: 'Not Prescribed' }), false);
  assert.equal(evaluateAncIndicator('anc_td', { tetanusToxoid: '' }), false);
  assert.equal(evaluateAncIndicator('anc_high_risk', { high_risk: 'yes', risk_factors: [] }), false);
  assert.equal(evaluateAncIndicator('anc_high_risk', { high_risk: 'yes', risk_factors: ['anemia'] }), true);
  assert.equal(evaluateAncIndicator('anc_diagnosis', { provisionalDiagnosisType: 'Other' }), false);
  assert.equal(evaluateAncIndicator('anc_diagnosis', {
    provisionalDiagnosisType: 'Other',
    provisionalDiagnosisOther: 'Malaria'
  }), true);
  assert.equal(evaluateAncIndicator('anc_dating', {
    lmpStatus: 'unknown',
    manualGestationalAge: 16
  }), true);
  assert.equal(evaluateAncIndicator('anc_hiv_syphilis', {
    hivResult: 'Non-reactive',
    syphilisResult: 'No Test Yet'
  }), false);
  assert.equal(evaluateAncIndicator('anc_early', {
    visitDate: '2026-09-10',
    lmp: '2026-07-20',
    lmpStatus: 'known'
  }), true);
  assert.equal(evaluateAncIndicator('anc_early', {
    visitDate: '2026-09-10',
    lmp: '2026-04-01',
    lmpStatus: 'known'
  }), false);
});

test('all-time ANC scoring uses the first dated visit and test', () => {
  const result = calculatePatientAncContribution({
    id: 'p-anc-all',
    created_by: 'mw1'
  }, {
    antenatalVisits: [
      {
        visitDate: '2026-07-02',
        recordedBy: 'mw1',
        lmp: '2026-05-01',
        edd: '2027-02-05',
        lmpStatus: 'known',
        systolicBP: 118,
        diastolicBP: 76,
        weight: 54,
        ironFolicAcid: 'Prescribed',
        tetanusToxoid: 'Completed',
        dangerSignsPresent: 'yes',
        high_risk: 'no',
        nextVisitDate: '2026-08-01',
        provisionalDiagnosisType: 'Routine ANC'
      },
      {
        visitDate: '2026-09-02',
        recordedBy: 'mw1',
        ironFolicAcid: 'Not Prescribed'
      }
    ],
    testRecords: [
      {
        testDate: '2026-08-15',
        createdBy: 'mw1',
        hivResult: 'Non-reactive',
        syphilisResult: 'Non-reactive',
        hemoglobinResult: 12
      }
    ]
  }, 'all');

  assert.equal(result.providers.mw1.indicators.anc_ifa.numerator, 1);
  assert.equal(result.providers.mw1.indicators.anc_ifa.denominator, 1);
  assert.equal(result.providers.mw1.indicators.anc_hiv_syphilis.denominator, 1);
});
