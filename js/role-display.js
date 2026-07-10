/**
 * Role display labels — permissions stay on `role`; `provider_type` is label-only.
 * Midwife-level accounts share the same RBAC; provider_type controls EN/MM display only.
 */
(function (global) {
  'use strict';

  var PROVIDER_TYPE_MIDWIFE = 'midwife';
  var PROVIDER_TYPE_HOSPITAL = 'hospital';
  var PROVIDER_TYPE_RHC = 'rhc';
  var PROVIDER_TYPE_SRHC = 'srhc';
  var PROVIDER_TYPE_MCH = 'mch';

  var PROVIDER_TYPES = [
    { value: PROVIDER_TYPE_MIDWIFE, en: 'Midwife', mm: 'သားဖွားဆရာမ' },
    { value: PROVIDER_TYPE_HOSPITAL, en: 'Hospital', mm: 'ဆေးရုံ' },
    { value: PROVIDER_TYPE_RHC, en: 'RHC', mm: 'ကျေးလက်ကျန်းမာရေးဌာန' },
    { value: PROVIDER_TYPE_SRHC, en: 'SRHC', mm: 'ကျေးလက်ကျန်းမာရေးဌာနခွဲ' },
    { value: PROVIDER_TYPE_MCH, en: 'MCH', mm: 'မိခင်နှင့်ကလေး ကျန်းမာရေးဌာန' }
  ];

  function getCurrentLang(lang) {
    if (lang) return lang === 'en' ? 'en' : 'mm';
    if (!global.localStorage) return 'mm';
    var stored = localStorage.getItem('appLanguage') || localStorage.getItem('language') || 'mm';
    return stored === 'en' ? 'en' : 'mm';
  }

  function normalizeRoleKey(role) {
    return String(role || '').toLowerCase().trim().replace(/\s+/g, ' ');
  }

  function isMidwifeRole(role) {
    var key = normalizeRoleKey(role);
    return key === 'midwife' || key === '';
  }

  function normalizeProviderType(providerType) {
    var key = String(providerType || '').toLowerCase().trim();
    for (var i = 0; i < PROVIDER_TYPES.length; i++) {
      if (PROVIDER_TYPES[i].value === key) return key;
    }
    return PROVIDER_TYPE_MIDWIFE;
  }

  function getProviderTypeEntry(providerType) {
    var normalized = normalizeProviderType(providerType);
    for (var i = 0; i < PROVIDER_TYPES.length; i++) {
      if (PROVIDER_TYPES[i].value === normalized) return PROVIDER_TYPES[i];
    }
    return PROVIDER_TYPES[0];
  }

  function getProviderTypeLabel(providerType, lang) {
    var entry = getProviderTypeEntry(providerType);
    return getCurrentLang(lang) === 'en' ? entry.en : entry.mm;
  }

  function getProviderTypeBilingualLabel(providerType) {
    var entry = getProviderTypeEntry(providerType);
    return entry.en + ' / ' + entry.mm;
  }

  function isHospitalProvider(userOrType) {
    if (userOrType && typeof userOrType === 'object') {
      return isMidwifeRole(userOrType.role) &&
        normalizeProviderType(userOrType.provider_type) === PROVIDER_TYPE_HOSPITAL;
    }
    return normalizeProviderType(userOrType) === PROVIDER_TYPE_HOSPITAL;
  }

  function getMidwifeLevelDisplayLabel(providerType, lang) {
    return getProviderTypeLabel(providerType, lang);
  }

  function populateProviderTypeSelect(selectEl, selectedValue, lang) {
    if (!selectEl) return;
    var selected = normalizeProviderType(selectedValue);
    var useLang = getCurrentLang(lang);
    selectEl.innerHTML = PROVIDER_TYPES.map(function (entry) {
      var label = useLang === 'en' ? entry.en : entry.mm;
      var sel = entry.value === selected ? ' selected' : '';
      return '<option value="' + entry.value + '"' + sel + '>' + label + '</option>';
    }).join('');
  }

  /**
   * Human-readable role label for headers, admin tables, etc.
   * @param {string|object} roleOrUser - role string or user doc { role, provider_type }
   * @param {string} [lang] - 'en' or 'mm'
   */
  function getRoleDisplayLabel(roleOrUser, lang) {
    var role;
    var providerType;
    var useLang = getCurrentLang(lang);

    if (roleOrUser && typeof roleOrUser === 'object') {
      role = roleOrUser.role;
      providerType = roleOrUser.provider_type;
      if (!providerType && global.localStorage) {
        providerType = localStorage.getItem('providerType');
      }
    } else {
      role = roleOrUser;
      providerType = global.localStorage ? localStorage.getItem('providerType') : null;
    }

    if (role === 'TMO') {
      return useLang === 'en' ? 'Township Dashboard' : 'မြို့နယ် ဒက်ရှ်ဘုတ်';
    }
    if (normalizeRoleKey(role) === 'regional officer') {
      return useLang === 'en' ? 'Regional Dashboard' : 'တိုင်းဒေသကြီး/ပြည်နယ် ဒက်ရှ်ဘုတ်';
    }
    if (isMidwifeRole(role)) return getProviderTypeLabel(providerType, useLang);
    return role || getProviderTypeLabel(PROVIDER_TYPE_MIDWIFE, useLang);
  }

  global.RoleDisplay = {
    PROVIDER_TYPE_MIDWIFE: PROVIDER_TYPE_MIDWIFE,
    PROVIDER_TYPE_HOSPITAL: PROVIDER_TYPE_HOSPITAL,
    PROVIDER_TYPE_RHC: PROVIDER_TYPE_RHC,
    PROVIDER_TYPE_SRHC: PROVIDER_TYPE_SRHC,
    PROVIDER_TYPE_MCH: PROVIDER_TYPE_MCH,
    PROVIDER_TYPES: PROVIDER_TYPES,
    getCurrentLang: getCurrentLang,
    isMidwifeRole: isMidwifeRole,
    isHospitalProvider: isHospitalProvider,
    normalizeProviderType: normalizeProviderType,
    getProviderTypeLabel: getProviderTypeLabel,
    getProviderTypeBilingualLabel: getProviderTypeBilingualLabel,
    getMidwifeLevelDisplayLabel: getMidwifeLevelDisplayLabel,
    populateProviderTypeSelect: populateProviderTypeSelect,
    getRoleDisplayLabel: getRoleDisplayLabel
  };
})(typeof window !== 'undefined' ? window : globalThis);
