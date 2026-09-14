(function () {
  'use strict';

  var state = {
    user: null,
    profile: null,
    voucher: null,
    settings: null,
    stream: null,
    detector: null,
    scanFrame: null,
    clientPad: null,
    cashierPads: [],
    page: 'scan',
    dashStatus: '',
    lineBusy: false,
    toastTimer: null,
    loggingOut: false,
    previewSignatures: {},
    invoiceDate: '',
    patientNrc: '',
    patientAddress: ''
  };

  function el(id) { return document.getElementById(id); }
  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function money(value) { return Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 0 }) + ' MMK'; }
  function normalizedRole(role) { return String(role || '').trim().toLowerCase().replace(/\s+/g, ' '); }
  function assertOnline() {
    if (navigator.onLine === false) throw new Error('This laboratory page requires an internet connection.');
  }
  function service() { return window.VoucherService; }

  function todayInputValue() {
    var now = new Date();
    return now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' +
      String(now.getDate()).padStart(2, '0');
  }

  function formatInputDate(value) {
    if (!value) return window.VoucherInvoice.formatDate(new Date());
    return window.VoucherInvoice.formatDate(value);
  }

  function showToast(message, kind) {
    var toast = el('labToast');
    if (!toast) return;
    toast.hidden = false;
    toast.textContent = message;
    toast.className = 'lab-toast is-visible lab-toast-' + (kind || 'info');
    if (state.toastTimer) clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(function () {
      toast.classList.remove('is-visible');
      toast.hidden = true;
    }, 3200);
  }

  function setStatus(message, kind, options) {
    var opts = options || {};
    var box = el('pageStatus');
    var mode = kind || 'info';
    if (opts.toastOnly || mode === 'success' || mode === 'error' || mode === 'warning') {
      box.textContent = '';
      box.className = 'status-box lab-status-compact is-quiet';
      if (!state.loggingOut) showToast(message, mode === 'info' ? 'info' : mode);
      return;
    }
    box.textContent = message;
    box.className = 'status-box lab-status-compact ' + mode;
  }

  function showPage(page) {
    state.page = page;
    ['scan', 'dashboard', 'settings'].forEach(function (name) {
      el(name + 'Page').classList.toggle('d-none', name !== page);
    });
    document.querySelectorAll('[data-page]').forEach(function (button) {
      button.classList.toggle('is-active', button.getAttribute('data-page') === page);
    });
    el('labPageTitle').textContent = page === 'scan' ? 'Scan' : (page === 'dashboard' ? 'Dashboard' : 'Settings');
    document.body.classList.toggle('lab-has-floating', page === 'settings' || (page === 'scan' && !!state.voucher));
    if (page === 'dashboard') loadDashboard().catch(function (error) {
      if (!state.loggingOut) setStatus(error.message, 'error');
    });
    if (page === 'settings') renderSettings();
  }

  function parseCode(input) {
    var raw = String(input || '').trim();
    if (!raw) return '';
    if (raw.charAt(0) === '{') return service().parseQrPayload(raw);
    try {
      raw = new URL(raw).searchParams.get('code') || raw;
    } catch (error) {}
    return service().normalizeVoucherCode(raw);
  }

  function selectedIds() {
    return Array.from(document.querySelectorAll('#lineEditor input:checked')).map(function (input) {
      return input.value;
    });
  }

  function attachCatalog(voucher, catalogTests) {
    voucher.catalogTests = catalogTests || voucher.catalogTests || [];
    return voucher;
  }

  async function loadCatalogTests() {
    try {
      var catalog = await service().getAssignedPriceSheet(state.user.uid);
      return ((catalog && catalog.services) || []).map(function (row) {
        return { id: row.serviceId, name: row.serviceName };
      });
    } catch (error) {
      return [];
    }
  }

  function renderLineEditor(voucher) {
    var selected = {};
    (voucher.selectedServiceIds || []).forEach(function (id) { selected[id] = true; });
    var tests = voucher.catalogTests || [];
    if (!tests.length) {
      tests = (voucher.tests || voucher.lineItems || []).map(function (test) {
        return { id: test.id || test.serviceId, name: test.name || test.serviceName };
      });
    }
    var editable = voucher.status === 'issued';
    el('lineEditor').innerHTML = tests.map(function (test) {
      var id = test.id || test.serviceId;
      var checked = !!selected[id];
      return '<label class="lab-test-chip' + (checked ? ' is-selected' : '') + (editable ? '' : ' is-disabled') + '">' +
        '<input type="checkbox" value="' + escapeHtml(id) + '"' +
        (checked ? ' checked' : '') + (editable ? '' : ' disabled') + '>' +
        '<span>' + escapeHtml(test.name || test.serviceName) + '</span></label>';
    }).join('') || '<p class="text-muted mb-0">No laboratory tests are configured for this lab.</p>';
  }

  function cashierOptions() {
    var cashiers = (state.settings && state.settings.cashiers) || [];
    el('cashierSelect').innerHTML = cashiers.map(function (cashier, index) {
      return '<option value="' + index + '">' + escapeHtml(cashier.name || ('Cashier ' + (index + 1))) + '</option>';
    }).join('') || '<option value="0">Cashier 1</option>';
  }

  function syncPatientFields(voucher) {
    state.patientNrc = voucher.patientNrcSnapshot || '';
    state.patientAddress = voucher.patientAddressSnapshot || '';
    el('patientNrcInput').value = state.patientNrc;
    el('patientAddressInput').value = state.patientAddress;
    el('patientNrcInput').disabled = voucher.status !== 'issued';
    el('patientAddressInput').disabled = voucher.status !== 'issued';
    el('invoiceDateInput').disabled = false;
    if (!state.invoiceDate) {
      state.invoiceDate = todayInputValue();
      el('invoiceDateInput').value = state.invoiceDate;
    }
  }

  function extrasForVoucher(voucher, signatures) {
    var cashierIndex = Number(el('cashierSelect').value || 0);
    var cashier = ((state.settings && state.settings.cashiers) || [])[cashierIndex] || {};
    var invoiceDate = formatInputDate(state.invoiceDate || el('invoiceDateInput').value || todayInputValue());
    var nrc = state.patientNrc || voucher.patientNrcSnapshot || '';
    var address = state.patientAddress || voucher.patientAddressSnapshot || '';
    var signs = Object.assign({}, signatures || {}, state.previewSignatures || {});
    return {
      lab: {
        seal: signs.labSeal || (state.settings && state.settings.seal) || '',
        cashierSignature: signs.cashierSignature || cashier.signature || '',
        cashierName: voucher.cashierNameSnapshot || cashier.name || '',
        date: invoiceDate
      },
      client: {
        signature: signs.clientSignature || '',
        name: voucher.patientNameSnapshot,
        nrc: nrc,
        phone: voucher.patientPhoneSnapshot,
        address: address,
        date: invoiceDate
      },
      project: {}
    };
  }

  function renderInvoice(voucher, signatures) {
    var model = window.VoucherInvoice.modelFromVoucher(voucher, extrasForVoucher(voucher, signatures));
    model.date = formatInputDate(state.invoiceDate || el('invoiceDateInput').value || voucher.issuedAt);
    model.nrc = state.patientNrc || voucher.patientNrcSnapshot || '';
    model.address = state.patientAddress || voucher.patientAddressSnapshot || '';
    window.VoucherInvoice.render(el('invoiceMount'), model);
  }

  async function refreshInvoicePreview() {
    if (!state.voucher) return;
    var signatures = state.voucher.status === 'issued'
      ? state.previewSignatures
      : Object.assign({}, await service().getVoucherSignatures(state.voucher.code), state.previewSignatures);
    renderInvoice(state.voucher, signatures);
  }

  async function lookup(event) {
    if (event) event.preventDefault();
    try {
      assertOnline();
      var code = parseCode(el('voucherCodeInput').value);
      if (!code) throw new Error('Enter a voucher code.');
      setStatus('Looking up voucher…', 'info');
      var voucher = await service().lookupVoucher(code);
      if (voucher.labId && voucher.labId !== state.user.uid) {
        throw new Error('This voucher is assigned to another laboratory.');
      }
      var catalogTests = await loadCatalogTests();
      if (!catalogTests.length) {
        catalogTests = (voucher.tests || voucher.lineItems || []).map(function (row) {
          return { id: row.id || row.serviceId, name: row.name || row.serviceName };
        });
      }
      attachCatalog(voucher, catalogTests);
      state.voucher = voucher;
      state.previewSignatures = {};
      state.invoiceDate = todayInputValue();
      el('invoiceDateInput').value = state.invoiceDate;
      el('voucherCodeInput').value = voucher.code;
      renderLineEditor(voucher);
      cashierOptions();
      syncPatientFields(voucher);
      if (voucher.status === 'issued') {
        renderInvoice(voucher, {
          labSeal: (state.settings && state.settings.seal) || '',
          cashierSignature: (((state.settings && state.settings.cashiers) || [])[0] || {}).signature || ''
        });
      } else {
        var signatures = await service().getVoucherSignatures(voucher.code);
        renderInvoice(voucher, signatures);
      }
      el('lookupResult').classList.remove('d-none');
      el('confirmRedeem').disabled = voucher.status !== 'issued';
      document.body.classList.toggle('lab-has-floating', state.page === 'scan');
      setStatus(
        voucher.status === 'issued'
          ? 'Invoice loaded. Toggle tests, add NRC/address if needed, then apply the client signature.'
          : 'Voucher status: ' + voucher.status + '.',
        'success'
      );
    } catch (error) {
      state.voucher = null;
      el('lookupResult').classList.add('d-none');
      document.body.classList.remove('lab-has-floating');
      setStatus(error.message || 'Voucher lookup failed.', 'error');
    }
  }

  async function toggleLineItem(checkbox) {
    if (!state.voucher || state.voucher.status !== 'issued' || state.lineBusy) {
      if (state.lineBusy) checkbox.checked = !checkbox.checked;
      return;
    }
    var ids = selectedIds();
    if (!ids.length) {
      checkbox.checked = true;
      setStatus('Keep at least one test on the voucher.', 'warning');
      renderLineEditor(state.voucher);
      return;
    }
    state.lineBusy = true;
    el('lineEditor').classList.add('is-busy');
    try {
      assertOnline();
      var catalogTests = state.voucher.catalogTests || [];
      state.voucher = await service().updateIssuedLineItems(state.voucher.code, ids);
      attachCatalog(state.voucher, catalogTests);
      renderLineEditor(state.voucher);
      await refreshInvoicePreview();
      setStatus('Invoice tests updated.', 'success');
    } catch (error) {
      checkbox.checked = !checkbox.checked;
      renderLineEditor(state.voucher);
      setStatus(error.message || 'Could not update tests.', 'error');
    } finally {
      state.lineBusy = false;
      el('lineEditor').classList.remove('is-busy');
    }
  }

  async function savePatientDetailsIfNeeded() {
    if (!state.voucher || state.voucher.status !== 'issued') return;
    var nrc = el('patientNrcInput').value.trim();
    var address = el('patientAddressInput').value.trim();
    var prevNrc = state.voucher.patientNrcSnapshot || '';
    var prevAddress = state.voucher.patientAddressSnapshot || '';
    if (nrc === prevNrc && address === prevAddress) {
      state.patientNrc = nrc;
      state.patientAddress = address;
      return;
    }
    state.voucher = await service().updateIssuedPatientDetails(state.voucher.code, {
      nrc: nrc,
      address: address
    });
    state.patientNrc = state.voucher.patientNrcSnapshot || nrc;
    state.patientAddress = state.voucher.patientAddressSnapshot || address;
  }

  async function applyClientSignature() {
    if (!state.voucher) throw new Error('Look up a voucher first.');
    if (!state.clientPad || state.clientPad.isEmpty()) {
      throw new Error('Ask the patient to sign before applying it to the invoice.');
    }
    assertOnline();
    await savePatientDetailsIfNeeded();
    var clientSignature = await window.VoucherInvoice.compressImage(state.clientPad.toDataUrl(), 320, 140);
    var cashierIndex = Number(el('cashierSelect').value || 0);
    var cashier = ((state.settings && state.settings.cashiers) || [])[cashierIndex] || {};
    state.previewSignatures = {
      clientSignature: clientSignature,
      cashierSignature: cashier.signature || '',
      labSeal: (state.settings && state.settings.seal) || ''
    };
    await refreshInvoicePreview();
    setStatus('Client signature added to the invoice preview.', 'success');
  }

  async function redeem() {
    if (!state.voucher) throw new Error('Look up a voucher first.');
    if (!state.clientPad || state.clientPad.isEmpty()) throw new Error('Ask the patient to sign before redeeming.');
    assertOnline();
    await savePatientDetailsIfNeeded();
    var cashierIndex = Number(el('cashierSelect').value || 0);
    var cashier = ((state.settings && state.settings.cashiers) || [])[cashierIndex] || {};
    var clientSignature = await window.VoucherInvoice.compressImage(state.clientPad.toDataUrl(), 320, 140);
    await service().saveVoucherSignatures(state.voucher.code, {
      clientSignature: clientSignature,
      cashierSignature: cashier.signature || '',
      labSeal: (state.settings && state.settings.seal) || ''
    });
    state.voucher = await service().redeemVoucher(state.voucher.code, {
      labDisplayName: state.profile.displayName || state.profile.name || state.user.email,
      submissionReference: '',
      cashierIndex: cashierIndex,
      cashierName: cashier.name || '',
      labSealAttached: !!(state.settings && state.settings.seal),
      clientSigned: true
    });
    state.previewSignatures = {};
    renderLineEditor(state.voucher);
    syncPatientFields(state.voucher);
    renderInvoice(state.voucher, await service().getVoucherSignatures(state.voucher.code));
    el('confirmRedeem').disabled = true;
    setStatus('Voucher redeemed. Payment Made By (Project) is still empty for the Program Officer.', 'success');
  }

  async function scanLoop() {
    if (!state.stream || !state.detector) return;
    try {
      var video = el('cameraVideo');
      if (video.readyState >= 2) {
        var codes = await state.detector.detect(video);
        if (codes && codes.length) {
          var code = parseCode(codes[0].rawValue);
          if (code) {
            el('voucherCodeInput').value = code;
            stopCamera();
            await lookup();
            return;
          }
        }
      }
    } catch (error) {}
    state.scanFrame = requestAnimationFrame(scanLoop);
  }

  async function startCamera() {
    if (!('BarcodeDetector' in window)) {
      el('cameraUnsupported').classList.remove('d-none');
      return;
    }
    state.detector = new window.BarcodeDetector({ formats: ['qr_code'] });
    state.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' } },
      audio: false
    });
    el('cameraVideo').srcObject = state.stream;
    await el('cameraVideo').play();
    el('scanner').classList.remove('d-none');
    el('startCamera').classList.add('d-none');
    el('stopCamera').classList.remove('d-none');
    scanLoop();
  }

  function stopCamera() {
    if (state.scanFrame) cancelAnimationFrame(state.scanFrame);
    state.scanFrame = null;
    if (state.stream) state.stream.getTracks().forEach(function (track) { track.stop(); });
    state.stream = null;
    el('cameraVideo').srcObject = null;
    el('scanner').classList.add('d-none');
    el('startCamera').classList.remove('d-none');
    el('stopCamera').classList.add('d-none');
  }

  function fillPeriodOptions() {
    var select = el('labPeriod');
    var current = select.value || 'all';
    var options = ['<option value="all">All time</option>'];
    var now = new Date();
    for (var i = 0; i < 18; i += 1) {
      var date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      var value = date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0');
      var label = date.toLocaleString(undefined, { month: 'long', year: 'numeric' });
      options.push('<option value="' + value + '">' + escapeHtml(label) + '</option>');
    }
    select.innerHTML = options.join('');
    select.value = current;
    if (!select.value) select.value = 'all';
  }

  function periodDateRange(period) {
    if (!period || period === 'all') return null;
    var parts = String(period).split('-');
    var year = Number(parts[0]);
    var month = Number(parts[1]);
    if (!year || !month) return null;
    var start = new Date(year, month - 1, 1, 0, 0, 0, 0);
    var end = new Date(year, month, 0, 23, 59, 59, 999);
    return { startDate: start, endDate: end };
  }

  function projectAmountMajor(item) {
    if (item && item.totals && item.totals.projectContributionMinor != null) {
      return Number(item.totals.projectContributionMinor || 0) / 100;
    }
    if (item && item.lineItems && item.lineItems.length) {
      return item.lineItems.reduce(function (sum, row) {
        return sum + (Number(row.projectContributionMinor) || 0);
      }, 0) / 100;
    }
    if (item && item.tests && item.tests.length) {
      return item.tests.reduce(function (sum, row) {
        return sum + (Number(row.projectCostShare) || 0);
      }, 0);
    }
    if (item && item.projectContributionMinor != null) {
      return Number(item.projectContributionMinor || 0) / 100;
    }
    return 0;
  }

  async function loadDashboard() {
    var period = el('labPeriod').value || 'all';
    var stats = await service().getPeriodStats({ period: period, labId: state.user.uid });
    var row = stats[0] || { counts: {}, projectVerifiedMinor: 0, projectPaidMinor: 0 };
    var counts = row.counts || {};
    el('labIssued').textContent = counts.issued || 0;
    el('labRedeemed').textContent = counts.redeemed || 0;
    el('labIncomingCount').textContent = counts.verified || 0;
    el('labIncoming').textContent = money((row.projectVerifiedMinor || 0) / 100);
    el('labPaidCount').textContent = counts.paid || 0;
    el('labPaid').textContent = money((row.projectPaidMinor || 0) / 100);
    document.querySelectorAll('.lab-stat-tile').forEach(function (tile) {
      tile.classList.toggle('is-active', tile.getAttribute('data-status') === state.dashStatus);
    });
    var query = {
      labId: state.user.uid,
      status: state.dashStatus || undefined,
      pageSize: 50
    };
    var range = periodDateRange(period);
    if (range) {
      query.startDate = range.startDate;
      query.endDate = range.endDate;
      query.dateField = 'issuedAt';
    }
    var history = await service().queryVouchersPaged(query);
    el('labHistory').innerHTML =
      '<table class="table history-table lab-history-table">' +
      '<thead><tr><th>Code</th><th>Status</th><th>Midwife</th><th>Patient</th><th class="money">Amount</th></tr></thead><tbody>' +
      ((history.items || []).length
        ? (history.items || []).map(function (item) {
          return '<tr>' +
            '<td>' + escapeHtml(item.code || item.id) + '</td>' +
            '<td>' + escapeHtml(item.status || '') + '</td>' +
            '<td>' + escapeHtml(item.issuerNameSnapshot || '') + '</td>' +
            '<td>' + escapeHtml(item.patientNameSnapshot || '') + '</td>' +
            '<td class="money">' + escapeHtml(money(projectAmountMajor(item))) + '</td>' +
            '</tr>';
        }).join('')
        : '<tr><td colspan="5" class="text-muted">No vouchers for this filter.</td></tr>') +
      '</tbody></table>';
  }

  function updateSealPreview(dataUrl) {
    var preview = el('sealPreview');
    var empty = el('sealPreviewEmpty');
    if (dataUrl) {
      preview.src = dataUrl;
      preview.classList.remove('d-none');
      empty.classList.add('d-none');
    } else {
      preview.removeAttribute('src');
      preview.classList.add('d-none');
      empty.classList.remove('d-none');
    }
  }

  function renderSettings() {
    var settings = state.settings || {
      cashiers: [{ name: '', signature: '' }, { name: '', signature: '' }, { name: '', signature: '' }]
    };
    updateSealPreview(settings.seal || '');
    el('cashierFields').innerHTML = [0, 1, 2].map(function (index) {
      var cashier = (settings.cashiers || [])[index] || { name: '', signature: '' };
      return '<div class="lab-cashier-card">' +
        '<label class="form-label" for="cashierName' + index + '">Cashier ' + (index + 1) + ' name</label>' +
        '<input id="cashierName' + index + '" class="form-control form-control-lg cashier-name" data-index="' + index +
        '" value="' + escapeHtml(cashier.name || '') + '" autocomplete="name">' +
        '<label class="form-label mt-2">Signature</label>' +
        '<canvas class="sign-pad cashier-pad" data-index="' + index + '" width="640" height="180" aria-label="Cashier ' +
        (index + 1) + ' signature"></canvas>' +
        '<button type="button" class="btn btn-outline-secondary voucher-header-action mt-2 clear-cashier" data-index="' +
        index + '">Clear</button></div>';
    }).join('');
    state.cashierPads = Array.from(document.querySelectorAll('.cashier-pad')).map(function (canvas) {
      return window.VoucherInvoice.bindSignaturePad(canvas);
    });
  }

  async function saveSettings() {
    var sealFile = el('sealInput').files[0];
    var seal = state.settings && state.settings.seal || '';
    if (sealFile) {
      seal = await window.VoucherInvoice.compressImage(await window.VoucherInvoice.fileToDataUrl(sealFile), 240, 240);
    }
    var cashiers = [0, 1, 2].map(function (index) {
      var nameInput = document.querySelector('.cashier-name[data-index="' + index + '"]');
      var pad = state.cashierPads[index];
      var previous = ((state.settings && state.settings.cashiers) || [])[index] || {};
      return {
        name: nameInput ? nameInput.value.trim() : '',
        signature: pad && !pad.isEmpty() ? pad.toDataUrl() : (previous.signature || '')
      };
    });
    for (var index = 0; index < cashiers.length; index += 1) {
      if (cashiers[index].signature) {
        cashiers[index].signature = await window.VoucherInvoice.compressImage(cashiers[index].signature, 320, 140);
      }
    }
    state.settings = await service().saveLabSettings({
      labName: state.profile.displayName || state.profile.name || '',
      address: state.profile.address || '',
      seal: seal,
      cashiers: cashiers
    });
    updateSealPreview(state.settings.seal || seal || '');
    setStatus('Laboratory settings saved.', 'success');
  }

  async function logout() {
    state.loggingOut = true;
    stopCamera();
    try {
      await firebase.auth().signOut();
    } catch (error) {}
    sessionStorage.clear();
    ['role', 'userEmail', 'userId'].forEach(function (key) { localStorage.removeItem(key); });
    window.location.replace('login.html');
  }

  async function initialize(user) {
    if (state.loggingOut) return;
    assertOnline();
    state.user = user;
    var profileDoc = await firebase.firestore().collection('users').doc(user.uid).get();
    if (!profileDoc.exists) throw new Error('Lab account profile not found.');
    state.profile = profileDoc.data() || {};
    if (normalizedRole(state.profile.role) !== 'lab' || state.profile.active === false || state.profile.approved === false) {
      el('accessDeniedMessage').textContent = 'A Lab account is required.';
      el('accessDenied').classList.remove('d-none');
      return;
    }
    state.settings = await service().getLabSettings(user.uid);
    state.clientPad = window.VoucherInvoice.bindSignaturePad(el('clientPad'));
    fillPeriodOptions();
    el('labPeriod').value = 'all';
    el('invoiceDateInput').value = todayInputValue();
    state.invoiceDate = el('invoiceDateInput').value;
    el('labApp').classList.remove('d-none');
    if (!('BarcodeDetector' in window)) el('cameraUnsupported').classList.remove('d-none');
    showPage('scan');
    var initialCode = parseCode(new URLSearchParams(window.location.search).get('code'));
    if (initialCode) {
      el('voucherCodeInput').value = initialCode;
      await lookup();
    } else {
      setStatus('Authenticated as ' + (state.profile.displayName || user.email) + '.', 'info');
    }
  }

  document.querySelectorAll('[data-page]').forEach(function (button) {
    button.addEventListener('click', function () { showPage(button.getAttribute('data-page')); });
  });
  el('homeBtn').addEventListener('click', function () { showPage('scan'); });
  el('lookupForm').addEventListener('submit', lookup);
  el('lineEditor').addEventListener('change', function (event) {
    var input = event.target.closest('input[type="checkbox"]');
    if (!input) return;
    toggleLineItem(input);
  });
  el('confirmRedeem').addEventListener('click', function () {
    redeem().catch(function (error) { if (!state.loggingOut) setStatus(error.message, 'error'); });
  });
  el('applyClientSign').addEventListener('click', function () {
    applyClientSignature().catch(function (error) { setStatus(error.message, 'error'); });
  });
  el('clearClientSign').addEventListener('click', function () {
    if (state.clientPad) state.clientPad.clear();
    if (state.previewSignatures) delete state.previewSignatures.clientSignature;
    refreshInvoicePreview().catch(function () {});
  });
  el('cashierSelect').addEventListener('change', function () {
    var cashierIndex = Number(el('cashierSelect').value || 0);
    var cashier = ((state.settings && state.settings.cashiers) || [])[cashierIndex] || {};
    state.previewSignatures = Object.assign({}, state.previewSignatures, {
      cashierSignature: cashier.signature || '',
      labSeal: (state.settings && state.settings.seal) || ''
    });
    refreshInvoicePreview().catch(function (error) { setStatus(error.message, 'error'); });
  });
  el('invoiceDateInput').addEventListener('change', function () {
    state.invoiceDate = el('invoiceDateInput').value || todayInputValue();
    refreshInvoicePreview().catch(function () {});
  });
  el('patientNrcInput').addEventListener('change', function () {
    state.patientNrc = el('patientNrcInput').value.trim();
    refreshInvoicePreview().catch(function () {});
  });
  el('patientAddressInput').addEventListener('change', function () {
    state.patientAddress = el('patientAddressInput').value.trim();
    refreshInvoicePreview().catch(function () {});
  });
  el('startCamera').addEventListener('click', function () {
    startCamera().catch(function (error) { setStatus(error.message, 'warning'); });
  });
  el('stopCamera').addEventListener('click', stopCamera);
  el('saveSettingsBtn').addEventListener('click', function () {
    saveSettings().catch(function (error) { setStatus(error.message, 'error'); });
  });
  el('labPeriod').addEventListener('change', function () {
    loadDashboard().catch(function (error) { setStatus(error.message, 'error'); });
  });
  el('labStatTiles').addEventListener('click', function (event) {
    var tile = event.target.closest('[data-status]');
    if (!tile) return;
    var next = tile.getAttribute('data-status');
    state.dashStatus = state.dashStatus === next ? '' : next;
    loadDashboard().catch(function (error) { setStatus(error.message, 'error'); });
  });
  el('cashierFields').addEventListener('click', function (event) {
    var button = event.target.closest('.clear-cashier');
    if (!button) return;
    var pad = state.cashierPads[Number(button.getAttribute('data-index'))];
    if (pad) pad.clear();
  });
  el('sealInput').addEventListener('change', function () {
    var file = el('sealInput').files[0];
    if (!file) return;
    window.VoucherInvoice.fileToDataUrl(file).then(function (dataUrl) {
      updateSealPreview(dataUrl);
    }).catch(function (error) {
      setStatus(error.message || 'Could not preview seal.', 'error');
    });
  });
  el('logoutBtn').addEventListener('click', function () {
    logout().catch(function () { window.location.replace('login.html'); });
  });
  window.addEventListener('beforeunload', stopCamera);

  firebase.auth().onAuthStateChanged(function (user) {
    if (state.loggingOut) {
      window.location.replace('login.html');
      return;
    }
    if (!user) {
      window.location.replace('login.html');
      return;
    }
    initialize(user).catch(function (error) {
      if (state.loggingOut) return;
      el('labApp').classList.remove('d-none');
      setStatus(error.message || 'Could not initialize laboratory vouchers.', 'error');
    });
  });
})();
