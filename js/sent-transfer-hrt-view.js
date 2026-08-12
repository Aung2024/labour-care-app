/**
 * Read-only HRT-style register for patients the midwife has transferred out.
 * Used on patient-transfers.html — no action column; includes transfer acceptance status.
 */
(function (global) {
  'use strict';

  function escapeHtml(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
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

  function formatDateVal(v) {
    if (!v) return '\u2014';
    var d = parseDateOnlyLocal(v);
    if (!d) return String(v);
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }

  var ANC_DOT_COUNT = 8;
  var NEWBORN_DOT_COUNT = 4;

  function isBabyPatient(patient) {
    if (global.BabyPatientUtils && typeof BabyPatientUtils.isBabyPatient === 'function') {
      return BabyPatientUtils.isBabyPatient(patient);
    }
    var t = String((patient && patient.patient_type) || '').toLowerCase();
    return t === 'baby' || t === 'child' || t === 'newborn';
  }

  function formatPatientAge(p) {
    if (isBabyPatient(p) && global.BabyPatientUtils && typeof BabyPatientUtils.formatBabyAgeDisplay === 'function') {
      var babyAge = BabyPatientUtils.formatBabyAgeDisplay(p, 'en');
      if (babyAge && babyAge !== '-') return babyAge;
    }
    if (p.age != null && p.age !== '') return String(p.age) + ' yrs';
    return '\u2014';
  }

  function phoneCellHtml(patient) {
    var raw = String(patient.phone || patient.emergency_phone || patient.phoneNumber || '').trim();
    if (!raw) return '\u2014';
    var tel = raw.replace(/[^\d+]/g, '');
    if (!tel) return escapeHtml(raw);
    return '<a href="tel:' + escapeHtml(tel) + '" onclick="event.stopPropagation();">' + escapeHtml(raw) + '</a>';
  }

  function phoneHref(patient) {
    var raw = String(patient.phone || patient.emergency_phone || patient.phoneNumber || '').trim();
    var tel = raw.replace(/[^\d+]/g, '');
    return tel ? 'tel:' + tel : '';
  }

  function contactPatientForRow(row) {
    var p = row.patient || {};
    if (phoneHref(p)) return p;
    if (row.mother && phoneHref(row.mother)) return row.mother;
    return p;
  }

  function countCompletedAncVisits(visits) {
    var maxNum = 0;
    (visits || []).forEach(function (v) {
      var data = v.data || v;
      var n = parseInt(data.visitNumber, 10);
      if (!isNaN(n) && n > maxNum) maxNum = n;
    });
    if (maxNum > 0) return Math.min(maxNum, ANC_DOT_COUNT);
    return Math.min((visits || []).length, ANC_DOT_COUNT);
  }

  function countCompletedNewbornVisits(visits) {
    var maxNum = 0;
    (visits || []).forEach(function (v) {
      var data = v.data || v;
      var n = parseInt(data.visit_number != null ? data.visit_number : data.visitNumber, 10);
      if (!isNaN(n) && n > maxNum) maxNum = n;
    });
    if (maxNum > 0) return Math.min(maxNum, NEWBORN_DOT_COUNT);
    return Math.min((visits || []).length, NEWBORN_DOT_COUNT);
  }

  function birthDateStrForPatient(patient) {
    if (!patient) return null;
    var raw = patient.date_of_birth || patient.birth_time || patient.birthTime || null;
    if (!raw) return null;
    if (raw && typeof raw.toDate === 'function') raw = raw.toDate();
    if (raw instanceof Date) return formatDateYMD(raw);
    var s = String(raw).trim();
    if (s.indexOf('T') >= 0) s = s.split('T')[0];
    var m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? m[0] : null;
  }

  function isKnownLmpValue(lmp) {
    return !!(lmp && lmp !== 'unknown' && lmp !== 'Unknown' && lmp !== 'Not recorded');
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

  function getEffectiveLmp(row) {
    var patient = row.patient || {};
    if (isKnownLmpValue(patient.lmp)) return patient.lmp;
    var earliest = null;
    var earliestNum = 999;
    var any = null;
    (row.visits || []).forEach(function (v) {
      var data = v.data || v;
      if (!isKnownLmpValue(data.lmp) || data.lmpStatus === 'unknown') return;
      any = data.lmp;
      var n = parseInt(data.visitNumber, 10);
      if (isNaN(n)) n = 999;
      if (n < earliestNum) {
        earliestNum = n;
        earliest = data.lmp;
      }
    });
    return earliest || any || null;
  }

  function getNextAncVisitNumber(row) {
    return Math.min((row.ancVisitCount || 0) + 1, ANC_DOT_COUNT);
  }

  function getFollowUpGraceDays(row) {
    if (row.isBaby) return 7;
    return getNextAncVisitNumber(row) >= 5 ? 14 : 30;
  }

  function getRecommendedNewbornDate(birthDateStr, targetVisitNumber) {
    if (global.BirthDeliveryAnchor && typeof BirthDeliveryAnchor.getRecommendedCareDateForVisit === 'function') {
      return BirthDeliveryAnchor.getRecommendedCareDateForVisit(birthDateStr, targetVisitNumber);
    }
    var birth = parseDateOnlyLocal(birthDateStr);
    if (!birth || targetVisitNumber < 1 || targetVisitNumber > NEWBORN_DOT_COUNT) return null;
    if (targetVisitNumber === 1) return null;
    if (targetVisitNumber === 2) return formatDateYMD(addDaysLocal(birth, 3));
    if (targetVisitNumber === 3) return formatDateYMD(addDaysLocal(birth, 14));
    if (targetVisitNumber === 4) return formatDateYMD(addDaysLocal(birth, 42));
    return null;
  }

  function getNextNewbornVisitDueDate(row) {
    var latest = row.latestNewborn;
    if (latest && (latest.nextVisitDate || latest.next_visit_date)) {
      var parsed = parseDateOnlyLocal(latest.nextVisitDate || latest.next_visit_date);
      if (parsed) return parsed;
    }
    var completed = row.newbornVisitCount || 0;
    var nextVisitNum = completed + 1;
    if (nextVisitNum > NEWBORN_DOT_COUNT) return null;
    var birthStr = birthDateStrForPatient(row.patient || {});
    if (!birthStr) return null;
    var recommended = getRecommendedNewbornDate(birthStr, nextVisitNum);
    return recommended ? parseDateOnlyLocal(recommended) : null;
  }

  function getNextVisitDueDate(row) {
    if (row.isBaby) return getNextNewbornVisitDueDate(row);
    var latest = row.latestAnc;
    if (latest && (latest.nextVisitDate || latest.next_visit_date)) {
      var parsed = parseDateOnlyLocal(latest.nextVisitDate || latest.next_visit_date);
      if (parsed) return parsed;
    }
    var completed = row.ancVisitCount || 0;
    var nextVisitNum = completed + 1;
    if (nextVisitNum > ANC_DOT_COUNT) return null;
    var lmp = getEffectiveLmp(row);
    if (lmp) {
      var recommended = getRecommendedDateForVisitNumber(lmp, nextVisitNum);
      return recommended ? parseDateOnlyLocal(recommended) : null;
    }
    return null;
  }

  function getCompleteAction(row) {
    if (!row.actions || !row.actions.length) return null;
    for (var i = 0; i < row.actions.length; i++) {
      var a = row.actions[i];
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

  function isCompleted(row) {
    return !!getCompleteAction(row);
  }

  function getDaysLateForNextVisit(row) {
    if (isCompleted(row)) return 0;
    var due = getNextVisitDueDate(row);
    if (!due) return null;
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.floor((today.getTime() - due.getTime()) / 86400000);
  }

  function rowTrackingStatus(row) {
    if (getCompleteAction(row)) {
      return { key: 'complete', label: 'Complete' };
    }
    if (row.isBaby && (row.newbornVisitCount || 0) >= NEWBORN_DOT_COUNT) {
      return { key: 'complete', label: 'Complete' };
    }
    var daysLate = getDaysLateForNextVisit(row);
    if (daysLate == null || daysLate < 0) return { key: 'on_track', label: 'Active follow-up' };
    if (daysLate <= getFollowUpGraceDays(row)) return { key: 'overdue_followup', label: 'Overdue follow-up' };
    return { key: 'lost_to_followup', label: 'Defaulter/lost' };
  }

  function rowPatientOutcome(row) {
    var completeAction = getCompleteAction(row);
    if (!completeAction) return null;
    var outcome = completeAction.outcome || completeAction.resolvedReason;
    if (outcome === 'death' || completeAction.resolvedReason === 'death') return { key: 'death', label: 'Death' };
    if (outcome === 'transfer' || completeAction.resolvedReason === 'transferred') return { key: 'transfer', label: 'Transfer' };
    return { key: 'alive', label: 'Alive' };
  }

  function statusBadgeHtml(status) {
    return '<span class="hrt-outcome-badge hrt-outcome-' + status.key + '"><i class="fas fa-circle"></i>' +
      escapeHtml(status.label) + '</span>';
  }

  function outcomeBadgeHtml(outcome) {
    if (!outcome) return '';
    return '<span class="hrt-outcome-badge hrt-outcome-' + outcome.key + ' mt-1"><i class="fas fa-heart-pulse"></i>' +
      escapeHtml(outcome.label) + '</span>';
  }

  function statusTrackHtml(completedCount, row, options) {
    options = options || {};
    var maxDots = row.isBaby ? NEWBORN_DOT_COUNT : ANC_DOT_COUNT;
    var nextVisit = Math.min((completedCount || 0) + 1, maxDots);
    var status = rowTrackingStatus(row);
    var outcome = rowPatientOutcome(row);
    var completedOutcomeClass = outcome ? outcome.key : '';
    var dots = [];
    for (var i = 1; i <= maxDots; i++) {
      var cls = '';
      if (i <= completedCount) cls = 'visited' + (completedOutcomeClass ? ' ' + completedOutcomeClass : '');
      else if (i === nextVisit && completedCount < maxDots) {
        cls = status.key === 'overdue_followup' || status.key === 'lost_to_followup' ? status.key : 'next';
      }
      dots.push('<span class="hrt-track-dot ' + cls + '">' + i + '</span>');
    }
    var track = '<span class="hrt-status-track">' + dots.join('') + '</span>';
    if (options.hideLabel) return track;
    var label = row.isBaby ? 'Newborn visits' : 'ANC visits';
    return '<div class="hrt-visit-track-wrap">' +
      '<div class="hrt-visit-track-label">' + escapeHtml(label) + '</div>' +
      track + '</div>';
  }

  function currentGaFromLatestAnc(latestAnc) {
    if (!latestAnc || latestAnc.gestationalAge == null) return null;
    var ga = parseFloat(latestAnc.gestationalAge);
    if (isNaN(ga)) return null;
    var ms = global.HighRiskUtils ? global.HighRiskUtils.parseVisitDateMs(latestAnc) : null;
    if (ms != null) {
      ga += Math.max(0, Math.floor((Date.now() - ms) / 86400000)) / 7;
    }
    return Math.round(ga * 10) / 10;
  }

  function formatPregnancyCell(p, latestAnc) {
    var gravida = p.gravida || p.gravida_value;
    var parity = p.parity != null && p.parity !== '' ? p.parity : '\u2014';
    var gp = 'G' + (gravida != null && gravida !== '' ? gravida : '\u2014') + ' P' + parity;
    var currentGa = currentGaFromLatestAnc(latestAnc);
    var ga = currentGa != null ? String(currentGa) + 'w' : (p.gestational_age != null ? String(p.gestational_age) + 'w' : '\u2014');
    var edd = formatDateVal(p.edd);
    return {
      line1: 'G/P: ' + gp,
      line2: 'GA: ' + ga + ' \u00b7 EDD: ' + edd
    };
  }

  function formatBabyInfoCell(p, mother) {
    var ageText = formatPatientAge(p);
    var weight = p.birth_weight || p.birthWeight || p.weight_at_birth || '';
    var motherName = (mother && (mother.name || mother.patientName)) ||
      p.mother_name || p.motherName || '\u2014';
    var line2 = 'Mother: ' + motherName;
    if (weight !== '' && weight != null) line2 += ' \u00b7 BW: ' + weight + 'g';
    return {
      line1: 'Baby \u00b7 Age: ' + ageText,
      line2: line2
    };
  }

  function detailsCellForRow(row) {
    if (row.isBaby) return formatBabyInfoCell(row.patient || {}, row.mother || null);
    return formatPregnancyCell(row.patient || {}, row.latestAnc);
  }

  function reportLinksHtml(row) {
    var p = row.patient || {};
    var patientId = p.id || '';
    if (!patientId) return '';
    if (!row.isBaby) return '';
    var motherId = p.mother_patient_id || (row.mother && row.mother.id) || '';
    var html = '<div class="hrt-report-actions" onclick="event.stopPropagation();">';
    if (motherId) {
      html += '<button type="button" class="hrt-report-btn" onclick="SentTransferHrtView.openMotherReport(\'' +
        escapeHtml(motherId) + '\')"><i class="fas fa-user-injured"></i> Mother report</button>';
    }
    html += '<button type="button" class="hrt-report-btn hrt-report-btn-primary" onclick="SentTransferHrtView.openNewbornReport(\'' +
      escapeHtml(patientId) + '\')"><i class="fas fa-baby"></i> Newborn report</button>';
    html += '</div>';
    return html;
  }

  function humanizeRiskLabel(s) {
    var t = String(s == null ? '' : s).trim();
    if (!t) return t;
    if (/_/.test(t)) return t.replace(/_/g, ' ').replace(/\b\w/g, function (ch) { return ch.toUpperCase(); });
    return t;
  }

  function compactRiskListHtml(risks) {
    if (!risks || !risks.length) return '<span class="text-muted">\u2014</span>';
    return risks.slice(0, 4).map(function (r) {
      return '<span class="hrt-pill">' + escapeHtml(humanizeRiskLabel(r)) + '</span>';
    }).join(' ');
  }

  function statusCellHtml(row) {
    var status = rowTrackingStatus(row);
    var outcome = rowPatientOutcome(row);
    return statusBadgeHtml(status) + (outcome ? '<div>' + outcomeBadgeHtml(outcome) + '</div>' : '');
  }

  function recommendationCellHtml(row) {
    var latest = row && (row.isBaby ? row.latestNewborn : row.latestAnc);
    var text = latest ? String(latest.clinicalNotes || latest.clinical_notes || latest.notes || '').trim() : '';
    if (!text) return '<span class="text-muted">No recommendation</span>';
    return '<div class="hrt-recommendation-text" title="' + escapeHtml(text) + '">' + escapeHtml(text) + '</div>';
  }

  function smsContactHtml(patient) {
    var html = '<div class="hrt-sms-contact">' +
      '<span class="hrt-sms-pill"><i class="fas fa-comment"></i> SMS</span>';
    var href = phoneHref(patient);
    if (href) {
      html += '<a class="hrt-phone-call-btn" href="' + escapeHtml(href) + '" onclick="event.stopPropagation();" aria-label="Call patient">' +
        '<i class="fas fa-phone"></i></a>';
    }
    html += '</div>';
    return html;
  }

  function transferStatusHtml(transferStatus) {
    var accepted = transferStatus === 'accepted';
    var cls = accepted ? 'accepted' : 'pending';
    var label = accepted ? 'Accepted' : 'Not Accepted yet';
    return '<span class="hrt-transfer-status ' + cls + '">' + escapeHtml(label) + '</span>';
  }

  function openAncReport(patientId) {
    global.location.href = 'antenatal-report.html?patient=' + encodeURIComponent(patientId);
  }

  function openNewbornReport(patientId) {
    global.location.href = 'newborn-report.html?patient=' + encodeURIComponent(patientId);
  }

  function openMotherReport(patientId) {
    global.location.href = 'overall-patient-report.html?patient=' + encodeURIComponent(patientId);
  }

  function openReport(patientId, isBaby) {
    if (isBaby) openNewbornReport(patientId);
    else openAncReport(patientId);
  }

  var MAX_TRANSFER_ROWS = 40;
  var ENRICH_CONCURRENCY = 8;
  var CACHE_TTL_MS = 180000;
  var ANC_VISIT_LIMIT = 10;
  var NEWBORN_VISIT_LIMIT = 8;

  function getUtils() {
    return global.TransferLoadUtils || {};
  }

  function smartQuery(queryPromise, options) {
    var utils = getUtils();
    if (utils.smartQuery) return utils.smartQuery(queryPromise, options);
    return queryPromise.then(function (q) { return q.get(); });
  }

  function cacheKey(uid) {
    return 'sentTransferHrt:v2:' + uid;
  }

  function snapToVisitList(snap) {
    var visits = [];
    if (snap && snap.docs) snap.docs.forEach(function (d) { visits.push({ id: d.id, data: d.data() || {} }); });
    else if (snap && typeof snap.forEach === 'function') snap.forEach(function (d) { visits.push({ id: d.id, data: d.data() || {} }); });
    return visits;
  }

  async function fetchAncVisits(db, patientId) {
    var ref = db.collection('patients').doc(patientId).collection('antenatal_visits');
    var snap;
    try {
      snap = await smartQuery(Promise.resolve(ref.orderBy('visitDate', 'desc').limit(ANC_VISIT_LIMIT)), { timeout: 8000, retries: 1 });
    } catch (e) {
      try {
        snap = await smartQuery(Promise.resolve(ref.orderBy('timestamp', 'desc').limit(ANC_VISIT_LIMIT)), { timeout: 8000, retries: 1 });
      } catch (e2) {
        snap = await smartQuery(Promise.resolve(ref.limit(ANC_VISIT_LIMIT)), { timeout: 8000, retries: 1 });
      }
    }
    return snapToVisitList(snap);
  }

  async function fetchNewbornVisits(db, patientId) {
    var ref = db.collection('patients').doc(patientId).collection('newborn_care');
    var snap;
    try {
      snap = await smartQuery(Promise.resolve(ref.orderBy('visitDate', 'desc').limit(NEWBORN_VISIT_LIMIT)), { timeout: 8000, retries: 1 });
    } catch (e) {
      try {
        snap = await smartQuery(Promise.resolve(ref.orderBy('visit_number', 'desc').limit(NEWBORN_VISIT_LIMIT)), { timeout: 8000, retries: 1 });
      } catch (e2) {
        try {
          snap = await smartQuery(Promise.resolve(ref.orderBy('timestamp', 'desc').limit(NEWBORN_VISIT_LIMIT)), { timeout: 8000, retries: 1 });
        } catch (e3) {
          snap = await smartQuery(Promise.resolve(ref.limit(NEWBORN_VISIT_LIMIT)), { timeout: 8000, retries: 1 });
        }
      }
    }
    return snapToVisitList(snap);
  }

  async function fetchPatientDoc(db, patientId) {
    if (!patientId) return null;
    try {
      var snap = await smartQuery(Promise.resolve(db.collection('patients').doc(patientId)), { timeout: 8000, retries: 1 });
      if (!snap || !snap.exists) return null;
      var data = snap.data() || {};
      data.id = snap.id || patientId;
      return data;
    } catch (e) {
      return null;
    }
  }

  async function fetchHrtActions(db, patientId) {
    try {
      var snap = await smartQuery(
        Promise.resolve(db.collection('patients').doc(patientId).collection('hrt_actions')
          .orderBy('recordedAt', 'desc').limit(5)),
        { timeout: 8000, retries: 1 }
      );
      var list = [];
      if (snap && snap.docs) snap.docs.forEach(function (d) { list.push(d.data() || {}); });
      else if (snap && typeof snap.forEach === 'function') snap.forEach(function (d) { list.push(d.data() || {}); });
      return list;
    } catch (e) {
      return [];
    }
  }

  function uniqueStrings(arr) {
    var seen = new Set();
    var out = [];
    (arr || []).forEach(function (x) {
      var s = x == null ? '' : String(x).trim();
      if (s && !seen.has(s)) { seen.add(s); out.push(s); }
    });
    return out;
  }

  async function enrichTransferRow(db, transferReq, patientMap) {
    var patientId = transferReq.patientId;
    if (!patientId) return null;

    var patient = patientMap.get(patientId);
    if (!patient) {
      return {
        transfer: transferReq,
        patient: {
          id: patientId,
          name: transferReq.patientName || 'Unknown',
          patient_unique_id: transferReq.patientUniqueId || transferReq.patient_unique_id || ''
        },
        isBaby: false,
        mother: null,
        factorsUnique: [],
        ancVisitCount: 0,
        newbornVisitCount: 0,
        latestAnc: null,
        latestNewborn: null,
        visits: [],
        actions: []
      };
    }

    var isBaby = isBabyPatient(patient);
    var visits = [];
    var actions = [];
    var mother = null;

    try {
      if (isBaby) {
        var motherId = patient.mother_patient_id || '';
        var babyPair = await Promise.all([
          fetchNewbornVisits(db, patientId),
          fetchHrtActions(db, patientId),
          motherId ? fetchPatientDoc(db, motherId) : Promise.resolve(null)
        ]);
        visits = babyPair[0] || [];
        actions = babyPair[1] || [];
        mother = babyPair[2] || null;
        if (mother && !mother.id) mother.id = motherId;

        var latestNewborn = visits.length ? (visits[0].data || visits[0]) : null;
        return {
          transfer: transferReq,
          patient: patient,
          isBaby: true,
          mother: mother,
          factorsUnique: [],
          ancVisitCount: 0,
          newbornVisitCount: countCompletedNewbornVisits(visits),
          latestAnc: null,
          latestNewborn: latestNewborn,
          visits: visits,
          actions: actions
        };
      }

      var pair = await Promise.all([
        fetchAncVisits(db, patientId),
        fetchHrtActions(db, patientId)
      ]);
      visits = pair[0];
      actions = pair[1];
    } catch (e) {
      visits = [];
      actions = [];
    }

    var bundle = { antenatalVisits: visits };
    var factors = global.HighRiskUtils
      ? global.HighRiskUtils.getPatientRiskFactorsFromANC(bundle)
      : [];
    var latestAnc = global.HighRiskUtils
      ? global.HighRiskUtils.getLatestAncVisitData(bundle)
      : null;
    return {
      transfer: transferReq,
      patient: patient,
      isBaby: false,
      mother: null,
      factorsUnique: uniqueStrings(factors),
      ancVisitCount: countCompletedAncVisits(visits),
      newbornVisitCount: 0,
      latestAnc: latestAnc || null,
      latestNewborn: null,
      visits: visits,
      actions: actions
    };
  }

  function renderRows(container, rows) {
    if (!rows.length) {
      container.innerHTML = '<div class="hrt-empty-state">No transferred patients to show yet.</div>';
      return;
    }

    container.innerHTML =
      '<div class="hrt-register-wrap">' +
        '<div class="hrt-register-desktop"><table class="hrt-register-table"><thead><tr>' +
          '<th class="col-name">Name</th>' +
          '<th class="col-pregnancy">Details</th>' +
          '<th class="col-danger">Danger signs</th>' +
          '<th class="col-anc-visits">Visits</th>' +
          '<th class="col-outcome">Outcome</th>' +
          '<th class="col-recommendation">Recommendation</th>' +
          '<th class="col-reports">Reports</th>' +
          '<th class="col-sms">Communication</th>' +
          '<th class="col-transfer">Transfer status</th>' +
        '</tr></thead><tbody id="sentTransferDesktopBody"></tbody></table></div>' +
        '<div class="hrt-mobile-register" id="sentTransferMobileBody"></div>' +
      '</div>';

    var desktopBody = document.getElementById('sentTransferDesktopBody');
    var mobileBody = document.getElementById('sentTransferMobileBody');

    rows.forEach(function (r) {
      var p = r.patient || {};
      var patientId = p.id || '';
      var isBaby = !!r.isBaby;
      var patientName = escapeHtml(p.name || p.patientName || '\u2014');
      var ageText = escapeHtml(formatPatientAge(p));
      var contact = contactPatientForRow(r);
      var phone = phoneCellHtml(contact);
      var details = detailsCellForRow(r);
      var completedVisits = isBaby ? (r.newbornVisitCount || 0) : (r.ancVisitCount || 0);
      var transferStatus = (r.transfer && r.transfer.status) || 'pending';
      var detailsLabel = isBaby ? 'Baby' : 'Pregnancy';
      var visitsLabel = isBaby ? 'Newborn visits' : 'ANC visits';
      var reportsHtml = reportLinksHtml(r);
      var openFn = "SentTransferHrtView.openReport('" + escapeHtml(patientId) + "', " + (isBaby ? 'true' : 'false') + ")";

      var trEl = document.createElement('tr');
      trEl.setAttribute('onclick', openFn);
      trEl.innerHTML =
        '<td><div class="hrt-patient-main">' + patientName +
          (isBaby ? ' <span class="hrt-baby-tag">Baby</span>' : '') +
          '</div><div class="hrt-patient-meta">' +
          'Age: ' + ageText + '<br>' + phone + '</div></td>' +
        '<td><div class="hrt-pregnancy-meta">' + escapeHtml(details.line1) + '</div><div class="hrt-pregnancy-meta">' + escapeHtml(details.line2) + '</div></td>' +
        '<td>' + compactRiskListHtml(r.factorsUnique || []) + '</td>' +
        '<td>' + statusTrackHtml(completedVisits, r) + '</td>' +
        '<td>' + statusCellHtml(r) + '</td>' +
        '<td>' + recommendationCellHtml(r) + '</td>' +
        '<td>' + (reportsHtml || '<span class="text-muted">\u2014</span>') + '</td>' +
        '<td>' + smsContactHtml(contact) + '</td>' +
        '<td>' + transferStatusHtml(transferStatus) + '</td>';
      desktopBody.appendChild(trEl);

      var card = document.createElement('div');
      card.className = 'hrt-mobile-card';
      card.setAttribute('onclick', openFn);
      card.innerHTML =
        '<div class="hrt-mobile-top">' +
          '<div><div class="hrt-mobile-name">' + patientName +
            (isBaby ? ' <span class="hrt-baby-tag">Baby</span>' : '') +
            '</div><div class="hrt-mobile-id">Age: ' + ageText + '<br>' + phone + '</div></div>' +
          '<div>' + transferStatusHtml(transferStatus) + '</div>' +
        '</div>' +
        '<div class="hrt-mobile-grid">' +
          '<div class="hrt-mobile-field"><span class="hrt-mobile-label">' + escapeHtml(detailsLabel) + '</span><div class="hrt-mobile-value">' + escapeHtml(details.line1) + '<br>' + escapeHtml(details.line2) + '</div></div>' +
          '<div class="hrt-mobile-field"><span class="hrt-mobile-label">' + escapeHtml(visitsLabel) + '</span><div class="hrt-mobile-value">' + statusTrackHtml(completedVisits, r, { hideLabel: true }) + '</div></div>' +
          '<div class="hrt-mobile-field"><span class="hrt-mobile-label">Outcome</span><div class="hrt-mobile-value">' + statusCellHtml(r) + '</div></div>' +
          '<div class="hrt-mobile-field"><span class="hrt-mobile-label">Recommendation</span><div class="hrt-mobile-value">' + recommendationCellHtml(r) + '</div></div>' +
          '<div class="hrt-mobile-field hrt-mobile-wide"><span class="hrt-mobile-label">Danger signs</span><div class="hrt-mobile-value">' + compactRiskListHtml(r.factorsUnique || []) + '</div></div>' +
          (reportsHtml
            ? '<div class="hrt-mobile-field hrt-mobile-wide"><span class="hrt-mobile-label">Reports</span><div class="hrt-mobile-value">' + reportsHtml + '</div></div>'
            : '') +
          '<div class="hrt-mobile-field hrt-mobile-wide"><span class="hrt-mobile-label">Communication</span><div class="hrt-mobile-value">' + smsContactHtml(contact) + '</div></div>' +
        '</div>';
      mobileBody.appendChild(card);
    });
  }

  async function loadAndRender(containerEl, midwifeUid) {
    if (!containerEl || !midwifeUid) return;
    var utils = getUtils();
    var cached = utils.cacheRead ? utils.cacheRead(cacheKey(midwifeUid), CACHE_TTL_MS) : null;
    if (cached && cached.length) {
      renderRows(containerEl, cached);
    } else {
      containerEl.innerHTML = '<div class="hrt-empty-state"><i class="fas fa-spinner fa-spin me-2"></i>Loading transferred patients...</div>';
    }

    try {
      var db = firebase.firestore();
      var snap = await smartQuery(
        Promise.resolve(db.collection('patient_transfer_requests')
          .where('fromMidwifeId', '==', midwifeUid)
          .limit(MAX_TRANSFER_ROWS)),
        { timeout: 10000, retries: 2 }
      );

      if (!snap || snap.empty) {
        containerEl.innerHTML = '<div class="hrt-empty-state">No transferred patients to show yet.</div>';
        if (utils.cacheWrite) utils.cacheWrite(cacheKey(midwifeUid), []);
        return;
      }

      var transfers = [];
      if (snap.forEach) snap.forEach(function (d) { transfers.push({ id: d.id, ...d.data() }); });
      else if (snap.docs) snap.docs.forEach(function (d) { transfers.push({ id: d.id, ...d.data() }); });

      transfers.sort(function (a, b) {
        var ta = a.createdAt && typeof a.createdAt.toDate === 'function' ? a.createdAt.toDate().getTime() : 0;
        var tb = b.createdAt && typeof b.createdAt.toDate === 'function' ? b.createdAt.toDate().getTime() : 0;
        return tb - ta;
      });
      transfers = transfers.slice(0, MAX_TRANSFER_ROWS);

      var patientIds = transfers.map(function (t) { return t.patientId; }).filter(Boolean);
      var patientMap = utils.batchGetPatientDocs
        ? await utils.batchGetPatientDocs(db, patientIds)
        : new Map();

      var mapFn = utils.mapWithConcurrency || async function (items, limit, fn) {
        return Promise.all(items.map(fn));
      };

      var enriched = await mapFn(transfers, ENRICH_CONCURRENCY, function (t) {
        return enrichTransferRow(db, t, patientMap);
      });
      enriched = enriched.filter(Boolean);

      if (utils.cacheWrite) utils.cacheWrite(cacheKey(midwifeUid), enriched);
      renderRows(containerEl, enriched);
    } catch (e) {
      console.error('Sent transfer tracking failed', e);
      if (!cached || !cached.length) {
        containerEl.innerHTML = '<div class="hrt-empty-state text-danger">Unable to load transferred patients: ' +
          escapeHtml(e.message || String(e)) + '</div>';
      }
    }
  }

  global.SentTransferHrtView = {
    loadAndRender: loadAndRender,
    openReport: openReport,
    openAncReport: openAncReport,
    openNewbornReport: openNewbornReport,
    openMotherReport: openMotherReport
  };
})(typeof window !== 'undefined' ? window : this);
