(function (global) {
  'use strict';

  /**
   * Single source of truth for pilot facility codes.
   * Codes must not change after patients are registered under them.
   * Add new pilot sites as 005+ when MOH provides the facility list.
   */
  var PILOT_FACILITIES = [
    { code: '001', name_en: 'NPW 500 BED', name_mm: 'NPW 500 BED' },
    { code: '002', name_en: 'MNMA SDG', name_mm: 'MNMA SDG' },
    { code: '003', name_en: 'Other', name_mm: 'Other' },
    { code: '004', name_en: 'MNCWA Maternity Homes', name_mm: 'MNCWA Maternity Homes' }
  ];

  function getFacilities() {
    return PILOT_FACILITIES.slice();
  }

  function getFacilityCodes() {
    return PILOT_FACILITIES.map(function (f) { return f.code; });
  }

  function getFacilityByCode(code) {
    return PILOT_FACILITIES.find(function (f) { return f.code === String(code || ''); }) || null;
  }

  function isValidFacilityCode(code) {
    return getFacilityCodes().indexOf(String(code || '')) !== -1;
  }

  function getFacilityLabel(facility, language) {
    facility = facility || {};
    var lang = String(language || 'en').toLowerCase();
    if (lang === 'mm' && facility.name_mm) return facility.name_mm;
    return facility.name_en || facility.name_mm || facility.code || '';
  }

  function populateFacilitySelect(selectEl, options) {
    if (!selectEl) return;
    options = options || {};
    var lang = options.language || (global.localStorage && localStorage.getItem('appLanguage')) || 'en';
    var placeholder = options.placeholder || (lang === 'mm' ? 'ဆေးရုံ/ကျန်းမာရေးဌာန ရွေးချယ်ပါ' : 'Select Facility');
    var html = '<option value="">' + placeholder + '</option>';
    PILOT_FACILITIES.forEach(function (facility) {
      var label = getFacilityLabel(facility, lang);
      var suffix = facility.code ? (' (' + facility.code + ')') : '';
      html += '<option value="' + facility.code + '">' + label + suffix + '</option>';
    });
    selectEl.innerHTML = html;
    if (options.selectedCode) selectEl.value = options.selectedCode;
  }

  global.FacilityConfig = {
    getFacilities: getFacilities,
    getFacilityCodes: getFacilityCodes,
    getFacilityByCode: getFacilityByCode,
    isValidFacilityCode: isValidFacilityCode,
    getFacilityLabel: getFacilityLabel,
    populateFacilitySelect: populateFacilitySelect
  };
})(typeof window !== 'undefined' ? window : this);
