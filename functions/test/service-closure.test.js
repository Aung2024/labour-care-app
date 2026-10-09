const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function loadClosure() {
  const context = { window: {} };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../../js/service-closure.js'), 'utf8'), context);
  return context.window.ServiceClosure;
}

test('service closure stays separate from clinical outcomes and validates mother death details', () => {
  const api = loadClosure();
  assert.equal(api.isClosed({ status: 'postnatal' }), false);
  assert.equal(api.isClosed({ serviceClosure: { status: 'closed', outcome: 'service_complete' } }), true);

  const missing = api.validate('mother', { outcome: 'maternal_death' });
  assert.equal(missing.ok, false);

  const saved = api.validate('mother', {
    outcome: 'maternal_death',
    deathPeriod: 'postpartum_42',
    deathCause: 'pregnancy_related',
    detail: 'PPH'
  });
  assert.equal(saved.ok, true);
  assert.equal(saved.record.status, 'closed');
  assert.equal(saved.record.detail, 'PPH');
  assert.equal(saved.record.outcome, 'maternal_death');

  const baby = api.validate('baby', { outcome: 'child_death' });
  assert.equal(baby.ok, true);
  assert.equal(api.kindOf({ mother_patient_id: 'mother-1' }), 'baby');
});
