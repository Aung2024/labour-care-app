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
    { code: '004', name_en: 'MNCWA Maternity Homes', name_mm: 'MNCWA Maternity Homes' },
    { code: '005', name_en: 'Nay Pyi Taw Public Health Department', name_mm: 'နေပြည်တော် ပြည်သူ့ကျန်းမာရေးဦးစီးဌာန' },
    { code: '006', name_en: 'Pyinmana Township Public Health Department', name_mm: 'ပျဉ်းမနားမြို့နယ်ပြည်သူ့ကျန်းမာရေးဉီးစီးဌာန' },
    { code: '007', name_en: 'Pyinmana General Hospital (200 Bedded)', name_mm: 'Pyinmana General Hospital (200 Bedded)' },
    { code: '008', name_en: 'Maternal and Child Health Center (MCH)', name_mm: 'Maternal and Child Health Center (MCH)' },
    { code: '009', name_en: 'Ywar Kawk (East) SRHC', name_mm: 'Ywar Kawk (East) SRHC' },
    { code: '010', name_en: 'Paung Laung SRHC', name_mm: 'Paung Laung SRHC' },
    { code: '011', name_en: 'Ywar Kawk (West) SRHC', name_mm: 'Ywar Kawk (West) SRHC' },
    { code: '012', name_en: 'U Yin Su SRHC', name_mm: 'U Yin Su SRHC' },
    { code: '013', name_en: 'Nat Tha Ye RHC', name_mm: 'Nat Tha Ye RHC' },
    { code: '014', name_en: 'Zee Hpyu Pin SRHC', name_mm: 'Zee Hpyu Pin SRHC' },
    { code: '015', name_en: 'Naung Pin Thar SRHC', name_mm: 'Naung Pin Thar SRHC' },
    { code: '016', name_en: 'Sin Thay SRHC', name_mm: 'Sin Thay SRHC' },
    { code: '017', name_en: 'Kin Mun Tan SRHC', name_mm: 'Kin Mun Tan SRHC' },
    { code: '018', name_en: 'Zee Kone RHC', name_mm: 'Zee Kone RHC' },
    { code: '019', name_en: 'Thit Lay Lone SRHC', name_mm: 'Thit Lay Lone SRHC' },
    { code: '020', name_en: 'Myauk Lut Kone SRHC', name_mm: 'Myauk Lut Kone SRHC' },
    { code: '021', name_en: 'Pyu Twin SRHC', name_mm: 'Pyu Twin SRHC' },
    { code: '022', name_en: 'Taung Thar SRHC', name_mm: 'Taung Thar SRHC' }
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
