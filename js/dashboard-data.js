(function (global) {
  'use strict'

  var SUMMARY_COLLECTION = 'analytics_v32_periods'
  var SCHEMA_PREFIX = 'analytics-v3.2'
  var DEFAULT_FACILITY_TYPES = [
    'district_hospital',
    'regional_public_health_department',
    'township_public_health_department',
    'township_hospital',
    'station_hospital',
    'station_health_unit',
    'mch',
    'rhc',
    'srhc'
  ]
  var FACILITY_TYPE_LABELS = {
    district_hospital: 'District Hospital',
    regional_public_health_department: 'RPHD',
    township_public_health_department: 'TPHD',
    township_hospital: 'Township Hospital',
    station_hospital: 'Station Hospital',
    station_health_unit: 'Station Health Unit',
    mch: 'MCH',
    rhc: 'RHC',
    srhc: 'Sub-RHC'
  }
  var activeProfile = null

  function roleKey(role) {
    return String(role || '').trim().toLowerCase().replace(/\s+/g, ' ')
  }

  function isCentralRole(role) {
    return ['central', 'super admin', 'admin'].indexOf(roleKey(role)) !== -1
  }

  function isRegionalRole(role) {
    return roleKey(role) === 'regional officer'
  }

  function isTmoRole(role) {
    return roleKey(role) === 'tmo'
  }

  function isMidwifeRole(role) {
    return roleKey(role) === 'midwife'
  }

  function safeDate(value) {
    if (!value) return null
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
    if (typeof value.toDate === 'function') return safeDate(value.toDate())
    if (typeof value.seconds === 'number') return new Date(value.seconds * 1000)
    if (typeof value._seconds === 'number') return new Date(value._seconds * 1000)
    var parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }

  function replaceOptions(select, options, placeholder, selected) {
    if (!select) return
    select.innerHTML = ''
    var first = document.createElement('option')
    first.value = ''
    first.textContent = placeholder
    select.appendChild(first)
    options.forEach(function (option) {
      var node = document.createElement('option')
      node.value = option.value
      node.textContent = option.label
      select.appendChild(node)
    })
    select.value = selected || ''
    if (select.value !== (selected || '')) select.value = ''
  }

  function localDateKey(date) {
    var value = date || new Date()
    var year = value.getFullYear()
    var month = String(value.getMonth() + 1).padStart(2, '0')
    var day = String(value.getDate()).padStart(2, '0')
    return year + '-' + month + '-' + day
  }

  function localMonthKey(date) {
    var value = date || new Date()
    return value.getFullYear() + '-' + String(value.getMonth() + 1).padStart(2, '0')
  }

  function monthLabel(month) {
    var parts = String(month || '').split('-').map(Number)
    if (parts.length !== 2 || !parts[0] || !parts[1]) return month
    return new Intl.DateTimeFormat(undefined, {
      month: 'long',
      year: 'numeric'
    }).format(new Date(parts[0], parts[1] - 1, 1))
  }

  function monthOptions(now) {
    var current = now || new Date()
    var cursor = new Date(2025, 0, 1)
    var options = []
    while (cursor <= current) {
      var value = localMonthKey(cursor)
      options.push({ value: value, label: monthLabel(value) })
      cursor.setMonth(cursor.getMonth() + 1)
    }
    return options
  }

  function replaceMonthOptions(select, options, selected) {
    if (!select) return
    replaceOptions(select, options, 'Select month', selected)
  }

  function lastDayOfMonth(monthKey) {
    var parts = String(monthKey || '').split('-').map(Number)
    if (parts.length !== 2 || !parts[0] || !parts[1]) return ''
    return localDateKey(new Date(parts[0], parts[1], 0))
  }

  function setPeriodInputState() {
    var preset = document.getElementById('dashboardPreset')
    var start = document.getElementById('dashboardStartDate')
    var end = document.getElementById('dashboardEndDate')
    var monthSelection = !preset || preset.value !== 'all_time'
    if (start) start.disabled = !monthSelection
    if (end) end.disabled = !monthSelection
  }

  function initializePeriodOptions(now) {
    if (!document.getElementById('dashboardPreset')) {
      var legacyYear = document.getElementById('dashboardYear')
      var legacyMonth = document.getElementById('dashboardMonth')
      if (legacyYear && legacyMonth) {
        replaceOptions(legacyYear, [], 'All time', '')
        replaceOptions(legacyMonth, [], 'All months', '')
        legacyMonth.disabled = true
      }
      return
    }
    var current = now || new Date()
    var preset = document.getElementById('dashboardPreset')
    var start = document.getElementById('dashboardStartDate')
    var end = document.getElementById('dashboardEndDate')
    if (!preset || !start || !end) return
    var options = monthOptions(current)
    preset.value = 'all_time'
    replaceMonthOptions(start, options, '2025-01')
    replaceMonthOptions(end, options, localMonthKey(current))
    setPeriodInputState()
  }

  function initializeRegions(profile) {
    var role = profile.role
    var regionSelect = document.getElementById('dashboardRegion')
    var regionWrap = document.getElementById('dashboardRegionWrap')
    var regionNames = Object.keys(global.MYANMAR_REGIONS || {}).sort()
    if (isCentralRole(role)) {
      regionWrap.hidden = false
      replaceOptions(regionSelect, regionNames.map(function (region) {
        return { value: region, label: region }
      }), 'All regions', '')
      return
    }
    regionWrap.hidden = true
    replaceOptions(
      regionSelect,
      profile.region ? [{ value: profile.region, label: profile.region }] : [],
      profile.region || 'Region',
      profile.region || ''
    )
  }

  function availableTownships(profile, region) {
    var role = profile.role
    if (isTmoRole(role) || isMidwifeRole(role)) {
      return profile.township ? [profile.township] : []
    }
    var allowedRegion = isRegionalRole(role) ? profile.region : region
    if (!allowedRegion) return []
    return (global.MYANMAR_REGIONS && global.MYANMAR_REGIONS[allowedRegion] || []).slice().sort()
  }

  function refreshTownshipOptions(profile) {
    var region = document.getElementById('dashboardRegion').value
    var township = document.getElementById('dashboardTownship')
    var wrap = document.getElementById('dashboardTownshipWrap')
    var fixed = isTmoRole(profile.role) || isMidwifeRole(profile.role)
    var townships = availableTownships(profile, region)
    wrap.hidden = isMidwifeRole(profile.role)
    replaceOptions(township, townships.map(function (name) {
      return { value: name, label: name }
    }), fixed ? (profile.township || 'Township') : 'All townships', fixed ? profile.township : '')
    township.disabled = fixed
  }

  function facilityTypeLabel(type) {
    return FACILITY_TYPE_LABELS[type] || String(type || '').replace(/_/g, ' ')
  }

  function selectedFacilityTypes() {
    return Array.from(document.querySelectorAll(
      '#dashboardFacilityTypes input[type="checkbox"]:checked'
    )).map(function (input) {
      return input.value
    })
  }

  function renderFacilityTypes(department, selected) {
    var host = document.getElementById('dashboardFacilityTypes')
    var types = global.FacilityConfig
      ? FacilityConfig.getFacilityTypes(department || null)
      : DEFAULT_FACILITY_TYPES.slice()
    var selectedSet = new Set(selected || [])
    host.innerHTML = ''
    types.forEach(function (type) {
      var id = 'dashboardFacilityType_' + type
      var wrapper = document.createElement('span')
      wrapper.className = 'dashboard-type-chip'
      var checkbox = document.createElement('input')
      checkbox.type = 'checkbox'
      checkbox.id = id
      checkbox.value = type
      checkbox.checked = selectedSet.has(type)
      var label = document.createElement('label')
      label.htmlFor = id
      label.textContent = facilityTypeLabel(type)
      wrapper.appendChild(checkbox)
      wrapper.appendChild(label)
      host.appendChild(wrapper)
    })
  }

  function staticFacilities(filters) {
    if (!global.FacilityConfig) return []
    return FacilityConfig.getFacilities().filter(function (facility) {
      if (filters.region && facility.region && facility.region !== filters.region) return false
      if (filters.township && facility.township !== filters.township) return false
      if (filters.department && facility.department !== filters.department) return false
      if (filters.facilityTypes.length &&
          filters.facilityTypes.indexOf(facility.facilityType) === -1) return false
      return facility.facilityType !== 'other' && facility.facilityType !== 'maternity_home'
    }).map(function (facility) {
      return {
        value: facility.code,
        label: FacilityConfig.getFacilityLabel(facility, 'en')
      }
    })
  }

  function readFilterValues() {
    var preset = document.getElementById('dashboardPreset').value
    var startMonth = document.getElementById('dashboardStartDate').value
    var endMonth = document.getElementById('dashboardEndDate').value
    var allTime = preset === 'all_time'
    return {
      preset: preset,
      periodMode: allTime ? 'all_time' : 'months',
      startMonth: startMonth,
      endMonth: endMonth,
      startDate: allTime ? '2025-01-01' : (startMonth + '-01'),
      endDate: allTime ? localDateKey(new Date()) : lastDayOfMonth(endMonth),
      region: document.getElementById('dashboardRegion').value,
      township: document.getElementById('dashboardTownship').value,
      department: document.getElementById('dashboardDepartment').value,
      facilityCode: document.getElementById('dashboardFacility').value,
      facilityTypes: selectedFacilityTypes(),
      trendMode: 'month'
    }
  }

  async function dynamicFacilityOptions(filters) {
    if (!filters.township || !global.firebase || !firebase.firestore) return []
    try {
      var query = firebase.firestore().collection(SUMMARY_COLLECTION).doc('all')
        .collection('scopes')
        .where('geographyType', '==', 'facility')
        .where('township', '==', filters.township)
      if (activeProfile && isRegionalRole(activeProfile.role) && filters.region) {
        query = query.where('region', '==', filters.region)
      }
      var snapshot
      try {
        snapshot = await query.get({ source: 'cache' })
        if (!snapshot || snapshot.empty) {
          if (navigator.onLine) {
            snapshot = await query.get({ source: 'server' })
          }
        }
      } catch (queryError) {
        snapshot = await query.get({ source: 'cache' }).catch(function () { return null })
        if (!snapshot) throw queryError
      }
      var facilities = new Map()
      snapshot.forEach(function (doc) {
        var data = doc.data() || {}
        if (!data.facilityCode) return
        var sourceDepartment = data.sourceDepartment || data.department
        var sourceFacilityType = data.sourceFacilityType || data.facilityType
        if (filters.department && sourceDepartment !== filters.department) return
        if (filters.facilityTypes.length &&
            filters.facilityTypes.indexOf(sourceFacilityType) === -1) return
        var known = global.FacilityConfig &&
          FacilityConfig.getFacilityByCode(data.facilityCode)
        facilities.set(data.facilityCode, {
          value: data.facilityCode,
          label: known
            ? FacilityConfig.getFacilityLabel(known, 'en')
            : (data.facilityName || data.facilityCode)
        })
      })
      return Array.from(facilities.values())
    } catch (error) {
      console.warn('Dashboard facility metadata unavailable:', error)
      return []
    }
  }

  function applyFacilityOptions(list, selected) {
    var byCode = new Map()
    list.forEach(function (item) {
      byCode.set(item.value, item)
    })
    var options = Array.from(byCode.values()).sort(function (left, right) {
      return left.label.localeCompare(right.label)
    })
    replaceOptions(
      document.getElementById('dashboardFacility'),
      options,
      'All facilities',
      selected || ''
    )
  }

  async function refreshFacilityOptions(selected) {
    var filters = readFilterValues()
    var staticList = staticFacilities(filters)
    applyFacilityOptions(staticList, selected)
    dynamicFacilityOptions(filters).then(function (dynamicList) {
      if (!dynamicList.length) return
      applyFacilityOptions(staticList.concat(dynamicList), document.getElementById('dashboardFacility').value || selected)
    }).catch(function () {})
  }

  function updateRoleVisibility(profile) {
    var departmentWrap = document.getElementById('dashboardDepartmentWrap')
    var facilityWrap = document.getElementById('dashboardFacilityWrap')
    var typesWrap = document.getElementById('dashboardFacilityTypesWrap')
    var hideDimensions = isMidwifeRole(profile.role)
    departmentWrap.hidden = hideDimensions
    facilityWrap.hidden = hideDimensions
    typesWrap.hidden = hideDimensions
  }

  async function initializeFilters(profile) {
    activeProfile = profile
    initializePeriodOptions(new Date())
    initializeRegions(profile)
    refreshTownshipOptions(profile)
    updateRoleVisibility(profile)
    renderFacilityTypes('', [])
    await refreshFacilityOptions('')
  }

  function periodKey(filters) {
    if (filters.periodMode === 'all_time' || filters.preset === 'all_time') {
      return 'all-time'
    }
    if (filters.startMonth || filters.endMonth) {
      return (filters.startMonth || '') + '/' + (filters.endMonth || '')
    }
    if (Object.prototype.hasOwnProperty.call(filters, 'year') ||
        Object.prototype.hasOwnProperty.call(filters, 'month')) {
      if (!filters.year) return 'all'
      if (filters.month) return filters.year + '-' + filters.month
      return filters.year
    }
    return (filters.startDate || '') + '/' + (filters.endDate || '')
  }

  function resolveGeography(profile, filters) {
    if (isMidwifeRole(profile.role)) {
      return { type: 'provider', id: profile.uid }
    }
    if (filters.facilityCode) {
      return { type: 'facility', id: filters.facilityCode }
    }
    if (filters.township) {
      return { type: 'township', id: filters.township }
    }
    if (isTmoRole(profile.role)) {
      return { type: 'township', id: profile.township }
    }
    if (filters.region) {
      return { type: 'region', id: filters.region }
    }
    if (isRegionalRole(profile.role)) {
      return { type: 'region', id: profile.region }
    }
    return { type: 'national', id: 'all' }
  }

  function scopeDocId(geography, department, facilityType) {
    var parts = ['geography=' + geography.type + ':' + geography.id]
    if (department) parts.push('department=' + department)
    if (facilityType) parts.push('facilityType=' + facilityType)
    return encodeURIComponent(parts.join('|'))
  }

  function mergeNumericTrees(left, right) {
    if (typeof left === 'number' || typeof right === 'number') {
      return Number(left || 0) + Number(right || 0)
    }
    var output = {}
    var a = left && typeof left === 'object' ? left : {}
    var b = right && typeof right === 'object' ? right : {}
    new Set(Object.keys(a).concat(Object.keys(b))).forEach(function (key) {
      output[key] = mergeNumericTrees(a[key], b[key])
    })
    return output
  }

  function mergeSnapshots(snapshots, requestedCount) {
    var found = snapshots.filter(function (snapshot) {
      return snapshot && snapshot.exists
    })
    if (!found.length) return null
    var summaries = found.map(function (snapshot) {
      return snapshot.data() || {}
    })
    var incompatible = summaries.find(function (summary) {
      return String(summary.schemaVersion || '').indexOf(SCHEMA_PREFIX) !== 0
    })
    if (incompatible) {
      throw new Error('Dashboard summary schema is not compatible with this app version.')
    }
    var dates = summaries.map(function (summary) {
      return safeDate(summary.calculatedAt)
    }).filter(Boolean)
    return {
      metrics: summaries.reduce(function (metrics, summary) {
        return mergeNumericTrees(metrics, summary.metrics || {})
      }, {}),
      calculatedAt: dates.length
        ? new Date(Math.min.apply(null, dates.map(function (date) { return date.getTime() })))
        : null,
      reconciliationStatus: summaries.some(function (summary) {
        return summary.reconciliationStatus !== 'complete' &&
          summary.reconciliationStatus !== 'live'
      }) ? 'updating' : 'complete',
      patientContributionCount: summaries.reduce(function (total, summary) {
        return total + Number(summary.patientContributionCount || 0)
      }, 0),
      foundCount: found.length,
      requestedCount: requestedCount,
      complete: found.length === requestedCount
    }
  }

  function summaryReferences(profile, filters) {
    var geography = resolveGeography(profile, filters)
    var types = filters.facilityCode ? [] : filters.facilityTypes
    var dimensions = types.length ? types : [null]
    var period = periodKey(filters)
    return {
      geography: geography,
      period: period,
      references: dimensions.map(function (type) {
        var id = scopeDocId(geography, filters.department, type)
        return firebase.firestore().collection(SUMMARY_COLLECTION).doc(period)
          .collection('scopes').doc(id)
      })
    }
  }

  function getWithTimeout(reference, source, ms) {
    return Promise.race([
      reference.get({ source: source }),
      new Promise(function (_, reject) {
        setTimeout(function () {
          var error = new Error('timeout')
          error.code = 'unavailable'
          reject(error)
        }, ms)
      })
    ])
  }

  async function getSnapshots(references, source) {
    return Promise.all(references.map(function (reference) {
      return getWithTimeout(reference, source, source === 'server' ? 4000 : 1500)
        .catch(function (error) {
          if (source === 'cache') return null
          throw error
        })
    }))
  }

  function callableUrl(name) {
    var configured = global.firebaseConfig && firebaseConfig.functionUrls || {}
    if (configured[name]) return configured[name]
    var projectId = global.firebaseConfig && firebaseConfig.projectId
    if (!projectId && global.firebase && firebase.app) projectId = firebase.app().options.projectId
    return projectId
      ? 'https://us-central1-' + encodeURIComponent(projectId) +
        '.cloudfunctions.net/' + encodeURIComponent(name)
      : ''
  }

  async function callDashboardV4(name, payload) {
    if (!global.firebase || !firebase.auth || !firebase.auth().currentUser) {
      throw new Error('Your dashboard session has expired.')
    }
    var token = await firebase.auth().currentUser.getIdToken()
    var url = callableUrl(name)
    if (!url) throw new Error('Dashboard service URL is not configured.')
    var response = await fetch(url, {
      method: 'POST',
      mode: 'cors',
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + token
      },
      body: JSON.stringify({ data: payload })
    })
    var body = await response.json().catch(function () { return {} })
    if (!response.ok || (body.error && body.error.status)) {
      var error = new Error(body.error && body.error.message || 'Dashboard service unavailable.')
      error.code = body.error && body.error.status || String(response.status)
      throw error
    }
    return body.result || body
  }

  async function loadV4Summary(profile, filters, onCached) {
    if (!filters.startDate || !filters.endDate) {
      throw new Error('Choose both a start date and an end date.')
    }
    var request = {
      periodMode: filters.periodMode,
      startDate: filters.startDate,
      endDate: filters.endDate,
      region: filters.region,
      township: filters.township,
      department: filters.department,
      facilityCode: filters.facilityCode,
      facilityTypes: filters.facilityTypes,
      trendMode: filters.trendMode
    }
    var cacheKey = 'dashboard-v4:' + JSON.stringify({
      uid: profile.uid,
      scope: resolveGeography(profile, filters),
      periodMode: filters.periodMode,
      startDate: filters.startDate,
      endDate: filters.endDate,
      department: filters.department,
      facilityCode: filters.facilityCode,
      facilityTypes: filters.facilityTypes,
      trendMode: filters.trendMode
    })
    var cached = null
    try {
      cached = JSON.parse(localStorage.getItem(cacheKey) || 'null')
    } catch (error) {}
    if (cached && typeof onCached === 'function') {
      onCached(Object.assign({}, cached, {
        source: 'cache',
        calculatedAt: safeDate(cached.calculatedAt)
      }))
    }
    var result
    if (!navigator.onLine && cached) {
      result = Object.assign({}, cached, { source: 'cache' })
    } else {
      try {
        result = await callDashboardV4('queryDashboardV4', request)
        try {
          localStorage.setItem(cacheKey, JSON.stringify(result))
        } catch (cacheError) {}
      } catch (error) {
        if (!cached) throw error
        result = Object.assign({}, cached, { source: 'cache' })
      }
    }
    return {
      source: result.source || 'server',
      metrics: result.metrics || {},
      seriesByDimension: result.seriesByDimension || {},
      calculatedAt: safeDate(result.calculatedAt),
      patientContributionCount: Number(result.contributionCount || 0),
      complete: result.complete !== false,
      schemaVersion: result.schemaVersion,
      definitionVersion: result.definitionVersion,
      range: { startDate: filters.startDate, endDate: filters.endDate },
      geography: resolveGeography(profile, filters)
    }
  }

  async function loadSummary(profile, filters, onCached) {
    if (global.DashboardMetricsConfig &&
        String(DashboardMetricsConfig.schemaVersion || '').indexOf('analytics-v4') === 0) {
      return loadV4Summary(profile, filters, onCached)
    }
    var request = summaryReferences(profile, filters)
    var cached = null
    try {
      cached = mergeSnapshots(
        await getSnapshots(request.references, 'cache'),
        request.references.length
      )
      if (cached && cached.complete && typeof onCached === 'function') {
        onCached(Object.assign({ source: 'cache' }, cached))
      }
    } catch (cacheError) {
      console.warn('Dashboard cache read failed:', cacheError)
    }

    var firestoreOffline = !navigator.onLine

    if (firestoreOffline) {
      if (cached && cached.complete) {
        return Object.assign({ source: 'cache' }, cached, request)
      }
      var waiting = new Error('Dashboard is reconnecting. Tap Retry in a moment.')
      waiting.code = 'unavailable'
      throw waiting
    }

    var server = null
    var serverError = null
    try {
      server = mergeSnapshots(
        await getSnapshots(request.references, 'server'),
        request.references.length
      )
    } catch (error) {
      serverError = error
    }

    if ((!server || !server.complete) && serverError) {
      await new Promise(function (resolve) { setTimeout(resolve, 1500) })
      try {
        server = mergeSnapshots(
          await getSnapshots(request.references, 'server'),
          request.references.length
        )
        serverError = null
      } catch (retryError) {
        serverError = retryError
      }
    }

    if (server && server.complete) {
      return Object.assign({ source: 'server' }, server, request)
    }
    if (cached && cached.complete) {
      return Object.assign({ source: 'cache' }, cached, request)
    }
    if (serverError && (global.isLikelyFirestoreUnavailableError && isLikelyFirestoreUnavailableError(serverError))) {
      var offline = new Error('Dashboard is reconnecting. Tap Retry in a moment.')
      offline.code = 'unavailable'
      throw offline
    }
    if (!navigator.onLine) {
      throw new Error('No saved dashboard summary is available while offline.')
    }
    var missing = new Error('The backend summary is not available for this filter yet.')
    missing.code = 'summary-not-found'
    throw missing
  }

  function scopeLabel(profile, filters) {
    var geography = resolveGeography(profile, filters)
    var parts = []
    if (geography.type === 'national') parts.push('National')
    else if (geography.type === 'provider') parts.push(profile.name || 'My patients')
    else if (geography.type === 'facility') {
      var facility = global.FacilityConfig &&
        FacilityConfig.getFacilityByCode(geography.id)
      parts.push(facility ? FacilityConfig.getFacilityLabel(facility, 'en') : geography.id)
    } else parts.push(geography.id)
    if (filters.department) parts.push(filters.department.toUpperCase())
    if (filters.facilityTypes.length) {
      parts.push(filters.facilityTypes.map(facilityTypeLabel).join(', '))
    }
    return parts.join(' · ')
  }

  global.DashboardData = Object.freeze({
    initializeFilters: initializeFilters,
    refreshTownshipOptions: refreshTownshipOptions,
    renderFacilityTypes: renderFacilityTypes,
    refreshFacilityOptions: refreshFacilityOptions,
    readFilterValues: readFilterValues,
    selectedFacilityTypes: selectedFacilityTypes,
    loadSummary: loadSummary,
    loadV4Summary: loadV4Summary,
    callDashboardV4: callDashboardV4,
    periodKey: periodKey,
    initializePeriodOptions: initializePeriodOptions,
    resolveGeography: resolveGeography,
    scopeDocId: scopeDocId,
    scopeLabel: scopeLabel,
    facilityTypeLabel: facilityTypeLabel,
    isCentralRole: isCentralRole,
    isRegionalRole: isRegionalRole,
    isTmoRole: isTmoRole,
    isMidwifeRole: isMidwifeRole
  })
})(typeof window !== 'undefined' ? window : globalThis)
