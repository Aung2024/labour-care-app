(function () {
  'use strict';

  var state = {
    currentUser: null,
    labs: [],
    maternityHomes: [],
    allocations: [],
    queue: [],
    selectedCodes: {},
    currentVoucher: null,
    poSettings: null,
    poPad: null,
    page: 'dashboard'
  };

  function byId(id) { return document.getElementById(id); }
  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function numberValue(value) { var n = Number(value); return Number.isFinite(n) ? n : 0; }
  function formatNumber(value) { return numberValue(value).toLocaleString(); }
  function formatMoney(value) { return formatNumber(value) + ' MMK'; }
  function normalizeKey(value) { return String(value || '').toLowerCase().trim(); }
  function service() { return window.VoucherService; }
  function pricing() { return window.VoucherPricing; }

  var messageTimer = null;
  function showMessage(text, kind) {
    var element = byId('pageMessage');
    if (!element) return;
    if (messageTimer) window.clearTimeout(messageTimer);
    element.className = 'po-message po-message--' + (kind || 'info');
    element.textContent = text;
    element.hidden = false;
    messageTimer = window.setTimeout(function () { element.hidden = true; }, 5000);
  }

  function profileName(profile) {
    return profile.displayName || profile.name || profile.labName || profile.organization_name || profile.email || 'Unnamed';
  }
  function profileType(profile) {
    var role = normalizeKey(profile.role);
    if (role === 'lab' || role === 'laboratory') return 'lab';
    if (role === 'midwife' || role === '') return 'maternity';
    return '';
  }
  function currentPeriod() {
    var now = new Date();
    return now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
  }

  function fillSelect(select, items, placeholder) {
    select.innerHTML = '<option value="">' + escapeHtml(placeholder) + '</option>' +
      items.map(function (item) {
        return '<option value="' + escapeHtml(item.id) + '">' + escapeHtml(profileName(item)) + '</option>';
      }).join('');
  }

  function showPage(page) {
    state.page = page;
    document.querySelectorAll('.po-page').forEach(function (section) {
      var active = section.id === page + 'Page';
      section.hidden = !active;
      section.classList.toggle('is-active', active);
    });
    document.querySelectorAll('.po-sidenav button, #poDrawer button').forEach(function (button) {
      button.classList.toggle('is-active', button.getAttribute('data-page') === page);
    });
    var titles = {
      dashboard: 'Dashboard',
      labs: 'Configure Lab',
      verify: 'Verify & Paid',
      allocations: 'Allocations & Budget',
      settings: 'Settings'
    };
    byId('poPageTitle').textContent = titles[page] || 'Program Officer';
    byId('poDrawer').hidden = true;
    if (page === 'dashboard') loadDashboard();
    if (page === 'verify') loadQueue();
    if (page === 'labs') renderLabConfig();
    if (page === 'allocations') renderAllocations();
  }

  async function loadProfiles() {
    var profiles = await service().listProviderProfiles();
    state.labs = profiles.filter(function (profile) { return profileType(profile) === 'lab'; });
    state.maternityHomes = profiles.filter(function (profile) { return profileType(profile) === 'maternity'; });
    fillSelect(byId('dashLab'), state.labs, 'All laboratories');
    fillSelect(byId('dashMidwife'), state.maternityHomes, 'All midwives');
    fillSelect(byId('configLab'), state.labs, 'Select laboratory');
    fillSelect(byId('allocationMaternityHome'), state.maternityHomes, 'Select maternity home');
  }

  function renderConfigTests(config) {
    var saved = {};
    ((config && config.tests) || []).forEach(function (test) { saved[test.serviceId] = test; });
    byId('configTests').innerHTML = '<table class="po-table"><thead><tr>' +
      '<th></th><th>Laboratory Test</th><th>Regular Price</th><th>Lab Cost share</th><th>Client</th><th>Project</th>' +
      '</tr></thead><tbody>' +
      pricing().STANDARD_LAB_TESTS.map(function (test) {
        var row = saved[test.id] || {};
        var regular = row.regularPriceMinor != null ? row.regularPriceMinor / 100 : test.defaultRegularMinor / 100;
        var labShare = row.labCostShareMinor != null ? row.labCostShareMinor / 100 : 0;
        var checked = row.active !== false;
        return '<tr data-service="' + escapeHtml(test.id) + '">' +
          '<td><input class="form-check-input config-active" type="checkbox"' + (checked ? ' checked' : '') + '></td>' +
          '<td>' + escapeHtml(test.name) + '</td>' +
          '<td><input class="form-control config-regular" type="number" min="0" value="' + regular + '"></td>' +
          '<td><input class="form-control config-labshare" type="number" min="0" value="' + labShare + '"></td>' +
          '<td class="config-client">—</td><td class="config-project">—</td></tr>';
      }).join('') + '</tbody></table>';
    updateConfigPreview();
  }

  function updateConfigPreview() {
    var clientPercent = numberValue(byId('configClientPercent').value);
    var projectPercent = numberValue(byId('configProjectPercent').value);
    Array.from(byId('configTests').querySelectorAll('tr[data-service]')).forEach(function (row) {
      try {
        var shares = pricing().computeInvoiceShares(
          Math.round(numberValue(row.querySelector('.config-regular').value) * 100),
          Math.round(numberValue(row.querySelector('.config-labshare').value) * 100),
          clientPercent,
          projectPercent
        );
        row.querySelector('.config-client').textContent = formatMoney(shares.clientCopayMinor / 100);
        row.querySelector('.config-project').textContent = formatMoney(shares.projectContributionMinor / 100);
      } catch (error) {
        row.querySelector('.config-client').textContent = '—';
        row.querySelector('.config-project').textContent = '—';
      }
    });
  }

  async function renderLabConfig() {
    var labId = byId('configLab').value;
    if (!labId) {
      byId('configLabName').value = '';
      byId('configLabAddress').value = '';
      renderConfigTests(null);
      return;
    }
    var result = await service().getLabConfig(labId);
    var profile = result.profile || {};
    var config = result.config;
    byId('configLabName').value = (config && config.labName) || profileName(profile);
    byId('configLabAddress').value = (config && config.address) || profile.address || '';
    if (config) {
      byId('configProjectPercent').value = config.projectPercent;
      byId('configClientPercent').value = config.clientPercent;
    }
    renderConfigTests(config);
  }

  async function saveLabConfig() {
    var labId = byId('configLab').value;
    if (!labId) throw new Error('Select a laboratory.');
    var tests = Array.from(byId('configTests').querySelectorAll('tr[data-service]')).map(function (row) {
      var standard = pricing().STANDARD_LAB_TESTS.find(function (item) { return item.id === row.getAttribute('data-service'); });
      return {
        serviceId: standard.id,
        serviceCode: standard.code,
        serviceName: standard.name,
        regularPriceMinor: Math.round(numberValue(row.querySelector('.config-regular').value) * 100),
        labCostShareMinor: Math.round(numberValue(row.querySelector('.config-labshare').value) * 100),
        active: row.querySelector('.config-active').checked
      };
    });
    await service().saveLabConfig({
      labId: labId,
      labName: byId('configLabName').value.trim(),
      address: byId('configLabAddress').value.trim(),
      projectPercent: numberValue(byId('configProjectPercent').value),
      clientPercent: numberValue(byId('configClientPercent').value),
      tests: tests
    });
    showMessage('Laboratory prices saved and published.', 'success');
  }

  function countsFromStats(rows) {
    var counts = pricing().emptyCounts();
    var incoming = 0;
    var paid = 0;
    rows.forEach(function (row) {
      Object.keys(counts).forEach(function (key) {
        counts[key] = Math.max(counts[key], Number((row.counts || {})[key]) || 0);
      });
      incoming = Math.max(incoming, Number(row.projectVerifiedMinor) || 0);
      paid = Math.max(paid, Number(row.projectPaidMinor) || 0);
    });
    return { counts: counts, incoming: incoming, paid: paid };
  }

  async function loadDashboard() {
    var period = byId('dashPeriod').value || currentPeriod();
    var stats = await service().getPeriodStats({
      period: period,
      labId: byId('dashLab').value || undefined,
      midwifeId: byId('dashMidwife').value || undefined
    });
    var summary = countsFromStats(stats);
    byId('statIssued').textContent = formatNumber(summary.counts.issued);
    byId('statRedeemed').textContent = formatNumber(summary.counts.redeemed);
    byId('statVerified').textContent = formatNumber(summary.counts.verified);
    byId('statPaid').textContent = formatNumber(summary.counts.paid);
    byId('statRejected').textContent = formatNumber(summary.counts.rejected);
    byId('statIncoming').textContent = formatMoney(summary.incoming / 100);
    byId('statReceived').textContent = formatMoney(summary.paid / 100);
    var start = period + '-01';
    var endDate = new Date(Number(period.slice(0, 4)), Number(period.slice(5, 7)), 0);
    var report = await service().queryVoucherReport({
      startDate: start + 'T00:00:00',
      endDate: endDate.toISOString(),
      labId: byId('dashLab').value,
      midwifeId: byId('dashMidwife').value,
      pageSize: 50
    });
    var rows = report.items || [];
    byId('dashList').innerHTML = rows.length ? '<table class="po-table"><thead><tr><th>Voucher</th><th>Status</th><th>Midwife</th><th>Lab</th><th>Project</th></tr></thead><tbody>' +
      rows.map(function (row) {
        return '<tr><td>' + escapeHtml(row.code || row.id) + '</td><td>' + escapeHtml(row.status || '') + '</td><td>' +
          escapeHtml(row.issuerNameSnapshot || row.midwifeId) + '</td><td>' +
          escapeHtml(row.labNameSnapshot || row.labId) + '</td><td>' +
          formatMoney(((row.totals && row.totals.projectContributionMinor) || 0) / 100) + '</td></tr>';
      }).join('') + '</tbody></table>' : '<div class="po-empty">No vouchers in this period.</div>';
  }

  async function loadQueue() {
    var status = byId('verifyQueueStatus').value || 'redeemed';
    var result = await service().queryVouchersPaged({ status: status, pageSize: 50, dateField: 'redeemedAt' });
    state.queue = result.items || [];
    renderQueue();
  }

  function renderQueue() {
    if (!state.queue.length) {
      byId('verifyQueue').innerHTML = '<div class="po-empty">No vouchers in this queue.</div>';
      return;
    }
    byId('verifyQueue').innerHTML = state.queue.map(function (row) {
      var code = row.code || row.id;
      return '<label class="po-queue-item' + (state.currentVoucher && state.currentVoucher.code === code ? ' is-active' : '') + '">' +
        '<input type="checkbox" data-code="' + escapeHtml(code) + '"' + (state.selectedCodes[code] ? ' checked' : '') + '>' +
        '<button type="button" data-open="' + escapeHtml(code) + '"><strong>' + escapeHtml(code) + '</strong><br><small>' +
        escapeHtml(row.patientNameSnapshot || '') + ' · ' + escapeHtml(row.status) + '</small></button></label>';
    }).join('');
  }

  async function openVoucher(code) {
    state.currentVoucher = await service().lookupVoucher(code);
    var signatures = await service().getVoucherSignatures(code);
    var settings = state.poSettings || await service().getPoSettings();
    state.poSettings = settings;
    var extras = {
      lab: {
        seal: signatures.labSeal,
        cashierSignature: signatures.cashierSignature,
        cashierName: state.currentVoucher.cashierNameSnapshot,
        date: window.VoucherInvoice.formatDate(state.currentVoucher.redeemedAt)
      },
      client: {
        signature: signatures.clientSignature,
        name: state.currentVoucher.patientNameSnapshot,
        nrc: state.currentVoucher.patientNrcSnapshot,
        phone: state.currentVoucher.patientPhoneSnapshot,
        address: state.currentVoucher.patientAddressSnapshot,
        date: window.VoucherInvoice.formatDate(state.currentVoucher.redeemedAt)
      },
      project: state.currentVoucher.status === 'verified' || state.currentVoucher.status === 'paid' ? {
        signature: signatures.poSignature || settings.signature,
        name: state.currentVoucher.poNameSnapshot || settings.name,
        designation: state.currentVoucher.poDesignationSnapshot || settings.designation,
        date: window.VoucherInvoice.formatDate(state.currentVoucher.verifiedAt)
      } : {}
    };
    window.VoucherInvoice.render(byId('verifyInvoice'), window.VoucherInvoice.modelFromVoucher(state.currentVoucher, extras));
    byId('verifyOneBtn').disabled = state.currentVoucher.status !== 'redeemed';
    byId('rejectOneBtn').disabled = state.currentVoucher.status !== 'redeemed';
    renderQueue();
  }

  async function review(action, codes) {
    var list = codes || [];
    if (!list.length) throw new Error('Select at least one voucher.');
    for (var index = 0; index < list.length; index += 1) {
      await service().setVoucherReviewStatus(list[index], action, {
        poName: (state.poSettings && state.poSettings.name) || byId('poName').value,
        poDesignation: (state.poSettings && state.poSettings.designation) || byId('poDesignation').value,
        rejectReason: byId('rejectReason').value.trim()
      });
      if (action === 'verify' && state.poSettings && state.poSettings.signature) {
        await service().saveVoucherSignatures(list[index], { poSignature: state.poSettings.signature });
      }
    }
    showMessage('Voucher status updated.', 'success');
    await loadQueue();
    if (state.currentVoucher) await openVoucher(state.currentVoucher.code);
    if (state.page === 'dashboard') await loadDashboard();
  }

  async function loadAllocations() {
    state.allocations = await service().getAllocations();
    renderAllocations();
  }

  function renderAllocations() {
    if (!state.allocations.length) {
      byId('allocationsList').innerHTML = '<div class="po-empty">No allocations yet.</div>';
      return;
    }
    byId('allocationsList').innerHTML = state.allocations.map(function (item) {
      var home = state.maternityHomes.find(function (row) { return row.id === item.midwifeId; });
      return '<article class="po-allocation"><div><div class="po-allocation__name">' +
        escapeHtml(home ? profileName(home) : item.midwifeId) + '</div></div>' +
        '<div class="po-metric"><span>Allocated</span><strong>' + formatNumber(item.allocatedUnits) + '</strong></div>' +
        '<div class="po-metric"><span>Remaining</span><strong>' + formatNumber(item.remainingUnits) + '</strong></div>' +
        '<div class="po-metric"><span>PO-only budget</span><strong>' +
        formatMoney(((item.budget && item.budget.totalMinor) || 0) / 100) + '</strong></div></article>';
    }).join('');
  }

  async function saveAllocation(event) {
    event.preventDefault();
    await service().allocateVouchers({
      midwifeId: byId('allocationMaternityHome').value,
      allocatedUnits: Math.floor(numberValue(byId('allocationCount').value)),
      totalMinor: Math.round(numberValue(byId('allocationBudget').value) * 100),
      currency: byId('allocationCurrency').value.trim() || 'MMK',
      note: byId('allocationNote').value.trim()
    });
    byId('allocationFormCard').hidden = true;
    await loadAllocations();
    showMessage('Allocation saved.', 'success');
  }

  async function savePoSettings() {
    var signature = state.poPad && !state.poPad.isEmpty() ? await window.VoucherInvoice.compressImage(state.poPad.toDataUrl(), 320, 140) : (state.poSettings && state.poSettings.signature) || '';
    state.poSettings = await service().savePoSettings({
      name: byId('poName').value.trim(),
      designation: byId('poDesignation').value.trim(),
      signature: signature
    });
    showMessage('Program Officer settings saved.', 'success');
  }

  async function logout() {
    await firebase.auth().signOut();
    sessionStorage.clear();
    ['role', 'userEmail', 'userId'].forEach(function (key) { localStorage.removeItem(key); });
    window.location.replace('login.html');
  }

  function selectedQueueCodes() {
    return Array.from(document.querySelectorAll('#verifyQueue input[type="checkbox"]:checked'))
      .map(function (input) { return input.getAttribute('data-code'); });
  }

  function bindEvents() {
    document.querySelectorAll('[data-page]').forEach(function (button) {
      button.addEventListener('click', function () { showPage(button.getAttribute('data-page')); });
    });
    byId('poMenuBtn').addEventListener('click', function () {
      byId('poDrawer').hidden = !byId('poDrawer').hidden;
    });
    byId('homeBtn').addEventListener('click', function () { showPage('dashboard'); });
    byId('refreshAllBtn').addEventListener('click', refreshAll);
    byId('logoutBtn').addEventListener('click', logout);
    byId('dashPeriod').addEventListener('change', loadDashboard);
    byId('dashLab').addEventListener('change', loadDashboard);
    byId('dashMidwife').addEventListener('change', loadDashboard);
    byId('configLab').addEventListener('change', function () {
      renderLabConfig().catch(function (error) { showMessage(error.message, 'error'); });
    });
    byId('configProjectPercent').addEventListener('input', updateConfigPreview);
    byId('configClientPercent').addEventListener('input', updateConfigPreview);
    byId('configTests').addEventListener('input', updateConfigPreview);
    byId('saveLabConfigBtn').addEventListener('click', function () {
      saveLabConfig().catch(function (error) { showMessage(error.message, 'error'); });
    });
    byId('verifyQueueStatus').addEventListener('change', loadQueue);
    byId('verifyQueue').addEventListener('click', function (event) {
      var button = event.target.closest('[data-open]');
      if (button) openVoucher(button.getAttribute('data-open')).catch(function (error) { showMessage(error.message, 'error'); });
    });
    byId('verifyQueue').addEventListener('change', function (event) {
      if (event.target.matches('input[type="checkbox"]')) {
        state.selectedCodes[event.target.getAttribute('data-code')] = event.target.checked;
      }
    });
    byId('verifyOneBtn').addEventListener('click', function () {
      if (!state.currentVoucher) return;
      review('verify', [state.currentVoucher.code]).catch(function (error) { showMessage(error.message, 'error'); });
    });
    byId('rejectOneBtn').addEventListener('click', function () {
      if (!state.currentVoucher) return;
      review('reject', [state.currentVoucher.code]).catch(function (error) { showMessage(error.message, 'error'); });
    });
    byId('bulkVerifyBtn').addEventListener('click', function () {
      review('verify', selectedQueueCodes()).catch(function (error) { showMessage(error.message, 'error'); });
    });
    byId('bulkPayBtn').addEventListener('click', function () {
      review('pay', selectedQueueCodes()).catch(function (error) { showMessage(error.message, 'error'); });
    });
    byId('openAllocationBtn').addEventListener('click', function () { byId('allocationFormCard').hidden = false; });
    byId('cancelAllocationBtn').addEventListener('click', function () { byId('allocationFormCard').hidden = true; });
    byId('allocationFormCard').addEventListener('submit', function (event) {
      saveAllocation(event).catch(function (error) { showMessage(error.message, 'error'); });
    });
    byId('clearPoSignBtn').addEventListener('click', function () { if (state.poPad) state.poPad.clear(); });
    byId('savePoSettingsBtn').addEventListener('click', function () {
      savePoSettings().catch(function (error) { showMessage(error.message, 'error'); });
    });
  }

  async function refreshAll() {
    await loadProfiles();
    await loadAllocations();
    state.poSettings = await service().getPoSettings();
    byId('poName').value = state.poSettings.name || '';
    byId('poDesignation').value = state.poSettings.designation || '';
    if (state.page === 'dashboard') await loadDashboard();
    if (state.page === 'verify') await loadQueue();
    showMessage('Program data refreshed.', 'success');
  }

  async function initialize(user) {
    state.currentUser = user;
    var profile = await firebase.firestore().collection('users').doc(user.uid).get();
    if (!profile.exists || normalizeKey(profile.data().role) !== 'program officer') {
      throw new Error('Active Program Officer access required.');
    }
    byId('signedInUser').textContent = profileName(Object.assign({ id: profile.id }, profile.data()));
    byId('dashPeriod').value = currentPeriod();
    state.poPad = window.VoucherInvoice.bindSignaturePad(byId('poSignaturePad'));
    await refreshAll();
    showPage('dashboard');
  }

  document.addEventListener('DOMContentLoaded', function () {
    bindEvents();
    firebase.auth().onAuthStateChanged(function (user) {
      if (!user) {
        window.location.replace('login.html');
        return;
      }
      initialize(user).catch(function (error) {
        showMessage(error.message || 'Could not open Program Officer.', 'error');
      });
    });
  });
})();
