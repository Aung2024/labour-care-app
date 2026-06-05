/**
 * ANC 8-visit schedule tracking status (On Track / Defaulted / Overdued / Dropped out / Complete).
 * Shared by list page alerts and high-risk tracking.
 */
(function (global) {
  'use strict';

  var LABELS = {
    en: {
      on_track: 'On Track',
      defaulted: 'Defaulted',
      overdued: 'Overdued',
      dropped_out: 'Dropped out',
      complete: 'Complete'
    },
    mm: {
      on_track: 'On Track',
      defaulted: 'Defaulted',
      overdued: 'Overdued',
      dropped_out: 'Dropped out',
      complete: 'Complete'
    }
  };

  function visitRawData(visit) {
    if (!visit || typeof visit !== 'object') return {};
    return visit.data !== undefined ? visit.data : visit;
  }

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

  function addDaysLocal(d, days) {
    var out = new Date(d.getTime());
    out.setDate(out.getDate() + days);
    return out;
  }

  function addCalendarMonthsLocal(d, months) {
    var out = new Date(d.getTime());
    out.setMonth(out.getMonth() + months);
    return out;
  }

  function formatDateYMD(d) {
    if (!d || isNaN(d.getTime())) return null;
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }

  function getRecommendedDateForVisitNumber(lmpStr, targetVisitNumber) {
    var lmp = parseDateOnlyLocal(lmpStr);
    if (!lmp || targetVisitNumber < 1 || targetVisitNumber > 8) return null;
    switch (targetVisitNumber) {
      case 1: return null;
      case 2: return formatDateYMD(addCalendarMonthsLocal(lmp, 5));
      case 3: return formatDateYMD(addCalendarMonthsLocal(lmp, 6));
      case 4: return formatDateYMD(addCalendarMonthsLocal(lmp, 7));
      case 5: return formatDateYMD(addCalendarMonthsLocal(lmp, 8));
      case 6: return formatDateYMD(addDaysLocal(addCalendarMonthsLocal(lmp, 8), 14));
      case 7: return formatDateYMD(addCalendarMonthsLocal(lmp, 9));
      case 8: return formatDateYMD(addDaysLocal(addCalendarMonthsLocal(lmp, 9), 14));
      default: return null;
    }
  }

  function parseVisitDateMs(data) {
    if (!data) return null;
    var t = data.visitDate || data.visit_date || data.timestamp || data.createdAt || data.created_at;
    if (t == null) return null;
    var d = t && typeof t.toDate === 'function' ? t.toDate() : new Date(t);
    if (!d || isNaN(d.getTime())) return null;
    return d.getTime();
  }

  function getLatestAncVisitData(visits) {
    var bestMs = null;
    var bestData = null;
    (visits || []).forEach(function (v) {
      var data = visitRawData(v);
      var ms = parseVisitDateMs(data);
      if (ms != null && (bestMs == null || ms > bestMs)) {
        bestMs = ms;
        bestData = data;
      }
    });
    return bestData;
  }

  function countCompletedAncVisits(visits) {
    var maxNum = 0;
    (visits || []).forEach(function (v) {
      var data = visitRawData(v);
      var n = parseInt(data.visitNumber, 10);
      if (!isNaN(n) && n > maxNum) maxNum = n;
    });
    if (maxNum > 0) return Math.min(maxNum, 8);
    return Math.min((visits || []).length, 8);
  }

  function buildContext(patient, visits, actions) {
    return {
      patient: patient || {},
      latestAnc: getLatestAncVisitData(visits),
      ancVisitCount: countCompletedAncVisits(visits),
      actions: actions || []
    };
  }

  function getCompleteAction(ctx) {
    var actions = ctx.actions || [];
    for (var i = 0; i < actions.length; i++) {
      var a = actions[i];
      if (a && a.type === 'resolved' && (
        a.resolvedReason === 'completed' ||
        a.resolvedReason === 'delivered_safely'
      )) {
        return a;
      }
    }
    return null;
  }

  function isCompleted(ctx) {
    return !!getCompleteAction(ctx);
  }

  function getNextVisitDueDate(ctx) {
    var latest = ctx.latestAnc;
    if (latest && latest.nextVisitDate) {
      var parsed = parseDateOnlyLocal(latest.nextVisitDate);
      if (parsed) return parsed;
    }
    var completed = ctx.ancVisitCount || 0;
    var nextVisitNum = completed + 1;
    if (nextVisitNum > 8) return null;
    var lmp = ctx.patient && ctx.patient.lmp;
    if (lmp && lmp !== 'unknown') {
      var recommended = getRecommendedDateForVisitNumber(lmp, nextVisitNum);
      return recommended ? parseDateOnlyLocal(recommended) : null;
    }
    return null;
  }

  function getDaysLateForNextVisit(ctx) {
    if (isCompleted(ctx)) return 0;
    var due = getNextVisitDueDate(ctx);
    if (!due) return 0;
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    var diff = Math.floor((today.getTime() - due.getTime()) / 86400000);
    return diff > 0 ? diff : 0;
  }

  function getLabel(key, lang) {
    var pack = LABELS[lang] || LABELS.en;
    return pack[key] || LABELS.en[key] || key;
  }

  function rowTrackingStatus(ctx, lang) {
    lang = lang || 'en';
    if (getCompleteAction(ctx)) {
      return { key: 'complete', label: getLabel('complete', lang) };
    }
    var daysLate = getDaysLateForNextVisit(ctx);
    if (daysLate === 0) return { key: 'on_track', label: getLabel('on_track', lang) };
    if (daysLate <= 7) return { key: 'defaulted', label: getLabel('defaulted', lang) };
    if (daysLate <= 30) return { key: 'overdued', label: getLabel('overdued', lang) };
    return { key: 'dropped_out', label: getLabel('dropped_out', lang) };
  }

  function isNotOnTrack(statusKey) {
    return statusKey === 'defaulted' || statusKey === 'overdued' || statusKey === 'dropped_out' ||
      statusKey === 'needs_first_anc' || statusKey === 'newborn_follow_up_due' || statusKey === 'newborn_follow_up_overdue';
  }

  function isRegisteredPatient(patient) {
    if (!patient) return false;
    var s = String(patient.status || '').toLowerCase().trim();
    return !s || s === 'registered' || s === 'register';
  }

  function isNewbornFollowUpPatient(patient) {
    if (!patient) return false;
    var s = String(patient.status || '').toLowerCase();
    return s.indexOf('birthed') !== -1 || s.indexOf('postnatal') !== -1;
  }

  function computeNewbornFollowUpStatus(followUpDateStr, lang) {
    lang = lang || 'en';
    var due = parseDateOnlyLocal(followUpDateStr);
    if (!due) return null;
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    var diffDays = Math.floor((due.getTime() - today.getTime()) / 86400000);
    if (diffDays < 0) {
      return {
        key: 'newborn_follow_up_overdue',
        label: lang === 'mm' ? 'မွေးကင်းစကလေး နောက်ဆက်တွဲ ပြန်လည်ပြသရန် (ကျော်လွန်)' : 'Newborn follow-up overdue',
        daysLate: Math.abs(diffDays)
      };
    }
    if (diffDays <= 7) {
      return {
        key: 'newborn_follow_up_due',
        label: lang === 'mm' ? 'မွေးကင်းစကလေး နောက်ဆက်တွဲ ပြန်လည်ပြသရန်' : 'Newborn follow-up due',
        daysLate: 0
      };
    }
    return null;
  }

  function computeFirstAncNeededStatus(lang) {
    lang = lang || 'en';
    return {
      key: 'needs_first_anc',
      label: lang === 'mm' ? 'ပထမ ANC ပြသရန်' : '1st ANC visit due',
      daysLate: 0
    };
  }

  function isAntenatalPatient(patient) {
    if (!patient) return false;
    var s = String(patient.status || '').toLowerCase();
    return s.includes('antenatal');
  }

  function computeTrackingStatus(patient, visits, actions, lang) {
    var ctx = buildContext(patient, visits, actions);
    var status = rowTrackingStatus(ctx, lang);
    return {
      key: status.key,
      label: status.label,
      daysLate: getDaysLateForNextVisit(ctx)
    };
  }

  global.AncTrackingStatus = {
    visitRawData: visitRawData,
    parseDateOnlyLocal: parseDateOnlyLocal,
    getRecommendedDateForVisitNumber: getRecommendedDateForVisitNumber,
    countCompletedAncVisits: countCompletedAncVisits,
    buildContext: buildContext,
    getCompleteAction: getCompleteAction,
    isCompleted: isCompleted,
    getNextVisitDueDate: getNextVisitDueDate,
    getDaysLateForNextVisit: getDaysLateForNextVisit,
    rowTrackingStatus: rowTrackingStatus,
    isNotOnTrack: isNotOnTrack,
    isRegisteredPatient: isRegisteredPatient,
    isNewbornFollowUpPatient: isNewbornFollowUpPatient,
    computeNewbornFollowUpStatus: computeNewbornFollowUpStatus,
    computeFirstAncNeededStatus: computeFirstAncNeededStatus,
    isAntenatalPatient: isAntenatalPatient,
    computeTrackingStatus: computeTrackingStatus,
    getLabel: getLabel
  };
})(typeof window !== 'undefined' ? window : this);
