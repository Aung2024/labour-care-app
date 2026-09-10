'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { HttpsError } = require('firebase-functions/v2/https');
const { normalizeMyanmarMobile } = require('../src/sms/phone');
const {
  HRT_SMS_TEMPLATES,
  currentGaWeeks,
  gaBandForWeeks,
  resolveHrtSmsTemplate
} = require('../src/sms/hrt-templates');
const { buildSmsPohPayload, authHeader } = require('../src/sms/smspoh-client');
const { assertCanSendHrtSms, assertTrackingRowScope } = require('../src/sms/access');

test('normalizes Myanmar mobiles to 09 form', () => {
  assert.equal(normalizeMyanmarMobile('09 123 456 789'), '09123456789');
  assert.equal(normalizeMyanmarMobile('+959123456789'), '09123456789');
  assert.equal(normalizeMyanmarMobile('959123456789'), '09123456789');
  assert.equal(normalizeMyanmarMobile('9123456789'), '09123456789');
  assert.equal(normalizeMyanmarMobile('abc'), null);
  assert.equal(normalizeMyanmarMobile('021234567'), null);
});

test('GA bands follow the MOH trimester cutovers', () => {
  assert.equal(gaBandForWeeks(13.9), 't1');
  assert.equal(gaBandForWeeks(14), 't2');
  assert.equal(gaBandForWeeks(27.9), 't2');
  assert.equal(gaBandForWeeks(28), 't3');
  assert.equal(gaBandForWeeks(41), 't3');
  assert.equal(gaBandForWeeks(null), null);
});

test('current GA advances from the latest ANC recording', () => {
  const weeks = currentGaWeeks({
    latestAnc: { gestationalAge: 20, visitDate: '2026-08-27' }
  }, '2026-09-10');
  assert.equal(weeks, 22);
});

test('current GA falls back to LMP and EDD', () => {
  const fromLmp = currentGaWeeks({ lmp: '2026-01-01' }, '2026-04-02');
  assert.ok(fromLmp >= 12.9 && fromLmp <= 13.2);
  const fromEdd = currentGaWeeks({ edd: '2026-10-08' }, '2026-05-28');
  assert.ok(fromEdd >= 20.8 && fromEdd <= 21.2);
});

test('picks the first matching HRT template by spreadsheet priority', () => {
  const resolved = resolveHrtSmsTemplate([
    'Primigravida',
    'Diabetes (pre-existing or gestational)'
  ], 22);
  assert.equal(resolved.ok, true);
  assert.equal(resolved.template.key, 'diabetes');
});

test('PIH and placenta templates depend on GA band', () => {
  const pihEarly = resolveHrtSmsTemplate([
    'Pregnancy Induced Hypertension/Pre-eclampsia/Eclampsia'
  ], 10);
  assert.equal(pihEarly.template.key, 'pih_t1');
  const placentaLate = resolveHrtSmsTemplate(['Placenta previa/Abruption'], 30);
  assert.equal(placentaLate.template.key, 'placenta_t3');
  const missingGa = resolveHrtSmsTemplate(['Placenta previa/Abruption'], null);
  assert.equal(missingGa.ok, false);
  assert.equal(missingGa.code, 'GA_REQUIRED');
});

test('combined heart/kidney ANC factor uses the heart template', () => {
  const resolved = resolveHrtSmsTemplate(['Heart Disease (or) Kidney Disease'], 18);
  assert.equal(resolved.ok, true);
  assert.equal(resolved.template.key, 'heart_disease');
});

test('previous scar alone cannot send', () => {
  const resolved = resolveHrtSmsTemplate(['Previous scar'], 20);
  assert.equal(resolved.ok, false);
  assert.equal(resolved.code, 'UNSUPPORTED_FACTOR');
});

test('HRT templates keep official Myanmar copy and skip KMC', () => {
  assert.ok(HRT_SMS_TEMPLATES.every((template) => /[က-ဟ]/.test(template.message)));
  assert.equal(HRT_SMS_TEMPLATES.some((template) => /kmc/i.test(template.key)), false);
});

test('SMSPoh payload forces unicode and Bearer auth', () => {
  const payload = buildSmsPohPayload({
    to: '09123456789',
    message: 'ယခုကာလသည်',
    from: 'MOH',
    clientReference: 'sms-1'
  });
  assert.equal(payload.unicode, true);
  assert.equal(payload.from, 'MOH');
  assert.equal(authHeader('key', 'secret'), `Bearer ${Buffer.from('key:secret').toString('base64')}`);
});

test('only midwives may send HRT SMS', () => {
  assert.doesNotThrow(() => assertCanSendHrtSms({ role: 'midwife', uid: 'm1' }));
  assert.throws(
    () => assertCanSendHrtSms({ role: 'tmo', uid: 't1' }),
    (error) => error instanceof HttpsError && error.code === 'permission-denied'
  );
});

test('midwives can only SMS patients in their HRT scope', () => {
  assert.doesNotThrow(() => assertTrackingRowScope(
    { role: 'midwife', uid: 'm1' },
    { providerId: 'other', careTeamProviderIds: ['m1'] }
  ));
  assert.throws(
    () => assertTrackingRowScope(
      { role: 'midwife', uid: 'm1' },
      { providerId: 'other', careTeamProviderIds: [] }
    ),
    (error) => error instanceof HttpsError && error.code === 'permission-denied'
  );
});
