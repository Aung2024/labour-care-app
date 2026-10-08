(function () {
  'use strict';

  var state = {
    currentUser: null,
    labs: [],
    maternityHomes: [],
    allocations: [],
    queue: [],
    selectedCodes: {},
    dashItems: [],
    payCodes: [],
    payProofDataUrl: '',
    dashStatusFilter: null,
    allocationsLoaded: false,
    poSettings: null,
    poPad: null,
    editingSignature: false,
    page: 'dashboard',
    navCollapsed: false,
    loggingOut: false
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
    if (state.loggingOut) return;
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
  function officerDisplayName(name) {
    var value = String(name || '').trim();
    if (!value || /^(test\s+)?program(me)?\s+officer$/i.test(value)) return 'Project Account';
    return value;
  }
  function officerInvoiceName(name) {
    var value = String(name || '').trim();
    if (!value || /^(test\s+)?program(me)?\s+officer$/i.test(value) || /^project account$/i.test(value)) {
      return '';
    }
    return value;
  }
  function sharesOf(row) {
    if (service().voucherShareMinors) return service().voucherShareMinors(row);
    var totals = (row && row.totals) || {};
    return {
      clientMinor: Number(totals.clientCopayMinor) || 0,
      projectMinor: Number(totals.projectContributionMinor) || 0
    };
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

  function fillMultiSelect(root, items, allLabel) {
    if (!root) return;
    var selected = {};
    Array.from(root.querySelectorAll('input[type="checkbox"]:checked')).forEach(function (box) {
      selected[box.value] = true;
    });
    root.setAttribute('data-all-label', allLabel);
    var panel = root.querySelector('.po-multi__panel');
    if (!panel) return;
    panel.innerHTML = items.length
      ? items.map(function (item) {
        return '<label class="po-multi__option">' +
          '<input type="checkbox" value="' + escapeHtml(item.id) + '"' +
          (selected[item.id] ? ' checked' : '') + '>' +
          '<span>' + escapeHtml(profileName(item)) + '</span></label>';
      }).join('')
      : '<p class="po-multi__empty">No accounts</p>';
    updateMultiToggle(root);
  }

  function selectedMultiIds(root) {
    if (!root) return [];
    var boxes = Array.from(root.querySelectorAll('input[type="checkbox"]'));
    var checked = boxes.filter(function (box) { return box.checked; }).map(function (box) {
      return box.value;
    });
    if (!checked.length || checked.length === boxes.length) return [];
    return checked;
  }

  function updateMultiToggle(root) {
    if (!root) return;
    var toggle = root.querySelector('.po-multi__toggle');
    if (!toggle) return;
    var allLabel = root.getAttribute('data-all-label') || 'All';
    var boxes = Array.from(root.querySelectorAll('input[type="checkbox"]'));
    var checked = boxes.filter(function (box) { return box.checked; });
    if (!checked.length || checked.length === boxes.length) {
      toggle.textContent = allLabel;
      return;
    }
    if (checked.length === 1) {
      var label = checked[0].closest('label');
      toggle.textContent = (label && label.textContent.trim()) || '1 selected';
      return;
    }
    toggle.textContent = checked.length + ' selected';
  }

  function closeOpenMultis(except) {
    document.querySelectorAll('.po-multi').forEach(function (root) {
      if (except && root === except) return;
      var panel = root.querySelector('.po-multi__panel');
      var toggle = root.querySelector('.po-multi__toggle');
      if (panel) panel.hidden = true;
      if (toggle) toggle.setAttribute('aria-expanded', 'false');
    });
  }

  function matchesMulti(ids, value) {
    if (!ids || !ids.length) return true;
    return ids.indexOf(value) !== -1;
  }

  function selectedBillingRange(yearSelect, monthSelect) {
    var year = yearSelect && yearSelect.value;
    var month = monthSelect && monthSelect.value;
    if (year && year !== 'all' && month && month !== 'all') {
      return pricing().billingPeriodRange(year, month);
    }
    if (year && year !== 'all') return pricing().billingYearRange(year);
    if (month && month !== 'all') return { monthOnly: Number(month) };
    return null;
  }

  function periodHint(range) {
    if (!range) return 'Showing all time.';
    if (range.monthOnly) {
      return pricing().monthLabel(range.monthOnly) +
        ' is the 21st of the previous month through the 20th, for every year.';
    }
    var start = range.startDate.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
    var end = range.endDate.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
    if (!range.month) return range.year + ' is ' + start + ' to ' + end + '.';
    return pricing().monthLabel(range.month) + ' is ' + start + ' to ' + end + '.';
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
    // Issued (and "all") sort/filter by issue date. Redeemed+ use lab invoice date.
    if (status === 'redeemed' || status === 'verified' || status === 'paid' || status === 'rejected') {
      return 'redeemedAt';
    }
    return 'issuedAt';
  }

  function dashboardDateField(status) {
    // PO/Lab dashboard period filters use invoice/redeem date except for Issued.
    if (status === 'issued') return 'issuedAt';
    return 'redeemedAt';
  }

  function normalizeVerifyStatus(value) {
    var status = String(value || '').trim().toLowerCase();
    if (!status || status === 'all') return '';
    return status;
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
      outcomes: 'Lab outcomes',
      allocations: 'Allocations & Budget',
      settings: 'Settings'
    };
    byId('poPageTitle').textContent = titles[page] || 'Project Account';
    byId('poDrawer').hidden = true;
    if (page === 'dashboard') {
      loadDashboardStats().catch(function (error) { showMessage(error.message, 'error'); });
    }
    if (page === 'verify') {
      loadVerifyQueue().catch(function (error) { showMessage(error.message, 'error'); });
    }
    if (page === 'labs') {
      renderLabConfig().catch(function (error) { showMessage(error.message, 'error'); });
    }
    if (page === 'outcomes') {
      loadPoOutcomeReport().catch(function (error) { showMessage(error.message, 'error'); });
    }
    if (page === 'allocations') {
      if (!state.allocationsLoaded) {
        loadAllocations().catch(function (error) { showMessage(error.message, 'error'); });
      } else {
        renderAllocations();
      }
    }
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
    fillMultiSelect(byId('dashLabMulti'), state.labs, 'All laboratories');
    fillMultiSelect(byId('dashMidwifeMulti'), state.maternityHomes, 'All midwives');
    fillSelect(byId('configLab'), state.labs, 'Select laboratory');
    fillSelect(byId('verifyLab'), state.labs, 'All laboratories');
    fillSelect(byId('allocationMaternityHome'), state.maternityHomes, 'Select maternity home');
    fillSelect(byId('allocationLab'), state.labs, 'Select laboratory');
    fillSelect(byId('outcomeLab'), state.labs, 'All laboratories');
  }

  function fillYearOptions(select) {
    var now = new Date();
    var options = ['<option value="all">All years</option>'];
    for (var year = now.getFullYear(); year >= now.getFullYear() - 5; year -= 1) {
      options.push('<option value="' + year + '">' + year + '</option>');
    }
    select.innerHTML = options.join('');
    select.value = 'all';
  }

  function fillMonthOptions(select) {
    var options = ['<option value="all">All months</option>'];
    for (var month = 1; month <= 12; month += 1) {
      options.push('<option value="' + month + '">' + escapeHtml(pricing().monthLabel(month)) + '</option>');
    }
    select.innerHTML = options.join('');
    select.value = 'all';
  }

  function formatPoDate(value) {
    if (!value) return '';
    var date = value.toDate ? value.toDate() : new Date(value);
    if (isNaN(date.getTime())) return '';
    return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function outcomePeriodLabel(report) {
    var range = pricing().billingPeriodRange(report.year, report.month);
    var label = (pricing().monthLabel(report.month) || 'Month') + ' ' + (report.year || '');
    if (!range) return label;
    var start = range.startDate.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
    var end = range.endDate.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
    return label + ' · ' + start + ' to ' + end;
  }

  function renderPoOutcomeTable(rows) {
    var display = pricing().displayLabOutcomeRows(rows || []);
    return '<table class="po-table po-outcome-table"><thead><tr>' +
      '<th>Indicator</th>' +
      '<th>Total No of Test Conducted</th>' +
      '<th>No of (+)ve Test Results</th>' +
      '</tr></thead><tbody>' +
      (display.length
        ? display.map(function (row) {
          var max = Number(row.testCount) || 0;
          if (row.resultKind === 'hb-split') {
            var mildLabel = (row.resultLabels && row.resultLabels.mild) || 'Mild Anemia (7-11 g/dl)';
            var severeLabel = (row.resultLabels && row.resultLabels.severe) || 'Severe Anemia (<7 g/dl)';
            return '<tr><td>' + escapeHtml(mildLabel) + '</td>' +
              '<td rowspan="2">' + escapeHtml(String(max)) + '</td>' +
              '<td>' + escapeHtml(String(row.mildAnemiaCount || 0)) + '</td></tr>' +
              '<tr><td>' + escapeHtml(severeLabel) + '</td>' +
              '<td>' + escapeHtml(String(row.severeAnemiaCount || 0)) + '</td></tr>';
          }
          return '<tr><td>' + escapeHtml(row.serviceName || row.serviceId) + '</td><td>' +
            escapeHtml(String(max)) + '</td><td>' +
            (row.resultKind === 'none' ? '—' : escapeHtml(String(row.outcomeCount || 0))) +
            '</td></tr>';
        }).join('')
        : '<tr><td colspan="3">No tests were reported.</td></tr>') +
      '</tbody></table>';
  }

  function renderPoOutcomeReports(reports) {
    if (!reports.length) {
      byId('outcomeTable').innerHTML = '<div class="po-empty">No submitted outcome reports match these filters.</div>';
      return;
    }
    var groups = [];
    reports.forEach(function (report) {
      var last = groups[groups.length - 1];
      if (!last || last.labId !== report.labId) {
        groups.push({
          labId: report.labId,
          name: labNameForId(report.labId) || report.labId || 'Laboratory',
          reports: [report]
        });
      } else {
        last.reports.push(report);
      }
    });
    byId('outcomeTable').innerHTML = groups.map(function (group) {
      return '<section class="po-outcome-lab">' +
        '<h3>' + escapeHtml(group.name) + '</h3>' +
        group.reports.map(function (report) {
          var submittedOn = formatPoDate(report.submittedAt || report.updatedAt);
          return '<article class="po-outcome-card">' +
            '<div class="po-outcome-card__head">' +
              '<strong>' + escapeHtml(outcomePeriodLabel(report)) + '</strong>' +
              (submittedOn ? '<span>Submitted ' + escapeHtml(submittedOn) + '</span>' : '') +
            '</div>' +
            renderPoOutcomeTable(report.rows) +
          '</article>';
        }).join('') +
      '</section>';
    }).join('');
  }

  async function loadPoOutcomeReport() {
    var labId = byId('outcomeLab').value;
    var year = byId('outcomeYear').value;
    var month = byId('outcomeMonth').value;
    var range = (year && year !== 'all' && month && month !== 'all')
      ? pricing().billingPeriodRange(year, month)
      : null;
    if (range) {
      var start = range.startDate.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
      var end = range.endDate.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
      byId('outcomePeriodHint').textContent = pricing().monthLabel(range.month) + ' is ' + start + ' to ' + end + '.';
    } else {
      byId('outcomePeriodHint').textContent = 'Showing submitted reports' +
        (labId ? ' for the selected laboratory' : ' from every laboratory') +
        (year && year !== 'all' ? ' in ' + year : '') +
        (month && month !== 'all' ? ' for ' + pricing().monthLabel(month) : '') + '.';
    }
    var reports = (await service().listLabOutcomeReports(labId || '')).filter(function (row) {
      return row && row.status === 'submitted';
    });
    if (year && year !== 'all') {
      reports = reports.filter(function (row) { return Number(row.year) === Number(year); });
    }
    if (month && month !== 'all') {
      reports = reports.filter(function (row) { return Number(row.month) === Number(month); });
    }
    reports.sort(function (a, b) {
      var labA = labNameForId(a.labId) || a.labId || '';
      var labB = labNameForId(b.labId) || b.labId || '';
      if (labA !== labB) return labA.localeCompare(labB);
      return String(b.period || '').localeCompare(String(a.period || ''));
    });
    renderPoOutcomeReports(reports);
  }

  function labNameForId(labId) {
    if (!labId) return '';
    var lab = state.labs.find(function (row) { return row.id === labId; });
    return lab ? profileName(lab) : '';
  }

  function slugServiceId(name) {
    var base = String(name || 'test').toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 36);
    return (base || 'test') + '-' + Math.random().toString(36).slice(2, 7);
  }

  function serviceCodeFromId(serviceId) {
    return String(serviceId || 'TEST').toUpperCase().replace(/[^A-Z0-9_-]/g, '_').slice(0, 32);
  }

  function configTestRowHtml(test) {
    var id = test.serviceId || test.id;
    var name = test.serviceName || test.name || '';
    var code = test.serviceCode || serviceCodeFromId(id);
    var regular = test.regularPriceMinor != null ? test.regularPriceMinor / 100 : (test.defaultRegularMinor || 0) / 100;
    var labShare = test.labCostShareMinor != null ? test.labCostShareMinor / 100 : 0;
    var checked = test.active !== false;
    return '<tr data-service="' + escapeHtml(id) + '" data-service-code="' + escapeHtml(code) + '">' +
      '<td><input class="form-check-input config-active" type="checkbox"' + (checked ? ' checked' : '') +
      ' aria-label="Enable ' + escapeHtml(name || 'test') + '"></td>' +
      '<td><input class="form-control config-name" type="text" maxlength="120" value="' +
      escapeHtml(name) + '" aria-label="Test name" placeholder="Test name"></td>' +
      '<td><input class="form-control config-regular" type="number" min="0" step="1" value="' +
      escapeHtml(String(regular || '')) + '" aria-label="Regular price for ' + escapeHtml(name || 'test') + '"></td>' +
      '<td><input class="form-control config-labshare" type="number" min="0" step="1" value="' +
      escapeHtml(moneyInputValue(labShare)) + '" placeholder="0" aria-label="Lab cost share for ' +
      escapeHtml(name || 'test') + '"></td>' +
      '<td class="config-client">—</td><td class="config-project">—</td>' +
      '<td><button type="button" class="btn btn-outline-danger btn-sm config-remove-test" aria-label="Remove ' +
      escapeHtml(name || 'test') + '"><i class="fas fa-trash" aria-hidden="true"></i></button></td></tr>';
  }

  function renderConfigTests(config) {
    var rows = [];
    if (config && Array.isArray(config.tests) && config.tests.length) {
      config.tests.forEach(function (test) {
        rows.push(configTestRowHtml({
          serviceId: test.serviceId,
          serviceCode: test.serviceCode || serviceCodeFromId(test.serviceId),
          serviceName: test.serviceName || test.serviceId,
          regularPriceMinor: test.regularPriceMinor || 0,
          labCostShareMinor: test.labCostShareMinor || 0,
          active: test.active !== false
        }));
      });
    } else {
      pricing().STANDARD_LAB_TESTS.forEach(function (test) {
        rows.push(configTestRowHtml({
          serviceId: test.id,
          serviceCode: test.code,
          serviceName: test.name,
          regularPriceMinor: test.defaultRegularMinor,
          labCostShareMinor: 0,
          active: true
        }));
      });
    }
    byId('configTests').innerHTML = '<table class="po-table po-table--config-tests"><thead><tr>' +
      '<th></th><th>Laboratory Test</th><th>Regular Price</th><th>Lab Cost share</th><th>Client</th><th>Project</th><th></th>' +
      '</tr></thead><tbody>' + rows.join('') + '</tbody></table>';
    updateConfigPreview();
  }

  function handleAddConfigTest() {
    var body = byId('configTests').querySelector('tbody');
    if (!body) {
      renderConfigTests({ tests: [] });
      body = byId('configTests').querySelector('tbody');
    }
    if (!body) return;
    var serviceId = slugServiceId('custom-test');
    body.insertAdjacentHTML('beforeend', configTestRowHtml({
      serviceId: serviceId,
      serviceCode: serviceCodeFromId(serviceId),
      serviceName: '',
      regularPriceMinor: 0,
      labCostShareMinor: 0,
      active: true
    }));
    var nameInput = body.querySelector('tr[data-service="' + serviceId + '"] .config-name');
    if (nameInput) nameInput.focus();
    updateConfigPreview();
  }

  function collectConfigTests() {
    return Array.from(byId('configTests').querySelectorAll('tr[data-service]')).map(function (row) {
      var serviceId = row.getAttribute('data-service');
      var name = (row.querySelector('.config-name') && row.querySelector('.config-name').value.trim()) || '';
      if (!name) throw new Error('Every laboratory test needs a name.');
      return {
        serviceId: serviceId,
        serviceCode: row.getAttribute('data-service-code') || serviceCodeFromId(serviceId),
        serviceName: name,
        regularPriceMinor: Math.round(numberValue(row.querySelector('.config-regular').value) * 100),
        labCostShareMinor: Math.round(numberValue(row.querySelector('.config-labshare').value) * 100),
        active: row.querySelector('.config-active').checked
      };
    }).filter(function (test) {
      return test.active || test.regularPriceMinor >= 0;
    });
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
    var settings = await service().getProgramSettings();
    byId('configProjectCeiling').value = settings.projectCeilingMinor
      ? String(settings.projectCeilingMinor / 100)
      : '';
    var labId = byId('configLab').value;
    if (!labId) {
      byId('configLabName').value = '';
      byId('configLabAddress').value = '';
      byId('configLabPhone').value = '';
      renderConfigTests(null);
      return;
    }
    var result = await service().getLabConfig(labId);
    var profile = result.profile || {};
    var config = result.config;
    byId('configLabName').value = (config && config.labName) || profileName(profile);
    byId('configLabAddress').value = (config && config.address) || profile.address || '';
    byId('configLabPhone').value = (config && config.phone) || profile.phone || profile.labPhone || '';
    if (config) {
      byId('configProjectPercent').value = config.projectPercent;
      byId('configClientPercent').value = config.clientPercent;
    }
    renderConfigTests(config);
  }

  async function saveLabConfig() {
    var labId = byId('configLab').value;
    if (!labId) throw new Error('Select a laboratory.');
    var tests = collectConfigTests();
    if (!tests.some(function (test) { return test.active; })) {
      throw new Error('Enable at least one laboratory test.');
    }
    var labName = byId('configLabName').value.trim();
    await service().saveLabConfig({
      labId: labId,
      labName: labName,
      address: byId('configLabAddress').value.trim(),
      phone: byId('configLabPhone').value.trim(),
      projectPercent: numberValue(byId('configProjectPercent').value),
      clientPercent: numberValue(byId('configClientPercent').value),
      projectCeilingMinor: Math.round(numberValue(byId('configProjectCeiling').value) * 100),
      tests: tests
    });
    var lab = state.labs.find(function (row) { return row.id === labId; });
    if (lab) {
      lab.displayName = labName;
      lab.name = labName;
      lab.labName = labName;
      lab.organization_name = labName;
      lab.address = byId('configLabAddress').value.trim();
      lab.phone = byId('configLabPhone').value.trim();
    }
    fillMultiSelect(byId('dashLabMulti'), state.labs, 'All laboratories');
    fillSelect(byId('configLab'), state.labs, 'Select laboratory');
    fillSelect(byId('verifyLab'), state.labs, 'All laboratories');
    fillSelect(byId('allocationLab'), state.labs, 'Select laboratory');
    fillSelect(byId('outcomeLab'), state.labs, 'All laboratories');
    byId('configLab').value = labId;
    showMessage('Laboratory prices saved and published.', 'success');
  }

  function summarizeDash(items) {
    var counts = pricing().emptyCounts();
    var verified = { clientMinor: 0, projectMinor: 0 };
    var paid = { clientMinor: 0, projectMinor: 0 };
    (items || []).forEach(function (row) {
      var status = row.status;
      if (counts[status] != null) counts[status] += 1;
      var shares = sharesOf(row);
      if (status === 'verified') {
        verified.clientMinor += shares.clientMinor;
        verified.projectMinor += shares.projectMinor;
      }
      if (status === 'paid') {
        paid.clientMinor += shares.clientMinor;
        paid.projectMinor += shares.projectMinor;
      }
    });
    return { counts: counts, verified: verified, paid: paid };
  }

  async function fetchDashboardVouchers() {
    var range = selectedBillingRange(byId('dashYear'), byId('dashMonth'));
    var labIds = selectedMultiIds(byId('dashLabMulti'));
    var midwifeIds = selectedMultiIds(byId('dashMidwifeMulti'));
    var specs = [
      { status: 'issued', dateField: dashboardDateField('issued') },
      { status: 'redeemed', dateField: dashboardDateField('redeemed') },
      { status: 'verified', dateField: dashboardDateField('verified') },
      { status: 'paid', dateField: dashboardDateField('paid') },
      { status: 'rejected', dateField: dashboardDateField('rejected') }
    ];
    var pages = await Promise.all(specs.map(function (spec) {
      var query = { status: spec.status, pageSize: 400, dateField: spec.dateField };
      if (range && range.startDate && range.endDate) {
        query.startDate = range.startDate;
        query.endDate = range.endDate;
      }
      return service().queryVouchersPaged(query);
    }));
    var items = [];
    pages.forEach(function (page) {
      (page.items || []).forEach(function (row) { items.push(row); });
    });
    var filtered = items.filter(function (row) {
      if (!matchesMulti(labIds, row.labId) || !matchesMulti(midwifeIds, row.midwifeId)) return false;
      if (!range) return true;
      var value = row.status === 'issued' ? row.issuedAt : row.redeemedAt;
      var date = value && typeof value.toDate === 'function' ? value.toDate() : new Date(value);
      if (!value || Number.isNaN(date.getTime())) return false;
      if (range.startDate && range.endDate) {
        return date.getTime() >= range.startDate.getTime() && date.getTime() <= range.endDate.getTime();
      }
      if (range.monthOnly) return pricing().billingMonthOf(date) === range.monthOnly;
      return true;
    });
    var visitKind = byId('dashVisitKind') && byId('dashVisitKind').value;
    var classified = await service().attachPatientVisitKinds(
      filtered,
      { storedOnly: visitKind !== 'new' && visitKind !== 'old' }
    );
    if (visitKind === 'new' || visitKind === 'old') {
      return classified.filter(function (row) {
        return (row.patientVisitKind || 'new') === visitKind;
      });
    }
    return classified;
  }

  function clearDashListHint() {
    byId('dashList').innerHTML = '<div class="po-empty">Tap a status card to list vouchers</div>';
    document.querySelectorAll('.po-stat--filter').forEach(function (card) {
      card.classList.remove('is-active');
    });
  }

  async function loadDashboardStats() {
    var range = selectedBillingRange(byId('dashYear'), byId('dashMonth'));
    byId('dashPeriodHint').textContent = periodHint(range);
    state.dashItems = await fetchDashboardVouchers();
    var summary = summarizeDash(state.dashItems);
    var verifiedTotal = (summary.verified.clientMinor + summary.verified.projectMinor) / 100;
    byId('statIssued').textContent = formatNumber(summary.counts.issued);
    byId('statRedeemed').textContent = formatNumber(summary.counts.redeemed);
    byId('statVerified').textContent = formatNumber(summary.counts.verified);
    byId('statPaid').textContent = formatNumber(summary.counts.paid);
    byId('statRejected').textContent = formatNumber(summary.counts.rejected);
    byId('statIncoming').textContent = formatMoney(verifiedTotal);
    byId('statIncomingBreak').textContent =
      'Client = ' + formatMoney(summary.verified.clientMinor / 100) +
      '\nProject = ' + formatMoney(summary.verified.projectMinor / 100);
    byId('statReceived').textContent = formatMoney(summary.paid.projectMinor / 100);
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
    if (!state.dashItems.length) {
      byId('dashList').innerHTML = '<div class="po-loading"><i class="fas fa-spinner fa-spin"></i>Loading vouchers…</div>';
      state.dashItems = await fetchDashboardVouchers();
    }
    var rows = state.dashItems.filter(function (row) { return row.status === status; });
    byId('dashList').innerHTML = rows.length
      ? '<table class="po-table"><thead><tr><th>Voucher</th><th>Status</th><th>New / Old</th><th>Midwife</th><th>Lab</th><th>Project</th></tr></thead><tbody>' +
        rows.map(function (row) {
          var code = row.code || row.id;
          var visitKind = row.patientVisitKind === 'old' ? 'Old' : 'New';
          return '<tr class="po-dash-row" data-code="' + escapeHtml(code) +
            '" tabindex="0" role="button" aria-label="Preview voucher ' + escapeHtml(code) + '">' +
            '<td>' + escapeHtml(code) + '</td><td>' + statusBadge(row.status) + '</td><td>' +
            escapeHtml(visitKind) + '</td><td>' +
            escapeHtml(row.issuerNameSnapshot || row.midwifeId || '—') + '</td><td>' +
            escapeHtml(row.labNameSnapshot || row.labId || '—') + '</td><td>' +
            formatMoney(((row.totals && row.totals.projectContributionMinor) || 0) / 100) + '</td></tr>';
        }).join('') + '</tbody></table>'
      : '<div class="po-empty">No ' + escapeHtml(status) + ' vouchers for this filter.</div>';
  }

  async function loadVerifyQueue() {
    var status = normalizeVerifyStatus(byId('verifyStatus').value);
    var period = byId('verifyPeriod').value || 'all';
    var range = periodDateRange(period);
    var query = {
      labId: byId('verifyLab').value || undefined,
      pageSize: 50,
      dateField: dateFieldForStatus(status || 'all')
    };
    if (status) query.status = status;
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
      '<th class="po-check-col"><label class="po-check-wrap">' +
      '<input type="checkbox" id="verifySelectAll" aria-label="Select all vouchers">' +
      '</label></th>' +
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
          '<td>' + statusBadge(row.status) +
          (row.status === 'paid' && row.paymentProofAttached
            ? '<span class="po-proof-chip">Proof</span>'
            : '') +
          '</td>' +
          '<td><button type="button" class="btn btn-outline-primary btn-sm" data-preview="' +
          escapeHtml(code) + '">Preview</button></td></tr>';
      }).join('') + '</tbody></table>';
    syncVerifySelectAll();
  }

  function syncVerifySelectAll() {
    var master = byId('verifySelectAll');
    if (!master) return;
    var boxes = Array.from(document.querySelectorAll('#verifyTable .verify-check'));
    master.checked = boxes.length > 0 && boxes.every(function (box) { return box.checked; });
    master.indeterminate = boxes.some(function (box) { return box.checked; }) && !master.checked;
  }

  function selectedVerifyCodes() {
    return Array.from(document.querySelectorAll('#verifyTable .verify-check:checked'))
      .map(function (input) { return input.getAttribute('data-code'); })
      .filter(Boolean);
  }

  async function buildInvoiceExtras(voucher, signatures, settings) {
    var seal = (signatures && signatures.labSeal) || '';
    var labName = voucher.labNameSnapshot || '';
    var labAddress = '';
    var labPhone = '';
    if (voucher.labId) {
      try {
        var labSettings = await service().getLabSettings(voucher.labId);
        if (!seal) seal = (labSettings && labSettings.seal) || '';
        labName = (labSettings && labSettings.labName) || labName;
        labAddress = (labSettings && labSettings.address) || '';
        labPhone = (labSettings && labSettings.phone) || '';
      } catch (error) {
        /* keep voucher snapshot values */
      }
    }
    return {
      lab: {
        seal: seal,
        name: labName,
        address: labAddress,
        phone: labPhone,
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
        name: officerInvoiceName(voucher.poNameSnapshot || (settings && settings.name) || ''),
        designation: voucher.poDesignationSnapshot || (settings && settings.designation) || '',
        date: window.VoucherInvoice.formatDate(voucher.verifiedAt),
        paidAt: window.VoucherInvoice.formatDateTime
          ? window.VoucherInvoice.formatDateTime(voucher.paidAt)
          : '',
        paidName: officerInvoiceName(
          voucher.paidNameSnapshot || voucher.poNameSnapshot || (settings && settings.name) || ''
        ),
        paidDesignation: voucher.paidDesignationSnapshot || voucher.poDesignationSnapshot ||
          (settings && settings.designation) || ''
      } : {},
      paymentProofImage: (signatures && signatures.paymentProofImage) || ''
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
      if (item.extras && item.extras.paymentProofImage && window.VoucherInvoice.renderPaymentProof) {
        var proof = document.createElement('div');
        window.VoucherInvoice.renderPaymentProof(proof, item.extras.paymentProofImage);
        item.wrap.insertBefore(proof, item.mount);
      }
    });
  }

  function closePreviewModal() {
    byId('previewModal').hidden = true;
    byId('previewModalBody').innerHTML = '';
    if (byId('payConfirmModal').hidden) document.body.classList.remove('po-modal-open');
  }

  function closePayConfirm() {
    byId('payConfirmModal').hidden = true;
    state.payCodes = [];
    state.payProofDataUrl = '';
    if (byId('payConfirmQrHost')) byId('payConfirmQrHost').innerHTML = '';
    if (byId('payProofInput')) byId('payProofInput').value = '';
    renderPayProofPreview('');
    if (byId('previewModal').hidden) document.body.classList.remove('po-modal-open');
  }

  function renderPayProofPreview(dataUrl) {
    var preview = byId('payProofPreview');
    var clearBtn = byId('payProofClearBtn');
    if (!preview) return;
    if (dataUrl) {
      preview.src = dataUrl;
      preview.classList.remove('d-none');
      if (clearBtn) clearBtn.classList.remove('d-none');
      return;
    }
    preview.removeAttribute('src');
    preview.classList.add('d-none');
    if (clearBtn) clearBtn.classList.add('d-none');
  }

  function assertPayProofFile(file) {
    if (!file) return;
    var type = String(file.type || '').toLowerCase();
    if (type !== 'image/png' && type !== 'image/jpeg' && type !== 'image/jpg') {
      throw new Error('Payment proof must be a PNG or JPG image.');
    }
  }

  async function handlePayProofFile(file) {
    if (!file) {
      state.payProofDataUrl = '';
      renderPayProofPreview('');
      return;
    }
    assertPayProofFile(file);
    var dataUrl = await window.VoucherInvoice.fileToDataUrl(file);
    state.payProofDataUrl = await window.VoucherInvoice.compressImage(dataUrl, 720, 1280, 0.78);
    renderPayProofPreview(state.payProofDataUrl);
  }

  async function renderPayConfirmQrs(rows) {
    var host = byId('payConfirmQrHost');
    if (!host) return;
    var labs = [];
    rows.forEach(function (row) {
      var labId = row.labId || '';
      if (!labs.some(function (item) { return item.id === labId; })) {
        labs.push({
          id: labId,
          name: row.labNameSnapshot || labNameForId(labId) || 'Laboratory'
        });
      }
    });
    host.innerHTML = '<p class="text-muted mb-0">Loading payment QR…</p>';
    var cards = await Promise.all(labs.map(function (lab) {
      if (!lab.id) {
        return Promise.resolve({
          name: lab.name,
          qr: '',
          note: 'This voucher has no laboratory assigned.'
        });
      }
      return service().getLabSettings(lab.id).then(function (settings) {
        return {
          name: (settings && settings.labName) || lab.name,
          qr: (settings && settings.paymentQr) || '',
          note: 'This laboratory has not uploaded a payment QR.'
        };
      }).catch(function () {
        return { name: lab.name, qr: '', note: 'Could not load this laboratory payment QR.' };
      });
    }));
    host.innerHTML = cards.map(function (card) {
      return '<section class="po-pay-qr">' +
        '<h3>' + escapeHtml(card.name) + '</h3>' +
        (card.qr
          ? '<img src="' + escapeHtml(card.qr) + '" alt="Payment QR for ' + escapeHtml(card.name) + '">'
          : '<p>' + escapeHtml(card.note) + '</p>') +
        '</section>';
    }).join('');
  }

  async function openPayConfirm(codes) {
    var list = (codes || []).filter(Boolean);
    if (!list.length) throw new Error('Select at least one voucher.');
    var rows = list.map(function (code) {
      return state.queue.find(function (row) { return (row.code || row.id) === code; });
    }).filter(Boolean);
    var verified = rows.filter(function (row) { return row.status === 'verified'; });
    if (!verified.length) throw new Error('Select verified vouchers to mark paid.');
    var skipped = list.length - verified.length;
    var project = 0;
    var client = 0;
    verified.forEach(function (row) {
      var shares = sharesOf(row);
      project += shares.projectMinor;
      client += shares.clientMinor;
    });
    state.payCodes = verified.map(function (row) { return row.code || row.id; });
    state.payProofDataUrl = '';
    if (byId('payProofInput')) byId('payProofInput').value = '';
    renderPayProofPreview('');
    byId('payConfirmCount').textContent = String(state.payCodes.length);
    byId('payConfirmProject').textContent = formatMoney(project / 100);
    byId('payConfirmClient').textContent = formatMoney(client / 100);
    byId('payConfirmModal').hidden = false;
    document.body.classList.add('po-modal-open');
    if (skipped) {
      showMessage(skipped + ' selected voucher(s) are not verified and were skipped.', 'info');
    }
    await renderPayConfirmQrs(verified);
  }

  async function printSelectedVouchers(codes) {
    var list = (codes || []).filter(Boolean);
    if (!list.length) throw new Error('Select at least one voucher to print.');
    var settings = state.poSettings || await service().getPoSettings();
    state.poSettings = settings;
    var host = document.createElement('div');
    host.className = 'invoice-print-staging';
    host.setAttribute('aria-hidden', 'true');
    host.style.cssText = 'position:fixed;left:-10000px;top:0;width:820px;';
    document.body.appendChild(host);

    try {
      for (var index = 0; index < list.length; index += 1) {
        var voucher = await service().lookupVoucher(list[index]);
        var signatures = await service().getVoucherSignatures(list[index]);
        var extras = await buildInvoiceExtras(voucher, signatures, settings);
        var mount = document.createElement('div');
        mount.className = 'invoice-preview';
        host.appendChild(mount);
        window.VoucherInvoice.render(mount, window.VoucherInvoice.modelFromVoucher(voucher, extras));
      }
      var sheets = Array.from(host.querySelectorAll('.invoice-sheet'));
      if (!sheets.length) throw new Error('Could not build invoice sheets to print.');
      await window.VoucherInvoice.printA4(sheets.length === 1 ? sheets[0] : sheets);
    } finally {
      if (host.parentNode) host.parentNode.removeChild(host);
    }
  }

  async function review(action, codes) {
    var list = codes || [];
    if (!list.length) throw new Error('Select at least one voucher.');
    if (action === 'reject' && !byId('rejectReason').value.trim()) {
      throw new Error('Enter a reject reason.');
    }
    for (var index = 0; index < list.length; index += 1) {
      if (action === 'pay' && state.payProofDataUrl) {
        await service().saveVoucherSignatures(list[index], { paymentProofImage: state.payProofDataUrl });
      }
      await service().setVoucherReviewStatus(list[index], action, {
        poName: officerDisplayName((state.poSettings && state.poSettings.name) || byId('poName').value),
        poDesignation: (state.poSettings && state.poSettings.designation) || byId('poDesignation').value,
        rejectReason: byId('rejectReason').value.trim(),
        paymentProofAttached: action === 'pay' && !!state.payProofDataUrl
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

  async function deleteSelectedVouchers(codes) {
    var list = codes || selectedVerifyCodes();
    if (!list.length) throw new Error('Select at least one voucher to delete.');
    var confirmed = window.confirm(
      'Delete ' + list.length + ' voucher(s)? This cannot be undone and is intended for test cleanup.'
    );
    if (!confirmed) return;
    for (var index = 0; index < list.length; index += 1) {
      await service().deleteVoucher(list[index]);
      delete state.selectedCodes[list[index]];
    }
    showMessage('Deleted ' + list.length + ' voucher(s).', 'success');
    await loadVerifyQueue();
    if (state.page === 'dashboard') await loadDashboardStats();
  }

  async function resetScorecards() {
    var confirmed = window.confirm(
      'Reset all dashboard scorecards to zero? Use this after deleting vouchers for a clean test slate.'
    );
    if (!confirmed) return;
    var result = await service().resetPeriodStats();
    byId('dashList').innerHTML = '<div class="po-empty">Tap a status card to list vouchers</div>';
    state.dashStatusFilter = null;
    await loadDashboardStats();
    showMessage('Scorecards reset (' + (result.deleted || 0) + ' period records cleared).', 'success');
  }

  async function loadAllocations() {
    state.allocations = await service().getAllocations();
    state.allocationsLoaded = true;
    renderAllocations();
  }

  function openAllocationCreate() {
    byId('allocationMode').value = 'create';
    byId('allocationMaternityHome').disabled = false;
    byId('allocationMaternityHome').value = '';
    byId('allocationCount').value = '';
    byId('allocationRemaining').value = '';
    byId('allocationRemaining').required = false;
    byId('allocationRemaining').disabled = true;
    byId('allocationRemaining').closest('label').hidden = true;
    byId('allocationLab').value = '';
    byId('allocationBudget').value = '';
    byId('allocationCurrency').value = 'MMK';
    byId('allocationNote').value = '';
    byId('allocationSubmitBtn').textContent = 'Allocate';
    byId('allocationFormCard').hidden = false;
  }

  function openAllocationEdit(midwifeId) {
    var item = state.allocations.find(function (row) { return row.midwifeId === midwifeId || row.id === midwifeId; });
    if (!item) throw new Error('Allocation was not found.');
    byId('allocationMode').value = 'edit';
    byId('allocationMaternityHome').disabled = false;
    byId('allocationMaternityHome').value = item.midwifeId || item.id;
    byId('allocationMaternityHome').disabled = true;
    byId('allocationLab').value = item.labId || '';
    byId('allocationCount').value = String(item.allocatedUnits || 0);
    byId('allocationRemaining').disabled = false;
    byId('allocationRemaining').required = true;
    byId('allocationRemaining').value = String(item.remainingUnits || 0);
    byId('allocationRemaining').closest('label').hidden = false;
    byId('allocationBudget').value = String(((item.budget && item.budget.totalMinor) || 0) / 100);
    byId('allocationCurrency').value = (item.budget && item.budget.currency) || 'MMK';
    byId('allocationNote').value = (item.budget && item.budget.note) || '';
    byId('allocationSubmitBtn').textContent = 'Save changes';
    byId('allocationFormCard').hidden = false;
  }

  function renderAllocations() {
    if (!state.allocations.length) {
      byId('allocationsList').innerHTML = '<div class="po-empty">No allocations yet.</div>';
      return;
    }
    byId('allocationsList').innerHTML = state.allocations.map(function (item) {
      var home = state.maternityHomes.find(function (row) { return row.id === item.midwifeId; });
      var midwifeId = item.midwifeId || item.id;
      var budgetTotal = ((item.budget && item.budget.totalMinor) || 0) / 100;
      var remainingBudget = (item.remainingBudgetMinor != null
        ? item.remainingBudgetMinor
        : Math.max(0, ((item.budget && item.budget.totalMinor) || 0) - (item.redeemedProjectMinor || 0))) / 100;
      var assignedLab = labNameForId(item.labId) || item.labName || 'Not assigned';
      return '<article class="po-allocation"><div><div class="po-allocation__name">' +
        escapeHtml(home ? profileName(home) : midwifeId) + '</div>' +
        '<div class="po-allocation__lab">Assigned lab · ' + escapeHtml(assignedLab) + '</div></div>' +
        '<div class="po-metric"><span>Allocated</span><strong>' + formatNumber(item.allocatedUnits) + '</strong></div>' +
        '<div class="po-metric"><span>Remaining</span><strong>' + formatNumber(item.remainingUnits) + '</strong></div>' +
        '<div class="po-metric"><span>Redeemed</span><strong>' + formatNumber(item.redeemedCount || 0) + '</strong></div>' +
        '<div class="po-metric"><span>PO-only budget</span><strong>' + formatMoney(budgetTotal) + '</strong></div>' +
        '<div class="po-metric"><span>Remaining budget</span><strong>' + formatMoney(remainingBudget) + '</strong></div>' +
        '<div class="po-allocation__actions">' +
        '<button type="button" class="btn btn-outline-primary btn-sm" data-edit-allocation="' +
        escapeHtml(midwifeId) + '">Edit</button>' +
        '<button type="button" class="btn btn-outline-secondary btn-sm" data-reset-allocation="' +
        escapeHtml(midwifeId) + '">Reset remaining</button>' +
        '</div></article>';
    }).join('');
  }

  async function saveAllocation(event) {
    event.preventDefault();
    var mode = byId('allocationMode').value || 'create';
    var midwifeId = byId('allocationMaternityHome').value;
    var labId = byId('allocationLab').value;
    if (!labId) throw new Error('Assign a laboratory to this maternity home.');
    var labName = labNameForId(labId);
    if (mode === 'edit') {
      await service().updateAllocation({
        midwifeId: midwifeId,
        labId: labId,
        labName: labName,
        allocatedUnits: Math.floor(numberValue(byId('allocationCount').value)),
        remainingUnits: Math.floor(numberValue(byId('allocationRemaining').value)),
        totalMinor: Math.round(numberValue(byId('allocationBudget').value) * 100),
        currency: byId('allocationCurrency').value.trim() || 'MMK',
        note: byId('allocationNote').value.trim()
      });
      showMessage('Allocation updated.', 'success');
    } else {
      await service().allocateVouchers({
        midwifeId: midwifeId,
        labId: labId,
        labName: labName,
        allocatedUnits: Math.floor(numberValue(byId('allocationCount').value)),
        totalMinor: Math.round(numberValue(byId('allocationBudget').value) * 100),
        currency: byId('allocationCurrency').value.trim() || 'MMK',
        note: byId('allocationNote').value.trim()
      });
      showMessage('Allocation saved.', 'success');
    }
    byId('allocationFormCard').hidden = true;
    byId('allocationMaternityHome').disabled = false;
    await loadAllocations();
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
    byId('poName').value = officerDisplayName((state.poSettings && state.poSettings.name) || '');
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
    showMessage('Project Account settings saved.', 'success');
  }

  async function logout() {
    state.loggingOut = true;
    try {
      await firebase.auth().signOut();
    } catch (error) {}
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

    ['dashYear', 'dashMonth', 'dashVisitKind'].forEach(function (id) {
      byId(id).addEventListener('change', function () {
        state.dashStatusFilter = null;
        loadDashboardStats().catch(function (error) { showMessage(error.message, 'error'); });
      });
    });
    document.addEventListener('click', function (event) {
      var multi = event.target.closest('.po-multi');
      if (!multi) {
        closeOpenMultis();
        return;
      }
      var toggle = event.target.closest('.po-multi__toggle');
      if (!toggle) return;
      var panel = multi.querySelector('.po-multi__panel');
      var open = panel && panel.hidden;
      closeOpenMultis(open ? multi : null);
      if (!panel) return;
      panel.hidden = !open;
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    document.querySelectorAll('.po-multi').forEach(function (root) {
      root.addEventListener('change', function (event) {
        if (!event.target.matches('input[type="checkbox"]')) return;
        updateMultiToggle(root);
        state.dashStatusFilter = null;
        loadDashboardStats().catch(function (error) { showMessage(error.message, 'error'); });
      });
    });
    byId('dashList').addEventListener('click', function (event) {
      var row = event.target.closest('.po-dash-row');
      if (!row) return;
      openPreviewModal([row.getAttribute('data-code')]).catch(function (error) {
        showMessage(error.message, 'error');
      });
    });
    byId('dashList').addEventListener('keydown', function (event) {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      var row = event.target.closest('.po-dash-row');
      if (!row) return;
      event.preventDefault();
      openPreviewModal([row.getAttribute('data-code')]).catch(function (error) {
        showMessage(error.message, 'error');
      });
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
    byId('configTests').addEventListener('click', function (event) {
      var removeBtn = event.target.closest('.config-remove-test');
      if (!removeBtn) return;
      var row = removeBtn.closest('tr[data-service]');
      if (!row) return;
      var remaining = byId('configTests').querySelectorAll('tr[data-service]').length;
      if (remaining <= 1) {
        showMessage('Keep at least one laboratory test.', 'error');
        return;
      }
      row.remove();
      updateConfigPreview();
    });
    byId('addConfigTestBtn').addEventListener('click', handleAddConfigTest);
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
    ['outcomeLab', 'outcomeYear', 'outcomeMonth'].forEach(function (id) {
      byId(id).addEventListener('change', function () {
        loadPoOutcomeReport().catch(function (error) { showMessage(error.message, 'error'); });
      });
    });
    byId('verifyTable').addEventListener('change', function (event) {
      if (event.target.id === 'verifySelectAll') {
        var checked = event.target.checked;
        document.querySelectorAll('#verifyTable .verify-check').forEach(function (box) {
          box.checked = checked;
          state.selectedCodes[box.getAttribute('data-code')] = checked;
        });
        return;
      }
      if (event.target.matches('.verify-check')) {
        state.selectedCodes[event.target.getAttribute('data-code')] = event.target.checked;
        syncVerifySelectAll();
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
      review('verify', selectedVerifyCodes()).catch(function (error) { showMessage(error.message, 'error'); });
    });
    byId('payOneBtn').addEventListener('click', function () {
      openPayConfirm(selectedVerifyCodes()).catch(function (error) {
        showMessage(error.message, 'error');
      });
    });
    byId('payConfirmBtn').addEventListener('click', function () {
      var codes = state.payCodes.slice();
      byId('payConfirmBtn').disabled = true;
      review('pay', codes).then(function () {
        closePayConfirm();
      }).catch(function (error) {
        showMessage(error.message, 'error');
      }).then(function () {
        byId('payConfirmBtn').disabled = false;
      });
    });
    document.querySelectorAll('[data-close-pay-confirm]').forEach(function (el) {
      el.addEventListener('click', closePayConfirm);
    });
    if (byId('payProofInput')) {
      byId('payProofInput').addEventListener('change', function () {
        var file = byId('payProofInput').files[0];
        handlePayProofFile(file).catch(function (error) {
          byId('payProofInput').value = '';
          state.payProofDataUrl = '';
          renderPayProofPreview('');
          showMessage(error.message || 'Could not read that payment proof.', 'error');
        });
      });
    }
    if (byId('payProofClearBtn')) {
      byId('payProofClearBtn').addEventListener('click', function () {
        if (byId('payProofInput')) byId('payProofInput').value = '';
        state.payProofDataUrl = '';
        renderPayProofPreview('');
      });
    }
    byId('printOneBtn').addEventListener('click', function () {
      printSelectedVouchers(selectedVerifyCodes()).catch(function (error) { showMessage(error.message, 'error'); });
    });
    byId('rejectOneBtn').addEventListener('click', function () {
      review('reject', selectedVerifyCodes()).catch(function (error) { showMessage(error.message, 'error'); });
    });
    byId('deleteOneBtn').addEventListener('click', function () {
      deleteSelectedVouchers(selectedVerifyCodes()).catch(function (error) { showMessage(error.message, 'error'); });
    });
    document.querySelectorAll('[data-close-preview]').forEach(function (el) {
      el.addEventListener('click', closePreviewModal);
    });
    document.addEventListener('keydown', function (event) {
      if (event.key !== 'Escape') return;
      if (!byId('payConfirmModal').hidden) {
        closePayConfirm();
        return;
      }
      if (!byId('previewModal').hidden) closePreviewModal();
    });

    byId('openAllocationBtn').addEventListener('click', function () { openAllocationCreate(); });
    byId('cancelAllocationBtn').addEventListener('click', function () {
      byId('allocationFormCard').hidden = true;
      byId('allocationMaternityHome').disabled = false;
    });
    byId('allocationFormCard').addEventListener('submit', function (event) {
      saveAllocation(event).catch(function (error) { showMessage(error.message, 'error'); });
    });
    byId('allocationsList').addEventListener('click', function (event) {
      var editBtn = event.target.closest('[data-edit-allocation]');
      if (editBtn) {
        openAllocationEdit(editBtn.getAttribute('data-edit-allocation'));
        return;
      }
      var resetBtn = event.target.closest('[data-reset-allocation]');
      if (!resetBtn) return;
      var midwifeId = resetBtn.getAttribute('data-reset-allocation');
      var confirmed = window.confirm('Reset remaining vouchers back to the allocated count for this midwife?');
      if (!confirmed) return;
      service().resetAllocation(midwifeId).then(function () {
        return loadAllocations();
      }).then(function () {
        showMessage('Remaining vouchers reset.', 'success');
      }).catch(function (error) {
        showMessage(error.message, 'error');
      });
    });
    byId('resetScorecardsBtn').addEventListener('click', function () {
      resetScorecards().catch(function (error) { showMessage(error.message, 'error'); });
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
    if (!(options && options.skipAllocations)) await loadAllocations();
    state.poSettings = await service().getPoSettings();
    renderPoSettingsUi();
    if (state.page === 'dashboard' && !(options && options.skipDashboard)) await loadDashboardStats();
    if (state.page === 'verify') await loadVerifyQueue();
    if (state.page === 'labs') await renderLabConfig();
    if (state.page === 'outcomes') await loadPoOutcomeReport();
    if (!(options && options.silent)) showMessage('Program data refreshed.', 'success');
  }

  async function initialize(user) {
    state.currentUser = user;
    var profile = await firebase.firestore().collection('users').doc(user.uid).get();
    var poRole = normalizeKey(profile.exists ? profile.data().role : '');
    if (!profile.exists || (poRole !== 'program officer' && poRole !== 'programme officer')) {
      throw new Error('Active Project Account access required.');
    }
    var profileData = profile.data() || {};
    if (/^(test\s+)?program(me)?\s+officer$/i.test(String(profileData.displayName || profileData.name || '').trim())) {
      firebase.firestore().collection('users').doc(user.uid).update({
        displayName: 'Project Account',
        name: 'Project Account'
      }).catch(function () {});
    }
    byId('signedInUser').textContent = officerDisplayName(profileName(Object.assign({ id: profile.id }, profileData)));
    fillYearOptions(byId('dashYear'));
    fillMonthOptions(byId('dashMonth'));
    fillPeriodSelect(byId('verifyPeriod'), 'all');
    fillYearOptions(byId('outcomeYear'));
    fillMonthOptions(byId('outcomeMonth'));
    byId('verifyStatus').value = 'redeemed';
    setNavCollapsed(false);
    await refreshAll({ silent: true, skipDashboard: true, skipAllocations: true });
    showPage('dashboard');
  }

  document.addEventListener('DOMContentLoaded', function () {
    bindEvents();
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
        showMessage(error.message || 'Could not open Project Account.', 'error');
      });
    });
  });
})();
