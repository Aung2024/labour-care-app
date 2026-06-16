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

  function formatPatientAge(p) {
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

  function countCompletedAncVisits(visits) {
    var maxNum = 0;
    (visits || []).forEach(function (v) {
      var data = v.data || v;
      var n = parseInt(data.visitNumber, 10);
      if (!isNaN(n) && n > maxNum) maxNum = n;
    });
    if (maxNum > 0) return Math.min(maxNum, 8);
    return Math.min((visits || []).length, 8);
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
    return Math.min((row.ancVisitCount || 0) + 1, 8);
  }

  function getFollowUpGraceDays(row) {
    return getNextAncVisitNumber(row) >= 5 ? 14 : 30;
  }

  function getNextVisitDueDate(row) {
    var latest = row.latestAnc;
    if (latest && (latest.nextVisitDate || latest.next_visit_date)) {
      var parsed = parseDateOnlyLocal(latest.nextVisitDate || latest.next_visit_date);
      if (parsed) return parsed;
    }
    var completed = row.ancVisitCount || 0;
    var nextVisitNum = completed + 1;
    if (nextVisitNum > 8) return null;
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

  function statusTrackHtml(completedCount, row) {
    var nextVisit = Math.min((completedCount || 0) + 1, 8);
    var status = rowTrackingStatus(row);
    var outcome = rowPatientOutcome(row);
    var completedOutcomeClass = outcome ? outcome.key : '';
    var dots = [];
    for (var i = 1; i <= 8; i++) {
      var cls = '';
      if (i <= completedCount) cls = 'visited' + (completedOutcomeClass ? ' ' + completedOutcomeClass : '');
      else if (i === nextVisit && completedCount < 8) {
        cls = status.key === 'overdue_followup' || status.key === 'lost_to_followup' ? status.key : 'next';
      }
      dots.push('<span class="hrt-track-dot ' + cls + '">' + i + '</span>');
    }
    return '<span class="hrt-status-track">' + dots.join('') + '</span>';
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
    var latest = row && row.latestAnc;
    var text = latest ? String(latest.clinicalNotes || latest.clinical_notes || '').trim() : '';
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

  async function fetchAncVisits(db, patientId) {
    var ref = db.collection('patients').doc(patientId).collection('antenatal_visits');
    var snap;
    try { snap = await ref.orderBy('visitDate', 'desc').limit(20).get(); }
    catch (e) {
      try { snap = await ref.orderBy('timestamp', 'desc').limit(20).get(); }
      catch (e2) { snap = await ref.limit(20).get(); }
    }
    var visits = [];
    if (snap && snap.docs) snap.docs.forEach(function (d) { visits.push({ id: d.id, data: d.data() || {} }); });
    return visits;
  }

  async function fetchHrtActions(db, patientId) {
    try {
      var snap = await db.collection('patients').doc(patientId).collection('hrt_actions')
        .orderBy('recordedAt', 'desc').limit(5).get();
      var list = [];
      if (snap && snap.docs) snap.docs.forEach(function (d) { list.push(d.data() || {}); });
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

  async function enrichTransferRow(db, transferReq) {
    var patientId = transferReq.patientId;
    if (!patientId) return null;
    var patientSnap = await db.collection('patients').doc(patientId).get();
    if (!patientSnap.exists) {
      return {
        transfer: transferReq,
        patient: { id: patientId, name: transferReq.patientName || 'Unknown' },
        factorsUnique: [],
        ancVisitCount: 0,
        latestAnc: null,
        visits: [],
        actions: []
      };
    }
    var patient = { id: patientSnap.id, ...patientSnap.data() };
    var visits = await fetchAncVisits(db, patientId);
    var actions = await fetchHrtActions(db, patientId);
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
      factorsUnique: uniqueStrings(factors),
      ancVisitCount: countCompletedAncVisits(visits),
      latestAnc: latestAnc || null,
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
          '<th class="col-pregnancy">Pregnancy</th>' +
          '<th class="col-danger">Danger signs</th>' +
          '<th class="col-anc-visits">ANC visits</th>' +
          '<th class="col-outcome">Outcome</th>' +
          '<th class="col-recommendation">Recommendation</th>' +
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
      var patientName = escapeHtml(p.name || p.patientName || '\u2014');
      var ageText = escapeHtml(formatPatientAge(p));
      var phone = phoneCellHtml(p);
      var preg = formatPregnancyCell(p, r.latestAnc);
      var completedVisits = r.ancVisitCount || 0;
      var transferStatus = (r.transfer && r.transfer.status) || 'pending';

      var trEl = document.createElement('tr');
      trEl.setAttribute('onclick', "SentTransferHrtView.openReport('" + escapeHtml(patientId) + "')");
      trEl.innerHTML =
        '<td><div class="hrt-patient-main">' + patientName + '</div><div class="hrt-patient-meta">' +
          'Age: ' + ageText + '<br>' + phone + '</div></td>' +
        '<td><div class="hrt-pregnancy-meta">' + escapeHtml(preg.line1) + '</div><div class="hrt-pregnancy-meta">' + escapeHtml(preg.line2) + '</div></td>' +
        '<td>' + compactRiskListHtml(r.factorsUnique || []) + '</td>' +
        '<td>' + statusTrackHtml(completedVisits, r) + '</td>' +
        '<td>' + statusCellHtml(r) + '</td>' +
        '<td>' + recommendationCellHtml(r) + '</td>' +
        '<td>' + smsContactHtml(p) + '</td>' +
        '<td>' + transferStatusHtml(transferStatus) + '</td>';
      desktopBody.appendChild(trEl);

      var card = document.createElement('div');
      card.className = 'hrt-mobile-card';
      card.setAttribute('onclick', "SentTransferHrtView.openReport('" + escapeHtml(patientId) + "')");
      card.innerHTML =
        '<div class="hrt-mobile-top">' +
          '<div><div class="hrt-mobile-name">' + patientName + '</div><div class="hrt-mobile-id">Age: ' + ageText + '<br>' + phone + '</div></div>' +
          '<div>' + transferStatusHtml(transferStatus) + '</div>' +
        '</div>' +
        '<div class="hrt-mobile-grid">' +
          '<div class="hrt-mobile-field"><span class="hrt-mobile-label">Pregnancy</span><div class="hrt-mobile-value">' + escapeHtml(preg.line1) + '<br>' + escapeHtml(preg.line2) + '</div></div>' +
          '<div class="hrt-mobile-field"><span class="hrt-mobile-label">ANC visits</span><div class="hrt-mobile-value">' + statusTrackHtml(completedVisits, r) + '</div></div>' +
          '<div class="hrt-mobile-field"><span class="hrt-mobile-label">Outcome</span><div class="hrt-mobile-value">' + statusCellHtml(r) + '</div></div>' +
          '<div class="hrt-mobile-field"><span class="hrt-mobile-label">Recommendation</span><div class="hrt-mobile-value">' + recommendationCellHtml(r) + '</div></div>' +
          '<div class="hrt-mobile-field hrt-mobile-wide"><span class="hrt-mobile-label">Danger signs</span><div class="hrt-mobile-value">' + compactRiskListHtml(r.factorsUnique || []) + '</div></div>' +
          '<div class="hrt-mobile-field hrt-mobile-wide"><span class="hrt-mobile-label">Communication</span><div class="hrt-mobile-value">' + smsContactHtml(p) + '</div></div>' +
        '</div>';
      mobileBody.appendChild(card);
    });
  }

  async function loadAndRender(containerEl, midwifeUid) {
    if (!containerEl || !midwifeUid) return;
    containerEl.innerHTML = '<div class="hrt-empty-state"><i class="fas fa-spinner fa-spin me-2"></i>Loading transferred patients...</div>';
    try {
      var db = firebase.firestore();
      var snap = await db.collection('patient_transfer_requests')
        .where('fromMidwifeId', '==', midwifeUid)
        .limit(100)
        .get();
      if (snap.empty) {
        containerEl.innerHTML = '<div class="hrt-empty-state">No transferred patients to show yet.</div>';
        return;
      }
      var transfers = [];
      snap.forEach(function (d) { transfers.push({ id: d.id, ...d.data() }); });
      transfers.sort(function (a, b) {
        var ta = a.createdAt && typeof a.createdAt.toDate === 'function' ? a.createdAt.toDate().getTime() : 0;
        var tb = b.createdAt && typeof b.createdAt.toDate === 'function' ? b.createdAt.toDate().getTime() : 0;
        return tb - ta;
      });

      var enriched = [];
      for (var i = 0; i < transfers.length; i++) {
        var row = await enrichTransferRow(db, transfers[i]);
        if (row) enriched.push(row);
      }
      renderRows(containerEl, enriched);
    } catch (e) {
      console.error('Sent transfer tracking failed', e);
      containerEl.innerHTML = '<div class="hrt-empty-state text-danger">Unable to load transferred patients: ' +
        escapeHtml(e.message || String(e)) + '</div>';
    }
  }

  global.SentTransferHrtView = {
    loadAndRender: loadAndRender,
    openReport: openAncReport
  };
})(typeof window !== 'undefined' ? window : this);
