(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.OutcomeSystem = api;
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  var MATERNAL_OUTCOMES = [
    { value: 'alive', en: 'Alive/Routine ANC', mm: 'အသက်ရှင်/ပုံမှန် ANC' },
    { value: 'abortion', en: 'Abortion (before 22 weeks)', mm: 'Abortion (ကိုယ်ဝန်(၂၂)ပတ်မတိုင်မီ)' },
    { value: 'maternal_death', en: 'Death', mm: 'သေဆုံး' },
    { value: 'other', en: 'Other', mm: 'အခြား' }
  ];

  var NEWBORN_OUTCOMES = [
    { value: 'alive', en: 'Alive', mm: 'အသက်ရှင်' },
    { value: 'stillbirth', en: 'Stillbirth', mm: 'အသေမွေး' },
    { value: 'death', en: 'Death', mm: 'သေဆုံး' },
    { value: 'referred', en: 'Referred', mm: 'လွှဲပြောင်း' }
  ];

  var MATERNAL_DEATH_CAUSES = [
    {
      value: 'pregnancy_related',
      en: 'Pregnancy-related disease',
      mm: 'သားဖွားခြင်းဆိုင်ရာရောဂါ',
      needsDetail: true
    },
    {
      value: 'injury',
      en: 'Injury, accident, suicide, or homicide',
      mm: 'ထိခိုက်ဒဏ်ရာ ရရှိခြင်း မတော်တဆမှုများနှင့် မိမိကိုယ်ကိုသတ်သေခြင်း၊ အသတ်ခံရခြင်း',
      needsDetail: false
    },
    {
      value: 'other',
      en: 'Other disease',
      mm: 'အခြားရောဂါ',
      needsDetail: true
    }
  ];

  var DEATH_PERIODS = [
    { value: 'antepartum', en: 'Before delivery', mm: 'မီးမဖွားမီ' },
    { value: 'intrapartum', en: 'During delivery', mm: 'မီးဖွားနေစဉ်' },
    { value: 'postpartum_42', en: 'Within 42 days after delivery', mm: 'မီးဖွားပြီး ၄၂ ရက်အတွင်း' },
    { value: 'neonatal_7', en: 'Within 7 days after birth', mm: 'မွေးပြီး (၇) ရက်အတွင်း' },
    { value: 'neonatal_7_28', en: 'From day 7 to day 28 after birth', mm: 'မွေးပြီး (၇) ရက်မှ (၂၈) ရက်အတွင်း' }
  ];

  var CLOSURE_MOTHER_OUTCOMES = [
    { value: 'service_complete', en: 'Service Complete', mm: 'စောင့်ရှောက်မှုပြီးမြောက်' },
    { value: 'abortion', en: 'Abortion (before 22 weeks)', mm: 'Abortion (ကိုယ်ဝန်(၂၂)ပတ်မတိုင်မီ)' },
    { value: 'maternal_death', en: 'Maternal Death', mm: 'မိခင်သေဆုံး' },
    { value: 'other', en: 'Other', mm: 'အခြား' }
  ];

  var CLOSURE_BABY_OUTCOMES = [
    { value: 'service_complete', en: 'Service Complete', mm: 'စောင့်ရှောက်မှုပြီးမြောက်' },
    { value: 'stillbirth', en: 'Stillbirth', mm: 'အသေမွေး' },
    { value: 'death', en: 'Death', mm: 'ကလေးသေဆုံး' },
    { value: 'other', en: 'Other', mm: 'အခြား' }
  ];

  function asText(value) {
    return String(value == null ? '' : value).trim();
  }

  function findOption(list, value) {
    var wanted = asText(value);
    return (list || []).find(function (option) {
      return option.value === wanted;
    }) || null;
  }

  function labelFor(option, language) {
    if (!option) return '';
    return language === 'en' ? option.en : option.mm;
  }

  function normalizeMaternal(value) {
    var raw = asText(value).toLowerCase();
    if (['alive', 'alive/routine anc', 'live', 'living', 'routine anc', 'အသက်ရှင်'].indexOf(raw) !== -1) return 'alive';
    if (['abortion', 'miscarriage', 'သားပျက်'].indexOf(raw) !== -1) return 'abortion';
    if (['death', 'dead', 'deceased', 'maternal_death', 'မိခင်သေဆုံး', 'သေဆုံး'].indexOf(raw) !== -1) return 'maternal_death';
    if (raw === 'other') return 'other';
    return '';
  }

  function normalizeNewborn(value) {
    var raw = asText(value).toLowerCase();
    if (['alive', 'live', 'living', 'ရှင်', 'အသက်ရှင်'].indexOf(raw) !== -1) return 'alive';
    if (['stillbirth', 'still_birth', 'stillborn', 'သေမွေး', 'အသေမွေး'].indexOf(raw) !== -1) return 'stillbirth';
    if (['death', 'dead', 'died', 'child_death', 'neonatal_death', 'newborn_death', 'သေဆုံး'].indexOf(raw) !== -1) return 'death';
    if (['referred', 'transfer', 'transferred', 'လွှဲပြောင်း'].indexOf(raw) !== -1) return 'referred';
    return '';
  }

  function normalizeDeathCause(value) {
    var raw = asText(value).toLowerCase();
    if (['pregnancy_related', 'pregnancy-related', 'obstetric', 'obstetric_related'].indexOf(raw) !== -1) return 'pregnancy_related';
    if (['injury', 'accident', 'suicide', 'homicide'].indexOf(raw) !== -1) return 'injury';
    if (raw === 'other') return 'other';
    return '';
  }

  function normalizeDeathPeriod(value) {
    var raw = asText(value).toLowerCase();
    if (['antepartum', 'before_delivery'].indexOf(raw) !== -1) return 'antepartum';
    if (['intrapartum', 'during_delivery'].indexOf(raw) !== -1) return 'intrapartum';
    if (['postpartum_42', 'postpartum', 'postpartum42'].indexOf(raw) !== -1) return 'postpartum_42';
    if (['neonatal_7', 'newborn_7', 'within_7_days'].indexOf(raw) !== -1) return 'neonatal_7';
    if (['neonatal_7_28', 'newborn_7_28', 'within_7_to_28_days'].indexOf(raw) !== -1) return 'neonatal_7_28';
    return '';
  }

  function periodForStage(stage) {
    var value = asText(stage).toLowerCase().replace(/[\s-]+/g, '_');
    if (value === 'anc' || value === 'antenatal' || value === 'antenatal_care') return 'antepartum';
    if (value === 'delivery' || value === 'labour' || value === 'intrapartum') return 'intrapartum';
    if (value === 'pnc' || value === 'postpartum' || value === 'postnatal') return 'postpartum_42';
    if (value === 'immediate_newborn' || value === 'immediate_newborn_care') return 'neonatal_7';
    if (value === 'newborn' || value === 'newborn_care') return 'neonatal_7_28';
    return '';
  }

  function isTerminal(subject, value) {
    var normalized = subject === 'newborn' ? normalizeNewborn(value) : normalizeMaternal(value);
    return subject === 'newborn'
      ? ['stillbirth', 'death'].indexOf(normalized) !== -1
      : ['abortion', 'maternal_death'].indexOf(normalized) !== -1;
  }

  function validate(subject, input) {
    input = input || {};
    var isNewborn = subject === 'newborn';
    var value = isNewborn ? normalizeNewborn(input.value) : normalizeMaternal(input.value);
    var allowed = (isNewborn ? NEWBORN_OUTCOMES : MATERNAL_OUTCOMES).some(function (option) {
      return option.value === value;
    });
    if (!allowed) return { ok: false, messageEn: 'Choose an outcome.', messageMm: 'ရလဒ် ရွေးချယ်ပါ။' };

    var period = normalizeDeathPeriod(input.period);
    var cause = normalizeDeathCause(input.cause);
    var reason = asText(input.reason || input.detail);
    if (value === 'maternal_death') {
      if (!period) return { ok: false, messageEn: 'Choose the period of death.', messageMm: 'သေဆုံးသည့်ကာလကို ရွေးချယ်ပါ။' };
      if (!findOption(MATERNAL_DEATH_CAUSES, cause)) {
        return { ok: false, messageEn: 'Choose the cause of death.', messageMm: 'သေဆုံးရသည့် အကြောင်းရင်းကို ရွေးချယ်ပါ။' };
      }
      var maternalCause = findOption(MATERNAL_DEATH_CAUSES, cause);
      if (maternalCause.needsDetail && !reason) {
        return { ok: false, messageEn: 'Enter the cause details.', messageMm: 'သေဆုံးရသည့် အကြောင်းရင်း အသေးစိတ်ကို ရေးပါ။' };
      }
    }
    if (isNewborn && value === 'death' && !reason) {
      return { ok: false, messageEn: 'Enter the disease name or reason for death.', messageMm: 'သေဆုံးရသည့် အကြောင်းရင်း/ရောဂါအမည် ရေးပါ။' };
    }
    if (!isNewborn && value === 'other' && !reason) {
      return { ok: false, messageEn: 'Enter the other outcome.', messageMm: 'အခြား ရလဒ်ကို ရေးပါ။' };
    }

    return {
      ok: true,
      record: {
        subject: isNewborn ? 'newborn' : 'maternal',
        value: value,
        period: value === 'maternal_death' || value === 'death' ? period : null,
        cause: value === 'maternal_death' ? cause : null,
        reason: reason,
        source: asText(input.source),
        eventDate: input.eventDate || null
      }
    };
  }

  function fromLegacy(input, subject, stage) {
    input = input || {};
    var value = subject === 'newborn'
      ? normalizeNewborn(input.value || input.outcome || input.baby_outcome || input.birth_outcome)
      : normalizeMaternal(input.value || input.outcome || input.maternalOutcome || input.maternal_outcome || input.maternalCondition || input.maternal_condition);
    var period = normalizeDeathPeriod(input.period || input.deathPeriod || input.death_period) || periodForStage(stage);
    var cause = normalizeDeathCause(input.cause || input.deathCause || input.death_cause || input.maternalDeathType);
    var reason = asText(input.reason || input.causeOfDeath || input.cause_of_death || input.detail);
    return {
      subject: subject,
      value: value,
      period: value === 'maternal_death' || value === 'death' ? period : null,
      cause: value === 'maternal_death' ? cause : null,
      reason: reason,
      source: asText(input.source),
      eventDate: input.eventDate || null
    };
  }

  async function persistPatientOutcome(patientId, record, userId) {
    if (!patientId || !record || typeof firebase === 'undefined' || !firebase.firestore) return false;
    var subject = record.subject === 'newborn' ? 'newborn' : 'maternal';
    var value = subject === 'newborn' ? normalizeNewborn(record.value) : normalizeMaternal(record.value);
    if (!value) return false;
    var normalized = Object.assign({}, record, {
      subject: subject,
      value: value,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedBy: userId || null
    });
    var patch = {
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    if (subject === 'newborn') {
      patch.newbornOutcome = normalized;
      patch.newborn_outcome = value;
      patch.birth_outcome = value;
    } else {
      patch.maternalOutcome = normalized;
      patch.maternal_outcome = value;
    }
    if (isTerminal(subject, value)) {
      patch.serviceClosure = {
        status: 'closed',
        outcome: value,
        deathPeriod: normalized.period || null,
        deathCause: normalized.cause || null,
        detail: normalized.reason || '',
        source: 'clinical_outcome',
        closedAt: firebase.firestore.FieldValue.serverTimestamp(),
        closedBy: userId || null
      };
      patch.rosterStatus = 'closed';
    } else {
      var existing = await firebase.firestore().collection('patients').doc(patientId).get();
      var existingClosure = existing.exists && existing.data() && existing.data().serviceClosure;
      if (existingClosure && existingClosure.source === 'clinical_outcome') {
        patch.serviceClosure = firebase.firestore.FieldValue.delete();
        patch.rosterStatus = 'open';
      }
    }
    await firebase.firestore().collection('patients').doc(patientId).set(patch, { merge: true });
    return true;
  }

  function closureOutcomes(kind) {
    return kind === 'baby' ? CLOSURE_BABY_OUTCOMES : CLOSURE_MOTHER_OUTCOMES;
  }

  return {
    maternalOutcomes: MATERNAL_OUTCOMES,
    newbornOutcomes: NEWBORN_OUTCOMES,
    maternalDeathCauses: MATERNAL_DEATH_CAUSES,
    deathPeriods: DEATH_PERIODS,
    closureMotherOutcomes: CLOSURE_MOTHER_OUTCOMES,
    closureBabyOutcomes: CLOSURE_BABY_OUTCOMES,
    closureOutcomes: closureOutcomes,
    findOption: findOption,
    labelFor: labelFor,
    normalizeMaternal: normalizeMaternal,
    normalizeNewborn: normalizeNewborn,
    normalizeDeathCause: normalizeDeathCause,
    normalizeDeathPeriod: normalizeDeathPeriod,
    periodForStage: periodForStage,
    isTerminal: isTerminal,
    validate: validate,
    fromLegacy: fromLegacy,
    persistPatientOutcome: persistPatientOutcome
  };
});
