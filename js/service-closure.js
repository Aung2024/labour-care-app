/**
 * Final service outcome for a mother or baby.
 * This is separate from HRT, KMC, and PNC clinical outcomes.
 * It only decides whether the patient stays on the in-service list.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ServiceClosure = api;
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  var MOTHER_OUTCOMES = [
    { value: 'service_complete', en: 'Service Complete', mm: 'စောင့်ရှောက်မှု ပြီးမြောက်' },
    { value: 'abortion', en: 'Abortion', mm: 'သားပျက်' },
    { value: 'maternal_death', en: 'Maternal Death', mm: 'မိခင်သေဆုံး' },
    { value: 'other', en: 'Other', mm: 'အခြား' }
  ];

  var BABY_OUTCOMES = [
    { value: 'service_complete', en: 'Service Complete', mm: 'စောင့်ရှောက်မှု ပြီးမြောက်' },
    { value: 'child_death', en: 'Child Death', mm: 'ကလေးသေဆုံး' },
    { value: 'other', en: 'Other', mm: 'အခြား' }
  ];

  var DEATH_PERIODS = [
    { value: 'antepartum', en: 'Death before delivery', mm: 'မီးမဖွားမီသေဆုံးခြင်း' },
    { value: 'intrapartum', en: 'Death during delivery', mm: 'မီးဖွားနေစဉ် သေဆုံးခြင်း' },
    { value: 'postpartum_42', en: 'Death within 42 days after delivery', mm: 'မီးဖွားပြီး ၄၂ ရက်အတွင်း သေဆုံးခြင်း' }
  ];

  var DEATH_CAUSES = [
    { value: 'pregnancy_related', en: 'Pregnancy related disease', mm: 'သားဖွားခြင်းဆိုင်ရာရောဂါ', needsDetail: true },
    { value: 'injury', en: 'Accident / suicide / murder', mm: 'ထိခိုက်ဒဏ်ရာ ရရှိခြင်း၊ မတော်တဆမှုများနှင့် မိမိကိုယ်ကိုသတ်သေခြင်း၊ အသတ်ခံရခြင်း', needsDetail: false },
    { value: 'other', en: 'Other disease', mm: 'အခြားရောဂါ', needsDetail: true }
  ];

  function text(item, language) {
    if (!item) return '';
    return language === 'en' ? item.en : item.mm;
  }

  function findOption(list, value) {
    return (list || []).find(function (item) { return item.value === value; }) || null;
  }

  function outcomesFor(kind) {
    return kind === 'baby' ? BABY_OUTCOMES : MOTHER_OUTCOMES;
  }

  function isClosed(patient) {
    var closure = patient && patient.serviceClosure;
    return !!(closure && closure.status === 'closed');
  }

  function kindOf(patient) {
    if (!patient) return 'mother';
    if (patient.patient_type === 'baby' || patient.mother_patient_id) return 'baby';
    return 'mother';
  }

  function outcomeLabel(patient, language) {
    var closure = patient && patient.serviceClosure;
    if (!closure || closure.status !== 'closed') return '';
    var kind = kindOf(patient);
    var option = findOption(outcomesFor(kind), closure.outcome);
    return text(option, language) || closure.outcome || '';
  }

  function validate(kind, input) {
    input = input || {};
    var outcome = String(input.outcome || '').trim();
    var allowed = outcomesFor(kind).some(function (item) { return item.value === outcome; });
    if (!allowed) {
      return {
        ok: false,
        messageEn: 'Choose a final service outcome.',
        messageMm: 'နောက်ဆုံး စောင့်ရှောက်မှု ရလဒ်ကို ရွေးပါ။'
      };
    }

    var detail = String(input.detail || '').trim();
    var note = String(input.note || '').trim();
    var deathPeriod = String(input.deathPeriod || '').trim();
    var deathCause = String(input.deathCause || '').trim();

    if (outcome === 'maternal_death') {
      if (!findOption(DEATH_PERIODS, deathPeriod)) {
        return {
          ok: false,
          messageEn: 'Choose the period of death.',
          messageMm: 'သေဆုံးချိန်၌ ကိုယ်ဝန်အဆင့်ကို ရွေးပါ။'
        };
      }
      var cause = findOption(DEATH_CAUSES, deathCause);
      if (!cause) {
        return {
          ok: false,
          messageEn: 'Choose the cause of death.',
          messageMm: 'သေဆုံးရသည့် အကြောင်းရင်းကို ရွေးပါ။'
        };
      }
      if (cause.needsDetail && !detail) {
        return {
          ok: false,
          messageEn: 'Enter the details for this cause of death.',
          messageMm: 'သေဆုံးရသည့် အကြောင်းရင်း အသေးစိတ်ကို ရေးပါ။'
        };
      }
    }

    if (outcome === 'other' && !detail) {
      return {
        ok: false,
        messageEn: 'Enter the other outcome.',
        messageMm: 'အခြား ရလဒ်ကို ရေးပါ။'
      };
    }

    return {
      ok: true,
      record: {
        status: 'closed',
        outcome: outcome,
        deathPeriod: outcome === 'maternal_death' ? deathPeriod : null,
        deathCause: outcome === 'maternal_death' ? deathCause : null,
        detail: (outcome === 'other' || (outcome === 'maternal_death' && findOption(DEATH_CAUSES, deathCause) && findOption(DEATH_CAUSES, deathCause).needsDetail)) ? detail : '',
        note: note
      }
    };
  }

  return {
    motherOutcomes: MOTHER_OUTCOMES,
    babyOutcomes: BABY_OUTCOMES,
    deathPeriods: DEATH_PERIODS,
    deathCauses: DEATH_CAUSES,
    outcomesFor: outcomesFor,
    kindOf: kindOf,
    text: text,
    isClosed: isClosed,
    outcomeLabel: outcomeLabel,
    validate: validate
  };
});
