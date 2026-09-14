'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function loadGlobals() {
  const context = {
    Buffer,
    Uint8Array,
    console,
    globalThis: {}
  };
  context.globalThis = context;
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, '..', 'js', 'voucher-pricing.js'), 'utf8'),
    context,
    { filename: 'voucher-pricing.js' }
  );
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, '..', 'js', 'voucher-service.js'), 'utf8'),
    context,
    { filename: 'voucher-service.js' }
  );
  return context;
}

function loadService() {
  return loadGlobals().VoucherService;
}

function loadPricing() {
  return loadGlobals().VoucherPricing;
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

test('computes hidden subsidized cost and 90/10 client project split', () => {
  const pricing = loadPricing();
  const shares = pricing.computeInvoiceShares(500000, 50000, 10, 90);

  assert.equal(shares.subsidizedCostMinor, 450000);
  assert.equal(shares.clientCopayMinor, 45000);
  assert.equal(shares.projectContributionMinor, 405000);
  assert.equal(shares.clientCopayMinor + shares.projectContributionMinor, shares.subsidizedCostMinor);
});

test('puts rounding remainder on the project contribution', () => {
  const pricing = loadPricing();
  const shares = pricing.computeInvoiceShares(100, 0, 10, 90);
  assert.equal(shares.clientCopayMinor + shares.projectContributionMinor, 100);
  assert.equal(shares.clientCopayMinor, 10);
  assert.equal(shares.projectContributionMinor, 90);
});

test('rejects percent pairs that do not add up to 100', () => {
  const pricing = loadPricing();
  assert.throws(() => pricing.normalizePercentPair(80, 10), /100/);
});

test('uses computed client and project shares when regular and lab share exist', () => {
  const pricing = loadPricing();
  const item = pricing.lineItemFromSheetService({
    serviceId: 'urine-re',
    serviceCode: 'URINE_RE',
    serviceName: 'Urine RE',
    regularPriceMinor: 500000,
    labCostShareMinor: 50000,
    clientCostShareMinor: 1,
    projectCostShareMinor: 2
  }, { clientPercent: 10, projectPercent: 90 });
  assert.equal(item.clientCopayMinor, 45000);
  assert.equal(item.projectContributionMinor, 405000);
});

test('includes the 16 Excel laboratory tests', () => {
  const pricing = loadPricing();
  assert.equal(pricing.STANDARD_LAB_TESTS.length, 16);
  assert.equal(pricing.STANDARD_LAB_TESTS[15].name, 'Chest X-ray (with Opinion)');
  assert.equal(pricing.STANDARD_LAB_TESTS[12].name, 'HBA1C');
});
