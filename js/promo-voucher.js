(function () {
  'use strict';

  var state = { user: null, profile: null, patientId: '', patient: null, tests: [], voucher: null };
  var defaultTests = [
    { id: 'cbc', name: 'Complete Blood Count (CBC)', subsidizedCost: 0, clientCostShare: 0, projectCostShare: 0 },
    { id: 'urine-re', name: 'Urine Routine Examination', subsidizedCost: 0, clientCostShare: 0, projectCostShare: 0 },
    { id: 'blood-group', name: 'Blood Group and Rh', subsidizedCost: 0, clientCostShare: 0, projectCostShare: 0 },
    { id: 'hiv', name: 'HIV Screening', subsidizedCost: 0, clientCostShare: 0, projectCostShare: 0 },
    { id: 'hbsag', name: 'HBsAg', subsidizedCost: 0, clientCostShare: 0, projectCostShare: 0 },
    { id: 'syphilis', name: 'Syphilis Screening', subsidizedCost: 0, clientCostShare: 0, projectCostShare: 0 }
  ];

  function el(id) { return document.getElementById(id); }
  function text(value) { return value === undefined || value === null || value === '' ? '—' : String(value); }
  function escapeHtml(value) {
    return String(value === undefined || value === null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }
  function normalizedRole(role) { return String(role || '').trim().toLowerCase().replace(/\s+/g, ' '); }
  function money(value) {
    return Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }
  function setStatus(message, kind) {
    var box = el('pageStatus');
    box.textContent = message;
    box.className = 'status-box ' + (kind || 'info');
  }
  function assertOnline() {
    if (navigator.onLine === false) throw new Error('Voucher generation is online-only. Please reconnect and try again.');
  }

  function service() {
    return window.VoucherService || window.voucherService || null;
  }
  async function callService(names, args, optional) {
    var api = service();
    for (var i = 0; api && i < names.length; i++) {
      if (typeof api[names[i]] === 'function') return api[names[i]].apply(api, args || []);
    }
    if (optional) return null;
    throw new Error('Voucher service is unavailable. Expected: ' + names.join(' or ') + '.');
  }
  function findCreateMethod() {
    var api = service();
    var names = ['createVoucher', 'generateVoucher', 'issueVoucher'];
    for (var i = 0; api && i < names.length; i++) {
      if (typeof api[names[i]] === 'function') return { api: api, fn: api[names[i]], name: names[i] };
    }
    throw new Error('Voucher service is unavailable. Expected: ' + names.join(' or ') + '.');
  }

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
  function toDateInput(value) {
    if (!value) return '';
    var date = value.toDate ? value.toDate() : new Date(value);
    if (isNaN(date.getTime())) return '';
    return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
  }
  function visitTime(visit) {
    var value = visit.visitDate || visit.visit_date || visit.timestamp || visit.createdAt;
    var date = value && value.toDate ? value.toDate() : new Date(value || 0);
    return isNaN(date.getTime()) ? 0 : date.getTime();
  }

  async function latestAncDate(db) {
    var ref = db.collection('patients').doc(state.patientId).collection('antenatal_visits');
    try {
      var ordered = await ref.orderBy('visitDate', 'desc').limit(1).get();
      if (!ordered.empty) return toDateInput(ordered.docs[0].data().visitDate);
    } catch (error) {
      console.warn('[PromoVoucher] Ordered ANC lookup failed; trying compatibility lookup.', error);
    }
    var snapshot = await ref.get();
    var visits = snapshot.docs.map(function (doc) { return doc.data() || {}; });
    visits.sort(function (a, b) { return visitTime(b) - visitTime(a); });
    return visits.length ? toDateInput(visits[0].visitDate || visits[0].visit_date || visits[0].timestamp || visits[0].createdAt) : '';
  }

  function issuerDisplayName(profile, user) {
    var facility = profile.maternityHomeName || profile.maternity_home_name || profile.facilityName || profile.facility;
    if (!facility && profile.facility_code && window.FacilityConfig) {
      var record = FacilityConfig.getFacilityByCode(profile.facility_code);
      facility = record && FacilityConfig.getFacilityLabel(record, 'en');
    }
    var account = profile.name || profile.midwife_name || profile.midwifeName || profile.displayName || user.displayName || user.email;
    return [facility, account].filter(Boolean).join(' / ');
  }

  async function loadTestCatalog() {
    var result = await callService(['getTestCatalog', 'listTests', 'getVoucherTests'], [], true);
    var rows = result && (result.tests || result.items || result);
    if (!Array.isArray(rows) || !rows.length) {
      var api = service();
      if (api && api.collections && api.collections.QUOTAS) {
        var quotaSnapshot = await firebase.firestore().collection(api.collections.QUOTAS)
          .where('midwifeId', '==', state.user.uid).get();
        rows = quotaSnapshot.docs.map(function (doc) {
          var quota = doc.data() || {};
          return {
            id: quota.serviceId || doc.id,
            quotaId: doc.id,
            name: quota.serviceNameSnapshot || quota.serviceCodeSnapshot || quota.serviceId,
            subsidizedCost: Number(quota.unitPriceMinor || 0) / 100,
            clientCostShare: 0,
            projectCostShare: Number(quota.unitPriceMinor || 0) / 100,
            disabled: quota.status !== 'active' || Number(quota.remainingUnits || 0) < 1
          };
        });
      }
    }
    if (!Array.isArray(rows) || !rows.length) rows = defaultTests;
    state.tests = rows.map(function (row, index) {
      return {
        id: String(row.id || row.code || ('test-' + index)),
        quotaId: row.quotaId || null,
        name: row.name || row.testName || row.label || ('Test ' + (index + 1)),
        subsidizedCost: Number(row.subsidizedCost || row.subsidized_cost || 0),
        clientCostShare: Number(row.clientCostShare || row.client_cost_share || 0),
        projectCostShare: Number(row.projectCostShare || row.project_cost_share || 0),
        disabled: row.disabled === true
      };
    });
    renderTests();
  }

  function renderTests() {
    el('testsBody').innerHTML = state.tests.map(function (test, index) {
      return '<tr data-index="' + index + '">' +
        '<td><input class="form-check-input test-select" type="checkbox" ' + (test.disabled ? 'disabled ' : '') +
          'aria-label="Select ' + escapeHtml(test.name) + '"></td>' +
        '<td class="fw-semibold">' + escapeHtml(test.name) + '</td>' +
        '<td class="money">' + money(test.subsidizedCost) + '</td>' +
        '<td class="money">' + money(test.clientCostShare) + '</td>' +
        '<td class="money">' + money(test.projectCostShare) + '</td>' +
      '</tr>';
    }).join('');
    el('testsBody').addEventListener('input', updateTotals);
    el('testsBody').addEventListener('change', updateTotals);
    updateTotals();
  }
  function selectedTests() {
    return Array.from(el('testsBody').querySelectorAll('tr')).filter(function (row) {
      return row.querySelector('.test-select').checked;
    }).map(function (row) {
      var source = state.tests[Number(row.dataset.index)];
      return {
        id: source.id,
        name: source.name,
        subsidizedCost: source.subsidizedCost,
        clientCostShare: source.clientCostShare,
        projectCostShare: source.projectCostShare
      };
    });
  }
  function updateTotals() {
    var totals = selectedTests().reduce(function (sum, row) {
      sum.subsidized += row.subsidizedCost;
      sum.client += row.clientCostShare;
      sum.project += row.projectCostShare;
      return sum;
    }, { subsidized: 0, client: 0, project: 0 });
    el('totalSubsidized').textContent = money(totals.subsidized);
    el('totalClient').textContent = money(totals.client);
    el('totalProject').textContent = money(totals.project);
  }

  function validateTests(tests) {
    if (!tests.length) throw new Error('Select at least one lab test.');
    tests.forEach(function (test) {
      ['subsidizedCost', 'clientCostShare', 'projectCostShare'].forEach(function (key) {
        if (!Number.isFinite(test[key]) || test[key] < 0) throw new Error('Costs must be valid non-negative numbers.');
      });
      if (Math.abs(test.subsidizedCost - test.clientCostShare - test.projectCostShare) > 0.01) {
        throw new Error(test.name + ': client and project shares must equal the subsidized cost.');
      }
    });
  }

  function voucherRecord(result) {
    return result && (result.voucher || result.data || result);
  }
  function renderVoucher(voucher, tests) {
    var code = voucher.code || voucher.voucherCode || voucher.opaqueCode || voucher.id;
    if (!code) throw new Error('Voucher service did not return an opaque voucher code.');
    var qrPayload = voucher.qrPayload || voucher.redeemUrl || voucher.redemptionUrl ||
      new URL('lab-vouchers.html?code=' + encodeURIComponent(code), window.location.href).href;
    var generatedAt = voucher.generatedAt || voucher.createdAt || new Date().toISOString();
    var generatedBy = voucher.generatedByName || voucher.issuerName || issuerDisplayName(state.profile, state.user);
    var patientRef = voucher.patientReference || voucher.patientRef || state.patientId;

    el('voucherCode').textContent = code;
    el('voucherPatientRef').textContent = patientRef;
    el('voucherGeneratedBy').textContent = generatedBy;
    el('voucherGeneratedAt').textContent = new Date(generatedAt && generatedAt.toDate ? generatedAt.toDate() : generatedAt).toLocaleString();
    el('voucherTests').innerHTML = tests.map(function (test) {
      return '<tr><td>' + escapeHtml(test.name) + '</td><td class="money">' + money(test.subsidizedCost) +
        '</td><td class="money">' + money(test.clientCostShare) +
        '</td><td class="money">' + money(test.projectCostShare) + '</td></tr>';
    }).join('');
    el('voucherQr').innerHTML = '';
    if (typeof window.QRCode !== 'function') throw new Error('QR library did not load. Check the internet connection and try again.');
    new window.QRCode(el('voucherQr'), { text: qrPayload, width: 220, height: 220, correctLevel: window.QRCode.CorrectLevel.M });
    el('voucherResult').classList.add('show');
    el('voucherResult').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function generate(event) {
    event.preventDefault();
    var button = el('generateButton');
    try {
      assertOnline();
      var tests = selectedTests();
      validateTests(tests);
      if (!el('ancVisitDate').value) throw new Error('Enter the latest ANC visit date.');
      button.disabled = true;
      setStatus('Generating voucher securely…', 'info');
      var payload = {
        patientId: state.patientId,
        patientReference: state.patientId,
        patient: {
          name: patientName(state.patient),
          age: patientAge(state.patient),
          phone: state.patient.phone || '',
          nrc: state.patient.nrc || state.patient.NRC || ''
        },
        ancVisitDate: el('ancVisitDate').value,
        issuer: {
          uid: state.user.uid,
          displayName: issuerDisplayName(state.profile, state.user),
          maternityHome: state.profile.maternityHomeName || state.profile.maternity_home_name || state.profile.facilityName || ''
        },
        tests: tests
      };
      var createMethod = findCreateMethod();
      var result = await createMethod.fn.call(createMethod.api, {
        patientId: state.patientId,
        selectedServiceIds: tests.map(function (test) { return test.id; }),
        nrc: el('patientNrc').value.trim(),
        ancVisitDate: payload.ancVisitDate,
        issuerName: payload.issuer.displayName,
        expiresAt: new Date(Date.now() + (90 * 24 * 60 * 60 * 1000))
      });
      state.voucher = Object.assign({}, voucherRecord(result), {
        patientReference: payload.patientReference,
        generatedByName: payload.issuer.displayName,
        generatedAt: new Date().toISOString()
      });
      renderVoucher(state.voucher, tests);
      setStatus('Voucher generated successfully.', 'success');
    } catch (error) {
      console.error('[PromoVoucher]', error);
      setStatus(error.message || 'Unable to generate voucher.', 'error');
    } finally {
      button.disabled = false;
    }
  }

  async function downloadPng() {
    var button = el('downloadButton');
    try {
      assertOnline();
      if (typeof window.html2canvas !== 'function') throw new Error('PNG export library is unavailable.');
      button.disabled = true;
      var canvas = await window.html2canvas(el('a5Voucher'), {
        backgroundColor: '#ffffff', scale: 2, useCORS: true, logging: false, width: 559, height: 794
      });
      var link = document.createElement('a');
      link.download = 'promo-voucher-' + String(el('voucherCode').textContent).replace(/[^A-Za-z0-9_-]/g, '_') + '.png';
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (error) {
      setStatus(error.message || 'Could not download voucher.', 'error');
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
      el('backLink').href = 'patient-care-hub.html?patient=' + encodeURIComponent(state.patientId);

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
      sessionStorage.setItem('selectedPatientData', JSON.stringify(Object.assign({ id: state.patientId }, state.patient)));
      el('patientName').textContent = text(patientName(state.patient));
      el('patientAge').textContent = text(patientAge(state.patient));
      el('patientPhone').textContent = text(state.patient.phone);
      el('patientNrc').value = state.patient.nrc || state.patient.NRC || '';
      el('issuerName').textContent = text(issuerDisplayName(state.profile, user));
      el('ancVisitDate').value = await latestAncDate(db);
      await loadTestCatalog();
      el('voucherForm').classList.remove('d-none');
      setStatus('Ready to generate an online voucher.', 'success');
    } catch (error) {
      console.error('[PromoVoucher]', error);
      setStatus(error.message || 'Unable to load voucher page.', 'error');
    }
  }

  el('voucherForm').addEventListener('submit', generate);
  el('downloadButton').addEventListener('click', downloadPng);
  el('selectAllTests').addEventListener('click', function () {
    var boxes = Array.from(document.querySelectorAll('.test-select'));
    var shouldSelect = boxes.some(function (box) { return !box.checked; });
    boxes.forEach(function (box) { box.checked = shouldSelect; });
    this.textContent = shouldSelect ? 'Clear all' : 'Select all';
    updateTotals();
  });
  window.addEventListener('offline', function () {
    setStatus('Voucher generation is online-only. Reconnect before continuing.', 'warning');
    el('generateButton').disabled = true;
  });
  window.addEventListener('online', function () {
    setStatus('Connection restored.', 'success');
    el('generateButton').disabled = false;
  });

  firebase.auth().onAuthStateChanged(function (user) {
    if (!user) {
      window.location.replace('login.html?redirect=' + encodeURIComponent(window.location.pathname + window.location.search));
      return;
    }
    initialize(user);
  });
})();
