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
    quota: null
  };

  function el(id) { return document.getElementById(id); }
  function requireEl(id) {
    var node = el(id);
    if (!node) throw new Error('Voucher page is out of date. Refresh once, then generate again.');
    return node;
  }
  function text(value) { return value === undefined || value === null || value === '' ? '—' : String(value); }
  function escapeHtml(value) {
    return String(value === undefined || value === null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }
  function normalizedRole(role) { return String(role || '').trim().toLowerCase().replace(/\s+/g, ' '); }
  function money(value) {
    return Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });
  }
  function setStatus(message, kind) {
    var box = el('pageStatus');
    box.textContent = message;
    box.className = 'status-box ' + (kind || 'info');
  }
  function assertOnline() {
    if (navigator.onLine === false) throw new Error('Voucher generation is online-only. Please reconnect and try again.');
  }
  function service() { return window.VoucherService || null; }

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

  function renderQuota() {
    var chip = el('quotaChip');
    if (!chip) return;
    if (!state.quota) {
      chip.textContent = 'No allocation';
      chip.classList.add('is-empty');
      return;
    }
    chip.classList.remove('is-empty');
    chip.textContent = 'Allocation ' + Number(state.quota.remainingUnits || 0) + ' / ' + Number(state.quota.allocatedUnits || 0);
    var generate = el('generateButton');
    if (generate) generate.disabled = Number(state.quota.remainingUnits || 0) < 1;
  }

  async function loadQuota() {
    state.quota = await service().getAccountQuota(state.user.uid);
    renderQuota();
    if (!state.quota || state.quota.status !== 'active') {
      throw new Error('No voucher allocation is available for this account.');
    }
  }

  async function loadLabs() {
    var rows = await service().listLabs();
    state.labs = rows || [];
    el('selectedLab').innerHTML = '<option value="">Select the laboratory</option>' +
      state.labs.map(function (lab) {
        return '<option value="' + escapeHtml(lab.id) + '">' + escapeHtml(lab.name) + '</option>';
      }).join('');
    if (!state.labs.length) {
      throw new Error('No active laboratory accounts are available. Ask the Program Officer to configure a Lab.');
    }
  }

  async function loadTestCatalog() {
    state.labId = el('selectedLab').value;
    if (!state.labId) {
      state.tests = [];
      el('testsBody').innerHTML = '<tr><td colspan="6" class="text-center text-muted">Select a laboratory to load its prices.</td></tr>';
      updateTotals();
      return;
    }
    var result = await service().getTestCatalog(state.labId);
    state.tests = (result.tests || []).map(function (row, index) {
      return {
        id: String(row.id || ('test-' + index)),
        name: row.name,
        regularPrice: Number(row.regularPrice || 0),
        labCostShare: Number(row.labCostShare || 0),
        subsidizedCost: Number(row.subsidizedCost || 0),
        clientCostShare: Number(row.clientCostShare || 0),
        projectCostShare: Number(row.projectCostShare || 0)
      };
    });
    renderTests();
  }

  function renderTests() {
    if (!state.tests.length) {
      el('testsBody').innerHTML = '<tr><td colspan="6" class="text-center text-muted">Select a laboratory to load its prices.</td></tr>';
      updateTotals();
      return;
    }
    el('testsBody').innerHTML = state.tests.map(function (test, index) {
      return '<tr data-index="' + index + '">' +
        '<td><input class="form-check-input test-select" type="checkbox" aria-label="Select ' + escapeHtml(test.name) + '"></td>' +
        '<td class="fw-semibold">' + escapeHtml(test.name) + '</td>' +
        '<td class="money">' + money(test.regularPrice) + '</td>' +
        '<td class="money">' + money(test.labCostShare) + '</td>' +
        '<td class="money">' + money(test.clientCostShare) + '</td>' +
        '<td class="money">' + money(test.projectCostShare) + '</td>' +
      '</tr>';
    }).join('');
    updateTotals();
  }

  function selectedTests() {
    return Array.from(el('testsBody').querySelectorAll('tr')).filter(function (row) {
      var box = row.querySelector('.test-select');
      return box && box.checked;
    }).map(function (row) {
      return state.tests[Number(row.dataset.index)];
    }).filter(Boolean);
  }

  function updateTotals() {
    var totals = selectedTests().reduce(function (sum, row) {
      sum.regular += Number(row.regularPrice) || 0;
      sum.lab += Number(row.labCostShare) || 0;
      sum.client += Number(row.clientCostShare) || 0;
      sum.project += Number(row.projectCostShare) || 0;
      return sum;
    }, { regular: 0, lab: 0, client: 0, project: 0 });
    el('totalRegular').textContent = money(totals.regular);
    el('totalLabShare').textContent = money(totals.lab);
    el('totalClient').textContent = money(totals.client);
    el('totalProject').textContent = money(totals.project);
  }

  function renderInvoice(voucher) {
    var model = window.VoucherInvoice.modelFromVoucher(voucher, {
      client: {
        name: patientName(state.patient),
        nrc: el('patientNrc').value.trim(),
        phone: state.patient.phone || '',
        address: el('patientAddress').value.trim()
      }
    });
    window.VoucherInvoice.render(requireEl('invoiceMount'), model);
    requireEl('voucherResult').classList.add('show');
    requireEl('voucherResult').scrollIntoView({ behavior: 'smooth', block: 'start' });
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
      if (!el('ancVisitDate').value) throw new Error('Enter the latest ANC visit date.');
      if (!el('selectedLab').value) throw new Error('Select the laboratory that will receive this voucher.');
      if (!state.quota || Number(state.quota.remainingUnits || 0) < 1) {
        throw new Error('No remaining voucher allocation is available.');
      }
      button.disabled = true;
      setStatus('Generating voucher securely…', 'info');
      var address = el('patientAddress').value.trim();
      if (address) await savePatientAddress(address);
      var result = await service().issueVoucher({
        patientId: state.patientId,
        labId: el('selectedLab').value,
        selectedServiceIds: tests.map(function (test) { return test.id; }),
        nrc: el('patientNrc').value.trim(),
        address: address,
        ancVisitDate: el('ancVisitDate').value,
        issuerName: issuerDisplayName(state.profile, state.user),
        expiresAt: new Date(Date.now() + (90 * 24 * 60 * 60 * 1000))
      });
      state.voucher = Object.assign({}, result, {
        patientNameSnapshot: patientName(state.patient),
        patientAgeSnapshot: patientAge(state.patient),
        patientPhoneSnapshot: state.patient.phone || '',
        patientNrcSnapshot: el('patientNrc').value.trim(),
        patientAddressSnapshot: address,
        selectedServiceIds: tests.map(function (test) { return test.id; }),
        lineItems: result.lineItems || tests.map(function (test) {
          return {
            serviceId: test.id,
            serviceName: test.name,
            regularPriceMinor: Math.round(test.regularPrice * 100),
            labCostShareMinor: Math.round(test.labCostShare * 100),
            clientCopayMinor: Math.round(test.clientCostShare * 100),
            projectContributionMinor: Math.round(test.projectCostShare * 100)
          };
        }),
        totals: result.totals,
        issuedAt: new Date()
      });
      renderInvoice(state.voucher);
      await loadQuota();
      setStatus('Voucher generated successfully.', 'success');
    } catch (error) {
      console.error('[PromoVoucher]', error);
      setStatus(error.message || 'Unable to generate voucher.', 'error');
    } finally {
      button.disabled = Number(state.quota && state.quota.remainingUnits) < 1;
    }
  }

  async function downloadPng() {
    var button = el('downloadButton');
    try {
      assertOnline();
      button.disabled = true;
      var sheet = document.getElementById('invoiceSheet');
      if (!sheet) throw new Error('Generate a voucher before downloading it.');
      await window.VoucherInvoice.downloadPng(sheet, 'laboratory-invoice-' + (state.voucher && state.voucher.code || 'voucher') + '.png');
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
      el('patientName').textContent = text(patientName(state.patient));
      el('patientAge').textContent = text(patientAge(state.patient));
      el('patientPhone').textContent = text(state.patient.phone);
      el('patientNrc').value = state.patient.nrc || state.patient.NRC || '';
      el('patientAddress').value = patientAddress(state.patient);
      el('issuerName').textContent = text(issuerDisplayName(state.profile, user));
      el('ancVisitDate').value = await latestAncDate(db);
      await loadQuota();
      await loadLabs();
      await loadTestCatalog();
      el('voucherForm').classList.remove('d-none');
      setStatus('Select a laboratory, then generate an online voucher.', 'success');
    } catch (error) {
      console.error('[PromoVoucher]', error);
      setStatus(error.message || 'Unable to load voucher page.', 'error');
    }
  }

  el('testsBody').addEventListener('input', updateTotals);
  el('testsBody').addEventListener('change', updateTotals);
  el('selectedLab').addEventListener('change', function () {
    loadTestCatalog().catch(function (error) {
      setStatus(error.message || 'Could not load laboratory prices.', 'error');
    });
  });
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
