(function () {
  'use strict';

  /*
   * Voucher service integration contract
   * ------------------------------------
   * Preferred high-level window.VoucherService methods:
   *   getServiceCatalog(), upsertService(service)
   *   getPriceOverrides(filters), upsertPriceOverride(override)
   *   getAllocations(filters), allocateVouchers(allocation)
   *   getVoucherReport(filters)
   *
   * The current lower-level service is also supported directly:
   *   saveCatalogService(), publishPricingVersion(), createBudget(),
   *   allocateQuota(), queryVoucherReport(), and VoucherService.collections.
   *
   * For compatibility, the adapter below also accepts common aliases such as
   * listServices/saveService, listPriceOverrides/savePriceOverride,
   * listAllocations/saveAllocation, and listVouchers/getVouchers.
   * Each read method may return an array, Firestore QuerySnapshot, or an object
   * containing items/data/services/overrides/allocations/vouchers.
   */

  var state = {
    currentUser: null,
    profiles: [],
    maternityHomes: [],
    labs: [],
    services: [],
    priceOverrides: [],
    budgets: [],
    allocations: [],
    vouchers: [],
    reportNextCursor: null
  };

  var STANDARD_TESTS = [
    ['urine-re', 'URINE_RE', 'Urine RE', 5000],
    ['hb', 'HB', 'Hemoglobin (Hb%)', 4000],
    ['blood-group', 'BLOOD_GROUP', 'Blood for Grouping & Matching', 8000],
    ['hbsag', 'HBSAG', 'HBsAg', 10000],
    ['hcv-antibody', 'HCV_ANTIBODY', 'HCV Antibody', 12000],
    ['hiv-antibody', 'HIV_ANTIBODY', 'HIV 1&2 antibody', 12000],
    ['vdrl', 'VDRL', 'Syphilis (VDRL)', 7000],
    ['ultrasound', 'ULTRASOUND', 'Ultrasound', 25000],
    ['rbs', 'RBS', 'Random Blood Glucose (RBS)', 5000],
    ['g6pd', 'G6PD', 'G6PD', 15000],
    ['ogtt', 'OGTT', 'OGTT (Gestational Diabetes)', 18000],
    ['cp-auto', 'CP_AUTO', 'Blood for Complete Picture (CP auto)', 15000],
    ['hba1c', 'HBA1C', 'HbA1C', 20000],
    ['malaria', 'MALARIA', 'Malaria Test', 8000],
    ['serum-bilirubin', 'SERUM_BILIRUBIN', 'Serum Bilirubin', 10000]
  ];

  var messageTimer = null;

  function byId(id) {
    return document.getElementById(id);
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function normalizeKey(value) {
    return String(value || '').toLowerCase().trim().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
  }

  function numberValue(value) {
    var number = Number(value);
    return Number.isFinite(number) ? number : 0;
  }

  function formatNumber(value) {
    return numberValue(value).toLocaleString();
  }

  function formatMoney(value, currency) {
    return formatNumber(value) + ' ' + escapeHtml(currency || 'MMK');
  }

  function formatDate(value) {
    if (!value) return '—';
    var date = value;
    if (typeof value.toDate === 'function') date = value.toDate();
    else if (value.seconds) date = new Date(value.seconds * 1000);
    else if (!(value instanceof Date)) date = new Date(value);
    if (Number.isNaN(date.getTime())) return escapeHtml(value);
    return date.toLocaleDateString();
  }

  function toDateInputValue(date) {
    var year = date.getFullYear();
    var month = String(date.getMonth() + 1).padStart(2, '0');
    var day = String(date.getDate()).padStart(2, '0');
    return year + '-' + month + '-' + day;
  }

  function showMessage(text, kind, persistent) {
    var element = byId('pageMessage');
    if (!element) return;
    if (messageTimer) window.clearTimeout(messageTimer);
    element.className = 'po-message po-message--' + (kind || 'info');
    element.textContent = text;
    element.hidden = false;
    if (!persistent) {
      messageTimer = window.setTimeout(function () {
        element.hidden = true;
      }, 5000);
    }
  }

  function errorText(error) {
    if (!error) return 'Unknown error';
    if (error.code === 'permission-denied') {
      return 'Firestore denied this operation. Confirm the Program Officer rules and sign in again.';
    }
    return error.message || String(error);
  }

  function setBusy(button, busy, label) {
    if (!button) return;
    if (busy) {
      button.dataset.originalHtml = button.innerHTML;
      button.disabled = true;
      button.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>' + escapeHtml(label || 'Saving…');
    } else {
      button.disabled = false;
      if (button.dataset.originalHtml) button.innerHTML = button.dataset.originalHtml;
    }
  }

  function profileType(profile) {
    var role = normalizeKey(profile.role);
    var providerType = normalizeKey(profile.providerType || profile.accountType || profile.type);
    var combined = role + ' ' + providerType;
    if (combined.indexOf('lab') !== -1 || combined.indexOf('laboratory') !== -1) return 'lab';
    if (
      role === 'midwife' ||
      combined.indexOf('maternity home') !== -1 ||
      combined.indexOf('maternityhome') !== -1 ||
      providerType.indexOf('midwife') !== -1
    ) return 'maternity';
    return '';
  }

  function profileName(profile) {
    return profile.displayName || profile.name || profile.facilityName || profile.email || 'Unnamed provider';
  }

  function profileIsActive(profile) {
    return profile.active !== false && normalizeKey(profile.status) !== 'inactive' && profile.disabled !== true;
  }

  function isProgramOfficer(profile) {
    var role = normalizeKey(profile && profile.role);
    return role === 'program officer' || role === 'programme officer';
  }

  function getVoucherService() {
    return window.VoucherService || window.voucherService || null;
  }

  function findMethod(names) {
    var service = getVoucherService();
    if (!service) {
      throw new Error('VoucherService is not loaded. Add js/voucher-service.js with the documented Program Officer APIs.');
    }
    for (var i = 0; i < names.length; i += 1) {
      if (typeof service[names[i]] === 'function') {
        return { service: service, fn: service[names[i]], name: names[i] };
      }
    }
    throw new Error('VoucherService does not expose any supported method: ' + names.join(', ') + '.');
  }

  async function callVoucherService(names, payload) {
    var method = findMethod(names);
    try {
      return await method.fn.call(method.service, payload || {});
    } catch (error) {
      error.message = method.name + ': ' + (error.message || String(error));
      throw error;
    }
  }

  function normalizeList(result, keys) {
    if (!result) return [];
    if (Array.isArray(result)) return result;
    if (Array.isArray(result.docs)) {
      return result.docs.map(function (doc) {
        if (doc && typeof doc.data === 'function') return Object.assign({ id: doc.id }, doc.data() || {});
        return doc;
      });
    }
    if (typeof result.forEach === 'function' && typeof result.size === 'number') {
      var snapshotItems = [];
      result.forEach(function (doc) {
        snapshotItems.push(Object.assign({ id: doc.id }, doc.data() || {}));
      });
      return snapshotItems;
    }
    var candidates = (keys || []).concat(['items', 'data', 'results']);
    for (var i = 0; i < candidates.length; i += 1) {
      if (Array.isArray(result[candidates[i]])) return result[candidates[i]];
    }
    return [];
  }

  async function readVoucherCollection(collectionKey, fallbackName) {
    var service = getVoucherService();
    var collectionName = service && service.collections && service.collections[collectionKey];
    collectionName = collectionName || fallbackName;
    var snapshot = await firebase.firestore().collection(collectionName).get();
    return normalizeList(snapshot);
  }

  function serviceHasMethod(name) {
    var service = getVoucherService();
    return !!(service && typeof service[name] === 'function');
  }

  function renderSelect(select, items, placeholder, selectedValue) {
    if (!select) return;
    var html = '<option value="">' + escapeHtml(placeholder) + '</option>';
    items.forEach(function (item) {
      html += '<option value="' + escapeHtml(item.id) + '">' + escapeHtml(profileName(item)) + '</option>';
    });
    select.innerHTML = html;
    if (selectedValue) select.value = selectedValue;
  }

  function renderServiceSelect(select, selectedValue) {
    if (!select) return;
    var html = '<option value="">Select service</option>';
    state.services.forEach(function (service) {
      var label = service.name || service.displayName || service.code || service.id;
      html += '<option value="' + escapeHtml(service.id || service.code) + '">' + escapeHtml(label) + '</option>';
    });
    select.innerHTML = html;
    if (selectedValue) select.value = selectedValue;
  }

  function syncProviderSelects() {
    renderSelect(byId('priceMaternityHome'), state.maternityHomes, 'Select maternity home');
    renderSelect(byId('allocationMaternityHome'), state.maternityHomes, 'Select maternity home');
    renderSelect(byId('reportMaternityHome'), state.maternityHomes, 'All maternity homes');
    renderSelect(byId('reportLab'), state.labs, 'All labs');
    renderServiceSelect(byId('priceService'));
  }

  async function requireProgramOfficer(user) {
    var doc = await firebase.firestore().collection('users').doc(user.uid).get();
    if (!doc.exists) throw new Error('Your Firestore user profile was not found.');
    var profile = Object.assign({ id: doc.id }, doc.data() || {});
    if (!isProgramOfficer(profile) || profile.active === false || profile.approved === false) {
      throw new Error('Active Program Officer access required.');
    }
    return profile;
  }

  async function loadProfiles() {
    var snapshot = await firebase.firestore().collection('users').get();
    var profiles = [];
    snapshot.forEach(function (doc) {
      var profile = Object.assign({ id: doc.id }, doc.data() || {});
      if (profileType(profile)) profiles.push(profile);
    });
    profiles.sort(function (a, b) { return profileName(a).localeCompare(profileName(b)); });
    state.profiles = profiles;
    state.maternityHomes = profiles.filter(function (profile) { return profileType(profile) === 'maternity'; });
    state.labs = profiles.filter(function (profile) { return profileType(profile) === 'lab'; });
    renderProviders();
    syncProviderSelects();
    updateSummary();
  }

  function renderProviders() {
    var list = byId('providersList');
    var typeFilter = byId('providerTypeFilter').value;
    var search = normalizeKey(byId('providerSearch').value);
    var profiles = state.profiles.filter(function (profile) {
      if (typeFilter && profileType(profile) !== typeFilter) return false;
      var haystack = normalizeKey(profileName(profile) + ' ' + (profile.email || '') + ' ' + (profile.description || ''));
      return !search || haystack.indexOf(search) !== -1;
    });

    if (!profiles.length) {
      list.innerHTML = '<div class="po-empty">No matching Midwife / Maternity Home or Lab profiles.</div>';
      return;
    }

    list.innerHTML = profiles.map(function (profile) {
      var index = state.profiles.indexOf(profile);
      var active = profileIsActive(profile);
      var typeLabel = profileType(profile) === 'lab' ? 'Lab' : 'Midwife / Maternity Home';
      return (
        '<article class="po-provider-card' + (active ? '' : ' is-inactive') + '" data-profile-index="' + index + '">' +
          '<div class="po-provider-card__head"><div>' +
            '<h3 class="po-provider-card__name">' + escapeHtml(profileName(profile)) + '</h3>' +
            '<div class="po-provider-card__meta">' + escapeHtml(profile.email || 'No email') + ' · ' + escapeHtml(typeLabel) + '</div>' +
          '</div><span class="po-badge ' + (active ? 'po-badge--active' : 'po-badge--inactive') + '">' + (active ? 'Active' : 'Inactive') + '</span></div>' +
          '<div class="po-provider-fields">' +
            '<label><span>Display name</span><input class="form-control" data-field="displayName" maxlength="120" value="' + escapeHtml(profile.displayName || profile.name || '') + '" /></label>' +
            '<label><span>Description</span><textarea class="form-control" data-field="description" rows="2" maxlength="500">' + escapeHtml(profile.description || '') + '</textarea></label>' +
            '<label><span>Profile active state</span><select class="form-select" data-field="active"><option value="true"' + (active ? ' selected' : '') + '>Active</option><option value="false"' + (!active ? ' selected' : '') + '>Inactive</option></select></label>' +
          '</div>' +
          '<div class="po-card-actions"><button type="button" class="btn btn-primary btn-sm" data-action="save-profile"><i class="fas fa-save me-1"></i>Save profile</button></div>' +
        '</article>'
      );
    }).join('');
  }

  async function saveProfile(card, button) {
    var profile = state.profiles[Number(card.dataset.profileIndex)];
    if (!profile) return;
    var displayName = card.querySelector('[data-field="displayName"]').value.trim();
    var description = card.querySelector('[data-field="description"]').value.trim();
    var active = card.querySelector('[data-field="active"]').value === 'true';
    if (!displayName) {
      showMessage('Display name is required.', 'error');
      return;
    }
    setBusy(button, true);
    try {
      await firebase.firestore().collection('users').doc(profile.id).update({
        displayName: displayName,
        description: description,
        active: active,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedBy: state.currentUser.uid
      });
      profile.displayName = displayName;
      profile.description = description;
      profile.active = active;
      renderProviders();
      updateSummary();
      showMessage('Provider profile saved. The Firebase Authentication account was not changed.', 'success');
    } catch (error) {
      showMessage(errorText(error), 'error', true);
      setBusy(button, false);
    }
  }

  async function loadServices() {
    var result;
    if (serviceHasMethod('getServiceCatalog') || serviceHasMethod('listServices') || serviceHasMethod('getServices')) {
      result = await callVoucherService(['getServiceCatalog', 'listServices', 'getServices']);
      state.services = normalizeList(result, ['services', 'catalog']);
    } else {
      state.services = await readVoucherCollection('CATALOG', 'voucher_service_catalog');
    }
    renderServices();
    renderServiceSelect(byId('priceService'));
  }

  function renderServices() {
    var container = byId('servicesList');
    if (!state.services.length) {
      container.innerHTML = '<div class="po-empty">No services have been configured.</div>';
      return;
    }
    var rows = state.services.map(function (service, index) {
      var active = service.active !== false;
      var displayedPrice = service.defaultUnitPriceMinor != null
        ? numberValue(service.defaultUnitPriceMinor) / 100
        : (service.defaultPrice != null ? service.defaultPrice : service.price);
      var clientShare = numberValue(service.defaultClientCostShareMinor) / 100;
      var projectShare = service.defaultProjectCostShareMinor != null
        ? numberValue(service.defaultProjectCostShareMinor) / 100
        : displayedPrice - clientShare;
      return '<tr><td><strong>' + escapeHtml(service.name || service.serviceName || service.displayName || 'Unnamed service') + '</strong><br><small class="text-muted">' + escapeHtml(service.description || '') + '</small></td>' +
        '<td>' + escapeHtml(service.code || service.serviceCode || '—') + '</td>' +
        '<td>' + formatMoney(displayedPrice, service.currency || 'MMK') + '<br><small>Client ' +
          formatMoney(clientShare, service.currency || 'MMK') + ' · Project ' +
          formatMoney(projectShare, service.currency || 'MMK') + '</small></td>' +
        '<td><span class="po-badge ' + (active ? 'po-badge--active' : 'po-badge--inactive') + '">' + (active ? 'Active' : 'Inactive') + '</span></td>' +
        '<td><button type="button" class="btn btn-outline-primary btn-sm" data-action="edit-service" data-index="' + index + '"><i class="fas fa-edit me-1"></i>Edit</button></td></tr>';
    }).join('');
    container.innerHTML = '<table class="po-table"><thead><tr><th>Service</th><th>Code</th><th>Default price</th><th>State</th><th></th></tr></thead><tbody>' + rows + '</tbody></table>';
  }

  function editService(index) {
    var service = state.services[index];
    if (!service) return;
    byId('serviceId').value = service.id || '';
    byId('serviceName').value = service.name || service.serviceName || service.displayName || '';
    byId('serviceCode').value = service.code || service.serviceCode || '';
    byId('servicePrice').value = service.defaultUnitPriceMinor != null
      ? numberValue(service.defaultUnitPriceMinor) / 100
      : (service.defaultPrice != null ? service.defaultPrice : (service.price || 0));
    byId('serviceClientShare').value = numberValue(service.defaultClientCostShareMinor) / 100;
    byId('serviceProjectShare').value = service.defaultProjectCostShareMinor != null
      ? numberValue(service.defaultProjectCostShareMinor) / 100
      : numberValue(byId('servicePrice').value) - numberValue(byId('serviceClientShare').value);
    byId('serviceCurrency').value = service.currency || 'MMK';
    byId('serviceDescription').value = service.description || '';
    byId('serviceActive').value = String(service.active !== false);
    byId('serviceFormCard').hidden = false;
    byId('serviceName').focus();
  }

  async function saveService(event) {
    event.preventDefault();
    var button = event.submitter || event.currentTarget.querySelector('[type="submit"]');
    var code = byId('serviceCode').value.trim().toUpperCase();
    var price = numberValue(byId('servicePrice').value);
    var clientShare = numberValue(byId('serviceClientShare').value);
    var projectShare = numberValue(byId('serviceProjectShare').value);
    if (Math.abs(price - clientShare - projectShare) > 0.001) {
      showMessage('Client and project shares must equal the subsidized cost.', 'error');
      return;
    }
    var payload = {
      id: byId('serviceId').value || undefined,
      serviceId: byId('serviceId').value || code.toLowerCase(),
      name: byId('serviceName').value.trim(),
      serviceName: byId('serviceName').value.trim(),
      code: code,
      serviceCode: code,
      description: byId('serviceDescription').value.trim(),
      defaultPrice: price,
      defaultUnitPriceMinor: Math.round(price * 100),
      defaultSubsidizedCostMinor: Math.round(price * 100),
      defaultClientCostShareMinor: Math.round(clientShare * 100),
      defaultProjectCostShareMinor: Math.round(projectShare * 100),
      currency: byId('serviceCurrency').value.trim().toUpperCase(),
      active: byId('serviceActive').value === 'true',
      updatedBy: state.currentUser.uid
    };
    if (!payload.name || !payload.code) return;
    setBusy(button, true);
    try {
      await callVoucherService(['saveCatalogService', 'upsertService', 'saveService', 'setService'], payload);
      if (serviceHasMethod('publishCurrentPriceSheet')) {
        await getVoucherService().publishCurrentPriceSheet(null);
      }
      closeForm('serviceFormCard');
      await loadServices();
      showMessage('Global service saved.', 'success');
    } catch (error) {
      showMessage(errorText(error), 'error', true);
    } finally {
      setBusy(button, false);
    }
  }

  async function seedStandardCatalog() {
    var button = byId('seedCatalogBtn');
    if (!window.confirm('Load the standard laboratory tests with a default 10% client / 90% project split? Existing matching services will be updated.')) return;
    setBusy(button, true, 'Loading…');
    try {
      for (var index = 0; index < STANDARD_TESTS.length; index += 1) {
        var row = STANDARD_TESTS[index];
        var subsidizedMinor = row[3] * 100;
        var clientMinor = Math.round(subsidizedMinor * 0.10);
        await getVoucherService().saveCatalogService({
          serviceId: row[0],
          serviceCode: row[1],
          serviceName: row[2],
          description: '',
          defaultUnitPriceMinor: subsidizedMinor,
          defaultSubsidizedCostMinor: subsidizedMinor,
          defaultClientCostShareMinor: clientMinor,
          defaultProjectCostShareMinor: subsidizedMinor - clientMinor,
          currency: 'MMK',
          active: true
        });
      }
      await getVoucherService().publishCurrentPriceSheet(null);
      await loadServices();
      showMessage('Standard tests loaded and the global price sheet was published.', 'success');
    } catch (error) {
      showMessage(errorText(error), 'error', true);
    } finally {
      setBusy(button, false);
    }
  }

  async function loadPriceOverrides() {
    var result;
    if (serviceHasMethod('getPriceOverrides') || serviceHasMethod('listPriceOverrides')) {
      result = await callVoucherService(['getPriceOverrides', 'listPriceOverrides'], {});
      state.priceOverrides = normalizeList(result, ['overrides', 'priceOverrides']);
    } else {
      state.priceOverrides = await readVoucherCollection('PRICING', 'voucher_pricing_versions');
    }
    renderPriceOverrides();
  }

  function findName(items, id) {
    var match = items.find(function (item) { return String(item.id) === String(id); });
    return match ? profileName(match) : (id || '—');
  }

  function findServiceName(id) {
    var match = state.services.find(function (service) {
      return String(service.id || service.code) === String(id);
    });
      return match ? (match.name || match.serviceName || match.displayName || match.code || match.serviceCode) : (id || '—');
  }

  function renderPriceOverrides() {
    var container = byId('pricesList');
    if (!state.priceOverrides.length) {
      container.innerHTML = '<div class="po-empty">No maternity-home price overrides.</div>';
      return;
    }
    var rows = state.priceOverrides.map(function (item, index) {
      var homeId = item.maternityHomeId || item.midwifeId || item.providerId || item.facilityId;
      var serviceId = item.serviceId || item.serviceCode;
      var active = item.active !== false && normalizeKey(item.status || 'published') === 'published';
      var displayedPrice = item.unitPriceMinor != null
        ? numberValue(item.unitPriceMinor) / 100
        : (item.subsidizedCostMinor != null ? numberValue(item.subsidizedCostMinor) / 100 :
          (item.overridePrice != null ? item.overridePrice : item.price));
      var clientShare = numberValue(item.clientCostShareMinor) / 100;
      var projectShare = item.projectCostShareMinor != null
        ? numberValue(item.projectCostShareMinor) / 100
        : displayedPrice - clientShare;
      return '<tr><td>' + escapeHtml(findName(state.maternityHomes, homeId)) + '</td><td>' + escapeHtml(findServiceName(serviceId)) + '</td>' +
        '<td><strong>' + formatMoney(displayedPrice, item.currency || 'MMK') + '</strong><br><small>Client ' +
          formatMoney(clientShare, item.currency || 'MMK') + ' · Project ' +
          formatMoney(projectShare, item.currency || 'MMK') + '</small></td>' +
        '<td><span class="po-badge ' + (active ? 'po-badge--active' : 'po-badge--inactive') + '">' + escapeHtml(item.status || (active ? 'Active' : 'Inactive')) + '</span></td>' +
        '<td><button type="button" class="btn btn-outline-primary btn-sm" data-action="edit-price" data-index="' + index + '"><i class="fas fa-copy me-1"></i>New version</button></td></tr>';
    }).join('');
    container.innerHTML = '<table class="po-table"><thead><tr><th>Maternity home</th><th>Service</th><th>Override price</th><th>State</th><th></th></tr></thead><tbody>' + rows + '</tbody></table>';
  }

  function editPrice(index) {
    var item = state.priceOverrides[index];
    if (!item) return;
    byId('priceOverrideId').value = '';
    byId('priceMaternityHome').value = item.maternityHomeId || item.midwifeId || item.providerId || item.facilityId || '';
    byId('priceService').value = item.serviceId || item.serviceCode || '';
    byId('overridePrice').value = item.unitPriceMinor != null
      ? numberValue(item.unitPriceMinor) / 100
      : (item.subsidizedCostMinor != null ? numberValue(item.subsidizedCostMinor) / 100 :
        (item.overridePrice != null ? item.overridePrice : (item.price || 0)));
    byId('overrideClientShare').value = numberValue(item.clientCostShareMinor) / 100;
    byId('overrideProjectShare').value = item.projectCostShareMinor != null
      ? numberValue(item.projectCostShareMinor) / 100
      : numberValue(byId('overridePrice').value) - numberValue(byId('overrideClientShare').value);
    byId('priceNote').value = item.note || '';
    byId('priceFormCard').hidden = false;
  }

  async function savePriceOverride(event) {
    event.preventDefault();
    var button = event.submitter || event.currentTarget.querySelector('[type="submit"]');
    var service = state.services.find(function (item) {
      return String(item.id || item.code || item.serviceCode) === String(byId('priceService').value);
    });
    var overridePrice = numberValue(byId('overridePrice').value);
    var overrideClient = numberValue(byId('overrideClientShare').value);
    var overrideProject = numberValue(byId('overrideProjectShare').value);
    if (Math.abs(overridePrice - overrideClient - overrideProject) > 0.001) {
      showMessage('Client and project shares must equal the subsidized cost.', 'error');
      return;
    }
    var payload = {
      id: byId('priceOverrideId').value || undefined,
      maternityHomeId: byId('priceMaternityHome').value,
      midwifeId: byId('priceMaternityHome').value,
      serviceId: byId('priceService').value,
      overridePrice: overridePrice,
      unitPriceMinor: Math.round(overridePrice * 100),
      subsidizedCostMinor: Math.round(overridePrice * 100),
      clientCostShareMinor: Math.round(overrideClient * 100),
      projectCostShareMinor: Math.round(overrideProject * 100),
      currency: (service && service.currency) || 'MMK',
      note: byId('priceNote').value.trim(),
      active: true,
      updatedBy: state.currentUser.uid
    };
    setBusy(button, true);
    try {
      await callVoucherService(['savePriceOverride', 'upsertPriceOverride', 'setPriceOverride'], payload);
      if (serviceHasMethod('publishCurrentPriceSheet')) {
        await getVoucherService().publishCurrentPriceSheet(payload.midwifeId);
      }
      closeForm('priceFormCard');
      await loadPriceOverrides();
      showMessage('Maternity-home price override saved.', 'success');
    } catch (error) {
      showMessage(errorText(error), 'error', true);
    } finally {
      setBusy(button, false);
    }
  }

  async function loadAllocations() {
    var result;
    if (serviceHasMethod('getAllocations') || serviceHasMethod('listAllocations')) {
      result = await callVoucherService(['getAllocations', 'listAllocations'], {});
      state.allocations = normalizeList(result, ['allocations']);
    } else {
      var directResults = await Promise.all([
        readVoucherCollection('QUOTAS', 'voucher_quotas'),
        readVoucherCollection('BUDGETS', 'voucher_budgets')
      ]);
      state.allocations = directResults[0];
      state.budgets = directResults[1];
    }
    renderAllocations();
    updateSummary();
  }

  function allocationValues(item) {
    var allocated = numberValue(item.allocatedUnits != null ? item.allocatedUnits : (item.allocatedCount != null ? item.allocatedCount : (item.voucherCount != null ? item.voucherCount : item.count)));
    var used = numberValue(item.usedCount != null ? item.usedCount : (item.redeemedCount != null ? item.redeemedCount : item.used));
    var remaining = item.remainingUnits != null
      ? numberValue(item.remainingUnits)
      : (item.remainingCount != null ? numberValue(item.remainingCount) : Math.max(0, allocated - used));
    if (item.usedCount == null && item.redeemedCount == null && item.used == null) used = Math.max(0, allocated - remaining);
    return { allocated: allocated, used: used, remaining: remaining };
  }

  function renderAllocations() {
    var container = byId('allocationsList');
    if (!state.allocations.length) {
      container.innerHTML = '<div class="po-empty">No voucher allocations have been recorded.</div>';
      return;
    }
    container.innerHTML = state.allocations.map(function (item) {
      var values = allocationValues(item);
      var percent = values.allocated ? Math.min(100, Math.round((values.used / values.allocated) * 100)) : 0;
      var homeId = item.maternityHomeId || item.midwifeId || item.providerId || item.facilityId;
      var budgetRecord = state.budgets.find(function (budgetItem) { return budgetItem.id === item.budgetId; }) || {};
      var budget = item.budget && item.budget.totalMinor != null
        ? numberValue(item.budget.totalMinor) / 100
        : item.poBudget != null
        ? item.poBudget
        : (budgetRecord.totalMinor != null ? numberValue(budgetRecord.totalMinor) / 100 : (item.budget != null ? item.budget : item.amount));
      return '<article class="po-allocation"><div><div class="po-allocation__name">' + escapeHtml(findName(state.maternityHomes, homeId)) + '</div>' +
        '<div class="po-allocation__meta">' + escapeHtml(item.note || 'Allocated ' + formatDate(item.createdAt || item.allocatedAt)) + '</div></div>' +
        '<div class="po-metric"><span>Allocated</span><strong>' + formatNumber(values.allocated) + '</strong></div>' +
        '<div class="po-metric"><span>Used quota</span><strong>' + formatNumber(values.used) + '</strong></div>' +
        '<div class="po-metric"><span>Remaining quota</span><strong>' + formatNumber(values.remaining) + '</strong><div class="po-progress" title="' + percent + '% used"><span style="width:' + percent + '%"></span></div></div>' +
        '<div class="po-metric"><span>PO-only budget</span><strong>' + formatMoney(budget, item.currency || 'MMK') + '</strong></div></article>';
    }).join('');
  }

  async function saveAllocation(event) {
    event.preventDefault();
    var button = event.submitter || event.currentTarget.querySelector('[type="submit"]');
    var payload = {
      maternityHomeId: byId('allocationMaternityHome').value,
      midwifeId: byId('allocationMaternityHome').value,
      serviceId: byId('allocationService').value,
      voucherCount: Math.floor(numberValue(byId('allocationCount').value)),
      allocatedUnits: Math.floor(numberValue(byId('allocationCount').value)),
      poBudget: numberValue(byId('allocationBudget').value),
      totalMinor: Math.round(numberValue(byId('allocationBudget').value) * 100),
      currency: byId('allocationCurrency').value.trim() || 'MMK',
      note: byId('allocationNote').value.trim(),
      allocatedBy: state.currentUser.uid
    };
    setBusy(button, true);
    try {
      if (serviceHasMethod('allocateVouchers')) {
        await callVoucherService(['allocateVouchers'], payload);
      } else if (serviceHasMethod('createBudget') && serviceHasMethod('allocateQuota')) {
        var pricing = state.priceOverrides.filter(function (item) {
          return item.serviceId === payload.serviceId &&
            (item.midwifeId === payload.midwifeId || item.midwifeId == null) &&
            normalizeKey(item.status || 'published') === 'published';
        }).sort(function (a, b) {
          var aTime = a.publishedAt && a.publishedAt.seconds ? a.publishedAt.seconds : 0;
          var bTime = b.publishedAt && b.publishedAt.seconds ? b.publishedAt.seconds : 0;
          if ((a.midwifeId === payload.midwifeId) !== (b.midwifeId === payload.midwifeId)) {
            return a.midwifeId === payload.midwifeId ? -1 : 1;
          }
          return bTime - aTime;
        })[0];
        if (!pricing) throw new Error('Publish a price for this service and maternity home before allocating quota.');
        var budgetId = await callVoucherService(['createBudget'], {
          programId: 'PO-VOUCHER-PROGRAM',
          serviceId: payload.serviceId,
          currency: payload.currency.toUpperCase(),
          totalMinor: payload.totalMinor
        });
        await callVoucherService(['allocateQuota'], {
          budgetId: budgetId,
          pricingVersionId: pricing.id,
          midwifeId: payload.midwifeId,
          allocatedUnits: payload.allocatedUnits
        });
      } else {
        await callVoucherService(['allocateVouchers', 'saveAllocation', 'createAllocation'], payload);
      }
      closeForm('allocationFormCard');
      await loadAllocations();
      showMessage('Voucher quota and PO-only budget allocated.', 'success');
    } catch (error) {
      showMessage(errorText(error), 'error', true);
    } finally {
      setBusy(button, false);
    }
  }

  function reportFilters() {
    var from = byId('reportFrom').value;
    var to = byId('reportTo').value;
    return {
      from: from,
      to: to,
      startDate: from + 'T00:00:00',
      endDate: to + 'T23:59:59',
      status: byId('reportStatus').value,
      maternityHomeId: byId('reportMaternityHome').value,
      midwifeId: byId('reportMaternityHome').value,
      labId: byId('reportLab').value
    };
  }

  async function runReport(event, append) {
    if (event) event.preventDefault();
    var button = byId('reportFilters').querySelector('[type="submit"]');
    var filters = reportFilters();
    filters.pageSize = 100;
    if (append && state.reportNextCursor) filters.startAfterIssuedAt = state.reportNextCursor;
    if (filters.from > filters.to) {
      showMessage('The report start date must be on or before the end date.', 'error');
      return;
    }
    setBusy(button, true, 'Running…');
    byId('reportsList').innerHTML = '<div class="po-loading"><i class="fas fa-spinner fa-spin"></i> Loading vouchers…</div>';
    try {
      var result = await callVoucherService(['queryVoucherReport', 'getVoucherReport', 'listVouchers', 'getVouchers'], filters);
      var page = normalizeList(result, ['vouchers', 'report']);
      state.vouchers = append ? state.vouchers.concat(page) : page;
      state.reportNextCursor = result && result.nextCursor ? result.nextCursor : null;
      byId('loadMoreReports').hidden = !state.reportNextCursor;
      if (filters.labId) {
        state.vouchers = state.vouchers.filter(function (voucher) {
          return String(voucher.labId || voucher.laboratoryId || voucher.redeemedBy || '') === String(filters.labId);
        });
      }
      renderReport();
    } catch (error) {
      byId('reportsList').innerHTML = '<div class="po-error">' + escapeHtml(errorText(error)) + '</div>';
    } finally {
      setBusy(button, false);
    }
  }

  function renderReport() {
    var container = byId('reportsList');
    var summary = byId('reportSummary');
    var counts = {};
    state.vouchers.forEach(function (voucher) {
      var status = normalizeKey(voucher.status || 'unknown');
      counts[status] = (counts[status] || 0) + 1;
    });
    summary.hidden = false;
    summary.innerHTML = '<span>Total: ' + formatNumber(state.vouchers.length) + '</span>' +
      Object.keys(counts).sort().map(function (status) {
        return '<span>' + escapeHtml(status || 'Unknown') + ': ' + formatNumber(counts[status]) + '</span>';
      }).join('');
    if (!state.vouchers.length) {
      container.innerHTML = '<div class="po-empty">No vouchers matched these filters.</div>';
      return;
    }
    var rows = state.vouchers.map(function (voucher) {
      var status = normalizeKey(voucher.status || 'unknown');
      var statusClass = ['issued', 'redeemed', 'expired', 'cancelled'].indexOf(status) !== -1 ? status : 'neutral';
      var homeId = voucher.maternityHomeId || voucher.midwifeId || voucher.providerId || voucher.facilityId;
      var labId = voucher.labId || voucher.laboratoryId || voucher.redeemedBy;
      var displayedAmount = voucher.unitPriceMinorSnapshot != null
        ? numberValue(voucher.unitPriceMinorSnapshot) / 100
        : (voucher.amount != null ? voucher.amount : voucher.price);
      return '<tr><td><strong>' + escapeHtml(voucher.code || voucher.voucherCode || voucher.id || '—') + '</strong></td>' +
        '<td>' + formatDate(voucher.issuedAt || voucher.createdAt || voucher.date) + '</td>' +
        '<td><span class="po-badge po-badge--' + statusClass + '">' + escapeHtml(status || 'Unknown') + '</span></td>' +
        '<td>' + escapeHtml(findName(state.maternityHomes, homeId)) + '</td>' +
        '<td>' + escapeHtml(findName(state.labs, labId)) + '</td>' +
        '<td>' + escapeHtml((voucher.tests || []).map(function (test) {
          return test.name || findServiceName(test.id);
        }).join(', ') || voucher.serviceNameSnapshot || '—') + '</td>' +
        '<td>' + formatMoney(displayedAmount, voucher.currencySnapshot || voucher.currency || 'MMK') + '</td></tr>';
    }).join('');
    container.innerHTML = '<table class="po-table"><thead><tr><th>Voucher</th><th>Date</th><th>Status</th><th>Maternity home</th><th>Lab</th><th>Service</th><th>Amount</th></tr></thead><tbody>' + rows + '</tbody></table>';
  }

  function updateSummary() {
    byId('activeMaternityCount').textContent = formatNumber(state.maternityHomes.filter(profileIsActive).length);
    byId('activeLabCount').textContent = formatNumber(state.labs.filter(profileIsActive).length);
    var totals = state.allocations.reduce(function (sum, item) {
      var values = allocationValues(item);
      sum.used += values.used;
      sum.remaining += values.remaining;
      return sum;
    }, { used: 0, remaining: 0 });
    byId('remainingQuotaTotal').textContent = formatNumber(totals.remaining);
    byId('usedQuotaTotal').textContent = formatNumber(totals.used);
  }

  function openForm(id) {
    var form = byId(id);
    if (!form) return;
    form.reset();
    form.querySelectorAll('input[type="hidden"]').forEach(function (input) { input.value = ''; });
    form.hidden = false;
    if (id === 'priceFormCard') syncProviderSelects();
    if (id === 'allocationFormCard') {
      renderSelect(byId('allocationMaternityHome'), state.maternityHomes, 'Select maternity home');
      byId('allocationCurrency').value = 'MMK';
    }
  }

  function closeForm(id) {
    var form = byId(id);
    if (!form) return;
    form.reset();
    form.querySelectorAll('input[type="hidden"]').forEach(function (input) { input.value = ''; });
    form.hidden = true;
  }

  function showPanel(panelId) {
    document.querySelectorAll('.po-panel').forEach(function (panel) {
      var active = panel.id === panelId;
      panel.hidden = !active;
      panel.classList.toggle('is-active', active);
    });
    document.querySelectorAll('.po-tab').forEach(function (tab) {
      tab.classList.toggle('is-active', tab.dataset.panel === panelId);
    });
  }

  function renderLoadFailure(containerId, error) {
    var container = byId(containerId);
    if (container) container.innerHTML = '<div class="po-error">' + escapeHtml(errorText(error)) + '</div>';
  }

  async function refreshVoucherData() {
    var results = await Promise.allSettled([
      loadServices(),
      loadPriceOverrides(),
      loadAllocations()
    ]);
    if (results[0].status === 'rejected') renderLoadFailure('servicesList', results[0].reason);
    if (results[1].status === 'rejected') renderLoadFailure('pricesList', results[1].reason);
    if (results[2].status === 'rejected') renderLoadFailure('allocationsList', results[2].reason);
    if (results[0].status === 'fulfilled') {
      renderPriceOverrides();
      renderAllocations();
      syncProviderSelects();
    }
  }

  async function refreshAll() {
    var button = byId('refreshAllBtn');
    setBusy(button, true, 'Refreshing…');
    try {
      await loadProfiles();
      await refreshVoucherData();
      await runReport();
      showMessage('Program data refreshed.', 'success');
    } catch (error) {
      showMessage(errorText(error), 'error', true);
    } finally {
      setBusy(button, false);
    }
  }

  function setDefaultReportDates() {
    var today = new Date();
    var from = new Date(today.getFullYear(), today.getMonth() - 3, today.getDate());
    byId('reportFrom').value = toDateInputValue(from);
    byId('reportTo').value = toDateInputValue(today);
  }

  async function logout() {
    var button = byId('logoutBtn');
    setBusy(button, true, 'Logging out…');
    try {
      await firebase.auth().signOut();
      sessionStorage.clear();
      ['role', 'userEmail', 'userId', 'providerType', 'userTownship', 'userRegion'].forEach(function (key) {
        localStorage.removeItem(key);
      });
      window.location.replace('login.html');
    } catch (error) {
      showMessage('Could not log out: ' + errorText(error), 'error', true);
      setBusy(button, false);
    }
  }

  function bindEvents() {
    document.querySelectorAll('.po-tab').forEach(function (tab) {
      tab.addEventListener('click', function () { showPanel(tab.dataset.panel); });
    });
    document.querySelectorAll('[data-open-form]').forEach(function (button) {
      button.addEventListener('click', function () { openForm(button.dataset.openForm); });
    });
    document.querySelectorAll('[data-close-form]').forEach(function (button) {
      button.addEventListener('click', function () { closeForm(button.dataset.closeForm); });
    });
    byId('providerTypeFilter').addEventListener('change', renderProviders);
    byId('providerSearch').addEventListener('input', renderProviders);
    byId('providersList').addEventListener('click', function (event) {
      var button = event.target.closest('[data-action="save-profile"]');
      if (button) saveProfile(button.closest('.po-provider-card'), button);
    });
    byId('servicesList').addEventListener('click', function (event) {
      var button = event.target.closest('[data-action="edit-service"]');
      if (button) editService(Number(button.dataset.index));
    });
    byId('pricesList').addEventListener('click', function (event) {
      var button = event.target.closest('[data-action="edit-price"]');
      if (button) editPrice(Number(button.dataset.index));
    });
    byId('serviceFormCard').addEventListener('submit', saveService);
    byId('priceFormCard').addEventListener('submit', savePriceOverride);
    byId('allocationFormCard').addEventListener('submit', saveAllocation);
    byId('reportFilters').addEventListener('submit', runReport);
    byId('loadMoreReports').addEventListener('click', function () { runReport(null, true); });
    byId('refreshAllBtn').addEventListener('click', refreshAll);
    byId('seedCatalogBtn').addEventListener('click', seedStandardCatalog);
    byId('logoutBtn').addEventListener('click', logout);
  }

  async function initializeForUser(user) {
    state.currentUser = user;
    try {
      var officerProfile = await requireProgramOfficer(user);
      byId('signedInUser').textContent = profileName(officerProfile);
      await loadProfiles();
      await refreshVoucherData();
      await runReport();
    } catch (error) {
      showMessage(errorText(error), 'error', true);
      document.querySelectorAll('button, input, select, textarea').forEach(function (element) {
        if (element.id !== 'refreshAllBtn') element.disabled = true;
      });
      if (/access required|profile was not found/i.test(error.message || '')) {
        window.setTimeout(function () { window.location.replace('home.html'); }, 1800);
      }
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    bindEvents();
    setDefaultReportDates();
    firebase.auth().onAuthStateChanged(function (user) {
      user = window.resolvePilotAuthUser ? window.resolvePilotAuthUser(user) : user;
      if (!user) {
        window.location.replace('login.html?redirect=' + encodeURIComponent('program-officer.html'));
        return;
      }
      initializeForUser(user);
    });
  });
})();
