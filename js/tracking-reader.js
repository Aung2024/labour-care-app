(function (global) {
  'use strict';

  var PAGE_SIZE = 40;
  var TIMEOUT_MS = 55000;
  var FACILITY_TYPE_LABELS = {
    district_hospital: 'District hospital',
    maternity_home: 'Maternity home',
    regional_public_health_department: 'Regional public health department',
    township_public_health_department: 'Township public health department',
    township_hospital: 'Township hospital',
    station_hospital: 'Station hospital',
    station_health_unit: 'Station health unit',
    mch: 'MCH',
    rhc: 'RHC',
    srhc: 'Sub-RHC',
    other: 'Other'
  };

  function normalizeRole(value) {
    return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
  }

  function roleLevel(role) {
    role = normalizeRole(role);
    if (['super admin', 'central', 'admin'].indexOf(role) !== -1) return 'central';
    if (role === 'regional officer') return 'regional';
    if (role === 'tmo' || role === 'township medical officer') return 'tmo';
    return 'provider';
  }

  function trackingV2Enabled() {
    if (global.__LABOURCARE_FEATURES__ &&
        global.__LABOURCARE_FEATURES__.trackingV2 === false) return false;
    return localStorage.getItem('trackingV2Enabled') !== 'false';
  }

  var MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  function ymdUtc(year, month, day) {
    return year + '-' + String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0');
  }

  function lastDayOfMonth(year, month) {
    return new Date(Date.UTC(year, month, 0)).getUTCDate();
  }

  function currentYearValue() {
    return new Date().getFullYear();
  }

  function periodDates(values) {
    var year = parseInt(values.year, 10);
    if (!year || year > currentYearValue()) {
      return { periodStart: '2000-01-01', periodEnd: '9999-12-31' };
    }
    var month = parseInt(values.month, 10);
    if (!month) {
      return { periodStart: year + '-01-01', periodEnd: year + '-12-31' };
    }
    return {
      periodStart: ymdUtc(year, month, 1),
      periodEnd: ymdUtc(year, month, lastDayOfMonth(year, month))
    };
  }

  function paramValues() {
    var params = new URLSearchParams(location.search);
    var year = params.get('year') || '';
    var month = params.get('month') || '';
    if (parseInt(year, 10) > currentYearValue()) {
      year = '';
      month = '';
    }
    if (!year) month = '';
    return {
      year: year,
      month: month,
      region: params.get('region') || '',
      township: params.get('township') || '',
      department: params.get('department') || '',
      facilityTypes: params.getAll('facilityType')
    };
  }

  function option(value, label, selected) {
    return '<option value="' + value + '"' + (selected ? ' selected' : '') + '>' +
      label + '</option>';
  }

  function regionOptions(selected) {
    var regions = Object.keys(global.MYANMAR_REGIONS || {}).sort();
    return option('', 'All regions', !selected) + regions.map(function (region) {
      return option(region, region, region === selected);
    }).join('');
  }

  function townshipOptions(region, selected, fixedRegion) {
    var map = global.MYANMAR_REGIONS || {};
    var townships = region && map[region] ? map[region].slice() :
      Object.keys(global.TOWNSHIP_TO_REGION || {}).sort();
    if (fixedRegion && map[fixedRegion]) townships = map[fixedRegion].slice();
    return option('', 'All townships', !selected) + townships.map(function (township) {
      return option(township, township, township === selected);
    }).join('');
  }

  function typeCheckboxes(selected) {
    var selectedSet = new Set(selected || []);
    var types = global.FacilityConfig ? FacilityConfig.getFacilityTypes() :
      Object.keys(FACILITY_TYPE_LABELS);
    return types.map(function (type) {
      return '<label><input type="checkbox" name="facilityTypes" value="' +
        type + '"' + (selectedSet.has(type) ? ' checked' : '') + '> ' +
        (FACILITY_TYPE_LABELS[type] || type) + '</label>';
    }).join('');
  }

  function installStyles() {
    if (document.getElementById('trackingReaderStyles')) return;
    var style = document.createElement('style');
    style.id = 'trackingReaderStyles';
    style.textContent =
      '.tracking-filters-wrap{margin:0 0 .85rem;border:1px solid #e2e8f0;border-radius:14px;background:#fff;box-shadow:0 1px 3px rgba(15,23,42,.05)}' +
      '.tracking-filters-toggle{width:100%;display:flex;align-items:center;gap:.7rem;min-height:44px;padding:.55rem .85rem;border:0;background:transparent;text-align:left;cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent}' +
      '.tracking-filters-toggle-title{font-size:.82rem;font-weight:800;color:#0f172a;white-space:nowrap}' +
      '.tracking-filters-toggle-summary{flex:1;min-width:0;color:#64748b;font-size:.75rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      '.tracking-filters-toggle i{margin-left:auto;color:#64748b}' +
      '.tracking-filters-wrap.is-open .tracking-filters-toggle i{transform:rotate(180deg)}' +
      '.tracking-filters{display:none;flex-direction:column;gap:.75rem;padding:0 .85rem .9rem;border-top:1px solid #eef2f7}' +
      '.tracking-filters-wrap.is-open .tracking-filters{display:flex}' +
      '.tracking-filter-row{display:grid;grid-template-columns:1fr 1fr;gap:.65rem;align-items:end}' +
      '.tracking-filter{display:flex;flex-direction:column;gap:.28rem;min-width:0}' +
      '.tracking-filter label,.tracking-types-label{margin:0;font-size:.75rem;font-weight:700;color:#334155}' +
      '.tracking-filter select{width:100%;min-height:44px;border:1px solid #cbd5e1;border-radius:10px;background:#fff;padding:.48rem .65rem;font-size:.82rem;color:#172033}' +
      '.tracking-apply-wrap{grid-column:1/-1}' +
      '.tracking-apply,.tracking-reset,.tracking-repair{min-height:44px;border-radius:10px;padding:.48rem .9rem;font-size:.8rem;font-weight:800;touch-action:manipulation;cursor:pointer}' +
      '.tracking-apply{width:100%;border:0;color:#fff;background:#059669}' +
      '.tracking-filters-wrap[data-theme="hrt"] .tracking-apply{background:linear-gradient(135deg,#a51f1f,#6f3c98)}' +
      '.tracking-filter-actions{display:flex;flex-wrap:wrap;gap:.45rem}' +
      '.tracking-reset{border:1px solid #cbd5e1;color:#475569;background:#fff}' +
      '.tracking-repair{border:1px solid #d8c9e7;color:#64358e;background:#f8f4fb}' +
      '.tracking-repair:disabled{opacity:.65;cursor:wait}' +
      '.tracking-repair-status{font-size:.75rem;color:#475569}' +
      '.tracking-type-chips{display:flex;flex-wrap:wrap;gap:.4rem}' +
      '.tracking-type-chips label{display:inline-flex;align-items:center;gap:.4rem;min-height:44px;padding:.3rem .7rem;border:1px solid #d1d5db;border-radius:999px;background:#fff;color:#334155;font-size:.78rem;font-weight:600;cursor:pointer}' +
      '.tracking-type-chips input{width:16px;height:16px;margin:0;accent-color:#059669}' +
      '.tracking-filters-wrap[data-theme="hrt"] .tracking-type-chips input{accent-color:#a51f1f}' +
      '.tracking-state{padding:.7rem 1rem;text-align:center;color:#475569}.tracking-state.error{color:#b91c1c}' +
      '.tracking-pager{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:.55rem;padding:.65rem .85rem;margin:0 0 .65rem;border:1px solid #e2e8f0;border-radius:12px;background:#fff}' +
      '.tracking-pager-meta{font-size:.78rem;color:#475569}' +
      '.tracking-load-more{min-height:44px;border:0;border-radius:10px;background:#0f172a;color:#fff;font-weight:800;padding:.5rem 1rem}' +
      '.tracking-infections{display:flex;gap:.25rem;flex-wrap:wrap;margin-top:.25rem}.tracking-infection{font-size:.62rem;font-weight:800;background:#fef2f2;color:#b91c1c;border:1px solid #fecaca;border-radius:999px;padding:.15rem .4rem}' +
      '.tracking-facility{font-size:.76rem;line-height:1.35}' +
      '@media(min-width:768px){.tracking-filter-row{grid-template-columns:minmax(140px,180px) minmax(140px,180px) auto}.tracking-apply-wrap{grid-column:auto}.tracking-apply{min-width:140px}.tracking-scope-row{grid-template-columns:repeat(3,minmax(0,1fr))}}';
    document.head.appendChild(style);
  }

  function filterSummary(form, level) {
    var parts = [];
    var year = form.elements.year.value;
    var month = form.elements.month.value;
    if (!year) parts.push('All time');
    else if (!month) parts.push(year);
    else parts.push(MONTH_NAMES[parseInt(month, 10) - 1] + ' ' + year);
    if (level === 'central') parts.push(form.elements.region && form.elements.region.value || 'All regions');
    if ((level === 'central' || level === 'regional') && form.elements.township) {
      parts.push(form.elements.township.value || 'All townships');
    }
    if (level !== 'provider') parts.push('All facilities');
    var types = form.querySelectorAll('input[name="facilityTypes"]:checked');
    if (types.length) {
      parts[parts.length - 1] = types.length + ' facility type' + (types.length === 1 ? '' : 's');
    }
    return parts.join(' · ');
  }

  function createControls(config) {
    installStyles();
    var values = paramValues();
    var level = roleLevel(config.role);
    var fixedRegion = config.userData && config.userData.region || '';
    var wrap = document.createElement('div');
    wrap.className = 'tracking-filters-wrap';
    wrap.id = config.kind + 'TrackingFilters';
    wrap.setAttribute('data-theme', config.kind || '');
    var years = option('', 'All time', !values.year);
    var currentYear = currentYearValue();
    for (var year = currentYear; year >= currentYear - 5; year--) {
      years += option(String(year), String(year), String(year) === values.year);
    }
    var months = option('', 'All months', !values.month);
    for (var month = 1; month <= 12; month++) {
      var monthValue = String(month).padStart(2, '0');
      months += option(monthValue, MONTH_NAMES[month - 1], monthValue === values.month);
    }
    var scopeHtml = '';
    if (level === 'central') {
      scopeHtml += '<div class="tracking-filter"><label>Region</label><select name="region">' +
        regionOptions(values.region) + '</select></div>';
    }
    if (level === 'central' || level === 'regional') {
      scopeHtml += '<div class="tracking-filter"><label>Township</label><select name="township">' +
        townshipOptions(values.region, values.township, level === 'regional' ? fixedRegion : '') +
        '</select></div>';
    }
    if (level !== 'provider') {
      scopeHtml += '<div class="tracking-filter"><label>Department</label><select name="department">' +
        option('', 'All departments', !values.department) +
        option('doph', 'DOPH', values.department === 'doph') +
        option('doms', 'DOMS', values.department === 'doms') +
        option('other', 'Other / unclassified', values.department === 'other') +
        '</select></div>';
    }
    wrap.innerHTML =
      '<button type="button" class="tracking-filters-toggle" aria-expanded="false">' +
        '<span class="tracking-filters-toggle-title">Filters</span>' +
        '<span class="tracking-filters-toggle-summary"></span>' +
        '<i class="fas fa-chevron-down" aria-hidden="true"></i>' +
      '</button>' +
      '<form class="tracking-filters">' +
        '<div class="tracking-filter-row">' +
          '<div class="tracking-filter"><label>Year</label><select name="year">' + years + '</select></div>' +
          '<div class="tracking-filter"><label>Month</label><select name="month"' +
            (values.year ? '' : ' disabled') + '>' + months + '</select></div>' +
          '<div class="tracking-apply-wrap"><button class="tracking-apply" type="submit">Apply</button></div>' +
        '</div>' +
        (scopeHtml ? '<div class="tracking-filter-row tracking-scope-row">' + scopeHtml + '</div>' : '') +
        (level !== 'provider'
          ? '<div><p class="tracking-types-label">Facility types</p><div class="tracking-type-chips">' +
            typeCheckboxes(values.facilityTypes) + '</div></div>'
          : '') +
        '<div class="tracking-filter-actions">' +
          '<button class="tracking-reset" type="button" data-reset>Reset</button>' +
          (normalizeRole(config.role) === 'super admin'
            ? '<button class="tracking-repair" type="button" data-repair><i class="fas fa-rotate"></i> Rebuild data</button>'
            : '') +
        '</div>' +
        (normalizeRole(config.role) === 'super admin'
          ? '<div class="tracking-repair-status" data-repair-status aria-live="polite"></div>'
          : '') +
      '</form>';
    var host = wrap.querySelector('form');
    var toggle = wrap.querySelector('.tracking-filters-toggle');
    var summary = wrap.querySelector('.tracking-filters-toggle-summary');
    var anchor = document.getElementById('dashboardState') || document.getElementById('loadingState');
    if (!host || !anchor || !anchor.parentNode) {
      throw new Error('Tracking filters could not be placed on this page.');
    }
    anchor.parentNode.insertBefore(wrap, anchor);

    function syncMonthState() {
      var yearEl = host.elements.year;
      var monthEl = host.elements.month;
      if (!yearEl || !monthEl) return;
      var hasYear = !!yearEl.value;
      monthEl.disabled = !hasYear;
      if (!hasYear) monthEl.value = '';
    }
    function refreshSummary() {
      summary.textContent = filterSummary(host, level);
    }
    function setOpen(open) {
      wrap.classList.toggle('is-open', open);
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    }
    syncMonthState();
    refreshSummary();
    toggle.addEventListener('click', function () {
      setOpen(!wrap.classList.contains('is-open'));
    });
    if (host.elements.year) {
      host.elements.year.addEventListener('change', function () {
        syncMonthState();
        refreshSummary();
      });
    }
    if (host.elements.month) host.elements.month.addEventListener('change', refreshSummary);
    if (host.elements.region) {
      host.elements.region.addEventListener('change', function () {
        host.elements.township.innerHTML = townshipOptions(host.elements.region.value, '', '');
        refreshSummary();
      });
    }
    if (host.elements.township) host.elements.township.addEventListener('change', refreshSummary);
    if (host.elements.department) host.elements.department.addEventListener('change', refreshSummary);
    host.querySelectorAll('input[name="facilityTypes"]').forEach(function (input) {
      input.addEventListener('change', refreshSummary);
    });
    host.addEventListener('submit', function (event) {
      event.preventDefault();
      refreshSummary();
      setOpen(false);
      config.onApply(readFilters(host, level));
    });
    host.querySelector('[data-reset]').addEventListener('click', function () {
      var url = new URL(location.href);
      url.search = '';
      history.replaceState({}, '', url);
      wrap.remove();
      config.onReset();
    });
    var repairButton = host.querySelector('[data-repair]');
    if (repairButton) {
      repairButton.addEventListener('click', async function () {
        var status = host.querySelector('[data-repair-status]');
        if (!global.confirm('Rebuild HRT and KMC tracking data for all patients? This runs safely in background batches.')) return;
        repairButton.disabled = true;
        status.textContent = 'Starting the background rebuild…';
        try {
          var result = await call('startTrackingProjectionRepair', {});
          status.textContent = result.alreadyRunning
            ? 'A tracking-data rebuild is already running.'
            : 'Tracking-data rebuild started. You may leave this page.';
        } catch (error) {
          status.textContent = 'Could not start rebuild: ' + (error.message || error);
          repairButton.disabled = false;
        }
      });
    }
    return { element: wrap, filters: readFilters(host, level), level: level };
  }

  function readFilters(form, level) {
    var values = {
      year: form.elements.year ? form.elements.year.value : '',
      month: (form.elements.month && !form.elements.month.disabled) ? form.elements.month.value : '',
      region: form.elements.region ? form.elements.region.value : '',
      township: form.elements.township ? form.elements.township.value : '',
      department: form.elements.department ? form.elements.department.value : '',
      facilityTypes: form.querySelectorAll('input[name="facilityTypes"]:checked').length
        ? Array.from(form.querySelectorAll('input[name="facilityTypes"]:checked'))
          .map(function (item) { return item.value; })
        : []
    };
    var dates = periodDates(values);
    return Object.assign(values, dates, { roleLevel: level });
  }

  function restoreUrl(filters) {
    var params = new URLSearchParams();
    ['year', 'month', 'region', 'township', 'department'].forEach(function (key) {
      if (filters[key]) params.set(key, filters[key]);
    });
    (filters.facilityTypes || []).forEach(function (type) { params.append('facilityType', type); });
    var query = params.toString();
    history.replaceState({}, '', location.pathname + (query ? '?' + query : ''));
  }

  function callableUrl(name) {
    var projectId = global.firebaseConfig && firebaseConfig.projectId ||
      firebase.app().options.projectId;
    var configuredUrls = global.firebaseConfig && firebaseConfig.functionUrls || {};
    if (configuredUrls[name]) return configuredUrls[name];
    // The Cloud Functions vanity host is intermittently reset by some local
    // networks. This is the same deployed Gen 2 service on its stable Cloud
    // Run host, not a separate backend.
    var serviceUrls = {
      'mnch-1cbda': {
        queryHrtTracking: 'https://queryhrttracking-houbbz2mta-uc.a.run.app',
        queryKmcTracking: 'https://querykmctracking-houbbz2mta-uc.a.run.app'
      }
    };
    if (serviceUrls[projectId] && serviceUrls[projectId][name]) {
      return serviceUrls[projectId][name];
    }
    return 'https://us-central1-' + encodeURIComponent(projectId) +
      '.cloudfunctions.net/' + encodeURIComponent(name);
  }

  function sleep(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  function isRetryableTrackingError(error) {
    if (!error) return false;
    if (error.name === 'AbortError' || error.code === 'timeout') return true;
    var text = String(error.message || error.code || '');
    return /failed to fetch|networkerror|err_connection|load failed|unavailable|internal/i.test(text);
  }

  function friendlyTrackingError(error) {
    if (!isRetryableTrackingError(error) && !(error && error.name === 'TypeError')) return error;
    var friendly = new Error('The tracking service could not be reached. Check the connection and try again.');
    friendly.code = error && error.code || 'unavailable';
    return friendly;
  }

  async function callOnce(name, payload) {
    var user = firebase.auth().currentUser;
    if (!user) throw new Error('Sign in is required.');
    var token = await user.getIdToken();
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, TIMEOUT_MS);
    try {
      var response = await fetch(callableUrl(name), {
        method: 'POST',
        mode: 'cors',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ data: payload }),
        signal: controller.signal
      });
      var body = await response.json().catch(function () { return {}; });
      if (!response.ok || body.error) {
        var detail = body.error && body.error.message;
        var error = new Error(detail || ('Tracking service returned ' + response.status));
        error.code = body.error && body.error.status || String(response.status);
        throw error;
      }
      return body.result || body.data || {};
    } catch (error) {
      if (error && error.name === 'AbortError') {
        var timeout = new Error('The tracking request timed out. Check the connection and try again.');
        timeout.code = 'timeout';
        throw timeout;
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  async function call(name, payload) {
    var lastError = null;
    for (var attempt = 1; attempt <= 3; attempt++) {
      try {
        return await callOnce(name, payload);
      } catch (error) {
        lastError = error;
        if (!isRetryableTrackingError(error) || attempt === 3) {
          throw friendlyTrackingError(error);
        }
        await sleep(700 * attempt);
      }
    }
    throw friendlyTrackingError(lastError);
  }

  function payload(filters, pageToken) {
    var result = { pageSize: PAGE_SIZE };
    ['periodStart', 'periodEnd', 'region', 'township', 'department', 'status'].forEach(function (key) {
      if (filters[key]) result[key] = filters[key];
    });
    if (filters.facilityTypes && filters.facilityTypes.length) result.facilityTypes = filters.facilityTypes;
    if (pageToken) result.pageToken = pageToken;
    return result;
  }

  function facilityName(code) {
    if (!global.FacilityConfig) return code || '—';
    var facility = FacilityConfig.getFacilityByCode(code);
    return facility ? FacilityConfig.getFacilityLabel(facility, localStorage.getItem('appLanguage') || 'en') : (code || '—');
  }

  function infectionHtml(flags) {
    var labels = [];
    Object.keys(flags || {}).forEach(function (key) {
      var value = flags[key];
      if (value === true || (value && (value.result === 'positive' || typeof value === 'object'))) {
        labels.push(key.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').toUpperCase());
      }
    });
    if (!labels.length) return '';
    return '<div class="tracking-infections">' + labels.map(function (label) {
      return '<span class="tracking-infection"><i class="fas fa-triangle-exclamation"></i> ' + label + '</span>';
    }).join('') + '</div>';
  }

  function shouldFallback(error) {
    var code = String(error && error.code || '').toLowerCase();
    return code.indexOf('404') !== -1 || code.indexOf('not_found') !== -1 ||
      code.indexOf('unimplemented') !== -1;
  }

  global.TrackingReader = {
    PAGE_SIZE: PAGE_SIZE,
    createControls: createControls,
    restoreUrl: restoreUrl,
    call: call,
    payload: payload,
    roleLevel: roleLevel,
    enabled: trackingV2Enabled,
    facilityName: facilityName,
    infectionHtml: infectionHtml,
    shouldFallback: shouldFallback
  };
})(typeof window !== 'undefined' ? window : this);
