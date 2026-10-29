(function (global) {
  'use strict'

  var viewer = null
  var hasRenderedSummary = false
  var renderedFilterKey = ''
  var requestSequence = 0
  var latestSummary = null

  function element(id) {
    return document.getElementById(id)
  }

  function setVisible(id, visible) {
    var node = element(id)
    if (node) node.classList.toggle('is-visible', Boolean(visible))
  }

  function updateOfflineNotice() {
    var notice = element('dashboardOfflineNotice')
    if (!notice) return
    notice.classList.toggle('d-none', navigator.onLine)
  }

  function hideStates() {
    setVisible('dashboardLoading', false)
    setVisible('dashboardError', false)
    setVisible('dashboardEmpty', false)
  }

  function showLoading() {
    if (hasRenderedSummary) return
    hideStates()
    element('dashboardSections').hidden = true
    setVisible('dashboardLoading', true)
  }

  function showError(error) {
    hideStates()
    element('dashboardSections').hidden = true
    element('dashboardErrorMessage').textContent =
      error && error.message ? error.message : 'Please try again.'
    setVisible('dashboardError', true)
  }

  function updateHeader(profile) {
    var role = String(profile.role || '')
    var title = 'MNCH Dashboard'
    var subtitle = 'Aggregate clinical performance'
    if (DashboardData.isMidwifeRole(role)) {
      title = 'Midwife Dashboard'
      subtitle = 'Your aggregate service summary'
    } else if (DashboardData.isTmoRole(role)) {
      title = 'Township Dashboard'
      subtitle = profile.township || 'Township aggregate summary'
    } else if (DashboardData.isRegionalRole(role)) {
      title = 'Regional Dashboard'
      subtitle = profile.region || 'Regional aggregate summary'
    } else if (DashboardData.isCentralRole(role)) {
      title = 'National MNCH Dashboard'
      subtitle = 'Ministry aggregate service summary'
    }
    element('dashboardTitle').textContent = title
    element('dashboardSubtitle').textContent = subtitle
    element('dashboardUserLabel').textContent = profile.email
      ? profile.email + ' · ' + role
      : role
  }

  function formatFreshness(summary) {
    var freshness = element('dashboardFreshness')
    var date = summary.calculatedAt
    if (!(date instanceof Date)) {
      if (date && typeof date.toDate === 'function') {
        date = date.toDate()
      } else if (date && typeof date.seconds === 'number') {
        date = new Date(date.seconds * 1000)
      } else if (date && typeof date._seconds === 'number') {
        date = new Date(date._seconds * 1000)
      } else if (date) {
        date = new Date(date)
      }
    }
    if (!date || Number.isNaN(date.getTime())) date = null
    var stale = !date || (Date.now() - date.getTime()) > 48 * 60 * 60 * 1000
    freshness.classList.toggle('is-stale', stale)
    if (!date) {
      freshness.textContent = 'Summary time unavailable'
      return
    }
    var prefix = summary.source === 'cache' ? 'Saved summary' : 'Fast summary'
    if (stale) prefix = 'Summary older than 48 hours'
    freshness.textContent = prefix + ' · ' + date.toLocaleString()
  }

  function filterKey(filters) {
    return [
      DashboardData.scopeLabel(viewer, filters),
      DashboardData.periodKey(filters),
      filters.department || '',
      (filters.facilityTypes || []).slice().sort().join(',')
    ].join('|')
  }

  function showScope(filters, suffix) {
    element('dashboardScopeLabel').textContent =
      DashboardData.scopeLabel(viewer, filters) + ' · ' +
      (suffix || DashboardData.periodKey(filters))
  }

  function renderSummary(summary, filters) {
    hideStates()
    hasRenderedSummary = true
    renderedFilterKey = filterKey(filters)
    element('dashboardSections').hidden = false
    DashboardCharts.setMetrics(summary.metrics || {})
    DashboardCharts.setTrendMode(filters.trendMode || 'month')
    DashboardCharts.setSeries(summary.seriesByDimension || {})
    showScope(filters)
    formatFreshness(summary)
  }

  function summaryIsEmpty(summary) {
    return Number(summary.patientContributionCount || 0) === 0
  }

  async function loadDashboard() {
    var sequence = ++requestSequence
    var filters = DashboardData.readFilterValues()
    var nextKey = filterKey(filters)
    var sameScope = nextKey === renderedFilterKey
    showLoading()
    element('dashboardRefreshButton').disabled = true
    showScope(filters, sameScope ? 'updating' : 'loading')
    if (hasRenderedSummary && !sameScope) {
      element('dashboardFreshness').classList.add('is-stale')
      element('dashboardFreshness').textContent = 'Loading this filter…'
    }
    try {
      var summary = await DashboardData.loadSummary(viewer, filters, function (cached) {
        if (sequence !== requestSequence) return
        renderSummary(cached, filters)
      })
      if (sequence !== requestSequence) return
      if (summaryIsEmpty(summary)) {
        hideStates()
        hasRenderedSummary = false
        renderedFilterKey = nextKey
        element('dashboardSections').hidden = true
        setVisible('dashboardEmpty', true)
        showScope(filters)
        formatFreshness(summary)
        return
      }
      renderSummary(summary, filters)
    } catch (error) {
      if (sequence !== requestSequence) return
      console.error('Dashboard summary load failed:', error)
      if (sameScope && hasRenderedSummary) {
        hideStates()
        element('dashboardSections').hidden = false
        showScope(filters)
        element('dashboardFreshness').classList.add('is-stale')
        element('dashboardFreshness').textContent =
          'Refresh failed · continuing with saved summary'
        return
      }
      hasRenderedSummary = false
      renderedFilterKey = ''
      showScope(filters)
      showError(error)
    } finally {
      if (sequence === requestSequence) {
        element('dashboardRefreshButton').disabled = false
      }
    }
  }

  async function refreshDependentFacilities() {
    var selected = element('dashboardFacility').value
    await DashboardData.refreshFacilityOptions(selected)
  }

  function attachFilterEvents() {
    var filterPanel = document.querySelector('.dashboard-filter-panel')
    var filterToggle = element('dashboardFilterToggle')
    var setFilterExpanded = function (expanded) {
      filterPanel.classList.toggle('is-expanded', expanded)
      filterToggle.setAttribute('aria-expanded', expanded ? 'true' : 'false')
      var icon = filterToggle.querySelector('.fa-chevron-down, .fa-chevron-up')
      if (icon) {
        icon.classList.toggle('fa-chevron-down', !expanded)
        icon.classList.toggle('fa-chevron-up', expanded)
      }
    }
    setFilterExpanded(false)
    filterToggle.addEventListener('click', function () {
      setFilterExpanded(!filterPanel.classList.contains('is-expanded'))
    })

    element('dashboardFilterForm').addEventListener('submit', function (event) {
      event.preventDefault()
      setFilterExpanded(false)
      loadDashboard()
    })

    element('dashboardPreset').addEventListener('change', function () {
      var start = element('dashboardStartDate')
      var end = element('dashboardEndDate')
      if (!start || !end) return
      if (this.value === 'months' && (!start.value || !end.value)) {
        var now = new Date()
        var currentMonth = now.getFullYear() + '-' +
          String(now.getMonth() + 1).padStart(2, '0')
        start.value = currentMonth
        end.value = currentMonth
      }
      start.disabled = this.value === 'all_time'
      end.disabled = this.value === 'all_time'
    })

    element('dashboardStartDate').addEventListener('change', function () {
      var end = element('dashboardEndDate')
      if (end.value && this.value > end.value) end.value = this.value
    })

    element('dashboardEndDate').addEventListener('change', function () {
      var start = element('dashboardStartDate')
      if (start.value && this.value < start.value) start.value = this.value
    })

    element('dashboardRegion').addEventListener('change', async function () {
      DashboardData.refreshTownshipOptions(viewer)
      await refreshDependentFacilities()
    })

    element('dashboardTownship').addEventListener('change', refreshDependentFacilities)

    element('dashboardDepartment').addEventListener('change', async function () {
      var selectedTypes = DashboardData.selectedFacilityTypes()
      DashboardData.renderFacilityTypes(this.value, selectedTypes)
      await refreshDependentFacilities()
    })

    element('dashboardFacilityTypes').addEventListener('change', refreshDependentFacilities)
    element('dashboardRefreshButton').addEventListener('click', loadDashboard)
    element('dashboardRetryButton').addEventListener('click', loadDashboard)
    element('dashboardExportButton').addEventListener('click', exportDashboard)
    element('dashboardLogoutButton').addEventListener('click', async function () {
      await firebase.auth().signOut()
      location.href = 'login.html'
    })

    global.addEventListener('online', function () {
      updateOfflineNotice()
      loadDashboard()
    })
    global.addEventListener('offline', updateOfflineNotice)
  }

  async function exportDashboard() {
    var button = element('dashboardExportButton')
    var status = element('dashboardExportStatus')
    var filters = DashboardData.readFilterValues()
    if (!filters.startDate || !filters.endDate) {
      status.textContent = 'Choose a valid date range before exporting.'
      return
    }
    button.disabled = true
    status.textContent = 'Preparing Excel export…'
    try {
      var result = await DashboardData.callDashboardV4('requestDashboardV4Export', {
        startDate: filters.startDate,
        endDate: filters.endDate,
        region: filters.region,
        township: filters.township,
        department: filters.department,
        facilityCode: filters.facilityCode,
        facilityTypes: filters.facilityTypes
      })
      var bytes = Uint8Array.from(atob(result.base64), function (character) {
        return character.charCodeAt(0)
      })
      var blob = new Blob([bytes], { type: result.contentType })
      var link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.download = result.fileName
      link.click()
      URL.revokeObjectURL(link.href)
      status.textContent = 'Excel export ready.'
    } catch (error) {
      status.textContent = error.message || 'Excel export failed.'
    } finally {
      button.disabled = false
    }
  }

  function profileFromUserData(user, data) {
    data = data || {}
    return {
      uid: user.uid,
      email: data.email || user.email || '',
      name: data.name || data.midwife_name || data.displayName || '',
      role: data.role || '',
      township: data.township || localStorage.getItem('userTownship') || '',
      region: data.region || (
        global.getRegionFromTownship ? getRegionFromTownship(data.township) : ''
      ) || localStorage.getItem('userRegion') || '',
      facilityCode: data.facilityCode || data.facility_code || localStorage.getItem('facilityCode') || ''
    }
  }

  async function userProfile(user) {
    if (global.UserCache) {
      var cached = UserCache.getCached(user.uid)
      if (cached && cached.role) return profileFromUserData(user, cached)
    }
    var reference = firebase.firestore().collection('users').doc(user.uid)
    var snapshot
    try {
      var preferServer = navigator.onLine &&
        !(global.isFirestoreLikelyUnavailable && isFirestoreLikelyUnavailable())
      snapshot = await reference.get({ source: preferServer ? 'server' : 'cache' })
    } catch (error) {
      snapshot = await reference.get({ source: 'cache' })
    }
    if (!snapshot || !snapshot.exists) {
      throw new Error('Your user profile could not be loaded.')
    }
    var data = snapshot.data() || {}
    if (global.UserCache) UserCache.cache(user.uid, data)
    return profileFromUserData(user, data)
  }

  async function initialize(user) {
    try {
      viewer = await userProfile(user)
      updateHeader(viewer)
      updateOfflineNotice()
      DashboardCharts.initializeSections(function (section) {
        DashboardCharts.renderSection(section)
      })
      await DashboardData.initializeFilters(viewer)
      var exportButton = element('dashboardExportButton')
      var role = String(viewer.role || '').toLowerCase()
      if (exportButton) exportButton.hidden = role === 'midwife'
      attachFilterEvents()
      await loadDashboard()
    } catch (error) {
      console.error('Dashboard initialization failed:', error)
      showError(error)
    }
  }

  firebase.auth().onAuthStateChanged(function (user) {
    if (!user) {
      location.href = 'login.html'
      return
    }
    initialize(user)
  })
})(typeof window !== 'undefined' ? window : globalThis)
