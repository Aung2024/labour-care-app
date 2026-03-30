/**
 * High-risk pregnancy helpers — ANC visit data only (high_risk on antenatal_visits).
 * Visits may be { id, data } (dashboard) or flat { id, ...fields } (Firestore-mapped).
 */
(function (global) {
  'use strict';

  function visitRawData(visit) {
    if (!visit || typeof visit !== 'object') return {};
    return visit.data !== undefined ? visit.data : visit;
  }

  function isVisitHighRiskData(data) {
    const hr = data.high_risk || data.highRisk;
    return hr === 'yes' || hr === 'Yes';
  }

  function isPatientHighRisk(patient) {
    const visits = (patient && patient.antenatalVisits) || [];
    return visits.some(function (v) {
      return isVisitHighRiskData(visitRawData(v));
    });
  }

  function getPatientRiskFactorsFromANC(patient) {
    const visits = (patient && patient.antenatalVisits) || [];
    const factors = [];
    visits.forEach(function (v) {
      const data = visitRawData(v);
      if (isVisitHighRiskData(data) && data.risk_factors && Array.isArray(data.risk_factors)) {
        factors.push.apply(factors, data.risk_factors);
      }
    });
    return factors;
  }

  function parseVisitDateMs(data) {
    if (!data) return null;
    var t = data.visitDate || data.visit_date || data.timestamp || data.createdAt || data.created_at;
    if (t == null) return null;
    var d = t && typeof t.toDate === 'function' ? t.toDate() : new Date(t);
    if (!d || isNaN(d.getTime())) return null;
    return d.getTime();
  }

  /** Latest visit time across all ANC visits (ms), or null */
  function getLatestAncVisitTimeMs(patient) {
    var visits = (patient && patient.antenatalVisits) || [];
    var best = null;
    visits.forEach(function (v) {
      var ms = parseVisitDateMs(visitRawData(v));
      if (ms != null && (best == null || ms > best)) best = ms;
    });
    return best;
  }

  /** Visit with latest date; raw `data` object or null */
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

  global.HighRiskUtils = {
    visitRawData: visitRawData,
    isVisitHighRiskData: isVisitHighRiskData,
    isPatientHighRisk: isPatientHighRisk,
    getPatientRiskFactorsFromANC: getPatientRiskFactorsFromANC,
    parseVisitDateMs: parseVisitDateMs,
    getLatestAncVisitTimeMs: getLatestAncVisitTimeMs,
    getLatestAncVisitData: getLatestAncVisitData
  };
})(typeof window !== 'undefined' ? window : this);
