/**
 * Spark-compatible voucher data access and validation.
 *
 * This file intentionally exposes one browser global and contains no module
 * loader calls so it can run with the Firebase v8 namespaced SDK.
 */
(function (root) {
  'use strict';

  var COLLECTIONS = Object.freeze({
    CATALOG: 'voucher_service_catalog',
    PRICING: 'voucher_pricing_versions',
    BUDGETS: 'voucher_budgets',
    QUOTAS: 'voucher_quotas',
    PRICE_SHEETS: 'voucher_price_sheets',
    PRICE_ASSIGNMENTS: 'voucher_price_assignments',
    OVERRIDES: 'voucher_price_overrides',
    ACCOUNT_BUDGETS: 'voucher_account_budgets',
    ACCOUNT_QUOTAS: 'voucher_account_quotas',
    VOUCHERS: 'vouchers',
    LAB_CONFIGS: 'voucher_lab_configs',
    LAB_SETTINGS: 'lab_settings',
    PO_SETTINGS: 'po_settings',
    PERIOD_STATS: 'voucher_period_stats',
    PROGRAM_SETTINGS: 'voucher_program_settings'
  });
  var VOUCHER_STATUSES = Object.freeze(['issued', 'redeemed', 'verified', 'paid', 'rejected']);
  var MAX_IMAGE_CHARS = 180000;
  var OPAQUE_ID_PATTERN = /^[A-Za-z0-9_-]{22}$/;
  var SHORT_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  var SHORT_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/;
  var CURRENCY_PATTERN = /^[A-Z]{3}$/;
  var SERVICE_CODE_PATTERN = /^[A-Z0-9][A-Z0-9_-]{1,31}$/;
  var MAX_REPORTING_WINDOW_DAYS = 93;

  function requireObject(value, label) {
    if (!value || Object.prototype.toString.call(value) !== '[object Object]') {
      throw new Error((label || 'Value') + ' must be an object.');
    }
    return value;
  }

  function requireString(value, label, maxLength) {
    if (typeof value !== 'string' || !value.trim()) {
      throw new Error(label + ' is required.');
    }
    var clean = value.trim();
    if (maxLength && clean.length > maxLength) {
      throw new Error(label + ' must be at most ' + maxLength + ' characters.');
    }
    return clean;
  }

  function requireInteger(value, label, minimum) {
    if (!Number.isSafeInteger(value) || value < minimum) {
      throw new Error(label + ' must be a safe integer of at least ' + minimum + '.');
    }
    return value;
  }

  function validateCurrency(value) {
    var currency = requireString(value, 'Currency', 3).toUpperCase();
    if (!CURRENCY_PATTERN.test(currency)) {
      throw new Error('Currency must be a three-letter ISO-style code.');
    }
    return currency;
  }

  function validateServiceCode(value) {
    var code = requireString(value, 'Service code', 32).toUpperCase();
    if (!SERVICE_CODE_PATTERN.test(code)) {
      throw new Error('Service code contains unsupported characters.');
    }
    return code;
  }

  function pricingApi() {
    if (!root.VoucherPricing) {
      throw new Error('VoucherPricing must be loaded before VoucherService.');
    }
    return root.VoucherPricing;
  }

  function validateCostShares(subsidizedMinor, clientMinor, projectMinor) {
    var subsidized = requireInteger(subsidizedMinor, 'Total cost', 0);
    var client = requireInteger(clientMinor, 'Discount price', 0);
    var project = requireInteger(projectMinor, 'Project cost share', 0);
    if (client + project !== subsidized) {
      throw new Error('Discount price and project cost share must equal the total cost.');
    }
    return { subsidized: subsidized, client: client, project: project };
  }

  function normalizeVoucherCode(value) {
    var raw = String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (OPAQUE_ID_PATTERN.test(String(value || '').trim())) return String(value).trim();
    if (raw.length === 8 && new RegExp('^[' + SHORT_CODE_ALPHABET + ']{8}$').test(raw)) {
      return raw.slice(0, 4) + '-' + raw.slice(4);
    }
    return String(value || '').trim();
  }

  function validateOpaqueId(value, label) {
    if (typeof value !== 'string' || !OPAQUE_ID_PATTERN.test(value)) {
      throw new Error((label || 'Identifier') + ' must be a 22-character opaque identifier.');
    }
    return value;
  }

  function validateVoucherCode(value, label) {
    var code = normalizeVoucherCode(value);
    if (!SHORT_CODE_PATTERN.test(code) && !OPAQUE_ID_PATTERN.test(code)) {
      throw new Error((label || 'Voucher code') + ' must be an 8-character lab code such as AB3K-9Q2M.');
    }
    return code;
  }

  function bytesToBase64Url(bytes) {
    var binary = '';
    for (var index = 0; index < bytes.length; index += 1) {
      binary += String.fromCharCode(bytes[index]);
    }
    if (typeof root.btoa === 'function') {
      return root.btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }
    if (typeof Buffer !== 'undefined') {
      return Buffer.from(bytes).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }
    throw new Error('No base64 encoder is available.');
  }

  function generateOpaqueId(cryptoProvider) {
    var provider = cryptoProvider || root.crypto;
    if (!provider || typeof provider.getRandomValues !== 'function') {
      throw new Error('Secure random number generation is unavailable.');
    }
    var bytes = new Uint8Array(16);
    provider.getRandomValues(bytes);
    return bytesToBase64Url(bytes);
  }

  function generateVoucherCode(cryptoProvider) {
    var provider = cryptoProvider || root.crypto;
    if (!provider || typeof provider.getRandomValues !== 'function') {
      throw new Error('Secure random number generation is unavailable.');
    }
    var bytes = new Uint8Array(8);
    provider.getRandomValues(bytes);
    var chars = '';
    for (var index = 0; index < bytes.length; index += 1) {
      chars += SHORT_CODE_ALPHABET.charAt(bytes[index] % SHORT_CODE_ALPHABET.length);
    }
    return chars.slice(0, 4) + '-' + chars.slice(4);
  }

  function buildQrPayload(voucherCode) {
    return JSON.stringify({ v: 1, c: validateVoucherCode(voucherCode, 'Voucher code') });
  }

  function parseQrPayload(payload) {
    if (typeof payload !== 'string' || payload.length > 64) {
      throw new Error('Invalid voucher QR payload.');
    }
    var parsed;
    try {
      parsed = JSON.parse(payload);
    } catch (error) {
      throw new Error('Invalid voucher QR payload.');
    }
    var keys = Object.keys(requireObject(parsed, 'QR payload')).sort();
    if (keys.length !== 2 || keys[0] !== 'c' || keys[1] !== 'v' || parsed.v !== 1) {
      throw new Error('Unsupported voucher QR payload.');
    }
    return validateVoucherCode(parsed.c, 'Voucher code');
  }

  function firebaseContext() {
    if (!root.firebase || !root.firebase.firestore || !root.firebase.auth) {
      throw new Error('Firebase v8 Auth and Firestore must be loaded first.');
    }
    var user = root.firebase.auth().currentUser;
    if (!user) {
      throw new Error('Authentication is required.');
    }
    return {
      db: root.firebase.firestore(),
      user: user,
      fieldValue: root.firebase.firestore.FieldValue,
      timestamp: root.firebase.firestore.Timestamp
    };
  }

  function serverTimestamp(context) {
    return context.fieldValue.serverTimestamp();
  }

  function dateTimestamp(context, value, label) {
    var date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new Error(label + ' must be a valid date.');
    }
    return context.timestamp.fromDate(date);
  }

  function saveCatalogService(input) {
    var data = requireObject(input, 'Service');
    var context = firebaseContext();
    var serviceId = requireString(data.serviceId, 'Service ID', 64);
    var ref = context.db.collection(COLLECTIONS.CATALOG).doc(serviceId);
    return ref.get().then(function (snapshot) {
      var now = serverTimestamp(context);
      var record = {
        serviceCode: validateServiceCode(data.serviceCode),
        serviceName: requireString(data.serviceName, 'Service name', 120),
        description: typeof data.description === 'string' ? data.description.trim().slice(0, 500) : '',
        defaultUnitPriceMinor: requireInteger(data.defaultUnitPriceMinor, 'Default price', 0),
        defaultSubsidizedCostMinor: requireInteger(
          data.defaultSubsidizedCostMinor == null ? data.defaultUnitPriceMinor : data.defaultSubsidizedCostMinor,
          'Total cost',
          0
        ),
        defaultClientCostShareMinor: requireInteger(data.defaultClientCostShareMinor || 0, 'Discount price', 0),
        defaultProjectCostShareMinor: requireInteger(
          data.defaultProjectCostShareMinor == null ? data.defaultUnitPriceMinor : data.defaultProjectCostShareMinor,
          'Project cost share',
          0
        ),
        currency: validateCurrency(data.currency),
        active: data.active !== false,
        updatedAt: now,
        updatedBy: context.user.uid
      };
      validateCostShares(
        record.defaultSubsidizedCostMinor,
        record.defaultClientCostShareMinor,
        record.defaultProjectCostShareMinor
      );
      if (!snapshot.exists) {
        record.createdAt = now;
        record.createdBy = context.user.uid;
      }
      return ref.set(record, { merge: snapshot.exists }).then(function () { return serviceId; });
    });
  }

  function publishPricingVersion(input) {
    var data = requireObject(input, 'Pricing version');
    var context = firebaseContext();
    var versionId = generateOpaqueId();
    var serviceId = requireString(data.serviceId, 'Service ID', 64);
    var midwifeId = data.midwifeId == null ? null : requireString(data.midwifeId, 'Midwife ID', 128);
    var serviceRef = context.db.collection(COLLECTIONS.CATALOG).doc(serviceId);
    var pricingRef = context.db.collection(COLLECTIONS.PRICING).doc(versionId);
    return context.db.runTransaction(function (transaction) {
      return transaction.get(serviceRef).then(function (snapshot) {
        if (!snapshot.exists || snapshot.data().active !== true) {
          throw new Error('An active catalog service is required.');
        }
        var service = snapshot.data();
        var currency = validateCurrency(data.currency);
        if (currency !== service.currency) {
          throw new Error('Pricing currency must match the catalog service.');
        }
        transaction.set(pricingRef, {
          serviceId: serviceId,
          serviceCodeSnapshot: service.serviceCode,
          serviceNameSnapshot: service.serviceName,
          midwifeId: midwifeId,
          unitPriceMinor: requireInteger(data.unitPriceMinor, 'Unit price', 0),
          currency: currency,
          status: 'published',
          publishedAt: serverTimestamp(context),
          publishedBy: context.user.uid,
          note: typeof data.note === 'string' ? data.note.trim().slice(0, 240) : ''
        });
        return versionId;
      });
    });
  }

  function createBudget(input) {
    var data = requireObject(input, 'Budget');
    var context = firebaseContext();
    var budgetId = generateOpaqueId();
    var totalMinor = requireInteger(data.totalMinor, 'Budget total', 1);
    var record = {
      programId: requireString(data.programId, 'Program ID', 64),
      serviceId: requireString(data.serviceId, 'Service ID', 64),
      currency: validateCurrency(data.currency),
      totalMinor: totalMinor,
      remainingMinor: totalMinor,
      status: 'active',
      lastAllocationId: '',
      createdAt: serverTimestamp(context),
      createdBy: context.user.uid,
      updatedAt: serverTimestamp(context),
      updatedBy: context.user.uid
    };
    return context.db.collection(COLLECTIONS.BUDGETS).doc(budgetId).set(record)
      .then(function () { return budgetId; });
  }

  function topUpBudget(input) {
    var data = requireObject(input, 'Budget top-up');
    var context = firebaseContext();
    var budgetId = validateOpaqueId(data.budgetId, 'Budget ID');
    var amountMinor = requireInteger(data.amountMinor, 'Top-up amount', 1);
    var budgetRef = context.db.collection(COLLECTIONS.BUDGETS).doc(budgetId);
    return context.db.runTransaction(function (transaction) {
      return transaction.get(budgetRef).then(function (snapshot) {
        if (!snapshot.exists) throw new Error('Budget was not found.');
        var budget = snapshot.data();
        if (budget.status !== 'active') throw new Error('Only active budgets can be topped up.');
        if (!Number.isSafeInteger(budget.totalMinor + amountMinor) ||
            !Number.isSafeInteger(budget.remainingMinor + amountMinor)) {
          throw new Error('Budget top-up exceeds the supported range.');
        }
        transaction.update(budgetRef, {
          totalMinor: budget.totalMinor + amountMinor,
          remainingMinor: budget.remainingMinor + amountMinor,
          updatedAt: serverTimestamp(context),
          updatedBy: context.user.uid
        });
        return budgetId;
      });
    });
  }

  function setBudgetStatus(budgetId, status) {
    var context = firebaseContext();
    validateOpaqueId(budgetId, 'Budget ID');
    if (status !== 'active' && status !== 'closed') {
      throw new Error('Budget status must be active or closed.');
    }
    return context.db.collection(COLLECTIONS.BUDGETS).doc(budgetId).update({
      status: status,
      updatedAt: serverTimestamp(context),
      updatedBy: context.user.uid
    }).then(function () { return budgetId; });
  }

  function allocateQuota(input) {
    var data = requireObject(input, 'Quota allocation');
    var context = firebaseContext();
    var budgetId = validateOpaqueId(data.budgetId, 'Budget ID');
    var pricingVersionId = validateOpaqueId(data.pricingVersionId, 'Pricing version ID');
    var midwifeId = requireString(data.midwifeId, 'Midwife ID', 128);
    var allocatedUnits = requireInteger(data.allocatedUnits, 'Allocated units', 1);
    var quotaId = generateOpaqueId();
    var budgetRef = context.db.collection(COLLECTIONS.BUDGETS).doc(budgetId);
    var pricingRef = context.db.collection(COLLECTIONS.PRICING).doc(pricingVersionId);
    var quotaRef = context.db.collection(COLLECTIONS.QUOTAS).doc(quotaId);

    return context.db.runTransaction(function (transaction) {
      return Promise.all([transaction.get(budgetRef), transaction.get(pricingRef)]).then(function (snapshots) {
        var budgetSnapshot = snapshots[0];
        var pricingSnapshot = snapshots[1];
        if (!budgetSnapshot.exists || !pricingSnapshot.exists) {
          throw new Error('Budget or pricing version was not found.');
        }
        var budget = budgetSnapshot.data();
        var pricing = pricingSnapshot.data();
        if (budget.status !== 'active' || pricing.status !== 'published') {
          throw new Error('Budget and pricing version must be active.');
        }
        if (budget.serviceId !== pricing.serviceId || budget.currency !== pricing.currency) {
          throw new Error('Budget and pricing version do not match.');
        }
        if (pricing.midwifeId !== null && pricing.midwifeId !== midwifeId) {
          throw new Error('Pricing version is not published for this midwife.');
        }
        var allocationMinor = allocatedUnits * pricing.unitPriceMinor;
        if (!Number.isSafeInteger(allocationMinor) || budget.remainingMinor < allocationMinor) {
          throw new Error('Budget has insufficient funds for this allocation.');
        }
        var now = serverTimestamp(context);
        transaction.update(budgetRef, {
          remainingMinor: budget.remainingMinor - allocationMinor,
          lastAllocationId: quotaId,
          updatedAt: now,
          updatedBy: context.user.uid
        });
        transaction.set(quotaRef, {
          budgetId: budgetId,
          serviceId: budget.serviceId,
          midwifeId: midwifeId,
          pricingVersionId: pricingVersionId,
          serviceCodeSnapshot: requireString(pricing.serviceCodeSnapshot, 'Pricing service code', 32),
          serviceNameSnapshot: requireString(pricing.serviceNameSnapshot, 'Pricing service name', 120),
          unitPriceMinor: pricing.unitPriceMinor,
          currency: pricing.currency,
          allocatedUnits: allocatedUnits,
          remainingUnits: allocatedUnits,
          status: 'active',
          lastVoucherId: '',
          allocatedAt: now,
          allocatedBy: context.user.uid,
          updatedAt: now,
          updatedBy: context.user.uid
        });
        return quotaId;
      });
    });
  }

  function normalizeSheetService(input, percents) {
    var service = requireObject(input, 'Price-sheet service');
    var computed = null;
    if (service.regularPriceMinor != null || service.labCostShareMinor != null) {
      computed = pricingApi().computeInvoiceShares(
        requireInteger(service.regularPriceMinor, 'Regular price', 0),
        requireInteger(service.labCostShareMinor, 'Lab cost share', 0),
        percents && percents.clientPercent,
        percents && percents.projectPercent
      );
    }
    var shares = validateCostShares(
      requireInteger(
        computed ? computed.subsidizedCostMinor : service.subsidizedCostMinor,
        'Total cost',
        0
      ),
      requireInteger(
        computed ? computed.clientCopayMinor : service.clientCostShareMinor,
        'Discount price',
        0
      ),
      requireInteger(
        computed ? computed.projectContributionMinor : service.projectCostShareMinor,
        'Project cost share',
        0
      )
    );
    return {
      serviceId: requireString(service.serviceId, 'Service ID', 64),
      serviceCode: validateServiceCode(service.serviceCode),
      serviceName: requireString(service.serviceName, 'Service name', 120),
      regularPriceMinor: computed ? computed.regularPriceMinor : shares.subsidized,
      labCostShareMinor: computed ? computed.labCostShareMinor : 0,
      subsidizedCostMinor: shares.subsidized,
      clientCostShareMinor: shares.client,
      projectCostShareMinor: shares.project
    };
  }

  function publishPriceSheet(input) {
    var data = requireObject(input, 'Price sheet');
    var context = firebaseContext();
    var labId = data.labId == null ? null : requireString(data.labId, 'Lab ID', 128);
    var percents = data.clientPercent != null || data.projectPercent != null
      ? pricingApi().normalizePercentPair(
        data.projectPercent == null ? 100 - data.clientPercent : data.projectPercent,
        data.clientPercent == null ? 100 - data.projectPercent : data.clientPercent
      )
      : null;
    var services = (data.services || []).map(function (service) {
      return normalizeSheetService(service, percents);
    });
    if (!services.length || services.length > 30) {
      throw new Error('A price sheet must contain between 1 and 30 services.');
    }
    var serviceIds = services.map(function (item) { return item.serviceId; });
    if (new Set(serviceIds).size !== serviceIds.length) {
      throw new Error('A price sheet cannot contain duplicate services.');
    }
    var sheetId = generateOpaqueId();
    var assignmentId = labId || 'global';
    var sheetRef = context.db.collection(COLLECTIONS.PRICE_SHEETS).doc(sheetId);
    var assignmentRef = context.db.collection(COLLECTIONS.PRICE_ASSIGNMENTS).doc(assignmentId);
    var batch = context.db.batch();
    var pricesByServiceId = {};
    services.forEach(function (item) {
      pricesByServiceId[item.serviceId] = {
        regularPriceMinor: item.regularPriceMinor,
        labCostShareMinor: item.labCostShareMinor,
        clientCostShareMinor: item.clientCostShareMinor,
        projectCostShareMinor: item.projectCostShareMinor
      };
    });
    var sheetRecord = {
      labId: labId,
      midwifeId: null,
      currency: validateCurrency(data.currency || 'MMK'),
      status: 'published',
      serviceIds: serviceIds,
      services: services,
      pricesByServiceId: pricesByServiceId,
      projectCeilingMinor: data.projectCeilingMinor == null
        ? 0
        : requireInteger(data.projectCeilingMinor, 'Project ceiling', 0),
      publishedAt: serverTimestamp(context),
      publishedBy: context.user.uid
    };
    if (percents) {
      sheetRecord.clientPercent = percents.clientPercent;
      sheetRecord.projectPercent = percents.projectPercent;
    }
    batch.set(sheetRef, sheetRecord);
    batch.set(assignmentRef, {
      labId: labId,
      midwifeId: null,
      priceSheetId: sheetId,
      updatedAt: serverTimestamp(context),
      updatedBy: context.user.uid
    });
    return batch.commit().then(function () { return sheetId; });
  }

  function getServiceCatalog() {
    var context = firebaseContext();
    return context.db.collection(COLLECTIONS.CATALOG).orderBy('serviceName').get().then(function (snapshot) {
      return snapshot.docs.map(function (doc) { return Object.assign({ id: doc.id }, doc.data()); });
    });
  }

  function savePriceOverride(input) {
    var data = requireObject(input, 'Price override');
    var context = firebaseContext();
    var labId = requireString(data.labId || data.laboratoryId, 'Lab ID', 128);
    var serviceId = requireString(data.serviceId, 'Service ID', 64);
    var shares = validateCostShares(
      requireInteger(data.subsidizedCostMinor, 'Total cost', 0),
      requireInteger(data.clientCostShareMinor, 'Discount price', 0),
      requireInteger(data.projectCostShareMinor, 'Project cost share', 0)
    );
    var overrideId = labId + '__' + serviceId;
    return context.db.collection(COLLECTIONS.OVERRIDES).doc(overrideId).set({
      labId: labId,
      serviceId: serviceId,
      subsidizedCostMinor: shares.subsidized,
      clientCostShareMinor: shares.client,
      projectCostShareMinor: shares.project,
      active: data.active !== false,
      note: typeof data.note === 'string' ? data.note.trim().slice(0, 240) : '',
      updatedAt: serverTimestamp(context),
      updatedBy: context.user.uid
    }, { merge: true }).then(function () { return overrideId; });
  }

  function getPriceOverrides() {
    var context = firebaseContext();
    return context.db.collection(COLLECTIONS.OVERRIDES).get().then(function (snapshot) {
      return snapshot.docs.map(function (doc) { return Object.assign({ id: doc.id }, doc.data()); });
    });
  }

  function publishCurrentPriceSheet(labId) {
    var context = firebaseContext();
    var catalogPromise = context.db.collection(COLLECTIONS.CATALOG).where('active', '==', true).get();
    var overridePromise = labId ?
      context.db.collection(COLLECTIONS.OVERRIDES).where('labId', '==', labId).get() :
      Promise.resolve({ docs: [] });
    var configPromise = labId ?
      context.db.collection(COLLECTIONS.LAB_CONFIGS).doc(labId).get() :
      Promise.resolve({ exists: false, data: function () { return null; } });
    return Promise.all([catalogPromise, overridePromise, configPromise, getProgramSettings()]).then(function (snapshots) {
      var config = snapshots[2].exists ? snapshots[2].data() : null;
      var ceilingMinor = resolveProjectCeilingMinor(null, snapshots[3]);
      if (config && Array.isArray(config.tests) && config.tests.length) {
        var percents = pricingApi().normalizePercentPair(
          config.projectPercent == null ? 90 : config.projectPercent,
          config.clientPercent == null ? 10 : config.clientPercent
        );
        var services = config.tests.filter(function (test) { return test.active !== false; }).map(function (test) {
          var catalog = {};
          snapshots[0].docs.forEach(function (doc) {
            if (doc.id === test.serviceId) catalog = doc.data() || {};
          });
          var computed = pricingApi().computeInvoiceShares(
            test.regularPriceMinor,
            test.labCostShareMinor,
            percents.clientPercent,
            percents.projectPercent
          );
          return {
            serviceId: test.serviceId,
            serviceCode: catalog.serviceCode || String(test.serviceCode || test.serviceId).toUpperCase(),
            serviceName: catalog.serviceName || test.serviceName || test.serviceId,
            regularPriceMinor: computed.regularPriceMinor,
            labCostShareMinor: computed.labCostShareMinor,
            subsidizedCostMinor: computed.subsidizedCostMinor,
            clientCostShareMinor: computed.clientCopayMinor,
            projectCostShareMinor: computed.projectContributionMinor
          };
        });
        return publishPriceSheet({
          labId: labId || null,
          currency: 'MMK',
          services: services,
          clientPercent: percents.clientPercent,
          projectPercent: percents.projectPercent,
          projectCeilingMinor: ceilingMinor
        });
      }
      var overrideByService = {};
      snapshots[1].docs.forEach(function (doc) {
        var row = doc.data();
        if (row.active !== false) overrideByService[row.serviceId] = row;
      });
      var fallbackServices = snapshots[0].docs.map(function (doc) {
        var catalog = doc.data();
        var override = overrideByService[doc.id] || {};
        return {
          serviceId: doc.id,
          serviceCode: catalog.serviceCode,
          serviceName: catalog.serviceName,
          subsidizedCostMinor: override.subsidizedCostMinor == null ?
            catalog.defaultSubsidizedCostMinor : override.subsidizedCostMinor,
          clientCostShareMinor: override.clientCostShareMinor == null ?
            catalog.defaultClientCostShareMinor : override.clientCostShareMinor,
          projectCostShareMinor: override.projectCostShareMinor == null ?
            catalog.defaultProjectCostShareMinor : override.projectCostShareMinor
        };
      });
      return publishPriceSheet({
        labId: labId || null,
        currency: 'MMK',
        services: fallbackServices,
        projectCeilingMinor: ceilingMinor
      });
    });
  }

  function getAssignedPriceSheet(labId) {
    var context = firebaseContext();
    var requestedLabId = labId || null;
    var specificRef = requestedLabId ?
      context.db.collection(COLLECTIONS.PRICE_ASSIGNMENTS).doc(requestedLabId).get() :
      Promise.resolve({ exists: false, data: function () { return null; } });
    var globalRef = context.db.collection(COLLECTIONS.PRICE_ASSIGNMENTS).doc('global').get();
    return Promise.all([specificRef, globalRef]).then(function (snapshots) {
      var assignment = snapshots[0].exists ? snapshots[0].data() :
        (snapshots[1].exists ? snapshots[1].data() : null);
      if (!assignment || !assignment.priceSheetId) throw new Error('No published price sheet is assigned.');
      return context.db.collection(COLLECTIONS.PRICE_SHEETS).doc(assignment.priceSheetId).get();
    }).then(function (snapshot) {
      if (!snapshot.exists || snapshot.data().status !== 'published') {
        throw new Error('The assigned price sheet is unavailable.');
      }
      return Object.assign({ id: snapshot.id }, snapshot.data());
    });
  }

  function isLabProfile(profile) {
    var role = String((profile && profile.role) || '').trim().toLowerCase();
    return role === 'lab' || role === 'laboratory';
  }

  function listUsersByRoles(roles) {
    var context = firebaseContext();
    return Promise.all((roles || []).map(function (role) {
      return context.db.collection('users').where('role', '==', role).get();
    })).then(function (snapshots) {
      var seen = {};
      var rows = [];
      snapshots.forEach(function (snapshot) {
        snapshot.docs.forEach(function (doc) {
          if (seen[doc.id]) return;
          seen[doc.id] = true;
          rows.push(Object.assign({ id: doc.id }, doc.data()));
        });
      });
      return rows;
    });
  }

  function getProgramSettings() {
    var context = firebaseContext();
    return context.db.collection(COLLECTIONS.PROGRAM_SETTINGS).doc('global').get().then(function (snapshot) {
      if (!snapshot.exists) {
        return { projectCeilingMinor: 0 };
      }
      var data = snapshot.data() || {};
      return {
        projectCeilingMinor: Number(data.projectCeilingMinor) || 0,
        updatedAt: data.updatedAt || null,
        updatedBy: data.updatedBy || null
      };
    });
  }

  function saveProgramSettings(input) {
    var data = requireObject(input, 'Program settings');
    var context = firebaseContext();
    var ceilingMinor = requireInteger(
      data.projectCeilingMinor == null ? 0 : data.projectCeilingMinor,
      'Project ceiling',
      0
    );
    return context.db.collection(COLLECTIONS.PROGRAM_SETTINGS).doc('global').set({
      projectCeilingMinor: ceilingMinor,
      updatedAt: serverTimestamp(context),
      updatedBy: context.user.uid
    }, { merge: true }).then(function () {
      return { projectCeilingMinor: ceilingMinor };
    });
  }

  function resolveProjectCeilingMinor(sheet, settings) {
    if (sheet && sheet.projectCeilingMinor != null && Number.isFinite(Number(sheet.projectCeilingMinor))) {
      return Math.max(0, Math.round(Number(sheet.projectCeilingMinor)));
    }
    if (settings && settings.projectCeilingMinor != null) {
      return Math.max(0, Math.round(Number(settings.projectCeilingMinor)));
    }
    return 0;
  }

  function withProjectCeiling(lineItems, ceilingMinor) {
    return pricingApi().applyProjectCeiling(lineItems, ceilingMinor);
  }

  function listLabs() {
    var context = firebaseContext();
    return context.db.collection(COLLECTIONS.LAB_CONFIGS).get().then(function (snapshot) {
      return snapshot.docs.map(function (doc) {
        var row = doc.data() || {};
        return {
          id: doc.id,
          name: row.labName || 'Lab',
          address: row.address || ''
        };
      });
    });
  }

  function catalogFromSheet(sheet) {
    var percents = {
      clientPercent: sheet.clientPercent,
      projectPercent: sheet.projectPercent
    };
    var ceilingMinor = resolveProjectCeilingMinor(sheet, null);
    return {
      priceSheetId: sheet.id,
      labId: sheet.labId || null,
      clientPercent: sheet.clientPercent,
      projectPercent: sheet.projectPercent,
      projectCeilingMinor: ceilingMinor,
      tests: (sheet.services || []).map(function (service) {
        var item = pricingApi().lineItemFromSheetService(service, percents);
        return {
          id: item.serviceId,
          name: item.serviceName,
          serviceCode: item.serviceCode,
          regularPrice: item.regularPriceMinor / 100,
          labCostShare: item.labCostShareMinor / 100,
          subsidizedCost: item.subsidizedCostMinor / 100,
          clientCostShare: item.clientCopayMinor / 100,
          projectCostShare: item.projectContributionMinor / 100,
          regularPriceMinor: item.regularPriceMinor,
          labCostShareMinor: item.labCostShareMinor,
          clientCopayMinor: item.clientCopayMinor,
          projectContributionMinor: item.projectContributionMinor
        };
      })
    };
  }

  function getTestCatalog(labId) {
    var context = firebaseContext();
    var selectedLabId = requireString(labId, 'Lab ID', 128);
    return context.db.collection(COLLECTIONS.ACCOUNT_QUOTAS).doc(context.user.uid).get().then(function (quotaSnapshot) {
      if (!quotaSnapshot.exists || quotaSnapshot.data().status !== 'active') {
        throw new Error('No voucher allocation is available for this account.');
      }
      return Promise.all([
        getAssignedPriceSheet(selectedLabId),
        getProgramSettings()
      ]);
    }).then(function (results) {
      var sheet = results[0];
      var settings = results[1];
      if (sheet && (sheet.projectCeilingMinor == null || sheet.projectCeilingMinor === 0) && settings.projectCeilingMinor) {
        sheet = Object.assign({}, sheet, { projectCeilingMinor: settings.projectCeilingMinor });
      } else if (sheet && settings.projectCeilingMinor) {
        // Prefer live program ceiling so Configure Lab changes apply immediately.
        sheet = Object.assign({}, sheet, { projectCeilingMinor: settings.projectCeilingMinor });
      }
      return catalogFromSheet(sheet);
    });
  }

  function allocateVouchers(input) {
    var data = requireObject(input, 'Voucher allocation');
    var context = firebaseContext();
    var midwifeId = requireString(data.midwifeId || data.maternityHomeId, 'Midwife ID', 128);
    var units = requireInteger(data.allocatedUnits || data.voucherCount, 'Voucher count', 1);
    var budgetMinor = requireInteger(data.totalMinor, 'Budget total', 0);
    var quotaRef = context.db.collection(COLLECTIONS.ACCOUNT_QUOTAS).doc(midwifeId);
    var budgetRef = context.db.collection(COLLECTIONS.ACCOUNT_BUDGETS).doc(midwifeId);
    var globalAssignmentRef = context.db.collection(COLLECTIONS.PRICE_ASSIGNMENTS).doc('global');
    return context.db.runTransaction(function (transaction) {
      return Promise.all([
        transaction.get(quotaRef),
        transaction.get(globalAssignmentRef)
      ]).then(function (snapshots) {
        var existing = snapshots[0].exists ? snapshots[0].data() : null;
        var assignment = snapshots[1].exists ? snapshots[1].data() : null;
        var priceSheetId = (assignment && assignment.priceSheetId) || (existing && existing.priceSheetId) || '';
        if (!priceSheetId) {
          throw new Error('Configure at least one laboratory before allocating vouchers.');
        }
        var allocatedUnits = (existing ? existing.allocatedUnits : 0) + units;
        var remainingUnits = (existing ? existing.remainingUnits : 0) + units;
        var now = serverTimestamp(context);
        transaction.set(quotaRef, {
          midwifeId: midwifeId,
          allocatedUnits: allocatedUnits,
          remainingUnits: remainingUnits,
          priceSheetId: priceSheetId,
          status: 'active',
          lastVoucherId: existing ? (existing.lastVoucherId || '') : '',
          updatedAt: now,
          updatedBy: context.user.uid
        });
        transaction.set(budgetRef, {
          midwifeId: midwifeId,
          totalMinor: budgetMinor,
          currency: validateCurrency(data.currency || 'MMK'),
          note: typeof data.note === 'string' ? data.note.trim().slice(0, 500) : '',
          updatedAt: now,
          updatedBy: context.user.uid
        }, { merge: true });
        return midwifeId;
      });
    });
  }

  function getAllocations() {
    var context = firebaseContext();
    return Promise.all([
      context.db.collection(COLLECTIONS.ACCOUNT_QUOTAS).get(),
      context.db.collection(COLLECTIONS.ACCOUNT_BUDGETS).get()
    ]).then(function (snapshots) {
      var budgets = {};
      snapshots[1].docs.forEach(function (doc) { budgets[doc.id] = doc.data(); });
      var rows = snapshots[0].docs.map(function (doc) {
        return Object.assign({ id: doc.id, budget: budgets[doc.id] || null }, doc.data());
      });
      return Promise.all(rows.map(function (row) {
        return summarizeMidwifeRedemptions(row.midwifeId || row.id).then(function (usage) {
          var budgetTotal = Number((row.budget && row.budget.totalMinor) || 0);
          return Object.assign({}, row, {
            redeemedCount: usage.redeemedCount,
            redeemedProjectMinor: usage.redeemedProjectMinor,
            remainingBudgetMinor: Math.max(0, budgetTotal - usage.redeemedProjectMinor)
          });
        });
      }));
    });
  }

  function summarizeMidwifeRedemptions(midwifeId) {
    var context = firebaseContext();
    var id = requireString(midwifeId, 'Midwife ID', 128);
    var statuses = ['redeemed', 'verified', 'paid'];
    return Promise.all(statuses.map(function (status) {
      return context.db.collection(COLLECTIONS.VOUCHERS)
        .where('midwifeId', '==', id)
        .where('status', '==', status)
        .get();
    })).then(function (snapshots) {
      var redeemedCount = 0;
      var redeemedProjectMinor = 0;
      snapshots.forEach(function (snapshot) {
        snapshot.docs.forEach(function (doc) {
          var row = doc.data() || {};
          redeemedCount += 1;
          redeemedProjectMinor += Number((row.totals && row.totals.projectContributionMinor) || 0);
        });
      });
      return { redeemedCount: redeemedCount, redeemedProjectMinor: redeemedProjectMinor };
    });
  }

  function getMidwifeBudgetSummary(midwifeId) {
    var context = firebaseContext();
    var id = midwifeId || context.user.uid;
    return Promise.all([
      context.db.collection(COLLECTIONS.ACCOUNT_QUOTAS).doc(id).get(),
      context.db.collection(COLLECTIONS.ACCOUNT_BUDGETS).doc(id).get(),
      summarizeMidwifeRedemptions(id)
    ]).then(function (results) {
      var quota = results[0].exists ? Object.assign({ id: results[0].id }, results[0].data()) : null;
      var budget = results[1].exists ? results[1].data() : null;
      var usage = results[2];
      var totalMinor = Number((budget && budget.totalMinor) || 0);
      return {
        quota: quota,
        budgetTotalMinor: totalMinor,
        redeemedCount: usage.redeemedCount,
        redeemedProjectMinor: usage.redeemedProjectMinor,
        remainingBudgetMinor: Math.max(0, totalMinor - usage.redeemedProjectMinor),
        currency: (budget && budget.currency) || 'MMK'
      };
    });
  }

  function updateAllocation(input) {
    var data = requireObject(input, 'Allocation update');
    var context = firebaseContext();
    var midwifeId = requireString(data.midwifeId || data.maternityHomeId, 'Midwife ID', 128);
    var allocatedUnits = requireInteger(data.allocatedUnits, 'Allocated units', 0);
    var remainingUnits = data.remainingUnits == null ? allocatedUnits :
      requireInteger(data.remainingUnits, 'Remaining units', 0);
    if (remainingUnits > allocatedUnits) {
      throw new Error('Remaining vouchers cannot exceed allocated vouchers.');
    }
    var budgetMinor = requireInteger(data.totalMinor, 'Budget total', 0);
    var quotaRef = context.db.collection(COLLECTIONS.ACCOUNT_QUOTAS).doc(midwifeId);
    var budgetRef = context.db.collection(COLLECTIONS.ACCOUNT_BUDGETS).doc(midwifeId);
    var globalAssignmentRef = context.db.collection(COLLECTIONS.PRICE_ASSIGNMENTS).doc('global');
    return context.db.runTransaction(function (transaction) {
      return Promise.all([
        transaction.get(quotaRef),
        transaction.get(globalAssignmentRef)
      ]).then(function (snapshots) {
        if (!snapshots[0].exists) throw new Error('Allocation was not found.');
        var existing = snapshots[0].data();
        var assignment = snapshots[1].exists ? snapshots[1].data() : null;
        var priceSheetId = existing.priceSheetId || (assignment && assignment.priceSheetId) || '';
        if (!priceSheetId) throw new Error('Configure at least one laboratory before editing allocations.');
        var now = serverTimestamp(context);
        transaction.set(quotaRef, {
          midwifeId: midwifeId,
          allocatedUnits: allocatedUnits,
          remainingUnits: remainingUnits,
          priceSheetId: priceSheetId,
          status: 'active',
          lastVoucherId: existing.lastVoucherId || '',
          updatedAt: now,
          updatedBy: context.user.uid
        });
        transaction.set(budgetRef, {
          midwifeId: midwifeId,
          totalMinor: budgetMinor,
          currency: validateCurrency(data.currency || 'MMK'),
          note: typeof data.note === 'string' ? data.note.trim().slice(0, 500) : '',
          updatedAt: now,
          updatedBy: context.user.uid
        }, { merge: true });
        return midwifeId;
      });
    });
  }

  function resetAllocation(midwifeId) {
    var context = firebaseContext();
    var id = requireString(midwifeId, 'Midwife ID', 128);
    var quotaRef = context.db.collection(COLLECTIONS.ACCOUNT_QUOTAS).doc(id);
    var budgetRef = context.db.collection(COLLECTIONS.ACCOUNT_BUDGETS).doc(id);
    return Promise.all([quotaRef.get(), budgetRef.get()]).then(function (snapshots) {
      if (!snapshots[0].exists) throw new Error('Allocation was not found.');
      var existing = snapshots[0].data();
      var budget = snapshots[1].exists ? snapshots[1].data() : {};
      return updateAllocation({
        midwifeId: id,
        allocatedUnits: existing.allocatedUnits || 0,
        remainingUnits: existing.allocatedUnits || 0,
        totalMinor: Number(budget.totalMinor) || 0,
        currency: budget.currency || 'MMK',
        note: typeof budget.note === 'string' ? budget.note : ''
      });
    });
  }

  function emptyMidwifeMap() {
    return {};
  }

  function writePeriodStats(transaction, context, snapshot, ref, identity, fromStatus, toStatus, projectMinor) {
    if (!identity || !identity.scope || !identity.period) return;
    if (identity.scope === 'lab' && !identity.labId) return;
    if (identity.scope === 'midwife' && !identity.midwifeId) return;
    var current = snapshot.exists ? snapshot.data() : {
      counts: pricingApi().emptyCounts(),
      projectRedeemedMinor: 0,
      projectVerifiedMinor: 0,
      projectPaidMinor: 0,
      midwives: emptyMidwifeMap()
    };
    var next = pricingApi().applyStatusDelta(current, fromStatus, toStatus, projectMinor);
    var midwives = Object.assign({}, current.midwives || {});
    if (identity.scope === 'lab' && identity.midwifeId) {
      midwives[identity.midwifeId] = pricingApi().applyStatusDelta(
        midwives[identity.midwifeId] || {
          counts: pricingApi().emptyCounts(),
          projectRedeemedMinor: 0,
          projectVerifiedMinor: 0,
          projectPaidMinor: 0
        },
        fromStatus,
        toStatus,
        projectMinor
      );
    }
    transaction.set(ref, {
      scope: identity.scope,
      period: identity.period,
      labId: identity.scope === 'lab' ? String(identity.labId) : '',
      midwifeId: identity.scope === 'midwife' ? String(identity.midwifeId) : '',
      lastVoucherId: identity.voucherId || '',
      lastStatus: toStatus || '',
      counts: next.counts,
      projectRedeemedMinor: next.projectRedeemedMinor,
      projectVerifiedMinor: next.projectVerifiedMinor,
      projectPaidMinor: next.projectPaidMinor,
      midwives: midwives,
      updatedAt: serverTimestamp(context),
      updatedBy: context.user.uid
    }, { merge: true });
  }

  function projectAmountFromVoucher(voucher, sheet) {
    if (sheet && Array.isArray(voucher.selectedServiceIds) && voucher.selectedServiceIds.length) {
      return pricingApi().sumLineItems(lineItemsFromSelection(sheet, voucher.selectedServiceIds)).projectContributionMinor;
    }
    if (voucher.totals && Number.isSafeInteger(voucher.totals.projectContributionMinor)) {
      return voucher.totals.projectContributionMinor;
    }
    return 0;
  }

  function hydrateVoucherTests(voucher, sheet) {
    var percents = sheet ? { clientPercent: sheet.clientPercent, projectPercent: sheet.projectPercent } : null;
    var ceilingMinor = resolveProjectCeilingMinor(sheet, null);
    if (sheet && Array.isArray(voucher.selectedServiceIds) && voucher.selectedServiceIds.length) {
      var capped = withProjectCeiling(lineItemsFromSelection(sheet, voucher.selectedServiceIds), ceilingMinor);
      var lineItems = capped.lineItems;
      voucher.lineItems = lineItems;
      voucher.totals = capped.totals;
      voucher.projectCeilingMinor = ceilingMinor;
      voucher.ceilingAppliedMinor = capped.ceilingAppliedMinor;
      voucher.tests = lineItems.map(function (item) {
        return {
          id: item.serviceId,
          name: item.serviceName,
          regularPrice: pricingApi().minorToMajor(item.regularPriceMinor),
          labCostShare: pricingApi().minorToMajor(item.labCostShareMinor),
          subsidizedCost: pricingApi().minorToMajor(item.subsidizedCostMinor),
          clientCostShare: pricingApi().minorToMajor(item.clientCopayMinor),
          projectCostShare: pricingApi().minorToMajor(item.projectContributionMinor)
        };
      });
      return voucher;
    }
    if (Array.isArray(voucher.lineItems) && voucher.lineItems.length) {
      var derivedItems = voucher.lineItems.map(function (item) {
        return pricingApi().lineItemFromSheetService(item, percents);
      });
      var stored = withProjectCeiling(derivedItems, ceilingMinor);
      voucher.lineItems = stored.lineItems;
      voucher.totals = stored.totals;
      voucher.tests = stored.lineItems.map(function (derived) {
        return {
          id: derived.serviceId,
          name: derived.serviceName,
          regularPrice: pricingApi().minorToMajor(derived.regularPriceMinor),
          labCostShare: pricingApi().minorToMajor(derived.labCostShareMinor),
          subsidizedCost: pricingApi().minorToMajor(derived.subsidizedCostMinor),
          clientCostShare: pricingApi().minorToMajor(derived.clientCopayMinor),
          projectCostShare: pricingApi().minorToMajor(derived.projectContributionMinor)
        };
      });
    }
    return voucher;
  }

  function issueMultiServiceVoucher(input, attempt) {
    var data = requireObject(input, 'Voucher');
    var context = firebaseContext();
    var patientId = requireString(data.patientId, 'Patient ID', 160);
    var labId = requireString(data.labId, 'Lab ID', 128);
    var selectedServiceIds = Array.from(new Set(data.selectedServiceIds || []));
    if (!selectedServiceIds.length || selectedServiceIds.length > 30) {
      throw new Error('Select between 1 and 30 services.');
    }
    selectedServiceIds.forEach(function (id) { requireString(id, 'Service ID', 64); });
    var voucherId = generateVoucherCode();
    var voucherRef = context.db.collection(COLLECTIONS.VOUCHERS).doc(voucherId);
    var quotaRef = context.db.collection(COLLECTIONS.ACCOUNT_QUOTAS).doc(context.user.uid);
    var patientRef = context.db.collection('patients').doc(patientId);
    var labRef = context.db.collection('users').doc(labId);
    var labAssignmentRef = context.db.collection(COLLECTIONS.PRICE_ASSIGNMENTS).doc(labId);
    var globalAssignmentRef = context.db.collection(COLLECTIONS.PRICE_ASSIGNMENTS).doc('global');
    var settingsRef = context.db.collection(COLLECTIONS.PROGRAM_SETTINGS).doc('global');

    return context.db.runTransaction(function (transaction) {
      return Promise.all([
        transaction.get(quotaRef),
        transaction.get(patientRef),
        transaction.get(labRef),
        transaction.get(labAssignmentRef),
        transaction.get(globalAssignmentRef),
        transaction.get(voucherRef),
        transaction.get(settingsRef)
      ]).then(function (snapshots) {
        if (snapshots[5].exists) throw new Error('Voucher code collision.');
        var quotaSnapshot = snapshots[0];
        var patientSnapshot = snapshots[1];
        var labSnapshot = snapshots[2];
        var programSettings = snapshots[6].exists ? snapshots[6].data() : { projectCeilingMinor: 0 };
        if (!quotaSnapshot.exists || !patientSnapshot.exists) throw new Error('Quota or patient was not found.');
        if (!labSnapshot.exists || !isLabProfile(labSnapshot.data())) {
          throw new Error('Select an active laboratory.');
        }
        var quota = quotaSnapshot.data();
        var patient = patientSnapshot.data();
        var lab = labSnapshot.data();
        if (quota.midwifeId !== context.user.uid || quota.status !== 'active' || quota.remainingUnits < 1) {
          throw new Error('No active voucher quota is available.');
        }
        var assignment = snapshots[3].exists ? snapshots[3].data() :
          (snapshots[4].exists ? snapshots[4].data() : null);
        if (!assignment || !assignment.priceSheetId) {
          throw new Error('No published price sheet is available for this laboratory.');
        }
        var sheetRef = context.db.collection(COLLECTIONS.PRICE_SHEETS).doc(assignment.priceSheetId);
        return transaction.get(sheetRef).then(function (sheetSnapshot) {
          if (!sheetSnapshot.exists || sheetSnapshot.data().status !== 'published') {
            throw new Error('The assigned price sheet is unavailable.');
          }
          var sheet = sheetSnapshot.data();
          selectedServiceIds.forEach(function (serviceId) {
            if (sheet.serviceIds.indexOf(serviceId) === -1) throw new Error('A selected service is not on the assigned price sheet.');
          });
          var percents = { clientPercent: sheet.clientPercent, projectPercent: sheet.projectPercent };
          var rawLineItems = selectedServiceIds.map(function (serviceId) {
            var service = (sheet.services || []).find(function (row) { return row.serviceId === serviceId; });
            if (!service) throw new Error('A selected service is not on the assigned price sheet.');
            return pricingApi().lineItemFromSheetService(service, percents);
          });
          var ceilingMinor = resolveProjectCeilingMinor(sheet, programSettings);
          var capped = withProjectCeiling(rawLineItems, ceilingMinor);
          var lineItems = capped.lineItems;
          var totals = capped.totals;
          var period = pricingApi().calendarPeriod(new Date());
          var globalStatsRef = context.db.collection(COLLECTIONS.PERIOD_STATS).doc(
            pricingApi().periodStatsId('global', null, period)
          );
          var labStatsRef = context.db.collection(COLLECTIONS.PERIOD_STATS).doc(
            pricingApi().periodStatsId('lab', labId, period)
          );
          var midwifeStatsRef = context.db.collection(COLLECTIONS.PERIOD_STATS).doc(
            pricingApi().periodStatsId('midwife', context.user.uid, period)
          );
          return Promise.all([
            transaction.get(globalStatsRef),
            transaction.get(labStatsRef),
            transaction.get(midwifeStatsRef)
          ]).then(function (statSnapshots) {
            var now = serverTimestamp(context);
            var labName = lab.displayName || lab.name || lab.labName || lab.organization_name || lab.email || 'Lab';
            var address = typeof data.address === 'string' ? data.address.trim().slice(0, 240) :
              (typeof patient.patient_address === 'string' ? patient.patient_address.slice(0, 240) :
                (typeof patient.patientAddress === 'string' ? patient.patientAddress.slice(0, 240) : ''));
            transaction.update(quotaRef, {
              remainingUnits: quota.remainingUnits - 1,
              lastVoucherId: voucherId,
              updatedAt: now,
              updatedBy: context.user.uid
            });
            transaction.set(voucherRef, {
              code: voucherId,
              status: 'issued',
              patientId: patientId,
              patientNameSnapshot: requireString(patient.name || patient.patient_name, 'Patient name', 160),
              patientAgeSnapshot: patient.age == null ? null : Number(patient.age),
              patientPhoneSnapshot: typeof patient.phone === 'string' ? patient.phone.slice(0, 40) : '',
              patientNrcSnapshot: typeof data.nrc === 'string' ? data.nrc.trim().slice(0, 80) :
                (typeof patient.nrc === 'string' ? patient.nrc.slice(0, 80) : ''),
              patientAddressSnapshot: address,
              ancVisitDate: requireString(data.ancVisitDate, 'ANC visit date', 10),
              midwifeId: context.user.uid,
              issuerNameSnapshot: requireString(data.issuerName, 'Issuer name', 160),
              labId: labId,
              labNameSnapshot: String(labName).slice(0, 160),
              priceSheetId: assignment.priceSheetId,
              selectedServiceIds: selectedServiceIds,
              lineItems: lineItems,
              totals: totals,
              projectCeilingMinor: ceilingMinor,
              ceilingAppliedMinor: capped.ceilingAppliedMinor || 0,
              currencySnapshot: 'MMK',
              issuedAt: now,
              expiresAt: dateTimestamp(context, data.expiresAt || new Date(Date.now() + 90 * 86400000), 'Expiry')
            });
            writePeriodStats(transaction, context, statSnapshots[0], globalStatsRef, {
              scope: 'global', period: period, labId: '', midwifeId: '', voucherId: voucherId
            }, null, 'issued', totals.projectContributionMinor);
            writePeriodStats(transaction, context, statSnapshots[1], labStatsRef, {
              scope: 'lab', period: period, labId: labId, midwifeId: context.user.uid, voucherId: voucherId
            }, null, 'issued', totals.projectContributionMinor);
            writePeriodStats(transaction, context, statSnapshots[2], midwifeStatsRef, {
              scope: 'midwife', period: period, labId: labId, midwifeId: context.user.uid, voucherId: voucherId
            }, null, 'issued', totals.projectContributionMinor);
            return { id: voucherId, code: voucherId, qrPayload: buildQrPayload(voucherId), lineItems: lineItems, totals: totals };
          });
        });
      });
    }).catch(function (error) {
      if (String(error && error.message) === 'Voucher code collision' && (attempt || 0) < 5) {
        return issueMultiServiceVoucher(input, (attempt || 0) + 1);
      }
      throw error;
    });
  }

  function lookupVoucher(voucherCode) {
    var context = firebaseContext();
    var voucherId = validateVoucherCode(voucherCode, 'Voucher code');
    return context.db.collection(COLLECTIONS.VOUCHERS).doc(voucherId).get().then(function (voucherSnapshot) {
      if (!voucherSnapshot.exists) throw new Error('Voucher was not found.');
      var voucher = Object.assign({ id: voucherSnapshot.id }, voucherSnapshot.data());
      var sheetPromise = voucher.priceSheetId
        ? context.db.collection(COLLECTIONS.PRICE_SHEETS).doc(voucher.priceSheetId).get()
        : Promise.resolve({ exists: false, data: function () { return null; } });
      var assignedPromise = voucher.labId
        ? context.db.collection(COLLECTIONS.PRICE_ASSIGNMENTS).doc(voucher.labId).get()
          .then(function (assignmentSnap) {
            if (!assignmentSnap.exists || !assignmentSnap.data().priceSheetId) return null;
            return context.db.collection(COLLECTIONS.PRICE_SHEETS).doc(assignmentSnap.data().priceSheetId).get();
          })
          .catch(function () { return null; })
        : Promise.resolve(null);
      return Promise.all([sheetPromise, assignedPromise]).then(function (results) {
        var issuedSheet = results[0] && results[0].exists ? results[0].data() : null;
        var assignedSheet = results[1] && results[1].exists ? results[1].data() : null;
        var sheet = issuedSheet;
        var sheetLabTotal = function (candidate) {
          return ((candidate && candidate.services) || []).reduce(function (sum, row) {
            return sum + (Number(row.labCostShareMinor) || 0);
          }, 0);
        };
        if (voucher.status === 'issued' && assignedSheet) {
          sheet = assignedSheet;
        } else if (assignedSheet && sheetLabTotal(issuedSheet) === 0 && sheetLabTotal(assignedSheet) > 0) {
          // Older vouchers were issued before Lab Cost share was configured.
          // Use the current lab sheet so PO/Lab previews show the configured L values.
          sheet = assignedSheet;
        }
        hydrateVoucherTests(voucher, sheet);
        voucher.patientReference = voucher.patientId;
        voucher.generatedByName = voucher.issuerNameSnapshot;
        voucher.labName = voucher.labNameSnapshot || '';
        voucher.qrPayload = buildQrPayload(voucherId);
        return voucher;
      });
    });
  }

  function issueVoucher(input) {
    var data = requireObject(input, 'Voucher');
    var context = firebaseContext();
    var quotaId = validateOpaqueId(data.quotaId, 'Quota ID');
    var beneficiaryRef = validateOpaqueId(data.beneficiaryRef, 'Beneficiary reference');
    var voucherId = generateVoucherCode();
    var quotaRef = context.db.collection(COLLECTIONS.QUOTAS).doc(quotaId);
    var voucherRef = context.db.collection(COLLECTIONS.VOUCHERS).doc(voucherId);
    var expiresAt = dateTimestamp(context, data.expiresAt, 'Expiry');
    if (expiresAt.toMillis() <= Date.now()) {
      throw new Error('Expiry must be in the future.');
    }

    return context.db.runTransaction(function (transaction) {
      return transaction.get(quotaRef).then(function (quotaSnapshot) {
        if (!quotaSnapshot.exists) throw new Error('Quota was not found.');
        var quota = quotaSnapshot.data();
        if (quota.midwifeId !== context.user.uid || quota.status !== 'active' || quota.remainingUnits < 1) {
          throw new Error('No active quota is available.');
        }
        var now = serverTimestamp(context);
        transaction.update(quotaRef, {
          remainingUnits: quota.remainingUnits - 1,
          lastVoucherId: voucherId,
          updatedAt: now,
          updatedBy: context.user.uid
        });
        transaction.set(voucherRef, {
          code: voucherId,
          status: 'issued',
          quotaId: quotaId,
          budgetId: quota.budgetId,
          beneficiaryRef: beneficiaryRef,
          midwifeId: context.user.uid,
          issuedBy: context.user.uid,
          issuedAt: now,
          expiresAt: expiresAt,
          serviceId: quota.serviceId,
          pricingVersionIdSnapshot: quota.pricingVersionId,
          serviceCodeSnapshot: quota.serviceCodeSnapshot,
          serviceNameSnapshot: quota.serviceNameSnapshot,
          unitPriceMinorSnapshot: quota.unitPriceMinor,
          currencySnapshot: quota.currency,
          issuanceAudit: {
            action: 'issued',
            actorId: context.user.uid,
            at: now
          }
        });
        return {
          id: voucherId,
          code: voucherId,
          qrPayload: buildQrPayload(voucherId)
        };
      });
    });
  }

  function redeemVoucher(voucherCode, details) {
    var context = firebaseContext();
    var submission = details || {};
    var voucherId = validateVoucherCode(voucherCode, 'Voucher code');
    var voucherRef = context.db.collection(COLLECTIONS.VOUCHERS).doc(voucherId);
    return context.db.runTransaction(function (transaction) {
      return transaction.get(voucherRef).then(function (snapshot) {
        if (!snapshot.exists) throw new Error('Voucher was not found.');
        var voucher = snapshot.data();
        if (voucher.code !== voucherId || voucher.status !== 'issued') {
          throw new Error('Voucher is not active.');
        }
        if (voucher.labId && voucher.labId !== context.user.uid) {
          throw new Error('This voucher is assigned to another laboratory.');
        }
        if (voucher.expiresAt && voucher.expiresAt.toMillis() <= Date.now()) {
          throw new Error('Voucher has expired.');
        }
        var now = serverTimestamp(context);
        var cashierIndex = submission.cashierIndex == null ? 0 : requireInteger(submission.cashierIndex, 'Cashier', 0);
        if (cashierIndex > 2) throw new Error('Choose one of the three saved cashiers.');
        // Period scorecards follow the lab invoice / redeem date, not issue date.
        var period = pricingApi().calendarPeriod(new Date());
        var globalStatsRef = context.db.collection(COLLECTIONS.PERIOD_STATS).doc(
          pricingApi().periodStatsId('global', null, period)
        );
        var labStatsRef = context.db.collection(COLLECTIONS.PERIOD_STATS).doc(
          pricingApi().periodStatsId('lab', voucher.labId || context.user.uid, period)
        );
        var midwifeStatsRef = context.db.collection(COLLECTIONS.PERIOD_STATS).doc(
          pricingApi().periodStatsId('midwife', voucher.midwifeId, period)
        );
        var sheetRef = context.db.collection(COLLECTIONS.PRICE_SHEETS).doc(voucher.priceSheetId);
        return Promise.all([
          transaction.get(globalStatsRef),
          transaction.get(labStatsRef),
          transaction.get(midwifeStatsRef),
          voucher.priceSheetId ? transaction.get(sheetRef) : Promise.resolve({ exists: false, data: function () { return null; } })
        ]).then(function (statSnapshots) {
          var updates = {
            status: 'redeemed',
            redeemedAt: now,
            redeemedBy: context.user.uid,
            labDisplayNameSnapshot: typeof submission.labDisplayName === 'string' ?
              submission.labDisplayName.trim().slice(0, 160) : '',
            submissionReference: typeof submission.submissionReference === 'string' ?
              submission.submissionReference.trim().slice(0, 120) : '',
            cashierIndex: cashierIndex,
            cashierNameSnapshot: typeof submission.cashierName === 'string' ?
              submission.cashierName.trim().slice(0, 120) : '',
            labSealAttached: submission.labSealAttached === true,
            clientSigned: submission.clientSigned !== false,
            redemptionAudit: {
              action: 'redeemed',
              actorId: context.user.uid,
              at: now
            }
          };
          transaction.update(voucherRef, updates);
          var projectMinor = projectAmountFromVoucher(voucher, statSnapshots[3] && statSnapshots[3].exists ? statSnapshots[3].data() : null);
          writePeriodStats(transaction, context, statSnapshots[0], globalStatsRef, {
            scope: 'global', period: period, labId: '', midwifeId: '', voucherId: voucherId
          }, 'issued', 'redeemed', projectMinor);
          writePeriodStats(transaction, context, statSnapshots[1], labStatsRef, {
            scope: 'lab', period: period, labId: voucher.labId || context.user.uid, midwifeId: voucher.midwifeId || '', voucherId: voucherId
          }, 'issued', 'redeemed', projectMinor);
          if (voucher.midwifeId) {
            writePeriodStats(transaction, context, statSnapshots[2], midwifeStatsRef, {
              scope: 'midwife', period: period, labId: '', midwifeId: voucher.midwifeId, voucherId: voucherId
            }, 'issued', 'redeemed', projectMinor);
          }
          return voucherId;
        });
      });
    }).then(function () { return lookupVoucher(voucherId); });
  }

  function getAccountQuota(midwifeId) {
    var context = firebaseContext();
    var uid = midwifeId || context.user.uid;
    return context.db.collection(COLLECTIONS.ACCOUNT_QUOTAS).doc(uid).get().then(function (snapshot) {
      if (!snapshot.exists) return null;
      return Object.assign({ id: snapshot.id }, snapshot.data());
    });
  }

  function listProviderProfiles() {
    return listUsersByRoles(['Lab', 'laboratory', 'Midwife', 'midwife']);
  }

  function saveLabConfig(input) {
    var data = requireObject(input, 'Lab config');
    var context = firebaseContext();
    var labId = requireString(data.labId, 'Lab ID', 128);
    var percents = pricingApi().normalizePercentPair(
      data.projectPercent == null ? 90 : data.projectPercent,
      data.clientPercent == null ? 10 : data.clientPercent
    );
    var ceilingMinor = data.projectCeilingMinor == null
      ? null
      : requireInteger(data.projectCeilingMinor, 'Project ceiling', 0);
    var tests = (data.tests || []).map(function (test) {
      var row = requireObject(test, 'Lab test');
      var computed = pricingApi().computeInvoiceShares(
        requireInteger(row.regularPriceMinor, 'Regular price', 0),
        requireInteger(row.labCostShareMinor, 'Lab cost share', 0),
        percents.clientPercent,
        percents.projectPercent
      );
      return {
        serviceId: requireString(row.serviceId, 'Service ID', 64),
        serviceCode: row.serviceCode ? validateServiceCode(row.serviceCode) : requireString(row.serviceId, 'Service ID', 64).toUpperCase(),
        serviceName: requireString(row.serviceName || row.serviceId, 'Service name', 120),
        regularPriceMinor: computed.regularPriceMinor,
        labCostShareMinor: computed.labCostShareMinor,
        active: row.active !== false
      };
    });
    if (!tests.length) throw new Error('Enable at least one laboratory test.');
    var now = serverTimestamp(context);
    var labRef = context.db.collection('users').doc(labId);
    var configRef = context.db.collection(COLLECTIONS.LAB_CONFIGS).doc(labId);
    var ceilingPromise = ceilingMinor == null
      ? Promise.resolve(null)
      : saveProgramSettings({ projectCeilingMinor: ceilingMinor });
    return ceilingPromise.then(function () {
      return labRef.get();
    }).then(function (labSnapshot) {
      if (!labSnapshot.exists || !isLabProfile(labSnapshot.data())) {
        throw new Error('Select an active laboratory account.');
      }
      var catalogWrites = pricingApi().STANDARD_LAB_TESTS.map(function (standard) {
        var catalogShares = pricingApi().computeInvoiceShares(
          standard.defaultRegularMinor, 0, percents.clientPercent, percents.projectPercent
        );
        return saveCatalogService({
          serviceId: standard.id,
          serviceCode: standard.code,
          serviceName: standard.name,
          description: '',
          defaultUnitPriceMinor: standard.defaultRegularMinor,
          defaultSubsidizedCostMinor: catalogShares.subsidizedCostMinor,
          defaultClientCostShareMinor: catalogShares.clientCopayMinor,
          defaultProjectCostShareMinor: catalogShares.projectContributionMinor,
          currency: 'MMK',
          active: true
        });
      });
      return Promise.all(catalogWrites).then(function () {
        return configRef.set({
          labId: labId,
          labName: requireString(data.labName, 'Lab name', 160),
          address: typeof data.address === 'string' ? data.address.trim().slice(0, 240) : '',
          projectPercent: percents.projectPercent,
          clientPercent: percents.clientPercent,
          tests: tests,
          updatedAt: now,
          updatedBy: context.user.uid
        });
      }).then(function () {
        var nextLabName = requireString(data.labName, 'Lab name', 160);
        var nextAddress = typeof data.address === 'string' ? data.address.trim().slice(0, 240) : '';
        return labRef.update({
          displayName: nextLabName,
          name: nextLabName,
          labName: nextLabName,
          organization_name: nextLabName,
          address: nextAddress,
          organization_address: nextAddress,
          updatedAt: now,
          updatedBy: context.user.uid
        });
      }).then(function () {
        return publishCurrentPriceSheet(labId);
      }).then(function (sheetId) {
        return context.db.collection(COLLECTIONS.PRICE_ASSIGNMENTS).doc('global').get().then(function (globalSnap) {
          if (globalSnap.exists) return sheetId;
          return publishCurrentPriceSheet(null).then(function () { return sheetId; });
        });
      });
    });
  }

  function getLabConfig(labId) {
    var context = firebaseContext();
    var id = requireString(labId, 'Lab ID', 128);
    return Promise.all([
      context.db.collection(COLLECTIONS.LAB_CONFIGS).doc(id).get(),
      context.db.collection('users').doc(id).get()
    ]).then(function (snapshots) {
      var config = snapshots[0].exists ? Object.assign({ id: snapshots[0].id }, snapshots[0].data()) : null;
      var profile = snapshots[1].exists ? Object.assign({ id: snapshots[1].id }, snapshots[1].data()) : null;
      return { config: config, profile: profile };
    });
  }

  function lineItemsFromSelection(sheet, selectedServiceIds) {
    var percents = { clientPercent: sheet.clientPercent, projectPercent: sheet.projectPercent };
    var priceMap = sheet.pricesByServiceId || {};
    return selectedServiceIds.map(function (serviceId) {
      var service = (sheet.services || []).find(function (row) { return row.serviceId === serviceId; });
      var mapped = priceMap[serviceId] || {};
      if (!service && !mapped.regularPriceMinor && mapped.regularPriceMinor !== 0) {
        throw new Error('A selected service is not on the assigned price sheet.');
      }
      return pricingApi().lineItemFromSheetService(Object.assign({}, mapped, service || { serviceId: serviceId }), percents);
    });
  }

  function updateIssuedLineItems(voucherCode, selectedServiceIds) {
    var context = firebaseContext();
    var voucherId = validateVoucherCode(voucherCode, 'Voucher code');
    var ids = Array.from(new Set(selectedServiceIds || []));
    if (!ids.length || ids.length > 16) throw new Error('Select between 1 and 16 services.');
    var voucherRef = context.db.collection(COLLECTIONS.VOUCHERS).doc(voucherId);
    return context.db.runTransaction(function (transaction) {
      return transaction.get(voucherRef).then(function (snapshot) {
        if (!snapshot.exists) throw new Error('Voucher was not found.');
        var voucher = snapshot.data();
        if (voucher.status !== 'issued') throw new Error('Only issued vouchers can be edited.');
        if (voucher.labId !== context.user.uid) throw new Error('This voucher is assigned to another laboratory.');
        return transaction.get(context.db.collection(COLLECTIONS.PRICE_SHEETS).doc(voucher.priceSheetId)).then(function (sheetSnapshot) {
          if (!sheetSnapshot.exists) throw new Error('The assigned price sheet is unavailable.');
          ids.forEach(function (serviceId) {
            if ((sheetSnapshot.data().serviceIds || []).indexOf(serviceId) === -1) {
              throw new Error('A selected service is not on the assigned price sheet.');
            }
          });
          transaction.update(voucherRef, {
            selectedServiceIds: ids
          });
          return voucherId;
        });
      });
    }).then(function () { return lookupVoucher(voucherId); });
  }

  function updateIssuedPatientDetails(voucherCode, input) {
    var data = requireObject(input, 'Patient details');
    var context = firebaseContext();
    var voucherId = validateVoucherCode(voucherCode, 'Voucher code');
    var voucherRef = context.db.collection(COLLECTIONS.VOUCHERS).doc(voucherId);
    var nrc = typeof data.nrc === 'string' ? data.nrc.trim().slice(0, 80) : '';
    var address = typeof data.address === 'string' ? data.address.trim().slice(0, 240) : '';
    return voucherRef.get().then(function (snapshot) {
      if (!snapshot.exists) throw new Error('Voucher was not found.');
      var voucher = snapshot.data();
      if (voucher.status !== 'issued') throw new Error('Only issued vouchers can be edited.');
      if (voucher.labId !== context.user.uid) throw new Error('This voucher is assigned to another laboratory.');
      return voucherRef.update({
        patientNrcSnapshot: nrc,
        patientAddressSnapshot: address
      }).then(function () { return lookupVoucher(voucherId); });
    });
  }

  function setVoucherReviewStatus(voucherCode, action, details) {
    var context = firebaseContext();
    var voucherId = validateVoucherCode(voucherCode, 'Voucher code');
    var nextStatus = action === 'verify' ? 'verified' : (action === 'pay' ? 'paid' : (action === 'reject' ? 'rejected' : ''));
    if (VOUCHER_STATUSES.indexOf(nextStatus) === -1 || nextStatus === 'issued' || nextStatus === 'redeemed') {
      throw new Error('Unsupported review action.');
    }
    var submission = details || {};
    var voucherRef = context.db.collection(COLLECTIONS.VOUCHERS).doc(voucherId);
    return context.db.runTransaction(function (transaction) {
      return transaction.get(voucherRef).then(function (snapshot) {
        if (!snapshot.exists) throw new Error('Voucher was not found.');
        var voucher = snapshot.data();
        if (nextStatus === 'verified' && voucher.status !== 'redeemed') {
          throw new Error('Only redeemed vouchers can be verified.');
        }
        if (nextStatus === 'rejected' && voucher.status !== 'redeemed') {
          throw new Error('Only redeemed vouchers can be rejected.');
        }
        if (nextStatus === 'paid' && voucher.status !== 'verified') {
          throw new Error('Only verified vouchers can be marked paid.');
        }
        var now = serverTimestamp(context);
        // Keep verify/pay/reject money in the same invoice-month bucket as redeem.
        var period = pricingApi().calendarPeriod(
          voucher.redeemedAt && voucher.redeemedAt.toDate ? voucher.redeemedAt.toDate() : new Date()
        );
        var globalStatsRef = context.db.collection(COLLECTIONS.PERIOD_STATS).doc(
          pricingApi().periodStatsId('global', null, period)
        );
        var labStatsRef = context.db.collection(COLLECTIONS.PERIOD_STATS).doc(
          pricingApi().periodStatsId('lab', voucher.labId, period)
        );
        var midwifeStatsRef = context.db.collection(COLLECTIONS.PERIOD_STATS).doc(
          pricingApi().periodStatsId('midwife', voucher.midwifeId, period)
        );
        var reviewSheetRef = context.db.collection(COLLECTIONS.PRICE_SHEETS).doc(voucher.priceSheetId);
        return Promise.all([
          transaction.get(globalStatsRef),
          transaction.get(labStatsRef),
          transaction.get(midwifeStatsRef),
          voucher.priceSheetId ? transaction.get(reviewSheetRef) : Promise.resolve({ exists: false, data: function () { return null; } })
        ]).then(function (statSnapshots) {
          var updates = { status: nextStatus };
          if (nextStatus === 'verified') {
            updates.verifiedAt = now;
            updates.verifiedBy = context.user.uid;
            updates.poNameSnapshot = typeof submission.poName === 'string' ? submission.poName.trim().slice(0, 160) : '';
            updates.poDesignationSnapshot = typeof submission.poDesignation === 'string' ?
              submission.poDesignation.trim().slice(0, 160) : '';
            updates.verificationAudit = { action: 'verified', actorId: context.user.uid, at: now };
          } else if (nextStatus === 'rejected') {
            updates.rejectedAt = now;
            updates.rejectedBy = context.user.uid;
            updates.rejectReason = requireString(submission.rejectReason, 'Reject reason', 240);
            updates.rejectionAudit = { action: 'rejected', actorId: context.user.uid, at: now };
          } else {
            updates.paidAt = now;
            updates.paidBy = context.user.uid;
            updates.paymentAudit = { action: 'paid', actorId: context.user.uid, at: now };
          }
          transaction.update(voucherRef, updates);
          var projectMinor = projectAmountFromVoucher(voucher, statSnapshots[3] && statSnapshots[3].exists ? statSnapshots[3].data() : null);
          var fromStatus = voucher.status;
          var identityGlobal = { scope: 'global', period: period, labId: '', midwifeId: '', voucherId: voucherId };
          writePeriodStats(transaction, context, statSnapshots[0], globalStatsRef, identityGlobal, fromStatus, nextStatus, projectMinor);
          if (voucher.labId) {
            writePeriodStats(transaction, context, statSnapshots[1], labStatsRef, {
              scope: 'lab', period: period, labId: voucher.labId, midwifeId: voucher.midwifeId || '', voucherId: voucherId
            }, fromStatus, nextStatus, projectMinor);
          }
          if (voucher.midwifeId) {
            writePeriodStats(transaction, context, statSnapshots[2], midwifeStatsRef, {
              scope: 'midwife', period: period, labId: '', midwifeId: voucher.midwifeId, voucherId: voucherId
            }, fromStatus, nextStatus, projectMinor);
          }
          return voucherId;
        });
      });
    }).then(function () { return lookupVoucher(voucherId); });
  }

  function clampImage(value, label) {
    if (value == null || value === '') return '';
    var image = requireString(value, label, MAX_IMAGE_CHARS);
    if (image.indexOf('data:image/') !== 0) {
      throw new Error(label + ' must be an image.');
    }
    return image;
  }

  function saveLabSettings(input) {
    var data = requireObject(input, 'Lab settings');
    var context = firebaseContext();
    var cashiers = (data.cashiers || []).slice(0, 3).map(function (cashier, index) {
      var row = cashier || {};
      return {
        name: typeof row.name === 'string' ? row.name.trim().slice(0, 120) : '',
        signature: clampImage(row.signature || '', 'Cashier signature ' + (index + 1))
      };
    });
    while (cashiers.length < 3) cashiers.push({ name: '', signature: '' });
    var record = {
      labName: typeof data.labName === 'string' ? data.labName.trim().slice(0, 160) : '',
      address: typeof data.address === 'string' ? data.address.trim().slice(0, 240) : '',
      seal: clampImage(data.seal || '', 'Lab seal'),
      cashiers: cashiers,
      updatedAt: serverTimestamp(context),
      updatedBy: context.user.uid
    };
    return context.db.collection(COLLECTIONS.LAB_SETTINGS).doc(context.user.uid).set(record, { merge: true })
      .then(function () { return record; });
  }

  function getLabSettings(labId) {
    var context = firebaseContext();
    var id = labId || context.user.uid;
    return context.db.collection(COLLECTIONS.LAB_SETTINGS).doc(id).get().then(function (snapshot) {
      return snapshot.exists ? Object.assign({ id: snapshot.id }, snapshot.data()) : {
        id: id, labName: '', address: '', seal: '', cashiers: [{ name: '', signature: '' }, { name: '', signature: '' }, { name: '', signature: '' }]
      };
    });
  }

  function savePoSettings(input) {
    var data = requireObject(input, 'Program Officer settings');
    var context = firebaseContext();
    var record = {
      name: requireString(data.name, 'Name', 160),
      designation: requireString(data.designation, 'Designation', 160),
      signature: clampImage(data.signature || '', 'Signature'),
      updatedAt: serverTimestamp(context),
      updatedBy: context.user.uid
    };
    return context.db.collection(COLLECTIONS.PO_SETTINGS).doc(context.user.uid).set(record, { merge: true })
      .then(function () { return record; });
  }

  function getPoSettings(uid) {
    var context = firebaseContext();
    var id = uid || context.user.uid;
    return context.db.collection(COLLECTIONS.PO_SETTINGS).doc(id).get().then(function (snapshot) {
      return snapshot.exists ? Object.assign({ id: snapshot.id }, snapshot.data()) : {
        id: id, name: '', designation: '', signature: ''
      };
    });
  }

  function saveVoucherSignatures(voucherCode, input) {
    var data = requireObject(input, 'Signatures');
    var context = firebaseContext();
    var voucherId = validateVoucherCode(voucherCode, 'Voucher code');
    var record = {
      updatedAt: serverTimestamp(context),
      updatedBy: context.user.uid
    };
    if (Object.prototype.hasOwnProperty.call(data, 'clientSignature')) {
      record.clientSignature = clampImage(data.clientSignature || '', 'Client signature');
    }
    if (Object.prototype.hasOwnProperty.call(data, 'cashierSignature')) {
      record.cashierSignature = clampImage(data.cashierSignature || '', 'Cashier signature');
    }
    if (Object.prototype.hasOwnProperty.call(data, 'labSeal')) {
      record.labSeal = clampImage(data.labSeal || '', 'Lab seal');
    }
    if (Object.prototype.hasOwnProperty.call(data, 'poSignature')) {
      record.poSignature = clampImage(data.poSignature || '', 'Program Officer signature');
    }
    return context.db.collection(COLLECTIONS.VOUCHERS).doc(voucherId)
      .collection('artifacts').doc('signatures').set(record, { merge: true })
      .then(function () { return getVoucherSignatures(voucherId); });
  }

  function getVoucherSignatures(voucherCode) {
    var context = firebaseContext();
    var voucherId = validateVoucherCode(voucherCode, 'Voucher code');
    return context.db.collection(COLLECTIONS.VOUCHERS).doc(voucherId)
      .collection('artifacts').doc('signatures').get()
      .then(function (snapshot) {
        return snapshot.exists ? snapshot.data() : {
          clientSignature: '', cashierSignature: '', labSeal: '', poSignature: ''
        };
      });
  }

  function deleteVoucher(voucherCode) {
    var context = firebaseContext();
    var voucherId = validateVoucherCode(voucherCode, 'Voucher code');
    var voucherRef = context.db.collection(COLLECTIONS.VOUCHERS).doc(voucherId);
    var signaturesRef = voucherRef.collection('artifacts').doc('signatures');
    return voucherRef.get().then(function (snapshot) {
      if (!snapshot.exists) throw new Error('Voucher was not found.');
      return signaturesRef.delete().catch(function () {
        return null;
      }).then(function () {
        return voucherRef.delete();
      }).then(function () {
        return { id: voucherId, deleted: true };
      });
    });
  }

  function resetPeriodStats() {
    var context = firebaseContext();
    return context.db.collection(COLLECTIONS.PERIOD_STATS).get().then(function (snapshot) {
      if (!snapshot.size) return { deleted: 0 };
      var batches = [];
      var batch = context.db.batch();
      var opCount = 0;
      snapshot.docs.forEach(function (doc) {
        batch.delete(doc.ref);
        opCount += 1;
        if (opCount >= 400) {
          batches.push(batch.commit());
          batch = context.db.batch();
          opCount = 0;
        }
      });
      if (opCount) batches.push(batch.commit());
      return Promise.all(batches).then(function () {
        return { deleted: snapshot.size };
      });
    });
  }

  function getPeriodStats(filters) {
    var input = filters || {};
    var context = firebaseContext();
    var period = input.period || pricingApi().calendarPeriod(new Date());
    if (period === 'all') {
      var query = context.db.collection(COLLECTIONS.PERIOD_STATS);
      if (input.midwifeId) {
        query = query.where('scope', '==', 'midwife').where('midwifeId', '==', input.midwifeId);
      } else if (input.labId) {
        query = query.where('scope', '==', 'lab').where('labId', '==', input.labId);
      } else {
        query = query.where('scope', '==', 'global');
      }
      return query.get().then(function (snapshot) {
        var merged = {
          id: 'all',
          period: 'all',
          counts: pricingApi().emptyCounts(),
          projectRedeemedMinor: 0,
          projectVerifiedMinor: 0,
          projectPaidMinor: 0,
          midwives: {}
        };
        snapshot.docs.forEach(function (doc) {
          var row = doc.data() || {};
          var counts = row.counts || {};
          Object.keys(merged.counts).forEach(function (key) {
            merged.counts[key] += Number(counts[key]) || 0;
          });
          merged.projectRedeemedMinor += Number(row.projectRedeemedMinor) || 0;
          merged.projectVerifiedMinor += Number(row.projectVerifiedMinor) || 0;
          merged.projectPaidMinor += Number(row.projectPaidMinor) || 0;
        });
        return [merged];
      });
    }
    var refs = [];
    if (input.midwifeId) {
      refs.push(context.db.collection(COLLECTIONS.PERIOD_STATS).doc(pricingApi().periodStatsId('midwife', input.midwifeId, period)));
    } else if (input.labId) {
      refs.push(context.db.collection(COLLECTIONS.PERIOD_STATS).doc(pricingApi().periodStatsId('lab', input.labId, period)));
    } else {
      refs.push(context.db.collection(COLLECTIONS.PERIOD_STATS).doc(pricingApi().periodStatsId('global', null, period)));
    }
    return Promise.all(refs.map(function (ref) { return ref.get(); })).then(function (snapshots) {
      return snapshots.map(function (snapshot) {
        return snapshot.exists ? Object.assign({ id: snapshot.id }, snapshot.data()) : {
          id: snapshot.id,
          period: period,
          counts: pricingApi().emptyCounts(),
          projectRedeemedMinor: 0,
          projectVerifiedMinor: 0,
          projectPaidMinor: 0,
          midwives: {}
        };
      });
    });
  }

  function voucherSortMillis(row, dateField) {
    var value = row && row[dateField || 'issuedAt'];
    if (!value) return 0;
    if (typeof value.toMillis === 'function') return value.toMillis();
    if (typeof value.toDate === 'function') return value.toDate().getTime();
    var parsed = new Date(value).getTime();
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  function queryVouchersPagedSingle(filters, pageSize) {
    var context = firebaseContext();
    var query = context.db.collection(COLLECTIONS.VOUCHERS);
    if (filters.labId) query = query.where('labId', '==', filters.labId);
    if (filters.midwifeId) query = query.where('midwifeId', '==', filters.midwifeId);
    if (filters.status) query = query.where('status', '==', filters.status);
    if (filters.redeemedBy) query = query.where('redeemedBy', '==', filters.redeemedBy);
    var dateField = filters.dateField === 'redeemedAt' ? 'redeemedAt' : 'issuedAt';
    if (filters.startDate || filters.endDate) {
      var endDate = filters.endDate ? new Date(filters.endDate) : new Date();
      var startDate = filters.startDate ? new Date(filters.startDate) :
        new Date(endDate.getTime() - (MAX_REPORTING_WINDOW_DAYS * 24 * 60 * 60 * 1000));
      query = query.where(dateField, '>=', context.timestamp.fromDate(startDate))
        .where(dateField, '<=', context.timestamp.fromDate(endDate));
    }
    query = query.orderBy(dateField, 'desc').limit(pageSize);
    return query.get().then(function (snapshot) {
      var rows = snapshot.docs.map(function (doc) { return Object.assign({ id: doc.id }, doc.data()); });
      var sheetIds = Array.from(new Set(rows.map(function (row) { return row.priceSheetId; }).filter(Boolean)));
      return Promise.all(sheetIds.map(function (sheetId) {
        return context.db.collection(COLLECTIONS.PRICE_SHEETS).doc(sheetId).get();
      })).then(function (sheetSnapshots) {
        var sheets = {};
        sheetSnapshots.forEach(function (sheet) {
          if (sheet.exists) sheets[sheet.id] = sheet.data();
        });
        var items = rows.map(function (row) {
          hydrateVoucherTests(row, sheets[row.priceSheetId] || null);
          if (!row.totals || row.totals.projectContributionMinor == null) {
            row.totals = pricingApi().sumLineItems(row.lineItems || []);
          }
          return row;
        });
        return {
          items: items,
          nextCursor: snapshot.size === pageSize ? snapshot.docs[snapshot.docs.length - 1].id : null
        };
      });
    });
  }

  function queryVouchersPaged(input) {
    var filters = input || {};
    var pageSize = Math.min(50, Math.max(1, Number(filters.pageSize) || 50));
    var statusValue = filters.status == null ? '' : String(filters.status).trim().toLowerCase();
    var wantAllStatuses = !statusValue || statusValue === 'all';

    // "All statuses" must not rely on an unconstrained collection query: Firestore
    // security rules with role OR resource filters can reject or empty that path.
    // Query each known status (same indexes as the working single-status filters)
    // and merge client-side.
    if (wantAllStatuses) {
      var statuses = ['issued', 'redeemed', 'verified', 'paid', 'rejected'];
      var dateField = filters.dateField === 'redeemedAt' ? 'redeemedAt' : 'issuedAt';
      return Promise.all(statuses.map(function (status) {
        return queryVouchersPagedSingle(Object.assign({}, filters, {
          status: status,
          dateField: dateField,
          pageSize: pageSize
        }), pageSize);
      })).then(function (pages) {
        var byId = {};
        pages.forEach(function (page) {
          (page.items || []).forEach(function (row) {
            byId[row.code || row.id] = row;
          });
        });
        var items = Object.keys(byId).map(function (key) { return byId[key]; });
        items.sort(function (a, b) {
          return voucherSortMillis(b, dateField) - voucherSortMillis(a, dateField);
        });
        return {
          items: items.slice(0, pageSize),
          nextCursor: items.length > pageSize ? (items[pageSize - 1].code || items[pageSize - 1].id) : null
        };
      });
    }

    return queryVouchersPagedSingle(filters, pageSize);
  }

  function listSubmittedVouchers(input) {
    var filters = input || {};
    var context = firebaseContext();
    return context.db.collection(COLLECTIONS.VOUCHERS)
      .where('redeemedBy', '==', context.user.uid)
      .orderBy('redeemedAt', 'desc')
      .limit(200)
      .get()
      .then(function (snapshot) {
        var from = filters.from ? new Date(filters.from + 'T00:00:00') : null;
        var to = filters.to ? new Date(filters.to + 'T23:59:59') : null;
        var search = String(filters.search || '').toLowerCase();
        return snapshot.docs.map(function (doc) {
          return Object.assign({ id: doc.id }, doc.data());
        }).filter(function (row) {
          var redeemed = row.redeemedAt && row.redeemedAt.toDate ? row.redeemedAt.toDate() : null;
          if (from && redeemed && redeemed < from) return false;
          if (to && redeemed && redeemed > to) return false;
          if (search && String(row.code).toLowerCase().indexOf(search) === -1 &&
              String(row.patientId).toLowerCase().indexOf(search) === -1) return false;
          return true;
        });
      });
  }

  function queryVoucherReport(input) {
    var filters = input || {};
    var context = firebaseContext();
    var endDate = filters.endDate ? new Date(filters.endDate) : new Date();
    var startDate = filters.startDate ? new Date(filters.startDate) :
      new Date(endDate.getTime() - (MAX_REPORTING_WINDOW_DAYS * 24 * 60 * 60 * 1000));
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) ||
        endDate.getTime() < startDate.getTime() ||
        endDate.getTime() - startDate.getTime() > MAX_REPORTING_WINDOW_DAYS * 24 * 60 * 60 * 1000) {
      throw new Error('Reporting window must be valid and no longer than 93 days.');
    }
    var query = context.db.collection(COLLECTIONS.VOUCHERS)
      .where('issuedAt', '>=', context.timestamp.fromDate(startDate))
      .where('issuedAt', '<=', context.timestamp.fromDate(endDate));
    if (filters.midwifeId) query = query.where('midwifeId', '==', filters.midwifeId);
    else if (filters.labId) query = query.where('labId', '==', filters.labId);
    if (filters.status) query = query.where('status', '==', filters.status);
    query = query.orderBy('issuedAt', 'desc');
    if (filters.startAfterIssuedAt) {
      query = query.startAfter(context.timestamp.fromMillis(Number(filters.startAfterIssuedAt)));
    }
    var pageSize = Math.min(100, Math.max(1, Number(filters.pageSize) || 100));
    return query.limit(pageSize).get().then(function (snapshot) {
      var rows = snapshot.docs.map(function (doc) { return Object.assign({ id: doc.id }, doc.data()); });
      var sheetIds = Array.from(new Set(rows.map(function (row) { return row.priceSheetId; }).filter(Boolean)));
      return Promise.all(sheetIds.map(function (sheetId) {
        return context.db.collection(COLLECTIONS.PRICE_SHEETS).doc(sheetId).get();
      })).then(function (sheetSnapshots) {
        var sheets = {};
        sheetSnapshots.forEach(function (sheet) {
          if (sheet.exists) sheets[sheet.id] = sheet.data();
        });
        var items = rows.map(function (row) {
          var sheet = sheets[row.priceSheetId];
          hydrateVoucherTests(row, sheet || null);
          row.amount = row.totals
            ? (row.totals.projectContributionMinor || 0) / 100
            : (row.tests || []).reduce(function (sum, test) {
              return sum + (Number(test.projectCostShare) || 0);
            }, 0);
          return row;
        }).filter(function (row) {
          if (filters.labId && filters.midwifeId && String(row.labId || '') !== String(filters.labId)) {
            return false;
          }
          return true;
        });
        var last = snapshot.docs[snapshot.docs.length - 1];
        return {
          items: items,
          nextCursor: snapshot.size === pageSize && last.data().issuedAt ?
            last.data().issuedAt.toMillis() : null
        };
      });
    });
  }

  root.VoucherService = Object.freeze({
    collections: COLLECTIONS,
    generateOpaqueId: generateOpaqueId,
    generateVoucherCode: generateVoucherCode,
    normalizeVoucherCode: normalizeVoucherCode,
    validateOpaqueId: validateOpaqueId,
    validateVoucherCode: validateVoucherCode,
    validateCurrency: validateCurrency,
    validateServiceCode: validateServiceCode,
    validateCostShares: validateCostShares,
    voucherStatuses: VOUCHER_STATUSES,
    buildQrPayload: buildQrPayload,
    parseQrPayload: parseQrPayload,
    saveCatalogService: saveCatalogService,
    getServiceCatalog: getServiceCatalog,
    publishPricingVersion: publishPricingVersion,
    publishPriceSheet: publishPriceSheet,
    publishCurrentPriceSheet: publishCurrentPriceSheet,
    savePriceOverride: savePriceOverride,
    getPriceOverrides: getPriceOverrides,
    getAssignedPriceSheet: getAssignedPriceSheet,
    listLabs: listLabs,
    getTestCatalog: getTestCatalog,
    createBudget: createBudget,
    topUpBudget: topUpBudget,
    setBudgetStatus: setBudgetStatus,
    allocateQuota: allocateQuota,
    allocateVouchers: allocateVouchers,
    updateAllocation: updateAllocation,
    resetAllocation: resetAllocation,
    getAllocations: getAllocations,
    getMidwifeBudgetSummary: getMidwifeBudgetSummary,
    getAccountQuota: getAccountQuota,
    listProviderProfiles: listProviderProfiles,
    saveLabConfig: saveLabConfig,
    getLabConfig: getLabConfig,
    getProgramSettings: getProgramSettings,
    saveProgramSettings: saveProgramSettings,
    updateIssuedLineItems: updateIssuedLineItems,
    updateIssuedPatientDetails: updateIssuedPatientDetails,
    setVoucherReviewStatus: setVoucherReviewStatus,
    saveLabSettings: saveLabSettings,
    getLabSettings: getLabSettings,
    savePoSettings: savePoSettings,
    getPoSettings: getPoSettings,
    saveVoucherSignatures: saveVoucherSignatures,
    getVoucherSignatures: getVoucherSignatures,
    deleteVoucher: deleteVoucher,
    resetPeriodStats: resetPeriodStats,
    getPeriodStats: getPeriodStats,
    queryVouchersPaged: queryVouchersPaged,
    issueSingleServiceVoucher: issueVoucher,
    issueVoucher: issueMultiServiceVoucher,
    lookupVoucher: lookupVoucher,
    redeemVoucher: redeemVoucher,
    listSubmittedVouchers: listSubmittedVouchers,
    queryVoucherReport: queryVoucherReport
  });
})(typeof window !== 'undefined' ? window : globalThis);
