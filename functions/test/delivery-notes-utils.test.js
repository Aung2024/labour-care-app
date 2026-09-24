const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function loadUtils(overrides = {}) {
  const context = { window: {}, ...overrides };
  Object.assign(context.window, overrides.window || {});
  vm.createContext(context);
  const source = fs.readFileSync(
    path.join(__dirname, '../../js/delivery-notes-utils.js'),
    'utf8'
  );
  vm.runInContext(source, context);
  return context.window.DeliveryNotesUtils;
}

function loadKmcUtils() {
  const context = { window: {} };
  vm.createContext(context);
  const source = fs.readFileSync(path.join(__dirname, '../../js/kmc-utils.js'), 'utf8');
  vm.runInContext(source, context);
  return context.window.KmcUtils;
}

function loadBabyUtils() {
  const context = { window: {} };
  vm.createContext(context);
  const source = fs.readFileSync(
    path.join(__dirname, '../../js/baby-patient-utils.js'),
    'utf8'
  );
  vm.runInContext(source, context);
  return context.window.BabyPatientUtils;
}

function loadReportFacility() {
  const context = { window: {} };
  vm.createContext(context);
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, '../../js/facility-config.js'), 'utf8'),
    context
  );
  context.FacilityConfig = context.window.FacilityConfig;
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, '../../js/report-facility.js'), 'utf8'),
    context
  );
  return context.window.ReportFacility;
}

test('normalizes new delivery place and C-section subtype values', () => {
  const utils = loadUtils();
  assert.equal(utils.normalizeBirthPlaceForNewborn('government_hospital'), 'government_hospital');
  assert.equal(utils.normalizeBirthPlaceForNewborn('health_facility_subfacility'), 'health_facility_subfacility');
  assert.equal(utils.normalizeDeliveryModeForNewborn('elective_c_section'), 'elective_caesarean_section');
  assert.equal(utils.normalizeDeliveryModeForNewborn('emergency_c_section'), 'emergency_caesarean_section');
});

test('preserves per-baby canonical gram fields and delivery metadata', () => {
  const utils = loadUtils();
  const normalized = utils.normalizeDeliveryNotes({
    deliveryDetails: {
      pregnancyType: 'twins',
      gestationalWeek: 38.5,
      anusPresent: 'yes',
      birthProvider: 'skilled_birth_attendant',
      babies: [
        { babyIndex: 1, anusPresent: 'yes', birthWeightGram: 2450 },
        { babyIndex: 2, anusPresent: 'no', birthWeightGram: 2310 }
      ]
    }
  });
  assert.equal(normalized.deliveryDetails.gestationalWeek, 38.5);
  assert.equal(normalized.deliveryDetails.anusPresent, 'yes');
  assert.equal(normalized.deliveryDetails.birthProvider, 'skilled_birth_attendant');
  assert.deepEqual(
    Array.from(normalized.deliveryDetails.babies, (baby) => baby.anusPresent),
    ['yes', 'no']
  );
  assert.deepEqual(
    Array.from(normalized.deliveryDetails.babies, (baby) => baby.birthWeightGram),
    [2450, 2310]
  );
});

test('formats gestational age as weeks and days instead of a decimal', () => {
  const utils = loadUtils();
  const parts = utils.splitGestationalAge(38.5);
  assert.equal(parts.weeks, 38);
  assert.equal(parts.days, 4);
  assert.equal(utils.combineGestationalAge(38, 4), 38 + 4 / 7);
  assert.equal(utils.formatGestationalAgeWeeksDays(38.5, 'en'), '38 weeks 4 days');
  assert.equal(utils.formatGestationalAgeWeeksDays(38.5, 'mm'), '၃၈ ပတ် ၄ ရက်');
});

test('maps legacy delivery options without exposing them as new choices', () => {
  const utils = loadUtils();
  assert.equal(utils.normalizeBirthPlaceForForm('public_facility'), 'health_facility_subfacility');
  assert.equal(utils.birthPlaceLabel('health_facility_subfacility', 'en'), 'RHC/SRHC');
  assert.equal(utils.birthPlaceLabel('health_facility_subfacility', 'mm'), 'ကျန်းမာရေးဌာန/ဌာနခွဲ');
  assert.equal(utils.normalizeDeliveryModeForForm('c_section'), 'elective_c_section');
  assert.equal(utils.normalizeBirthProvider('tba_other'), 'tba');
  assert.equal(utils.birthProviderLabel('tba', 'en'), 'အရပ်လက်သည်');
  assert.equal(utils.birthProviderLabel('skilled_birth_attendant', 'en'), 'Skilled Birth Attendance');
});

test('normalizes maternal condition and persists it into legacy summaries', () => {
  const utils = loadUtils();
  const notes = utils.normalizeDeliveryNotes({
    deliveryDetails: {
      maternal_condition: 'deceased',
      birthPlace: 'public_facility',
      modeOfDelivery: 'caesarean_section'
    }
  });
  assert.equal(notes.deliveryDetails.maternalCondition, 'dead');
  assert.equal(notes.deliveryDetails.birthPlace, 'health_facility_subfacility');
  assert.equal(notes.deliveryDetails.modeOfDelivery, 'elective_c_section');
  assert.equal(utils.legacyFieldsFromDelivery(notes).maternal_condition, 'dead');
});

test('calculates and formats baby age from the Delivery Notes birth time', () => {
  const utils = loadUtils();
  const birthTime = '2026-09-20T10:00:00Z';
  const referenceTime = '2026-09-22T14:30:00Z';
  assert.equal(utils.calculateBabyAge(birthTime, referenceTime).days, 2);
  assert.equal(utils.formatBabyAge(birthTime, referenceTime, 'en'), '2 days');
  assert.equal(utils.formatBabyAge(birthTime, referenceTime, 'mm'), '၂ ရက်');
  assert.equal(utils.calculateBabyAge(referenceTime, birthTime), null);
});

test('resolves bilingual report facility names from patient or user codes', () => {
  const reportFacility = loadReportFacility();
  assert.equal(reportFacility.getFacilityName({ facility_code: '006' }, {}, 'en'), 'Pyinmana Township Public Health Department');
  assert.equal(reportFacility.getFacilityName({ facility_code: 6 }, {}, 'mm'), 'ပျဉ်းမနားမြို့နယ်ပြည်သူ့ကျန်းမာရေးဉီးစီးဌာန');
  assert.equal(reportFacility.getFacilityName({}, { facilityCode: '023' }, 'en'), 'Tatkon Township Hospital (100 Bedded)');
});

test('converts delivery-note grams to newborn-form kilograms', () => {
  const utils = loadUtils();
  assert.equal(utils.gramsToKilograms(2450), 2.45);
  assert.equal(utils.gramsToKilograms('3100'), 3.1);
  assert.equal(utils.gramsToKilograms(''), null);
});

test('syncs complete twin identity into existing Newborn Visit 1', async () => {
  let savedPatch = null;
  const existingData = {
    visit_number: 1,
    babies: [{ babyIndex: 1, clinical_notes: 'retain me' }]
  };
  const newbornCollection = {
    orderBy() {
      return {
        limit() {
          return {
            async get() {
              return {
                empty: false,
                docs: [{ id: 'visit-1', data: () => existingData }]
              };
            }
          };
        }
      };
    },
    doc(id) {
      assert.equal(id, 'visit-1');
      return {
        async set(patch) {
          savedPatch = patch;
        }
      };
    }
  };
  const firebase = {
    firestore() {
      return {
        collection(name) {
          assert.equal(name, 'patients');
          return {
            doc(patientId) {
              assert.equal(patientId, 'mother-1');
              return {
                collection(name) {
                  assert.equal(name, 'newborn_care');
                  return newbornCollection;
                }
              };
            }
          };
        }
      };
    }
  };
  const utils = loadUtils({ firebase, window: { firebase } });
  await utils.syncLegacyFieldsToNewbornIfEmpty('mother-1', {
    deliveryDetails: {
      pregnancyType: 'twins',
      babies: [
        { babyIndex: 1, babyName: 'Twin A', birthWeightGram: 2450 },
        { babyIndex: 2, babyName: 'Twin B', birthWeightGram: 2310 }
      ]
    }
  });

  assert.equal(savedPatch.pregnancy_type, 'twins');
  assert.equal(savedPatch.baby_count, 2);
  assert.deepEqual(
    Array.from(savedPatch.babies, (baby) => [baby.babyName, baby.birthWeightGram]),
    [['Twin A', 2450], ['Twin B', 2310]]
  );
  assert.equal(savedPatch.babies[0].clinical_notes, 'retain me');
});

test('dedupes mother and baby-patient KMC rows without collapsing twins', () => {
  const utils = loadKmcUtils();
  const rows = utils.dedupeKmcRows([
    { rowId: 'abc_1', patientId: 'abc', babyIndex: 1, babyName: 'Baby Aye', motherPatientId: 'abc' },
    { rowId: 'abc_baby_1_1', patientId: 'abc_baby_1', babyIndex: 1, babyName: 'Baby Aye' },
    {
      rowId: 'abc_2',
      patientId: 'abc',
      babyIndex: 2,
      babyName: 'Baby Aye',
      motherPatientId: 'abc',
      weightHistory: [
        { visitNumber: 1, grams: 1700, date: '2026-06-01' },
        { visitNumber: 2, grams: 1800, date: '2026-06-08' }
      ]
    },
    {
      rowId: 'abc_baby_2_1',
      patientId: 'abc_baby_2',
      babyIndex: 1,
      babyName: 'Baby Aye',
      weightHistory: [
        { visitNumber: 2, grams: 1900, date: '2026-06-15' },
        { grams: 2000, date: '2026-06-22' }
      ]
    }
  ]);
  assert.equal(rows.length, 2);
  const keys = new Set(rows.map((row) => utils.canonicalKmcKey(row)));
  assert.equal(keys.has('pid:abc:1'), true);
  assert.equal(keys.has('pid:abc:2'), true);
  const babyTwo = rows.find((row) => utils.canonicalKmcKey(row) === 'pid:abc:2');
  assert.equal(babyTwo.babyIndex, 2);
  assert.deepEqual(
    Array.from(babyTwo.weightHistory, (point) => point.grams),
    [1700, 1800, 1900, 2000]
  );
});

test('inherits KMC enrolment independently for each baby', () => {
  const utils = loadKmcUtils();
  const visits = [{
    visit_number: 1,
    kmc_babies: [
      { babyIndex: 1, kmc_selected: 'no' },
      { babyIndex: 2, kmc_selected: 'yes' }
    ]
  }];
  assert.equal(utils.babyHasKmcYesInVisits(visits, 1), false);
  assert.equal(utils.babyHasKmcYesInVisits(visits, 2), true);
});

test('baby identity is stable across manual and Delivery Note field names', () => {
  const utils = loadBabyUtils();
  const fromDelivery = utils.canonicalBabyIdentity(
    'mother-1',
    { babyIndex: 2, birthTime: '2026-09-20T10:00:00+06:30' },
    2,
    ''
  );
  const fromRegistration = utils.canonicalBabyIdentity(
    'mother-1',
    { birth_order: 2, date_of_birth: '2026-09-20' },
    2,
    ''
  );
  assert.equal(fromDelivery.key, fromRegistration.key);
  assert.equal(
    utils.babyMatchesIdentity({
      mother_patient_id: 'mother-1',
      birth_order: 2,
      date_of_birth: '2026-09-20'
    }, fromDelivery),
    true
  );
});

test('duplicate baby review prefers deterministic rich records without writing', () => {
  const utils = loadBabyUtils();
  const groups = utils.duplicateBabyCandidateGroups([
    {
      id: 'random-baby',
      data: {
        patient_type: 'baby',
        mother_patient_id: 'mother-1',
        birth_order: 1,
        date_of_birth: '2026-09-20'
      }
    },
    {
      id: 'mother-1_baby_1',
      data: {
        patient_type: 'baby',
        mother_patient_id: 'mother-1',
        birth_order: 1,
        date_of_birth: '2026-09-20',
        linked_from_delivery_notes: true,
        patient_unique_id: 'MOTHER-B1'
      }
    }
  ]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].canonicalPatientId, 'mother-1_baby_1');
  assert.equal(groups[0].duplicateCount, 1);
});
