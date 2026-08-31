(function (global) {
  'use strict';

  var PAGE_SIZE = 25;
  var TIMEOUT_MS = 20000;
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

  function ymd(date) {
    return date.toISOString().slice(0, 10);
  }

  function defaultPeriod() {
    var now = new Date();
    return {
      year: String(now.getFullYear()),
      month: String(now.getMonth() + 1).padStart(2, '0')
    };
  }

  function periodDates(values) {
    var year = parseInt(values.year, 10);
    var month = parseInt(values.month, 10);
    if (values.period === 'custom') {
      return { periodStart: values.start || null, periodEnd: values.end || null };
    }
    if (values.period === 'year' && year) {
      return { periodStart: year + '-01-01', periodEnd: year + '-12-31' };
    }
    if (year && month) {
      return {
        periodStart: year + '-' + String(month).padStart(2, '0') + '-01',
        periodEnd: ymd(new Date(Date.UTC(year, month, 0)))
      };
    }
    return {};
  }

  function paramValues() {
    var params = new URLSearchParams(location.search);
    var defaults = defaultPeriod();
    return {
      period: params.get('period') || 'month',
      year: params.get('year') || defaults.year,
      month: params.get('month') || defaults.month,
      start: params.get('start') || '',
      end: params.get('end') || '',
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
      return '<label class="tracking-type-chip"><input type="checkbox" name="facilityTypes" value="' +
        type + '"' + (selectedSet.has(type) ? ' checked' : '') + '><span>' +
        (FACILITY_TYPE_LABELS[type] || type) + '</span></label>';
    }).join('');
  }

  function installStyles() {
    if (document.getElementById('trackingReaderStyles')) return;
    var style = document.createElement('style');
    style.id = 'trackingReaderStyles';
    style.textContent =
      '.tracking-filters{position:sticky;top:68px;z-index:90;display:grid;grid-template-columns:repeat(auto-fit,minmax(118px,1fr));gap:.65rem;align-items:end;padding:.85rem;margin-bottom:.8rem;background:rgba(255,255,255,.98);border:1px solid #e2e8f0;border-radius:14px;box-shadow:0 6px 22px rgba(15,23,42,.09)}' +
      '.tracking-filter{display:flex;flex-direction:column;gap:.28rem;min-width:0}.tracking-filter label,.tracking-filter-label{font-size:.66rem;font-weight:800;letter-spacing:.025em;text-transform:uppercase;color:#64748b}' +
      '.tracking-filter select,.tracking-filter input{width:100%;min-height:44px;border:1px solid #cbd5e1;border-radius:10px;background:#fff;padding:.48rem .65rem;font-size:.82rem;color:#172033;outline:none;transition:border-color .15s,box-shadow .15s}' +
      '.tracking-filter select:focus,.tracking-filter input:focus{border-color:#7357a6;box-shadow:0 0 0 3px rgba(115,87,166,.14)}' +
      '.tracking-filter-wide{grid-column:span 2}.tracking-type-picker{position:relative}.tracking-type-picker>summary{display:flex;align-items:center;justify-content:space-between;min-height:44px;padding:.48rem .7rem;border:1px solid #cbd5e1;border-radius:10px;background:#fff;color:#334155;font-size:.82rem;cursor:pointer;list-style:none}.tracking-type-picker>summary::-webkit-details-marker{display:none}.tracking-type-picker>summary:after{content:"⌄";font-size:1rem;color:#64748b}.tracking-type-picker[open]>summary{border-color:#7357a6;box-shadow:0 0 0 3px rgba(115,87,166,.14)}' +
      '.tracking-type-menu{position:absolute;z-index:110;top:calc(100% + 5px);left:0;right:0;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.35rem;padding:.6rem;background:#fff;border:1px solid #dbe2ea;border-radius:12px;box-shadow:0 12px 30px rgba(15,23,42,.16)}.tracking-type-chip{display:flex!important;align-items:center;gap:.42rem;min-height:38px;padding:.35rem .45rem;border-radius:8px;text-transform:none!important;letter-spacing:0!important;font-size:.74rem!important;color:#334155!important;cursor:pointer}.tracking-type-chip:hover{background:#f1f5f9}.tracking-type-chip input{width:17px!important;min-height:17px!important;height:17px;margin:0;accent-color:#7357a6}' +
      '.tracking-filter-actions{display:flex;gap:.45rem;align-items:center}.tracking-filter-actions button{min-height:44px;border-radius:10px;padding:.48rem .9rem;font-size:.8rem;font-weight:800;touch-action:manipulation;cursor:pointer;transition:transform .12s,box-shadow .12s,background .12s}.tracking-filter-actions button:active{transform:translateY(1px)}.tracking-apply{border:0;color:#fff;background:linear-gradient(135deg,#a51f1f,#6f3c98);box-shadow:0 4px 12px rgba(111,60,152,.22)}.tracking-reset{border:1px solid #cbd5e1;color:#475569;background:#fff}.tracking-repair{border:1px solid #d8c9e7;color:#64358e;background:#f8f4fb}.tracking-repair:disabled{opacity:.65;cursor:wait}.tracking-repair-status{grid-column:1/-1;font-size:.75rem;color:#475569}' +
      '.tracking-state{padding:.7rem 1rem;text-align:center;color:#475569}.tracking-state.error{color:#b91c1c}.tracking-load-more{min-height:44px;margin:.75rem;border:1px solid #cbd5e1;border-radius:10px;background:#fff;font-weight:800;padding:.5rem 1rem}' +
      '.tracking-infections{display:flex;gap:.25rem;flex-wrap:wrap;margin-top:.25rem}.tracking-infection{font-size:.62rem;font-weight:800;background:#fef2f2;color:#b91c1c;border:1px solid #fecaca;border-radius:999px;padding:.15rem .4rem}' +
      '.tracking-source{display:block;margin-top:.2rem;font-size:.68rem;color:#64748b}.tracking-facility{font-size:.76rem;line-height:1.35}' +
      '@media(max-width:768px){.tracking-filters{top:66px;grid-template-columns:repeat(2,minmax(0,1fr));padding:.65rem;gap:.5rem}.tracking-filter-wide,.tracking-filter-actions{grid-column:1/-1}.tracking-type-menu{position:fixed;left:12px;right:12px;top:auto;grid-template-columns:1fr 1fr;max-height:45dvh;overflow:auto}.tracking-filter-actions button{flex:1;padding:.45rem .65rem}}';
    document.head.appendChild(style);
  }

  function createControls(config) {
    installStyles();
    var values = paramValues();
    var level = roleLevel(config.role);
    var fixedRegion = config.userData && config.userData.region || '';
    var host = document.createElement('form');
    host.className = 'tracking-filters';
    host.id = config.kind + 'TrackingFilters';
    var years = '';
    var currentYear = new Date().getFullYear();
    for (var year = currentYear + 1; year >= currentYear - 10; year--) {
      years += option(String(year), String(year), String(year) === values.year);
    }
    var months = '';
    for (var month = 1; month <= 12; month++) {
      var monthValue = String(month).padStart(2, '0');
      months += option(monthValue, new Date(2020, month - 1, 1).toLocaleString(undefined, { month: 'short' }), monthValue === values.month);
    }
    host.innerHTML =
      '<div class="tracking-filter"><label>Period</label><select name="period">' +
        option('month', 'Month', values.period === 'month') +
        option('year', 'Year', values.period === 'year') +
        option('custom', 'Custom dates', values.period === 'custom') + '</select></div>' +
      '<div class="tracking-filter tracking-year"><label>Year</label><select name="year">' + years + '</select></div>' +
      '<div class="tracking-filter tracking-month"><label>Month</label><select name="month">' + months + '</select></div>' +
      '<div class="tracking-filter tracking-custom"><label>From</label><input type="date" name="start" value="' + values.start + '"></div>' +
      '<div class="tracking-filter tracking-custom"><label>To</label><input type="date" name="end" value="' + values.end + '"></div>' +
      (level === 'central' ? '<div class="tracking-filter"><label>Region</label><select name="region">' + regionOptions(values.region) + '</select></div>' : '') +
      (level === 'central' || level === 'regional' ? '<div class="tracking-filter"><label>Township</label><select name="township">' + townshipOptions(values.region, values.township, level === 'regional' ? fixedRegion : '') + '</select></div>' : '') +
      (level !== 'provider' ? '<div class="tracking-filter"><label>Department</label><select name="department">' +
        option('', 'DOPH & DOMS', !values.department) + option('doph', 'DOPH', values.department === 'doph') +
        option('doms', 'DOMS', values.department === 'doms') + '</select></div>' +
        '<div class="tracking-filter tracking-filter-wide"><span class="tracking-filter-label">Facility types</span>' +
        '<details class="tracking-type-picker"><summary>Choose facility types</summary><div class="tracking-type-menu">' +
        typeCheckboxes(values.facilityTypes) + '</div></details></div>' : '') +
      '<div class="tracking-filter-actions"><button class="tracking-apply" type="submit"><i class="fas fa-filter"></i> Apply</button>' +
        '<button class="tracking-reset" type="button" data-reset>Reset</button>' +
        (normalizeRole(config.role) === 'super admin'
          ? '<button class="tracking-repair" type="button" data-repair><i class="fas fa-rotate"></i> Rebuild data</button>'
          : '') + '</div>' +
      (normalizeRole(config.role) === 'super admin'
        ? '<div class="tracking-repair-status" data-repair-status aria-live="polite"></div>'
        : '');
    var anchor = document.getElementById('dashboardState') || document.getElementById('loadingState');
    anchor.parentNode.insertBefore(host, anchor);

    function updateVisibility() {
      var period = host.elements.period.value;
      host.querySelector('.tracking-year').style.display = period === 'custom' ? 'none' : '';
      host.querySelector('.tracking-month').style.display = period === 'month' ? '' : 'none';
      host.querySelectorAll('.tracking-custom').forEach(function (el) {
        el.style.display = period === 'custom' ? '' : 'none';
      });
    }
    updateVisibility();
    host.elements.period.addEventListener('change', updateVisibility);
    if (host.elements.region) {
      host.elements.region.addEventListener('change', function () {
        host.elements.township.innerHTML = townshipOptions(host.elements.region.value, '', '');
      });
    }
    host.addEventListener('submit', function (event) {
      event.preventDefault();
      config.onApply(readFilters(host, level));
    });
    host.querySelector('[data-reset]').addEventListener('click', function () {
      var url = new URL(location.href);
      url.search = '';
      history.replaceState({}, '', url);
      host.remove();
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
    return { element: host, filters: readFilters(host, level), level: level };
  }

  function readFilters(form, level) {
    var values = {
      period: form.elements.period.value,
      year: form.elements.year.value,
      month: form.elements.month.value,
      start: form.elements.start.value,
      end: form.elements.end.value,
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
    ['period', 'year', 'month', 'start', 'end', 'region', 'township', 'department'].forEach(function (key) {
      if (filters[key]) params.set(key, filters[key]);
    });
    (filters.facilityTypes || []).forEach(function (type) { params.append('facilityType', type); });
    history.replaceState({}, '', location.pathname + '?' + params.toString());
  }

  function callableUrl(name) {
    var projectId = global.firebaseConfig && firebaseConfig.projectId ||
      firebase.app().options.projectId;
    return 'https://us-central1-' + projectId + '.cloudfunctions.net/' + name;
  }

  async function call(name, payload) {
    var user = firebase.auth().currentUser;
    if (!user) throw new Error('Sign in is required.');
    var token = await user.getIdToken();
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, TIMEOUT_MS);
    try {
      var response = await fetch(callableUrl(name), {
        method: 'POST',
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

  function payload(filters, pageToken) {
    var result = { pageSize: PAGE_SIZE };
    ['periodStart', 'periodEnd', 'region', 'township', 'department'].forEach(function (key) {
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
