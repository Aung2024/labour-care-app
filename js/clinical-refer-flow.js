/**
 * Save clinical visit data before navigating to patient transfer (refer).
 */
(function (global) {
  var pendingReferRedirect = null

  function getLang() {
    try {
      var lang = global.localStorage.getItem('appLanguage') || global.localStorage.getItem('preferredLanguage') || 'mm'
      return lang === 'en' ? 'en' : 'mm'
    } catch (e) {
      return 'mm'
    }
  }

  function t(en, mm) {
    return getLang() === 'en' ? en : mm
  }

  function buildTransferUrl(patientId, type) {
    if (!patientId) return 'transfer-patient.html'
    var url = 'transfer-patient.html?patient=' + encodeURIComponent(patientId)
    if (type) url += '&type=' + encodeURIComponent(type)
    return url
  }

  function armReferRedirect(url) {
    pendingReferRedirect = url || null
  }

  function consumeReferRedirect() {
    var url = pendingReferRedirect
    pendingReferRedirect = null
    return url
  }

  function clearReferRedirect() {
    pendingReferRedirect = null
  }

  function resolvePostSaveRedirect(defaultUrl) {
    return consumeReferRedirect() || defaultUrl
  }

  async function beginReferFromForm(options) {
    options = options || {}
    var patientId = typeof options.getPatientId === 'function' ? options.getPatientId() : null
    var transferUrl = buildTransferUrl(patientId, options.transferType)

    if (!options.formId) {
      global.location.href = transferUrl
      return
    }

    var form = document.getElementById(options.formId)
    if (!form) {
      global.location.href = transferUrl
      return
    }

    var message = t(
      'Save this visit before referring? Your entered data will be saved, then you will open the transfer form.',
      'လွှဲပြောင်းရန် မတိုင်မီ ဤပြသမှုကို သိမ်းဆည်းမည်လား? သိမ်းဆည်းပြီးနောက် လွှဲပြောင်းမှု ဖောင်သို့ သွားပါမည်။'
    )
    var title = t('Save before refer', 'သိမ်းဆည်းပြီး လွှဲပြောင်းရန်')
    var okLabel = t('Save & refer', 'သိမ်းပြီး လွှဲပြောင်း')
    var cancelLabel = t('Cancel', 'မလုပ်တော့')

    var confirmed = false
    if (global.AppDialog && typeof global.AppDialog.confirm === 'function') {
      confirmed = await global.AppDialog.confirm(message, { title: title, okLabel: okLabel, cancelLabel: cancelLabel })
    } else {
      confirmed = global.confirm(message)
    }
    if (!confirmed) return

    armReferRedirect(transferUrl)
    if (typeof form.requestSubmit === 'function') {
      form.requestSubmit()
    } else {
      form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))
    }
  }

  global.ClinicalReferFlow = {
    buildTransferUrl: buildTransferUrl,
    armReferRedirect: armReferRedirect,
    consumeReferRedirect: consumeReferRedirect,
    clearReferRedirect: clearReferRedirect,
    resolvePostSaveRedirect: resolvePostSaveRedirect,
    beginReferFromForm: beginReferFromForm
  }
})(window)
