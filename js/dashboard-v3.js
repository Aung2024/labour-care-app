(function (global) {
  'use strict'

  var viewer = null
  var hasRenderedSummary = false
  var requestSequence = 0

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

  function renderSummary(summary, filters) {
    hideStates()
    hasRenderedSummary = true
    element('dashboardSections').hidden = false
    DashboardCharts.setMetrics(summary.metrics || {})
    element('dashboardScopeLabel').textContent =
      DashboardData.scopeLabel(viewer, filters) + ' · ' +
      DashboardData.periodKey(filters)
    formatFreshness(summary)
  }

  function summaryIsEmpty(summary) {
    return Number(summary.patientContributionCount || 0) === 0
  }

  async function loadDashboard() {
    var sequence = ++requestSequence
    var filters = DashboardData.readFilterValues()
    showLoading()
    element('dashboardRefreshButton').disabled = true
    element('dashboardScopeLabel').textContent =
      DashboardData.scopeLabel(viewer, filters) + ' · loading'
    try {
      var summary = await DashboardData.loadSummary(viewer, filters, function (cached) {
        if (sequence !== requestSequence) return
        renderSummary(cached, filters)
      })
      if (sequence !== requestSequence) return
      if (summaryIsEmpty(summary)) {
        hideStates()
        element('dashboardSections').hidden = true
        setVisible('dashboardEmpty', true)
        element('dashboardScopeLabel').textContent =
          DashboardData.scopeLabel(viewer, filters) + ' · ' +
          DashboardData.periodKey(filters)
        formatFreshness(summary)
        return
      }
      renderSummary(summary, filters)
    } catch (error) {
      if (sequence !== requestSequence) return
      console.error('Dashboard summary load failed:', error)
      if (!hasRenderedSummary) showError(error)
      else {
        element('dashboardFreshness').classList.add('is-stale')
        element('dashboardFreshness').textContent =
          'Refresh failed · continuing with saved summary'
      }
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
    setFilterExpanded(global.innerWidth > 768)
    filterToggle.addEventListener('click', function () {
      setFilterExpanded(!filterPanel.classList.contains('is-expanded'))
    })

    element('dashboardFilterForm').addEventListener('submit', function (event) {
      event.preventDefault()
      if (global.innerWidth <= 768) setFilterExpanded(false)
      loadDashboard()
    })

    element('dashboardYear').addEventListener('change', function () {
      var month = element('dashboardMonth')
      month.disabled = !this.value
      if (!this.value) month.value = ''
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

  async function userProfile(user) {
    var reference = firebase.firestore().collection('users').doc(user.uid)
    var snapshot
    try {
      snapshot = await reference.get({ source: navigator.onLine ? 'server' : 'cache' })
    } catch (error) {
      snapshot = await reference.get({ source: 'cache' })
    }
    if (!snapshot || !snapshot.exists) {
      throw new Error('Your user profile could not be loaded.')
    }
    var data = snapshot.data() || {}
    return {
      uid: user.uid,
      email: data.email || user.email || '',
      name: data.name || data.midwife_name || data.displayName || '',
      role: data.role || '',
      township: data.township || '',
      region: data.region || (
        global.getRegionFromTownship ? getRegionFromTownship(data.township) : ''
      ),
      facilityCode: data.facilityCode || data.facility_code || ''
    }
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
