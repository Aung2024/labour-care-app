'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');

function loadUtils() {
  const context = {
    window: {},
    firebase: {
      firestore: {
        FieldValue: { serverTimestamp() { return 'server-time'; } }
      }
    },
    console
  };
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'joint-care-utils.js'), 'utf8'),
    context
  );
  return context.window.JointCareUtils;
}

test('edit policy requires the visit creator and a seven-day timestamp', () => {
  const utils = loadUtils();
  const now = Date.parse('2026-08-31T00:00:00Z');
  assert.equal(utils.canUserEditVisitNow({
    createdBy: 'midwife-a',
    createdAt: '2026-08-25T00:00:01Z'
  }, 'midwife-a', now), true);
  assert.equal(utils.canUserEditVisitNow({
    createdBy: 'midwife-b',
    createdAt: '2026-08-30T00:00:00Z'
  }, 'midwife-a', now), false);
  assert.equal(utils.canUserEditVisitNow({
    createdBy: 'midwife-a',
    createdAt: '2026-08-23T00:00:00Z'
  }, 'midwife-a', now), false);
});

test('approval must be unused, supervised, and bound to the exact edit', () => {
  const utils = loadUtils();
  const approval = {
    patientId: 'patient-a',
    visitType: 'anc',
    visitId: 'visit-a',
    requesterId: 'midwife-a',
    status: 'approved',
    used: false,
    reviewedBy: 'tmo-a',
    reviewerRole: 'TMO'
  };
  assert.equal(utils.approvalMatchesEdit(
    approval, 'patient-a', 'anc', 'visit-a', 'midwife-a'
  ), true);
  assert.equal(utils.approvalMatchesEdit(
    { ...approval, used: true }, 'patient-a', 'anc', 'visit-a', 'midwife-a'
  ), false);
  assert.equal(utils.approvalMatchesEdit(
    { ...approval, visitId: 'another-visit' }, 'patient-a', 'anc', 'visit-a', 'midwife-a'
  ), false);
  assert.equal(utils.approvalMatchesEdit(
    { ...approval, reviewerRole: 'Midwife' }, 'patient-a', 'anc', 'visit-a', 'midwife-a'
  ), false);
  assert.equal(utils.approvalMatchesEdit(
    { ...approval, reviewedBy: 'midwife-a' }, 'patient-a', 'anc', 'visit-a', 'midwife-a'
  ), false);
});
