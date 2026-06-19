/**
 * Shared birth/delivery datetime anchor for newborn care and PNC visit schedules.
 * Once set on newborn care or 1st PNC visit, the same datetime drives both 4-visit schedules.
 */
(function (global) {
  'use strict';

  var CARE_SCHEDULE_VISIT_COUNT = 4;

  function parseToDate(value) {
    if (!value) return null;
    if (value.toDate && typeof value.toDate === 'function') {
      var fromTs = value.toDate();
      return isNaN(fromTs.getTime()) ? null : fromTs;
    }
    if (value instanceof Date) {
      return isNaN(value.getTime()) ? null : value;
    }
    if (typeof value === 'object' && value.seconds) {
      var fromSec = new Date(value.seconds * 1000);
      return isNaN(fromSec.getTime()) ? null : fromSec;
    }
    if (typeof value === 'string') {
      var fromStr = new Date(value);
      return isNaN(fromStr.getTime()) ? null : fromStr;
    }
    return null;
  }

  function toDatetimeLocalString(date) {
    if (!date || isNaN(date.getTime())) return null;
    var y = date.getFullYear();
    var m = String(date.getMonth() + 1).padStart(2, '0');
    var day = String(date.getDate()).padStart(2, '0');
    var h = String(date.getHours()).padStart(2, '0');
    var min = String(date.getMinutes()).padStart(2, '0');
    return y + '-' + m + '-' + day + 'T' + h + ':' + min;
  }

  function parseDateOnlyLocal(val) {
    if (!val) return null;
    if (val instanceof Date) {
      if (isNaN(val.getTime())) return null;
      return new Date(val.getFullYear(), val.getMonth(), val.getDate());
    }
    var s = String(val).trim();
    var m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
    var d = new Date(s);
    if (isNaN(d.getTime())) return null;
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  function addDaysLocal(d, days) {
    var out = new Date(d.getTime());
    out.setDate(out.getDate() + days);
    return out;
  }

  function formatDateYMD(d) {
    if (!d || isNaN(d.getTime())) return null;
    var y = d.getFullYear();
    var mo = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return y + '-' + mo + '-' + day;
  }

  function formatDisplayDate(iso, lang) {
    var d = parseDateOnlyLocal(iso);
    if (!d) return iso || '—';
    return d.toLocaleDateString(lang === 'en' ? 'en-GB' : 'my-MM', {
      day: '2-digit', month: 'short', year: 'numeric'
    });
  }

  function getBirthDateStrFromDatetimeLocal(dtStr) {
    if (!dtStr) return null;
    return dtStr.split('T')[0];
  }

  function getRecommendedCareDateForVisit(birthDateStr, targetVisitNumber) {
    var birth = parseDateOnlyLocal(birthDateStr);
    if (!birth || targetVisitNumber < 1 || targetVisitNumber > CARE_SCHEDULE_VISIT_COUNT) return null;
    switch (targetVisitNumber) {
      case 1: return null;
      case 2: return formatDateYMD(addDaysLocal(birth, 3));
      case 3: return formatDateYMD(addDaysLocal(birth, 14));
      case 4: return formatDateYMD(addDaysLocal(birth, 42));
      default: return null;
    }
  }

  function datetimeLocalFromStored(value) {
    if (!value) return null;
    if (typeof value === 'string' && value.indexOf('T') >= 0) return value;
    var parsed = parseToDate(value);
    return parsed ? toDatetimeLocalString(parsed) : null;
  }

  async function fetchNewbornCareDoc(db, patientId) {
    try {
      var snap = await db.collection('patients').doc(patientId).collection('newborn_care').limit(1).get();
      if (!snap.empty) {
        return { id: snap.docs[0].id, data: snap.docs[0].data() };
      }
    } catch (e) { /* ignore */ }
    return null;
  }

  async function fetchFirstPncVisit(db, patientId) {
    try {
      var snap = await db.collection('patients').doc(patientId)
        .collection('postpartum_visits').orderBy('visitDate', 'asc').limit(1).get();
      if (!snap.empty) return snap.docs[0].data();
    } catch (e) { /* ignore */ }
    return null;
  }

  async function fetchSharedDeliveryAnchor(patientId) {
    var result = { datetimeLocal: null, locked: false, source: null };
    if (!patientId || !global.firebase) return result;

    var db = global.firebase.firestore();
    var newbornDoc = await fetchNewbornCareDoc(db, patientId);
    if (newbornDoc && newbornDoc.data && newbornDoc.data.birth_time) {
      result.datetimeLocal = datetimeLocalFromStored(newbornDoc.data.birth_time);
      if (result.datetimeLocal) {
        result.locked = true;
        result.source = 'newborn_care';
        return result;
      }
    }

    var firstPnc = await fetchFirstPncVisit(db, patientId);
    if (firstPnc && firstPnc.deliveredDateTime) {
      result.datetimeLocal = datetimeLocalFromStored(firstPnc.deliveredDateTime);
      if (result.datetimeLocal) {
        result.locked = true;
        result.source = 'pnc_visit_1';
        return result;
      }
    }

    return result;
  }

  async function syncDatetimeToNewbornCare(patientId, datetimeLocal) {
    if (!patientId || !datetimeLocal || !global.firebase) return;
    var db = global.firebase.firestore();
    var collectionRef = db.collection('patients').doc(patientId).collection('newborn_care');
    var existing = await collectionRef.limit(1).get();
    var patch = { birth_time: datetimeLocal };
    if (!existing.empty) {
      await collectionRef.doc(existing.docs[0].id).set(patch, { merge: true });
    } else {
      await collectionRef.add(patch);
    }
  }

  async function syncDatetimeToNewbornCareIfEmpty(patientId, datetimeLocal) {
    if (!patientId || !datetimeLocal || !global.firebase) return;
    var db = global.firebase.firestore();
    var newbornDoc = await fetchNewbornCareDoc(db, patientId);
    if (newbornDoc && newbornDoc.data && newbornDoc.data.birth_time) return;
    await syncDatetimeToNewbornCare(patientId, datetimeLocal);
  }

  global.BirthDeliveryAnchor = {
    CARE_SCHEDULE_VISIT_COUNT: CARE_SCHEDULE_VISIT_COUNT,
    parseToDate: parseToDate,
    toDatetimeLocalString: toDatetimeLocalString,
    parseDateOnlyLocal: parseDateOnlyLocal,
    addDaysLocal: addDaysLocal,
    formatDateYMD: formatDateYMD,
    formatDisplayDate: formatDisplayDate,
    getBirthDateStrFromDatetimeLocal: getBirthDateStrFromDatetimeLocal,
    getRecommendedCareDateForVisit: getRecommendedCareDateForVisit,
    fetchNewbornCareDoc: fetchNewbornCareDoc,
    fetchSharedDeliveryAnchor: fetchSharedDeliveryAnchor,
    syncDatetimeToNewbornCare: syncDatetimeToNewbornCare,
    syncDatetimeToNewbornCareIfEmpty: syncDatetimeToNewbornCareIfEmpty
  };
})(typeof window !== 'undefined' ? window : this);
