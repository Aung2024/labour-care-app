'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  QI_SCHEMA_VERSION,
  INDICATOR_DEFS,
  calculatePatientQualityContribution,
  summarizeProviderFromContributions,
  isValidReasonCategory,
  isValidTargetPercent,
  nextMonthKey,
  scoreBand,
  previousMonthKey,
  monthKeyForDate,
  babyKeysFromVisit,
  evaluateVisitIndicator
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
