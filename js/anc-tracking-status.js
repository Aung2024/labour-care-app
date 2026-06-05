/**
 * Care follow-up tracking (On Track / Defaulted / Overdued / Dropped out / Complete).
 * Shared by patient list alerts and high-risk tracking.
 *
 * Due date priority:
 * - Antenatal: latest visit nextVisitDate, else 8-visit LMP schedule
 * - Birthed: newborn follow-up date, else ANC schedule fallback
 * - Postnatal: latest PNC next visit / patient pnc_follow_up_date, else ANC schedule fallback
 * - Registered: no follow-up tracking (status pill only)
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

  function getLatestVisitData(visits) {
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

  function getLatestAncVisitData(visits) {
    return getLatestVisitData(visits);
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

  function getAncScheduleDueDate(ctx) {
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

  function getNextVisitDueDate(ctx) {
    return getAncScheduleDueDate(ctx);
  }

  function getDaysLateForDueDate(due) {
    if (!due) return null;
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    var diff = Math.floor((today.getTime() - due.getTime()) / 86400000);
    return diff > 0 ? diff : 0;
  }

  function getDaysLateForNextVisit(ctx) {
    if (isCompleted(ctx)) return 0;
    return getDaysLateForDueDate(getNextVisitDueDate(ctx)) || 0;
  }

  function getLabel(key, lang) {
    var pack = LABELS[lang] || LABELS.en;
    return pack[key] || LABELS.en[key] || key;
  }

  function statusFromDaysLate(daysLate, lang) {
    lang = lang || 'en';
    if (daysLate == null) return null;
    if (daysLate === 0) return { key: 'on_track', label: getLabel('on_track', lang) };
    if (daysLate <= 7) return { key: 'defaulted', label: getLabel('defaulted', lang) };
    if (daysLate <= 30) return { key: 'overdued', label: getLabel('overdued', lang) };
    return { key: 'dropped_out', label: getLabel('dropped_out', lang) };
  }

  function rowTrackingStatus(ctx, lang) {
    lang = lang || 'en';
    if (getCompleteAction(ctx)) {
      return { key: 'complete', label: getLabel('complete', lang) };
    }
    var daysLate = getDaysLateForNextVisit(ctx);
    var status = statusFromDaysLate(daysLate, lang);
    return status || { key: 'on_track', label: getLabel('on_track', lang) };
  }

  function isNotOnTrack(statusKey) {
    return statusKey === 'defaulted' || statusKey === 'overdued' || statusKey === 'dropped_out';
  }

  function isRegisteredPatient(patient) {
    if (!patient) return false;
    var s = String(patient.status || '').toLowerCase().trim();
    return !s || s === 'registered' || s === 'register';
  }

  function getCarePhase(patient) {
    if (!patient) return 'unknown';
    if (isRegisteredPatient(patient)) return 'registered';
    var s = String(patient.status || '').toLowerCase();
    if (s.indexOf('antenatal') !== -1 || s === 'anc') return 'antenatal';
    if (s.indexOf('birthed') !== -1) return 'birthed';
    if (s.indexOf('postnatal') !== -1 || s.indexOf('postpartum') !== -1) return 'postnatal';
    if (s.indexOf('labour') !== -1 || s.indexOf('in_labour') !== -1) return 'labour';
    if (s.indexOf('transfer') !== -1) return 'transfer';
    return s;
  }

  function isAntenatalPatient(patient) {
    return getCarePhase(patient) === 'antenatal';
  }

  function isNewbornFollowUpPatient(patient) {
    var phase = getCarePhase(patient);
    return phase === 'birthed' || phase === 'postnatal';
  }

  function pickManualDate(values) {
    for (var i = 0; i < values.length; i++) {
      var parsed = parseDateOnlyLocal(values[i]);
      if (parsed) return parsed;
    }
    return null;
  }

  function getNewbornFollowUpDueDate(patient, newbornCare) {
    var nb = newbornCare || {};
    return pickManualDate([
      nb.follow_up_appointment_date,
      patient && patient.newborn_follow_up_date,
      patient && patient.next_follow_up_date,
      patient && patient.next_action_type === 'newborn_follow_up' ? patient.next_action_date : null
    ]);
  }

  function getPncFollowUpDueDate(patient, pncVisits) {
    var latest = getLatestVisitData(pncVisits);
    var fromVisit = latest ? pickManualDate([
      latest.nextVisitDate,
      latest.next_visit_date,
      latest.followUpDate,
      latest.follow_up_date,
      latest.returnVisitDate,
      latest.return_visit_date
    ]) : null;
    if (fromVisit) return fromVisit;
    return pickManualDate([
      patient && patient.pnc_follow_up_date,
      patient && patient.next_pnc_visit_date,
      patient && patient.next_action_type === 'pnc_follow_up' ? patient.next_action_date : null
    ]);
  }

  function resolveDueDate(patient, options) {
    options = options || {};
    var phase = getCarePhase(patient);
    var ctx = buildContext(patient, options.visits || [], options.actions || []);

    if (phase === 'registered' || phase === 'labour' || phase === 'transfer' || phase === 'unknown') {
      return null;
    }

    if (phase === 'antenatal') {
      return getAncScheduleDueDate(ctx);
    }

    if (phase === 'birthed') {
      var newbornDue = getNewbornFollowUpDueDate(patient, options.newbornCare);
      if (newbornDue) return newbornDue;
      return getAncScheduleDueDate(ctx);
    }

    if (phase === 'postnatal') {
      var pncDue = getPncFollowUpDueDate(patient, options.pncVisits);
      if (pncDue) return pncDue;
      var nbDue = getNewbornFollowUpDueDate(patient, options.newbornCare);
      if (nbDue) return nbDue;
      return getAncScheduleDueDate(ctx);
    }

    return getAncScheduleDueDate(ctx);
  }

  function computeTrackingStatus(patient, visits, actions, lang) {
    return computePatientTrackingStatus(patient, { visits: visits, actions: actions }, lang);
  }

  function computePatientTrackingStatus(patient, options, lang) {
    options = options || {};
    lang = lang || 'en';

    if (isRegisteredPatient(patient)) return null;

    var phase = getCarePhase(patient);
    if (phase === 'labour' || phase === 'transfer') return null;

    var ctx = buildContext(patient, options.visits || [], options.actions || []);

    if (getCompleteAction(ctx)) {
      return {
        key: 'complete',
        label: getLabel('complete', lang),
        daysLate: 0,
        phase: phase
      };
    }

    var due = resolveDueDate(patient, options);
    if (!due) return null;

    var daysLate = getDaysLateForDueDate(due);
    var status = statusFromDaysLate(daysLate, lang);
    if (!status) return null;

    return {
      key: status.key,
      label: status.label,
      daysLate: daysLate,
      dueDate: formatDateYMD(due),
      phase: phase
    };
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
    getCompleteAction: getCompleteAction,
    isCompleted: isCompleted,
    getNextVisitDueDate: getNextVisitDueDate,
    getDaysLateForNextVisit: getDaysLateForNextVisit,
    rowTrackingStatus: rowTrackingStatus,
    isNotOnTrack: isNotOnTrack,
    isRegisteredPatient: isRegisteredPatient,
    getCarePhase: getCarePhase,
    isNewbornFollowUpPatient: isNewbornFollowUpPatient,
    isAntenatalPatient: isAntenatalPatient,
    computeTrackingStatus: computeTrackingStatus,
    computePatientTrackingStatus: computePatientTrackingStatus,
    resolveDueDate: resolveDueDate,
    shouldShowTrackingBadge: shouldShowTrackingBadge,
    getLabel: getLabel
  };
})(typeof window !== 'undefined' ? window : this);
