(function () {
  'use strict';

  var state = {
    currentUser: null,
    labs: [],
    maternityHomes: [],
    allocations: [],
    queue: [],
    selectedCodes: {},
    dashStatusFilter: null,
    poSettings: null,
    poPad: null,
    editingSignature: false,
    page: 'dashboard',
    navCollapsed: false
  };

  function byId(id) { return document.getElementById(id); }
  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function numberValue(value) {
    if (value === '' || value == null) return 0;
    var n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
  function formatNumber(value) { return numberValue(value).toLocaleString(); }
  function formatMoney(value) { return formatNumber(value) + ' MMK'; }
  function normalizeKey(value) { return String(value || '').toLowerCase().trim(); }
  function service() { return window.VoucherService; }
  function pricing() { return window.VoucherPricing; }

  var toastTimer = null;
  function showMessage(text, kind) {
    var host = byId('poToastHost');
    if (!host) return;
    if (toastTimer) window.clearTimeout(toastTimer);
    var toast = document.createElement('div');
    toast.className = 'po-toast po-toast--' + (kind || 'info');
    toast.setAttribute('role', 'status');
    toast.textContent = text;
    host.innerHTML = '';
    host.appendChild(toast);
    host.hidden = false;
    toastTimer = window.setTimeout(function () {
      host.hidden = true;
      host.innerHTML = '';
    }, 4500);
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

  function fillPeriodSelect(select, selected) {
    var value = selected || 'all';
    var options = ['<option value="all">All time</option>'];
    var now = new Date();
    for (var i = 0; i < 24; i += 1) {
      var date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      var key = date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0');
      var label = date.toLocaleString(undefined, { month: 'long', year: 'numeric' });
      options.push('<option value="' + key + '">' + escapeHtml(label) + '</option>');
    }
    select.innerHTML = options.join('');
    select.value = value;
    if (select.value !== value) select.value = 'all';
  }

  function fillSelect(select, items, placeholder) {
    var previous = select.value;
    select.innerHTML = '<option value="">' + escapeHtml(placeholder) + '</option>' +
      items.map(function (item) {
        return '<option value="' + escapeHtml(item.id) + '">' + escapeHtml(profileName(item)) + '</option>';
      }).join('');
    if (previous && Array.from(select.options).some(function (opt) { return opt.value === previous; })) {
      select.value = previous;
    }
  }

  function periodDateRange(period) {
    if (!period || period === 'all') return null;
    var year = Number(period.slice(0, 4));
    var month = Number(period.slice(5, 7));
    if (!year || !month) return null;
    var start = new Date(year, month - 1, 1);
    var end = new Date(year, month, 0, 23, 59, 59, 999);
    return { startDate: start.toISOString(), endDate: end.toISOString() };
  }

  function dateFieldForStatus(status) {
    if (status === 'redeemed' || status === 'verified' || status === 'paid' || status === 'rejected') {
      return 'redeemedAt';
    }
    return 'issuedAt';
  }

  function moneyInputValue(minorOrMajor) {
    var value = numberValue(minorOrMajor);
    return value === 0 ? '' : String(value);
  }

  function statusBadge(status) {
    var key = normalizeKey(status);
    return '<span class="po-badge po-badge--' + escapeHtml(key || 'neutral') + '">' +
      escapeHtml(status || '—') + '</span>';
  }

  function showPage(page) {
    state.page = page;
    document.querySelectorAll('.po-page').forEach(function (section) {
      var active = section.id === page + 'Page';
      section.hidden = !active;
      section.classList.toggle('is-active', active);
    });
    document.querySelectorAll('.po-sidenav button[data-page], #poDrawer button[data-page]').forEach(function (button) {
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
    if (page === 'dashboard') loadDashboardStats();
    if (page === 'verify') loadVerifyQueue();
    if (page === 'labs') renderLabConfig();
    if (page === 'allocations') renderAllocations();
    if (page === 'settings') renderPoSettingsUi();
  }

  function setNavCollapsed(collapsed) {
    state.navCollapsed = !!collapsed;
    var sidenav = byId('poSidenav');
    var layout = document.querySelector('.po-layout');
    if (sidenav) sidenav.classList.toggle('is-collapsed', state.navCollapsed);
    if (layout) layout.classList.toggle('po-layout--nav-collapsed', state.navCollapsed);
    var btn = byId('poNavCollapseBtn');
    if (btn) {
      btn.setAttribute('aria-label', state.navCollapsed ? 'Expand menu' : 'Collapse menu');
      btn.title = state.navCollapsed ? 'Expand menu' : 'Collapse menu';
      btn.innerHTML = state.navCollapsed
        ? '<i class="fas fa-angles-right" aria-hidden="true"></i>'
        : '<i class="fas fa-angles-left" aria-hidden="true"></i>';
    }
  }

  async function loadProfiles() {
    var profiles = await service().listProviderProfiles();
    state.labs = profiles.filter(function (profile) { return profileType(profile) === 'lab'; });
    state.maternityHomes = profiles.filter(function (profile) { return profileType(profile) === 'maternity'; });
    fillSelect(byId('dashLab'), state.labs, 'All laboratories');
    fillSelect(byId('dashMidwife'), state.maternityHomes, 'All midwives');
    fillSelect(byId('configLab'), state.labs, 'Select laboratory');
    fillSelect(byId('verifyLab'), state.labs, 'All laboratories');
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
          '<td><input class="form-check-input config-active" type="checkbox"' + (checked ? ' checked' : '') +
          ' aria-label="Enable ' + escapeHtml(test.name) + '"></td>' +
          '<td>' + escapeHtml(test.name) + '</td>' +
          '<td><input class="form-control config-regular" type="number" min="0" step="1" value="' +
          escapeHtml(String(regular)) + '" aria-label="Regular price for ' + escapeHtml(test.name) + '"></td>' +
          '<td><input class="form-control config-labshare" type="number" min="0" step="1" value="' +
          escapeHtml(moneyInputValue(labShare)) + '" placeholder="0" aria-label="Lab cost share for ' +
          escapeHtml(test.name) + '"></td>' +
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
    var labName = byId('configLabName').value.trim();
    await service().saveLabConfig({
      labId: labId,
      labName: labName,
      address: byId('configLabAddress').value.trim(),
      projectPercent: numberValue(byId('configProjectPercent').value),
      clientPercent: numberValue(byId('configClientPercent').value),
      tests: tests
    });
    var lab = state.labs.find(function (row) { return row.id === labId; });
    if (lab) {
      lab.displayName = labName;
      lab.name = labName;
      lab.labName = labName;
      lab.organization_name = labName;
      lab.address = byId('configLabAddress').value.trim();
    }
    fillSelect(byId('dashLab'), state.labs, 'All laboratories');
    fillSelect(byId('configLab'), state.labs, 'Select laboratory');
    fillSelect(byId('verifyLab'), state.labs, 'All laboratories');
    byId('configLab').value = labId;
    showMessage('Laboratory prices saved and published.', 'success');
  }

  function countsFromStats(rows) {
    var counts = pricing().emptyCounts();
    var incoming = 0;
    var paid = 0;
    rows.forEach(function (row) {
      Object.keys(counts).forEach(function (key) {
        counts[key] += Number((row.counts || {})[key]) || 0;
      });
      incoming += Number(row.projectVerifiedMinor) || 0;
      paid += Number(row.projectPaidMinor) || 0;
    });
    return { counts: counts, incoming: incoming, paid: paid };
  }

  function clearDashListHint() {
    byId('dashList').innerHTML = '<div class="po-empty">Tap a status card to list vouchers</div>';
    document.querySelectorAll('.po-stat--filter').forEach(function (card) {
      card.classList.remove('is-active');
    });
  }

  async function loadDashboardStats() {
    var period = byId('dashPeriod').value || 'all';
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
    if (state.dashStatusFilter) {
      await loadDashboardList(state.dashStatusFilter);
    } else {
      clearDashListHint();
    }
  }

  async function loadDashboardList(status) {
    state.dashStatusFilter = status;
    document.querySelectorAll('.po-stat--filter').forEach(function (card) {
      card.classList.toggle('is-active', card.getAttribute('data-dash-status') === status);
    });
    byId('dashList').innerHTML = '<div class="po-loading"><i class="fas fa-spinner fa-spin"></i>Loading vouchers…</div>';
    var period = byId('dashPeriod').value || 'all';
    var range = periodDateRange(period);
    var query = {
      status: status,
      labId: byId('dashLab').value || undefined,
      midwifeId: byId('dashMidwife').value || undefined,
      pageSize: 50,
      dateField: dateFieldForStatus(status)
    };
    if (range) {
      query.startDate = range.startDate;
      query.endDate = range.endDate;
    }
    var report = await service().queryVouchersPaged(query);
    var rows = report.items || [];
    byId('dashList').innerHTML = rows.length
      ? '<table class="po-table"><thead><tr><th>Voucher</th><th>Status</th><th>Midwife</th><th>Lab</th><th>Project</th></tr></thead><tbody>' +
        rows.map(function (row) {
          return '<tr><td>' + escapeHtml(row.code || row.id) + '</td><td>' + statusBadge(row.status) + '</td><td>' +
            escapeHtml(row.issuerNameSnapshot || row.midwifeId || '—') + '</td><td>' +
            escapeHtml(row.labNameSnapshot || row.labId || '—') + '</td><td>' +
            formatMoney(((row.totals && row.totals.projectContributionMinor) || 0) / 100) + '</td></tr>';
        }).join('') + '</tbody></table>'
      : '<div class="po-empty">No ' + escapeHtml(status) + ' vouchers for this filter.</div>';
  }

  async function loadVerifyQueue() {
    var status = byId('verifyStatus').value || 'redeemed';
    var period = byId('verifyPeriod').value || 'all';
    var range = periodDateRange(period);
    var query = {
      status: status,
      labId: byId('verifyLab').value || undefined,
      pageSize: 50,
      dateField: dateFieldForStatus(status)
    };
    if (range) {
      query.startDate = range.startDate;
      query.endDate = range.endDate;
    }
    byId('verifyTable').innerHTML = '<div class="po-loading"><i class="fas fa-spinner fa-spin"></i>Loading vouchers…</div>';
    var result = await service().queryVouchersPaged(query);
    state.queue = result.items || [];
    Object.keys(state.selectedCodes).forEach(function (code) {
      if (!state.queue.some(function (row) { return (row.code || row.id) === code; })) {
        delete state.selectedCodes[code];
      }
    });
    renderVerifyTable();
  }

  function renderVerifyTable() {
    if (!state.queue.length) {
      byId('verifyTable').innerHTML = '<div class="po-empty">No vouchers match these filters.</div>';
      return;
    }
    byId('verifyTable').innerHTML =
      '<table class="po-table po-table--verify"><thead><tr>' +
      '<th><span class="visually-hidden">Select</span></th>' +
      '<th>Code</th><th>Patient</th><th>Lab</th><th>Midwife</th><th>Amount</th><th>Status</th><th></th>' +
      '</tr></thead><tbody>' +
      state.queue.map(function (row) {
        var code = row.code || row.id;
        var amount = ((row.totals && row.totals.projectContributionMinor) || 0) / 100;
        return '<tr data-code="' + escapeHtml(code) + '">' +
          '<td><input type="checkbox" class="form-check-input verify-check" data-code="' + escapeHtml(code) + '"' +
          (state.selectedCodes[code] ? ' checked' : '') + ' aria-label="Select ' + escapeHtml(code) + '"></td>' +
          '<td><strong>' + escapeHtml(code) + '</strong></td>' +
          '<td>' + escapeHtml(row.patientNameSnapshot || '—') + '</td>' +
          '<td>' + escapeHtml(row.labNameSnapshot || row.labId || '—') + '</td>' +
          '<td>' + escapeHtml(row.issuerNameSnapshot || row.midwifeId || '—') + '</td>' +
          '<td>' + formatMoney(amount) + '</td>' +
          '<td>' + statusBadge(row.status) + '</td>' +
          '<td><button type="button" class="btn btn-outline-primary btn-sm" data-preview="' +
          escapeHtml(code) + '">Preview</button></td></tr>';
      }).join('') + '</tbody></table>';
  }

  function selectedVerifyCodes() {
    return Array.from(document.querySelectorAll('#verifyTable .verify-check:checked'))
      .map(function (input) { return input.getAttribute('data-code'); })
      .filter(Boolean);
  }

  async function buildInvoiceExtras(voucher, signatures, settings) {
    var seal = (signatures && signatures.labSeal) || '';
    if (!seal && voucher.labId) {
      try {
        var labSettings = await service().getLabSettings(voucher.labId);
        seal = (labSettings && labSettings.seal) || '';
      } catch (error) {
        seal = '';
      }
    }
    return {
      lab: {
        seal: seal,
        cashierSignature: (signatures && signatures.cashierSignature) || '',
        cashierName: voucher.cashierNameSnapshot,
        date: window.VoucherInvoice.formatDate(voucher.redeemedAt)
      },
      client: {
        signature: (signatures && signatures.clientSignature) || '',
        name: voucher.patientNameSnapshot,
        nrc: voucher.patientNrcSnapshot,
        phone: voucher.patientPhoneSnapshot,
        address: voucher.patientAddressSnapshot,
        date: window.VoucherInvoice.formatDate(voucher.redeemedAt)
      },
      project: voucher.status === 'verified' || voucher.status === 'paid' ? {
        signature: (signatures && signatures.poSignature) || (settings && settings.signature) || '',
        name: voucher.poNameSnapshot || (settings && settings.name) || '',
        designation: voucher.poDesignationSnapshot || (settings && settings.designation) || '',
        date: window.VoucherInvoice.formatDate(voucher.verifiedAt)
      } : {}
    };
  }

  async function openPreviewModal(codes) {
    var list = (codes || []).filter(Boolean);
    if (!list.length) throw new Error('Select or open at least one voucher to preview.');
    var settings = state.poSettings || await service().getPoSettings();
    state.poSettings = settings;
    var body = byId('previewModalBody');
    body.innerHTML = '<div class="po-loading"><i class="fas fa-spinner fa-spin"></i>Loading invoices…</div>';
    byId('previewModal').hidden = false;
    document.body.classList.add('po-modal-open');

    var mounts = [];
    for (var index = 0; index < list.length; index += 1) {
      var voucher = await service().lookupVoucher(list[index]);
      var signatures = await service().getVoucherSignatures(list[index]);
      var extras = await buildInvoiceExtras(voucher, signatures, settings);
      var wrap = document.createElement('div');
      wrap.className = 'po-preview-stack';
      wrap.innerHTML = '<div class="po-preview-stack__title">' + escapeHtml(voucher.code || list[index]) +
        ' · ' + escapeHtml(voucher.status || '') + '</div><div class="invoice-preview"></div>';
      mounts.push({ voucher: voucher, extras: extras, mount: wrap.querySelector('.invoice-preview'), wrap: wrap });
    }
    body.innerHTML = '';
    mounts.forEach(function (item) {
      body.appendChild(item.wrap);
      window.VoucherInvoice.render(item.mount, window.VoucherInvoice.modelFromVoucher(item.voucher, item.extras));
    });
  }

  function closePreviewModal() {
    byId('previewModal').hidden = true;
    byId('previewModalBody').innerHTML = '';
    document.body.classList.remove('po-modal-open');
  }

  async function review(action, codes) {
    var list = codes || [];
    if (!list.length) throw new Error('Select at least one voucher.');
    if (action === 'reject' && !byId('rejectReason').value.trim()) {
      throw new Error('Enter a reject reason.');
    }
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
    state.selectedCodes = {};
    await loadVerifyQueue();
    if (state.page === 'dashboard') await loadDashboardStats();
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

  function ensurePoPad() {
    var canvas = byId('poSignaturePad');
    if (!canvas) return null;
    if (!state.poPad) state.poPad = window.VoucherInvoice.bindSignaturePad(canvas);
    return state.poPad;
  }

  function setSignatureEditMode(editing) {
    state.editingSignature = !!editing;
    var hasSaved = !!(state.poSettings && state.poSettings.signature);
    byId('poSignaturePreviewWrap').hidden = !(hasSaved && !state.editingSignature);
    byId('poSignaturePadWrap').hidden = !state.editingSignature;
    byId('poSignatureEmpty').hidden = hasSaved || state.editingSignature;
    if (state.editingSignature) ensurePoPad();
  }

  function renderPoSettingsUi() {
    byId('poName').value = (state.poSettings && state.poSettings.name) || '';
    byId('poDesignation').value = (state.poSettings && state.poSettings.designation) || '';
    var preview = byId('poSignaturePreview');
    if (state.poSettings && state.poSettings.signature) {
      preview.src = state.poSettings.signature;
      setSignatureEditMode(false);
    } else {
      preview.removeAttribute('src');
      setSignatureEditMode(false);
    }
  }

  async function savePoSettings() {
    var existing = (state.poSettings && state.poSettings.signature) || '';
    var signature = existing;
    if (state.editingSignature && state.poPad && !state.poPad.isEmpty()) {
      signature = await window.VoucherInvoice.compressImage(state.poPad.toDataUrl(), 320, 140);
    } else if (state.editingSignature && (!state.poPad || state.poPad.isEmpty()) && !existing) {
      throw new Error('Draw a signature before saving.');
    }
    state.poSettings = await service().savePoSettings({
      name: byId('poName').value.trim(),
      designation: byId('poDesignation').value.trim(),
      signature: signature
    });
    if (state.poPad) state.poPad.clear();
    renderPoSettingsUi();
    showMessage('Program Officer settings saved.', 'success');
  }

  async function logout() {
    await firebase.auth().signOut();
    sessionStorage.clear();
    ['role', 'userEmail', 'userId'].forEach(function (key) { localStorage.removeItem(key); });
    window.location.replace('login.html');
  }

  function bindEvents() {
    document.querySelectorAll('[data-page]').forEach(function (button) {
      button.addEventListener('click', function () { showPage(button.getAttribute('data-page')); });
    });
    byId('poMenuBtn').addEventListener('click', function () {
      byId('poDrawer').hidden = !byId('poDrawer').hidden;
    });
    byId('poNavCollapseBtn').addEventListener('click', function () {
      setNavCollapsed(!state.navCollapsed);
    });
    byId('homeBtn').addEventListener('click', function () { showPage('dashboard'); });
    byId('refreshAllBtn').addEventListener('click', refreshAll);
    byId('logoutBtn').addEventListener('click', logout);

    byId('dashPeriod').addEventListener('change', function () {
      state.dashStatusFilter = null;
      loadDashboardStats().catch(function (error) { showMessage(error.message, 'error'); });
    });
    byId('dashLab').addEventListener('change', function () {
      state.dashStatusFilter = null;
      loadDashboardStats().catch(function (error) { showMessage(error.message, 'error'); });
    });
    byId('dashMidwife').addEventListener('change', function () {
      state.dashStatusFilter = null;
      loadDashboardStats().catch(function (error) { showMessage(error.message, 'error'); });
    });
    document.querySelectorAll('.po-stat--filter').forEach(function (card) {
      card.addEventListener('click', function () {
        var status = card.getAttribute('data-dash-status');
        loadDashboardList(status).catch(function (error) { showMessage(error.message, 'error'); });
      });
      card.addEventListener('keydown', function (event) {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          card.click();
        }
      });
    });

    byId('configLab').addEventListener('change', function () {
      renderLabConfig().catch(function (error) { showMessage(error.message, 'error'); });
    });
    byId('configProjectPercent').addEventListener('input', updateConfigPreview);
    byId('configClientPercent').addEventListener('input', updateConfigPreview);
    byId('configTests').addEventListener('input', updateConfigPreview);
    byId('saveLabConfigBtn').addEventListener('click', function () {
      saveLabConfig().catch(function (error) { showMessage(error.message, 'error'); });
    });

    byId('verifyLab').addEventListener('change', function () {
      loadVerifyQueue().catch(function (error) { showMessage(error.message, 'error'); });
    });
    byId('verifyPeriod').addEventListener('change', function () {
      loadVerifyQueue().catch(function (error) { showMessage(error.message, 'error'); });
    });
    byId('verifyStatus').addEventListener('change', function () {
      loadVerifyQueue().catch(function (error) { showMessage(error.message, 'error'); });
    });
    byId('verifyTable').addEventListener('change', function (event) {
      if (event.target.matches('.verify-check')) {
        state.selectedCodes[event.target.getAttribute('data-code')] = event.target.checked;
      }
    });
    byId('verifyTable').addEventListener('click', function (event) {
      var button = event.target.closest('[data-preview]');
      if (!button) return;
      var code = button.getAttribute('data-preview');
      var selected = selectedVerifyCodes();
      var codes = selected.length && selected.indexOf(code) !== -1 ? selected : [code];
      openPreviewModal(codes).catch(function (error) { showMessage(error.message, 'error'); });
    });
    byId('verifyOneBtn').addEventListener('click', function () {
      var codes = selectedVerifyCodes();
      if (codes.length !== 1) {
        showMessage('Select exactly one voucher to verify.', 'error');
        return;
      }
      review('verify', codes).catch(function (error) { showMessage(error.message, 'error'); });
    });
    byId('bulkVerifyBtn').addEventListener('click', function () {
      review('verify', selectedVerifyCodes()).catch(function (error) { showMessage(error.message, 'error'); });
    });
    byId('payOneBtn').addEventListener('click', function () {
      var codes = selectedVerifyCodes();
      if (codes.length !== 1) {
        showMessage('Select exactly one voucher to mark paid.', 'error');
        return;
      }
      review('pay', codes).catch(function (error) { showMessage(error.message, 'error'); });
    });
    byId('bulkPayBtn').addEventListener('click', function () {
      review('pay', selectedVerifyCodes()).catch(function (error) { showMessage(error.message, 'error'); });
    });
    byId('rejectOneBtn').addEventListener('click', function () {
      review('reject', selectedVerifyCodes()).catch(function (error) { showMessage(error.message, 'error'); });
    });
    document.querySelectorAll('[data-close-preview]').forEach(function (el) {
      el.addEventListener('click', closePreviewModal);
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && !byId('previewModal').hidden) closePreviewModal();
    });

    byId('openAllocationBtn').addEventListener('click', function () { byId('allocationFormCard').hidden = false; });
    byId('cancelAllocationBtn').addEventListener('click', function () { byId('allocationFormCard').hidden = true; });
    byId('allocationFormCard').addEventListener('submit', function (event) {
      saveAllocation(event).catch(function (error) { showMessage(error.message, 'error'); });
    });

    byId('editPoSignBtn').addEventListener('click', function () {
      setSignatureEditMode(true);
      if (state.poPad) state.poPad.clear();
    });
    byId('addPoSignBtn').addEventListener('click', function () {
      setSignatureEditMode(true);
      if (state.poPad) state.poPad.clear();
    });
    byId('cancelPoSignEditBtn').addEventListener('click', function () {
      if (state.poPad) state.poPad.clear();
      setSignatureEditMode(false);
    });
    byId('clearPoSignBtn').addEventListener('click', function () { if (state.poPad) state.poPad.clear(); });
    byId('savePoSettingsBtn').addEventListener('click', function () {
      savePoSettings().catch(function (error) { showMessage(error.message, 'error'); });
    });
  }

  async function refreshAll(options) {
    await loadProfiles();
    await loadAllocations();
    state.poSettings = await service().getPoSettings();
    renderPoSettingsUi();
    if (state.page === 'dashboard') await loadDashboardStats();
    if (state.page === 'verify') await loadVerifyQueue();
    if (state.page === 'labs') await renderLabConfig();
    if (!(options && options.silent)) showMessage('Program data refreshed.', 'success');
  }

  async function initialize(user) {
    state.currentUser = user;
    var profile = await firebase.firestore().collection('users').doc(user.uid).get();
    if (!profile.exists || normalizeKey(profile.data().role) !== 'program officer') {
      throw new Error('Active Program Officer access required.');
    }
    byId('signedInUser').textContent = profileName(Object.assign({ id: profile.id }, profile.data()));
    fillPeriodSelect(byId('dashPeriod'), 'all');
    fillPeriodSelect(byId('verifyPeriod'), 'all');
    byId('verifyStatus').value = 'redeemed';
    setNavCollapsed(false);
    await refreshAll({ silent: true });
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
