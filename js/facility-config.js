(function (global) {
  'use strict';

  /**
   * Single source of truth for pilot facility codes.
   * Codes must not change after patients are registered under them.
   * `township` matches registration township select values (e.g. Pyinmana, Tatkon).
   * Omit `township` for region-wide / legacy entries.
   */
  var PILOT_FACILITIES = [
    { code: '001', name_en: 'NPW 500 BED', name_mm: 'NPW 500 BED' },
    { code: '002', name_en: 'MNMA SDG', name_mm: 'MNMA SDG' },
    { code: '003', name_en: 'Other', name_mm: 'Other' },
    { code: '004', name_en: 'MNCWA Maternity Homes', name_mm: 'MNCWA Maternity Homes' },
    { code: '005', name_en: 'Nay Pyi Taw Public Health Department', name_mm: 'နေပြည်တော် ပြည်သူ့ကျန်းမာရေးဦးစီးဌာန', region: 'Nay Pyi Taw' },
    { code: '006', name_en: 'Pyinmana Township Public Health Department', name_mm: 'ပျဉ်းမနားမြို့နယ်ပြည်သူ့ကျန်းမာရေးဉီးစီးဌာန', township: 'Pyinmana' },
    { code: '007', name_en: 'Pyinmana General Hospital (200 Bedded)', name_mm: 'Pyinmana General Hospital (200 Bedded)', township: 'Pyinmana' },
    { code: '008', name_en: 'MCH (Pyinmana)', name_mm: 'မိခင်နှင့်ကလေး ကျန်းမာရေးဌာန (ပျဉ်းမနား)', township: 'Pyinmana' },
    { code: '009', name_en: 'Ywar Kawk (East) SRHC', name_mm: 'Ywar Kawk (East) SRHC', township: 'Pyinmana' },
    { code: '010', name_en: 'Paung Laung SRHC', name_mm: 'Paung Laung SRHC', township: 'Pyinmana' },
    { code: '011', name_en: 'Ywar Kawk (West) SRHC', name_mm: 'Ywar Kawk (West) SRHC', township: 'Pyinmana' },
    { code: '012', name_en: 'U Yin Su SRHC', name_mm: 'U Yin Su SRHC', township: 'Pyinmana' },
    { code: '013', name_en: 'Nat Tha Ye RHC', name_mm: 'Nat Tha Ye RHC', township: 'Pyinmana' },
    { code: '014', name_en: 'Zee Hpyu Pin SRHC', name_mm: 'Zee Hpyu Pin SRHC', township: 'Pyinmana' },
    { code: '015', name_en: 'Naung Pin Thar SRHC', name_mm: 'Naung Pin Thar SRHC', township: 'Pyinmana' },
    { code: '016', name_en: 'Sin Thay SRHC', name_mm: 'Sin Thay SRHC', township: 'Pyinmana' },
    { code: '017', name_en: 'Kin Mun Tan SRHC', name_mm: 'Kin Mun Tan SRHC', township: 'Pyinmana' },
    { code: '018', name_en: 'Zee Kone RHC', name_mm: 'Zee Kone RHC', township: 'Pyinmana' },
    { code: '019', name_en: 'Thit Lay Lone SRHC', name_mm: 'Thit Lay Lone SRHC', township: 'Pyinmana' },
    { code: '020', name_en: 'Myauk Lut Kone SRHC', name_mm: 'Myauk Lut Kone SRHC', township: 'Pyinmana' },
    { code: '021', name_en: 'Pyu Twin SRHC', name_mm: 'Pyu Twin SRHC', township: 'Pyinmana' },
    { code: '022', name_en: 'Taung Thar SRHC', name_mm: 'Taung Thar SRHC', township: 'Pyinmana' },
    { code: '023', name_en: 'Tatkon Township Hospital (100 Bedded)', name_mm: 'တပ်ကုန်းမြို့နယ်ဆေးရုံ (ခုတင် ၁၀၀)', township: 'Tatkon' },
    { code: '024', name_en: 'Shwe Myo Station Hospital (16 Bedded)', name_mm: 'ရွှေမြို့တိုက်နယ်ဆေးရုံ (၁၆ ခုတင်)', township: 'Tatkon' },
    { code: '025', name_en: 'Shwe Myo Station Health Unit', name_mm: 'ရွှေမြို့ တိုက်နယ်ကျန်းမာရေးဌာန (SHU)', township: 'Tatkon' },
    { code: '026', name_en: 'Aung Myay Yeik Thar SRHC', name_mm: 'အောင်မြေရိပ်သာ ကျေးလက်ကျန်းမာရေးဌာနခွဲ', township: 'Tatkon' },
    { code: '027', name_en: 'Kin Thar SRHC', name_mm: 'ကင်းသာ ကျေးလက်ကျန်းမာရေးဌာနခွဲ', township: 'Tatkon' },
    { code: '028', name_en: 'Nwe Yit SRHC', name_mm: 'နွယ်ရစ် ကျေးလက်ကျန်းမာရေးဌာနခွဲ', township: 'Tatkon' },
    { code: '029', name_en: 'Shauk Kone SRHC', name_mm: 'ရှောက်ကုန်း ကျေးလက်ကျန်းမာရေးဌာနခွဲ', township: 'Tatkon' },
    { code: '030', name_en: 'Sin Thay SRHC', name_mm: 'ဆင်သေ ကျေးလက်ကျန်းမာရေးဌာနခွဲ', township: 'Tatkon' },
    { code: '031', name_en: 'Htan Taw Gyi SRHC', name_mm: 'ထန်းတောကြီး ကျေးလက်ကျန်းမာရေးဌာနခွဲ', township: 'Tatkon' },
    { code: '032', name_en: 'MCH (Tatkon)', name_mm: 'မိခင်နှင့်ကလေး ကျန်းမာရေးဌာန (တပ်ကုန်း)', township: 'Tatkon' },
    { code: '033', name_en: 'Taung Poet Thar RHC', name_mm: 'တောင်ပို့သာ ကျေးလက်ကျန်းမာရေးဌာန', township: 'Tatkon' },
    { code: '034', name_en: 'Tha Pyay Kone SRHC', name_mm: 'သပြေကုန်း ကျေးလက်ကျန်းမာရေးဌာနခွဲ', township: 'Tatkon' },
    { code: '035', name_en: 'Htone Bo SRHC', name_mm: 'ထုံးဘို ကျေးလက်ကျန်းမာရေးဌာနခွဲ', township: 'Tatkon' },
    { code: '036', name_en: 'Yway Su SRHC', name_mm: 'ရွေးစု ကျေးလက်ကျန်းမာရေးဌာနခွဲ', township: 'Tatkon' },
    { code: '037', name_en: 'Chin Su SRHC', name_mm: 'ချင်းစု ကျေးလက်ကျန်းမာရေးဌာနခွဲ', township: 'Tatkon' },
    { code: '038', name_en: 'Kyaung Kone SRHC', name_mm: 'ကျောင်းကုန်း ကျေးလက်ကျန်းမာရေးဌာနခွဲ', township: 'Tatkon' },
    { code: '039', name_en: 'Aingt Kyei RHC', name_mm: 'အိုင့်ကျယ် ကျေးလက်ကျန်းမာရေးဌာန', township: 'Tatkon' },
    { code: '040', name_en: 'Myet Ye SRHC', name_mm: 'မျက်ရဲ ကျေးလက်ကျန်းမာရေးဌာနခွဲ', township: 'Tatkon' },
    { code: '041', name_en: 'Kyee Inn SRHC', name_mm: 'ကြီးအင်း ကျေးလက်ကျန်းမာရေးဌာနခွဲ', township: 'Tatkon' },
    { code: '042', name_en: 'Thar Yar Aye SRHC', name_mm: 'သာယာအေး ကျေးလက်ကျန်းမာရေးဌာနခွဲ', township: 'Tatkon' },
    { code: '043', name_en: 'Than Pu Yar Kone SRHC', name_mm: 'သံပုရာကုန်း ကျေးလက်ကျန်းမာရေးဌာနခွဲ', township: 'Tatkon' }
  ];

  var OTHER_FACILITY_CODE = '003';

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

  function facilityMatchesTownship(facility, township, region) {
    if (!facility) return false;
    if (facility.township && township && facility.township === township) return true;
    if (facility.code === OTHER_FACILITY_CODE && township) return true;
    if (!township && !facility.township) {
      if (facility.region && region && facility.region === region) return true;
      if (!facility.region && ['001', '002', '003', '004'].indexOf(facility.code) !== -1) return true;
    }
    return false;
  }

  function getFacilitiesForTownship(township, region) {
    var list = PILOT_FACILITIES.filter(function (facility) {
      return facilityMatchesTownship(facility, township, region);
    });
    if (township) {
      list.sort(function (a, b) {
        if (a.code === OTHER_FACILITY_CODE) return 1;
        if (b.code === OTHER_FACILITY_CODE) return -1;
        return getFacilityLabel(a, 'en').localeCompare(getFacilityLabel(b, 'en'));
      });
    }
    return list;
  }

  function isValidFacilityForTownship(code, township, region) {
    if (!isValidFacilityCode(code)) return false;
    var facility = getFacilityByCode(code);
    return facilityMatchesTownship(facility, township || '', region || '');
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
    var township = options.township || '';
    var region = options.region || '';
    var facilities = options.all
      ? PILOT_FACILITIES.slice()
      : getFacilitiesForTownship(township, region);

    var html = '<option value="">' + placeholder + '</option>';
    facilities.forEach(function (facility) {
      var label = getFacilityLabel(facility, lang);
      html += '<option value="' + facility.code + '">' + label + '</option>';
    });
    selectEl.innerHTML = html;
    if (options.selectedCode) {
      selectEl.value = options.selectedCode;
      if (selectEl.value !== options.selectedCode) selectEl.value = '';
    }
  }

  global.FacilityConfig = {
    getFacilities: getFacilities,
    getFacilitiesForTownship: getFacilitiesForTownship,
    getFacilityCodes: getFacilityCodes,
    getFacilityByCode: getFacilityByCode,
    isValidFacilityCode: isValidFacilityCode,
    isValidFacilityForTownship: isValidFacilityForTownship,
    getFacilityLabel: getFacilityLabel,
    populateFacilitySelect: populateFacilitySelect
  };
})(typeof window !== 'undefined' ? window : this);
