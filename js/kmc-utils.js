/**
 * KMC (Kangaroo Mother Care) eligibility and visit tracking utilities.
 * Eligible if birth weight < 2000 g OR birth >= 3 weeks before EDD.
 */
(function (global) {
  'use strict';

  var PRETERM_WEEKS_BEFORE_EDD = 3;
  var PRETERM_DAYS_BEFORE_EDD = PRETERM_WEEKS_BEFORE_EDD * 7;
  var LOW_BIRTH_WEIGHT_GRAM = 2000;
  var NEWBORN_VISIT_COUNT = 4;

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

  function getCompletedVisitNumbers(newbornCare, kmcVisits) {
    var set = new Set();
    var nbNum = newbornCare && parseInt(newbornCare.visit_number, 10);
    if (!isNaN(nbNum) && nbNum > 0) {
      for (var i = 1; i <= Math.min(nbNum, NEWBORN_VISIT_COUNT); i++) set.add(i);
    }
    (kmcVisits || []).forEach(function (v) {
      var n = parseInt(v.visitNumber != null ? v.visitNumber : v.visit_number, 10);
      if (!isNaN(n) && n >= 1 && n <= NEWBORN_VISIT_COUNT && (v.visitDate || v.visit_date || v.date)) {
        set.add(n);
      }
    });
    return set;
  }

  function getNextVisitDueDate(birthDateStr, completedCount) {
    if (!birthDateStr || !global.BirthDeliveryAnchor) return null;
    var nextNum = Math.min(completedCount + 1, NEWBORN_VISIT_COUNT);
    if (nextNum <= 1) return null;
    var recommended = BirthDeliveryAnchor.getRecommendedCareDateForVisit(birthDateStr, nextNum);
    return recommended ? parseDateOnlyLocal(recommended) : null;
  }

  function getDaysLateForNextVisit(birthDateStr, completedCount) {
    var due = getNextVisitDueDate(birthDateStr, completedCount);
    if (!due) return null;
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.floor((today.getTime() - due.getTime()) / 86400000);
  }

  function getFollowUpGraceDays(completedCount) {
    return completedCount >= 2 ? 7 : 3;
  }

  function rowTrackingStatus(row) {
    if (row.completed) {
      return { key: 'complete', labelEn: 'Complete', labelMm: 'ပြီးမြောက်' };
    }
    var completed = row.completedVisitCount || 0;
    if (completed >= NEWBORN_VISIT_COUNT) {
      return { key: 'complete', labelEn: 'Complete', labelMm: 'ပြီးမြောက်' };
    }
    var daysLate = getDaysLateForNextVisit(row.birthDateStr, completed);
    if (daysLate == null || daysLate < 0) {
      return { key: 'on_track', labelEn: 'Active follow-up', labelMm: 'Active follow-up' };
    }
    if (daysLate <= getFollowUpGraceDays(completed)) {
      return { key: 'overdue_followup', labelEn: 'Overdue follow-up', labelMm: 'Overdue follow-up' };
    }
    return { key: 'lost_to_followup', labelEn: 'Defaulter/lost', labelMm: 'Defaulter/lost' };
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
    if ((row.completedVisitCount || 0) >= NEWBORN_VISIT_COUNT) return true;
    return (row.kmcVisits || []).some(function (v) {
      var s = v.visitStatus || v.visit_status || '';
      return s === 'Death' || s === 'Refer to higher center' || s === 'Loss of contact';
    });
  }

  global.KmcUtils = {
    PRETERM_DAYS_BEFORE_EDD: PRETERM_DAYS_BEFORE_EDD,
    LOW_BIRTH_WEIGHT_GRAM: LOW_BIRTH_WEIGHT_GRAM,
    NEWBORN_VISIT_COUNT: NEWBORN_VISIT_COUNT,
    parseDateOnlyLocal: parseDateOnlyLocal,
    generateBabyName: generateBabyName,
    evaluateKmcEligibility: evaluateKmcEligibility,
    ageInDaysFromBirth: ageInDaysFromBirth,
    getCompletedVisitNumbers: getCompletedVisitNumbers,
    getNextVisitDueDate: getNextVisitDueDate,
    rowTrackingStatus: rowTrackingStatus,
    reasonLabels: reasonLabels,
    isLowBirthWeight: isLowBirthWeight,
    isPrematureBirth: isPrematureBirth,
    rowIsCompleted: rowIsCompleted
  };
})(typeof window !== 'undefined' ? window : this);
