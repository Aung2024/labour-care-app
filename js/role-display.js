/**
 * Role display labels — permissions stay on `role`; `provider_type` is label-only.
 * Midwife, TMO, and Regional Officer accounts can have display labels (same RBAC per role).
 */
(function (global) {
  'use strict';

  var PROVIDER_TYPE_MIDWIFE = 'midwife';
  var PROVIDER_TYPE_HOSPITAL = 'hospital';
  var PROVIDER_TYPE_RHC = 'rhc';
  var PROVIDER_TYPE_SRHC = 'srhc';
  var PROVIDER_TYPE_MCH = 'mch';
  var PROVIDER_TYPE_STATION_HOSPITAL = 'station_hospital';
  var PROVIDER_TYPE_STATION_HEALTH_UNIT = 'station_health_unit';
  var PROVIDER_TYPE_TOWNSHIP_ADMIN = 'township_administration';
  var PROVIDER_TYPE_DISTRICT_ADMIN = 'district_administration';
  var PROVIDER_TYPE_REGIONAL_ADMIN = 'regional_administration';

  var MIDWIFE_PROVIDER_TYPES = [
    { value: PROVIDER_TYPE_MIDWIFE, en: 'Midwife', mm: 'သားဖွားဆရာမ' },
    { value: PROVIDER_TYPE_HOSPITAL, en: 'Hospital', mm: 'ဆေးရုံ' },
    { value: PROVIDER_TYPE_STATION_HOSPITAL, en: 'Station Hospital', mm: 'တိုက်နယ်ဆေးရုံ' },
    { value: PROVIDER_TYPE_STATION_HEALTH_UNIT, en: 'Station Health Unit', mm: 'တိုက်နယ် ကျန်းမာရေးဌာန' },
    { value: PROVIDER_TYPE_RHC, en: 'RHC', mm: 'ကျေးလက်ကျန်းမာရေးဌာန' },
    { value: PROVIDER_TYPE_SRHC, en: 'SRHC', mm: 'ကျေးလက်ကျန်းမာရေးဌာနခွဲ' },
    { value: PROVIDER_TYPE_MCH, en: 'MCH', mm: 'မိခင်နှင့်ကလေး ကျန်းမာရေးဌာန' }
  ];

  var TMO_PROVIDER_TYPES = [
    { value: PROVIDER_TYPE_TOWNSHIP_ADMIN, en: 'Township Administration', mm: 'မြို့နယ် ကျန်းမာရေးဦးစီးဌာနမှူး' },
    { value: PROVIDER_TYPE_DISTRICT_ADMIN, en: 'District Administration', mm: 'ခရိုင် ကျန်းမာရေးဦးစီးဌာနမှူး' }
  ];

  var REGIONAL_PROVIDER_TYPES = [
    { value: PROVIDER_TYPE_REGIONAL_ADMIN, en: 'Regional Administration', mm: 'တိုင်း/ပြည်နယ် ပြည်သူ့ကျန်းမာရေးဦးစီးဌာန' }
  ];

  // Backward compatibility — all midwife-level types
  var PROVIDER_TYPES = MIDWIFE_PROVIDER_TYPES;

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

  function isTMORole(role) {
    return normalizeRoleKey(role) === 'tmo';
  }

  function isRegionalOfficerRole(role) {
    return normalizeRoleKey(role) === 'regional officer';
  }

  function getProviderTypesForRole(role) {
    if (isTMORole(role)) return TMO_PROVIDER_TYPES;
    if (isRegionalOfficerRole(role)) return REGIONAL_PROVIDER_TYPES;
    return MIDWIFE_PROVIDER_TYPES;
  }

  function normalizeProviderType(providerType, role) {
    var key = String(providerType || '').toLowerCase().trim();
    var list = getProviderTypesForRole(role);
    for (var i = 0; i < list.length; i++) {
      if (list[i].value === key) return key;
    }
    return list[0].value;
  }

  function getProviderTypeEntry(providerType, role) {
    var list = getProviderTypesForRole(role);
    var normalized = normalizeProviderType(providerType, role);
    for (var i = 0; i < list.length; i++) {
      if (list[i].value === normalized) return list[i];
    }
    return list[0];
  }

  function getProviderTypeLabel(providerType, lang, role) {
    var entry = getProviderTypeEntry(providerType, role);
    return getCurrentLang(lang) === 'en' ? entry.en : entry.mm;
  }

  function getProviderTypeBilingualLabel(providerType, role) {
    var entry = getProviderTypeEntry(providerType, role);
    return entry.en + ' / ' + entry.mm;
  }

  function isHospitalProvider(userOrType) {
    if (userOrType && typeof userOrType === 'object') {
      return isMidwifeRole(userOrType.role) &&
        normalizeProviderType(userOrType.provider_type, userOrType.role) === PROVIDER_TYPE_HOSPITAL;
    }
    return normalizeProviderType(userOrType, 'Midwife') === PROVIDER_TYPE_HOSPITAL;
  }

  function getMidwifeLevelDisplayLabel(providerType, lang) {
    return getProviderTypeLabel(providerType, lang, 'Midwife');
  }

  function populateProviderTypeSelect(selectEl, selectedValue, lang, role) {
    if (!selectEl) return;
    var list = getProviderTypesForRole(role);
    var selected = normalizeProviderType(selectedValue, role);
    var useLang = getCurrentLang(lang);
    selectEl.innerHTML = list.map(function (entry) {
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

    if (isRegionalOfficerRole(role)) {
      return getProviderTypeLabel(PROVIDER_TYPE_REGIONAL_ADMIN, useLang, role);
    }
    if (isTMORole(role)) {
      return getProviderTypeLabel(providerType, useLang, role);
    }
    if (isMidwifeRole(role)) {
      return getProviderTypeLabel(providerType, useLang, role);
    }
    return role || getProviderTypeLabel(PROVIDER_TYPE_MIDWIFE, useLang, 'Midwife');
  }

  global.RoleDisplay = {
    PROVIDER_TYPE_MIDWIFE: PROVIDER_TYPE_MIDWIFE,
    PROVIDER_TYPE_HOSPITAL: PROVIDER_TYPE_HOSPITAL,
    PROVIDER_TYPE_RHC: PROVIDER_TYPE_RHC,
    PROVIDER_TYPE_SRHC: PROVIDER_TYPE_SRHC,
    PROVIDER_TYPE_MCH: PROVIDER_TYPE_MCH,
    PROVIDER_TYPE_STATION_HOSPITAL: PROVIDER_TYPE_STATION_HOSPITAL,
    PROVIDER_TYPE_STATION_HEALTH_UNIT: PROVIDER_TYPE_STATION_HEALTH_UNIT,
    PROVIDER_TYPE_TOWNSHIP_ADMIN: PROVIDER_TYPE_TOWNSHIP_ADMIN,
    PROVIDER_TYPE_DISTRICT_ADMIN: PROVIDER_TYPE_DISTRICT_ADMIN,
    PROVIDER_TYPE_REGIONAL_ADMIN: PROVIDER_TYPE_REGIONAL_ADMIN,
    PROVIDER_TYPES: PROVIDER_TYPES,
    MIDWIFE_PROVIDER_TYPES: MIDWIFE_PROVIDER_TYPES,
    TMO_PROVIDER_TYPES: TMO_PROVIDER_TYPES,
    REGIONAL_PROVIDER_TYPES: REGIONAL_PROVIDER_TYPES,
    getCurrentLang: getCurrentLang,
    isMidwifeRole: isMidwifeRole,
    isTMORole: isTMORole,
    isRegionalOfficerRole: isRegionalOfficerRole,
    isHospitalProvider: isHospitalProvider,
    getProviderTypesForRole: getProviderTypesForRole,
    normalizeProviderType: normalizeProviderType,
    getProviderTypeLabel: getProviderTypeLabel,
    getProviderTypeBilingualLabel: getProviderTypeBilingualLabel,
    getMidwifeLevelDisplayLabel: getMidwifeLevelDisplayLabel,
    populateProviderTypeSelect: populateProviderTypeSelect,
    getRoleDisplayLabel: getRoleDisplayLabel
  };
})(typeof window !== 'undefined' ? window : globalThis);
