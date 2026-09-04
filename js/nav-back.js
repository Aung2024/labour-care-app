/**
 * Reliable back navigation for iOS Safari / PWA (avoids history.back() traps).
 */
(function (global) {
  'use strict';

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

  function go(url) {
    global.location.href = url;
  }

  global.AppNavBack = {
    patientIdFromUrl: patientIdFromUrl,
    hubUrl: hubUrl,
    toHub: function (patientId) { go(hubUrl(patientId)); },
    toHome: function () { go('home.html'); },
    toList: function () { go('list.html'); },
    toPatientTransfers: function () { go('patient-transfers.html'); },
    toQualityImprovement: function () { go('quality-improvement.html'); },
    toQualityCompetency: function () { go('quality-competency.html'); },
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
})(typeof window !== 'undefined' ? window : this);
