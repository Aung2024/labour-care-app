/**
 * High-risk pregnancy helpers.
 *
 * Determines high-risk status from multiple data sources:
 *   1. Manual checkbox on ANC visit (high_risk = 'yes')
 *   2. Registration data: maternal age <18 or >=40, documented risk factors
 *   3. ANC clinical findings: BP >= 140/90, anemia, danger signs,
 *      urine protein/sugar positive
 *
 * The bundle object passed to isPatientHighRisk should contain:
 *   { antenatalVisits: [...], registration: patientDoc }
 * If registration is omitted, only ANC-based checks run (backward compat).
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

  function parseBloodPressure(str) {
    if (!str || typeof str !== 'string') return null;
    var m = str.trim().match(/^(\d+)\s*\/\s*(\d+)/);
    if (!m) return null;
    return { sys: parseInt(m[1], 10), dia: parseInt(m[2], 10) };
  }

  /**
   * Check if a single ANC visit has acute clinical findings
   * that indicate high risk, regardless of the manual checkbox.
   */
  function hasAcuteClinicalRisk(data) {
    if (!data) return false;

    if (data.dangerSignsPresent === 'yes' || data.dangerSignsPresent === 'Yes') return true;

    var bp = parseBloodPressure(data.bloodPressure);
    if (bp && (bp.sys >= 140 || bp.dia >= 90)) return true;

    if (data.anemiaStatus === 'Yes' || data.anemiaStatus === 'yes') return true;

    var up = (data.urineProtein || '').toLowerCase();
    if (up.indexOf('++') !== -1 || up === 'positive' || up === 'trace++') return true;

    var us = (data.urineSugar || '').toLowerCase();
    if (us.indexOf('++') !== -1 || us === 'positive') return true;

    if (data.referral === 'Yes' || data.referral === 'yes') return true;

    return false;
  }

  /**
   * Check if registration-level data indicates high risk.
   */
  function hasRegistrationRisk(reg) {
    if (!reg) return false;

    if (reg.high_risk === 'yes' || reg.high_risk === true) return true;

    if (Array.isArray(reg.risk_factors) && reg.risk_factors.length > 0) return true;

    var age = parseInt(reg.age, 10);
    if (!isNaN(age) && (age < 18 || age >= 40)) return true;

    var gravida = parseInt(reg.gravida, 10);
    if (!isNaN(gravida) && gravida >= 5) return true;

    return false;
  }

  /**
   * Determine if a patient is high risk.
   *
   * @param {Object} patient  Bundle with:
   *   - antenatalVisits: array of visit objects
   *   - registration: (optional) patient document fields
   * @returns {boolean}
   */
  function isPatientHighRisk(patient) {
    if (!patient) return false;
    var visits = patient.antenatalVisits || [];

    // Check 1: manual checkbox on any ANC visit
    for (var i = 0; i < visits.length; i++) {
      if (isVisitHighRiskData(visitRawData(visits[i]))) return true;
    }

    // Check 2: registration-level risk data
    if (hasRegistrationRisk(patient.registration)) return true;

    // Check 3: acute clinical findings on any ANC visit
    for (var j = 0; j < visits.length; j++) {
      if (hasAcuteClinicalRisk(visitRawData(visits[j]))) return true;
    }

    return false;
  }

  /**
   * Collect all reasons why a patient is considered high risk.
   * Returns an array of human-readable strings for display.
   */
  function getAutoDetectedRiskReasons(patient) {
    var reasons = [];
    if (!patient) return reasons;
    var visits = patient.antenatalVisits || [];
    var reg = patient.registration;

    // Manual checkbox
    for (var i = 0; i < visits.length; i++) {
      if (isVisitHighRiskData(visitRawData(visits[i]))) {
        reasons.push('ANC: marked high risk');
        break;
      }
    }

    // Registration risks
    if (reg) {
      if (reg.high_risk === 'yes' || reg.high_risk === true) {
        reasons.push('Registration: flagged high risk');
      }
      var age = parseInt(reg.age, 10);
      if (!isNaN(age) && age < 18) reasons.push('Age < 18');
      if (!isNaN(age) && age >= 40) reasons.push('Age >= 40');
      var gravida = parseInt(reg.gravida, 10);
      if (!isNaN(gravida) && gravida >= 5) reasons.push('Gravida >= 5');
    }

    // Clinical findings (deduplicated)
    var clinicalSeen = {};
    for (var j = 0; j < visits.length; j++) {
      var data = visitRawData(visits[j]);
      if (data.dangerSignsPresent === 'yes' || data.dangerSignsPresent === 'Yes') {
        if (!clinicalSeen.danger) { reasons.push('Danger signs present'); clinicalSeen.danger = true; }
      }
      var bp = parseBloodPressure(data.bloodPressure);
      if (bp && (bp.sys >= 140 || bp.dia >= 90)) {
        if (!clinicalSeen.bp) { reasons.push('BP >= 140/90'); clinicalSeen.bp = true; }
      }
      if (data.anemiaStatus === 'Yes' || data.anemiaStatus === 'yes') {
        if (!clinicalSeen.anemia) { reasons.push('Anemia detected'); clinicalSeen.anemia = true; }
      }
      var up = (data.urineProtein || '').toLowerCase();
      if (up.indexOf('++') !== -1 || up === 'positive' || up === 'trace++') {
        if (!clinicalSeen.protein) { reasons.push('Urine protein positive'); clinicalSeen.protein = true; }
      }
      var us = (data.urineSugar || '').toLowerCase();
      if (us.indexOf('++') !== -1 || us === 'positive') {
        if (!clinicalSeen.sugar) { reasons.push('Urine sugar positive'); clinicalSeen.sugar = true; }
      }
      if (data.referral === 'Yes' || data.referral === 'yes') {
        if (!clinicalSeen.referral) { reasons.push('Referral made'); clinicalSeen.referral = true; }
      }
    }

    return reasons;
  }

  function getPatientRiskFactorsFromANC(patient) {
    var visits = (patient && patient.antenatalVisits) || [];
    var factors = [];
    visits.forEach(function (v) {
      var data = visitRawData(v);
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

  global.HighRiskUtils = {
    visitRawData: visitRawData,
    isVisitHighRiskData: isVisitHighRiskData,
    isPatientHighRisk: isPatientHighRisk,
    hasAcuteClinicalRisk: hasAcuteClinicalRisk,
    hasRegistrationRisk: hasRegistrationRisk,
    getAutoDetectedRiskReasons: getAutoDetectedRiskReasons,
    getPatientRiskFactorsFromANC: getPatientRiskFactorsFromANC,
    parseVisitDateMs: parseVisitDateMs,
    getLatestAncVisitTimeMs: getLatestAncVisitTimeMs,
    getLatestAncVisitData: getLatestAncVisitData
  };
})(typeof window !== 'undefined' ? window : this);
