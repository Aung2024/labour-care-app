'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  analyzeSummary,
  buildCase,
  normalizeBirthPlace,
  isAlertValue,
  emptyCounter,
  addCase,
  rates,
} = require('./extract-lcg-insights');

test('both stage times can come from the timing documents', () => {
  const labourCase = buildCase({
    creatorFacilityCode: '007',
    patientFacilityCode: '007',
    patientTownship: 'Pyinmana',
    labourOnset: 'Spontaneous',
  }, {
    startingTime: { startingTime: '08:30' },
    secondStage: { secondStageStartTime: '14:00' },
    summary: {
      Companion_08_30: 'Y',
      Baseline_FHR_08_30: 142,
      Cervix_Plot_6_09_30: 'X',
      PLAN_09_30: 'Continue observation',
      Medication_Oxytocin_08_00_UL: '5',
    },
    deliveryNotes: {
      deliveryDetails: {
        birthPlace: 'government_hospital',
        modeOfDelivery: 'normal',
        babies: [{ birthTime: '2026-03-02T02:30:00.000Z' }],
      },
    },
  });
  assert.equal(labourCase.bothStages, true);
  assert.equal(labourCase.place, 'Public Health Facility');
  assert.equal(labourCase.mode, 'Normal vaginal');
  assert.equal(labourCase.cervix, true);
  assert.equal(labourCase.sdmPlan, true);
  assert.equal(labourCase.oxytocin, true);
  assert.equal(labourCase.companionClass, 'yes');
  assert.equal(labourCase.noteMonth, '2026-03');
});

test('literal null is not a stage time, and home births stay home', () => {
  const labourCase = buildCase({}, {
    summary: { startingTime: 'null', secondStageTime: '' },
    secondStage: { secondStageStartTime: 'null' },
    deliveryNotes: { deliveryDetails: { birthPlace: 'Home', modeOfDelivery: 'emergency c-section' } },
  });
  assert.equal(labourCase.firstStage, false);
  assert.equal(labourCase.secondStage, false);
  assert.equal(labourCase.dashboardBoth, true);
  assert.equal(labourCase.place, 'Home');
  assert.equal(labourCase.mode, 'Emergency C-section');
});

test('alert thresholds and section completeness ignore metadata', () => {
  const observation = analyzeSummary({
    timestamp: { seconds: 1 },
    startingTime: '09:00',
    Baseline_FHR_09_00: 100,
    FHR_deceleration_09_00: 'L',
    Companion_09_00: 'N',
    Systolic_BP_09_00: '150',
    Temperature_C_09_00: 'high',
  });
  assert.equal(observation.sections.fhr, true);
  assert.equal(observation.sections.support, true);
  assert.equal(observation.sections.woman, true);
  assert.equal(observation.fhrOutOfRange, 1);
  assert.equal(observation.lateDecel, true);
  assert.equal(observation.nonNumericVitals, 1);
  assert.equal(observation.numericVitals, 1);
  assert.equal(observation.alertCells, 4);
  assert.equal(isAlertValue('Diastolic_BP', 90), false);
  assert.equal(isAlertValue('Diastolic_BP', 91), true);
  assert.equal(normalizeBirthPlace('RHC/SRHC'), 'Public Health Facility');
});

test('plot chart counts as cervix when the summary grid is empty', () => {
  const labourCase = buildCase({}, {
    summary: { startingTime: '10:00' },
    cervix: { data: [{ x: 1, y: 6 }] },
  });
  assert.equal(labourCase.cervix, true);
  assert.equal(labourCase.anyObservation, true);
  assert.equal(labourCase.deliveryNotes, false);
});

test('rates use delivery notes as the LCG denominator', () => {
  const counter = emptyCounter();
  addCase(counter, {
    deliveryNotes: true,
    firstStage: true,
    secondStage: true,
    bothStages: true,
    dashboardBoth: true,
    anyObservation: true,
    cervix: false,
    descent: false,
    sdm: false,
    sdmPlan: false,
    sections: { support: true, fhr: false, baby: false, woman: false, contractions: false, cervix: false, descent: false, meds: false, sdm: false },
    companionClass: 'yes',
    painClass: 'none',
    oralClass: 'none',
    mobilityClass: 'none',
    oxytocin: false,
    alertCells: 0,
    cells: 1,
    fhrReadings: 0,
    fhrOutOfRange: 0,
    lateDecel: false,
    numericVitals: 0,
    nonNumericVitals: 0,
    timepoints: 1,
  });
  addCase(counter, {
    deliveryNotes: true,
    firstStage: false,
    secondStage: false,
    bothStages: false,
    dashboardBoth: false,
    anyObservation: false,
    cervix: false,
    descent: false,
    sdm: false,
    sdmPlan: false,
    sections: { support: false, fhr: false, baby: false, woman: false, contractions: false, cervix: false, descent: false, meds: false, sdm: false },
    companionClass: 'none',
    painClass: 'none',
    oralClass: 'none',
    mobilityClass: 'none',
    oxytocin: false,
    alertCells: 0,
    cells: 0,
    fhrReadings: 0,
    fhrOutOfRange: 0,
    lateDecel: false,
    numericVitals: 0,
    nonNumericVitals: 0,
    timepoints: 0,
  });
  const result = rates(counter);
  assert.equal(counter.deliveryNotes, 2);
  assert.equal(counter.bothAmongNotes, 1);
  assert.equal(result.lcgOfNotes, 50);
  assert.equal(result.observationOfStarted, 100);
});
