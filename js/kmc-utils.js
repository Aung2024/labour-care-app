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

  function normalizeBabyForKmc(baby, index, fallbackCare, patient) {
    baby = baby || {};
    fallbackCare = fallbackCare || {};
    var babyIndex = parseInt(baby.babyIndex || baby.baby_index || index + 1, 10) || (index + 1);
    var motherName = (patient && (patient.name || patient.patientName)) || '';
    return {
      babyIndex: babyIndex,
      babyName: baby.babyName || baby.baby_name || fallbackCare.baby_name || (generateBabyName(motherName) + (babyIndex > 1 ? ' ' + babyIndex : '')),
      birthWeightGram: baby.birthWeightGram != null ? baby.birthWeightGram : (baby.birth_weight_gram != null ? baby.birth_weight_gram : (baby.body_weight_gram != null ? baby.body_weight_gram : fallbackCare.body_weight_gram)),
      birthTime: baby.birthTime || baby.birth_time || fallbackCare.birth_time || null,
      gender: baby.gender || baby.sex || fallbackCare.gender || null,
      outcome: baby.outcome || fallbackCare.outcome || null
    };
  }

  function getBabiesFromNewbornCare(newbornCare, patient) {
    newbornCare = newbornCare || {};
    if (Array.isArray(newbornCare.babies) && newbornCare.babies.length) {
      return newbornCare.babies.map(function (baby, index) {
        return normalizeBabyForKmc(baby, index, newbornCare, patient);
      });
    }
    return [normalizeBabyForKmc({}, 0, newbornCare, patient)];
  }

  function newbornCareForBaby(newbornCare, baby) {
    baby = baby || {};
    newbornCare = newbornCare || {};
    var out = {};
    Object.keys(newbornCare).forEach(function (key) { out[key] = newbornCare[key]; });
    out.baby_index = baby.babyIndex;
    out.baby_name = baby.babyName || newbornCare.baby_name;
    out.body_weight_gram = baby.birthWeightGram != null ? baby.birthWeightGram : newbornCare.body_weight_gram;
    out.birth_time = baby.birthTime || newbornCare.birth_time;
    out.gender = baby.gender || newbornCare.gender;
    out.outcome = baby.outcome || newbornCare.outcome;
    return out;
  }

  function evaluateKmcEligibilityForBaby(patient, newbornCare, baby, birthAnchor, latestAnc) {
    var care = newbornCareForBaby(newbornCare, baby);
    var result = evaluateKmcEligibility(patient, care, null, latestAnc);
    result.babyIndex = baby.babyIndex || 1;
    result.babyName = baby.babyName || result.babyName;
    result.birthWeightGram = baby.birthWeightGram != null && baby.birthWeightGram !== '' ? parseFloat(baby.birthWeightGram) : result.birthWeightGram;
    result.birthDateStr = baby.birthTime ? getBirthDateStr({ birth_time: baby.birthTime }, null) : result.birthDateStr;
    if (!result.birthDateStr && birthAnchor) result.birthDateStr = getBirthDateStr(null, birthAnchor);
    if (result.birthDateStr && result.edd) result.daysBeforeEdd = daysBeforeEdd(result.birthDateStr, result.edd);
    if (result.birthDateStr && result.edd && isPrematureBirth(result.birthDateStr, result.edd) && result.reasons.indexOf('preterm') === -1) {
      result.reasons.push('preterm');
      result.eligible = true;
    }
    return result;
  }

  function evaluateKmcEligibilityForBabies(patient, newbornCare, birthAnchor, latestAnc) {
    return getBabiesFromNewbornCare(newbornCare, patient).map(function (baby) {
      return evaluateKmcEligibilityForBaby(patient, newbornCare, baby, birthAnchor, latestAnc);
    });
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

  function getCompletedKmcVisitsForBaby(newbornCareVisits, babyIndex) {
    babyIndex = parseInt(babyIndex, 10) || 1;
    return getCompletedKmcVisits(newbornCareVisits).filter(function (visit) {
      var d = normalizeVisitData(visit);
      if (Array.isArray(d.kmc_babies)) {
        return d.kmc_babies.some(function (b) {
          return (parseInt(b.babyIndex || b.baby_index, 10) || 1) === babyIndex && String(b.kmc_selected || '').toLowerCase() === 'yes';
        });
      }
      return babyIndex === 1;
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

  function getLatestKmcDecisionForBaby(newbornCareVisits, babyIndex) {
    babyIndex = parseInt(babyIndex, 10) || 1;
    var sorted = (newbornCareVisits || []).slice().sort(function (a, b) {
      return (parseVisitDateMs(normalizeVisitData(b)) || 0) - (parseVisitDateMs(normalizeVisitData(a)) || 0);
    });
    for (var i = 0; i < sorted.length; i++) {
      var d = normalizeVisitData(sorted[i]);
      if (Array.isArray(d.kmc_babies)) {
        for (var j = 0; j < d.kmc_babies.length; j++) {
          var item = d.kmc_babies[j] || {};
          if ((parseInt(item.babyIndex || item.baby_index, 10) || 1) === babyIndex && item.kmc_selected) {
            var merged = {};
            Object.keys(d).forEach(function (key) { merged[key] = d[key]; });
            Object.keys(item).forEach(function (key) { merged[key] = item[key]; });
            return merged;
          }
        }
      } else if (babyIndex === 1 && d.kmc_selected) {
        return d;
      }
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

  function getLatestDischargeDateForBaby(newbornCareVisits, babyIndex) {
    var decision = getLatestKmcDecisionForBaby(newbornCareVisits, babyIndex);
    return decision && decision.discharge_date ? decision.discharge_date : getLatestDischargeDate(newbornCareVisits);
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

  function getPostDischargeVisitCountForBaby(newbornCareVisits, dischargeDate, babyIndex) {
    var discharge = parseDateOnlyLocal(dischargeDate);
    if (!discharge) return 0;
    return getCompletedKmcVisitsForBaby(newbornCareVisits, babyIndex).filter(function (visit) {
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

  function getCompleteActionForBaby(actions, babyIndex) {
    babyIndex = parseInt(babyIndex, 10) || 1;
    var filtered = (actions || []).filter(function (action) {
      var actionBabyIndex = parseInt(action && (action.babyIndex || action.baby_index), 10);
      return !actionBabyIndex ? babyIndex === 1 : actionBabyIndex === babyIndex;
    });
    return getCompleteAction(filtered);
  }

  function rowTrackingStatus(row) {
    var completeAction = getCompleteAction(row.kmcActions || row.actions || []);
    if (row.completed || completeAction) {
      return { key: 'complete', labelEn: 'Complete', labelMm: 'ပြီးမြောက်' };
    }

    var daysLate = getDaysLateForKmc(row.dischargeDate, row.completedPostDischargeVisitCount || 0);
    if (daysLate == null || daysLate < 0) {
      return { key: 'on_track', labelEn: 'Active KMC', labelMm: 'ရက်ချိန်းမှန်သော KMC' };
    }
    if (daysLate <= DEFAULTED_AFTER_DAYS) {
      return { key: 'overdue_followup', labelEn: 'Overdue', labelMm: 'ရက်ချိန်းလွန်သော KMC' };
    }
    return { key: 'lost_to_followup', labelEn: 'Defaulted/Lost', labelMm: 'အဆက်အသွယ်မရသော KMC' };
  }

  function reasonLabels(reasons, lang) {
    var en = [];
    var mm = [];
    (reasons || []).forEach(function (r) {
      if (r === 'low_weight') {
        en.push('Low birth weight (<2000g)');
        mm.push('ပေါင်ချိန်မပြည့် (LBW)');
      } else if (r === 'preterm') {
        en.push('Preterm (≥3 wks before EDD)');
        mm.push('လမစေ့ (Preterm)');
      }
    });
    return lang === 'mm' ? mm : en;
  }

  function rowIsCompleted(row) {
    if (!row) return false;
    if (row.completed) return true;
    if (row.babyIndex) return !!getCompleteActionForBaby(row.kmcActions || row.actions || [], row.babyIndex);
    return !!getCompleteAction(row.kmcActions || row.actions || []);
  }

  function getCompletionOutcome(row) {
    var action = row && row.babyIndex
      ? getCompleteActionForBaby(row.kmcActions || row.actions || [], row.babyIndex)
      : (row ? getCompleteAction(row.kmcActions || row.actions || []) : null);
    if (!action) return null;
    var outcome = action.outcome || action.resolvedReason || '';
    if (outcome === 'dead' || outcome === 'death') return { key: 'death', labelEn: 'Dead', labelMm: 'သေဆုံး' };
    if (outcome === 'transfer' || outcome === 'transferred') return { key: 'transfer', labelEn: 'Transfer', labelMm: 'လွှဲပြောင်း' };
    if (outcome === 'discontinuation' || outcome === 'kmc_discontinuation') return { key: 'discontinuation', labelEn: 'KMC Discontinuation', labelMm: 'KMC ရပ်ဆိုင်း' };
    return { key: 'alive', labelEn: 'KMC complete & Alive', labelMm: 'KMC ပြီးမြောက်ပြီး အသက်ရှင်' };
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
    evaluateKmcEligibilityForBaby: evaluateKmcEligibilityForBaby,
    evaluateKmcEligibilityForBabies: evaluateKmcEligibilityForBabies,
    getBabiesFromNewbornCare: getBabiesFromNewbornCare,
    newbornCareForBaby: newbornCareForBaby,
    ageInDaysFromBirth: ageInDaysFromBirth,
    getCompletedKmcVisits: getCompletedKmcVisits,
    getCompletedKmcVisitsForBaby: getCompletedKmcVisitsForBaby,
    getLatestKmcDecision: getLatestKmcDecision,
    getLatestKmcDecisionForBaby: getLatestKmcDecisionForBaby,
    getLatestDischargeDate: getLatestDischargeDate,
    getLatestDischargeDateForBaby: getLatestDischargeDateForBaby,
    getKmcDueDate: getKmcDueDate,
    getPostDischargeVisitCount: getPostDischargeVisitCount,
    getPostDischargeVisitCountForBaby: getPostDischargeVisitCountForBaby,
    getDaysLateForKmc: getDaysLateForKmc,
    getCompleteAction: getCompleteAction,
    getCompleteActionForBaby: getCompleteActionForBaby,
    getCompletionOutcome: getCompletionOutcome,
    rowTrackingStatus: rowTrackingStatus,
    reasonLabels: reasonLabels,
    isLowBirthWeight: isLowBirthWeight,
    isPrematureBirth: isPrematureBirth,
    rowIsCompleted: rowIsCompleted
  };
})(typeof window !== 'undefined' ? window : this);
