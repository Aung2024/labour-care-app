'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

function readAppFile(name) {
  return fs.readFileSync(path.resolve(__dirname, '../..', name), 'utf8');
}

test('antenatal test save validates the form and hidden TB values are retained', () => {
  const source = readAppFile('antenatal-tests-form.html');
  assert.match(source, /if \(!form\.checkValidity\(\)\) \{\s*form\.reportValidity\(\);/);

  const toggleStart = source.indexOf('function toggleTbDetails()');
  const toggleEnd = source.indexOf('\n    function ', toggleStart + 1);
  const toggleSource = source.slice(toggleStart, toggleEnd);
  assert.doesNotMatch(toggleSource, /input\.value\s*=\s*['"]{2}/);
});

test('immediate newborn care requires exactly one breathing status before save', () => {
  const source = readAppFile('immediate-newborn-care-form.html');
  const requiredBreathingInputs = source.match(
    /name="breathing_status"[^>]*required/g
  ) || [];
  assert.equal(requiredBreathingInputs.length, 2);
  assert.match(source, /selectedBreathingStatuses\.length !== 1/);
  assert.match(source, /form\.reportValidity\(\);/);
});

test('newborn care uses shared alert logic and canonical storage patient ID', () => {
  const source = readAppFile('newborn-care-page.html');
  assert.match(source, /src="js\/infection-alerts\.js"/);
  assert.match(source, /InfectionAlerts\.collectFlags\(tests\)/);
  assert.match(
    source,
    /weightEl\.value = DeliveryNotesUtils\.gramsToKilograms\(matchedBaby\.birthWeightGram\)/
  );
  assert.doesNotMatch(
    source,
    /\.doc\(patientId\)\s*\.collection\('newborn_care'\)/
  );
  assert.match(source, /patientId: getNewbornCareStoragePatientId\(\)/);
  assert.match(
    source,
    /\.doc\(getNewbornCareStoragePatientId\(\)\)\s*\.collection\('newborn_care'\)/
  );
});
