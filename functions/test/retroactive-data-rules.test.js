'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const rules = require('../../js/retroactive-data-rules');

function mother(extra) {
  return Object.assign({
    id: 'mother-1',
    patient_type: 'mother',
    created_by: 'midwife-1',
    name: 'Daw Aye',
    age: 28,
    phone: '09111111111',
    registration_date: '2024-01-02',
    gravida_value: 1
  }, extra || {});
}

function gaps(scan, moduleName) {
  return scan.modules
    .filter(function (mod) { return mod.id === moduleName; })
    .flatMap(function (mod) { return mod.records.flatMap(function (record) { return record.gaps; }); });
}

test('back fill includes only mothers owned by the signed-in midwife', () => {
  assert.equal(rules.isOwnedMother(mother(), 'midwife-1'), true);
  assert.equal(rules.isOwnedMother(mother({ created_by: 'other', createdBy: 'midwife-1' }), 'midwife-1'), true);
  assert.equal(rules.isOwnedMother(mother({ created_by: 'other', care_team_midwife_ids: ['midwife-1'] }), 'midwife-1'), false);
  assert.equal(rules.isOwnedMother(mother({ patient_type: 'baby', created_by: 'midwife-1' }), 'midwife-1'), false);
});

test('ANC detects missing TD, accepts a matching legacy alias, and flags a real conflict', () => {
  const missing = rules.scanPatient({
    patient: mother(),
    ancVisits: [{ id: 'v1', data: { visitNumber: 1, visitDate: '2024-02-01', tetanusToxoid: '' } }]
  });
  assert.ok(gaps(missing, 'anc').some(function (gap) { return gap.field === 'tetanusToxoid' && gap.kind === 'missing'; }));

  const legacy = rules.scanPatient({
    patient: mother(),
    ancVisits: [{ id: 'v1', data: { visitNumber: 1, visitDate: '2024-02-01', td: 'TD1' } }]
  });
  const legacyGap = gaps(legacy, 'anc').find(function (gap) { return gap.field === 'tetanusToxoid'; });
  assert.equal(legacyGap.kind, 'conflict');
  assert.equal(legacyGap.proposedValue, 'TD1');

  const conflict = rules.scanPatient({
    patient: mother(),
    ancVisits: [{ id: 'v1', data: { visitNumber: 1, visitDate: '2024-02-01', tetanusToxoid: 'TD1', td: 'TD2' } }]
  });
  assert.equal(gaps(conflict, 'anc').find(function (gap) { return gap.field === 'tetanusToxoid'; }).kind, 'conflict');

  const aligned = rules.scanPatient({
    patient: mother(),
    ancVisits: [{ id: 'v1', data: { visitNumber: 1, visitDate: '2024-02-01', tetanusToxoid: 'TD1', td: 'td1' } }]
  });
  assert.equal(gaps(aligned, 'anc').some(function (gap) { return gap.field === 'tetanusToxoid'; }), false);
});

test('high-risk Other requires the condition text and provisional Other requires diagnosis text', () => {
  const scan = rules.scanPatient({
    patient: mother(),
    ancVisits: [{
      id: 'v1',
      data: {
        visitDate: '2024-02-01',
        risk_factors: ['Other Medical Conditions'],
        provisionalDiagnosisType: 'Other'
      }
    }]
  });
  const fields = gaps(scan, 'anc').map(function (gap) { return gap.field; });
  assert.ok(fields.indexOf('otherMedicalConditionName') >= 0);
  assert.ok(fields.indexOf('provisionalDiagnosisOther') >= 0);
});

test('PNC without a delivery note asks for Delivery Notes and does not invent one', () => {
  const scan = rules.scanPatient({
    patient: mother(),
    pncVisits: [{ id: 'p1', data: { visitNumber: 1, visitDate: '2024-06-01', maternalOutcome: 'alive' } }]
  });
  assert.equal(gaps(scan, 'delivery')[0].kind, 'absent');
  const plan = rules.planWrites(scan && {
    patient: mother(),
    pncVisits: [{ id: 'p1', data: { visitNumber: 1, visitDate: '2024-06-01', maternalOutcome: 'alive' } }]
  }, [{ module: 'delivery', create: true, values: { birthPlace: 'home' } }], { uid: 'midwife-1', now: '2026-10-10' });
  assert.equal(plan.ok, false);
  assert.equal(plan.operations.length, 0);
});

test('equivalent delivery mode values are not a conflict and unknown legacy places need a current choice', () => {
  const aligned = rules.scanPatient({
    patient: mother(),
    delivery: {
      id: 'deliveryNotes',
      canonical: true,
      data: {
        thirdStage: { oxytocinGiven: true, controlledCordTraction: false },
        deliveryDetails: {
          gestationalWeek: 39,
          birthProvider: 'self',
          modeOfDelivery: 'normal',
          mode_of_delivery: 'normal_vaginal',
          birthPlace: 'home',
          maternalCondition: 'alive',
          pregnancyType: 'single',
          babies: [{ babyName: 'Baby', gender: 'female', outcome: 'alive', birthWeightGram: 2800, birthTime: '2024-06-01T08:00', anusPresent: 'yes' }]
        }
      }
    }
  });
  assert.equal(gaps(aligned, 'delivery').some(function (gap) { return gap.field === 'modeOfDelivery'; }), false);

  const legacyPlace = rules.scanPatient({
    patient: mother(),
    delivery: { id: 'deliveryNotes', canonical: true, data: { deliveryDetails: { birthplace: 'old clinic' } } }
  });
  const place = gaps(legacyPlace, 'delivery').find(function (gap) { return gap.field === 'birthPlace'; });
  assert.equal(place.kind, 'conflict');
  assert.equal(place.proposedValue, '');
});

test('historical visits update a matching record and reject a duplicate visit number', () => {
  const visits = [
    { id: 'existing', data: { visitNumber: 2, visitDate: '2024-03-01' } },
    { id: 'other', data: { visitNumber: 3, visitDate: '2024-04-01' } }
  ];
  assert.equal(rules.findDuplicateVisit(visits, 2, '2024-03-01').type, 'match');
  assert.equal(rules.findDuplicateVisit(visits, 2, '2024-05-01').type, 'number-taken');
  assert.equal(rules.historicalVisitId('anc', 4, '2024-05-01'), 'bf_anc_v4_20240501');

  const plan = rules.planWrites({
    patient: mother(),
    ancVisits: visits
  }, [{
    module: 'anc',
    create: true,
    visitNumber: 2,
    values: { visitDate: '2024-05-01', tetanusToxoid: 'TD2' }
  }], { uid: 'midwife-1', now: '2026-10-10' });
  assert.equal(plan.ok, false);
});

test('saves merge changed fields, keep replaced values in the audit, and convert weight to grams', () => {
  const bundle = {
    patient: mother(),
    ancVisits: [{ id: 'v1', data: { visitNumber: 1, visitDate: '2024-02-01', tetanusToxoid: '', td: 'TD1' } }],
    newbornVisits: [{ id: 'n1', data: { visit_number: 2, visitDate: '2024-06-08' } }]
  };
  const ancPlan = rules.planWrites(bundle, [{
    module: 'anc',
    recordId: 'v1',
    values: { tetanusToxoid: 'TD1' }
  }], { uid: 'midwife-1', now: '2026-10-10' });
  assert.equal(ancPlan.ok, true);
  assert.equal(ancPlan.operations[0].kind, 'merge');
  assert.equal(ancPlan.operations[0].data.tetanusToxoid, 'TD1');
  assert.equal(ancPlan.operations[0].data.td, 'TD1');
  assert.equal(ancPlan.operations[0].audit.changes[0].before, null);
  assert.equal(ancPlan.operations[0].audit.changes[0].after, 'TD1');
  assert.equal(JSON.stringify(ancPlan.operations[0].data).indexOf('delete'), -1);

  const weightPlan = rules.planWrites(bundle, [{
    module: 'newborn',
    recordId: 'n1',
    values: { current_weight_gram: '2.5' }
  }], { uid: 'midwife-1', now: '2026-10-10' });
  assert.equal(weightPlan.operations[0].data.current_weight_gram, 2500);

  const clearPlan = rules.planWrites(bundle, [{
    module: 'registration',
    recordId: 'mother-1',
    values: { name: '' }
  }], { uid: 'midwife-1', now: '2026-10-10' });
  assert.equal(clearPlan.ok, false);
  assert.equal(clearPlan.operations.length, 0);
});

test('newborn anatomy details and resuscitation outcome are conditional', () => {
  const anatomy = rules.scanPatient({
    patient: mother(),
    delivery: { id: 'deliveryNotes', canonical: true, data: { deliveryDetails: { maternalCondition: 'alive' } } },
    newbornVisits: [{ id: 'n1', data: { visit_number: 1, visitDate: '2024-06-02', anatomy_abnormalities: true } }]
  });
  assert.ok(gaps(anatomy, 'newborn').some(function (gap) { return gap.field === 'anatomy_abnormality_details'; }));

  const noAnatomy = rules.scanPatient({
    patient: mother(),
    delivery: { id: 'deliveryNotes', canonical: true, data: { deliveryDetails: { maternalCondition: 'alive' } } },
    newbornVisits: [{ id: 'n1', data: { visit_number: 1, visitDate: '2024-06-02', anatomy_abnormalities: false, baby_outcome: 'alive' } }]
  });
  assert.equal(gaps(noAnatomy, 'newborn').some(function (gap) { return gap.field === 'anatomy_abnormality_details'; }), false);

  const resuscitation = rules.scanPatient({
    patient: mother(),
    immediateRecords: [{ id: 'i1', patientId: 'mother-1', data: { breathing_status: 'gasping_or_no_breathing' } }]
  });
  assert.ok(gaps(resuscitation, 'immediate').some(function (gap) { return gap.field === 'resuscitation_outcome'; }));
});

test('gravida two requires youngest-child age and a missing lab record is not required', () => {
  const needsAge = rules.scanPatient({ patient: mother({ gravida_value: 2 }) });
  assert.ok(gaps(needsAge, 'registration').some(function (gap) { return gap.field === 'youngestChildAge'; }));
  const firstPregnancy = rules.scanPatient({ patient: mother({ gravida_value: 1 }) });
  assert.equal(gaps(firstPregnancy, 'registration').some(function (gap) { return gap.field === 'youngestChildAge'; }), false);
  const labs = rules.scanPatient({ patient: mother(), testRecords: [] });
  assert.equal(gaps(labs, 'test').length, 0);
});

test('future dates are rejected and twins require two baby rows', () => {
  const future = rules.planWrites({
    patient: mother(),
    ancVisits: [{ id: 'v1', data: { visitNumber: 1, visitDate: '2024-02-01' } }]
  }, [{ module: 'anc', recordId: 'v1', values: { visitDate: '2027-01-01' } }], { uid: 'midwife-1', now: '2026-10-10' });
  assert.equal(future.ok, false);

  const twins = rules.planWrites({
    patient: mother(),
    delivery: {
      id: 'deliveryNotes',
      canonical: true,
      data: { thirdStage: {}, deliveryDetails: { pregnancyType: 'twins', babies: [{ outcome: 'alive' }] } }
    }
  }, [{
    module: 'delivery',
    values: {
      babies: [{ babyName: 'One', gender: 'female', outcome: 'alive', birthWeightKg: '2.8', birthTime: '2024-06-01T08:00', anusPresent: 'yes' }]
    }
  }], { uid: 'midwife-1', now: '2026-10-10' });
  assert.equal(twins.ok, false);
});

test('retroactive services are merge-only and the home card is midwife scoped', () => {
  const root = path.resolve(__dirname, '../..');
  const service = fs.readFileSync(path.join(root, 'js/retroactive-data-service.js'), 'utf8');
  const home = fs.readFileSync(path.join(root, 'home.html'), 'utf8');
  const newborn = fs.readFileSync(path.join(root, 'newborn-care-page.html'), 'utf8');
  const worker = fs.readFileSync(path.join(root, 'service-worker.js'), 'utf8');
  assert.match(service, /merge:\s*true/);
  assert.doesNotMatch(service, /\.delete\(/);
  assert.match(service, /retroactive_backfill/);
  assert.match(home, /id="backFillCard"/);
  assert.match(home, /'backFillCard'/);
  assert.doesNotMatch(home, /tmo:\s*\[[^\]]*backFillCard/);
  assert.match(newborn, /id="anatomy_abnormality_details"/);
  assert.match(newborn, /function toggleAnatomyAbnormalityDetails/);
  assert.match(worker, /retroactive-data-entry\.html/);
  assert.match(worker, /mch-care-v345-moh/);
});
