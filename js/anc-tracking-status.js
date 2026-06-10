/**
 * ANC schedule tracking (Active / Overdue / Defaulter-lost / Complete).
 * Used by patient list badges and alerts — antenatal patients only.
 *
 * Due date: latest visit nextVisitDate, else 8-visit LMP schedule.
 * LMP is taken from patient doc or any ANC visit (visit 1 preferred).
 */
(function (global) {
  'use strict';

  var LABELS = {
    en: {
      on_track: 'Active follow-up',
      overdue_followup: 'Overdue follow-up',
      lost_to_followup: 'Defaulter/lost to follow-up',
      complete: 'Complete'
    },
    mm: {
      on_track: 'Active follow-up',
      overdue_followup: 'Overdue follow-up',
      lost_to_followup: 'Defaulter/lost to follow-up',
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

  function getLatestVisitDataByDate(visits) {
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

  function getLatestVisitDataByNumber(visits) {
    var bestNum = -1;
    var bestData = null;
    (visits || []).forEach(function (v) {
      var data = visitRawData(v);
      var n = parseInt(data.visitNumber, 10);
      if (isNaN(n)) return;
      if (n > bestNum) {
        bestNum = n;
        bestData = data;
      }
    });
    return bestData;
  }

  /** Prefer newest visit date; fall back to highest visit number, then last record. */
  function resolveLatestAncVisit(visits) {
    visits = visits || [];
    if (!visits.length) return null;
    var byDate = getLatestVisitDataByDate(visits);
    if (byDate) return byDate;
    var byNumber = getLatestVisitDataByNumber(visits);
    if (byNumber) return byNumber;
    return visitRawData(visits[visits.length - 1]);
  }

  function getLatestAncVisitData(visits) {
    return resolveLatestAncVisit(visits);
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

  function isKnownLmpValue(lmp) {
    return !!(lmp && lmp !== 'unknown' && lmp !== 'Unknown' && lmp !== 'Not recorded');
  }

  /** LMP from patient doc or any visit — patient-level lmpStatus must not override visit LMP. */
  function getEffectiveLmp(patient, visits) {
    if (isKnownLmpValue(patient && patient.lmp)) return patient.lmp;

    var earliest = null;
    var earliestNum = 999;
    var any = null;

    (visits || []).forEach(function (v) {
      var data = visitRawData(v);
      if (!isKnownLmpValue(data.lmp)) return;
      if (data.lmpStatus === 'unknown') return;
      any = data.lmp;
      var n = parseInt(data.visitNumber, 10);
      if (isNaN(n)) n = 999;
      if (n < earliestNum) {
        earliestNum = n;
        earliest = data.lmp;
      }
    });

    if (earliest) return earliest;
    if (any) return any;

    (visits || []).forEach(function (v) {
      var data = visitRawData(v);
      if (isKnownLmpValue(data.lmp) && !any) any = data.lmp;
    });
    return any || null;
  }

  function getRecordedNextVisitDate(visits) {
    var latest = resolveLatestAncVisit(visits);
    if (!latest) return null;
    var fields = [latest.nextVisitDate, latest.next_visit_date];
    for (var i = 0; i < fields.length; i++) {
      var parsed = parseDateOnlyLocal(fields[i]);
      if (parsed) return parsed;
    }
    return null;
  }

  function buildContext(patient, visits, actions) {
    var latestAnc = resolveLatestAncVisit(visits);
    return {
      patient: patient || {},
      latestAnc: latestAnc,
      visits: visits || [],
      effectiveLmp: getEffectiveLmp(patient, visits),
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
        a.resolvedReason === 'delivered_safely' ||
        a.resolvedReason === 'death' ||
        a.resolvedReason === 'transferred' ||
        a.outcome === 'alive' ||
        a.outcome === 'death' ||
        a.outcome === 'transfer'
      )) {
        return a;
      }
    }
    return null;
  }

  function isCompleted(ctx) {
    return !!getCompleteAction(ctx);
  }

  function getAncScheduleDueDate(ctx) {
    var fromVisit = getRecordedNextVisitDate(ctx.visits);
    if (fromVisit) return fromVisit;

    var completed = ctx.ancVisitCount || 0;
    var nextVisitNum = completed + 1;
    if (nextVisitNum > 8) return null;
    var lmp = ctx.effectiveLmp;
    if (lmp) {
      var recommended = getRecommendedDateForVisitNumber(lmp, nextVisitNum);
      return recommended ? parseDateOnlyLocal(recommended) : null;
    }
    return null;
  }

  function getNextVisitDueDate(ctx) {
    return getAncScheduleDueDate(ctx);
  }

  function getDaysLateForDueDate(due) {
    if (!due) return null;
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    var diff = Math.floor((today.getTime() - due.getTime()) / 86400000);
    return diff;
  }

  function getDaysLateForNextVisit(ctx) {
    if (isCompleted(ctx)) return 0;
    var daysLate = getDaysLateForDueDate(getNextVisitDueDate(ctx));
    return daysLate == null ? null : daysLate;
  }

  function getLabel(key, lang) {
    var pack = LABELS[lang] || LABELS.en;
    return pack[key] || LABELS.en[key] || key;
  }

  function getNextAncVisitNumber(ctx) {
    var completed = ctx && ctx.ancVisitCount ? ctx.ancVisitCount : 0;
    return Math.min(completed + 1, 8);
  }

  function getFollowUpGraceDays(ctx) {
    return getNextAncVisitNumber(ctx) >= 5 ? 14 : 30;
  }

  function statusFromDaysLate(daysLate, lang, ctx) {
    lang = lang || 'en';
    if (daysLate == null) return null;
    if (daysLate < 0) return { key: 'on_track', label: getLabel('on_track', lang) };
    if (daysLate <= getFollowUpGraceDays(ctx)) return { key: 'overdue_followup', label: getLabel('overdue_followup', lang) };
    return { key: 'lost_to_followup', label: getLabel('lost_to_followup', lang) };
  }

  function rowTrackingStatus(ctx, lang) {
    lang = lang || 'en';
    if (getCompleteAction(ctx)) {
      return { key: 'complete', label: getLabel('complete', lang) };
    }
    var daysLate = getDaysLateForNextVisit(ctx);
    var status = statusFromDaysLate(daysLate, lang, ctx);
    return status || { key: 'on_track', label: getLabel('on_track', lang) };
  }

  function isNotOnTrack(statusKey) {
    return statusKey === 'overdue_followup' || statusKey === 'lost_to_followup';
  }

  function isRegisteredPatient(patient) {
    if (!patient) return false;
    var s = String(patient.status || '').toLowerCase().trim();
    return !s || s === 'registered' || s === 'register';
  }

  function isAntenatalPatient(patient) {
    if (!patient || isRegisteredPatient(patient)) return false;
    if (global.StatusManager && global.StatusManager.normalizePatientStatus && global.StatusManager.STATUSES) {
      return global.StatusManager.normalizePatientStatus(patient.status) === global.StatusManager.STATUSES.ANTENATAL;
    }
    var s = String(patient.status || '').toLowerCase();
    return s.indexOf('antenatal') !== -1 || s === 'anc';
  }

  function defaultAntenatalTracking(lang) {
    return {
      key: 'on_track',
      label: getLabel('on_track', lang),
      daysLate: 0,
      phase: 'antenatal'
    };
  }

  function computeTrackingStatus(patient, visits, actions, lang) {
    return computePatientTrackingStatus(patient, { visits: visits, actions: actions }, lang);
  }

  function computeNextAncDueDate(patient, visits) {
    if (!visits || !visits.length) return null;
    var ctx = buildContext(patient, visits, []);
    return getAncScheduleDueDate(ctx);
  }

  function computePatientTrackingStatus(patient, options, lang) {
    options = options || {};
    lang = lang || 'en';

    if (!isAntenatalPatient(patient)) return null;

    var visits = options.visits || [];
    var ctx = buildContext(patient, visits, options.actions || []);

    if (getCompleteAction(ctx)) {
      return {
        key: 'complete',
        label: getLabel('complete', lang),
        daysLate: 0,
        phase: 'antenatal'
      };
    }

    var due = getAncScheduleDueDate(ctx);
    if (due) {
      var daysLate = getDaysLateForDueDate(due);
      var status = statusFromDaysLate(daysLate, lang, ctx);
      if (status) {
        return {
          key: status.key,
          label: status.label,
          daysLate: daysLate,
          dueDate: formatDateYMD(due),
          nextVisitNumber: getNextAncVisitNumber(ctx),
          graceDays: getFollowUpGraceDays(ctx),
          phase: 'antenatal'
        };
      }
    }

    return defaultAntenatalTracking(lang);
  }

  function resolveDueDate(patient, options) {
    if (!isAntenatalPatient(patient)) return null;
    var ctx = buildContext(patient, (options && options.visits) || [], (options && options.actions) || []);
    return getAncScheduleDueDate(ctx);
  }

  function shouldShowTrackingBadge(tracking) {
    if (!tracking || !tracking.key) return false;
    return tracking.key !== 'complete';
  }

  global.AncTrackingStatus = {
    visitRawData: visitRawData,
    parseDateOnlyLocal: parseDateOnlyLocal,
    getRecommendedDateForVisitNumber: getRecommendedDateForVisitNumber,
    countCompletedAncVisits: countCompletedAncVisits,
    buildContext: buildContext,
    resolveLatestAncVisit: resolveLatestAncVisit,
    getCompleteAction: getCompleteAction,
    isCompleted: isCompleted,
    getNextVisitDueDate: getNextVisitDueDate,
    getDaysLateForNextVisit: getDaysLateForNextVisit,
    getNextAncVisitNumber: getNextAncVisitNumber,
    getFollowUpGraceDays: getFollowUpGraceDays,
    rowTrackingStatus: rowTrackingStatus,
    isNotOnTrack: isNotOnTrack,
    isRegisteredPatient: isRegisteredPatient,
    isAntenatalPatient: isAntenatalPatient,
    defaultAntenatalTracking: defaultAntenatalTracking,
    computeTrackingStatus: computeTrackingStatus,
    computeNextAncDueDate: computeNextAncDueDate,
    computePatientTrackingStatus: computePatientTrackingStatus,
    resolveDueDate: resolveDueDate,
    shouldShowTrackingBadge: shouldShowTrackingBadge,
    getLabel: getLabel
  };
})(typeof window !== 'undefined' ? window : this);
