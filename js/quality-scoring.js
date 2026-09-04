/**
 * Browser mirror of functions/src/quality/scoring.js for on-demand QI demos.
 * Keep indicator IDs and evaluation rules aligned with the server module.
 */
(function (global) {
  'use strict';

  var QI_SCHEMA_VERSION = 'quality-improvement-v1';
  var QI_TIME_ZONE = 'Asia/Yangon';

  var REASON_CATEGORIES = [
    {
      id: 'knowledge_training',
      en: 'Knowledge/Training',
      mm: 'အသိပညာ/သင်တန်း',
      defaultEn: 'Staff need more coaching or refresher training on this practice.',
      defaultMm: 'ဤလုပ်ငန်းစဉ်အတွက် ဝန်ထမ်းများအား ထပ်မံ လေ့ကျင့်သင်ကြားရန် လိုအပ်သည်။'
    },
    {
      id: 'infrastructure',
      en: 'Infrastructure',
      mm: 'အခြေခံအဆောက်အအုံ',
      defaultEn: 'The facility space, privacy, or room setup makes this practice hard to complete.',
      defaultMm: 'ဌာနနေရာ၊ ကိုယ်ပိုင်နေရာ သို့မဟုတ် အခန်းအနေအထားကြောင့် ဤလုပ်ငန်းစဉ် လုပ်ရန် ခက်ခဲသည်။'
    },
    {
      id: 'drugs',
      en: 'Drugs',
      mm: 'ဆေးဝါး',
      defaultEn: 'Required medicines were not available at the time of care.',
      defaultMm: 'စောင့်ရှောက်ချိန်တွင် လိုအပ်သော ဆေးဝါး မရှိခဲ့ပါ။'
    },
    {
      id: 'supplies_equipment',
      en: 'Supplies and Equipment',
      mm: 'ပစ္စည်းနှင့် စက်ကိရိယာ',
      defaultEn: 'Needed supplies or equipment were missing, delayed, or not ready.',
      defaultMm: 'လိုအပ်သော ပစ္စည်း သို့မဟုတ် စက်ကိရိယာ မရှိခြင်း၊ နောက်ကျခြင်း သို့မဟုတ် မပြင်ဆင်ရသေးခြင်း။'
    },
    {
      id: 'laboratory_test',
      en: 'Laboratory test',
      mm: 'ဓာတ်ခွဲစစ်ဆေးမှု',
      defaultEn: 'A required laboratory test was unavailable or delayed.',
      defaultMm: 'လိုအပ်သော ဓာတ်ခွဲစစ်ဆေးမှု မရနိုင်ခြင်း သို့မဟုတ် နောက်ကျခြင်း။'
    },
    {
      id: 'other',
      en: 'Other',
      mm: 'အခြား',
      defaultEn: 'Another reason prevented this practice. Please describe it.',
      defaultMm: 'အခြား အကြောင်းရင်းကြောင့် ဤလုပ်ငန်းစဉ် မလုပ်နိုင်ခဲ့ပါ။ ရှင်းပြပါ။'
    }
  ];

  var INDICATOR_DEFS = [
    {
      id: 'skin_to_skin',
      source: 'immediate',
      field: 'skin_to_skin_contact',
      formHighlight: 'skin_to_skin_contact',
      en: 'Immediate skin to skin contact with mother after birth',
      mm: 'မွေးကင်းစကလေးတိုင်းကို မွေးပြီးပြီးချင်း မိခင်နှင့်ကလေး အသားချင်းထိကပ်ထားသည်။',
      shortEn: 'Skin-to-skin contact',
      shortMm: 'အသားချင်းထိကပ်ထားခြင်း',
      defaultTarget: 60,
      dataSourceEn: 'Immediate newborn care',
      dataSourceMm: 'မွေးပြီးချက်ချင်း ကလေးစောင့်ရှောက်မှု'
    },
    {
      id: 'thorough_drying',
      source: 'immediate',
      field: 'thorough_drying',
      formHighlight: 'thorough_drying',
      en: 'Immediate drying after birth',
      mm: 'မွေးကင်းစကလေးတိုင်းကို မွေးပြီးပြီးချင်း ချက်ချင်း ကလေး၏တစ်ကိုယ်လုံးအား သန့်ရှင်းခြောက်သွေ့သော မျက်နှာသုတ်ပဝါ/အနှီးဖြင့် သေချာစွာသုတ်သည်။',
      shortEn: 'Immediate drying',
      shortMm: 'ချက်ချင်း သုတ်ခြောက်ခြင်း',
      defaultTarget: 80,
      dataSourceEn: 'Immediate newborn care',
      dataSourceMm: 'မွေးပြီးချက်ချင်း ကလေးစောင့်ရှောက်မှု'
    },
    {
      id: 'delayed_cord_clamping',
      source: 'immediate',
      field: 'delayed_cord_clamping',
      formHighlight: 'delayed_cord_clamping',
      en: 'Delayed cord clamping (1-3 min) after birth',
      mm: 'မွေးကင်းစကလေးတိုင်းအားမွေးပြီး၁မိနစ်မှ၃မိနစ်အထိ စောင့်ဆိုင်းပြီးမှချက်ကြိုးကို ချက်ကြိုးညှပ်ကလစ်ဖြင့် ညှပ်ရမည်။',
      shortEn: 'Delayed cord clamping',
      shortMm: 'အချိန်ဆိုင်း၍ ချက်ကြိုးဖြတ်ခြင်း',
      defaultTarget: 80,
      dataSourceEn: 'Immediate newborn care',
      dataSourceMm: 'မွေးပြီးချက်ချင်း ကလေးစောင့်ရှောက်မှု'
    },
    {
      id: 'early_breastfeeding',
      source: 'immediate',
      field: 'support_early_exclusive_breastfeeding',
      formHighlight: 'support_early_exclusive_breastfeeding',
      en: 'Breastfeeding within one hour of birth',
      mm: 'မွေးကင်းစကလေးများကို မွေးပြီးတစ်နာရီအတွင်း မိခင်နို့ တိုက်ကျွေးသည်။',
      shortEn: 'Early breastfeeding',
      shortMm: 'တစ်နာရီအတွင်း မိခင်နို့',
      defaultTarget: 80,
      dataSourceEn: 'Immediate newborn care',
      dataSourceMm: 'မွေးပြီးချက်ချင်း ကလေးစောင့်ရှောက်မှု'
    },
    {
      id: 'eye_care_teo',
      source: 'immediate',
      field: 'eye_care_teo',
      formHighlight: 'eye_care_teo',
      en: 'Provision of eye care with Tetra Eye Ointment (TEO)',
      mm: 'မွေးကင်းစကလေး မျက်စိပြုစုစောင့်ရှောက်မှုအတွက် TEO (Tetra Eye Ointment) မျက်စင်းဆေးရည်ကိုပေးသည်။',
      shortEn: 'Eye care (TEO)',
      shortMm: 'မျက်စိပြုစုမှု (TEO)',
      defaultTarget: 80,
      dataSourceEn: 'Immediate newborn care',
      dataSourceMm: 'မွေးပြီးချက်ချင်း ကလေးစောင့်ရှောက်မှု'
    },
    {
      id: 'vitamin_k',
      source: 'immediate',
      field: 'vitamin_k',
      formHighlight: 'vitamin_k',
      en: 'Provision of vitamin K on first day of life',
      mm: 'ကလေးအသက် တစ်ရက်သားတွင် ဗိုက်တာမင်ကေ (vitamin K) ထိုးဆေးထိုးပေးသည်။',
      shortEn: 'Vitamin K',
      shortMm: 'ဗီတာမင်ကေ',
      defaultTarget: 80,
      dataSourceEn: 'Immediate newborn care',
      dataSourceMm: 'မွေးပြီးချက်ချင်း ကလေးစောင့်ရှောက်မှု'
    },
    {
      id: 'vital_signs',
      source: 'newborn_visit',
      formHighlight: 'temperature',
      en: 'Vital signs monitoring (temperature, RR, HR)',
      mm: 'Vital signs စောင့်ကြည့်ဆန်းစစ်ခြင်း (ကိုယ်အပူချိန်၊အသက်ရှူနှုန်း၊နှလုံးခုန်နှုန်း)',
      shortEn: 'Vital signs',
      shortMm: 'Vital signs',
      defaultTarget: 80,
      dataSourceEn: 'Newborn care visits',
      dataSourceMm: 'မွေးကင်းစ ပြန်ပြမှတ်တမ်းများ'
    },
    {
      id: 'birth_weight',
      source: 'newborn_visit',
      formHighlight: 'body_weight_gram',
      en: 'Newborn birth weight',
      mm: 'မွေးကင်းစကလေး ကိုယ်အလေးချိန် တိုင်းတာခြင်း။',
      shortEn: 'Birth weight',
      shortMm: 'မွေးချိန် အလေးချိန်',
      defaultTarget: 80,
      dataSourceEn: 'Newborn care visits',
      dataSourceMm: 'မွေးကင်းစ ပြန်ပြမှတ်တမ်းများ'
    },
    {
      id: 'pre_discharge_exam',
      source: 'newborn_visit',
      formHighlight: 'assessmentSection',
      en: 'Full clinical examination before discharge (Infection, Jaundice, Cord, visible congenital anomalies)',
      mm: 'ဌာနမှမဆင်းမီ ကလေးအား စမ်းသပ်စစ်ဆေးခြင်း',
      shortEn: 'Pre-discharge exam',
      shortMm: 'မဆင်းမီ စစ်ဆေးခြင်း',
      defaultTarget: 80,
      dataSourceEn: 'Newborn care visits',
      dataSourceMm: 'မွေးကင်းစ ပြန်ပြမှတ်တမ်းများ'
    },
    {
      id: 'exclusive_breastfeeding',
      source: 'newborn_visit',
      formHighlight: 'exclusive_breastfeeding_on_demand',
      en: 'Newborns received exclusively breastfeed from birth to discharge',
      mm: 'မွေးဖွားချိန်မှစ၍ ဆင်းသည်အထိ မိခင်နို့တစ်မျိုးတည်း',
      shortEn: 'Exclusive breastfeeding',
      shortMm: 'မိခင်နို့ တစ်မျိုးတည်း',
      defaultTarget: 80,
      dataSourceEn: 'Newborn care visits',
      dataSourceMm: 'မွေးကင်းစ ပြန်ပြမှတ်တမ်းများ'
    },
    {
      id: 'follow_up_schedule',
      source: 'newborn_visit',
      formHighlight: 'follow_up_appointment_date',
      en: 'Mothers are scheduled follow up 3 times within 6 weeks (day 3, 7, 14 & 6 week)',
      mm: '၆ ပတ်အတွင်း ပြန်ပြရက်ချိန်း သတ်မှတ်ခြင်း',
      shortEn: 'Follow-up schedule',
      shortMm: 'ပြန်ပြရက်ချိန်း',
      defaultTarget: 80,
      dataSourceEn: 'Newborn care visits',
      dataSourceMm: 'မွေးကင်းစ ပြန်ပြမှတ်တမ်းများ'
    }
  ];

  var NEWBORN_INDICATOR_DEFS = INDICATOR_DEFS;

  var ANC_INDICATOR_DEFS = [
    {
      id: 'anc_early',
      domain: 'antenatal',
      source: 'anc_visit',
      formHighlight: 'earlyAncSection',
      en: 'Early ANC visit (before 14 weeks)',
      mm: 'ကိုယ်ဝန် (၁၄)ပတ်အတွင်း ပထမဆုံး ANC ပြသခြင်း',
      shortEn: 'Early ANC',
      shortMm: 'စောစီးစွာ ANC',
      defaultTarget: 80,
      dataSourceEn: 'ANC visit',
      dataSourceMm: 'ANC ပြသမှတ်တမ်း'
    },
    {
      id: 'anc_dating',
      domain: 'antenatal',
      source: 'anc_visit',
      formHighlight: 'lmp',
      en: 'Pregnancy dating recorded (LMP and EDD, or manual dating)',
      mm: 'ကိုယ်ဝန်သက်တမ်း သတ်မှတ်ခြင်း (LMP နှင့် EDD)',
      shortEn: 'Pregnancy dating',
      shortMm: 'ကိုယ်ဝန်သက်တမ်း',
      defaultTarget: 80,
      dataSourceEn: 'ANC visit',
      dataSourceMm: 'ANC ပြသမှတ်တမ်း'
    },
    {
      id: 'anc_bp',
      domain: 'antenatal',
      source: 'anc_visit',
      formHighlight: 'systolicBP',
      en: 'Blood pressure recorded',
      mm: 'သွေးပေါင်ချိန် တိုင်းတာမှတ်တမ်းတင်ခြင်း',
      shortEn: 'Blood pressure',
      shortMm: 'သွေးပေါင်ချိန်',
      defaultTarget: 80,
      dataSourceEn: 'ANC visit',
      dataSourceMm: 'ANC ပြသမှတ်တမ်း'
    },
    {
      id: 'anc_weight',
      domain: 'antenatal',
      source: 'anc_visit',
      formHighlight: 'weight',
      en: 'Weight recorded',
      mm: 'ကိုယ်အလေးချိန် တိုင်းတာမှတ်တမ်းတင်ခြင်း',
      shortEn: 'Weight',
      shortMm: 'ကိုယ်အလေးချိန်',
      defaultTarget: 80,
      dataSourceEn: 'ANC visit',
      dataSourceMm: 'ANC ပြသမှတ်တမ်း'
    },
    {
      id: 'anc_ifa',
      domain: 'antenatal',
      source: 'anc_visit',
      formHighlight: 'ironFolicAcid',
      en: 'Iron and folic acid prescribed',
      mm: 'သံဓာတ်နှင့် ဖောလစ်အက်ဆစ် ပေးခြင်း',
      shortEn: 'Iron and folic acid',
      shortMm: 'သံဓာတ်နှင့် ဖောလစ်အက်ဆစ်',
      defaultTarget: 80,
      dataSourceEn: 'ANC visit',
      dataSourceMm: 'ANC ပြသမှတ်တမ်း'
    },
    {
      id: 'anc_td',
      domain: 'antenatal',
      source: 'anc_visit',
      formHighlight: 'tetanusToxoid',
      en: 'Tetanus diphtheria (TD) status recorded',
      mm: 'မေးခိုင်၊ ဆုံဆို့နာ ကာကွယ်ဆေး (TD) မှတ်တမ်းတင်ခြင်း',
      shortEn: 'Tetanus diphtheria (TD)',
      shortMm: 'TD ကာကွယ်ဆေး',
      defaultTarget: 80,
      dataSourceEn: 'ANC visit',
      dataSourceMm: 'ANC ပြသမှတ်တမ်း'
    },
    {
      id: 'anc_danger_screen',
      domain: 'antenatal',
      source: 'anc_visit',
      formHighlight: 'dangerSignsNo',
      en: 'Danger signs screened',
      mm: 'အန္တရာယ်လက္ခဏာ စစ်ဆေးခြင်း',
      shortEn: 'Danger signs',
      shortMm: 'အန္တရာယ်လက္ခဏာ',
      defaultTarget: 80,
      dataSourceEn: 'ANC visit',
      dataSourceMm: 'ANC ပြသမှတ်တမ်း'
    },
    {
      id: 'anc_high_risk',
      domain: 'antenatal',
      source: 'anc_visit',
      formHighlight: 'highRiskNo',
      en: 'High-risk status documented',
      mm: 'အန္တရာယ်ဖြစ်နိုင်ခြေ မှတ်တမ်းတင်ခြင်း',
      shortEn: 'High-risk status',
      shortMm: 'အန္တရာယ်ဖြစ်နိုင်ခြေ',
      defaultTarget: 80,
      dataSourceEn: 'ANC visit',
      dataSourceMm: 'ANC ပြသမှတ်တမ်း'
    },
    {
      id: 'anc_next_visit',
      domain: 'antenatal',
      source: 'anc_visit',
      formHighlight: 'nextVisitDate',
      en: 'Next ANC visit date scheduled',
      mm: 'နောက်တစ်ကြိမ် ANC ပြန်ပြရက် သတ်မှတ်ခြင်း',
      shortEn: 'Next ANC visit',
      shortMm: 'ANC ပြန်ပြရက်',
      defaultTarget: 80,
      dataSourceEn: 'ANC visit',
      dataSourceMm: 'ANC ပြသမှတ်တမ်း'
    },
    {
      id: 'anc_diagnosis',
      domain: 'antenatal',
      source: 'anc_visit',
      formHighlight: 'provisionalDiagnosisType',
      en: 'Provisional diagnosis recorded',
      mm: 'ယာယီရောဂါသတ်မှတ်ချက် မှတ်တမ်းတင်ခြင်း',
      shortEn: 'Provisional diagnosis',
      shortMm: 'ယာယီရောဂါသတ်မှတ်ချက်',
      defaultTarget: 80,
      dataSourceEn: 'ANC visit',
      dataSourceMm: 'ANC ပြသမှတ်တမ်း'
    },
    {
      id: 'anc_hiv_syphilis',
      domain: 'antenatal',
      source: 'anc_test',
      formHighlight: 'hivResult',
      en: 'HIV and syphilis test results recorded',
      mm: 'HIV နှင့် ကာလသားရောဂါ စစ်ဆေးမှု ရလဒ် မှတ်တမ်းတင်ခြင်း',
      shortEn: 'HIV and syphilis',
      shortMm: 'HIV နှင့် ကာလသားရောဂါ',
      defaultTarget: 80,
      dataSourceEn: 'ANC lab tests',
      dataSourceMm: 'ANC ဓာတ်ခွဲစစ်ဆေးမှု'
    },
    {
      id: 'anc_hemoglobin',
      domain: 'antenatal',
      source: 'anc_test',
      formHighlight: 'hemoglobinResult',
      en: 'Hemoglobin result recorded',
      mm: 'သွေးအား (Hb) ရလဒ် မှတ်တမ်းတင်ခြင်း',
      shortEn: 'Hemoglobin',
      shortMm: 'သွေးအား (Hb)',
      defaultTarget: 80,
      dataSourceEn: 'ANC lab tests',
      dataSourceMm: 'ANC ဓာတ်ခွဲစစ်ဆေးမှု'
    }
  ];

  function indicatorDefsForDomain(domain) {
    if (domain === 'antenatal') return ANC_INDICATOR_DEFS;
    if (domain === 'all') return INDICATOR_DEFS.concat(ANC_INDICATOR_DEFS);
    return INDICATOR_DEFS;
  }

  function isAffirmative(value) {
    return value === true || ['yes', 'y', 'true', '1'].indexOf(String(value || '').toLowerCase().trim()) >= 0;
  }

  function hasNumericValue(value) {
    return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
  }

  function timestampToDate(value) {
    if (value == null || value === '') return null;
    if (typeof value.toDate === 'function') return value.toDate();
    if (value instanceof Date) return Number.isFinite(value.getTime()) ? value : null;
    if (typeof value === 'object' && typeof value.seconds === 'number') {
      return new Date(value.seconds * 1000);
    }
    if (typeof value === 'number') {
      var asDate = new Date(value);
      return Number.isFinite(asDate.getTime()) ? asDate : null;
    }
    var text = String(value).trim();
    if (!text || /^\d{1,2}:\d{2}(:\d{2})?$/.test(text)) return null;
    var parsed = new Date(text.length === 10 ? text + 'T00:00:00+06:30' : text);
    return Number.isFinite(parsed.getTime()) ? parsed : null;
  }

  function monthKeyForDate(date) {
    var value = timestampToDate(date);
    if (!value) return null;
    var parts = new Intl.DateTimeFormat('en-US', {
      timeZone: QI_TIME_ZONE,
      year: 'numeric',
      month: '2-digit'
    }).formatToParts(value);
    var year = parts.find(function (part) { return part.type === 'year'; }).value;
    var month = parts.find(function (part) { return part.type === 'month'; }).value;
    return year + '-' + month;
  }

  function currentYangonMonthKey(now) {
    return monthKeyForDate(now || new Date());
  }

  function nextMonthKey(month) {
    var match = String(month || '').match(/^(\d{4})-(\d{2})$/);
    if (!match) return null;
    var year = Number(match[1]);
    var monthNumber = Number(match[2]) + 1;
    if (monthNumber > 12) {
      monthNumber = 1;
      year += 1;
    }
    return year + '-' + String(monthNumber).padStart(2, '0');
  }

  function isMonthKey(value) {
    return /^\d{4}-\d{2}$/.test(String(value || ''))
  }

  function monthLabel(month, lang) {
    if (month === 'all') return lang === 'en' ? 'All time' : 'အချိန်အားလုံး'
    var match = String(month || '').match(/^(\d{4})-(\d{2})$/)
    if (!match) return String(month || '—')
    var date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1))
    return date.toLocaleDateString(lang === 'mm' ? 'en-GB' : 'en-US', {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC'
    })
  }

  function upcomingMonthKeys(fromMonth, count) {
    var keys = []
    var cursor = isMonthKey(fromMonth) ? fromMonth : currentYangonMonthKey(new Date())
    var total = count || 12
    for (var i = 0; i < total; i++) {
      keys.push(cursor)
      cursor = nextMonthKey(cursor)
      if (!cursor) break
    }
    return keys
  }

  function recentMonthKeys(fromMonth, count) {
    var keys = []
    var cursor = isMonthKey(fromMonth) ? fromMonth : currentYangonMonthKey(new Date())
    var total = count || 18
    for (var i = 0; i < total; i++) {
      keys.push(cursor)
      cursor = previousMonthKey(cursor)
      if (!cursor) break
    }
    return keys
  }

  function scoreBand(percent) {
    var value = Number(percent)
    if (!Number.isFinite(value) || value < 50) return 'red'
    if (value < 80) return 'yellow'
    return 'green'
  }

  function previousMonthKey(month) {
    var match = String(month || '').match(/^(\d{4})-(\d{2})$/);
    if (!match) return null;
    var year = Number(match[1]);
    var monthNumber = Number(match[2]) - 1;
    if (monthNumber < 1) {
      monthNumber = 12;
      year -= 1;
    }
    return year + '-' + String(monthNumber).padStart(2, '0');
  }

  function dateFromFields(data, fields) {
    for (var i = 0; i < (fields || []).length; i++) {
      var date = timestampToDate(data && data[fields[i]]);
      if (date) return date;
    }
    return null;
  }

  function emptyIndicatorTotals(defs) {
    var result = {};
    (defs || INDICATOR_DEFS).forEach(function (indicator) {
      result[indicator.id] = { numerator: 0, denominator: 0, percentage: 0 };
    });
    return result;
  }

  function percentage(numerator, denominator) {
    if (!denominator) return 0;
    return Math.round((numerator / denominator) * 1000) / 10;
  }

  function providerFromRecord(record, patient) {
    var data = record || {};
    var profile = patient || {};
    return data.recordedBy || data.recorded_by || data.createdBy || data.created_by ||
      profile.created_by || profile.createdBy || null;
  }

  function hasImmediateCareRecord(record) {
    if (!record || typeof record !== 'object') return false;
    return INDICATOR_DEFS.some(function (item) {
      return item.source === 'immediate' && Object.prototype.hasOwnProperty.call(record, item.field);
    }) || isAffirmative(record.spontaneous_breathing) ||
      isAffirmative(record.gasping_or_no_breathing) ||
      hasNumericValue(record.apgar_1min) ||
      hasNumericValue(record.apgar_5min);
  }

  function visitNumberOf(data) {
    return Number((data && (data.visit_number || data.visitNumber)) || 0);
  }

  function sortedNewbornVisits(visits) {
    return (visits || []).slice().sort(function (left, right) {
      var leftNumber = visitNumberOf(left) || 999;
      var rightNumber = visitNumberOf(right) || 999;
      if (leftNumber !== rightNumber) return leftNumber - rightNumber;
      var leftDate = dateFromFields(left, ['visitDate', 'visit_date', 'timestamp', 'createdAt']);
      var rightDate = dateFromFields(right, ['visitDate', 'visit_date', 'timestamp', 'createdAt']);
      return (leftDate ? leftDate.getTime() : 0) - (rightDate ? rightDate.getTime() : 0);
    });
  }

  function babyKeysFromVisit(visit, patientId) {
    var babies = Array.isArray(visit && visit.babies) ? visit.babies : [];
    if (babies.length) {
      return babies.map(function (baby, index) {
        var babyIndex = Number(baby.babyIndex || baby.baby_index || index + 1) || (index + 1);
        return String(patientId) + ':baby:' + babyIndex;
      });
    }
    var count = Math.max(1, Number(visit && (visit.baby_count || visit.babyCount)) || 1);
    var keys = [];
    for (var i = 1; i <= count; i++) keys.push(String(patientId) + ':baby:' + i);
    return keys;
  }

  function evaluateVisitIndicator(indicatorId, visit) {
    if (indicatorId === 'vital_signs') {
      return hasNumericValue(visit.temperature) &&
        hasNumericValue(visit.heart_rate) &&
        hasNumericValue(visit.respiration_rate);
    }
    if (indicatorId === 'birth_weight') {
      return hasNumericValue(visit.body_weight_gram) ||
        hasNumericValue(visit.birth_weight_gram) ||
        hasNumericValue(visit.body_weight_kg) ||
        hasNumericValue(visit.birth_weight_kg);
    }
    if (indicatorId === 'pre_discharge_exam') {
      var cordSet = visit.cord_care === 'yes' || visit.cord_care === 'no' || isAffirmative(visit.cord_care);
      var eyeSet = !!visit.eye_infection_status || !!visit.eye_care_status;
      var anatomyReviewed = Object.prototype.hasOwnProperty.call(visit, 'anatomy_abnormalities');
      var dangerReviewed = Array.isArray(visit.danger_signs) ||
        Object.prototype.hasOwnProperty.call(visit, 'danger_signs');
      return cordSet && eyeSet && anatomyReviewed && dangerReviewed;
    }
    if (indicatorId === 'exclusive_breastfeeding') {
      return isAffirmative(visit.exclusive_breastfeeding_on_demand);
    }
    if (indicatorId === 'follow_up_schedule') {
      if (visit.follow_up_appointment_date || visit.followUpAppointmentDate) return true;
      var other = Array.isArray(visit.otherVisits) ? visit.otherVisits : [];
      return other.length >= 2;
    }
    return false;
  }

  function calculatePatientQualityContribution(patient, activity, month) {
    var profile = patient || {};
    var patientId = profile.id || profile.patientId || 'unknown';
    var immediateRecords = Array.isArray(activity && activity.immediateNewbornCare)
      ? activity.immediateNewbornCare
      : (activity && activity.immediateNewbornCare ? [activity.immediateNewbornCare] : []);
    var newbornVisits = Array.isArray(activity && activity.newbornCare) ? activity.newbornCare : [];
    var byProvider = {};

    function ensure(providerId) {
      if (!byProvider[providerId]) {
        byProvider[providerId] = {
          providerId: providerId,
          indicators: emptyIndicatorTotals(),
          immediateBabies: {},
          visitBabies: {}
        };
      }
      return byProvider[providerId];
    }

    immediateRecords.forEach(function (record) {
      if (!hasImmediateCareRecord(record)) return;
      var eventDate = dateFromFields(record, ['timestamp', 'createdAt', 'created_at', 'recordedAt', 'visitDate']);
      if (!eventDate || (month !== 'all' && monthKeyForDate(eventDate) !== month)) return;
      var providerId = providerFromRecord(record, profile);
      if (!providerId) return;
      var bucket = ensure(providerId);
      var visitForBabies = sortedNewbornVisits(newbornVisits)[0] || {};
      babyKeysFromVisit(visitForBabies, patientId).forEach(function (babyKey) {
        if (bucket.immediateBabies[babyKey]) return;
        bucket.immediateBabies[babyKey] = true;
        INDICATOR_DEFS.forEach(function (indicator) {
          if (indicator.source !== 'immediate') return;
          var totals = bucket.indicators[indicator.id];
          totals.denominator += 1;
          if (isAffirmative(record[indicator.field])) totals.numerator += 1;
        });
      });
    });

    var monthVisits = sortedNewbornVisits(newbornVisits).filter(function (visit) {
      var eventDate = dateFromFields(visit, ['visitDate', 'visit_date', 'timestamp', 'createdAt', 'created_at']);
      return eventDate && (month === 'all' || monthKeyForDate(eventDate) === month);
    });
    var firstVisitByBaby = {};
    monthVisits.forEach(function (visit) {
      babyKeysFromVisit(visit, patientId).forEach(function (babyKey) {
        if (!firstVisitByBaby[babyKey]) firstVisitByBaby[babyKey] = visit;
      });
    });
    Object.keys(firstVisitByBaby).forEach(function (babyKey) {
      var visit = firstVisitByBaby[babyKey];
      var providerId = providerFromRecord(visit, profile);
      if (!providerId) return;
      var bucket = ensure(providerId);
      if (bucket.visitBabies[babyKey]) return;
      bucket.visitBabies[babyKey] = true;
      INDICATOR_DEFS.forEach(function (indicator) {
        if (indicator.source !== 'newborn_visit') return;
        var totals = bucket.indicators[indicator.id];
        totals.denominator += 1;
        if (evaluateVisitIndicator(indicator.id, visit)) totals.numerator += 1;
      });
    });

    Object.keys(byProvider).forEach(function (providerId) {
      var bucket = byProvider[providerId];
      INDICATOR_DEFS.forEach(function (indicator) {
        var totals = bucket.indicators[indicator.id];
        totals.percentage = percentage(totals.numerator, totals.denominator);
      });
    });

    return { patientId: patientId, month: month, schemaVersion: QI_SCHEMA_VERSION, providers: byProvider };
  }

  function sortedAncVisits(visits) {
    return (visits || []).slice().sort(function (left, right) {
      var leftDate = dateFromFields(left, ['visitDate', 'visit_date', 'timestamp', 'createdAt', 'created_at']);
      var rightDate = dateFromFields(right, ['visitDate', 'visit_date', 'timestamp', 'createdAt', 'created_at']);
      var leftTime = leftDate ? leftDate.getTime() : 0;
      var rightTime = rightDate ? rightDate.getTime() : 0;
      if (leftTime !== rightTime) return leftTime - rightTime;
      return visitNumberOf(left) - visitNumberOf(right);
    });
  }

  function sortedAncTests(tests) {
    return (tests || []).slice().sort(function (left, right) {
      var leftDate = dateFromFields(left, ['testDate', 'test_date', 'timestamp', 'createdAt', 'created_at']);
      var rightDate = dateFromFields(right, ['testDate', 'test_date', 'timestamp', 'createdAt', 'created_at']);
      return (leftDate ? leftDate.getTime() : 0) - (rightDate ? rightDate.getTime() : 0);
    });
  }

  function isAncMedicationRecorded(value) {
    var key = String(value || '').trim();
    return key === 'Prescribed' || key === 'Given' || key === 'Already Prescribed';
  }

  function hasTdStatus(visit) {
    var key = String((visit && (visit.tetanusToxoid || visit.td)) || '').trim();
    if (!key || key === 'Not Prescribed') return false;
    return ['TD1', 'TD2', 'Completed', 'Prescribed', 'Already Prescribed', 'Given'].indexOf(key) >= 0;
  }

  function hasBloodPressure(visit) {
    if (hasNumericValue(visit && visit.systolicBP) && hasNumericValue(visit && visit.diastolicBP)) return true;
    var raw = String((visit && (visit.bloodPressure || visit.bp)) || '').trim();
    var match = raw.match(/^(\d{2,3})\s*\/\s*(\d{2,3})$/);
    return !!(match && Number(match[1]) > 0 && Number(match[2]) > 0);
  }

  function hasPregnancyDating(visit) {
    var status = String((visit && visit.lmpStatus) || '').toLowerCase();
    var lmp = visit && visit.lmp;
    var edd = visit && (visit.edd || visit.manualEdd);
    if (status === 'unknown') {
      return hasNumericValue(visit.manualGestationalAge) || !!(visit.manualEdd || visit.manualEDD);
    }
    return !!(lmp && edd);
  }

  function isEarlyAncVisit(visit, patient) {
    if (!visit) return false;
    if (visit.early_anc_visit === true || isAffirmative(visit.early_anc_visit)) return true;
    if (visit.early_anc_visit === false) return false;
    var visitDate = dateFromFields(visit, ['visitDate', 'visit_date', 'timestamp', 'createdAt', 'created_at']);
    var profile = patient || {};
    var lmp = visit.lmp || profile.lmp || (profile.profile && profile.profile.lmp);
    if (lmp && visit.lmpStatus !== 'unknown' && visitDate) {
      var lmpDate = timestampToDate(lmp);
      if (lmpDate) {
        var days = Math.floor((visitDate.getTime() - lmpDate.getTime()) / 86400000);
        if (days >= 0) return days < 98;
      }
    }
    var ga = parseFloat(visit.gestationalAge != null ? visit.gestationalAge : visit.gestational_age != null ? visit.gestational_age : visit.ga_weeks != null ? visit.ga_weeks : visit.manualGestationalAge);
    return Number.isFinite(ga) && ga > 0 && ga < 14;
  }

  function hasHighRiskDocumented(visit) {
    var hr = String((visit && (visit.high_risk || visit.highRisk)) || '').toLowerCase();
    if (hr === 'no' || hr === 'false') return true;
    if (hr === 'yes' || hr === 'true') {
      var factors = (visit && (visit.risk_factors || visit.riskFactors)) || [];
      return Array.isArray(factors) && factors.length >= 1;
    }
    return false;
  }

  function hasProvisionalDiagnosis(visit) {
    var type = String((visit && visit.provisionalDiagnosisType) || '').trim();
    if (!type) return false;
    if (type.toLowerCase() === 'other') {
      return !!String((visit && visit.provisionalDiagnosisOther) || '').trim();
    }
    return true;
  }

  function hasLabResult(value) {
    var text = String(value == null ? '' : value).trim();
    if (!text) return false;
    return text.toLowerCase() !== 'no test yet';
  }

  function evaluateAncIndicator(indicatorId, record, patient) {
    if (indicatorId === 'anc_early') return isEarlyAncVisit(record, patient);
    if (indicatorId === 'anc_dating') return hasPregnancyDating(record);
    if (indicatorId === 'anc_bp') return hasBloodPressure(record);
    if (indicatorId === 'anc_weight') return hasNumericValue(record && record.weight);
    if (indicatorId === 'anc_ifa') return isAncMedicationRecorded(record && record.ironFolicAcid);
    if (indicatorId === 'anc_td') return hasTdStatus(record);
    if (indicatorId === 'anc_danger_screen') {
      var danger = String((record && record.dangerSignsPresent) || '').toLowerCase();
      return danger === 'yes' || danger === 'no';
    }
    if (indicatorId === 'anc_high_risk') return hasHighRiskDocumented(record);
    if (indicatorId === 'anc_next_visit') return !!(record && (record.nextVisitDate || record.next_visit_date));
    if (indicatorId === 'anc_diagnosis') return hasProvisionalDiagnosis(record);
    if (indicatorId === 'anc_hiv_syphilis') {
      return hasLabResult(record && record.hivResult) &&
        hasLabResult(record && (record.syphilisResult || record.vdrlResult));
    }
    if (indicatorId === 'anc_hemoglobin') return hasNumericValue(record && record.hemoglobinResult);
    return false;
  }

  function calculatePatientAncContribution(patient, activity, month) {
    var profile = patient || {};
    var patientId = profile.id || profile.patientId || 'unknown';
    var visits = Array.isArray(activity && activity.antenatalVisits) ? activity.antenatalVisits : [];
    var tests = Array.isArray(activity && activity.testRecords) ? activity.testRecords : [];
    var byProvider = {};

    function ensure(providerId) {
      if (!byProvider[providerId]) {
        byProvider[providerId] = {
          providerId: providerId,
          indicators: emptyIndicatorTotals(ANC_INDICATOR_DEFS)
        };
      }
      return byProvider[providerId];
    }

    var monthVisits = sortedAncVisits(visits).filter(function (visit) {
      var eventDate = dateFromFields(visit, ['visitDate', 'visit_date', 'timestamp', 'createdAt', 'created_at']);
      return eventDate && (month === 'all' || monthKeyForDate(eventDate) === month);
    });
    var firstVisit = monthVisits[0];
    if (firstVisit) {
      var visitProviderId = providerFromRecord(firstVisit, profile);
      if (visitProviderId) {
        var visitBucket = ensure(visitProviderId);
        ANC_INDICATOR_DEFS.forEach(function (indicator) {
          if (indicator.source !== 'anc_visit') return;
          var totals = visitBucket.indicators[indicator.id];
          totals.denominator += 1;
          if (evaluateAncIndicator(indicator.id, firstVisit, profile)) totals.numerator += 1;
        });
      }
    }

    var monthTests = sortedAncTests(tests).filter(function (test) {
      var eventDate = dateFromFields(test, ['testDate', 'test_date', 'timestamp', 'createdAt', 'created_at']);
      return eventDate && (month === 'all' || monthKeyForDate(eventDate) === month);
    });
    var firstTest = monthTests[0];
    if (firstTest) {
      var testProviderId = providerFromRecord(firstTest, profile);
      if (testProviderId) {
        var testBucket = ensure(testProviderId);
        ANC_INDICATOR_DEFS.forEach(function (indicator) {
          if (indicator.source !== 'anc_test') return;
          var totals = testBucket.indicators[indicator.id];
          totals.denominator += 1;
          if (evaluateAncIndicator(indicator.id, firstTest, profile)) totals.numerator += 1;
        });
      }
    }

    Object.keys(byProvider).forEach(function (providerId) {
      var bucket = byProvider[providerId];
      ANC_INDICATOR_DEFS.forEach(function (indicator) {
        var totals = bucket.indicators[indicator.id];
        totals.percentage = percentage(totals.numerator, totals.denominator);
      });
    });

    return { patientId: patientId, month: month, schemaVersion: QI_SCHEMA_VERSION, providers: byProvider };
  }

  function mergeProviderIndicators(target, source, defs) {
    (defs || INDICATOR_DEFS).forEach(function (indicator) {
      var left = target[indicator.id] || { numerator: 0, denominator: 0 };
      var right = (source && source[indicator.id]) || { numerator: 0, denominator: 0 };
      var numerator = (left.numerator || 0) + (right.numerator || 0);
      var denominator = (left.denominator || 0) + (right.denominator || 0);
      target[indicator.id] = {
        numerator: numerator,
        denominator: denominator,
        percentage: percentage(numerator, denominator)
      };
    });
    return target;
  }

  function summarizeProviderIndicators(indicators, defs) {
    var list = defs || INDICATOR_DEFS;
    var scored = 0;
    var totalPct = 0;
    list.forEach(function (indicator) {
      var item = indicators[indicator.id];
      if (item && item.denominator > 0) {
        scored += 1;
        totalPct += item.percentage;
      }
    });
    return {
      indicators: indicators,
      summaryPercentage: scored ? Math.round((totalPct / scored) * 10) / 10 : 0,
      scoredIndicatorCount: scored,
      indicatorCount: list.length
    };
  }

  function isValidReasonCategory(value) {
    return REASON_CATEGORIES.some(function (item) { return item.id === value; });
  }

  function isValidTargetPercent(value) {
    var number = Number(value);
    return Number.isFinite(number) && number >= 0 && number <= 100;
  }

  function planDocId(providerId, scoreMonth) {
    return String(providerId) + '_' + String(scoreMonth);
  }

  global.QualityScoring = {
    QI_SCHEMA_VERSION: QI_SCHEMA_VERSION,
    REASON_CATEGORIES: REASON_CATEGORIES,
    INDICATOR_DEFS: INDICATOR_DEFS,
    NEWBORN_INDICATOR_DEFS: NEWBORN_INDICATOR_DEFS,
    ANC_INDICATOR_DEFS: ANC_INDICATOR_DEFS,
    indicatorDefsForDomain: indicatorDefsForDomain,
    monthKeyForDate: monthKeyForDate,
    currentYangonMonthKey: currentYangonMonthKey,
    nextMonthKey: nextMonthKey,
    previousMonthKey: previousMonthKey,
    isMonthKey: isMonthKey,
    monthLabel: monthLabel,
    upcomingMonthKeys: upcomingMonthKeys,
    recentMonthKeys: recentMonthKeys,
    scoreBand: scoreBand,
    emptyIndicatorTotals: emptyIndicatorTotals,
    calculatePatientQualityContribution: calculatePatientQualityContribution,
    calculatePatientAncContribution: calculatePatientAncContribution,
    evaluateAncIndicator: evaluateAncIndicator,
    mergeProviderIndicators: mergeProviderIndicators,
    summarizeProviderIndicators: summarizeProviderIndicators,
    isValidReasonCategory: isValidReasonCategory,
    isValidTargetPercent: isValidTargetPercent,
    planDocId: planDocId,
    percentage: percentage
  };
})(typeof window !== 'undefined' ? window : this);
