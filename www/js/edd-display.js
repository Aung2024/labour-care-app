/**
 * Shared EDD display: if due date is before today, append a clear "past due" hint.
 */
(function (global) {
  'use strict';

  function parseEddToDate(edd) {
    if (edd == null || edd === '') return null;
    if (edd && typeof edd.toDate === 'function') {
      var t = edd.toDate();
      return t && !isNaN(t.getTime()) ? t : null;
    }
    if (edd instanceof Date) return isNaN(edd.getTime()) ? null : edd;
    if (typeof edd === 'object' && edd.seconds != null) {
      var d = new Date(edd.seconds * 1000);
      return isNaN(d.getTime()) ? null : d;
    }
    var d = new Date(edd);
    return isNaN(d.getTime()) ? null : d;
  }

  function startOfDay(d) {
    var x = new Date(d.getTime());
    x.setHours(0, 0, 0, 0);
    return x;
  }

  /**
   * @param {*} edd - ISO string, Date, Firestore Timestamp, or { seconds }
   * @param {object} [opts]
   * @param {'en'|'mm'} [opts.lang]
   * @param {string} [opts.notSetText] when no valid date (default '—')
   * @param {boolean} [opts.allowRawString] if true, return non-date strings as-is
   */
  function formatEddWithStatus(edd, opts) {
    opts = opts || {};
    var lang = opts.lang === 'mm' ? 'mm' : 'en';
    var notSet = opts.notSetText != null ? opts.notSetText : '—';

    if (edd == null || edd === '') return notSet;

    var d = parseEddToDate(edd);
    if (!d) {
      if (opts.allowRawString && typeof edd === 'string' && edd.trim()) {
        return edd.trim();
      }
      return notSet;
    }

    var locale = lang === 'mm' ? 'my-MM' : undefined;
    var dateStr = d.toLocaleDateString(locale);

    var today = startOfDay(new Date());
    var eddDay = startOfDay(d);

    if (eddDay < today) {
      var suffix = lang === 'mm'
        ? ' (မွေးဖွားပြီးဖြစ်နိုင်သည် — EDD ကျော်လွန်)'
        : ' (Past EDD — may have already delivered)';
      return dateStr + suffix;
    }
    return dateStr;
  }

  global.EddDisplay = {
    parseEddToDate: parseEddToDate,
    formatEddWithStatus: formatEddWithStatus
  };
})(typeof window !== 'undefined' ? window : this);
