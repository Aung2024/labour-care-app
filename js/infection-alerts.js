(function (global) {
  'use strict';

  var TEST_FIELDS = {
    hiv: ['hivResult', 'hiv_result'],
    hepatitisB: ['hepatitisBResult', 'hepatitis_b_result', 'hbsAgResult'],
    hepatitisC: ['hepatitisCResult', 'hepatitis_c_result', 'hcvResult'],
    vdrl: ['syphilisResult', 'vdrlResult', 'vdrl_result']
  };
  var LABELS = {
    hiv: 'HIV',
    hepatitisB: 'Hepatitis B',
    hepatitisC: 'Hepatitis C',
    vdrl: 'VDRL / Syphilis'
  };

  function normalizeResult(value) {
    var key = String(value == null ? '' : value).trim().toLowerCase();
    if (['positive', 'reactive', 'detected', 'pos', '+'].indexOf(key) !== -1) return 'positive';
    if (['negative', 'non-reactive', 'nonreactive', 'not detected', 'neg'].indexOf(key) !== -1) {
      return 'negative';
    }
    if (['indeterminate', 'inconclusive', 'equivocal'].indexOf(key) !== -1) return 'indeterminate';
    return 'unknown';
  }

  function dateMs(record) {
    var value = record.testDate || record.visitDate || record.recordedAt ||
      record.createdAt || record.timestamp;
    if (!value) return 0;
    if (typeof value.toDate === 'function') return value.toDate().getTime();
    if (typeof value.seconds === 'number') return value.seconds * 1000;
    var parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function collectFlags(records) {
    var latest = {};
    (records || []).forEach(function (record) {
      record = record && (record.data || record) || {};
      Object.keys(TEST_FIELDS).forEach(function (infection) {
        var field = TEST_FIELDS[infection].find(function (candidate) {
          return record[candidate] != null && record[candidate] !== '';
        });
        if (!field) return;
        var candidate = {
          result: normalizeResult(record[field]),
          testedAt: dateMs(record),
          raw: record[field]
        };
        if (!latest[infection] || candidate.testedAt >= latest[infection].testedAt) {
          latest[infection] = candidate;
        }
      });
    });
    var flags = {};
    Object.keys(latest).forEach(function (infection) {
      if (latest[infection].result === 'positive') flags[infection] = latest[infection];
    });
    return flags;
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  function ensureStyles() {
    if (document.getElementById('infectionAlertsStyles')) return;
    var style = document.createElement('style');
    style.id = 'infectionAlertsStyles';
    style.textContent = [
      '.infection-alert{border:2px solid #b91c1c;background:#fef2f2;color:#7f1d1d;',
      'border-radius:12px;padding:12px 14px;margin:10px 0;font-weight:650;}',
      '.infection-alert__title{display:flex;align-items:center;gap:8px;margin-bottom:6px;}',
      '.infection-alert__badges{display:flex;flex-wrap:wrap;gap:6px;}',
      '.infection-alert__badge{background:#b91c1c;color:#fff;border-radius:999px;',
      'padding:5px 10px;font-size:.85rem;line-height:1.25;}'
    ].join('');
    document.head.appendChild(style);
  }

  function badgeHtml(flags) {
    return Object.keys(flags || {}).map(function (infection) {
      return '<span class="infection-alert__badge">' +
        escapeHtml(LABELS[infection] || infection) + ': Positive / Reactive</span>';
    }).join('');
  }

  function render(container, flags, options) {
    if (!container) return;
    var keys = Object.keys(flags || {});
    if (!keys.length) {
      container.innerHTML = '';
      container.style.display = 'none';
      return;
    }
    ensureStyles();
    var language = options && options.language ||
      document.documentElement.getAttribute('data-lang') || 'en';
    var title = language === 'mm'
      ? 'ကူးစက်ရောဂါ စစ်ဆေးမှု သတိပေးချက်'
      : 'Positive infection screening alert';
    container.classList.add('infection-alert');
    container.setAttribute('role', 'alert');
    container.setAttribute('aria-live', 'polite');
    container.style.display = '';
    container.innerHTML = '<div class="infection-alert__title"><i class="fas fa-triangle-exclamation"></i>' +
      escapeHtml(title) + '</div><div class="infection-alert__badges">' + badgeHtml(flags) + '</div>';
  }

  async function fetchRecords(patientId) {
    if (!patientId || !global.firebase) return [];
    var snapshot = await firebase.firestore().collection('patients').doc(patientId)
      .collection('testRecords').orderBy('testDate', 'desc').limit(20).get()
      .catch(function () {
        return firebase.firestore().collection('patients').doc(patientId)
          .collection('testRecords').limit(20).get();
      });
    return snapshot.docs.map(function (doc) {
      return Object.assign({ id: doc.id }, doc.data() || {});
    });
  }

  async function loadAndRender(patientId, container, options) {
    var records = await fetchRecords(patientId);
    var flags = collectFlags(records);
    render(container, flags, options);
    return flags;
  }

  global.InfectionAlerts = {
    normalizeResult: normalizeResult,
    collectFlags: collectFlags,
    badgeHtml: badgeHtml,
    render: render,
    fetchRecords: fetchRecords,
    loadAndRender: loadAndRender
  };
})(typeof window !== 'undefined' ? window : globalThis);
