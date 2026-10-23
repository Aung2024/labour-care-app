(function (global) {
  'use strict'

  const supportedWorkflows = Object.freeze([
    'registration',
    'patient-selection',
    'antenatal-care'
  ])
  const supportedStores = Object.freeze([
    'pending_patients',
    'pending_anc_visits'
  ])

  global.OfflinePolicy = Object.freeze({
    supportedWorkflows,
    supportedStores,
    isWorkflowSupported: (workflow) => supportedWorkflows.includes(String(workflow || '')),
    isStoreSupported: (storeName) => supportedStores.includes(String(storeName || '')),
    unsupportedMessage: 'This feature is not available offline. Reconnect to the internet and try again.'
  })
})(window)
