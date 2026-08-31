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
