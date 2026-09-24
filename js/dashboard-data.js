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

  function initializePeriodOptions(now) {
    var year = document.getElementById('dashboardYear')
    var month = document.getElementById('dashboardMonth')
    var currentYear = (now || new Date()).getFullYear()
    var years = []
    for (var value = currentYear; value >= currentYear - 7; value -= 1) {
      years.push({ value: String(value), label: String(value) })
    }
    replaceOptions(year, years, 'All time', '')
    var monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ]
    replaceOptions(month, monthNames.map(function (name, index) {
      return { value: String(index + 1).padStart(2, '0'), label: name }
    }), 'All months', '')
    month.disabled = true
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
    return {
      year: document.getElementById('dashboardYear').value,
      month: document.getElementById('dashboardMonth').value,
      region: document.getElementById('dashboardRegion').value,
      township: document.getElementById('dashboardTownship').value,
      department: document.getElementById('dashboardDepartment').value,
      facilityCode: document.getElementById('dashboardFacility').value,
      facilityTypes: selectedFacilityTypes()
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
      var snapshot = await query.get({ source: navigator.onLine ? 'server' : 'cache' })
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

  async function refreshFacilityOptions(selected) {
    var filters = readFilterValues()
    var staticList = staticFacilities(filters)
    var dynamicList = await dynamicFacilityOptions(filters)
    var byCode = new Map()
    staticList.concat(dynamicList).forEach(function (item) {
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
    if (!filters.year) return 'all'
    if (filters.month) return filters.year + '-' + filters.month
    return filters.year
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

  async function getSnapshots(references, source) {
    return Promise.all(references.map(function (reference) {
      return reference.get({ source: source }).catch(function (error) {
        if (source === 'cache') return null
        throw error
      })
    }))
  }

  async function loadSummary(profile, filters, onCached) {
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

    if (!navigator.onLine) {
      if (cached && cached.complete) {
        return Object.assign({ source: 'cache' }, cached, request)
      }
      throw new Error('No saved dashboard summary is available while offline.')
    }

    var server = mergeSnapshots(
      await getSnapshots(request.references, 'server'),
      request.references.length
    )
    if (!server || !server.complete) {
      if (cached && cached.complete) {
        return Object.assign({ source: 'cache' }, cached, request)
      }
      var missing = new Error('The backend summary is not available for this filter yet.')
      missing.code = 'summary-not-found'
      throw missing
    }
    return Object.assign({ source: 'server' }, server, request)
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
