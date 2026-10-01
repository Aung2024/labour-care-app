(function () {
  'use strict';

  var state = {
    user: null,
    items: []
  };

  function el(id) { return document.getElementById(id); }
  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function money(value) {
    return Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 0 }) + ' MMK';
  }
  function service() { return window.VoucherService; }
  function setStatus(message, kind) {
    var box = el('pageStatus');
    box.textContent = message;
    box.className = 'status-box ' + (kind || 'info');
  }

  function formatIssuedDate(value) {
    if (!value) return '—';
    var date = value.toDate ? value.toDate() : new Date(value);
    if (isNaN(date.getTime())) return '—';
    return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function issuedDayKey(value) {
    if (!value) return '';
    var date = value.toDate ? value.toDate() : new Date(value);
    if (isNaN(date.getTime())) return '';
    return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' +
      String(date.getDate()).padStart(2, '0');
  }

  function issuedMonthKey(value) {
    return issuedDayKey(value).slice(0, 7);
  }

  function shareMajor(row, field) {
    var totals = row.totals || {};
    if (field === 'client') return Number(totals.clientCopayMinor || 0) / 100;
    return Number(totals.projectContributionMinor || 0) / 100;
  }

  function fillMonthOptions(items) {
    var select = el('filterMonth');
    var previous = select.value || 'all';
    var months = {};
    (items || []).forEach(function (row) {
      var key = issuedMonthKey(row.issuedAt);
      if (key) months[key] = true;
    });
    var keys = Object.keys(months).sort().reverse();
    select.innerHTML = '<option value="all">All months</option>' + keys.map(function (key) {
      var parts = key.split('-');
      var label = new Date(Number(parts[0]), Number(parts[1]) - 1, 1)
        .toLocaleString(undefined, { month: 'long', year: 'numeric' });
      return '<option value="' + escapeHtml(key) + '">' + escapeHtml(label) + '</option>';
    }).join('');
    select.value = previous;
    if (!select.value) select.value = 'all';
  }

  function filteredItems() {
    var date = el('filterDate').value;
    var month = el('filterMonth').value;
    var status = el('filterStatus').value;
    return state.items.filter(function (row) {
      if (status && status !== 'all' && String(row.status || '') !== status) return false;
      if (date && issuedDayKey(row.issuedAt) !== date) return false;
      if (!date && month && month !== 'all' && issuedMonthKey(row.issuedAt) !== month) return false;
      return true;
    });
  }

  function renderList() {
    var items = filteredItems();
    if (!items.length) {
      el('voucherList').innerHTML = '<div class="mw-status-empty">No QR vouchers match these filters.</div>';
      return;
    }
    el('voucherList').innerHTML = items.map(function (row, index) {
      return '<article class="mw-status-card">' +
        '<div class="mw-status-card__qr" id="mwQr' + index + '" aria-label="QR for ' +
        escapeHtml(row.code || '') + '"></div>' +
        '<div class="mw-status-card__body">' +
        '<div class="mw-status-card__code">' + escapeHtml(row.code || row.id) + '</div>' +
        '<div class="mw-status-card__meta">' + escapeHtml(formatIssuedDate(row.issuedAt)) +
        ' · ' + escapeHtml(row.status || 'issued') + '</div>' +
        '<div class="mw-status-card__name">' + escapeHtml(row.patientNameSnapshot || '—') + '</div>' +
        '<div class="mw-status-card__money">Client ' + escapeHtml(money(shareMajor(row, 'client'))) + '</div>' +
        '<div class="mw-status-card__money">Project ' + escapeHtml(money(shareMajor(row, 'project'))) + '</div>' +
        '</div></article>';
    }).join('');
    items.forEach(function (row, index) {
      var mount = document.getElementById('mwQr' + index);
      if (!mount || typeof window.QRCode !== 'function') return;
      try {
        new window.QRCode(mount, {
          text: service().buildQrPayload(row.code || row.id),
          width: 88,
          height: 88,
          correctLevel: window.QRCode.CorrectLevel.M
        });
      } catch (error) {}
    });
  }

  async function loadVouchers() {
    var result = await service().queryVouchersPaged({
      midwifeId: state.user.uid,
      status: 'all',
      dateField: 'issuedAt',
      pageSize: 400
    });
    state.items = result.items || [];
    fillMonthOptions(state.items);
    renderList();
    setStatus(state.items.length ? 'Showing issued QR vouchers.' : 'No QR vouchers have been generated yet.', 'info');
  }

  async function initialize(user) {
    state.user = user;
    var patientId = sessionStorage.getItem('selectedPatientId') || '';
    el('backLink').href = patientId
      ? 'antenatal-tests.html?patient=' + encodeURIComponent(patientId)
      : 'antenatal-tests.html';
    await loadVouchers();
  }

  el('filterDate').addEventListener('change', renderList);
  el('filterMonth').addEventListener('change', renderList);
  el('filterStatus').addEventListener('change', renderList);

  firebase.auth().onAuthStateChanged(function (user) {
    if (!user) {
      window.location.replace('login.html?redirect=' + encodeURIComponent(window.location.pathname));
      return;
    }
    initialize(user).catch(function (error) {
      setStatus(error.message || 'Could not load QR vouchers.', 'error');
    });
  });
})();
