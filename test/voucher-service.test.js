'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function loadService() {
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'js', 'voucher-service.js'),
    'utf8'
  );
  const context = {
    Buffer,
    Uint8Array,
    console,
    globalThis: {}
  };
  context.globalThis = context;
  vm.runInNewContext(source, context, { filename: 'voucher-service.js' });
  return context.VoucherService;
}

test('generates a 128-bit base64url opaque identifier', () => {
  const service = loadService();
  const provider = {
    getRandomValues(bytes) {
      for (let index = 0; index < bytes.length; index += 1) bytes[index] = index;
      return bytes;
    }
  };
  const identifier = service.generateOpaqueId(provider);

  assert.equal(identifier, 'AAECAwQFBgcICQoLDA0ODw');
  assert.equal(identifier.length, 22);
  assert.match(identifier, /^[A-Za-z0-9_-]{22}$/);
});

test('generates a short typeable voucher code', () => {
  const service = loadService();
  const provider = {
    getRandomValues(bytes) {
      for (let index = 0; index < bytes.length; index += 1) bytes[index] = index + 3;
      return bytes;
    }
  };
  const code = service.generateVoucherCode(provider);

  assert.match(code, /^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
  assert.equal(code.length, 9);
  assert.equal(service.normalizeVoucherCode(code.replace('-', '').toLowerCase()), code);
});

test('QR payload contains only protocol version and opaque code', () => {
  const service = loadService();
  const code = 'K7MP-3QWX';
  const payload = service.buildQrPayload(code);

  assert.deepEqual(Object.keys(JSON.parse(payload)).sort(), ['c', 'v']);
  assert.equal(service.parseQrPayload(payload), code);
  assert.equal(payload.includes('patient'), false);
  assert.equal(payload.includes('beneficiary'), false);
});

test('rejects QR payloads with extra data or non-opaque codes', () => {
  const service = loadService();

  assert.throws(
    () => service.parseQrPayload('{"v":1,"c":"K7MP-3QWX","name":"PHI"}'),
    /Unsupported/
  );
  assert.throws(() => service.buildQrPayload('VOUCHER-123'), /voucher code|8-character/i);
});

test('accepts legacy 22-character voucher codes', () => {
  const service = loadService();
  const legacy = 'AAECAwQFBgcICQoLDA0ODw';
  assert.equal(service.validateVoucherCode(legacy), legacy);
  assert.equal(service.parseQrPayload(service.buildQrPayload(legacy)), legacy);
});

test('validates service codes and currencies consistently', () => {
  const service = loadService();

  assert.equal(service.validateServiceCode('lab_test-1'), 'LAB_TEST-1');
  assert.equal(service.validateCurrency('mmk'), 'MMK');
  assert.throws(() => service.validateServiceCode('bad code'), /unsupported/);
  assert.throws(() => service.validateCurrency('kyats'), /at most 3|three-letter/);
});

test('requires discount price and project share to equal total cost', () => {
  const service = loadService();

  assert.deepEqual(
    JSON.parse(JSON.stringify(service.validateCostShares(500000, 50000, 450000))),
    { subsidized: 500000, client: 50000, project: 450000 }
  );
  assert.throws(
    () => service.validateCostShares(500000, 50000, 400000),
    /must equal/
  );
});
