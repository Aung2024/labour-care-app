(function (global) {
  'use strict';

  var userProfileCache = {};

  function normalizeFacilityCode(value) {
    var code = String(value == null ? '' : value).trim();
    if (!code) return '';
    return /^\d{1,2}$/.test(code) ? code.padStart(3, '0') : code;
  }

  function getFacilityCode(patient, user) {
    patient = patient || {};
    user = user || {};
    return normalizeFacilityCode(
      patient.facility_code ||
      patient.facilityCode ||
      user.facility_code ||
      user.facilityCode
    );
  }

  function getFacilityName(patient, user, language) {
    patient = patient || {};
    user = user || {};
    var code = getFacilityCode(patient, user);
    if (code && global.FacilityConfig) {
      var facility = FacilityConfig.getFacilityByCode(code);
      if (facility) return FacilityConfig.getFacilityLabel(facility, language);
    }
    return patient.facility_name ||
      patient.facilityName ||
      patient.facility ||
      user.facility_name ||
      user.facilityName ||
      user.facility ||
      code ||
      '';
  }

  async function resolveFacilityName(patient, user, language, db) {
    var name = getFacilityName(patient, user, language);
    if (getFacilityCode(patient, user) || !user || !user.uid || !db) return name;

    var profile = userProfileCache[user.uid];
    if (!profile) {
      try {
        var doc = await db.collection('users').doc(user.uid).get();
        profile = doc.exists ? (doc.data() || {}) : {};
      } catch (error) {
        profile = {};
      }
      userProfileCache[user.uid] = profile;
    }
    return getFacilityName(patient, profile, language) || name;
  }

  global.ReportFacility = {
    normalizeFacilityCode: normalizeFacilityCode,
    getFacilityCode: getFacilityCode,
    getFacilityName: getFacilityName,
    resolveFacilityName: resolveFacilityName
  };
})(typeof window !== 'undefined' ? window : this);
