/**
 * High-risk pregnancy helpers.
 *
 * High-risk status is determined only from the ANC visit form
 * "High Risk Pregnancy Assessment" (high_risk = 'yes' on the latest visit).
 */
(function (global) {
  'use strict';

  function visitRawData(visit) {
    if (!visit || typeof visit !== 'object') return {};
    return visit.data !== undefined ? visit.data : visit;
  }

  function isVisitHighRiskData(data) {
    var hr = data.high_risk || data.highRisk;
    return hr === 'yes' || hr === 'Yes';
  }

  function parseVisitDateMs(data) {
    if (!data) return null;
    var t = data.visitDate || data.visit_date || data.timestamp || data.createdAt || data.created_at;
    if (t == null) return null;
    var d = t && typeof t.toDate === 'function' ? t.toDate() : new Date(t);
    if (!d || isNaN(d.getTime())) return null;
    return d.getTime();
  }

  function getLatestAncVisitTimeMs(patient) {
    var visits = (patient && patient.antenatalVisits) || [];
    var best = null;
    visits.forEach(function (v) {
      var ms = parseVisitDateMs(visitRawData(v));
      if (ms != null && (best == null || ms > best)) best = ms;
    });
    return best;
  }

  function getLatestAncVisitData(patient) {
    var visits = (patient && patient.antenatalVisits) || [];
    var bestMs = null;
    var bestData = null;
    visits.forEach(function (v) {
      var data = visitRawData(v);
      var ms = parseVisitDateMs(data);
      if (ms != null && (bestMs == null || ms > bestMs)) {
        bestMs = ms;
        bestData = data;
      }
    });
    return bestData;
  }

  /**
   * Patient is high risk when the latest ANC visit assessment is marked yes.
   */
  function isPatientHighRisk(patient) {
    if (!patient) return false;
    var latest = getLatestAncVisitData(patient);
    return !!(latest && isVisitHighRiskData(latest));
  }

  /**
   * Human-readable reasons from the latest ANC high-risk assessment.
   */
  function getAutoDetectedRiskReasons(patient) {
    var reasons = [];
    if (!patient) return reasons;
    var latest = getLatestAncVisitData(patient);
    if (!latest || !isVisitHighRiskData(latest)) return reasons;

    reasons.push('ANC assessment: high risk pregnancy');
    if (latest.risk_factors && Array.isArray(latest.risk_factors)) {
      latest.risk_factors.forEach(function (f) {
        if (f) reasons.push(String(f));
      });
    }
    if (latest.risk_notes && String(latest.risk_notes).trim()) {
      reasons.push('Notes: ' + String(latest.risk_notes).trim());
    }
    return reasons;
  }

  function getPatientRiskFactorsFromANC(patient) {
    var latest = getLatestAncVisitData(patient);
    if (!latest || !isVisitHighRiskData(latest)) return [];
    if (latest.risk_factors && Array.isArray(latest.risk_factors)) {
      return latest.risk_factors.slice();
    }
    return [];
  }

  /** Latest HRT action marked this case resolved (matches high-risk-tracking.html). */
  function isHrtResolved(actions) {
    if (!actions || !actions.length) return false;
    return actions[0].type === 'resolved';
  }

  function isRegionalOfficerRole(role) {
    if (!role || typeof role !== 'string') return false;
    return role === 'Regional Officer' || role.toLowerCase().replace(/\s+/g, ' ') === 'regional officer';
  }

  function mergePatientSnaps(snaps, patientMap) {
    var map = patientMap || new Map();
    (snaps || []).forEach(function (snap) {
      if (snap && typeof snap.forEach === 'function' && !snap.empty) {
        snap.forEach(function (doc) {
          if (doc && doc.id && doc.data && !map.has(doc.id)) {
            map.set(doc.id, { id: doc.id, data: doc.data() });
          }
        });
      }
    });
    return map;
  }

  function patientsFromMap(map) {
    var list = [];
    map.forEach(function (v) {
      list.push({ id: v.id, data: v.data });
    });
    return list;
  }

  /**
   * Load patients visible on the High Risk Tracking page for the user's role.
   * @param {object} options - { runQuery: async (query) => snapshot }
   */
  async function fetchPatientsForHrtRole(db, currentUser, userRole, options) {
    options = options || {};
    var runQuery = options.runQuery || function (q) { return q.get(); };
    var isIOS = options.preferCache != null ? options.preferCache : /iPhone|iPad|iPod/.test(navigator.userAgent);
    var qOpts = { preferCache: isIOS, timeout: 10000, retries: 2, fallbackToCache: true };
    var query = db.collection('patients');
    var allPatients = [];

    if (userRole === 'Midwife' || userRole === 'midwife' || !userRole) {
      var patientMap = new Map();
      var newSnap = await runQuery(db.collection('patients').where('created_by', '==', currentUser.uid), qOpts);
      var oldSnap = await runQuery(db.collection('patients').where('createdBy', '==', currentUser.uid), qOpts);
      var sharedSnap = await runQuery(
        db.collection('patients').where('care_team_midwife_ids', 'array-contains', currentUser.uid),
        qOpts
      );
      mergePatientSnaps([newSnap, oldSnap, sharedSnap], patientMap);
      allPatients = patientsFromMap(patientMap);
    } else if (userRole === 'Regional Officer' || isRegionalOfficerRole(userRole)) {
      var uDoc = await runQuery(db.collection('users').doc(currentUser.uid), qOpts);
      if (uDoc && uDoc.exists) {
        var reg = uDoc.data().region;
        if (reg) {
          var rs = await runQuery(query.where('region', '==', reg), qOpts);
          allPatients = patientsFromMap(mergePatientSnaps([rs], new Map()));
        }
      }
    } else if (userRole === 'TMO') {
      var uDoc2 = await runQuery(db.collection('users').doc(currentUser.uid), qOpts);
      if (uDoc2 && uDoc2.exists) {
        var tw = uDoc2.data().township;
        if (tw) {
          var ts = await runQuery(query.where('township', '==', tw), qOpts);
          allPatients = patientsFromMap(mergePatientSnaps([ts], new Map()));
        }
      }
    } else if (userRole === 'Super Admin' || userRole === 'admin') {
      var snapshot = await runQuery(query, qOpts);
      allPatients = patientsFromMap(mergePatientSnaps([snapshot], new Map()));
    }
    return allPatients;
  }

  async function fetchVisitsForHrtCheck(db, patientId, runQuery) {
    var ref = db.collection('patients').doc(patientId).collection('antenatal_visits');
    var snap;
    try {
      snap = await runQuery(ref.orderBy('visitDate', 'desc').limit(8));
    } catch (e) {
      try {
        snap = await runQuery(ref.orderBy('timestamp', 'desc').limit(8));
      } catch (e2) {
        snap = await runQuery(ref.limit(12));
      }
    }
    var visits = [];
    if (snap && snap.docs) {
      snap.docs.forEach(function (d) { visits.push({ id: d.id, data: d.data() || {} }); });
    }
    return visits;
  }

  async function fetchLatestHrtActions(db, patientId, runQuery) {
    try {
      var snap = await runQuery(
        db.collection('patients').doc(patientId).collection('hrt_actions').orderBy('recordedAt', 'desc').limit(1)
      );
      var list = [];
      if (snap && snap.docs) {
        snap.docs.forEach(function (d) { list.push(d.data() || {}); });
      }
      return list;
    } catch (e) {
      return [];
    }
  }

  /**
   * Count unresolved high-risk patients (bell badge = active follow-up on HRT page).
   */
  async function countActiveHrtAlerts(db, patients, options) {
    options = options || {};
    var runQuery = options.runQuery || function (q) { return q.get(); };
    var concurrency = options.concurrency || 4;
    var active = 0;

    async function checkOne(p) {
      var id = p.id;
      if (!id) return;
      try {
        var visits = await fetchVisitsForHrtCheck(db, id, runQuery);
        if (!isPatientHighRisk({ antenatalVisits: visits })) return;
        var actions = await fetchLatestHrtActions(db, id, runQuery);
        if (!isHrtResolved(actions)) active++;
      } catch (e) {
        /* skip patient on error */
      }
    }

    for (var i = 0; i < patients.length; i += concurrency) {
      var batch = patients.slice(i, i + concurrency);
      await Promise.all(batch.map(checkOne));
    }
    return active;
  }

  global.HighRiskUtils = {
    visitRawData: visitRawData,
    isVisitHighRiskData: isVisitHighRiskData,
    isPatientHighRisk: isPatientHighRisk,
    getAutoDetectedRiskReasons: getAutoDetectedRiskReasons,
    getPatientRiskFactorsFromANC: getPatientRiskFactorsFromANC,
    parseVisitDateMs: parseVisitDateMs,
    getLatestAncVisitTimeMs: getLatestAncVisitTimeMs,
    getLatestAncVisitData: getLatestAncVisitData,
    isHrtResolved: isHrtResolved,
    fetchPatientsForHrtRole: fetchPatientsForHrtRole,
    countActiveHrtAlerts: countActiveHrtAlerts
  };
})(typeof window !== 'undefined' ? window : this);
