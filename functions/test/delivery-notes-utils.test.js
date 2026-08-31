const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function loadUtils() {
  const context = { window: {} };
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
