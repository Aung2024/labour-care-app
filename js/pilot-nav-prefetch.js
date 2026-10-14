/**
 * Prefetch common MNCH pages after Home loads (no service worker).
 * Warms HTTP cache so Dashboard, CME, tracking, etc. open faster on slow links.
 */
(function () {
  var CARE_NAV_PATHS = {
    registration: 'patient-enhanced.html',
    'select-patient': 'list.html',
    'joint-care': 'joint-care.html',
    'patient-transfers': 'patient-transfers.html',
    dashboard: 'dashboard.html',
    'midwife-report': 'midwife-report.html',
    'monthly-report': 'monthly-report.html',
    'township-report': 'township-report.html',
    'visit-edit-approvals': 'visit-edit-approvals.html',
    admin: 'admin.html',
    'manage-midwives': 'manage-midwives.html',
    cme: 'cme-learning.html',
    scoreboard: 'leaderboard.html',
    'high-risk-tracking': 'high-risk-tracking.html',
    'kmc-tracking': 'kmc-tracking.html',
    'quality-improvement': 'quality-improvement.html',
    'retroactive-data': 'retroactive-data-entry.html'
  }

  var PREFETCH_PATHS = [
    'home.html',
    'list.html',
    'dashboard.html',
    'cme-learning.html',
    'high-risk-tracking.html',
    'kmc-tracking.html',
    'leaderboard.html',
    'patient-enhanced.html'
  ]

  var prefetched = {}

  function prefetchDocument(path) {
    if (!path || prefetched[path]) return
    prefetched[path] = true
    try {
      var link = document.createElement('link')
      link.rel = 'prefetch'
      link.href = path
      link.as = 'document'
      document.head.appendChild(link)
    } catch (e) {}
  }

  function prefetchBatch(paths, startIndex) {
    if (startIndex >= paths.length) return
    var batch = paths.slice(startIndex, startIndex + 2)
    batch.forEach(prefetchDocument)
    var next = startIndex + batch.length
    if (next < paths.length) {
      setTimeout(function () {
        prefetchBatch(paths, next)
      }, 800)
    }
  }

  function startPrefetch() {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return
    prefetchBatch(PREFETCH_PATHS, 0)
  }

  window.pilotPrefetchPage = prefetchDocument
  window.pilotPrefetchCareType = function (careType) {
    var path = CARE_NAV_PATHS[careType]
    if (path) prefetchDocument(path)
  }

  document.addEventListener(
    'pointerdown',
    function (event) {
      var card = event.target && event.target.closest
        ? event.target.closest('.care-card[onclick*="navigateToCare"]')
        : null
      if (!card || !card.getAttribute) return
      var onclick = card.getAttribute('onclick') || ''
      var match = onclick.match(/navigateToCare\('([^']+)'\)/)
      if (match && match[1]) window.pilotPrefetchCareType(match[1])
    },
    { passive: true }
  )

  if ('requestIdleCallback' in window) {
    requestIdleCallback(startPrefetch, { timeout: 4000 })
  } else {
    setTimeout(startPrefetch, 2000)
  }
})()
