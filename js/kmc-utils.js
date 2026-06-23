/**
 * KMC (Kangaroo Mother Care) eligibility and visit tracking utilities.
 * Eligible if birth weight < 2000 g OR birth >= 3 weeks before EDD.
 */
(function (global) {
  'use strict';

  var PRETERM_WEEKS_BEFORE_EDD = 3;
  var PRETERM_DAYS_BEFORE_EDD = PRETERM_WEEKS_BEFORE_EDD * 7;
  var LOW_BIRTH_WEIGHT_GRAM = 2000;
  var DEFAULTED_AFTER_DAYS = 14;

  var BARRIER_REASONS = {
    "1. Physical and Emotional Strain": [
      { reason: "Physical Pain and Fatigue", detail: "Exhaustion is a top barrier, particularly after C-section recovery or when managing other children. Mothers often find the baby too heavy, experience back or chest pain, or struggle with uncomfortable beds in hospital settings." },
      { reason: "Discomfort during Sleep", detail: "Difficulty sleeping while in a semi-reclined or upright position with the baby restricts rest." },
      { reason: "Mental Health and Guilt", detail: "Postpartum depression and anxiety over having a premature baby can reduce a mother’s willingness or ability to perform continuous KMC." }
    ],
    "2. Logistical and Practical Challenges": [
      { reason: "Lack of Support", detail: "The absence of help with KMC practice (e.g., family members taking turns) or other obligations (household chores, caring for other children) is a major factor." },
      { reason: "Time Limitations and Household Duties", detail: "Many mothers stop KMC because they cannot manage it alongside home responsibilities or work." },
      { reason: "Infant Fussy/Discomfort", detail: "If the baby cries, feels uncomfortable, or seems too warm, parents tend to discontinue the session." },
      { reason: "Medical Issues and Complications", detail: "The mother's own health issues (e.g., pain, illness) or the baby's discomfort (e.g., being attached to medical devices) hampers continuity." }
    ],
    "3. Sociocultural and Behavioral Factors": [
      { reason: "Cultural Beliefs and Confinement", detail: "In some regions, traditional practices conflict with KMC. For example, 'postpartum confinement' may encourage mothers to stay in bed without doing heavy tasks, or traditional bathing practices may interfere with skin-to-skin contact." },
      { reason: "Resistance from Family Members", detail: "Grandparents or other family members may discourage KMC, believing the baby needs to be in a cot or that KMC is uncomfortable for the newborn." },
      { reason: "Modesty and Privacy", detail: "Lack of privacy in overcrowded hospital wards makes mothers uncomfortable being 'naked' for skin-to-skin contact." }
    ],
    "4. Health System Barriers": [
      { reason: "Poor Counseling and Education", detail: "Lack of adequate training and understanding of the benefits of KMC makes parents less likely to adhere to it." },
      { reason: "Negative Experience with Staff", detail: "Poor interaction with healthcare providers or feeling pressured to do KMC can cause clients to abandon the practice." },
      { reason: "Resource Constraints", detail: "Lack of proper facilities (e.g., chairs, screens, blankets) in hospitals." }
    ],
    "5. Reasons for Planned Discontinuation": [
      { reason: "Baby Reaching Target Weight", detail: "Often, when the baby grows, gains weight (e.g., >2,500g), and becomes more active or uncomfortable in the KMC position, mothers stop, as the baby 'wants to move'." },
      { reason: "Baby's Improved Health", detail: "The perception that the baby is strong enough and no longer needs special care." }
    ]
  };

  function parseDateOnlyLocal(val) {
    if (!val) return null;
    if (val && typeof val.toDate === 'function') val = val.toDate();
    if (val instanceof Date) {
      if (isNaN(val.getTime())) return null;
      return new Date(val.getFullYear(), val.getMonth(), val.getDate());
    }
    var s = String(val).trim();
    var m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
    var d = new Date(s);
    if (isNaN(d.getTime())) return null;
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  function generateBabyName(motherName) {
    var trimmed = String(motherName || '').trim();
    if (!trimmed) return 'Baby';
    return 'Baby ' + trimmed;
  }

  function getPatientEdd(patient, latestAnc) {
    if (!patient && !latestAnc) return null;
    var p = patient || {};
    var a = latestAnc || {};
    return p.edd || p.EDD || a.edd || a.manualEdd || a.manual_edd || null;
  }

  function getBirthDateStr(newbornCare, birthAnchor) {
    if (birthAnchor && birthAnchor.datetimeLocal && global.BirthDeliveryAnchor) {
      return BirthDeliveryAnchor.getBirthDateStrFromDatetimeLocal(birthAnchor.datetimeLocal);
    }
    if (newbornCare && newbornCare.birth_time && global.BirthDeliveryAnchor) {
      return BirthDeliveryAnchor.getBirthDateStrFromDatetimeLocal(newbornCare.birth_time);
    }
    if (newbornCare && newbornCare.birth_time) {
      return String(newbornCare.birth_time).split('T')[0];
    }
    return null;
  }

  function daysBeforeEdd(birthDateStr, eddStr) {
    var birth = parseDateOnlyLocal(birthDateStr);
    var edd = parseDateOnlyLocal(eddStr);
    if (!birth || !edd) return null;
    return Math.floor((edd.getTime() - birth.getTime()) / 86400000);
  }

  function isPrematureBirth(birthDateStr, eddStr) {
    var days = daysBeforeEdd(birthDateStr, eddStr);
    return days != null && days >= PRETERM_DAYS_BEFORE_EDD;
  }

  function isLowBirthWeight(weightGram) {
    var w = parseFloat(weightGram);
    return !isNaN(w) && w > 0 && w < LOW_BIRTH_WEIGHT_GRAM;
  }

  function evaluateKmcEligibility(patient, newbornCare, birthAnchor, latestAnc) {
    var reasons = [];
    var weight = newbornCare ? newbornCare.body_weight_gram : null;
    if (isLowBirthWeight(weight)) reasons.push('low_weight');

    var birthDateStr = getBirthDateStr(newbornCare, birthAnchor);
    var edd = getPatientEdd(patient, latestAnc);
    if (birthDateStr && edd && isPrematureBirth(birthDateStr, edd)) {
      reasons.push('preterm');
    }

    var motherName = (patient && (patient.name || patient.patientName)) || '';
    var babyName = (newbornCare && newbornCare.baby_name) || generateBabyName(motherName);

    return {
      eligible: reasons.length > 0,
      reasons: reasons,
      birthDateStr: birthDateStr,
      birthWeightGram: weight != null && weight !== '' ? parseFloat(weight) : null,
      babyName: babyName,
      edd: edd,
      daysBeforeEdd: birthDateStr && edd ? daysBeforeEdd(birthDateStr, edd) : null
    };
  }

  function ageInDaysFromBirth(birthDateStr) {
    var birth = parseDateOnlyLocal(birthDateStr);
    if (!birth) return null;
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.floor((today.getTime() - birth.getTime()) / 86400000);
  }

  function parseVisitDateMs(data) {
    if (!data) return null;
    var t = data.visitDate || data.visit_date || data.date || data.timestamp || data.recordedAt || data.recorded_at;
    if (t == null) return null;
    var d = t && typeof t.toDate === 'function' ? t.toDate() : new Date(t);
    if (!d || isNaN(d.getTime())) return null;
    return d.getTime();
  }

  function normalizeVisitData(visit) {
    return visit && visit.data !== undefined ? visit.data : (visit || {});
  }

  function getCompletedKmcVisits(newbornCareVisits) {
    return (newbornCareVisits || []).filter(function (visit) {
      var d = normalizeVisitData(visit);
      return (d.kmc_selected || '').toLowerCase() === 'yes' &&
        (d.visitDate || d.visit_date || d.date || d.timestamp || d.recordedAt || d.recorded_at);
    }).sort(function (a, b) {
      return (parseVisitDateMs(normalizeVisitData(a)) || 0) - (parseVisitDateMs(normalizeVisitData(b)) || 0);
    });
  }

  function getLatestKmcDecision(newbornCareVisits) {
    var sorted = (newbornCareVisits || []).slice().sort(function (a, b) {
      return (parseVisitDateMs(normalizeVisitData(b)) || 0) - (parseVisitDateMs(normalizeVisitData(a)) || 0);
    });
    for (var i = 0; i < sorted.length; i++) {
      var d = normalizeVisitData(sorted[i]);
      if (d.kmc_selected) return d;
    }
    return null;
  }

  function getLatestDischargeDate(newbornCareVisits) {
    var sorted = (newbornCareVisits || []).slice().sort(function (a, b) {
      return (parseVisitDateMs(normalizeVisitData(b)) || 0) - (parseVisitDateMs(normalizeVisitData(a)) || 0);
    });
    for (var i = 0; i < sorted.length; i++) {
      var d = normalizeVisitData(sorted[i]);
      if (d.discharge_date) return d.discharge_date;
    }
    return null;
  }

  function addDays(dateOnly, days) {
    var d = parseDateOnlyLocal(dateOnly);
    if (!d) return null;
    d.setDate(d.getDate() + days);
    return d;
  }

  function formatDateInput(date) {
    if (!date || isNaN(date.getTime())) return null;
    return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
  }

  function getKmcDueDate(dischargeDate, completedPostDischargeCount) {
    var count = completedPostDischargeCount || 0;
    if (!dischargeDate) return null;
    if (count <= 0) return addDays(dischargeDate, 3);
    if (count === 1) return addDays(dischargeDate, 7);
    if (count === 2) return addDays(dischargeDate, 14);

    var base = parseDateOnlyLocal(dischargeDate);
    if (!base) return null;
    base.setMonth(base.getMonth() + (count - 2));
    return base;
  }

  function getPostDischargeVisitCount(newbornCareVisits, dischargeDate) {
    var discharge = parseDateOnlyLocal(dischargeDate);
    if (!discharge) return 0;
    return getCompletedKmcVisits(newbornCareVisits).filter(function (visit) {
      var d = normalizeVisitData(visit);
      var visitDate = parseDateOnlyLocal(d.visitDate || d.visit_date || d.date || d.timestamp || d.recordedAt || d.recorded_at);
      return visitDate && visitDate >= discharge;
    }).length;
  }

  function getDaysLateForKmc(dischargeDate, completedPostDischargeCount) {
    var due = getKmcDueDate(dischargeDate, completedPostDischargeCount);
    if (!due) return null;
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.floor((today.getTime() - due.getTime()) / 86400000);
  }

  function getCompleteAction(actions) {
    var list = (actions || []).slice().sort(function (a, b) {
      var ams = parseVisitDateMs(a) || 0;
      var bms = parseVisitDateMs(b) || 0;
      return bms - ams;
    });
    for (var i = 0; i < list.length; i++) {
      var a = list[i] || {};
      if (a.type === 'kmc_resolved' || a.type === 'resolved') return a;
    }
    return null;
  }

  function rowTrackingStatus(row) {
    var completeAction = getCompleteAction(row.kmcActions || row.actions || []);
    if (row.completed || completeAction) {
      return { key: 'complete', labelEn: 'Complete', labelMm: 'ပြီးမြောက်' };
    }

    var daysLate = getDaysLateForKmc(row.dischargeDate, row.completedPostDischargeVisitCount || 0);
    if (daysLate == null || daysLate < 0) {
      return { key: 'on_track', labelEn: 'Active KMC', labelMm: 'Active KMC' };
    }
    if (daysLate <= DEFAULTED_AFTER_DAYS) {
      return { key: 'overdue_followup', labelEn: 'Overdue', labelMm: 'Overdue' };
    }
    return { key: 'lost_to_followup', labelEn: 'Defaulted/Lost', labelMm: 'Defaulted/Lost' };
  }

  function reasonLabels(reasons, lang) {
    var en = [];
    var mm = [];
    (reasons || []).forEach(function (r) {
      if (r === 'low_weight') {
        en.push('Low birth weight (<2000g)');
        mm.push('မွေးချိန်အလေးချိန် (<2000g)');
      } else if (r === 'preterm') {
        en.push('Preterm (≥3 wks before EDD)');
        mm.push('မွေးမစေ့ (EDD ထက် ≥၃ ပတ်)');
      }
    });
    return lang === 'mm' ? mm : en;
  }

  function rowIsCompleted(row) {
    if (!row) return false;
    if (row.completed) return true;
    return !!getCompleteAction(row.kmcActions || row.actions || []);
  }

  function getCompletionOutcome(row) {
    var action = row ? getCompleteAction(row.kmcActions || row.actions || []) : null;
    if (!action) return null;
    var outcome = action.outcome || action.resolvedReason || '';
    if (outcome === 'dead' || outcome === 'death') return { key: 'death', labelEn: 'Dead', labelMm: 'သေဆုံး' };
    if (outcome === 'transfer' || outcome === 'transferred') return { key: 'transfer', labelEn: 'Transfer', labelMm: 'လွှဲပြောင်း' };
    if (outcome === 'discontinuation' || outcome === 'kmc_discontinuation') return { key: 'discontinuation', labelEn: 'KMC Discontinuation', labelMm: 'KMC Discontinuation' };
    return { key: 'alive', labelEn: 'KMC complete & Alive', labelMm: 'KMC complete & Alive' };
  }

  global.KmcUtils = {
    PRETERM_DAYS_BEFORE_EDD: PRETERM_DAYS_BEFORE_EDD,
    LOW_BIRTH_WEIGHT_GRAM: LOW_BIRTH_WEIGHT_GRAM,
    DEFAULTED_AFTER_DAYS: DEFAULTED_AFTER_DAYS,
    BARRIER_REASONS: BARRIER_REASONS,
    parseDateOnlyLocal: parseDateOnlyLocal,
    formatDateInput: formatDateInput,
    generateBabyName: generateBabyName,
    evaluateKmcEligibility: evaluateKmcEligibility,
    ageInDaysFromBirth: ageInDaysFromBirth,
    getCompletedKmcVisits: getCompletedKmcVisits,
    getLatestKmcDecision: getLatestKmcDecision,
    getLatestDischargeDate: getLatestDischargeDate,
    getKmcDueDate: getKmcDueDate,
    getPostDischargeVisitCount: getPostDischargeVisitCount,
    getDaysLateForKmc: getDaysLateForKmc,
    getCompleteAction: getCompleteAction,
    getCompletionOutcome: getCompletionOutcome,
    rowTrackingStatus: rowTrackingStatus,
    reasonLabels: reasonLabels,
    isLowBirthWeight: isLowBirthWeight,
    isPrematureBirth: isPrematureBirth,
    rowIsCompleted: rowIsCompleted
  };
})(typeof window !== 'undefined' ? window : this);
