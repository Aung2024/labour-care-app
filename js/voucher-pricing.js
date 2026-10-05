/**
 * Invoice price math for laboratory vouchers.
 * R = regular price, L = lab cost share, S = R - L (hidden),
 * C = client co-payment, P = project contribution.
 * Amounts are integer minor units (MMK * 100).
 */
(function (root) {
  'use strict';

  var STANDARD_LAB_TESTS = Object.freeze([
    Object.freeze({ id: 'urine-re', code: 'URINE_RE', name: 'Urine RE', defaultRegularMinor: 500000 }),
    Object.freeze({ id: 'hb', code: 'HB', name: 'Hb%', defaultRegularMinor: 400000 }),
    Object.freeze({ id: 'blood-group', code: 'BLOOD_GROUP', name: 'Blood Group & Rh', defaultRegularMinor: 800000 }),
    Object.freeze({ id: 'hbsag', code: 'HBSAG', name: 'HBsAg', defaultRegularMinor: 1000000 }),
    Object.freeze({ id: 'hcv-antibody', code: 'HCV_ANTIBODY', name: 'HCV Antibody', defaultRegularMinor: 1200000 }),
    Object.freeze({ id: 'hiv-antibody', code: 'HIV_ANTIBODY', name: 'HIV 1&2 antibody', defaultRegularMinor: 1200000 }),
    Object.freeze({ id: 'vdrl', code: 'VDRL', name: 'VDRL', defaultRegularMinor: 700000 }),
    Object.freeze({ id: 'ultrasound', code: 'ULTRASOUND', name: 'Ultrasound', defaultRegularMinor: 2500000 }),
    Object.freeze({ id: 'rbs', code: 'RBS', name: 'RBS', defaultRegularMinor: 500000 }),
    Object.freeze({ id: 'g6pd', code: 'G6PD', name: 'G6PD', defaultRegularMinor: 1500000 }),
    Object.freeze({ id: 'ogtt', code: 'OGTT', name: 'OGTT (Gestational Diabetes)', defaultRegularMinor: 1800000 }),
    Object.freeze({ id: 'cp-auto', code: 'CP_AUTO', name: 'CP (Auto)', defaultRegularMinor: 1500000 }),
    Object.freeze({ id: 'hba1c', code: 'HBA1C', name: 'HBA1C', defaultRegularMinor: 2000000 }),
    Object.freeze({ id: 'malaria', code: 'MALARIA', name: 'Malaria Test', defaultRegularMinor: 800000 }),
    Object.freeze({ id: 'serum-bilirubin', code: 'SERUM_BILIRUBIN', name: 'Serum Bilirubin', defaultRegularMinor: 1000000 }),
    Object.freeze({ id: 'chest-xray', code: 'CHEST_XRAY', name: 'Chest X-ray (with Opinion)', defaultRegularMinor: 1500000 })
  ]);

  var LAB_OUTCOME_TESTS = Object.freeze([
    Object.freeze({
      id: 'hb',
      name: 'Hb%',
      aliases: Object.freeze(['hb', 'hb%', 'hemoglobin']),
      resultKind: 'hb-split',
      resultLabels: Object.freeze({
        mild: 'Mild Anemia (7-11 g/dl)',
        severe: 'Severe Anemia (<7 g/dl)'
      })
    }),
    Object.freeze({
      id: 'hbsag',
      name: 'HBsAg',
      aliases: Object.freeze(['hbsag']),
      resultKind: 'positive'
    }),
    Object.freeze({
      id: 'hcv-antibody',
      name: 'HCV Antibody',
      aliases: Object.freeze(['hcv-antibody', 'hcv antibody', 'hcv']),
      resultKind: 'positive'
    }),
    Object.freeze({
      id: 'hiv-antibody',
      name: 'HIV',
      aliases: Object.freeze(['hiv-antibody', 'hiv', 'hiv 1&2 antibody', 'hiv 1&2']),
      resultKind: 'positive'
    }),
    Object.freeze({
      id: 'vdrl',
      name: 'VDRL',
      aliases: Object.freeze(['vdrl']),
      resultKind: 'positive'
    }),
    Object.freeze({
      id: 'malaria',
      name: 'Malaria',
      aliases: Object.freeze(['malaria', 'malaria test']),
      resultKind: 'positive'
    }),
    Object.freeze({
      id: 'tb',
      name: 'TB',
      aliases: Object.freeze(['tb', 'tuberculosis']),
      resultKind: 'positive'
    }),
    Object.freeze({
      id: 'ultrasound',
      name: 'Ultrasound',
      aliases: Object.freeze(['ultrasound']),
      resultKind: 'none'
    })
  ]);

  var INVOICE_COLUMNS = Object.freeze({
    regular: 'Regular Price (MMK)',
    labCostShare: 'Lab Cost share (MMK)',
    client: 'Client Co- payment (MMK)',
    project: 'Project Contribution/ Client Received Amount (MMK)'
  });

  function normalizeVisitKind(value) {
    var kind = String(value || '').trim().toLowerCase();
    return kind === 'new' || kind === 'old' ? kind : '';
  }

  function voucherTimeMs(value) {
    if (!value) return 0;
    if (typeof value.toMillis === 'function') return value.toMillis();
    if (typeof value.toDate === 'function') return value.toDate().getTime();
    var parsed = new Date(value).getTime();
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  function isRedeemedVisit(row) {
    if (!row || row.status === 'issued') return false;
    return !!(row.redeemedAt || row.status === 'redeemed' || row.status === 'verified' ||
      row.status === 'paid' || row.status === 'rejected');
  }

  function visitKindFromSiblings(voucher, siblings) {
    var stored = normalizeVisitKind(voucher && voucher.patientVisitKind);
    if (stored) return stored;
    var id = String((voucher && (voucher.code || voucher.id)) || '');
    var mine = voucherTimeMs(voucher && voucher.redeemedAt);
    var prior = (siblings || []).some(function (row) {
      var otherId = String((row && (row.code || row.id)) || '');
      if (!otherId || otherId === id) return false;
      if (!isRedeemedVisit(row)) return false;
      var other = voucherTimeMs(row.redeemedAt);
      if (!mine) return true;
      if (!other) return false;
      if (other < mine) return true;
      return other === mine && otherId < id;
    });
    return prior ? 'old' : 'new';
  }

  function normalizeOutcomeKey(value) {
    return String(value == null ? '' : value).toLowerCase().replace(/[^a-z0-9]+/g, '');
  }

  function findOutcomeTestForRow(row) {
    var id = normalizeOutcomeKey(row && (row.serviceId || row.id));
    var name = normalizeOutcomeKey(row && (row.serviceName || row.name));
    var index;
    for (index = 0; index < LAB_OUTCOME_TESTS.length; index += 1) {
      var test = LAB_OUTCOME_TESTS[index];
      var keys = [test.id].concat(test.aliases || []).map(normalizeOutcomeKey);
      if (id && keys.indexOf(id) !== -1) return test;
    }
    for (index = 0; index < LAB_OUTCOME_TESTS.length; index += 1) {
      var named = LAB_OUTCOME_TESTS[index];
      var keysByName = [named.id, named.name].concat(named.aliases || []).map(normalizeOutcomeKey);
      if (name && keysByName.indexOf(name) !== -1) return named;
    }
    return null;
  }

  function outcomeInteger(value) {
    var amount = Number(value);
    if (!Number.isFinite(amount) || amount < 0) return 0;
    return Math.floor(amount);
  }

  function countForOutcomeTest(countedRows, test) {
    if (!test) return 0;
    return (countedRows || []).reduce(function (sum, row) {
      var match = findOutcomeTestForRow(row);
      if (!match || match.id !== test.id) return sum;
      return sum + outcomeInteger(row.testCount);
    }, 0);
  }

  function buildLabOutcomeRows(countedRows, savedRows) {
    var savedById = {};
    (savedRows || []).forEach(function (row) {
      var match = findOutcomeTestForRow(row);
      if (match) savedById[match.id] = row;
      else if (row && row.serviceId) savedById[row.serviceId] = row;
    });
    return LAB_OUTCOME_TESTS.map(function (test) {
      var saved = savedById[test.id] || {};
      var testCount = countForOutcomeTest(countedRows, test);
      var mild = outcomeInteger(saved.mildAnemiaCount);
      var severe = outcomeInteger(saved.severeAnemiaCount);
      if (test.resultKind === 'hb-split' && saved.mildAnemiaCount == null && saved.severeAnemiaCount == null) {
        mild = outcomeInteger(saved.outcomeCount);
        severe = 0;
      }
      var outcomeCount = test.resultKind === 'hb-split'
        ? mild + severe
        : (test.resultKind === 'none' ? 0 : outcomeInteger(saved.outcomeCount));
      if (outcomeCount > testCount) outcomeCount = testCount;
      if (test.resultKind === 'hb-split' && mild + severe > testCount) {
        severe = Math.max(0, testCount - mild);
        if (mild > testCount) mild = testCount;
        outcomeCount = mild + severe;
      }
      return {
        serviceId: test.id,
        serviceName: test.name,
        resultKind: test.resultKind,
        resultLabels: test.resultLabels || null,
        testCount: testCount,
        outcomeCount: test.resultKind === 'none' ? 0 : outcomeCount,
        mildAnemiaCount: test.resultKind === 'hb-split' ? mild : 0,
        severeAnemiaCount: test.resultKind === 'hb-split' ? severe : 0
      };
    });
  }

  function displayLabOutcomeRows(savedRows) {
    var counted = (savedRows || []).map(function (row) {
      return {
        serviceId: row.serviceId,
        serviceName: row.serviceName,
        testCount: row.testCount
      };
    });
    var catalog = buildLabOutcomeRows(counted, savedRows);
    var extras = (savedRows || []).filter(function (row) {
      return row && row.serviceId && !findOutcomeTestForRow(row);
    }).map(function (row) {
      return {
        serviceId: row.serviceId,
        serviceName: row.serviceName || row.serviceId,
        resultKind: 'positive',
        resultLabels: null,
        testCount: outcomeInteger(row.testCount),
        outcomeCount: outcomeInteger(row.outcomeCount),
        mildAnemiaCount: 0,
        severeAnemiaCount: 0
      };
    });
    return catalog.concat(extras);
  }

  function requireInteger(value, label, minimum) {
    if (!Number.isSafeInteger(value) || value < minimum) {
      throw new Error(label + ' must be a safe integer of at least ' + minimum + '.');
    }
    return value;
  }

  function normalizePercentPair(projectPercent, clientPercent) {
    var project = requireInteger(projectPercent, 'Project percent', 0);
    var client = requireInteger(clientPercent, 'Client percent', 0);
    if (project + client !== 100) {
      throw new Error('Project and client percents must add up to 100.');
    }
    return { projectPercent: project, clientPercent: client };
  }

  function computeInvoiceShares(regularMinor, labCostShareMinor, clientPercent, projectPercent) {
    var regular = requireInteger(regularMinor, 'Regular price', 0);
    var labShare = requireInteger(labCostShareMinor, 'Lab cost share', 0);
    if (labShare > regular) {
      throw new Error('Lab cost share cannot exceed the regular price.');
    }
    var percents = projectPercent == null && clientPercent == null
      ? { projectPercent: 90, clientPercent: 10 }
      : normalizePercentPair(
        projectPercent == null ? 100 - clientPercent : projectPercent,
        clientPercent == null ? 100 - projectPercent : clientPercent
      );
    var subsidized = regular - labShare;
    var client = Math.round(subsidized * percents.clientPercent / 100);
    var project = subsidized - client;
    return {
      regularPriceMinor: regular,
      labCostShareMinor: labShare,
      subsidizedCostMinor: subsidized,
      clientCopayMinor: client,
      projectContributionMinor: project,
      clientPercent: percents.clientPercent,
      projectPercent: percents.projectPercent
    };
  }

  function asMoneyMinor(value) {
    var amount = Number(value);
    if (!Number.isFinite(amount)) return null;
    return Math.round(amount);
  }

  function lineItemFromSheetService(service, percents) {
    var row = service || {};
    var regular = asMoneyMinor(row.regularPriceMinor);
    var labShare = asMoneyMinor(row.labCostShareMinor);
    if (regular != null) {
      var computed = computeInvoiceShares(
        regular,
        labShare == null ? 0 : labShare,
        percents && percents.clientPercent,
        percents && percents.projectPercent
      );
      return {
        serviceId: row.serviceId,
        serviceCode: row.serviceCode || '',
        serviceName: row.serviceName || '',
        regularPriceMinor: computed.regularPriceMinor,
        labCostShareMinor: computed.labCostShareMinor,
        subsidizedCostMinor: computed.subsidizedCostMinor,
        clientCopayMinor: computed.clientCopayMinor,
        projectContributionMinor: computed.projectContributionMinor
      };
    }
    var client = asMoneyMinor(row.clientCostShareMinor);
    var project = asMoneyMinor(row.projectCostShareMinor);
    var subsidized = asMoneyMinor(row.subsidizedCostMinor);
    if (subsidized == null) subsidized = (client || 0) + (project || 0);
    return {
      serviceId: row.serviceId,
      serviceCode: row.serviceCode || '',
      serviceName: row.serviceName || '',
      regularPriceMinor: subsidized,
      labCostShareMinor: labShare == null ? 0 : labShare,
      subsidizedCostMinor: subsidized,
      clientCopayMinor: client == null ? 0 : client,
      projectContributionMinor: project == null ? 0 : project
    };
  }

  function sumLineItems(items) {
    return (items || []).reduce(function (totals, item) {
      totals.regularPriceMinor += Number(item.regularPriceMinor) || 0;
      totals.labCostShareMinor += Number(item.labCostShareMinor) || 0;
      totals.clientCopayMinor += Number(item.clientCopayMinor) || 0;
      totals.projectContributionMinor += Number(item.projectContributionMinor) || 0;
      return totals;
    }, {
      regularPriceMinor: 0,
      labCostShareMinor: 0,
      clientCopayMinor: 0,
      projectContributionMinor: 0
    });
  }

  /**
   * Cap total project contribution. Any excess is moved onto client co-payment,
   * taken first from the highest project line items.
   */
  function applyProjectCeiling(lineItems, ceilingMinor) {
    var items = (lineItems || []).map(function (item) {
      return Object.assign({}, item);
    });
    var totals = sumLineItems(items);
    if (ceilingMinor == null || ceilingMinor === '' || !Number.isFinite(Number(ceilingMinor))) {
      return { lineItems: items, totals: totals, ceilingAppliedMinor: 0 };
    }
    var ceiling = Math.max(0, Math.round(Number(ceilingMinor)));
    if (ceiling <= 0 || totals.projectContributionMinor <= ceiling) {
      return { lineItems: items, totals: totals, ceilingAppliedMinor: 0 };
    }
    var excess = totals.projectContributionMinor - ceiling;
    var remaining = excess;
    items.slice().sort(function (a, b) {
      return (Number(b.projectContributionMinor) || 0) - (Number(a.projectContributionMinor) || 0);
    }).forEach(function (item) {
      if (remaining <= 0) return;
      var project = Number(item.projectContributionMinor) || 0;
      var move = Math.min(project, remaining);
      item.projectContributionMinor = project - move;
      item.clientCopayMinor = (Number(item.clientCopayMinor) || 0) + move;
      remaining -= move;
    });
    return {
      lineItems: items,
      totals: sumLineItems(items),
      ceilingAppliedMinor: excess - remaining
    };
  }

  function minorToMajor(value) {
    return (Number(value) || 0) / 100;
  }

  function majorToMinor(value) {
    return Math.round((Number(value) || 0) * 100);
  }

  function formatMajor(value) {
    var amount = Number(value) || 0;
    return amount.toLocaleString(undefined, { maximumFractionDigits: 0 });
  }

  function emptyCounts() {
    return { issued: 0, redeemed: 0, verified: 0, paid: 0, rejected: 0 };
  }

  function calendarPeriod(value) {
    var date = value && typeof value.toDate === 'function' ? value.toDate() : (value instanceof Date ? value : new Date(value || Date.now()));
    if (Number.isNaN(date.getTime())) date = new Date();
    return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0');
  }

  function padMonth(month) {
    return String(month).padStart(2, '0');
  }

  function billingPeriodKey(year, month) {
    return Number(year) + '-' + padMonth(month);
  }

  // Named month uses the 21st-to-20th window. October = 21 Sep through 20 Oct.
  function billingPeriodRange(year, month) {
    var y = Number(year);
    var m = Number(month);
    if (!y || !m || m < 1 || m > 12) return null;
    return {
      period: billingPeriodKey(y, m),
      year: y,
      month: m,
      startDate: new Date(y, m - 2, 21, 0, 0, 0, 0),
      endDate: new Date(y, m - 1, 20, 23, 59, 59, 999)
    };
  }

  function billingYearRange(year) {
    var y = Number(year);
    if (!y) return null;
    return {
      period: String(y),
      year: y,
      month: 0,
      startDate: new Date(y, -1, 21, 0, 0, 0, 0),
      endDate: new Date(y, 11, 20, 23, 59, 59, 999)
    };
  }

  function monthLabel(month) {
    return new Date(2026, Number(month) - 1, 1).toLocaleString(undefined, { month: 'long' });
  }

  function billingMonthOf(value) {
    var date = value && typeof value.toDate === 'function' ? value.toDate() : new Date(value);
    if (Number.isNaN(date.getTime())) return 0;
    return date.getDate() >= 21 ? ((date.getMonth() + 1) % 12) + 1 : date.getMonth() + 1;
  }

  function periodStatsId(scope, subjectId, period) {
    if (scope === 'global') return 'global_' + period;
    return scope + '_' + subjectId + '_' + period;
  }

  function applyStatusDelta(stats, fromStatus, toStatus, projectMinor) {
    var next = {
      counts: Object.assign(emptyCounts(), (stats && stats.counts) || {}),
      projectRedeemedMinor: Number(stats && stats.projectRedeemedMinor) || 0,
      projectVerifiedMinor: Number(stats && stats.projectVerifiedMinor) || 0,
      projectPaidMinor: Number(stats && stats.projectPaidMinor) || 0
    };
    if (fromStatus && next.counts[fromStatus] != null) {
      next.counts[fromStatus] = Math.max(0, next.counts[fromStatus] - 1);
    }
    if (toStatus && next.counts[toStatus] != null) {
      next.counts[toStatus] += 1;
    }
    var project = Number(projectMinor) || 0;
    if (toStatus === 'redeemed') next.projectRedeemedMinor += project;
    if (fromStatus === 'redeemed' && (toStatus === 'verified' || toStatus === 'rejected')) {
      next.projectRedeemedMinor = Math.max(0, next.projectRedeemedMinor - project);
    }
    if (toStatus === 'verified') next.projectVerifiedMinor += project;
    if (fromStatus === 'verified' && toStatus === 'paid') {
      next.projectVerifiedMinor = Math.max(0, next.projectVerifiedMinor - project);
      next.projectPaidMinor += project;
    }
    if (fromStatus === 'verified' && toStatus === 'rejected') {
      next.projectVerifiedMinor = Math.max(0, next.projectVerifiedMinor - project);
    }
    // Deletion / unwind: remove money that belonged to the removed status.
    if (fromStatus && !toStatus) {
      if (fromStatus === 'redeemed') {
        next.projectRedeemedMinor = Math.max(0, next.projectRedeemedMinor - project);
      }
      if (fromStatus === 'verified') {
        next.projectVerifiedMinor = Math.max(0, next.projectVerifiedMinor - project);
      }
      if (fromStatus === 'paid') {
        next.projectPaidMinor = Math.max(0, next.projectPaidMinor - project);
      }
    }
    return next;
  }

  root.VoucherPricing = Object.freeze({
    STANDARD_LAB_TESTS: STANDARD_LAB_TESTS,
    LAB_OUTCOME_TESTS: LAB_OUTCOME_TESTS,
    INVOICE_COLUMNS: INVOICE_COLUMNS,
    findOutcomeTestForRow: findOutcomeTestForRow,
    buildLabOutcomeRows: buildLabOutcomeRows,
    displayLabOutcomeRows: displayLabOutcomeRows,
    normalizeVisitKind: normalizeVisitKind,
    visitKindFromSiblings: visitKindFromSiblings,
    normalizePercentPair: normalizePercentPair,
    computeInvoiceShares: computeInvoiceShares,
    lineItemFromSheetService: lineItemFromSheetService,
    sumLineItems: sumLineItems,
    applyProjectCeiling: applyProjectCeiling,
    minorToMajor: minorToMajor,
    majorToMinor: majorToMinor,
    formatMajor: formatMajor,
    emptyCounts: emptyCounts,
    calendarPeriod: calendarPeriod,
    billingPeriodKey: billingPeriodKey,
    billingPeriodRange: billingPeriodRange,
    billingYearRange: billingYearRange,
    monthLabel: monthLabel,
    billingMonthOf: billingMonthOf,
    periodStatsId: periodStatsId,
    applyStatusDelta: applyStatusDelta
  });
})(typeof window !== 'undefined' ? window : globalThis);
