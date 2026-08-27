'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('runtime and CLI configs target only the isolated project', () => {
  const runtime = JSON.parse(read('firebase.runtime-config.json'));
  const firebaserc = JSON.parse(read('.firebaserc'));

  assert.equal(runtime.projectId, 'labourcare-2481a');
  assert.equal(firebaserc.projects.default, 'labourcare-2481a');
  assert.doesNotMatch(JSON.stringify(runtime), /mnch-1cbda/);
  assert.doesNotMatch(JSON.stringify(firebaserc), /mnch-1cbda/);
});

test('browser initialization rejects a mismatched runtime project', () => {
  const firebaseSource = read('js/firebase.js');
  assert.match(firebaseSource, /EXPECTED_FIREBASE_PROJECT_ID\s*=\s*["']labourcare-2481a["']/);
  assert.match(firebaseSource, /firebaseConfig\.projectId\s*!==\s*EXPECTED_FIREBASE_PROJECT_ID/);
});

test('Spark release blocks Cloud Functions deployment', () => {
  const firebaseJson = JSON.parse(read('firebase.json'));
  const functionsPackage = JSON.parse(read('functions/package.json'));
  assert.ok(firebaseJson.functions.predeploy.some((command) => command.includes('block-functions-deploy.js')));
  assert.match(functionsPackage.scripts.deploy, /block-functions-deploy\.js/);
});

test('offline caches are namespaced for the isolated project', () => {
  assert.match(read('service-worker.js'), /labourcare-2481a-vouchers/);
  assert.match(read('js/offline-store.js'), /LabourCareOffline_labourcare_2481a/);
  assert.match(read('js/offline-manager.js'), /mch_offline_db_labourcare_2481a/);
});
