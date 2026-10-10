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
    gravida_value: 1,
    parity_primary: 0
  }, extra || {});
}

function category(scan, id) {
  return (scan.categories || []).find(function (item) { return item.id === id; }) || { groups: [], redirects: [], missingCount: 0 };
}

function group(scan, id, key) {
  return category(scan, id).groups.find(function (item) { return item.key === key; }) || null;
}

test('back fill includes only mothers owned by the signed-in midwife', () => {
  assert.equal(rules.isOwnedMother(mother(), 'midwife-1'), true);
  assert.equal(rules.isOwnedMother(mother({ created_by: 'other', createdBy: 'midwife-1' }), 'midwife-1'), true);
  assert.equal(rules.isOwnedMother(mother({ created_by: 'other', care_team_midwife_ids: ['midwife-1'] }), 'midwife-1'), false);
  assert.equal(rules.isOwnedMother(mother({ patient_type: 'baby', created_by: 'midwife-1' }), 'midwife-1'), false);
});

test('registration-only patients stay off ANC until a visit exists, and first pregnancy skips youngest-child age', () => {
  const first = rules.scanPatient({ patient: mother() });
  assert.equal(first.gapCount, 0);
  assert.equal(category(first, 'anc').applicable, false);
  assert.equal(category(first, 'test').applicable, false);
  assert.equal(group(first, 'registration', 'youngestChildAge').status, 'not_needed');

  const missingPhone = rules.scanPatient({ patient: mother({ phone: '' }) });
  assert.ok(missingPhone.gapCount >= 1);
  assert.equal(group(missingPhone, 'registration', 'phone').status, 'missing');

  const second = rules.scanPatient({ patient: mother({ gravida_value: 2, parity_primary: 1 }) });
  assert.equal(group(second, 'registration', 'youngestChildAge').status, 'missing');
});

test('ANC shows workbook fields only, hides history for gravida 1, and does not invent visits', () => {
  const noAnc = rules.scanPatient({ patient: mother() });
  assert.equal(category(noAnc, 'anc').visitCount, 0);

  const scan = rules.scanPatient({
    patient: mother(),
    ancVisits: [{ id: 'v1', data: { visitNumber: 1, visitDate: '2024-02-01' } }]
  });
  assert.equal(category(scan, 'anc').visitCount, 1);
  assert.equal(group(scan, 'anc', 'previousObstetricHistory').status, 'not_needed');
  assert.equal(group(scan, 'anc', 'lastPregnancyOutcome').status, 'not_needed');
  assert.equal(group(scan, 'anc', 'medicines').status, 'missing');
  assert.equal(group(scan, 'anc', 'prevention').status, 'missing');
  assert.equal(group(scan, 'anc', 'cleanDeliveryKit').status, 'missing');
  assert.equal(group(scan, 'anc', 'screening').status, 'missing');
  assert.equal(category(scan, 'anc').groups.some(function (item) { return item.key === 'systolicBP' || item.key === 'temperature'; }), false);
  assert.equal(category(scan, 'anc').groups.some(function (item) { return item.key === 'otherVisits'; }), false);

  const multi = rules.scanPatient({
    patient: mother({ gravida_value: 3, parity_primary: 2 }),
    ancVisits: [{ id: 'v1', data: { visitNumber: 1, visitDate: '2024-02-01' } }]
  });
  assert.equal(group(multi, 'anc', 'previousObstetricHistory').status, 'missing');
  assert.equal(group(multi, 'anc', 'lastPregnancyOutcome').status, 'missing');
});

test('high-risk Other shows the condition text once, and Other diagnosis needs a name', () => {
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
  assert.equal(group(scan, 'anc', 'otherMedicalConditionName').status, 'missing');
  assert.equal(group(scan, 'anc', 'diagnosis').status, 'missing');
});

test('PNC without a delivery note requires Delivery Notes, and apply-all copies one ANC value to every visit', () => {
  const scan = rules.scanPatient({
    patient: mother(),
    pncVisits: [{ id: 'p1', data: { visitNumber: 1, visitDate: '2024-06-01', maternalOutcome: 'alive' } }]
  });
  assert.equal(category(scan, 'delivery').applicable, true);
  assert.equal(group(scan, 'delivery', 'deliveryNotes').status, 'missing');
  assert.equal(category(scan, 'newborn-links').redirects.filter(function (item) { return item.missing; }).length, 2);

  const incomplete = rules.planWrites({
    patient: mother(),
    pncVisits: [{ id: 'p1', data: { visitNumber: 1, visitDate: '2024-06-01', maternalOutcome: 'alive' } }]
  }, [{ module: 'delivery', create: true, values: { birthPlace: 'home' } }], { uid: 'midwife-1', now: '2026-10-10' });
  assert.equal(incomplete.ok, false);

  const applyAll = rules.planWrites({
    patient: mother(),
    ancVisits: [
      { id: 'v1', data: { visitNumber: 1, visitDate: '2024-02-01' } },
      { id: 'v2', data: { visitNumber: 2, visitDate: '2024-03-01' } }
    ]
  }, [{ module: 'anc', applyTo: 'all', values: { goiterStatus: 'No', tbSymptoms: 'No' } }], { uid: 'midwife-1', now: '2026-10-10' });
  assert.equal(applyAll.ok, true);
  assert.equal(applyAll.operations.length, 2);
  assert.deepEqual(applyAll.operations.map(function (item) { return item.path; }).sort(), [
    'patients/mother-1/antenatal_visits/v1',
    'patients/mother-1/antenatal_visits/v2'
  ]);
});

test('equivalent delivery mode values stay complete and unknown places stay blank until chosen', () => {
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
  assert.equal(group(aligned, 'delivery', 'modeOfDelivery').status, 'ok');

  const legacyPlace = rules.scanPatient({
    patient: mother(),
    delivery: { id: 'deliveryNotes', canonical: true, data: { deliveryDetails: { birthplace: 'old clinic' } } }
  });
  assert.equal(group(legacyPlace, 'delivery', 'birthPlace').status, 'missing');
});

test('Back Fill updates existing ANC visits only and accepts CDK Not given', () => {
  const createRejected = rules.planWrites({
    patient: mother(),
    ancVisits: [{ id: 'existing', data: { visitNumber: 2, visitDate: '2024-03-01' } }]
  }, [{
    module: 'anc',
    create: true,
    visitNumber: 4,
    values: { visitDate: '2024-05-01', tetanusToxoid: 'TD2' }
  }], { uid: 'midwife-1', now: '2026-10-10' });
  assert.equal(createRejected.ok, false);

  const cdk = rules.planWrites({
    patient: mother(),
    ancVisits: [
      { id: 'v1', data: { visitNumber: 1, visitDate: '2024-02-01' } },
      { id: 'v2', data: { visitNumber: 2, visitDate: '2024-03-01' } }
    ]
  }, [{ module: 'anc', applyTo: 'all', values: { cleanDeliveryKit: 'not_given' } }], { uid: 'midwife-1', now: '2026-10-10' });
  assert.equal(cdk.ok, true);
  assert.equal(cdk.operations[0].data.cleanDeliveryKitStatus, 'not_given');
  assert.equal(cdk.operations[0].data.cleanDeliveryKitNotGiven, true);
  assert.equal(Object.prototype.hasOwnProperty.call(cdk.operations[0].data, 'cleanDeliveryKitDate'), false);
});

test('TD cannot move backwards, and missing labs do not keep a complete patient on the list', () => {
  const backward = rules.planWrites({
    patient: mother(),
    ancVisits: [
      { id: 'v1', data: { visitNumber: 1, visitDate: '2024-02-01', tetanusToxoid: 'TD2' } },
      { id: 'v2', data: { visitNumber: 2, visitDate: '2024-03-01' } }
    ]
  }, [{
    module: 'anc',
    applyTo: 'per-visit',
    visitValues: {
      v1: { tetanusToxoid: 'TD2' },
      v2: { tetanusToxoid: 'TD1' }
    }
  }], { uid: 'midwife-1', now: '2026-10-10' });
  assert.equal(backward.ok, false);

  const labsOnly = rules.scanPatient({
    patient: mother(),
    ancVisits: [{
      id: 'v1',
      data: {
        visitNumber: 1,
        visitDate: '2024-02-01',
        goiterStatus: 'No',
        tbSymptoms: 'No',
        ironFolicAcid: 'Prescribed',
        micronutrientsTablet: 'Prescribed',
        vitaminB1: 'Prescribed',
        deworming: 'Prescribed',
        tetanusToxoid: 'TD1',
        provisionalDiagnosisType: 'Routine ANC',
        cleanDeliveryKitStatus: 'not_given'
      }
    }],
    testRecords: [{ id: 't1', data: { hivResult: 'Negative' } }]
  });
  assert.equal(category(labsOnly, 'test').optional, true);
  assert.equal(group(labsOnly, 'test', 'testDate').status, 'missing');
  assert.equal(labsOnly.gapCount, 0);
});

test('saves merge changed fields, keep replaced values in the audit, and reject clearing a name', () => {
  const bundle = {
    patient: mother(),
    ancVisits: [{ id: 'v1', data: { visitNumber: 1, visitDate: '2024-02-01', tetanusToxoid: '', td: 'TD1' } }]
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

  const clearPlan = rules.planWrites(bundle, [{
    module: 'registration',
    recordId: 'mother-1',
    values: { name: '' }
  }], { uid: 'midwife-1', now: '2026-10-10' });
  assert.equal(clearPlan.ok, false);
  assert.equal(clearPlan.operations.length, 0);
});

test('PNC mothers without newborn records get redirect cards instead of inline newborn forms', () => {
  const scan = rules.scanPatient({
    patient: mother(),
    pncVisits: [{ id: 'p1', data: { visitNumber: 1, visitDate: '2024-06-01', maternalOutcome: 'alive' } }],
    immediateRecords: [{ id: 'i1', data: { breathing_status: 'spontaneous' } }]
  });
  const redirects = category(scan, 'newborn-links').redirects;
  assert.equal(redirects.find(function (item) { return item.care === 'immediate'; }).missing, false);
  assert.equal(redirects.find(function (item) { return item.care === 'newborn'; }).missing, true);
  assert.equal(category(scan, 'newborn-links').groups.length, 0);
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
  const page = fs.readFileSync(path.join(root, 'js/retroactive-data-page.js'), 'utf8');
  const rulesSource = fs.readFileSync(path.join(root, 'js/retroactive-data-rules.js'), 'utf8');
  const worker = fs.readFileSync(path.join(root, 'service-worker.js'), 'utf8');
  assert.match(service, /merge:\s*true/);
  assert.doesNotMatch(service, /\.delete\(/);
  assert.match(service, /retroactive_backfill/);
  assert.match(home, /id="backFillCard"/);
  assert.match(page, /Apply to all visits/);
  assert.match(rulesSource, /immediate-newborn-care\.html/);
  assert.match(rulesSource, /newborn-care-page\.html/);
  assert.doesNotMatch(home, /tmo:\s*\[[^\]]*backFillCard/);
  assert.match(worker, /retroactive-data-entry\.html/);
  assert.match(worker, /mch-care-v346-moh/);
});
