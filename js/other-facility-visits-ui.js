/**
 * Shared Other Facility Visit row labels (EN/MM) for ANC, PNC, and Newborn forms.
 */
(function (global) {
  'use strict';

  function escapeHtmlAttr(value) {
    return String(value == null ? '' : value).replace(/"/g, '&quot;');
  }

  function getAppLanguage() {
    return localStorage.getItem('appLanguage') || 'mm';
  }

  function applyLangToOtherVisitRow(row) {
    if (!row) return;
    var lang = getAppLanguage();
    row.querySelectorAll('.lang-text').forEach(function (el) {
      el.textContent = el.dataset[lang] || el.dataset.en || el.textContent;
    });
    row.querySelectorAll('option[data-en], option[data-mm]').forEach(function (el) {
      el.textContent = el.dataset[lang] || el.dataset.en || el.textContent;
    });
  }

  function applyLangToAllOtherVisitRows(containerSelector) {
    var selector = (containerSelector || '#otherVisitsRows') + ' .other-visit-row';
    global.document.querySelectorAll(selector).forEach(applyLangToOtherVisitRow);
  }

  function defaultNormalizeDate(value) {
    if (!value) return '';
    if (value.toDate && typeof value.toDate === 'function') {
      return value.toDate().toISOString().split('T')[0];
    }
    if (typeof value === 'string') return value.split('T')[0];
    var d = new Date(value);
    return isNaN(d.getTime()) ? '' : d.toISOString().split('T')[0];
  }

  function buildOtherVisitRowHtml(data, options) {
    data = data || {};
    options = options || {};
    var normalizeDate = options.normalizeDate || defaultNormalizeDate;
    var onRemove = options.onRemove || "this.closest('.other-visit-row').remove();";
    var visitNum = data.visitNumber ? escapeHtmlAttr(data.visitNumber) : '';
    var visitDate = data.visitDate ? escapeHtmlAttr(normalizeDate(data.visitDate)) : '';
    var facilityName = data.facilityName ? escapeHtmlAttr(data.facilityName) : '';

    return '' +
      '<div class="col-6 col-md-2">' +
        '<label class="form-label small lang-text" data-en="Facility Visit #" data-mm="ပြသသည့်အကြိမ်">Facility Visit #</label>' +
        '<input type="number" min="1" class="form-control other-visit-number" value="' + visitNum + '">' +
      '</div>' +
      '<div class="col-6 col-md-3">' +
        '<label class="form-label small lang-text" data-en="Visit Date" data-mm="ပြသသည့်နေ့">Visit Date</label>' +
        '<input type="date" class="form-control other-visit-date" value="' + visitDate + '">' +
      '</div>' +
      '<div class="col-6 col-md-3">' +
        '<label class="form-label small lang-text" data-en="Facility Type" data-mm="ပြသသည့်နေရာ">Facility Type</label>' +
        '<select class="form-select other-visit-facility-type">' +
          '<option value="" class="lang-text" data-en="Select" data-mm="ရွေးချယ်ပါ">Select</option>' +
          '<option value="Private" data-en="Private" data-mm="ပုဂ္ဂလိက ကျန်းမာရေးဌာန">Private</option>' +
          '<option value="Public" data-en="Public" data-mm="ပြည်သူ့ ကျန်းမာရေးဌာန">Public</option>' +
        '</select>' +
      '</div>' +
      '<div class="col-6 col-md-3">' +
        '<label class="form-label small lang-text" data-en="Facility Name" data-mm="ကျန်းမာရေးဌာန အမည်">Facility Name</label>' +
        '<input type="text" class="form-control other-visit-facility-name" value="' + facilityName + '">' +
      '</div>' +
      '<div class="col-12 col-md-1">' +
        '<button type="button" class="btn btn-outline-danger w-100" style="min-height:44px;" onclick="' + onRemove + '">' +
          '<i class="fas fa-trash"></i>' +
        '</button>' +
      '</div>';
  }

  function formatFacilityTypeLabel(value, lang) {
    lang = lang || getAppLanguage();
    if (value === 'Private') return lang === 'mm' ? 'ပုဂ္ဂလိက ကျန်းမာရေးဌာန' : 'Private';
    if (value === 'Public') return lang === 'mm' ? 'ပြည်သူ့ ကျန်းမာရေးဌာန' : 'Public';
    return value || '-';
  }

  global.OtherFacilityVisitsUi = {
    applyLangToOtherVisitRow: applyLangToOtherVisitRow,
    applyLangToAllOtherVisitRows: applyLangToAllOtherVisitRows,
    buildOtherVisitRowHtml: buildOtherVisitRowHtml,
    formatFacilityTypeLabel: formatFacilityTypeLabel,
    defaultNormalizeDate: defaultNormalizeDate
  };
})(typeof window !== 'undefined' ? window : this);
