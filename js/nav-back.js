/**
 * Reliable back navigation for iOS Safari / PWA (avoids history.back() traps).
 */
(function (global) {
  'use strict';

  var NAV_BACK_HINT_KEY = 'mchNavBackHint';

  function patientIdFromUrl() {
    try {
      return new URLSearchParams(global.location.search).get('patient') ||
        global.sessionStorage.getItem('selectedPatientId') ||
        '';
    } catch (e) {
      return '';
    }
  }

  function hubUrl(patientId) {
    patientId = patientId || patientIdFromUrl();
    if (!patientId) return 'list.html';
    try {
      if (global.sessionStorage.getItem('lcgOnly') === '1') {
        return 'patient-care-hub-lcg.html?patient=' + encodeURIComponent(patientId);
      }
    } catch (e) { /* ignore */ }
    return 'patient-care-hub.html?patient=' + encodeURIComponent(patientId);
  }

  function destKey(url) {
    return new URL(url, global.location.href).pathname +
      new URL(url, global.location.href).search;
  }

  function captureBackHintFromReferrer() {
    try {
      var ref = global.document && global.document.referrer;
      if (!ref) return;
      var refUrl = new URL(ref);
      if (refUrl.origin !== global.location.origin) return;
      global.sessionStorage.setItem(NAV_BACK_HINT_KEY, refUrl.pathname + refUrl.search);
    } catch (e) { /* ignore */ }
  }

  function searchCompatible(ref, dest) {
    if (ref.search === dest.search) return true;
    var destPatient = dest.searchParams.get('patient');
    var refPatient = ref.searchParams.get('patient');
    if (destPatient && refPatient) return destPatient === refPatient;
    return ref.pathname === dest.pathname;
  }

  function canUseHistoryBack(url) {
    if (!global.history || global.history.length <= 1) return false;
    var referrer = global.document && global.document.referrer;
    if (!referrer) return false;
    try {
      var ref = new URL(referrer);
      var dest = new URL(url, global.location.href);
      return ref.origin === global.location.origin &&
        ref.pathname === dest.pathname &&
        searchCompatible(ref, dest);
    } catch (e) {
      return false;
    }
  }

  function go(url) {
    var key = destKey(url);
    try {
      var hint = global.sessionStorage.getItem(NAV_BACK_HINT_KEY);
      if (hint && hint === key && global.history.length > 1) {
        global.history.back();
        return;
      }
    } catch (e) { /* ignore */ }

    if (canUseHistoryBack(url)) {
      global.history.back();
      return;
    }

    global.location.href = new URL(url, global.location.href).href;
  }

  captureBackHintFromReferrer();

  global.addEventListener('pageshow', function (event) {
    if (event.persisted) captureBackHintFromReferrer();
  });

  global.AppNavBack = {
    patientIdFromUrl: patientIdFromUrl,
    hubUrl: hubUrl,
    go: go,
    toHub: function (patientId) { go(hubUrl(patientId)); },
    toHome: function () { go('home.html'); },
    toList: function () { go('list.html'); },
    toPatientTransfers: function () { go('patient-transfers.html'); },
    toAntenatalCare: function (patientId) {
      patientId = patientId || patientIdFromUrl();
      go(patientId ? ('antenatal-care.html?patient=' + encodeURIComponent(patientId)) : 'list.html');
    },
    toAntenatalTests: function (patientId) {
      patientId = patientId || patientIdFromUrl();
      go(patientId ? ('antenatal-tests.html?patient=' + encodeURIComponent(patientId)) : 'list.html');
    },
    toPostpartumCare: function (patientId) {
      patientId = patientId || patientIdFromUrl();
      go(patientId ? ('postpartum-care.html?patient=' + encodeURIComponent(patientId)) : 'list.html');
    },
    toImmediateNewbornCare: function (patientId) {
      patientId = patientId || patientIdFromUrl();
      go(patientId ? ('immediate-newborn-care.html?patient=' + encodeURIComponent(patientId)) : hubUrl());
    },
    toVaccineHome: function (patientId) {
      patientId = patientId || patientIdFromUrl();
      go(patientId ? ('vaccine-home.html?patient=' + encodeURIComponent(patientId)) : 'list.html');
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
