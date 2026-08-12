/**
 * High-risk pregnancy helpers.
 *
 * High-risk status is determined from the ANC visit form
 * "High Risk Pregnancy Assessment". A positive assessment on any visit
 * (including Visit 2 onward) keeps the patient in high-risk tracking.
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
   * Most recent ANC visit that was explicitly assessed as high risk.
   * Visit number breaks ties when multiple records share the same date.
   */
  function getLatestHighRiskAncVisitData(patient) {
    var visits = (patient && patient.antenatalVisits) || [];
    var bestMs = null;
    var bestVisitNumber = -1;
    var bestData = null;
    visits.forEach(function (v) {
      var data = visitRawData(v);
      if (!isVisitHighRiskData(data)) return;
      var ms = parseVisitDateMs(data);
      var visitNumber = parseInt(data.visitNumber || data.visit_number, 10);
      if (isNaN(visitNumber)) visitNumber = 0;
      if (
        bestData == null ||
        (ms != null && (bestMs == null || ms > bestMs)) ||
        (ms === bestMs && visitNumber > bestVisitNumber)
      ) {
        bestMs = ms;
        bestVisitNumber = visitNumber;
        bestData = data;
      }
    });
    return bestData;
  }

  /**
   * Patient is high risk when any ANC visit assessment is marked yes.
   */
  function isPatientHighRisk(patient) {
    if (!patient) return false;
    return !!getLatestHighRiskAncVisitData(patient);
  }

  /**
   * Human-readable reasons from the latest ANC high-risk assessment.
   */
  function getAutoDetectedRiskReasons(patient) {
    var reasons = [];
    if (!patient) return reasons;
    var latest = getLatestHighRiskAncVisitData(patient);
    if (!latest) return reasons;

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
    var latest = getLatestHighRiskAncVisitData(patient);
    if (!latest) return [];
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
    getLatestHighRiskAncVisitData: getLatestHighRiskAncVisitData,
    parseVisitDateMs: parseVisitDateMs,
    getLatestAncVisitTimeMs: getLatestAncVisitTimeMs,
    getLatestAncVisitData: getLatestAncVisitData
  };
})(typeof window !== 'undefined' ? window : this);
