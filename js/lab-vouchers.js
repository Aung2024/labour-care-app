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
    scanTimer: null,
    scanCanvas: null,
    clientPad: null,
    cashierPads: [],
    page: 'scan',
    dashStatus: 'total',
    lineBusy: false,
    toastTimer: null,
    loggingOut: false,
    previewSignatures: {},
    invoiceDate: '',
    patientNrc: '',
    patientAddress: '',
    clearSealImage: false,
    clearPaymentQr: false,
    issuedServiceIds: [],
    outcomeRows: [],
    outcomeReports: [],
    dashItems: []
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
    ['scan', 'dashboard', 'outcomes', 'settings'].forEach(function (name) {
      el(name + 'Page').classList.toggle('d-none', name !== page);
    });
    document.querySelectorAll('[data-page]').forEach(function (button) {
      button.classList.toggle('is-active', button.getAttribute('data-page') === page);
    });
    var titles = { scan: 'Scan', dashboard: 'Dashboard', outcomes: 'Outcome report', settings: 'Settings' };
    el('labPageTitle').textContent = titles[page] || 'Laboratory';
    document.body.classList.toggle('lab-has-floating', page === 'settings' || (page === 'scan' && !!state.voucher));
    if (page === 'dashboard') loadDashboard().catch(function (error) {
      if (!state.loggingOut) setStatus(error.message, 'error');
    });
    if (page === 'outcomes') loadOutcomeReport().catch(function (error) {
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

  function allowedVoucherTests(voucher) {
    var allowedIds = (state.issuedServiceIds && state.issuedServiceIds.length)
      ? state.issuedServiceIds
      : ((voucher.issuedServiceIds && voucher.issuedServiceIds.length)
        ? voucher.issuedServiceIds
        : (voucher.selectedServiceIds || []));
    var named = {};
    ((voucher.catalogTests || []).concat(voucher.lineItems || [], voucher.tests || [])).forEach(function (test) {
      var id = test.id || test.serviceId;
      if (id) named[id] = test.name || test.serviceName || id;
    });
    return allowedIds.map(function (id) {
      return { id: id, name: named[id] || id };
    });
  }

  function renderLineEditor(voucher) {
    var selected = {};
    (voucher.selectedServiceIds || []).forEach(function (id) { selected[id] = true; });
    var tests = allowedVoucherTests(voucher);
    var editable = voucher.status === 'issued';
    el('lineEditor').innerHTML = tests.map(function (test) {
      var id = test.id || test.serviceId;
      var checked = !!selected[id];
      return '<label class="lab-test-chip' + (checked ? ' is-selected' : '') + (editable ? '' : ' is-disabled') + '">' +
        '<input type="checkbox" value="' + escapeHtml(id) + '"' +
        (checked ? ' checked' : '') + (editable ? '' : ' disabled') + '>' +
        '<span>' + escapeHtml(test.name || test.serviceName) + '</span></label>';
    }).join('') || '<p class="text-muted mb-0">No midwife-selected tests are on this voucher.</p>';
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
    var settings = state.settings || {};
    return {
      lab: {
        seal: signs.labSeal || settings.seal || '',
        name: settings.labName || voucher.labNameSnapshot || '',
        address: settings.address || '',
        phone: settings.phone || '',
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

  function hasLabSeal() {
    var settings = state.settings || {};
    return !!(settings.seal || settings.labName || settings.address || settings.phone);
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
      state.issuedServiceIds = (voucher.issuedServiceIds && voucher.issuedServiceIds.length)
        ? voucher.issuedServiceIds.slice()
        : (voucher.selectedServiceIds || []).slice();
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
    setRedeemBusy(true);
    try {
      await savePatientDetailsIfNeeded();
      var cashierIndex = Number(el('cashierSelect').value || 0);
      var cashier = ((state.settings && state.settings.cashiers) || [])[cashierIndex] || {};
      var clientSignature = await window.VoucherInvoice.compressImage(state.clientPad.toDataUrl(), 320, 140);
      await service().saveVoucherSignatures(state.voucher.code, {
        clientSignature: clientSignature,
        cashierSignature: cashier.signature || '',
        labSeal: (state.settings && state.settings.seal) || ''
      });
      await service().redeemVoucher(state.voucher.code, {
        labDisplayName: state.profile.displayName || state.profile.name || state.user.email,
        submissionReference: '',
        cashierIndex: cashierIndex,
        cashierName: cashier.name || '',
        labSealAttached: hasLabSeal(),
        clientSigned: true
      });
      resetScanPage();
      setStatus('Voucher redeemed. Ready for the next scan or lookup.', 'success');
    } finally {
      setRedeemBusy(false);
    }
  }

  function setRedeemBusy(busy) {
    var button = el('confirmRedeem');
    if (!button) return;
    button.classList.toggle('is-busy', !!busy);
    button.disabled = !!busy || !(state.voucher && state.voucher.status === 'issued');
    var idle = button.querySelector('.lab-redeem-idle');
    var working = button.querySelector('.lab-redeem-busy');
    if (idle) idle.classList.toggle('d-none', !!busy);
    if (working) {
      working.classList.toggle('d-none', !busy);
      working.setAttribute('aria-hidden', busy ? 'false' : 'true');
    }
    if (busy) button.setAttribute('aria-busy', 'true');
    else button.removeAttribute('aria-busy');
  }

  function resetScanPage() {
    stopCamera();
    state.voucher = null;
    state.previewSignatures = {};
    state.patientNrc = '';
    state.patientAddress = '';
    state.invoiceDate = todayInputValue();
    state.issuedServiceIds = [];
    el('voucherCodeInput').value = '';
    el('invoiceDateInput').value = state.invoiceDate;
    el('patientNrcInput').value = '';
    el('patientAddressInput').value = '';
    el('invoiceMount').innerHTML = '';
    el('lineEditor').innerHTML = '';
    if (state.clientPad) state.clientPad.clear();
    el('lookupResult').classList.add('d-none');
    el('confirmRedeem').disabled = true;
    document.body.classList.remove('lab-has-floating');
    el('voucherCodeInput').focus();
  }

  function cameraErrorMessage(error) {
    var name = error && error.name;
    if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
      return 'Camera permission was denied. Allow Camera for Safari in Settings, or use Scan from photo.';
    }
    if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
      return 'No camera was found. Use Scan from photo or enter the voucher code.';
    }
    if (name === 'NotReadableError' || name === 'TrackStartError') {
      return 'The camera is in use by another app. Close it and try again, or use Scan from photo.';
    }
    if (name === 'SecurityError' || !window.isSecureContext) {
      return 'iPhone and iPad need https to open the live camera. Use Scan from photo or open the https site.';
    }
    return (error && error.message) || 'Could not open the camera. Use Scan from photo or enter the code.';
  }

  async function openCameraStream() {
    if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
      throw new Error('This browser cannot open the live camera. Use Scan from photo or enter the code.');
    }
    if (!window.isSecureContext) {
      throw new Error('iPhone and iPad need https to open the live camera. Use Scan from photo or open the https site.');
    }
    var attempts = [
      { video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false },
      { video: { facingMode: 'environment' }, audio: false },
      { video: true, audio: false }
    ];
    var lastError = null;
    for (var index = 0; index < attempts.length; index += 1) {
      try {
        return await navigator.mediaDevices.getUserMedia(attempts[index]);
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError || new Error('Could not open the camera.');
  }

  function prepareScanCanvas(width, height) {
    var canvas = state.scanCanvas || document.createElement('canvas');
    state.scanCanvas = canvas;
    canvas.width = width;
    canvas.height = height;
    return canvas.getContext('2d', { willReadFrequently: true });
  }

  function decodeQrFromImageData(image) {
    if (!image || typeof window.jsQR !== 'function') return '';
    var result = window.jsQR(image.data, image.width, image.height, { inversionAttempts: 'attemptBoth' });
    return result && result.data ? result.data : '';
  }

  function decodeQrFromVideo(video) {
    var vw = video.videoWidth;
    var vh = video.videoHeight;
    if (!vw || !vh) return '';
    var max = 640;
    var scale = Math.min(1, max / Math.max(vw, vh));
    var width = Math.max(1, Math.round(vw * scale));
    var height = Math.max(1, Math.round(vh * scale));
    var ctx = prepareScanCanvas(width, height);
    ctx.drawImage(video, 0, 0, width, height);
    return decodeQrFromImageData(ctx.getImageData(0, 0, width, height));
  }

  function decodeQrFromImage(image) {
    var max = 1000;
    var scale = Math.min(1, max / Math.max(image.width, image.height));
    var width = Math.max(1, Math.round(image.width * scale));
    var height = Math.max(1, Math.round(image.height * scale));
    var angles = [0, 90, 180, 270];
    for (var index = 0; index < angles.length; index += 1) {
      var angle = angles[index];
      var rotated = angle === 90 || angle === 270;
      var canvasWidth = rotated ? height : width;
      var canvasHeight = rotated ? width : height;
      var ctx = prepareScanCanvas(canvasWidth, canvasHeight);
      ctx.save();
      ctx.translate(canvasWidth / 2, canvasHeight / 2);
      ctx.rotate(angle * Math.PI / 180);
      ctx.drawImage(image, -width / 2, -height / 2, width, height);
      ctx.restore();
      var raw = decodeQrFromImageData(ctx.getImageData(0, 0, canvasWidth, canvasHeight));
      if (raw) return raw;
    }
    return '';
  }

  async function applyScannedValue(raw) {
    var code = parseCode(raw);
    if (!code) return false;
    el('voucherCodeInput').value = code;
    stopCamera();
    await lookup();
    return true;
  }

  async function scanLoop() {
    if (!state.stream) return;
    try {
      var video = el('cameraVideo');
      if (video.readyState >= 2) {
        var raw = '';
        if (state.detector) {
          var codes = await state.detector.detect(video);
          raw = codes && codes[0] ? codes[0].rawValue : '';
        }
        if (!raw) raw = decodeQrFromVideo(video);
        if (await applyScannedValue(raw)) return;
      }
    } catch (error) {}
    scheduleScan();
  }

  function scheduleScan() {
    if (state.detector) {
      state.scanFrame = requestAnimationFrame(scanLoop);
      return;
    }
    state.scanTimer = window.setTimeout(scanLoop, 140);
  }

  async function startCamera() {
    el('cameraUnsupported').classList.add('d-none');
    stopCamera();
    if ('BarcodeDetector' in window) {
      try {
        state.detector = new window.BarcodeDetector({ formats: ['qr_code'] });
      } catch (error) {
        state.detector = null;
      }
    } else {
      state.detector = null;
    }
    if (!state.detector && typeof window.jsQR !== 'function') {
      el('cameraUnsupported').classList.remove('d-none');
      throw new Error('QR scanning is not available. Use Scan from photo or enter the voucher code.');
    }
    try {
      state.stream = await openCameraStream();
    } catch (error) {
      el('cameraUnsupported').classList.remove('d-none');
      throw new Error(cameraErrorMessage(error));
    }
    var video = el('cameraVideo');
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');
    video.muted = true;
    video.autoplay = true;
    video.srcObject = state.stream;
    try {
      await video.play();
    } catch (error) {
      stopCamera();
      el('cameraUnsupported').classList.remove('d-none');
      throw new Error(cameraErrorMessage(error));
    }
    el('scanner').classList.remove('d-none');
    el('startCamera').classList.add('d-none');
    el('stopCamera').classList.remove('d-none');
    scheduleScan();
  }

  function stopCamera() {
    if (state.scanFrame) cancelAnimationFrame(state.scanFrame);
    if (state.scanTimer) window.clearTimeout(state.scanTimer);
    state.scanFrame = null;
    state.scanTimer = null;
    if (state.stream) state.stream.getTracks().forEach(function (track) { track.stop(); });
    state.stream = null;
    var video = el('cameraVideo');
    if (video) video.srcObject = null;
    el('scanner').classList.add('d-none');
    el('startCamera').classList.remove('d-none');
    el('stopCamera').classList.add('d-none');
  }

  function handleScanPhoto() {
    var input = el('scanPhotoInput');
    if (!input) return;
    input.value = '';
    input.click();
  }

  async function decodeScanPhoto(file) {
    if (!file) return;
    if (typeof window.jsQR !== 'function') {
      throw new Error('QR photo scanning is not available. Enter the voucher code.');
    }
    var objectUrl = URL.createObjectURL(file);
    try {
      var image = await new Promise(function (resolve, reject) {
        var node = new Image();
        node.onload = function () { resolve(node); };
        node.onerror = function () { reject(new Error('Could not read that photo.')); };
        node.src = objectUrl;
      });
      var raw = decodeQrFromImage(image);
      if (!(await applyScannedValue(raw))) {
        throw new Error('No voucher QR was found in that photo. Try again closer to the code.');
      }
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  function fillYearOptions(select, includeAll) {
    var previous = select.value;
    var now = new Date();
    var options = includeAll ? ['<option value="all">All years</option>'] : [];
    for (var year = now.getFullYear(); year >= now.getFullYear() - 5; year -= 1) {
      options.push('<option value="' + year + '">' + year + '</option>');
    }
    select.innerHTML = options.join('');
    if (previous && Array.from(select.options).some(function (opt) { return opt.value === previous; })) {
      select.value = previous;
    } else if (!includeAll) {
      select.value = String(now.getFullYear());
    }
  }

  function fillMonthOptions(select, includeAll) {
    var previous = select.value;
    var options = includeAll ? ['<option value="all">All months</option>'] : [];
    for (var month = 1; month <= 12; month += 1) {
      var label = window.VoucherPricing.monthLabel(month);
      options.push('<option value="' + month + '">' + escapeHtml(label) + '</option>');
    }
    select.innerHTML = options.join('');
    if (previous && Array.from(select.options).some(function (opt) { return opt.value === previous; })) {
      select.value = previous;
    } else if (!includeAll) {
      select.value = String(new Date().getMonth() + 1);
    }
  }

  function selectedBillingRange(yearSelect, monthSelect) {
    var year = yearSelect && yearSelect.value;
    var month = monthSelect && monthSelect.value;
    if (year && year !== 'all' && month && month !== 'all') {
      return window.VoucherPricing.billingPeriodRange(year, month);
    }
    if (year && year !== 'all') return window.VoucherPricing.billingYearRange(year);
    if (month && month !== 'all') return { monthOnly: Number(month) };
    return null;
  }

  function periodHint(range) {
    if (!range) return 'Showing all redeemed dates.';
    if (range.monthOnly) {
      return window.VoucherPricing.monthLabel(range.monthOnly) +
        ' is the 21st of the previous month through the 20th, for every year.';
    }
    var start = range.startDate.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
    var end = range.endDate.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
    if (!range.month) return range.year + ' is ' + start + ' to ' + end + '.';
    return window.VoucherPricing.monthLabel(range.month) + ' is ' + start + ' to ' + end + '.';
  }

  function voucherRedeemedDate(row) {
    var value = row && row.redeemedAt;
    if (!value) return null;
    if (typeof value.toDate === 'function') return value.toDate();
    var date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function itemMatchesDashRange(row, range) {
    if (!range) return true;
    var date = voucherRedeemedDate(row);
    if (!date) return false;
    if (range.startDate && range.endDate) {
      return date.getTime() >= range.startDate.getTime() && date.getTime() <= range.endDate.getTime();
    }
    if (range.monthOnly) {
      return window.VoucherPricing.billingMonthOf(date) === range.monthOnly;
    }
    return true;
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

  function breakdownText(bucket) {
    var client = (bucket && bucket.clientMinor || 0) / 100;
    var project = (bucket && bucket.projectMinor || 0) / 100;
    return 'Client = ' + money(client) + '\nProject = ' + money(project);
  }

  function voucherTotalMajor(item) {
    var totals = (item && item.totals) || {};
    var client = Number(totals.clientCopayMinor);
    var project = Number(totals.projectContributionMinor);
    if (Number.isFinite(client) && Number.isFinite(project)) return (client + project) / 100;
    return projectAmountMajor(item);
  }

  async function loadDashboard() {
    var range = selectedBillingRange(el('labYear'), el('labMonth'));
    if (el('labPeriodHint')) el('labPeriodHint').textContent = periodHint(range);
    var query = { labId: state.user.uid };
    if (range && range.startDate && range.endDate) {
      query.startDate = range.startDate;
      query.endDate = range.endDate;
    }
    var summary = await service().queryRedeemedLabVouchers(query);
    var items = (summary.items || []).filter(function (row) {
      return itemMatchesDashRange(row, range);
    });
    summary = service().summarizeVoucherItems
      ? service().summarizeVoucherItems(items)
      : summary;
    var byStatus = summary.byStatus || {};
    var redeemed = byStatus.redeemed || { count: 0, clientMinor: 0, projectMinor: 0 };
    var verified = byStatus.verified || { count: 0, clientMinor: 0, projectMinor: 0 };
    var paid = byStatus.paid || { count: 0, clientMinor: 0, projectMinor: 0 };
    var totalCount = redeemed.count + verified.count + paid.count;
    el('labTotalCount').textContent = totalCount;
    el('labRedeemed').textContent = redeemed.count;
    el('labRedeemedMoney').textContent = money((redeemed.projectMinor + redeemed.clientMinor) / 100);
    el('labRedeemedBreak').textContent = breakdownText(redeemed);
    el('labIncomingCount').textContent = verified.count;
    el('labIncoming').textContent = money((verified.clientMinor + verified.projectMinor) / 100);
    el('labIncomingBreak').textContent = breakdownText(verified);
    el('labPaidCount').textContent = paid.count;
    el('labPaid').textContent = money((paid.clientMinor + paid.projectMinor) / 100);
    el('labPaidBreak').textContent = breakdownText(paid);

    if (!state.dashStatus) state.dashStatus = 'total';
    document.querySelectorAll('.lab-stat-tile').forEach(function (tile) {
      tile.classList.toggle('is-active', tile.getAttribute('data-status') === state.dashStatus);
    });
    var tableItems = summary.items || items;
    if (state.dashStatus && state.dashStatus !== 'total') {
      tableItems = tableItems.filter(function (item) { return item.status === state.dashStatus; });
    }
    state.dashItems = tableItems;
    renderDashboardTable();
  }

  function dashboardSearchQuery() {
    return String((el('labDashSearch') && el('labDashSearch').value) || '').trim().toLowerCase();
  }

  function matchesDashSearch(item, query) {
    if (!query) return true;
    var compactQuery = query.replace(/[-\s]/g, '');
    var code = String(item.code || item.id || '').toLowerCase();
    var compactCode = code.replace(/-/g, '');
    var name = String(item.patientNameSnapshot || '').toLowerCase();
    return code.indexOf(query) !== -1 || compactCode.indexOf(compactQuery) !== -1 ||
      name.indexOf(query) !== -1;
  }

  function renderDashboardTable() {
    var query = dashboardSearchQuery();
    var items = (state.dashItems || []).filter(function (item) {
      return matchesDashSearch(item, query);
    });
    el('labHistory').innerHTML =
      '<table class="table history-table lab-history-table">' +
      '<thead><tr><th>Code</th><th>Status</th><th>Midwife</th><th>Patient</th><th class="money">Amount</th></tr></thead><tbody>' +
      (items.length
        ? items.map(function (item) {
          var code = item.code || item.id || '';
          return '<tr class="lab-history-row" data-code="' + escapeHtml(code) +
            '" tabindex="0" role="link" aria-label="Open voucher ' + escapeHtml(code) + '">' +
            '<td>' + escapeHtml(code) + '</td>' +
            '<td>' + escapeHtml(item.status || '') + '</td>' +
            '<td>' + escapeHtml(item.issuerNameSnapshot || '') + '</td>' +
            '<td>' + escapeHtml(item.patientNameSnapshot || '') + '</td>' +
            '<td class="money">' + escapeHtml(money(voucherTotalMajor(item))) + '</td>' +
            '</tr>';
        }).join('')
        : '<tr><td colspan="5" class="text-muted">' +
          (query ? 'No vouchers match this search.' : 'No vouchers for this filter.') +
          '</td></tr>') +
      '</tbody></table>';
  }

  function extrasFromStoredVoucher(voucher, signatures) {
    var settings = state.settings || {};
    var signs = signatures || {};
    var invoiceDate = window.VoucherInvoice.formatDate(voucher.redeemedAt || voucher.issuedAt);
    return {
      lab: {
        seal: signs.labSeal || settings.seal || '',
        name: settings.labName || voucher.labNameSnapshot || '',
        address: settings.address || '',
        phone: settings.phone || '',
        cashierSignature: signs.cashierSignature || '',
        cashierName: voucher.cashierNameSnapshot || '',
        date: invoiceDate
      },
      client: {
        signature: signs.clientSignature || '',
        name: voucher.patientNameSnapshot,
        nrc: voucher.patientNrcSnapshot || '',
        phone: voucher.patientPhoneSnapshot,
        address: voucher.patientAddressSnapshot || '',
        date: invoiceDate
      },
      project: {}
    };
  }

  function closeLabPreview() {
    var modal = el('labPreviewModal');
    if (modal) modal.hidden = true;
    if (el('labPreviewBody')) el('labPreviewBody').innerHTML = '';
    document.body.classList.remove('lab-modal-open');
  }

  async function openDashboardVoucher(code) {
    if (!code) return;
    var modal = el('labPreviewModal');
    var body = el('labPreviewBody');
    var title = el('labPreviewTitle');
    if (!modal || !body) return;
    body.innerHTML = '<p class="lab-hint mb-0">Loading voucher…</p>';
    if (title) title.textContent = code;
    modal.hidden = false;
    document.body.classList.add('lab-modal-open');
    try {
      assertOnline();
      var voucher = await service().lookupVoucher(code);
      if (voucher.labId && voucher.labId !== state.user.uid) {
        throw new Error('This voucher is assigned to another laboratory.');
      }
      var signatures = {};
      try {
        signatures = await service().getVoucherSignatures(voucher.code || code);
      } catch (error) {}
      if (title) title.textContent = (voucher.code || code) + ' · ' + (voucher.status || '');
      var mount = document.createElement('div');
      mount.className = 'invoice-preview';
      body.innerHTML = '';
      body.appendChild(mount);
      var model = window.VoucherInvoice.modelFromVoucher(voucher, extrasFromStoredVoucher(voucher, signatures));
      model.date = window.VoucherInvoice.formatDate(voucher.redeemedAt || voucher.issuedAt);
      window.VoucherInvoice.render(mount, model);
    } catch (error) {
      body.innerHTML = '<p class="text-muted mb-0">' + escapeHtml(error.message || 'Could not open that voucher.') + '</p>';
    }
  }

  function printInvoiceFrom(root) {
    var sheet = root && root.querySelector('.invoice-sheet');
    if (!sheet) {
      setStatus('Load an invoice before printing.', 'warning');
      return Promise.resolve();
    }
    return window.VoucherInvoice.printA4(sheet).catch(function (error) {
      setStatus(error.message || 'Could not print invoice.', 'error');
    });
  }

  function formatSubmittedAt(value) {
    if (!value) return '';
    var date = value.toDate ? value.toDate() : new Date(value);
    if (isNaN(date.getTime())) return '';
    return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function submittedReportsByPeriod() {
    var byPeriod = {};
    (state.outcomeReports || []).forEach(function (row) {
      if (row && row.period && row.status === 'submitted') byPeriod[row.period] = row;
    });
    return byPeriod;
  }

  function refreshOutcomeMonthLabels() {
    var select = el('outcomeMonth');
    var year = el('outcomeYear') && el('outcomeYear').value;
    if (!select || !year) return;
    var submitted = submittedReportsByPeriod();
    Array.from(select.options).forEach(function (option) {
      var month = Number(option.value);
      if (!month) return;
      var period = window.VoucherPricing.billingPeriodKey(year, month);
      option.textContent = window.VoucherPricing.monthLabel(month) +
        (submitted[period] ? ' (submitted)' : '');
    });
  }

  function renderOutcomeProgress(range) {
    var mount = el('outcomeMonthProgress');
    if (!mount) return;
    var year = range && range.year;
    if (!year) {
      mount.innerHTML = '';
      return;
    }
    var submitted = submittedReportsByPeriod();
    var selectedMonth = range.month;
    var done = [];
    var next = [];
    for (var month = 1; month <= 12; month += 1) {
      var period = window.VoucherPricing.billingPeriodKey(year, month);
      var item = {
        month: month,
        period: period,
        name: window.VoucherPricing.monthLabel(month),
        report: submitted[period] || null
      };
      if (item.report) done.push(item);
      else next.push(item);
    }
    var chip = function (item, kind) {
      var submittedOn = item.report ? formatSubmittedAt(item.report.submittedAt || item.report.updatedAt) : '';
      return '<button type="button" class="outcome-month-chip is-' + kind +
        (item.month === selectedMonth ? ' is-current' : '') +
        '" data-month="' + item.month + '" aria-label="' + escapeHtml(item.name) +
        (item.report ? ' submitted' : ' not submitted') + '">' +
        '<span>' + escapeHtml(item.name) + '</span>' +
        (item.report
          ? '<small>Done' + (submittedOn ? ' · ' + escapeHtml(submittedOn) : '') + '</small>'
          : '<small>Open</small>') +
        '</button>';
    };
    mount.innerHTML =
      '<div class="outcome-progress__group">' +
        '<div class="outcome-progress__title">Submitted</div>' +
        '<div class="outcome-progress__chips">' +
          (done.length ? done.map(function (item) { return chip(item, 'done'); }).join('')
            : '<p class="lab-hint mb-0">No months submitted yet for ' + year + '.</p>') +
        '</div>' +
      '</div>' +
      '<div class="outcome-progress__group">' +
        '<div class="outcome-progress__title">Still open / next</div>' +
        '<div class="outcome-progress__chips">' +
          (next.length ? next.map(function (item) { return chip(item, 'open'); }).join('')
            : '<p class="lab-hint mb-0">Every month in ' + year + ' is submitted.</p>') +
        '</div>' +
      '</div>';
  }

  function renderOutcomeStatus(range, saved, hasRows) {
    var banner = el('outcomeStatusBanner');
    var label = el('outcomeStatusLabel');
    var note = el('outcomeStatusNote');
    var button = el('saveOutcomeBtn');
    var submitted = !!(saved && saved.status === 'submitted');
    var monthName = range ? window.VoucherPricing.monthLabel(range.month) : 'This month';
    var submittedOn = formatSubmittedAt(saved && (saved.submittedAt || saved.updatedAt));
    if (banner) banner.setAttribute('data-state', submitted ? 'submitted' : 'pending');
    if (label) label.textContent = submitted ? 'Submitted and locked' : 'Not submitted';
    if (note) {
      if (submitted) {
        note.textContent = monthName + ' is done' + (submittedOn ? ' (' + submittedOn + ')' : '') +
          ' and locked. Choose an open month to submit the next report.';
      } else if (!hasRows) {
        note.textContent = 'No redeemed tests in ' + monthName + ' yet, so this month cannot be submitted.';
      } else {
        note.textContent = monthName + ' is not submitted yet. Positive results cannot be higher than tests conducted. Hb% mild and severe anemia together cannot exceed Hb% tests. Ultrasound is count only.';
      }
    }
    if (button) {
      button.hidden = submitted;
      button.disabled = submitted || !hasRows;
      button.innerHTML = '<i class="fas fa-paper-plane me-2" aria-hidden="true"></i>Submit ' +
        escapeHtml(monthName);
    }
  }

  function outcomeResultCell(row, field, label, locked) {
    var max = Number(row.testCount) || 0;
    var value = Math.min(max, Math.max(0, Number(row[field]) || 0));
    if (locked) {
      return '<span class="outcome-locked-value">' + escapeHtml(String(value)) + '</span>';
    }
    return '<input class="form-control outcome-input" data-service="' + escapeHtml(row.serviceId) +
      '" data-field="' + escapeHtml(field) + '" data-max="' + max +
      '" type="number" min="0" max="' + max + '" step="1" inputmode="numeric" value="' +
      escapeHtml(String(value)) + '" aria-label="' + escapeHtml(label) + ', maximum ' + max + '">';
  }

  function renderOutcomeTable(rows, locked) {
    var body = (rows || []).map(function (row) {
      var max = Number(row.testCount) || 0;
      if (row.resultKind === 'hb-split') {
        var mildLabel = (row.resultLabels && row.resultLabels.mild) || 'Mild Anemia (7-11 g/dl)';
        var severeLabel = (row.resultLabels && row.resultLabels.severe) || 'Severe Anemia (<7 g/dl)';
        return '<tr>' +
          '<td>' + escapeHtml(mildLabel) + '</td>' +
          '<td rowspan="2" class="outcome-count-cell">' + escapeHtml(String(max)) + '</td>' +
          '<td>' + outcomeResultCell(row, 'mildAnemiaCount', mildLabel, locked) + '</td>' +
          '</tr><tr>' +
          '<td>' + escapeHtml(severeLabel) + '</td>' +
          '<td>' + outcomeResultCell(row, 'severeAnemiaCount', severeLabel, locked) + '</td>' +
          '</tr>';
      }
      var result = row.resultKind === 'none'
        ? '<span class="outcome-not-recorded">—</span>'
        : outcomeResultCell(row, 'outcomeCount', 'Positive results for ' + row.serviceName, locked);
      return '<tr>' +
        '<td>' + escapeHtml(row.serviceName) + '</td>' +
        '<td class="outcome-count-cell">' + escapeHtml(String(max)) + '</td>' +
        '<td>' + result + '</td></tr>';
    }).join('');
    el('outcomeTable').innerHTML =
      '<table class="table history-table lab-history-table lab-outcome-table">' +
      '<thead><tr>' +
      '<th>Indicator</th>' +
      '<th>Total No of Test Conducted</th>' +
      '<th>No of (+)ve Test Results</th>' +
      '</tr></thead><tbody>' + body + '</tbody></table>';
  }

  async function loadOutcomeReport() {
    var range = selectedBillingRange(el('outcomeYear'), el('outcomeMonth'));
    if (!range) {
      fillYearOptions(el('outcomeYear'), false);
      fillMonthOptions(el('outcomeMonth'), false);
      range = selectedBillingRange(el('outcomeYear'), el('outcomeMonth'));
    }
    el('outcomePeriodHint').textContent = periodHint(range);
    state.outcomeReports = await service().listLabOutcomeReports(state.user.uid);
    refreshOutcomeMonthLabels();
    var query = { labId: state.user.uid };
    if (range) {
      query.startDate = range.startDate;
      query.endDate = range.endDate;
    }
    var summary = await service().queryRedeemedLabVouchers(query);
    var counted = service().countRedeemedTests(summary.items || []);
    var saved = range
      ? ((state.outcomeReports || []).find(function (row) { return row.period === range.period; }) ||
        await service().getLabOutcomeReport(state.user.uid, range.period))
      : null;
    var locked = !!(saved && saved.status === 'submitted');
    var sourceCounts = locked && saved && saved.rows
      ? saved.rows
      : counted;
    state.outcomeRows = window.VoucherPricing.buildLabOutcomeRows(sourceCounts, (saved && saved.rows) || []);
    var hasConducted = state.outcomeRows.some(function (row) { return Number(row.testCount) > 0; });
    renderOutcomeProgress(range);
    renderOutcomeTable(state.outcomeRows, locked);
    renderOutcomeStatus(range, saved, hasConducted);
  }

  function readOutcomeField(row, field) {
    var input = document.querySelector(
      '.outcome-input[data-service="' + row.serviceId + '"][data-field="' + field + '"]'
    );
    var raw = input ? String(input.value || '').trim() : String(row[field] || 0);
    if (raw === '') return 0;
    return Number(raw);
  }

  function readOutcomeRows() {
    var errors = [];
    var rows = state.outcomeRows.map(function (row) {
      var max = Number(row.testCount) || 0;
      if (row.resultKind === 'none') {
        return {
          serviceId: row.serviceId,
          serviceName: row.serviceName,
          testCount: max,
          outcomeCount: 0
        };
      }
      if (row.resultKind === 'hb-split') {
        var mild = readOutcomeField(row, 'mildAnemiaCount');
        var severe = readOutcomeField(row, 'severeAnemiaCount');
        if (!Number.isFinite(mild) || mild < 0 || Math.floor(mild) !== mild ||
          !Number.isFinite(severe) || severe < 0 || Math.floor(severe) !== severe) {
          errors.push('Hb% mild and severe anemia need whole numbers.');
        } else if (mild + severe > max) {
          errors.push('Mild and severe anemia together cannot be more than ' + max + ' Hb% tests.');
        }
        return {
          serviceId: row.serviceId,
          serviceName: row.serviceName,
          testCount: max,
          outcomeCount: Math.max(0, Math.floor((Number(mild) || 0) + (Number(severe) || 0))),
          mildAnemiaCount: Math.max(0, Math.floor(Number.isFinite(mild) ? mild : 0)),
          severeAnemiaCount: Math.max(0, Math.floor(Number.isFinite(severe) ? severe : 0))
        };
      }
      var value = readOutcomeField(row, 'outcomeCount');
      if (!Number.isFinite(value) || value < 0 || Math.floor(value) !== value) {
        errors.push(row.serviceName + ' needs a whole number.');
      } else if (value > max) {
        errors.push(row.serviceName + ': positive results cannot be more than ' + max + ' tests.');
      }
      return {
        serviceId: row.serviceId,
        serviceName: row.serviceName,
        testCount: max,
        outcomeCount: Math.max(0, Math.floor(Number.isFinite(value) ? value : 0))
      };
    });
    return { rows: rows, errors: errors };
  }

  function validateOutcomeInput(input) {
    if (!input) return true;
    var max = Number(input.getAttribute('data-max') || input.max || 0);
    var raw = String(input.value || '').trim();
    var value = raw === '' ? 0 : Number(raw);
    var valid = Number.isFinite(value) && value >= 0 && Math.floor(value) === value && value <= max;
    if (valid && (input.getAttribute('data-field') === 'mildAnemiaCount' ||
      input.getAttribute('data-field') === 'severeAnemiaCount')) {
      var serviceId = input.getAttribute('data-service');
      var mild = document.querySelector(
        '.outcome-input[data-service="' + serviceId + '"][data-field="mildAnemiaCount"]'
      );
      var severe = document.querySelector(
        '.outcome-input[data-service="' + serviceId + '"][data-field="severeAnemiaCount"]'
      );
      var mildValue = mild ? readOutcomeField({ serviceId: serviceId }, 'mildAnemiaCount') : 0;
      var severeValue = severe ? readOutcomeField({ serviceId: serviceId }, 'severeAnemiaCount') : 0;
      var splitValid = Number.isFinite(mildValue) && Number.isFinite(severeValue) &&
        mildValue + severeValue <= max;
      [mild, severe].forEach(function (node) {
        if (!node) return;
        node.classList.toggle('is-invalid', !splitValid);
        node.setAttribute('aria-invalid', splitValid ? 'false' : 'true');
      });
      return splitValid;
    }
    input.classList.toggle('is-invalid', !valid);
    input.setAttribute('aria-invalid', valid ? 'false' : 'true');
    return valid;
  }

  async function confirmOutcomeSubmit(monthName) {
    var message = 'Submit the ' + monthName +
      ' outcome report? After you confirm, this month will be locked and cannot be edited.';
    if (window.AppDialog && typeof window.AppDialog.confirm === 'function') {
      return window.AppDialog.confirm(message, { title: 'Confirm submission' });
    }
    return window.confirm(message);
  }

  async function saveOutcomeReport() {
    var range = selectedBillingRange(el('outcomeYear'), el('outcomeMonth'));
    if (!range) throw new Error('Select a year and month for the outcome report.');
    var existing = (state.outcomeReports || []).find(function (row) {
      return row.period === range.period && row.status === 'submitted';
    });
    if (existing) throw new Error('This month is already submitted and locked.');
    var parsed = readOutcomeRows();
    if (parsed.errors.length) throw new Error(parsed.errors[0]);
    if (!parsed.rows.some(function (row) { return Number(row.testCount) > 0; })) {
      throw new Error('There are no redeemed tests to report for this month.');
    }
    var confirmed = await confirmOutcomeSubmit(window.VoucherPricing.monthLabel(range.month));
    if (!confirmed) return;
    await service().saveLabOutcomeReport({
      labId: state.user.uid,
      period: range.period,
      rows: parsed.rows,
      submitted: true
    });
    await loadOutcomeReport();
    setStatus('Outcome report submitted for ' + window.VoucherPricing.monthLabel(range.month) + '. This month is now locked.', 'success');
  }

  function updateSealPreview(dataUrl) {
    var preview = el('sealPreview');
    var textPreview = el('sealTextPreview');
    var empty = el('sealPreviewEmpty');
    var settings = state.settings || {};
    var name = settings.labName || (state.profile && (state.profile.displayName || state.profile.name)) || '';
    var address = (el('labSettingsAddress') && el('labSettingsAddress').value.trim()) || settings.address || '';
    var phone = (el('labSettingsPhone') && el('labSettingsPhone').value.trim()) || settings.phone || '';
    if (dataUrl) {
      preview.src = dataUrl;
      preview.classList.remove('d-none');
      if (textPreview) textPreview.classList.add('d-none');
      empty.classList.add('d-none');
      return;
    }
    preview.removeAttribute('src');
    preview.classList.add('d-none');
    if (name || address || phone) {
      if (textPreview) {
        textPreview.innerHTML =
          (name ? '<div class="invoice-seal-card__name">' + escapeHtml(name) + '</div>' : '') +
          (address ? '<div class="invoice-seal-card__line">' + escapeHtml(address) + '</div>' : '') +
          (phone ? '<div class="invoice-seal-card__line">' + escapeHtml(phone) + '</div>' : '');
        textPreview.classList.remove('d-none');
      }
      empty.classList.add('d-none');
    } else {
      if (textPreview) {
        textPreview.innerHTML = '';
        textPreview.classList.add('d-none');
      }
      empty.classList.remove('d-none');
    }
  }

  function updatePaymentQrPreview(dataUrl) {
    var preview = el('paymentQrPreview');
    var empty = el('paymentQrEmpty');
    if (!preview || !empty) return;
    if (dataUrl) {
      preview.src = dataUrl;
      preview.classList.remove('d-none');
      empty.classList.add('d-none');
      return;
    }
    preview.removeAttribute('src');
    preview.classList.add('d-none');
    empty.classList.remove('d-none');
  }

  function assertPaymentQrFile(file) {
    if (!file) return;
    var type = String(file.type || '').toLowerCase();
    if (type !== 'image/png' && type !== 'image/jpeg' && type !== 'image/jpg') {
      throw new Error('Payment QR must be a PNG or JPG image.');
    }
  }

  function renderSettings() {
    var settings = state.settings || {
      cashiers: [{ name: '', signature: '' }, { name: '', signature: '' }, { name: '', signature: '' }]
    };
    if (!state.editingCashiers) state.editingCashiers = {};
    if (el('labSettingsAddress')) {
      el('labSettingsAddress').value = settings.address || (state.profile && state.profile.address) || '';
    }
    if (el('labSettingsPhone')) {
      el('labSettingsPhone').value = settings.phone || (state.profile && (state.profile.phone || state.profile.labPhone)) || '';
    }
    updateSealPreview(settings.seal || '');
    updatePaymentQrPreview(settings.paymentQr || '');
    el('cashierFields').innerHTML = [0, 1, 2].map(function (index) {
      var cashier = (settings.cashiers || [])[index] || { name: '', signature: '' };
      var editing = !!state.editingCashiers[index] || !cashier.signature;
      return '<div class="lab-cashier-card" data-cashier-card="' + index + '">' +
        '<label class="form-label" for="cashierName' + index + '">Cashier ' + (index + 1) + ' name</label>' +
        '<input id="cashierName' + index + '" class="form-control form-control-lg cashier-name" data-index="' + index +
        '" value="' + escapeHtml(cashier.name || '') + '" autocomplete="name">' +
        '<label class="form-label mt-2">Signature</label>' +
        (cashier.signature && !editing
          ? '<div class="lab-cashier-preview-wrap">' +
            '<img class="lab-cashier-preview" src="' + escapeHtml(cashier.signature) + '" alt="Cashier ' + (index + 1) + ' signature">' +
            '<button type="button" class="btn btn-outline-primary voucher-header-action mt-2 edit-cashier" data-index="' +
            index + '"><i class="fas fa-pen me-1" aria-hidden="true"></i>Edit signature</button></div>'
          : '<canvas class="sign-pad cashier-pad" data-index="' + index + '" width="640" height="180" aria-label="Cashier ' +
            (index + 1) + ' signature"></canvas>' +
            '<div class="lab-sign-actions mt-2">' +
            '<button type="button" class="btn btn-outline-secondary voucher-header-action clear-cashier" data-index="' +
            index + '">Clear</button>' +
            (cashier.signature
              ? '<button type="button" class="btn btn-outline-secondary voucher-header-action cancel-cashier-edit" data-index="' +
                index + '">Cancel</button>'
              : '') +
            '</div>') +
        '</div>';
    }).join('');
    state.cashierPads = [];
    Array.from(document.querySelectorAll('.cashier-pad')).forEach(function (canvas) {
      var index = Number(canvas.getAttribute('data-index'));
      state.cashierPads[index] = window.VoucherInvoice.bindSignaturePad(canvas);
    });
  }

  async function saveSettings() {
    var sealFile = el('sealInput').files[0];
    var seal = state.clearSealImage ? '' : ((state.settings && state.settings.seal) || '');
    if (sealFile) {
      seal = await window.VoucherInvoice.compressImage(await window.VoucherInvoice.fileToDataUrl(sealFile), 240, 240);
      state.clearSealImage = false;
    }
    var paymentQrFile = el('paymentQrInput') && el('paymentQrInput').files[0];
    var paymentQr = state.clearPaymentQr ? '' : ((state.settings && state.settings.paymentQr) || '');
    if (paymentQrFile) {
      assertPaymentQrFile(paymentQrFile);
      paymentQr = await window.VoucherInvoice.compressImage(
        await window.VoucherInvoice.fileToDataUrl(paymentQrFile),
        360,
        360,
        0.82
      );
      state.clearPaymentQr = false;
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
    var address = el('labSettingsAddress') ? el('labSettingsAddress').value.trim() : '';
    var phone = el('labSettingsPhone') ? el('labSettingsPhone').value.trim() : '';
    state.settings = await service().saveLabSettings({
      labName: state.profile.displayName || state.profile.name || state.profile.labName || '',
      address: address,
      phone: phone,
      seal: seal,
      paymentQr: paymentQr,
      cashiers: cashiers
    });
    if (state.profile) {
      state.profile.address = address;
      state.profile.phone = phone;
      state.profile.labPhone = phone;
    }
    state.clearSealImage = false;
    state.clearPaymentQr = false;
    if (el('sealInput')) el('sealInput').value = '';
    if (el('paymentQrInput')) el('paymentQrInput').value = '';
    state.editingCashiers = {};
    updateSealPreview(state.settings.seal || '');
    updatePaymentQrPreview(state.settings.paymentQr || '');
    renderSettings();
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
    var labRole = normalizedRole(state.profile.role);
    var labApproved = state.profile.approved === true || state.profile.status === 'approved';
    if ((labRole !== 'lab' && labRole !== 'laboratory') || state.profile.active === false || !labApproved) {
      el('accessDeniedMessage').textContent = 'A Lab account is required.';
      el('accessDenied').classList.remove('d-none');
      return;
    }
    state.settings = await service().getLabSettings(user.uid);
    state.clientPad = window.VoucherInvoice.bindSignaturePad(el('clientPad'));
    fillYearOptions(el('labYear'), true);
    fillMonthOptions(el('labMonth'), true);
    el('labYear').value = 'all';
    el('labMonth').value = 'all';
    fillYearOptions(el('outcomeYear'), false);
    fillMonthOptions(el('outcomeMonth'), false);
    el('invoiceDateInput').value = todayInputValue();
    state.invoiceDate = el('invoiceDateInput').value;
    el('labApp').classList.remove('d-none');
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
  function handlePrintInvoice() {
    printInvoiceFrom(el('invoiceMount'));
  }
  el('printInvoiceBtn').addEventListener('click', handlePrintInvoice);
  if (el('printInvoicePreviewBtn')) {
    el('printInvoicePreviewBtn').addEventListener('click', handlePrintInvoice);
  }
  if (el('labPreviewPrintBtn')) {
    el('labPreviewPrintBtn').addEventListener('click', function () {
      printInvoiceFrom(el('labPreviewBody'));
    });
  }
  document.querySelectorAll('[data-close-lab-preview]').forEach(function (node) {
    node.addEventListener('click', closeLabPreview);
  });
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && el('labPreviewModal') && !el('labPreviewModal').hidden) {
      closeLabPreview();
    }
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
  if (el('scanPhotoBtn')) {
    el('scanPhotoBtn').addEventListener('click', handleScanPhoto);
  }
  if (el('scanPhotoInput')) {
    el('scanPhotoInput').addEventListener('change', function (event) {
      var file = event.target.files && event.target.files[0];
      decodeScanPhoto(file).catch(function (error) { setStatus(error.message, 'warning'); });
    });
  }
  el('saveSettingsBtn').addEventListener('click', function () {
    saveSettings().catch(function (error) { setStatus(error.message, 'error'); });
  });
  if (el('clearSealBtn')) {
    el('clearSealBtn').addEventListener('click', function () {
      state.clearSealImage = true;
      if (el('sealInput')) el('sealInput').value = '';
      if (state.settings) state.settings.seal = '';
      updateSealPreview('');
      setStatus('Seal image cleared. Save settings to keep the text seal.', 'info');
    });
  }
  if (el('clearPaymentQrBtn')) {
    el('clearPaymentQrBtn').addEventListener('click', function () {
      state.clearPaymentQr = true;
      if (el('paymentQrInput')) el('paymentQrInput').value = '';
      if (state.settings) state.settings.paymentQr = '';
      updatePaymentQrPreview('');
      setStatus('Payment QR cleared. Save settings to keep this change.', 'info');
    });
  }
  ['labSettingsAddress', 'labSettingsPhone'].forEach(function (id) {
    if (!el(id)) return;
    el(id).addEventListener('input', function () {
      updateSealPreview((state.settings && state.settings.seal) || '');
    });
  });
  function bindPeriodReload(yearId, monthId, loader) {
    el(yearId).addEventListener('change', function () {
      loader().catch(function (error) { setStatus(error.message, 'error'); });
    });
    el(monthId).addEventListener('change', function () {
      loader().catch(function (error) { setStatus(error.message, 'error'); });
    });
  }
  bindPeriodReload('labYear', 'labMonth', loadDashboard);
  bindPeriodReload('outcomeYear', 'outcomeMonth', loadOutcomeReport);
  if (el('labDashSearch')) {
    el('labDashSearch').addEventListener('input', renderDashboardTable);
  }
  el('labHistory').addEventListener('click', function (event) {
    var row = event.target.closest('.lab-history-row');
    if (!row) return;
    openDashboardVoucher(row.getAttribute('data-code'));
  });
  el('labHistory').addEventListener('keydown', function (event) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    var row = event.target.closest('.lab-history-row');
    if (!row) return;
    event.preventDefault();
    openDashboardVoucher(row.getAttribute('data-code'));
  });
  if (el('outcomeMonthProgress')) {
    el('outcomeMonthProgress').addEventListener('click', function (event) {
      var chip = event.target.closest('[data-month]');
      if (!chip || !el('outcomeMonth')) return;
      el('outcomeMonth').value = chip.getAttribute('data-month');
      loadOutcomeReport().catch(function (error) { setStatus(error.message, 'error'); });
    });
  }
  el('outcomeTable').addEventListener('input', function (event) {
    if (!event.target.classList.contains('outcome-input')) return;
    validateOutcomeInput(event.target);
  });
  el('saveOutcomeBtn').addEventListener('click', function () {
    saveOutcomeReport().catch(function (error) { setStatus(error.message, 'error'); });
  });
  el('labStatTiles').addEventListener('click', function (event) {
    var tile = event.target.closest('[data-status]');
    if (!tile) return;
    var next = tile.getAttribute('data-status');
    state.dashStatus = next || 'total';
    loadDashboard().catch(function (error) { setStatus(error.message, 'error'); });
  });
  el('cashierFields').addEventListener('click', function (event) {
    var editBtn = event.target.closest('.edit-cashier');
    if (editBtn) {
      var editIndex = Number(editBtn.getAttribute('data-index'));
      state.editingCashiers = state.editingCashiers || {};
      state.editingCashiers[editIndex] = true;
      renderSettings();
      return;
    }
    var cancelBtn = event.target.closest('.cancel-cashier-edit');
    if (cancelBtn) {
      var cancelIndex = Number(cancelBtn.getAttribute('data-index'));
      if (state.editingCashiers) delete state.editingCashiers[cancelIndex];
      renderSettings();
      return;
    }
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
  if (el('paymentQrInput')) {
    el('paymentQrInput').addEventListener('change', function () {
      var file = el('paymentQrInput').files[0];
      if (!file) return;
      try {
        assertPaymentQrFile(file);
      } catch (error) {
        el('paymentQrInput').value = '';
        setStatus(error.message, 'error');
        return;
      }
      state.clearPaymentQr = false;
      window.VoucherInvoice.fileToDataUrl(file).then(function (dataUrl) {
        updatePaymentQrPreview(dataUrl);
      }).catch(function (error) {
        setStatus(error.message || 'Could not preview payment QR.', 'error');
      });
    });
  }
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
