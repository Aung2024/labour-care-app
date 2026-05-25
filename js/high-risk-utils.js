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

  global.HighRiskUtils = {
    visitRawData: visitRawData,
    isVisitHighRiskData: isVisitHighRiskData,
    isPatientHighRisk: isPatientHighRisk,
    getAutoDetectedRiskReasons: getAutoDetectedRiskReasons,
    getPatientRiskFactorsFromANC: getPatientRiskFactorsFromANC,
    parseVisitDateMs: parseVisitDateMs,
    getLatestAncVisitTimeMs: getLatestAncVisitTimeMs,
    getLatestAncVisitData: getLatestAncVisitData
  };
})(typeof window !== 'undefined' ? window : this);
