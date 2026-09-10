'use strict';

const { firstDate, toDate, unwrap } = require('../shared/clinical-normalizers');

const DAY_MS = 86400000;
const SMS_SOURCE = 'SMS for HRT, KMC, ANC, PNC_14Aug';

function joinParts(parts) {
  return parts
    .map((part) => String(part || '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join(' ');
}

/**
 * Official HRT SMS copy from the 14 Aug MOH document.
 * Priority follows spreadsheet order. KMC / ANC / PNC rows are omitted.
 *
 * ANC stores heart and kidney as one checkbox, so that factor matches the
 * heart-disease template first. Previous scar has no approved SMS row.
 */
const HRT_SMS_TEMPLATES = Object.freeze([
  {
    key: 'maternal_age',
    priority: 1,
    credit: 4,
    labelEn: 'Maternal age ≤18 or ≥40',
    labelMm: 'အသက် ≤ ၁၈နှစ် (သို့) ≥ ၄၀နှစ်',
    riskFactors: ['maternal_age_18_or_40 and over'],
    gaBand: null,
    message: joinParts([
      'ယခုကာလသည် ကိုယ်ဝန်ဆောင်စောင့်ရှောက်မှု ခံယူရမည့် အချိန်ဖြစ်ပါသည်။ အသက်(၁၈)နှစ်အောက်နဲ့ (၄၀)နှစ်အထက် ကိုယ်ဝန်ဆောင်ချိန်မှာ ပိုပြီးအထူးဂရုစိုက်ဖို့ လိုအပ်လို့ ကျန်းမာရေးဝန်ထမ်းမှ ပေးထားသော ရက်ချိန်းအတိုင်း မပျက်မကွက် စောင့်ရှောက်မှုခံယူပါ။'
    ])
  },
  {
    key: 'diabetes',
    priority: 2,
    credit: 6,
    labelEn: 'Diabetes',
    labelMm: 'ဆီးချိုရောဂါ',
    riskFactors: ['Diabetes (pre-existing or gestational)'],
    gaBand: null,
    message: joinParts([
      'ယခုကာလသည် ကိုယ်ဝန်ဆောင်ဆီးချို ပုံမှန်စစ်ဆေးကုသမှု ခံယူရမည့် အချိန်ဖြစ်ပါသည်။ ကိုယ်ဝန်ဆောင်ချိန် ဆီးချိုရောဂါကို စနစ်တကျ မထိန်းသိမ်းပါက မိခင်ရော ရင်သွေးပါ နောက်ဆက်တွဲ ပြဿနာများ ဖြစ်နိုင်ပါသဖြင့် ကျန်းမာရေးဝန်ထမ်းမှ ပေးထားသော ရက်ချိန်းအတိုင်း စောင့်ရှောက်မှုခံယူပါ။ သွေးချိုပမာဏ ပုံမှန်ရှိစေဖို့ အစားအသောက် ဆင်ခြင်ခြင်း၊ ညွှန်ကြားထားသည့် ဆေးများကို ပုံမှန်သောက်ဖို့ အရေးကြီးပါသည်။'
    ])
  },
  {
    key: 'hypertension',
    priority: 3,
    credit: 5,
    labelEn: 'Hypertension',
    labelMm: 'သွေးပေါင်ချိန်တက်ခြင်း',
    riskFactors: ['Hypertension'],
    gaBand: null,
    message: joinParts([
      'သွေးတိုးရောဂါအတွက် လိုအပ်သော ပုံမှန်စစ်ဆေးကုသမှု ခံယူရမည့် အချိန်ဖြစ်ပါသည်။ မိခင်ရော ရင်သွေးပါ ကျန်းမာဖို့ ကျန်းမာရေးဝန်ထမ်းမှ ပေးထားသော ရက်ချိန်းအတိုင်း မပျက်မကွက် စောင့်ရှောက်မှုခံယူပါ။ သွေးပေါင်ချိန် ပုံမှန်ရှိစေဖို့ အစားအသောက် ဆင်ခြင်ခြင်း၊ ညွှန်ကြားထားသည့် ဆေးများကို ပုံမှန်သောက်ဖို့ အရေးကြီးပါသည်။'
    ])
  },
  {
    key: 'heart_disease',
    priority: 4,
    credit: 6,
    labelEn: 'Heart disease',
    labelMm: 'နှလုံးရောဂါ',
    riskFactors: ['Heart Disease (or) Kidney Disease'],
    gaBand: null,
    message: joinParts([
      'ယခုကာလသည် ကိုယ်ဝန်ဆောင်စောင့်ရှောက်မှု ခံယူရမည့် အချိန်ဖြစ်ပါသည်။ နှလုံးရောဂါအခံရှိသော မေမေအနေနှင့် ကိုယ်ဝန်ဆောင်ချိန်တွင် နှလုံးက နှစ်ယောက်စာ ပိုပြီးအလုပ်လုပ်ရသည့်အတွက် အထူးဂရုစိုက်ဖို့ လိုအပ်ပါသည်။ မိခင်ရော ရင်သွေးလေးပါ ဘေးကင်းကျန်းမာစေဖို့နဲ့ လိုအပ်တဲ့ စောင့်ရှောက်မှုတွေ အချိန်မီရရှိနိုင်ဖို့ ကျန်းမာရေးဝန်ထမ်းမှ ပေးထားသော ရက်ချိန်းအတိုင်း စောင့်ရှောက်မှုခံယူပါ။'
    ])
  },
  {
    key: 'kidney_disease',
    priority: 5,
    credit: 6,
    labelEn: 'Kidney disease',
    labelMm: 'ကျောက်ကပ်ရောဂါ',
    riskFactors: [],
    gaBand: null,
    message: joinParts([
      'ယခုကာလသည် ကိုယ်ဝန်ဆောင်စောင့်ရှောက်မှု ခံယူရမည့် အချိန်ဖြစ်ပါသည်။ ကျောက်ကပ်ရောဂါအခံရှိသော မေမေအနေနှင့် ကိုယ်ဝန်ဆောင်ချိန်တွင် ကျောက်ကပ်က ပိုပြီး အလုပ်လုပ်ရသည့်အတွက် သွေးတိုးခြင်းနဲ့ နောက်ဆက်တွဲ ပြဿနာများကို ကြိုတင်ကာကွယ်နိုင်ဖို့ ကျန်းမာရေးဝန်ထမ်းမှ ပေးထားသော ရက်ချိန်းအတိုင်း စောင့်ရှောက်မှုခံယူပါ။ ညွှန်ကြားထားသည့် ဆေးများကို ပုံမှန်သောက်ဖို့ အရေးကြီးပါသည်။'
    ])
  },
  {
    key: 'pih_t1',
    priority: 7,
    credit: 8,
    labelEn: 'Pregnancy-induced hypertension / pre-eclampsia (1st trimester)',
    labelMm: 'ကိုယ်ဝန်ဆောင်စဉ် သွေးတိုးခြင်း၊ ကိုယ်ဝန်ဆိပ်တက်ခြင်းနှင့် ကိုယ်ဝန်ဆိပ်တက်နာ (ပထမ ၃ လပတ်)',
    riskFactors: ['Pregnancy Induced Hypertension/Pre-eclampsia/Eclampsia'],
    gaBand: 't1',
    message: joinParts([
      'ယခုကာလသည် ကိုယ်ဝန်ဆောင်စောင့်ရှောက်မှု ခံယူရမည့် အချိန်ဖြစ်ပါသည်။',
      'ကိုယ်ဝန် ပထမ (၃)လ ပတ်တွင် သွေးပေါင်ချိန် စောစီးစွာ ပုံမှန်စစ်ဆေးခြင်းဖြင့် ကိုယ်ဝန်ဆိပ်တက်ခြင်း အန္တရာယ်ကို ကြိုတင်ကာကွယ်နိုင်ပါသည်။ ကျန်းမာရေးဌာနသို့ ရက်ချိန်းမှန်မှန် သွားရောက်ပြသပြီး စောင့်ရှောက်မှုခံယူပါ။',
      'ပြင်းထန်စွာ ခေါင်းကိုက်ခြင်း၊ မျက်စိဝေခြင်း၊ ရင်ညွန့်အောင့်ခြင်း သို့မဟုတ် တက်ခြင်းစတဲ့ အန္တရာယ်လက္ခဏာများ ရှိပါက ရက်ချိန်းကို မစောင့်ဘဲ ချက်ချင်း သွားရောက်ပြသပါ။'
    ])
  },
  {
    key: 'pih_t2',
    priority: 8,
    credit: 7,
    labelEn: 'Pregnancy-induced hypertension / pre-eclampsia (2nd trimester)',
    labelMm: 'ကိုယ်ဝန်ဆောင်စဉ် သွေးတိုးခြင်း၊ ကိုယ်ဝန်ဆိပ်တက်ခြင်းနှင့် ကိုယ်ဝန်ဆိပ်တက်နာ (ဒုတိယ ၃ လပတ်)',
    riskFactors: ['Pregnancy Induced Hypertension/Pre-eclampsia/Eclampsia'],
    gaBand: 't2',
    message: joinParts([
      'ယခုကာလသည် ကိုယ်ဝန်ဆောင်စောင့်ရှောက်မှု ခံယူရမည့် အချိန်ဖြစ်ပါသည်။',
      'ကိုယ်ဝန် (၂၀) ပတ် ကျော်ချိန်တွင် သွေးတိုးခြင်းနှင့် ကိုယ်ဝန်ဆိပ်တက် လက္ခဏာများသည် အသက်အန္တရာယ်ရှိနိုင်သဖြင့် ကျန်းမာရေးဌာနသို့ ရက်ချိန်းမှန်မှန် သွားပြပြီး စောင့်ရှောက်မှုခံယူပါ။',
      'ညွှန်ကြားထားသည့် ဆေးများကို ပုံမှန်သောက်ဖို့ အရေးကြီးပါသည်။ မျက်နှာနှင့် လက်များ ရုတ်တရက် ရောင်ရမ်းခြင်း၊ ခေါင်းကိုက်ခြင်းများ ရှိပါက စောစီးစွာ သွားရောက်ပြသပါ။'
    ])
  },
  {
    key: 'pih_t3',
    priority: 9,
    credit: 8,
    labelEn: 'Pregnancy-induced hypertension / pre-eclampsia (3rd trimester)',
    labelMm: 'ကိုယ်ဝန်ဆောင်စဉ် သွေးတိုးခြင်း၊ ကိုယ်ဝန်ဆိပ်တက်ခြင်းနှင့် ကိုယ်ဝန်ဆိပ်တက်နာ (တတိယ ၃ လပတ်)',
    riskFactors: ['Pregnancy Induced Hypertension/Pre-eclampsia/Eclampsia'],
    gaBand: 't3',
    message: joinParts([
      'ယခုကာလသည် ကိုယ်ဝန်ဆောင်စောင့်ရှောက်မှု ခံယူရမည့် အချိန်ဖြစ်ပါသည်။',
      'ကိုယ်ဝန်တတိယ (၃)လပတ်တွင် ကိုယ်ဝန်ဆိပ်တက်ခြင်းနှင့် တက်ခြင်း အန္တရာယ် အမြင့်ဆုံး အချိန်ဖြစ်ပါသဖြင့် ကျန်းမာရေးဌာနသို့ ရက်ချိန်းမှန်မှန် သွားပြပြီး စောင့်ရှောက်မှုခံယူပါ။',
      'ညွှန်ကြားထားသည့် ဆေးများကို ပုံမှန်သောက်ဖို့ အရေးကြီးပါသည်။ ပြင်းထန်စွာ ခေါင်းကိုက်ခြင်း၊ မျက်စိဝေခြင်း၊ ရင်ညွန့်အောင့်ခြင်း သို့မဟုတ် တက်ခြင်းစတဲ့ အန္တရာယ်လက္ခဏာများ ရှိပါက ရက်ချိန်းကို မစောင့်ဘဲ ချက်ချင်း သွားရောက်ပြသပါ။'
    ])
  },
  {
    key: 'previous_complications',
    priority: 10,
    credit: 6,
    labelEn: 'Previous pregnancy complications',
    labelMm: 'ယခင်ကိုယ်ဝန်နှင့် ပတ်သက်သည့် နောက်ဆက်တွဲပြဿနာများ',
    riskFactors: ['Previous pregnancy complications'],
    gaBand: null,
    message: joinParts([
      'ယခုကာလသည် ကိုယ်ဝန်ဆောင်စောင့်ရှောက်မှု ခံယူရမည့် အချိန်ဖြစ်ပါသည်။',
      'ယခင်ကိုယ်ဝန်တွင် (သွေးလွန်ခြင်း၊ ဖျားခြင်း၊ တက်ခြင်း၊ လမစေ့/ပေါင်မပြည့်ဘဲ မွေးဖွားခြင်း သို့မဟုတ် ကလေးဆုံးရှုံးဖူးခြင်း) ရာဇဝင်ရှိပါက ယခုကိုယ်ဝန်တွင် ပိုမိုအထူးဂရုစိုက်ဖို့ လိုအပ်ပါသည်။ နောက်ဆက်တွဲပြဿနာများကို ကြိုတင်ကာကွယ်နိုင်ဖို့နဲ့ ကျန်းမာရေးဝန်ထမ်းမှ ပေးထားသော ရက်ချိန်းအတိုင်း မပျက်မကွက် စောင့်ရှောက်မှုခံယူပါ။'
    ])
  },
  {
    key: 'grand_multipara',
    priority: 11,
    credit: 6,
    labelEn: 'Previous 5 or more births',
    labelMm: 'ယခင် ၅ကြိမ်အထက် မွေးဖွားခြင်း',
    riskFactors: ['Multiple pregnancy'],
    gaBand: null,
    message: joinParts([
      'ယခုကာလသည် ကိုယ်ဝန်ဆောင်စောင့်ရှောက်မှု ခံယူရမည့် အချိန်ဖြစ်ပါသည်။',
      'ယခင်က ကလေး (၅) ကြိမ်နဲ့အထက် မွေးဖွားဖူးသောမိခင်အနေနှင့် ယခုကိုယ်ဝန်ဆောင်ချိန်တွင် အန္တရာယ် ပိုဖြစ်နိုင်ခြေရှိပါသည်။ မိခင်ရော ရင်သွေးလေးပါ ဘေးကင်းကျန်းမာစေဖို့နှင့် လိုအပ်သောစောင့်ရှောက်မှုများ ကြိုတင်ပြင်ဆင်နိုင်ရန် ကျန်းမာရေးဝန်ထမ်းမှ ပေးထားသော ရက်ချိန်းအတိုင်း မပျက်မကွက် စောင့်ရှောက်မှုခံယူပါ။'
    ])
  },
  {
    key: 'fetal_malpresentation',
    priority: 12,
    credit: 6,
    labelEn: 'Fetal malpresentation',
    labelMm: 'သန္ဓေသား အနေအထား ပုံမမှန်ခြင်းများ',
    riskFactors: ['Fetal Malpresentation'],
    gaBand: null,
    message: joinParts([
      'ယခုကာလသည် ကိုယ်ဝန်ဆောင်စောင့်ရှောက်မှု ခံယူရမည့် အချိန်ဖြစ်ပါသည်။',
      'မေမေ့ဗိုက်ထဲက ရင်သွေးလေးရဲ့ အနေအထား ပုံမမှန်လျှင် မွေးဖွားချိန်တွင် အခက်အခဲရှိနိုင်ပါသည်။ အလုံခြုံဆုံး မွေးဖွားနိုင်မည့် နည်းလမ်းကို ကြိုတင်တိုင်ပင်ပြင်ဆင်နိုင်ရန်နဲ့ လိုအပ်သော စောင့်ရှောက်မှုခံယူနိုင်ဖို့ ကျန်းမာရေးဝန်ထမ်းမှ ပေးထားသော ရက်ချိန်းအတိုင်း မပျက်မကွက် စောင့်ရှောက်မှုခံယူပါ။'
    ])
  },
  {
    key: 'twins',
    priority: 13,
    credit: 5,
    labelEn: 'Twins pregnancy',
    labelMm: 'အမွှာကိုယ်ဝန်ဟု ထင်မြင်ခြင်း/အမွှာကိုယ်ဝန်သေချာခြင်း',
    riskFactors: ['Twins Pregnancy'],
    gaBand: null,
    message: joinParts([
      'ယခုကာလသည် ကိုယ်ဝန်ဆောင်စောင့်ရှောက်မှု ခံယူရမည့် အချိန်ဖြစ်ပါသည်။',
      'အမွှာကိုယ်ဝန် ဆောင်ထားရချိန်တွင် သွေးအားနည်းခြင်း၊ သွေးတိုးခြင်းနှင့် လမစေ့ဘဲ မွေးဖွားခြင်းစတဲ့ အခြေအနေတွေ ပိုဖြစ်နိုင်ခြေရှိလို့ ပုံမှန်ထက် ပိုပြီး အထူးဂရုစိုက်ဖို့ လိုအပ်ပါသည်။ ကျန်းမာရေးဝန်ထမ်းမှ ပေးထားသော ရက်ချိန်းအတိုင်း မပျက်မကွက် စောင့်ရှောက်မှုခံယူပါ။'
    ])
  },
  {
    key: 'placenta_t1',
    priority: 14,
    credit: 6,
    labelEn: 'Placenta previa / abruption (1st trimester)',
    labelMm: 'အချင်းရှေ့ရောက်ခြင်း/ အချင်းမတိုင်မီ အချင်းကွာခြင်း (ပထမ ၃ လပတ်)',
    riskFactors: ['Placenta previa/Abruption'],
    gaBand: 't1',
    message: joinParts([
      'ယခုကာလသည် ကိုယ်ဝန်ဆောင်စောင့်ရှောက်မှု ခံယူရမည့် အချိန်ဖြစ်ပါသည်။',
      'အချင်းရှေ့ရောက်နေသည့်အတွက် မိခင်နှင့် ရင်သွေး၏ ကျန်မာရေးအခြေအနေ စောင့်ကြည့်နိုင်ဖို့ ရက်ချိန်းလွန်နေပြီ ဖြစ်ပါသဖြင့် ကျန်းမာရေးဌာနသို့ အမြန်ဆုံး သွားရောက်ပြသပေးပါ။',
      'နာကျင်မှု မရှိဘဲ သွေးနည်းနည်း စွန်းခြင်း သို့မဟုတ် သွေးဆင်းခြင်း ရှိပါကလည်း ရက်ချိန်းကို မစောင့်ဘဲ ကျန်းမာရေးဌာနသို့ ချက်ချင်း သွားရောက်ပြသပါ။'
    ])
  },
  {
    key: 'placenta_t2',
    priority: 15,
    credit: 6,
    labelEn: 'Placenta previa / abruption (2nd trimester)',
    labelMm: 'အချင်းရှေ့ရောက်ခြင်း/ အချင်းမတိုင်မီ အချင်းကွာခြင်း (ဒုတိယ ၃ လပတ်)',
    riskFactors: ['Placenta previa/Abruption'],
    gaBand: 't2',
    message: joinParts([
      'ယခုကာလသည် ကိုယ်ဝန်ဆောင်စောင့်ရှောက်မှု ခံယူရမည့် အချိန်ဖြစ်ပါသည်။',
      'ကိုယ်ဝန် ဒုတိယ (၃) လပတ်တွင် အချင်းရှေ့ရောက်ခြင်းနှင့် မမွေးမီ အချင်းကွာခြင်းတို့ကြောင့် သွေးဆင်းခြင်းများဖြစ်ပေါ်နိုင်ပါသည်။ ကျန်းမာရေးဝန်ထမ်းမှ ပေးထားသော ရက်ချိန်းအတိုင်း မပျက်မကွက် စောင့်ရှောက်မှုခံယူပါ။ နာကျင်မှုမရှိဘဲ သွေးဆင်းခြင်း သို့မဟုတ် ဗိုက်အောင့်/ဗိုက်တင်းခြင်းရှိပါက ချက်ချင်း သွားရောက်ပြသပါ။'
    ])
  },
  {
    key: 'placenta_t3',
    priority: 16,
    credit: 8,
    labelEn: 'Placenta previa / abruption (3rd trimester)',
    labelMm: 'အချင်းရှေ့ရောက်ခြင်း/ အချင်းမတိုင်မီ အချင်းကွာခြင်း (တတိယ ၃ လပတ်)',
    riskFactors: ['Placenta previa/Abruption'],
    gaBand: 't3',
    message: joinParts([
      'ယခုကာလသည် ကိုယ်ဝန်ဆောင်စောင့်ရှောက်မှု ခံယူရမည့် အချိန်ဖြစ်ပါသည်။',
      'ကိုယ်ဝန် တတိယ (၃)လပတ်တွင် အချင်းရှေ့ရောက်ခြင်းနဲ့ အချင်းကွာခြင်းတို့ကြောင့် မိခင်ရော ရင်သွေးပါ သွေးလွန်နိုင်တဲ့ အန္တရာယ် အရှိဆုံး အချိန်ဖြစ်ပါသည်။ ကျန်းမာရေးဝန်ထမ်းမှ ပေးထားသော ရက်ချိန်းအတိုင်း မပျက်မကွက် စောင့်ရှောက်မှုခံယူပါ။',
      'မိန်းမကိုယ်မှ သွေးဆင်းခြင်း၊ ဗိုက်အလွန်အမင်း အောင့်ခြင်း/တင်းတောင့်နေခြင်း သို့မဟုတ် ကလေးလှုပ်ရှားမှု လျော့နည်းသွားပါက ရက်ချိန်းကို မစောင့်ဘဲ ကျန်းမာရေးဌာနသို့ ချက်ချင်း သွားရောက်ပြသပါ။'
    ])
  },
  {
    key: 'other_medical',
    priority: 17,
    credit: 5,
    labelEn: 'Other medical conditions',
    labelMm: 'အခြားကျန်းမာရေးပြဿနာများ',
    riskFactors: ['Other Medical Conditions'],
    gaBand: null,
    message: joinParts([
      'ယခုကာလသည် ကိုယ်ဝန်ဆောင်စောင့်ရှောက်မှု ခံယူရမည့် အချိန်ဖြစ်ပါသည်။',
      'ကိုယ်ဝန်ဆောင်ချိန်မှာ ဖြစ်ပွားတတ်တဲ့ ကျန်းမာရေးပြဿနာတွေကို စောစီးစွာ ကာကွယ်ကုသနိုင်ဖို့အတွက် ကျန်းမာရေးဝန်ထမ်းမှ ပေးထားသော ရက်ချိန်းအတိုင်း မပျက်မကွက် စောင့်ရှောက်မှုခံယူပါ။ မိခင်ရော ရင်သွေးပါ ဘေးကင်းကျန်းမာဖို့ ပုံမှန်ပြသရန် အလွန်အရေးကြီးပါသည်။'
    ])
  },
  {
    key: 'short_stature',
    priority: 18,
    credit: 5,
    labelEn: 'Short stature',
    labelMm: 'အရပ်ပုခြင်း',
    riskFactors: ['Short stature'],
    gaBand: null,
    message: joinParts([
      'ယခုကာလသည် ကိုယ်ဝန်ဆောင်စောင့်ရှောက်မှု ခံယူရမည့် အချိန်ဖြစ်ပါသည်။',
      'အရပ်ပုသောမိခင်များတွင် မီးဖွားချိန် အခက်အခဲဖြစ်နိုင်ခြေ ပိုရှိနိုင်သဖြင့် ကျန်းမာရေးဝန်ထမ်းမှ ပေးထားသော ရက်ချိန်းအတိုင်း မပျက်မကွက် စောင့်ရှောက်မှုခံယူပါ။ ကျန်းမာရေးဝန်ထမ်း၏ အကြံပြုချက်ကို လိုက်နာပြီး ဆေးရုံ/ကျန်းမာရေးဌာနတွင် မီးဖွားရန် ကြိုတင်စီစဉ်ထားပါ။'
    ])
  },
  {
    key: 'primigravida',
    priority: 19,
    credit: 5,
    labelEn: 'Primigravida',
    labelMm: 'သားဉီးကိုယ်ဝန်',
    riskFactors: ['Primigravida'],
    gaBand: null,
    message: joinParts([
      'ယခုကာလသည် ကိုယ်ဝန်ဆောင်စောင့်ရှောက်မှု ခံယူရမည့် အချိန်ဖြစ်ပါသည်။',
      'သားဦးကိုယ်ဝန်ဆောင်ဖြစ်သည့်အတွက် မိခင်နှင့်ရင်သွေး ကျန်းမာရေးကောင်းမွန်စေရန် သတ်မှတ်ထားသောရက်တွင် ကိုယ်ဝန်ဆောင်စောင့်ရှောက်မှု ပုံမှန်သွားရောက်ခံယူပါ။ အာဟာရပြည့်ဝစွာစားသုံးပြီး ညွှန်ကြားထားသည့် ဆေးများကို ပုံမှန်သောက်ပါ။'
    ])
  }
]);

const UNSUPPORTED_RISK_FACTORS = Object.freeze(['Previous scar']);

function parseVisitGa(visit) {
  if (!visit) return null;
  const raw = visit.gestationalAge ?? visit.gestational_age ??
    visit.ga_weeks ?? visit.manualGestationalAge;
  const weeks = parseFloat(raw);
  return Number.isFinite(weeks) ? weeks : null;
}

function latestVisit(visits) {
  return (visits || []).map(unwrap).filter(Boolean).sort((left, right) => {
    const leftDate = firstDate(left, [
      'visitDate', 'visit_date', 'recordedAt', 'createdAt'
    ]) || new Date(0);
    const rightDate = firstDate(right, [
      'visitDate', 'visit_date', 'recordedAt', 'createdAt'
    ]) || new Date(0);
    const leftNumber = Number(left.visitNumber || left.visit_number || 0);
    const rightNumber = Number(right.visitNumber || right.visit_number || 0);
    return rightNumber - leftNumber || rightDate - leftDate;
  })[0] || null;
}

function currentGaWeeks(input, asOf) {
  const now = toDate(asOf) || new Date();
  const latestAnc = input && input.latestAnc;
  const recorded = parseVisitGa(latestAnc);
  if (recorded != null) {
    const visitDate = firstDate(latestAnc, [
      'visitDate', 'visit_date', 'recordedAt', 'createdAt'
    ]);
    if (visitDate) {
      const extraWeeks = Math.max(0, Math.floor((now - visitDate) / DAY_MS)) / 7;
      return Math.round((recorded + extraWeeks) * 10) / 10;
    }
    return Math.round(recorded * 10) / 10;
  }
  const lmp = toDate(input && input.lmp);
  if (lmp) {
    const weeks = (now - lmp) / (7 * DAY_MS);
    if (weeks > 0 && weeks < 50) return Math.round(weeks * 10) / 10;
  }
  const edd = toDate(input && input.edd);
  if (edd) {
    const weeks = 40 - ((edd - now) / (7 * DAY_MS));
    if (weeks > 0 && weeks < 50) return Math.round(weeks * 10) / 10;
  }
  return null;
}

function gaBandForWeeks(weeks) {
  if (weeks == null || !Number.isFinite(Number(weeks))) return null;
  if (weeks < 14) return 't1';
  if (weeks < 28) return 't2';
  return 't3';
}

function normalizeRiskFactors(values) {
  if (!Array.isArray(values)) return [];
  return Array.from(new Set(values.map((value) => String(value || '').trim()).filter(Boolean)));
}

function riskFactorsFromFacts(facts, fallback) {
  const highRiskVisits = (facts && facts.antenatalVisits || [])
    .map(unwrap)
    .filter((visit) => visit && ['yes', 'true'].includes(
      String(visit.high_risk ?? visit.highRisk).toLowerCase()
    ));
  const latestHighRisk = latestVisit(highRiskVisits);
  if (latestHighRisk && Array.isArray(latestHighRisk.risk_factors)) {
    return normalizeRiskFactors(latestHighRisk.risk_factors);
  }
  return normalizeRiskFactors(fallback);
}

function publicTemplateChoice(template, matchedFactor, gaBand) {
  return {
    key: template.key,
    labelEn: template.labelEn,
    labelMm: template.labelMm,
    credit: template.credit,
    message: template.message,
    matchedFactor,
    gaBand: template.gaBand || gaBand || null
  };
}

function resolveHrtSmsTemplates(riskFactors, gaWeeks) {
  const factors = normalizeRiskFactors(riskFactors);
  const factorSet = new Set(factors);
  const band = gaBandForWeeks(gaWeeks);
  let needsGa = false;
  const templates = [];
  const seen = new Set();
  const sorted = HRT_SMS_TEMPLATES.slice().sort((left, right) =>
    left.priority - right.priority
  );
  for (const template of sorted) {
    if (!template.riskFactors.some((factor) => factorSet.has(factor))) continue;
    if (template.gaBand) {
      if (!band) {
        needsGa = true;
        continue;
      }
      if (template.gaBand !== band) continue;
    }
    if (seen.has(template.key)) continue;
    seen.add(template.key);
    templates.push(publicTemplateChoice(
      template,
      template.riskFactors.find((factor) => factorSet.has(factor)),
      band
    ));
  }
  return {
    ok: templates.length > 0,
    templates,
    gaBand: band,
    needsGa,
    canCustom: true,
    unsupportedOnly: factors.length > 0 && factors.every((factor) =>
      UNSUPPORTED_RISK_FACTORS.includes(factor)
    )
  };
}

function resolveHrtSmsTemplate(riskFactors, gaWeeks) {
  const resolved = resolveHrtSmsTemplates(riskFactors, gaWeeks);
  if (resolved.templates.length) {
    const first = resolved.templates[0];
    const template = HRT_SMS_TEMPLATES.find((item) => item.key === first.key);
    return {
      ok: true,
      template,
      matchedFactor: first.matchedFactor,
      gaBand: resolved.gaBand
    };
  }
  if (resolved.needsGa) {
    return {
      ok: false,
      code: 'GA_REQUIRED',
      message: 'Gestational age is required for this high-risk SMS template.'
    };
  }
  if (resolved.unsupportedOnly) {
    return {
      ok: false,
      code: 'UNSUPPORTED_FACTOR',
      message: 'No approved SMS template for Previous scar.'
    };
  }
  return {
    ok: false,
    code: 'NO_TEMPLATE',
    message: 'No approved high-risk SMS template matches this patient.'
  };
}

module.exports = {
  SMS_SOURCE,
  HRT_SMS_TEMPLATES,
  UNSUPPORTED_RISK_FACTORS,
  joinParts,
  latestVisit,
  currentGaWeeks,
  gaBandForWeeks,
  normalizeRiskFactors,
  riskFactorsFromFacts,
  publicTemplateChoice,
  resolveHrtSmsTemplates,
  resolveHrtSmsTemplate
};
