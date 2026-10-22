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

  var outcomeSystem = typeof OutcomeSystem !== 'undefined' ? OutcomeSystem : null;
  var MOTHER_OUTCOMES = outcomeSystem
    ? outcomeSystem.closureMotherOutcomes
    : [
      { value: 'service_complete', en: 'Service Complete', mm: 'စောင့်ရှောက်မှုပြီးမြောက်' },
      { value: 'abortion', en: 'Abortion', mm: 'Abortion (ကိုယ်ဝန်(၂၂)ပတ်မတိုင်မီ)' },
      { value: 'maternal_death', en: 'Maternal Death', mm: 'မိခင်သေဆုံး' },
      { value: 'other', en: 'Other', mm: 'အခြား' }
    ];

  var BABY_OUTCOMES = outcomeSystem
    ? outcomeSystem.closureBabyOutcomes
    : [
      { value: 'service_complete', en: 'Service Complete', mm: 'စောင့်ရှောက်မှုပြီးမြောက်' },
      { value: 'death', en: 'Death', mm: 'ကလေးသေဆုံး' },
      { value: 'stillbirth', en: 'Stillbirth', mm: 'အသေမွေး' },
      { value: 'other', en: 'Other', mm: 'အခြား' }
    ];

  var DEATH_PERIODS = outcomeSystem
    ? outcomeSystem.deathPeriods
    : [
      { value: 'antepartum', en: 'Death before delivery', mm: 'မီးမဖွားမီသေဆုံးခြင်း' },
      { value: 'intrapartum', en: 'Death during delivery', mm: 'မီးဖွားနေစဉ် သေဆုံးခြင်း' },
      { value: 'postpartum_42', en: 'Death within 42 days after delivery', mm: 'မီးဖွားပြီး ၄၂ ရက်အတွင်း သေဆုံးခြင်း' },
      { value: 'neonatal_7', en: 'Within 7 days after birth', mm: 'မွေးပြီး (၇) ရက်အတွင်း' },
      { value: 'neonatal_7_28', en: 'From day 7 to day 28 after birth', mm: 'မွေးပြီး (၇) ရက်မှ (၂၈) ရက်အတွင်း' }
    ];

  var DEATH_CAUSES = outcomeSystem
    ? outcomeSystem.maternalDeathCauses
    : [
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

  function normalizeClosureOutcome(kind, value) {
    var raw = String(value || '').trim().toLowerCase();
    if (kind === 'baby' && raw === 'child_death') return 'death';
    if (kind === 'mother' && raw === 'death') return 'maternal_death';
    return value;
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
    var option = findOption(outcomesFor(kind), normalizeClosureOutcome(kind, closure.outcome));
    return text(option, language) || closure.outcome || '';
  }

  function validate(kind, input) {
    input = input || {};
    var outcome = normalizeClosureOutcome(kind, String(input.outcome || '').trim());
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

    var isMaternalDeath = outcome === 'maternal_death';
    var isBabyDeath = kind === 'baby' && outcome === 'death';
    if (isMaternalDeath || isBabyDeath) {
      if (!findOption(DEATH_PERIODS, deathPeriod)) {
        return {
          ok: false,
          messageEn: 'Choose the period of death.',
          messageMm: 'သေဆုံးချိန်၌ ကိုယ်ဝန်အဆင့်ကို ရွေးပါ။'
        };
      }
      var cause = isMaternalDeath ? findOption(DEATH_CAUSES, deathCause) : true;
      if (isMaternalDeath && !cause) {
        return {
          ok: false,
          messageEn: 'Choose the cause of death.',
          messageMm: 'သေဆုံးရသည့် အကြောင်းရင်းကို ရွေးပါ။'
        };
      }
      if ((isBabyDeath || cause.needsDetail) && !detail) {
        return {
          ok: false,
          messageEn: isBabyDeath ? 'Enter the disease name or reason for death.' : 'Enter the details for this cause of death.',
          messageMm: isBabyDeath ? 'သေဆုံးရသည့် အကြောင်းရင်း/ရောဂါအမည် ရေးပါ။' : 'သေဆုံးရသည့် အကြောင်းရင်း အသေးစိတ်ကို ရေးပါ။'
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
        deathPeriod: isMaternalDeath || isBabyDeath ? deathPeriod : null,
        deathCause: isMaternalDeath ? deathCause : null,
        detail: (outcome === 'other' || isBabyDeath || (isMaternalDeath && findOption(DEATH_CAUSES, deathCause) && findOption(DEATH_CAUSES, deathCause).needsDetail)) ? detail : '',
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
