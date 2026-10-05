(function () {
  'use strict';

  var state = {
    user: null,
    profile: null,
    patientId: '',
    patient: null,
    tests: [],
    labs: [],
    labId: '',
    voucher: null,
    quota: null,
    budgetSummary: null,
    projectCeilingMinor: 0
  };

  function el(id) { return document.getElementById(id); }
  function requireEl(id) {
    var node = el(id);
    if (!node) throw new Error('QR page is out of date. Refresh once, then generate again.');
    return node;
  }
  function text(value) { return value === undefined || value === null || value === '' ? '—' : String(value); }
  function escapeHtml(value) {
    return String(value === undefined || value === null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }
  function formatMoney(value) {
    return Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 0 }) + ' MMK';
  }
  function normalizedRole(role) { return String(role || '').trim().toLowerCase().replace(/\s+/g, ' '); }
  function setStatus(message, kind) {
    var box = el('pageStatus');
    box.textContent = message;
    box.className = 'status-box ' + (kind || 'info');
  }
  function assertOnline() {
    if (navigator.onLine === false) throw new Error('QR generation is online-only. Please reconnect and try again.');
  }
  function service() { return window.VoucherService || null; }
  function pricing() { return window.VoucherPricing; }

  function resolvePatientId() {
    var params = new URLSearchParams(window.location.search);
    return params.get('patientId') || params.get('patient') || sessionStorage.getItem('selectedPatientId') || '';
  }
  function patientName(patient) {
    return patient.name || patient.patient_name || patient.patientName || patient.fullName || '';
  }
  function patientAge(patient) {
    if (patient.age !== undefined && patient.age !== null && patient.age !== '') return patient.age;
    var source = patient.date_of_birth || patient.dateOfBirth || patient.dob || patient.birthDate;
    if (!source) return '';
    var date = source.toDate ? source.toDate() : new Date(source);
    if (isNaN(date.getTime())) return '';
    var now = new Date();
    var age = now.getFullYear() - date.getFullYear();
    if (now < new Date(now.getFullYear(), date.getMonth(), date.getDate())) age--;
    return Math.max(0, age);
  }
  function patientAddress(patient) {
    return patient.patient_address || patient.patientAddress || patient.address || '';
  }
  function ancHubHref() {
    return 'patient-care-hub.html?patient=' + encodeURIComponent(state.patientId || '');
  }

  function todayInputValue() {
    var now = new Date();
    return now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' +
      String(now.getDate()).padStart(2, '0');
  }

  function midwifeAccountName(profile, user) {
    return (profile && (profile.name || profile.midwife_name || profile.midwifeName || profile.displayName)) ||
      (user && (user.displayName || user.email)) || '';
  }

  function issuerDisplayName(profile, user) {
    var facility = profile.maternityHomeName || profile.maternity_home_name || profile.facilityName || profile.facility;
    if (!facility && profile.facility_code && window.FacilityConfig) {
      var record = FacilityConfig.getFacilityByCode(profile.facility_code);
      facility = record && FacilityConfig.getFacilityLabel(record, 'en');
    }
    var account = midwifeAccountName(profile, user);
    return [facility, account].filter(Boolean).join(' / ');
  }

  function formatCardDate(value) {
    if (!value) return '—';
    if (typeof value.toDate === 'function') value = value.toDate();
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' +
      String(date.getDate()).padStart(2, '0');
  }

  function renderQuota() {
    var chip = el('quotaChip');
    if (!chip) return;
    if (!state.quota) {
      chip.textContent = 'No allocation';
      chip.classList.add('is-empty');
      return;
    }
    chip.classList.remove('is-empty');
    var remainingBudget = state.budgetSummary
      ? formatMoney((state.budgetSummary.remainingBudgetMinor || 0) / 100)
      : '—';
    chip.innerHTML =
      '<span>Allocation ' + Number(state.quota.remainingUnits || 0) + ' / ' +
      Number(state.quota.allocatedUnits || 0) + '</span>' +
      '<span class="quota-chip__budget">Remaining budget ' + escapeHtml(remainingBudget) + '</span>';
    var generate = el('generateButton');
    if (generate && !generate.classList.contains('d-none')) {
      generate.disabled = Number(state.quota.remainingUnits || 0) < 1;
    }
  }

  async function loadQuota() {
    state.budgetSummary = await service().getMidwifeBudgetSummary(state.user.uid);
    state.quota = state.budgetSummary && state.budgetSummary.quota
      ? state.budgetSummary.quota
      : await service().getAccountQuota(state.user.uid);
    renderQuota();
    if (!state.quota || state.quota.status !== 'active') {
      throw new Error('No voucher allocation is available for this account.');
    }
  }

  function assignedLabName(quota, labs) {
    if (quota && quota.labName) return quota.labName;
    var labId = quota && quota.labId;
    var match = (labs || []).find(function (lab) { return lab.id === labId; });
    return match ? (match.name || match.labName || match.displayName || labId) : (labId || '');
  }

  function renderAssignedLab() {
    var display = el('assignedLabDisplay');
    var hidden = el('selectedLab');
    if (!display || !hidden) return;
    if (!state.quota || !state.quota.labId) {
      state.labId = '';
      hidden.value = '';
      display.textContent = 'No laboratory assigned. Ask the Program Officer to assign a lab.';
      return;
    }
    state.labId = state.quota.labId;
    hidden.value = state.quota.labId;
    display.textContent = assignedLabName(state.quota, state.labs) || state.quota.labId;
  }

  async function loadAssignedLab() {
    var rows = await service().listLabs();
    state.labs = rows || [];
    renderAssignedLab();
    if (!state.quota || !state.quota.labId) {
      throw new Error('Ask the Program Officer to assign a laboratory before generating a QR.');
    }
  }

  async function loadTestCatalog() {
    state.labId = (state.quota && state.quota.labId) || el('selectedLab').value;
    if (!state.labId) {
      state.tests = [];
      state.projectCeilingMinor = 0;
      el('testsBody').innerHTML = '<p class="text-muted mb-0">Ask the Program Officer to assign a laboratory first.</p>';
      updatePriceSummary();
      return;
    }
    var result = await service().getTestCatalog(state.labId);
    state.projectCeilingMinor = Number(result.projectCeilingMinor) || 0;
    state.tests = (result.tests || []).map(function (row, index) {
      return {
        id: String(row.id || ('test-' + index)),
        name: row.name,
        clientCopayMinor: Number(row.clientCopayMinor) || 0,
        projectContributionMinor: Number(row.projectContributionMinor) || 0
      };
    });
    renderTests();
    updatePriceSummary();
  }

  function renderTests() {
    if (!state.tests.length) {
      el('testsBody').innerHTML = '<p class="text-muted mb-0">No tests are configured for the assigned laboratory.</p>';
      return;
    }
    el('testsBody').innerHTML = state.tests.map(function (test, index) {
      return '<label class="mw-test-chip">' +
        '<input class="test-select" type="checkbox" data-index="' + index + '" aria-label="Select ' +
        escapeHtml(test.name) + '">' +
        '<span class="mw-test-chip__name">' + escapeHtml(test.name) + '</span></label>';
    }).join('');
  }

  function selectedTests() {
    return Array.from(el('testsBody').querySelectorAll('.test-select:checked')).map(function (box) {
      return state.tests[Number(box.getAttribute('data-index'))];
    }).filter(Boolean);
  }

  function updatePriceSummary() {
    var summary = el('priceSummary');
    var rows = el('priceSummaryRows');
    var ceilingNote = el('ceilingNote');
    var selected = selectedTests();
    if (!summary || !rows) return;
    if (!selected.length) {
      summary.hidden = true;
      rows.innerHTML = '';
      if (ceilingNote) ceilingNote.hidden = true;
      return;
    }
    var lineItems = selected.map(function (test) {
      return {
        serviceId: test.id,
        serviceName: test.name,
        regularPriceMinor: 0,
        labCostShareMinor: 0,
        subsidizedCostMinor: (test.projectContributionMinor || 0) + (test.clientCopayMinor || 0),
        clientCopayMinor: test.clientCopayMinor || 0,
        projectContributionMinor: test.projectContributionMinor || 0
      };
    });
    var capped = pricing().applyProjectCeiling(lineItems, state.projectCeilingMinor);
    rows.innerHTML = capped.lineItems.map(function (item) {
      return '<div class="mw-price-summary__row">' +
        '<span>' + escapeHtml(item.serviceName) + '</span>' +
        '<span>Project ' + escapeHtml(formatMoney(item.projectContributionMinor / 100)) + '</span>' +
        '<span>Client ' + escapeHtml(formatMoney(item.clientCopayMinor / 100)) + '</span>' +
        '</div>';
    }).join('');
    el('totalProject').textContent = formatMoney(capped.totals.projectContributionMinor / 100);
    el('totalClient').textContent = formatMoney(capped.totals.clientCopayMinor / 100);
    if (ceilingNote) {
      if (capped.ceilingAppliedMinor > 0) {
        ceilingNote.hidden = false;
        ceilingNote.textContent = 'Project ceiling applied (' +
          formatMoney(state.projectCeilingMinor / 100) +
          '). Excess moved to client co-payment.';
      } else {
        ceilingNote.hidden = true;
        ceilingNote.textContent = '';
      }
    }
    summary.hidden = false;
  }

  function setPostGenerateMode(active) {
    var generate = el('generateButton');
    var back = el('afterGenerateBack');
    if (!generate || !back) return;
    if (active) {
      generate.classList.add('d-none');
      generate.disabled = true;
      back.classList.remove('d-none');
      back.href = ancHubHref();
    } else {
      generate.classList.remove('d-none');
      back.classList.add('d-none');
      generate.disabled = Number(state.quota && state.quota.remainingUnits) < 1;
    }
  }

  function renderQrCard(voucher) {
    var code = voucher.code || voucher.id;
    if (!code) throw new Error('Voucher service did not return a voucher code.');
    var qrPayload = voucher.qrPayload || service().buildQrPayload(code);
    var codeNode = requireEl('voucherCode');
    var qrNode = requireEl('voucherQr');
    var resultNode = requireEl('voucherResult');
    codeNode.textContent = code;
    qrNode.innerHTML = '';
    if (typeof window.QRCode !== 'function') {
      throw new Error('QR library did not load. Check the internet connection and try again.');
    }
    new window.QRCode(qrNode, {
      text: qrPayload,
      width: 156,
      height: 156,
      correctLevel: window.QRCode.CorrectLevel.M
    });
    var issuedDate = voucher.ancVisitDate || (el('ancVisitDate') && el('ancVisitDate').value) || voucher.issuedAt;
    var issuedBy = midwifeAccountName(state.profile, state.user) || voucher.issuerNameSnapshot || '';
    if (el('qrIssuedDate')) el('qrIssuedDate').textContent = formatCardDate(issuedDate);
    if (el('qrIssuedBy')) el('qrIssuedBy').textContent = issuedBy || '—';
    resultNode.classList.add('show');
    resultNode.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function savePatientAddress(address) {
    await firebase.firestore().collection('patients').doc(state.patientId).update({
      patient_address: address,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    state.patient.patient_address = address;
  }

  async function generate(event) {
    event.preventDefault();
    var button = el('generateButton');
    try {
      assertOnline();
      var tests = selectedTests();
      if (!tests.length) throw new Error('Select at least one lab test.');
      if (!el('ancVisitDate').value) throw new Error('Enter the QR issued date.');
      if (!state.labId) throw new Error('Ask the Program Officer to assign a laboratory before generating a QR.');
      if (!state.quota || Number(state.quota.remainingUnits || 0) < 1) {
        throw new Error('No remaining voucher allocation is available.');
      }
      button.disabled = true;
      setStatus('Generating QR securely…', 'info');
      var address = el('patientAddress').value.trim();
      if (address) await savePatientAddress(address);
      var result = await service().issueVoucher({
        patientId: state.patientId,
        labId: state.labId,
        selectedServiceIds: tests.map(function (test) { return test.id; }),
        nrc: el('patientNrc').value.trim(),
        address: address,
        ancVisitDate: el('ancVisitDate').value,
        issuerName: midwifeAccountName(state.profile, state.user) || issuerDisplayName(state.profile, state.user),
        expiresAt: new Date(Date.now() + (90 * 24 * 60 * 60 * 1000))
      });
      state.voucher = result;
      renderQrCard(state.voucher);
      await loadQuota();
      setPostGenerateMode(true);
      setStatus('QR generated successfully. Use Back to ANC when finished.', 'success');
    } catch (error) {
      console.error('[PromoVoucher]', error);
      setStatus(error.message || 'Unable to generate QR.', 'error');
      setPostGenerateMode(false);
    }
  }

  function waitForVoucherImages() {
    var images = Array.from(el('a5Voucher').querySelectorAll('img'));
    return Promise.all(images.map(function (image) {
      if (image.complete && image.naturalWidth) return Promise.resolve();
      return new Promise(function (resolve) {
        image.addEventListener('load', resolve, { once: true });
        image.addEventListener('error', resolve, { once: true });
      });
    })).then(function () {
      return new Promise(function (resolve) { requestAnimationFrame(function () { resolve(); }); });
    });
  }

  async function downloadPng() {
    var button = el('downloadButton');
    try {
      assertOnline();
      if (typeof window.html2canvas !== 'function') throw new Error('PNG export library is unavailable.');
      if (!state.voucher) throw new Error('Generate a QR before downloading it.');
      button.disabled = true;
      await waitForVoucherImages();
      var sheet = el('a5Voucher');
      var canvas = await window.html2canvas(sheet, {
        backgroundColor: '#ffffff',
        scale: 2,
        useCORS: true,
        logging: false,
        width: sheet.offsetWidth,
        height: sheet.offsetHeight
      });
      var link = document.createElement('a');
      link.download = 'promo-voucher-' + String(el('voucherCode').textContent || 'qr').replace(/[^A-Za-z0-9_-]/g, '_') + '.png';
      link.href = canvas.toDataURL('image/png');
      link.click();
      setStatus('QR PNG downloaded.', 'success');
    } catch (error) {
      setStatus(error.message || 'Could not download QR.', 'error');
    } finally {
      button.disabled = false;
    }
  }

  async function initialize(user) {
    try {
      assertOnline();
      state.user = user;
      state.patientId = resolvePatientId();
      if (!state.patientId) throw new Error('No patient selected. Open this page from a selected patient or add ?patientId=…');
      el('backLink').href = ancHubHref();
      el('afterGenerateBack').href = ancHubHref();

      var db = firebase.firestore();
      var results = await Promise.all([
        db.collection('users').doc(user.uid).get(),
        db.collection('patients').doc(state.patientId).get()
      ]);
      if (!results[0].exists) throw new Error('Account profile not found.');
      state.profile = results[0].data() || {};
      if (normalizedRole(state.profile.role) !== 'midwife' ||
          state.profile.active === false || state.profile.approved === false) {
        throw new Error('This page is available to active Midwife accounts only.');
      }
      if (!results[1].exists) throw new Error('Selected patient was not found.');
      state.patient = results[1].data() || {};

      sessionStorage.setItem('selectedPatientId', state.patientId);
      el('patientName').textContent = text(patientName(state.patient));
      el('patientAge').textContent = text(patientAge(state.patient));
      el('patientPhone').textContent = text(state.patient.phone);
      el('patientNrc').value = state.patient.nrc || state.patient.NRC || '';
      el('patientAddress').value = patientAddress(state.patient);
      el('issuerName').textContent = text(issuerDisplayName(state.profile, user));
      el('ancVisitDate').value = todayInputValue();
      await loadQuota();
      await loadAssignedLab();
      await loadTestCatalog();
      el('voucherForm').classList.remove('d-none');
      setPostGenerateMode(false);
      setStatus('Select tests for the assigned laboratory, then generate the QR.', 'success');
    } catch (error) {
      console.error('[PromoVoucher]', error);
      setStatus(error.message || 'Unable to load QR page.', 'error');
    }
  }

  el('testsBody').addEventListener('change', function (event) {
    if (event.target && event.target.classList.contains('test-select')) updatePriceSummary();
  });
  el('voucherForm').addEventListener('submit', generate);
  el('downloadButton').addEventListener('click', downloadPng);
  el('selectAllTests').addEventListener('click', function () {
    var boxes = Array.from(document.querySelectorAll('.test-select'));
    var shouldSelect = boxes.some(function (box) { return !box.checked; });
    boxes.forEach(function (box) { box.checked = shouldSelect; });
    this.textContent = shouldSelect ? 'Clear all' : 'Select all';
    updatePriceSummary();
  });
  window.addEventListener('offline', function () {
    setStatus('QR generation is online-only. Reconnect before continuing.', 'warning');
    el('generateButton').disabled = true;
  });
  window.addEventListener('online', function () {
    setStatus('Connection restored.', 'success');
    renderQuota();
  });

  firebase.auth().onAuthStateChanged(function (user) {
    if (!user) {
      window.location.replace('login.html?redirect=' + encodeURIComponent(window.location.pathname + window.location.search));
      return;
    }
    initialize(user);
  });
})();
