(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.AncWorkflowUtils = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function parseDateOnly(value) {
    var match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12);
  }

  function formatDateOnly(date) {
    if (!(date instanceof Date) || isNaN(date.getTime())) return '';
    return [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0')
    ].join('-');
  }

  // Naegele's rule: LMP + 7 calendar days + 9 calendar months.
  function calculateNaegeleEdd(lmp) {
    var date = parseDateOnly(lmp);
    if (!date) return '';
    date.setDate(date.getDate() + 7);
    var targetDay = date.getDate();
    date.setDate(1);
    date.setMonth(date.getMonth() + 9);
    date.setDate(Math.min(targetDay, new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()));
    return formatDateOnly(date);
  }

  function normalizeMedicationStatus(value) {
    var legacy = {
      Given: 'Prescribed',
      'Not Given': 'Not Prescribed',
      Yes: 'Prescribed',
      No: 'Not Prescribed'
    };
    return legacy[value] || value || '';
  }

  function isMedicationPrescribed(value) {
    return value === 'Prescribed' || value === 'Given';
  }

  function nextVisitNumber(records) {
    var max = 0;
    (records || []).forEach(function (record) {
      var raw = record && record.data !== undefined ? record.data : record;
      var value = parseInt(raw && (raw.visitNumber || raw.visit_number), 10);
      if (!isNaN(value) && value > max) max = value;
    });
    return max + 1;
  }

  return {
    calculateNaegeleEdd: calculateNaegeleEdd,
    normalizeMedicationStatus: normalizeMedicationStatus,
    isMedicationPrescribed: isMedicationPrescribed,
    nextVisitNumber: nextVisitNumber
  };
});
