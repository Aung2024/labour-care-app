/**
 * Newborn QI possible causes and recommended actions (bilingual).
 * First five indicators follow the MoH/partner sample Word table;
 * remaining six are drafted in the same knowledge / supplies / workflow style.
 */
(function (global) {
  'use strict';

  var OTHER_CAUSE = {
    id: 'other',
    en: 'Other',
    mm: 'အခြား',
    actionEn: '',
    actionMm: '',
    isOther: true
  };

  function cause(id, en, mm, actionEn, actionMm) {
    return { id: id, en: en, mm: mm, actionEn: actionEn, actionMm: actionMm, isOther: false };
  }

  var BY_INDICATOR = {
    skin_to_skin: [
      cause(
        'ss_unaware',
        'Staff are unaware of the benefits or recommended duration of skin-to-skin contact.',
        'Skin-to-skin contact ၏ အကျိုးကျေးဇူးနှင့် ဆက်လက်ထားရှိရမည့်ကာလကို ဝန်ထမ်းများ မသိရှိခြင်း။',
        'Provide refresher training, bedside coaching and job aids on essential newborn care.',
        'Essential Newborn Care ဆိုင်ရာ refresher training၊ bedside coaching နှင့် job aid များပေးပါ။'
      ),
      cause(
        'ss_routine_separation',
        'Routine practice is to separate mother and baby immediately.',
        'မွေးပြီးချက်ချင်း မိခင်နှင့်ကလေးကို ခွဲထားသည့် အလေ့အထရှိခြင်း။',
        'Review workflow and introduce a “no unnecessary separation” practice for clinically stable mothers and newborns.',
        'ကျန်းမာရေးအခြေအနေတည်ငြိမ်ပါက မလိုအပ်ဘဲ မခွဲထားရန် မွေးပြီးချက်ချင်း မိခင်နှင့်ကလေးကို အတူတူထားရန်။ လုပ်ငန်းစဉ်ပြင်ဆင်ပြီး လိုက်နာစောင့်ကြည့်ပါ။'
      ),
      cause(
        'ss_ipc_misunderstanding',
        'Staff unnecessarily separate mother and baby because of misunderstanding of infection risk.',
        'ရောဂါကူးစက်မည်ကို စိုးရိမ်၍ မလိုအပ်ဘဲ ခွဲထားခြင်း။',
        'Clarify IPC indications for separation through protocol review and coaching.',
        'မိခင်နှင့်ကလေး ခွဲထားရန် အမှန်တကယ်လိုအပ်သော IPC indication များကို protocol နှင့်အညီ ပြန်လည်သင်ကြားပါ။'
      ),
      OTHER_CAUSE
    ],
    thorough_drying: [
      cause(
        'dry_no_towels',
        'No clean/dry towels or cloths; insufficient linen.',
        'သန့်ရှင်းခြောက်သွေ့သော မျက်နှာသုတ်ပဝါ/အနှီး မရှိခြင်း သို့မဟုတ် မလုံလောက်ခြင်း။',
        'Maintain minimum stock levels and replenish after every delivery.',
        'Minimum stock သတ်မှတ်၍ မွေးဖွားမှုတစ်ခုပြီးတိုင်း ပြန်လည်ဖြည့်တင်းပါ။'
      ),
      cause(
        'dry_not_prepared',
        'Supplies not prepared before delivery.',
        'မွေးဖွားမီ ပစ္စည်းများ မပြင်ဆင်ရသေးခြင်း။',
        'Introduce a pre-delivery readiness checklist.',
        'မွေးဖွားမီ ပစ္စည်းအဆင်သင့်ဖြစ်မှု checklist အသုံးပြုပါ။'
      ),
      OTHER_CAUSE
    ],
    delayed_cord_clamping: [
      cause(
        'dcc_timing_unknown',
        'Staff are unaware of recommended delayed-clamping timing.',
        'ချက်ကြိုးညှပ်ချိန်နှောင့်နှေးရန် အကြံပြုထားသော timing ကို မသိရှိခြင်း။',
        'Provide refresher training and display a simple delivery-room job aid.',
        'Refresher training ပေးပြီး မွေးခန်းတွင် job aid ချိတ်ဆွဲထားပါ။'
      ),
      cause(
        'dcc_instruments',
        'Clean/sterile cord instruments are not consistently available.',
        'သန့်ရှင်း/sterile cord instrument များ အမြဲမရရှိခြင်း။',
        'Ensure appropriate processing and availability of cord-care instruments for every birth.',
        'မွေးဖွားမှုတိုင်းအတွက် သန့်ရှင်းစွာ process လုပ်ထားသော cord-care instruments အဆင်သင့်ရှိစေပါ။'
      ),
      OTHER_CAUSE
    ],
    early_breastfeeding: [
      cause(
        'bf_privacy',
        'Inadequate privacy or comfortable space for breastfeeding.',
        'နို့တိုက်ရန် privacy နှင့် သက်တောင့်သက်သာနေရာ မလုံလောက်ခြင်း။',
        'Provide a suitable, private and supportive breastfeeding environment.',
        'မိခင်နို့တိုက်ရန် သင့်လျော်၍ privacy ရသော နေရာ စီစဉ်ပေးပါ။'
      ),
      cause(
        'bf_job_aids',
        'Breastfeeding job aids/counselling materials are unavailable.',
        'Breastfeeding counselling job aid/material မရှိခြင်း။',
        'Provide simple visual job aids on positioning, attachment and early initiation.',
        'Positioning၊ attachment နှင့် early initiation ပါသော ရုပ်ပုံ job aid များထားရှိပါ။'
      ),
      cause(
        'bf_skills',
        'Staff breastfeeding counselling skills need strengthening.',
        'ဝန်ထမ်းများ၏ မိခင်နို့တိုက်ကျွေးရေး အကြံပေးကျွမ်းကျင်မှု အားနည်းခြင်း။',
        'Provide practical competency-based breastfeeding counselling training.',
        'လက်တွေ့အခြေပြု breastfeeding counselling training ပေးပါ။'
      ),
      cause(
        'bf_not_counselled',
        'Mother is not counselled during ANC/labour/postpartum period.',
        'ANC၊ မွေးဖွားစဉ် သို့မဟုတ် မွေးပြီးနောက် မိခင်အား မရှင်းပြထားခြင်း။',
        'Integrate early breastfeeding counselling into ANC, admission and postpartum checklists.',
        'ANC၊ admission နှင့် postpartum checklist များတွင် breastfeeding counselling ထည့်သွင်းပါ။'
      ),
      OTHER_CAUSE
    ],
    eye_care_teo: [
      cause(
        'teo_technique',
        'Staff are unaware of indication, timing or correct application technique.',
        'TEO ပေးရမည့် indication၊ timing နှင့် application technique မသိရှိခြင်း။',
        'Conduct refresher training, demonstration and competency assessment according to national protocol.',
        'National protocol အတိုင်း refresher training ပြုလုပ်ရန်။'
      ),
      cause(
        'teo_stockout',
        'TEO is out of stock.',
        'TEO stock-out ဖြစ်ခြင်း။',
        'Conduct routine expiry checks and use FEFO (first-expiry, first-out) stock management.',
        'Expiry date ပုံမှန်စစ်၍ FEFO စနစ်အသုံးပြုပါ။'
      ),
      OTHER_CAUSE
    ],
    vitamin_k: [
      cause(
        'vitk_unaware',
        'Staff are unsure about Vitamin K dose, timing or injection site.',
        'ဗီတာမင်ကေ ပမာဏ၊ အချိန် သို့မဟုတ် ထိုးနေရာကို ဝန်ထမ်းများ မသေချာခြင်း။',
        'Provide refresher training and a bedside dosing job aid for Vitamin K.',
        'ဗီတာမင်ကေ အတွက် refresher training နှင့် bedside dosing job aid ပေးပါ။'
      ),
      cause(
        'vitk_stockout',
        'Vitamin K ampoules or syringes are not available.',
        'ဗီတာမင်ကေ ampoule သို့မဟုတ် syringe မရှိခြင်း။',
        'Maintain minimum stock, monitor expiry and reorder before stock-out.',
        'Minimum stock ထားရှိပြီး သက်တမ်းစောင့်ကြည့်ကာ မကုန်မီ ပြန်မှာယူပါ။'
      ),
      cause(
        'vitk_not_documented',
        'Vitamin K is given but not recorded in the newborn chart.',
        'ဗီတာမင်ကေ ပေးသော်လည်း မွေးကင်းစမှတ်တမ်းတွင် မရေးခြင်း။',
        'Add Vitamin K to the immediate newborn care checklist and verify documentation before transfer.',
        'ချက်ချင်း မွေးကင်းစ စောင့်ရှောက်မှု checklist တွင် ဗီတာမင်ကေ ထည့်ပြီး လွှဲပြောင်းမီ စစ်ဆေးပါ။'
      ),
      OTHER_CAUSE
    ],
    vital_signs: [
      cause(
        'vs_equipment',
        'Thermometer or timing tools for RR/HR are missing or not working.',
        'အပူချိန်တိုင်းကိရိယာ သို့မဟုတ် RR/HR တိုင်းရန် အချိန်ကိရိယာ မရှိ/မအလုပ်လုပ်ခြင်း။',
        'Repair or replace vital-sign equipment and keep a ready set at the newborn station.',
        'Vital sign ကိရိယာများကို ပြင်ဆင်/အစားထိုးပြီး မွေးကင်းစနေရာတွင် အဆင်သင့်ထားပါ။'
      ),
      cause(
        'vs_skills',
        'Staff need coaching on measuring and interpreting newborn vital signs.',
        'မွေးကင်းစ vital signs တိုင်းတာ/အဓိပ္ပာယ်ဖွင့်ရန် ဝန်ထမ်းများအား လေ့ကျင့်ရန် လိုအပ်ခြင်း။',
        'Provide bedside coaching and competency checks on temperature, RR and HR.',
        'အပူချိန်၊ RR နှင့် HR အတွက် bedside coaching နှင့် competency စစ်ဆေးမှု ပြုလုပ်ပါ။'
      ),
      cause(
        'vs_workflow',
        'Vital signs are not included in the routine newborn visit workflow.',
        'မွေးကင်းစ ပြန်ပြလုပ်ငန်းစဉ်တွင် vital signs မပါခြင်း။',
        'Add vital signs as a required step on the newborn visit checklist.',
        'မွေးကင်းစ ပြန်ပြ checklist တွင် vital signs ကို မဖြစ်မနေအဆင့်အဖြစ် ထည့်ပါ။'
      ),
      OTHER_CAUSE
    ],
    birth_weight: [
      cause(
        'bw_scale',
        'Newborn scale is unavailable, broken or not calibrated.',
        'မွေးကင်းစ ချိန်ခွင် မရှိ၊ ပျက်နေ သို့မဟုတ် စံချိန်မမှန်ခြင်း။',
        'Ensure a working calibrated scale is available for every birth and discharge check.',
        'မွေးဖွားမှုနှင့် ဆင်းခွင့်တိုင်းအတွက် အလုပ်လုပ်သော စံချိန်ချိန်ခွင် ရှိစေပါ။'
      ),
      cause(
        'bw_timing',
        'Birth weight is delayed or skipped during busy deliveries.',
        'မွေးဖွားမှုများသောအချိန်တွင် မွေးချိန်အလေးချိန် တိုင်းရန် နောက်ကျ/ကျော်ခြင်း။',
        'Assign weighing as an immediate post-birth task and document before leaving the delivery area.',
        'မွေးပြီးချက်ချင်း ချိန်ရန် တာဝန်ပေးပြီး မွေးခန်းမှ မထွက်မီ မှတ်တမ်းတင်ပါ။'
      ),
      cause(
        'bw_unit_error',
        'Staff are unsure whether to record grams or kilograms.',
        'ဂရမ် သို့မဟုတ် ကီလိုဂရမ်ဖြင့် မှတ်ရမည်ကို မသေချာခြင်း။',
        'Standardize newborn weight recording in grams with a simple unit job aid.',
        'မွေးကင်းစ အလေးချိန်ကို ဂရမ်ဖြင့် စံသတ်မှတ်ပြီး unit job aid ထားပါ။'
      ),
      OTHER_CAUSE
    ],
    pre_discharge_exam: [
      cause(
        'exam_checklist',
        'No complete pre-discharge examination checklist is used.',
        'မဆင်းမီ ပြည့်စုံသော စမ်းသပ်စစ်ဆေးမှု checklist မသုံးခြင်း။',
        'Introduce and enforce a pre-discharge newborn exam checklist (infection, jaundice, cord, anomalies).',
        'မဆင်းမီ မွေးကင်းစ စစ်ဆေးစာရင်း (ပိုးဝင်ခြင်း၊ အသားဝါ၊ ချက်ကြိုး၊ မွေးရာပါချို့ယွင်းချက်) အသုံးပြုပါ။'
      ),
      cause(
        'exam_skills',
        'Staff need refresher training on newborn clinical examination.',
        'မွေးကင်းစ လက်တွေ့စမ်းသပ်မှုအတွက် ဝန်ထမ်းများအား refresher training လိုအပ်ခြင်း။',
        'Provide competency-based coaching on cord, eye, anomaly and danger-sign review.',
        'ချက်ကြိုး၊ မျက်စိ၊ မွေးရာပါချို့ယွင်းချက်နှင့် အန္တရာယ်လက္ခဏာ စစ်ဆေးမှုအတွက် လေ့ကျင့်ပေးပါ။'
      ),
      cause(
        'exam_time_pressure',
        'Discharge happens before a full examination can be completed.',
        'ပြည့်စုံစစ်ဆေးမှု မပြီးမီ ဆင်းခွင့်ပေးခြင်း။',
        'Do not discharge until the exam checklist is completed and signed.',
        'စစ်ဆေးစာရင်း ပြီးမြောက်ပြီး လက်မှတ်မထိုးမီ ဆင်းခွင့် မပေးပါနှင့်။'
      ),
      OTHER_CAUSE
    ],
    exclusive_breastfeeding: [
      cause(
        'ebf_formula_culture',
        'Formula or other feeds are offered without medical indication.',
        'ဆေးဘက်ဆိုင်ရာ အကြောင်းမရှိဘဲ ဖော်မြူလာ သို့မဟုတ် အခြားနို့များ ပေးခြင်း။',
        'Reinforce exclusive breastfeeding policy and counsel families against unnecessary formula.',
        'မိခင်နို့ တစ်မျိုးတည်း မူဝါဒကို အားဖြည့်ပြီး မလိုအပ်သော ဖော်မြူလာ မသုံးရန် မိသားစုအား အကြံပေးပါ။'
      ),
      cause(
        'ebf_support',
        'Mothers do not receive enough practical support for latch and positioning.',
        'မိခင်များအား latch နှင့် positioning လက်တွေ့ ကူညီမှု မလုံလောက်ခြင်း။',
        'Schedule breastfeeding observation and hands-on support before discharge.',
        'ဆင်းခွင့်မတိုင်မီ နို့တိုက်ကြည့်ရှုမှုနှင့် လက်တွေ့ကူညီမှု စီစဉ်ပါ။'
      ),
      cause(
        'ebf_documentation',
        'Exclusive breastfeeding status is not documented at each visit.',
        'ပြသမှုတိုင်းတွင် မိခင်နို့ တစ်မျိုးတည်း အခြေအနေ မမှတ်တမ်းတင်ခြင်း။',
        'Add exclusive breastfeeding confirmation to the newborn visit form workflow.',
        'မွေးကင်းစ ပြန်ပြ ဖောင်လုပ်ငန်းစဉ်တွင် မိခင်နို့ တစ်မျိုးတည်း အတည်ပြုချက် ထည့်ပါ။'
      ),
      OTHER_CAUSE
    ],
    follow_up_schedule: [
      cause(
        'fu_no_cards',
        'Follow-up appointment cards are not available at discharge.',
        'ဆင်းခွင့်တွင် ပြန်ပြရက်ကတ်များ မရှိခြင်း။',
        'Keep pre-printed follow-up cards at the discharge desk and restock regularly.',
        'ဆင်းခွင့်စားပွဲတွင် ကြိုတင်ပုံနှိပ် ပြန်ပြရက်ကတ်များ ထားရှိပြီး ပုံမှန် ဖြည့်တင်းပါ။'
      ),
      cause(
        'fu_schedule_unknown',
        'Staff are unclear about day 3, 7, 14 and 6-week visit timing.',
        '၃ ရက်၊ ၇ ရက်၊ ၁၄ ရက်နှင့် ၆ ပတ် ပြန်ပြအချိန်ကို ဝန်ထမ်းများ မသေချာခြင်း။',
        'Display the national newborn follow-up schedule and coach staff on booking all visits.',
        'နိုင်ငံတော် မွေးကင်းစ ပြန်ပြအချိန်ဇယား ချိတ်ဆွဲပြီး ဝန်ထမ်းများကို ချိန်းဆိုမှု လေ့ကျင့်ပေးပါ။'
      ),
      cause(
        'fu_mother_not_informed',
        'Mothers leave without a clear verbal and written follow-up plan.',
        'မိခင်များသည် ရှင်းလင်းသော နှုတ်ဖြင့်နှင့် စာဖြင့် ပြန်ပြအစီအစဉ် မရရှိဘဲ ဆင်းခြင်း။',
        'Counsel every mother on the follow-up plan and confirm the next date before discharge.',
        'ဆင်းခွင့်မတိုင်မီ မိခင်တိုင်းအား ပြန်ပြအစီအစဉ် အကြံပေးပြီး နောက်ရက်ကို အတည်ပြုပါ။'
      ),
      OTHER_CAUSE
    ]
  };

  function causesForIndicator(indicatorId) {
    var list = BY_INDICATOR[indicatorId];
    if (!list || !list.length) return [OTHER_CAUSE];
    return list.slice();
  }

  function causeById(indicatorId, causeId) {
    return causesForIndicator(indicatorId).find(function (item) {
      return item.id === causeId;
    }) || null;
  }

  global.QualityPossibleCauses = {
    OTHER_CAUSE: OTHER_CAUSE,
    BY_INDICATOR: BY_INDICATOR,
    causesForIndicator: causesForIndicator,
    causeById: causeById
  };
})(typeof window !== 'undefined' ? window : this);
