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

  var INVOICE_COLUMNS = Object.freeze({
    regular: 'Regular Price (MMK)',
    labCostShare: 'Lab Cost share (MMK)',
    client: 'Client Co- payment (MMK)',
    project: 'Project Contribution/ Client Received Amount (MMK)'
  });

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
    INVOICE_COLUMNS: INVOICE_COLUMNS,
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
    periodStatsId: periodStatsId,
    applyStatusDelta: applyStatusDelta
  });
})(typeof window !== 'undefined' ? window : globalThis);
