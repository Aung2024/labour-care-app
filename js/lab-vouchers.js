(function () {
  'use strict';

  var state = {
    user: null,
    profile: null,
    voucher: null,
    stream: null,
    detector: null,
    scanFrame: null,
    redeeming: false,
    loggingOut: false
  };

  function el(id) { return document.getElementById(id); }
  function escapeHtml(value) {
    return String(value === undefined || value === null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }
  function valueOrDash(value) { return value === undefined || value === null || value === '' ? '—' : String(value); }
  function money(value) { return Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 }); }
  function normalizedRole(role) { return String(role || '').trim().toLowerCase().replace(/\s+/g, ' '); }
  function setStatus(message, kind) {
    var box = el('pageStatus');
    box.textContent = message;
    box.className = 'status-box ' + (kind || 'info');
  }
  function assertOnline() {
    if (navigator.onLine === false) throw new Error('Voucher redemption requires an internet connection.');
  }
  function service() { return window.VoucherService || window.voucherService || null; }
  function findMethod(names) {
    var api = service();
    for (var i = 0; api && i < names.length; i++) {
      if (typeof api[names[i]] === 'function') return { api: api, fn: api[names[i]], name: names[i] };
    }
    return null;
  }
  async function callService(names, args) {
    var method = findMethod(names);
    if (!method) throw new Error('Voucher service is unavailable. Expected: ' + names.join(' or ') + '.');
    return method.fn.apply(method.api, args || []);
  }
  function voucherRecord(result) { return result && (result.voucher || result.data || result); }
  function dateValue(value) {
    if (!value) return '—';
    var date = value.toDate ? value.toDate() : new Date(value);
    return isNaN(date.getTime()) ? valueOrDash(value) : date.toLocaleString();
  }
  function voucherCode(voucher) {
    return voucher && (voucher.code || voucher.voucherCode || voucher.opaqueCode || voucher.id) || '';
  }
  function voucherStatus(voucher) {
    if (!voucher) return '';
    if (voucher.redeemed === true || voucher.submitted === true) return 'redeemed';
    return String(voucher.status || 'active').toLowerCase();
  }

  function parseCode(input) {
    var raw = String(input || '').trim();
    if (!raw) return '';
    if (raw.charAt(0) === '{' && service() && typeof service().parseQrPayload === 'function') {
      return service().parseQrPayload(raw);
    }
    var api = service();
    if (api && typeof api.parseQrPayload === 'function' && raw.charAt(0) === '{') {
      try { return api.parseQrPayload(raw); } catch (error) { return ''; }
    }
    try {
      var url = new URL(raw);
      raw = url.searchParams.get('code') || raw;
    } catch (error) {
      // A plain opaque code is expected for manual entry.
    }
    raw = raw.trim();
    var api = service();
    if (api && typeof api.normalizeVoucherCode === 'function') {
      try { return api.normalizeVoucherCode(raw); } catch (error) { return raw; }
    }
    return raw;
  }

  async function authenticatedLookup(code) {
    var method = findMethod(['lookupVoucher', 'getVoucherByCode', 'findVoucher']);
    if (method) return method.fn.call(method.api, code);
    var api = service();
    if (!api || !api.collections || !api.collections.VOUCHERS) {
      throw new Error('Voucher lookup is not available.');
    }
    if (typeof api.validateOpaqueId === 'function') api.validateOpaqueId(code, 'Voucher code');
    var snapshot = await firebase.firestore().collection(api.collections.VOUCHERS).doc(code).get();
    if (!snapshot.exists) throw new Error('Voucher not found.');
    return Object.assign({ id: snapshot.id }, snapshot.data());
  }

  function renderLookup(voucher) {
    var code = voucherCode(voucher);
    var status = voucherStatus(voucher);
    var tests = voucher.tests || voucher.labTests || voucher.items || (voucher.serviceNameSnapshot ? [{
      name: voucher.serviceNameSnapshot,
      clientCostShare: 0,
      projectCostShare: Number(voucher.unitPriceMinorSnapshot || 0) / 100
    }] : []);
    el('resultCode').textContent = valueOrDash(code);
    el('resultPatient').textContent = valueOrDash(voucher.patientReference || voucher.patientRef || voucher.patientId || voucher.beneficiaryRef);
    el('resultPatientName').textContent = valueOrDash(voucher.patientNameSnapshot);
    el('resultPatientPhone').textContent = valueOrDash(voucher.patientPhoneSnapshot);
    el('resultPatientNrc').textContent = valueOrDash(voucher.patientNrcSnapshot);
    el('resultAncDate').textContent = valueOrDash(voucher.ancVisitDate || voucher.latestAncVisitDate);
    el('resultIssuer').textContent = valueOrDash(voucher.generatedByName || voucher.issuerName ||
      (voucher.issuer && voucher.issuer.displayName) || voucher.midwifeId || voucher.issuedBy);
    el('resultLabName').textContent = valueOrDash(voucher.labNameSnapshot || voucher.labName);
    el('resultIssuedAt').textContent = dateValue(voucher.generatedAt || voucher.createdAt || voucher.issuedAt);
    el('resultTests').innerHTML = tests.length ? tests.map(function (test) {
      return '<tr><td>' + escapeHtml(test.name || test.testName || test.label || test.id) + '</td>' +
        '<td class="money">' + money(test.subsidizedCost || test.subsidized_cost) + '</td>' +
        '<td class="money">' + money(test.clientCostShare || test.client_cost_share) + '</td>' +
        '<td class="money">' + money(test.projectCostShare || test.project_cost_share) + '</td></tr>';
    }).join('') : '<tr><td colspan="4" class="text-center text-muted">No tests listed</td></tr>';

    var badge = el('voucherStatusBadge');
    badge.textContent = status || 'unknown';
    badge.className = 'badge rounded-pill ' + (status === 'active' || status === 'issued' ? 'bg-primary' :
      status === 'redeemed' || status === 'submitted' ? 'badge-redeemed' : 'bg-secondary');
    var canRedeem = status === 'active' || status === 'issued' || status === 'pending';
    if (canRedeem && voucher.labId && state.user && voucher.labId !== state.user.uid) {
      canRedeem = false;
      el('redeemWarning').textContent = 'This voucher is assigned to another laboratory and cannot be redeemed here.';
    } else {
      el('redeemWarning').textContent = canRedeem
        ? 'Verify the patient and tests before submitting. Redemption is final and can happen only once.'
        : 'This voucher cannot be redeemed because its current status is "' + status + '".';
    }
    el('confirmRedeem').disabled = !canRedeem;
    el('lookupResult').classList.remove('d-none');
    el('lookupResult').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function lookup(event) {
    if (event) event.preventDefault();
    var button = el('lookupButton');
    try {
      assertOnline();
      var code = parseCode(el('voucherCodeInput').value);
      if (!code) throw new Error('Enter a voucher code.');
      button.disabled = true;
      setStatus('Looking up authenticated voucher record…', 'info');
      var result = await authenticatedLookup(code);
      var voucher = voucherRecord(result);
      if (!voucher || !voucherCode(voucher)) throw new Error('Voucher not found.');
      state.voucher = voucher;
      el('voucherCodeInput').value = voucherCode(voucher);
      renderLookup(voucher);
      setStatus('Voucher found. Review it before confirming.', 'success');
    } catch (error) {
      state.voucher = null;
      el('lookupResult').classList.add('d-none');
      setStatus(error.message || 'Voucher lookup failed.', 'error');
    } finally {
      button.disabled = false;
    }
  }

  function idempotencyKey(code) {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return [state.user.uid, code, Date.now(), Math.random().toString(36).slice(2)].join('-');
  }

  async function redeem() {
    if (state.redeeming) return;
    try {
      assertOnline();
      if (!state.voucher) throw new Error('Look up a voucher before redeeming it.');
      var code = voucherCode(state.voucher);
      if (voucherStatus(state.voucher) !== 'active' && voucherStatus(state.voucher) !== 'issued' &&
          voucherStatus(state.voucher) !== 'pending') {
        throw new Error('This voucher is not available for redemption.');
      }
      var confirmed = window.confirm(
        'Confirm one-time redemption of voucher ' + code + '?\n\nThis submission is final and cannot be undone.'
      );
      if (!confirmed) return;

      state.redeeming = true;
      el('confirmRedeem').disabled = true;
      setStatus('Submitting atomic one-time redemption…', 'info');
      var payload = {
        submissionReference: el('submissionReference').value.trim(),
        labUserId: state.user.uid,
        labDisplayName: state.profile.name || state.profile.displayName || state.user.displayName || state.user.email,
        idempotencyKey: idempotencyKey(code)
      };
      // Do not retry this mutation in the UI. The service must perform its status check and
      // redemption write atomically and enforce the idempotency key/one-time constraint.
      var result = await callService(['redeemVoucher', 'submitVoucher', 'confirmRedemption'], [code, payload]);
      var redeemed = typeof result === 'string'
        ? voucherRecord(await authenticatedLookup(result))
        : (voucherRecord(result) || Object.assign({}, state.voucher, { status: 'redeemed', redeemed: true }));
      state.voucher = redeemed;
      renderLookup(redeemed);
      setStatus('Voucher redeemed and submitted successfully.', 'success');
      await loadHistory();
    } catch (error) {
      setStatus(error.message || 'Redemption failed. The voucher was not resubmitted.', 'error');
      el('confirmRedeem').disabled = false;
    } finally {
      state.redeeming = false;
    }
  }

  function historyFilters() {
    return {
      search: el('historySearch').value.trim(),
      from: el('historyFrom').value || null,
      to: el('historyTo').value || null,
      status: 'redeemed',
      labUserId: state.user.uid
    };
  }
  function historyRows(result) {
    var rows = result && (result.vouchers || result.items || result.rows || result.data || result);
    return Array.isArray(rows) ? rows : [];
  }
  async function loadHistory(event) {
    if (event) event.preventDefault();
    var body = el('historyBody');
    body.innerHTML = '<tr><td colspan="6" class="text-center text-muted">Loading…</td></tr>';
    try {
      assertOnline();
      var filters = historyFilters();
      var historyMethod = findMethod(['listSubmittedVouchers', 'listRedemptions', 'getRedemptionHistory']);
      var result;
      if (historyMethod) {
        result = await historyMethod.fn.call(historyMethod.api, filters);
      } else {
        var api = service();
        if (!api || typeof api.queryVoucherReport !== 'function') throw new Error('Voucher history is unavailable.');
        var end = filters.to ? new Date(filters.to + 'T23:59:59') : new Date();
        var start = filters.from ? new Date(filters.from + 'T00:00:00') : new Date(end.getTime() - (90 * 86400000));
        result = await api.queryVoucherReport({ status: 'redeemed', startDate: start, endDate: end });
      }
      var rows = result && Array.isArray(result.docs)
        ? result.docs.map(function (doc) { return Object.assign({ id: doc.id }, doc.data()); })
        : historyRows(result);
      rows = rows.filter(function (row) {
        if (row.redeemedBy && row.redeemedBy !== state.user.uid) return false;
        if (!filters.search) return true;
        var haystack = [voucherCode(row), row.patientReference, row.patientRef, row.patientId, row.beneficiaryRef]
          .filter(Boolean).join(' ').toLowerCase();
        return haystack.indexOf(filters.search.toLowerCase()) !== -1;
      });
      body.innerHTML = rows.length ? rows.map(function (row) {
        var tests = row.tests || row.labTests || row.items ||
          (row.selectedServiceIds || []).map(function (id) { return { name: id }; }) ||
          (row.serviceNameSnapshot ? [{ name: row.serviceNameSnapshot }] : []);
        return '<tr><td>' + escapeHtml(dateValue(row.redeemedAt || row.submittedAt || row.updatedAt)) + '</td>' +
          '<td><code>' + escapeHtml(voucherCode(row)) + '</code></td>' +
          '<td>' + escapeHtml(row.patientReference || row.patientRef || row.patientId || row.beneficiaryRef || '—') + '</td>' +
          '<td>' + escapeHtml(tests.map(function (test) { return test.name || test.testName || test.id; }).join(', ') || '—') + '</td>' +
          '<td>' + escapeHtml(row.labDisplayName || row.redeemedByName || row.labUserId || row.redeemedBy || '—') + '</td>' +
          '<td><span class="badge badge-redeemed">Redeemed</span></td></tr>';
      }).join('') : '<tr><td colspan="6" class="text-center text-muted">No submitted vouchers match these filters.</td></tr>';
    } catch (error) {
      body.innerHTML = '<tr><td colspan="6" class="text-center text-danger">' + escapeHtml(error.message || 'Could not load history.') + '</td></tr>';
    }
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
    } catch (error) {
      console.warn('[LabVouchers] QR scan frame failed.', error);
    }
    state.scanFrame = requestAnimationFrame(scanLoop);
  }
  async function startCamera() {
    try {
      assertOnline();
      if (!('BarcodeDetector' in window) || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        el('cameraUnsupported').classList.remove('d-none');
        return;
      }
      var formats = await window.BarcodeDetector.getSupportedFormats();
      if (formats.indexOf('qr_code') === -1) {
        el('cameraUnsupported').classList.remove('d-none');
        return;
      }
      state.detector = new window.BarcodeDetector({ formats: ['qr_code'] });
      state.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } }, audio: false
      });
      el('cameraVideo').srcObject = state.stream;
      await el('cameraVideo').play();
      el('scanner').classList.remove('d-none');
      el('startCamera').classList.add('d-none');
      el('stopCamera').classList.remove('d-none');
      scanLoop();
    } catch (error) {
      setStatus(error.name === 'NotAllowedError' ? 'Camera permission was denied. Enter the code manually.' :
        (error.message || 'Could not start camera.'), 'warning');
      stopCamera();
    }
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

  async function logout() {
    var button = el('logoutBtn');
    state.loggingOut = true;
    button.disabled = true;
    button.textContent = 'Logging out…';
    stopCamera();
    try {
      await firebase.auth().signOut();
      sessionStorage.clear();
      ['role', 'userEmail', 'userId', 'providerType', 'userTownship', 'userRegion'].forEach(function (key) {
        localStorage.removeItem(key);
      });
      window.location.replace('login.html');
    } catch (error) {
      state.loggingOut = false;
      button.disabled = false;
      button.innerHTML = '<i class="fas fa-sign-out-alt me-1"></i>Log out';
      setStatus('Could not log out: ' + (error.message || 'Unknown error.'), 'error');
    }
  }

  async function initialize(user) {
    try {
      assertOnline();
      state.user = user;
      var profileDoc = await firebase.firestore().collection('users').doc(user.uid).get();
      if (!profileDoc.exists) throw new Error('Lab account profile not found.');
      state.profile = profileDoc.data() || {};
      if (normalizedRole(state.profile.role) !== 'lab' ||
          state.profile.active === false || state.profile.approved === false) {
        el('accessDeniedMessage').textContent = 'Signed-in role "' + valueOrDash(state.profile.role) + '" is not authorized. A Lab account is required.';
        el('accessDenied').classList.remove('d-none');
        return;
      }
      el('labApp').classList.remove('d-none');
      setStatus('Authenticated as ' + (state.profile.name || user.displayName || user.email) + '.', 'success');
      if (!('BarcodeDetector' in window)) el('cameraUnsupported').classList.remove('d-none');
      var initialCode = parseCode(new URLSearchParams(window.location.search).get('code'));
      if (initialCode) {
        el('voucherCodeInput').value = initialCode;
        await lookup();
      }
      await loadHistory();
    } catch (error) {
      el('labApp').classList.remove('d-none');
      setStatus(error.message || 'Could not initialize lab vouchers.', 'error');
    }
  }

  el('lookupForm').addEventListener('submit', lookup);
  el('confirmRedeem').addEventListener('click', redeem);
  el('historyFilters').addEventListener('submit', loadHistory);
  el('refreshHistory').addEventListener('click', loadHistory);
  el('startCamera').addEventListener('click', startCamera);
  el('stopCamera').addEventListener('click', stopCamera);
  el('logoutBtn').addEventListener('click', logout);
  window.addEventListener('beforeunload', stopCamera);
  window.addEventListener('offline', function () {
    stopCamera();
    if (!el('labApp').classList.contains('d-none')) setStatus('Voucher redemption requires an internet connection.', 'warning');
  });
  window.addEventListener('online', function () {
    if (!el('labApp').classList.contains('d-none')) setStatus('Connection restored.', 'success');
  });

  firebase.auth().onAuthStateChanged(function (user) {
    if (!user) {
      window.location.replace(state.loggingOut
        ? 'login.html'
        : 'login.html?redirect=' + encodeURIComponent(window.location.pathname + window.location.search));
      return;
    }
    initialize(user);
  });
})();
