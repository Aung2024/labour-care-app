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
    VOUCHERS: 'vouchers'
  });
  var OPAQUE_ID_PATTERN = /^[A-Za-z0-9_-]{22}$/;
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

  function validateCostShares(subsidizedMinor, clientMinor, projectMinor) {
    var subsidized = requireInteger(subsidizedMinor, 'Subsidized cost', 0);
    var client = requireInteger(clientMinor, 'Client cost share', 0);
    var project = requireInteger(projectMinor, 'Project cost share', 0);
    if (client + project !== subsidized) {
      throw new Error('Client and project cost shares must equal the subsidized cost.');
    }
    return { subsidized: subsidized, client: client, project: project };
  }

  function validateOpaqueId(value, label) {
    if (typeof value !== 'string' || !OPAQUE_ID_PATTERN.test(value)) {
      throw new Error((label || 'Identifier') + ' must be a 22-character opaque identifier.');
    }
    return value;
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

  function buildQrPayload(voucherCode) {
    validateOpaqueId(voucherCode, 'Voucher code');
    return JSON.stringify({ v: 1, c: voucherCode });
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
    validateOpaqueId(parsed.c, 'Voucher code');
    return parsed.c;
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
          'Subsidized cost',
          0
        ),
        defaultClientCostShareMinor: requireInteger(data.defaultClientCostShareMinor || 0, 'Client cost share', 0),
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

  function normalizeSheetService(input) {
    var service = requireObject(input, 'Price-sheet service');
    var shares = validateCostShares(
      requireInteger(service.subsidizedCostMinor, 'Subsidized cost', 0),
      requireInteger(service.clientCostShareMinor, 'Client cost share', 0),
      requireInteger(service.projectCostShareMinor, 'Project cost share', 0)
    );
    return {
      serviceId: requireString(service.serviceId, 'Service ID', 64),
      serviceCode: validateServiceCode(service.serviceCode),
      serviceName: requireString(service.serviceName, 'Service name', 120),
      subsidizedCostMinor: shares.subsidized,
      clientCostShareMinor: shares.client,
      projectCostShareMinor: shares.project
    };
  }

  function publishPriceSheet(input) {
    var data = requireObject(input, 'Price sheet');
    var context = firebaseContext();
    var midwifeId = data.midwifeId == null ? null : requireString(data.midwifeId, 'Midwife ID', 128);
    var services = (data.services || []).map(normalizeSheetService);
    if (!services.length || services.length > 30) {
      throw new Error('A price sheet must contain between 1 and 30 services.');
    }
    var serviceIds = services.map(function (item) { return item.serviceId; });
    if (new Set(serviceIds).size !== serviceIds.length) {
      throw new Error('A price sheet cannot contain duplicate services.');
    }
    var sheetId = generateOpaqueId();
    var assignmentId = midwifeId || 'global';
    var sheetRef = context.db.collection(COLLECTIONS.PRICE_SHEETS).doc(sheetId);
    var assignmentRef = context.db.collection(COLLECTIONS.PRICE_ASSIGNMENTS).doc(assignmentId);
    var batch = context.db.batch();
    batch.set(sheetRef, {
      midwifeId: midwifeId,
      currency: validateCurrency(data.currency || 'MMK'),
      status: 'published',
      serviceIds: serviceIds,
      services: services,
      publishedAt: serverTimestamp(context),
      publishedBy: context.user.uid
    });
    batch.set(assignmentRef, {
      midwifeId: midwifeId,
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
    var midwifeId = requireString(data.midwifeId || data.maternityHomeId, 'Midwife ID', 128);
    var serviceId = requireString(data.serviceId, 'Service ID', 64);
    var shares = validateCostShares(
      requireInteger(data.subsidizedCostMinor, 'Subsidized cost', 0),
      requireInteger(data.clientCostShareMinor, 'Client cost share', 0),
      requireInteger(data.projectCostShareMinor, 'Project cost share', 0)
    );
    var overrideId = midwifeId + '__' + serviceId;
    return context.db.collection(COLLECTIONS.OVERRIDES).doc(overrideId).set({
      midwifeId: midwifeId,
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

  function publishCurrentPriceSheet(midwifeId) {
    var context = firebaseContext();
    var catalogPromise = context.db.collection(COLLECTIONS.CATALOG).where('active', '==', true).get();
    var overridePromise = midwifeId ?
      context.db.collection(COLLECTIONS.OVERRIDES).where('midwifeId', '==', midwifeId).get() :
      Promise.resolve({ docs: [] });
    return Promise.all([catalogPromise, overridePromise]).then(function (snapshots) {
      var overrideByService = {};
      snapshots[1].docs.forEach(function (doc) {
        var row = doc.data();
        if (row.active !== false) overrideByService[row.serviceId] = row;
      });
      var services = snapshots[0].docs.map(function (doc) {
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
      return publishPriceSheet({ midwifeId: midwifeId || null, currency: 'MMK', services: services });
    });
  }

  function getAssignedPriceSheet(midwifeId) {
    var context = firebaseContext();
    var requestedMidwifeId = midwifeId || context.user.uid;
    var specificRef = context.db.collection(COLLECTIONS.PRICE_ASSIGNMENTS).doc(requestedMidwifeId);
    var globalRef = context.db.collection(COLLECTIONS.PRICE_ASSIGNMENTS).doc('global');
    return Promise.all([specificRef.get(), globalRef.get()]).then(function (snapshots) {
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

  function getTestCatalog() {
    var context = firebaseContext();
    return context.db.collection(COLLECTIONS.ACCOUNT_QUOTAS).doc(context.user.uid).get().then(function (quotaSnapshot) {
      if (!quotaSnapshot.exists || !quotaSnapshot.data().priceSheetId) {
        throw new Error('No voucher allocation is available for this account.');
      }
      return context.db.collection(COLLECTIONS.PRICE_SHEETS).doc(quotaSnapshot.data().priceSheetId).get();
    }).then(function (sheetSnapshot) {
      if (!sheetSnapshot.exists) throw new Error('The allocated price sheet was not found.');
      var sheet = Object.assign({ id: sheetSnapshot.id }, sheetSnapshot.data());
      return {
        priceSheetId: sheet.id,
        tests: sheet.services.map(function (service) {
          return {
            id: service.serviceId,
            name: service.serviceName,
            serviceCode: service.serviceCode,
            subsidizedCost: service.subsidizedCostMinor / 100,
            clientCostShare: service.clientCostShareMinor / 100,
            projectCostShare: service.projectCostShareMinor / 100
          };
        })
      };
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
    var assignmentRef = context.db.collection(COLLECTIONS.PRICE_ASSIGNMENTS).doc(midwifeId);
    var globalAssignmentRef = context.db.collection(COLLECTIONS.PRICE_ASSIGNMENTS).doc('global');
    return context.db.runTransaction(function (transaction) {
      return Promise.all([
        transaction.get(quotaRef),
        transaction.get(assignmentRef),
        transaction.get(globalAssignmentRef)
      ]).then(function (snapshots) {
        var existing = snapshots[0].exists ? snapshots[0].data() : null;
        var assignment = snapshots[1].exists ? snapshots[1].data() :
          (snapshots[2].exists ? snapshots[2].data() : null);
        if (!assignment || !assignment.priceSheetId) {
          throw new Error('Publish a global or maternity-home price sheet before allocating vouchers.');
        }
        var allocatedUnits = (existing ? existing.allocatedUnits : 0) + units;
        var remainingUnits = (existing ? existing.remainingUnits : 0) + units;
        var now = serverTimestamp(context);
        transaction.set(quotaRef, {
          midwifeId: midwifeId,
          allocatedUnits: allocatedUnits,
          remainingUnits: remainingUnits,
          priceSheetId: assignment.priceSheetId,
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
      return snapshots[0].docs.map(function (doc) {
        return Object.assign({ id: doc.id, budget: budgets[doc.id] || null }, doc.data());
      });
    });
  }

  function issueMultiServiceVoucher(input) {
    var data = requireObject(input, 'Voucher');
    var context = firebaseContext();
    var patientId = requireString(data.patientId, 'Patient ID', 160);
    var selectedServiceIds = Array.from(new Set(data.selectedServiceIds || []));
    if (!selectedServiceIds.length || selectedServiceIds.length > 30) {
      throw new Error('Select between 1 and 30 services.');
    }
    selectedServiceIds.forEach(function (id) { requireString(id, 'Service ID', 64); });
    var voucherId = generateOpaqueId();
    var voucherRef = context.db.collection(COLLECTIONS.VOUCHERS).doc(voucherId);
    var quotaRef = context.db.collection(COLLECTIONS.ACCOUNT_QUOTAS).doc(context.user.uid);
    var patientRef = context.db.collection('patients').doc(patientId);

    return context.db.runTransaction(function (transaction) {
      return Promise.all([transaction.get(quotaRef), transaction.get(patientRef)]).then(function (snapshots) {
        var quotaSnapshot = snapshots[0];
        var patientSnapshot = snapshots[1];
        if (!quotaSnapshot.exists || !patientSnapshot.exists) throw new Error('Quota or patient was not found.');
        var quota = quotaSnapshot.data();
        var patient = patientSnapshot.data();
        if (quota.midwifeId !== context.user.uid || quota.status !== 'active' || quota.remainingUnits < 1) {
          throw new Error('No active voucher quota is available.');
        }
        var sheetRef = context.db.collection(COLLECTIONS.PRICE_SHEETS).doc(quota.priceSheetId);
        return transaction.get(sheetRef).then(function (sheetSnapshot) {
          if (!sheetSnapshot.exists || sheetSnapshot.data().status !== 'published') {
            throw new Error('The assigned price sheet is unavailable.');
          }
          var sheet = sheetSnapshot.data();
          selectedServiceIds.forEach(function (serviceId) {
            if (sheet.serviceIds.indexOf(serviceId) === -1) throw new Error('A selected service is not on the assigned price sheet.');
          });
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
            patientId: patientId,
            patientNameSnapshot: requireString(patient.name || patient.patient_name, 'Patient name', 160),
            patientAgeSnapshot: patient.age == null ? null : Number(patient.age),
            patientPhoneSnapshot: typeof patient.phone === 'string' ? patient.phone.slice(0, 40) : '',
            patientNrcSnapshot: typeof data.nrc === 'string' ? data.nrc.trim().slice(0, 80) :
              (typeof patient.nrc === 'string' ? patient.nrc.slice(0, 80) : ''),
            ancVisitDate: requireString(data.ancVisitDate, 'ANC visit date', 10),
            midwifeId: context.user.uid,
            issuerNameSnapshot: requireString(data.issuerName, 'Issuer name', 160),
            priceSheetId: quota.priceSheetId,
            selectedServiceIds: selectedServiceIds,
            issuedAt: now,
            expiresAt: dateTimestamp(context, data.expiresAt || new Date(Date.now() + 90 * 86400000), 'Expiry')
          });
          return { id: voucherId, code: voucherId, qrPayload: buildQrPayload(voucherId) };
        });
      });
    });
  }

  function lookupVoucher(voucherCode) {
    var context = firebaseContext();
    var voucherId = validateOpaqueId(voucherCode, 'Voucher code');
    return context.db.collection(COLLECTIONS.VOUCHERS).doc(voucherId).get().then(function (voucherSnapshot) {
      if (!voucherSnapshot.exists) throw new Error('Voucher was not found.');
      var voucher = Object.assign({ id: voucherSnapshot.id }, voucherSnapshot.data());
      return context.db.collection(COLLECTIONS.PRICE_SHEETS).doc(voucher.priceSheetId).get().then(function (sheetSnapshot) {
        var services = sheetSnapshot.exists ? sheetSnapshot.data().services : [];
        voucher.tests = services.filter(function (service) {
          return voucher.selectedServiceIds.indexOf(service.serviceId) !== -1;
        }).map(function (service) {
          return {
            id: service.serviceId,
            name: service.serviceName,
            subsidizedCost: service.subsidizedCostMinor / 100,
            clientCostShare: service.clientCostShareMinor / 100,
            projectCostShare: service.projectCostShareMinor / 100
          };
        });
        voucher.patientReference = voucher.patientId;
        voucher.generatedByName = voucher.issuerNameSnapshot;
        return voucher;
      });
    });
  }

  function issueVoucher(input) {
    var data = requireObject(input, 'Voucher');
    var context = firebaseContext();
    var quotaId = validateOpaqueId(data.quotaId, 'Quota ID');
    var beneficiaryRef = validateOpaqueId(data.beneficiaryRef, 'Beneficiary reference');
    var voucherId = generateOpaqueId();
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
    var voucherId = validateOpaqueId(voucherCode, 'Voucher code');
    var voucherRef = context.db.collection(COLLECTIONS.VOUCHERS).doc(voucherId);
    return context.db.runTransaction(function (transaction) {
      return transaction.get(voucherRef).then(function (snapshot) {
        if (!snapshot.exists) throw new Error('Voucher was not found.');
        var voucher = snapshot.data();
        if (voucher.code !== voucherId || voucher.status !== 'issued') {
          throw new Error('Voucher is not active.');
        }
        if (voucher.expiresAt && voucher.expiresAt.toMillis() <= Date.now()) {
          throw new Error('Voucher has expired.');
        }
        var now = serverTimestamp(context);
        transaction.update(voucherRef, {
          status: 'redeemed',
          redeemedAt: now,
          redeemedBy: context.user.uid,
          labDisplayNameSnapshot: typeof submission.labDisplayName === 'string' ?
            submission.labDisplayName.trim().slice(0, 160) : '',
          submissionReference: typeof submission.submissionReference === 'string' ?
            submission.submissionReference.trim().slice(0, 120) : '',
          redemptionAudit: {
            action: 'redeemed',
            actorId: context.user.uid,
            at: now
          }
        });
        return voucherId;
      });
    }).then(function () { return lookupVoucher(voucherId); });
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
          var selected = sheet ? sheet.services.filter(function (service) {
            return row.selectedServiceIds.indexOf(service.serviceId) !== -1;
          }) : [];
          row.tests = selected.map(function (service) {
            return {
              id: service.serviceId,
              name: service.serviceName,
              subsidizedCost: service.subsidizedCostMinor / 100,
              clientCostShare: service.clientCostShareMinor / 100,
              projectCostShare: service.projectCostShareMinor / 100
            };
          });
          row.amount = selected.reduce(function (sum, service) {
            return sum + service.subsidizedCostMinor;
          }, 0) / 100;
          return row;
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
    validateOpaqueId: validateOpaqueId,
    validateCurrency: validateCurrency,
    validateServiceCode: validateServiceCode,
    validateCostShares: validateCostShares,
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
    getTestCatalog: getTestCatalog,
    createBudget: createBudget,
    topUpBudget: topUpBudget,
    setBudgetStatus: setBudgetStatus,
    allocateQuota: allocateQuota,
    allocateVouchers: allocateVouchers,
    getAllocations: getAllocations,
    issueSingleServiceVoucher: issueVoucher,
    issueVoucher: issueMultiServiceVoucher,
    lookupVoucher: lookupVoucher,
    redeemVoucher: redeemVoucher,
    listSubmittedVouchers: listSubmittedVouchers,
    queryVoucherReport: queryVoucherReport
  });
})(typeof window !== 'undefined' ? window : globalThis);
