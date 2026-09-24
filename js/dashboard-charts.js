(function (global) {
  'use strict'

  var chartInstances = {}
  var chartDefinitions = {}
  var chartRenderTokens = {}
  var observedWidths = {}
  var renderedSections = new Set()
  var currentMetrics = {}
  var resizeObserver = null
  var intersectionObserver = null
  var resizeTimer = null

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;')
  }

  function sectionId(section) {
    return 'dashboard-section-' + section.toLowerCase().replace(/[^a-z0-9]+/g, '-')
  }

  function chartId(definition) {
    return 'dashboard-chart-' + definition.key
  }

  function requestFrame(callback) {
    if (typeof global.requestAnimationFrame === 'function') {
      global.requestAnimationFrame(callback)
      return
    }
    global.setTimeout(callback, 0)
  }

  function destroyChart(id) {
    chartRenderTokens[id] = (chartRenderTokens[id] || 0) + 1
    if (!chartInstances[id]) return
    try {
      chartInstances[id].destroy()
    } catch (error) {
      console.warn('Dashboard chart cleanup failed:', id, error)
    }
    delete chartInstances[id]
  }

  function destroyAllCharts() {
    Object.keys(chartInstances).forEach(destroyChart)
  }

  function isChartVisible(element) {
    if (!element || element.isConnected === false) return false
    var panel = element.closest ? element.closest('.dashboard-section') : null
    if (panel && !panel.classList.contains('is-active')) return false
    if (element.closest && element.closest('[hidden]')) return false
    if (typeof element.getBoundingClientRect !== 'function') return true
    var rectangle = element.getBoundingClientRect()
    return Number(rectangle.width || element.clientWidth || 0) > 0
  }

  function initializeLifecycleObservers() {
    if (!resizeObserver && typeof global.ResizeObserver === 'function') {
      resizeObserver = new global.ResizeObserver(function (entries) {
        entries.forEach(function (entry) {
          var element = entry.target
          var definition = chartDefinitions[element.id]
          if (!definition || !isChartVisible(element)) return
          var width = Math.round(entry.contentRect.width)
          if (!width || Math.abs(width - Number(observedWidths[element.id] || 0)) < 8) return
          observedWidths[element.id] = width
          scheduleChartRender(definition, true)
        })
      })
    }
    if (!intersectionObserver && typeof global.IntersectionObserver === 'function') {
      intersectionObserver = new global.IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          var definition = chartDefinitions[entry.target.id]
          if (entry.isIntersecting && definition && !chartInstances[entry.target.id]) {
            scheduleChartRender(definition, false)
          }
        })
      })
    }
  }

  function observeChart(element, definition) {
    chartDefinitions[element.id] = definition
    if (!observedWidths[element.id] && typeof element.getBoundingClientRect === 'function') {
      observedWidths[element.id] = Math.round(element.getBoundingClientRect().width || 0)
    }
    if (resizeObserver) resizeObserver.observe(element)
    if (intersectionObserver) intersectionObserver.observe(element)
  }

  function unobserveCharts(container) {
    if (!container) return
    container.querySelectorAll('.dashboard-chart').forEach(function (element) {
      if (resizeObserver) resizeObserver.unobserve(element)
      if (intersectionObserver) intersectionObserver.unobserve(element)
      delete chartDefinitions[element.id]
      delete observedWidths[element.id]
    })
  }

  function initializeSections(onSelect) {
    var tabs = document.getElementById('dashboardTabs')
    var sections = document.getElementById('dashboardSections')
    initializeLifecycleObservers()
    unobserveCharts(sections)
    destroyAllCharts()
    renderedSections.clear()
    tabs.innerHTML = ''
    sections.innerHTML = ''
    DashboardMetricsConfig.sections.forEach(function (section, index) {
      var id = sectionId(section)
      var tab = document.createElement('button')
      tab.className = 'dashboard-tab'
      tab.type = 'button'
      tab.id = id + '-tab'
      tab.setAttribute('role', 'tab')
      tab.setAttribute('aria-controls', id)
      tab.setAttribute('aria-selected', index === 0 ? 'true' : 'false')
      tab.textContent = section
      tab.addEventListener('click', function () {
        selectSection(section)
        if (typeof onSelect === 'function') onSelect(section)
      })
      tabs.appendChild(tab)

      var panel = document.createElement('section')
      panel.id = id
      panel.className = 'dashboard-section' + (index === 0 ? ' is-active' : '')
      panel.setAttribute('role', 'tabpanel')
      panel.setAttribute('aria-labelledby', tab.id)
      panel.innerHTML =
        '<h2 class="dashboard-section-heading">' + escapeHtml(section) + '</h2>' +
        '<div class="dashboard-kpi-grid"></div>' +
        '<div class="dashboard-chart-grid"></div>'
      sections.appendChild(panel)
    })
  }

  function selectSection(section) {
    DashboardMetricsConfig.sections.forEach(function (name) {
      var active = name === section
      var id = sectionId(name)
      var tab = document.getElementById(id + '-tab')
      var panel = document.getElementById(id)
      if (tab) tab.setAttribute('aria-selected', active ? 'true' : 'false')
      if (panel) panel.classList.toggle('is-active', active)
    })
    renderSection(section)
    requestFrame(function () {
      refreshChartsInSection(section, false)
    })
  }

  function number(path) {
    return DashboardMetricsConfig.numberAtPath(currentMetrics, path)
  }

  function numeratorDisplay(definition) {
    var numerator = number(definition.numerator)
    var denominator = definition.denominator ? number(definition.denominator) : 0
    if (definition.format === 'average') {
      return denominator > 0 ? (numerator / denominator).toFixed(1) : '—'
    }
    if (definition.format === 'percent') {
      return denominator > 0 ? ((numerator / denominator) * 100).toFixed(1) + '%' : '—'
    }
    return numerator.toLocaleString()
  }

  function ratioDetail(definition) {
    if (!definition.denominator) return ''
    var numerator = number(definition.numerator)
    var denominator = number(definition.denominator)
    var percentage = denominator > 0 ? ((numerator / denominator) * 100).toFixed(1) + '%' : '—'
    if (definition.format === 'average') {
      return numerator.toLocaleString() + ' visits / ' + denominator.toLocaleString() + ' clients'
    }
    if (definition.format === 'percent') {
      return numerator.toLocaleString() + ' of ' + denominator.toLocaleString()
    }
    return numerator.toLocaleString() + ' of ' + denominator.toLocaleString() + ' · ' + percentage
  }

  function detailText(definition) {
    var details = []
    if (definition.detailPaths) {
      definition.detailPaths.forEach(function (path, index) {
        details.push(
          escapeHtml(definition.detailLabels[index]) + ' <strong>' +
          number(path).toLocaleString() + '</strong>'
        )
      })
    }
    var ratio = ratioDetail(definition)
    if (ratio) details.push(escapeHtml(ratio))
    return details.join(' · ')
  }

  function renderKpi(definition) {
    var detail = detailText(definition)
    var supplementalClass = definition.supplemental ? ' is-supplemental' : ''
    var supplementalBadge = definition.supplemental
      ? '<span class="dashboard-supplemental-badge">Supplemental</span>'
      : ''
    return '<article class="dashboard-kpi' + supplementalClass + '">' +
      supplementalBadge +
      '<p class="dashboard-kpi-label">' + escapeHtml(definition.label) + '</p>' +
      '<div class="dashboard-kpi-value">' + escapeHtml(numeratorDisplay(definition)) + '</div>' +
      (detail ? '<div class="dashboard-kpi-detail">' + detail + '</div>' : '') +
      '<button class="dashboard-info-button" type="button" data-indicator-key="' +
      escapeHtml(definition.key) + '" aria-label="View calculation for ' +
      escapeHtml(definition.label) + '"><i class="fas fa-info-circle" aria-hidden="true"></i></button>' +
      '</article>'
  }

  function sortedMapEntries(map) {
    return Object.keys(map || {}).map(function (key) {
      return [key, Number(map[key] || 0)]
    }).filter(function (item) {
      return item[1] > 0
    }).sort(function (left, right) {
      return right[1] - left[1] || left[0].localeCompare(right[0])
    }).slice(0, 12)
  }

  function numberAtFirstAvailablePath(metrics, paths) {
    for (var index = 0; index < paths.length; index += 1) {
      var value = DashboardMetricsConfig.valueAtPath(metrics, paths[index])
      if (value !== undefined && value !== null && value !== '') {
        var numberValue = Number(value)
        return Number.isFinite(numberValue) ? numberValue : 0
      }
    }
    return 0
  }

  function entriesForDefinition(definition, metrics) {
    var source = metrics || {}
    if (definition.chartValues) {
      return definition.chartValues.map(function (item) {
        return [item.label, DashboardMetricsConfig.numberAtPath(source, item.path)]
      })
    }
    if (definition.mapCategories) {
      return definition.mapCategories.map(function (item) {
        return [item.label, numberAtFirstAvailablePath(source, item.paths)]
      })
    }
    var path = definition.detailMap || definition.numerator
    var value = DashboardMetricsConfig.valueAtPath(source, path)
    return sortedMapEntries(value && typeof value === 'object' ? value : {})
  }

  function hasRecordedEntries(entries) {
    return entries.some(function (item) {
      return Number(item[1] || 0) > 0
    })
  }

  function emptyTextForDefinition(definition) {
    return definition.emptyText || (
      definition.key === 'high_risk_other_diseases'
        ? 'No recorded historical names'
        : 'No data for this filter'
    )
  }

  function chartCard(definition) {
    var infoButton = definition.key === 'overview_service_comparison'
      ? ''
      : '<button class="dashboard-info-button dashboard-chart-info-button" type="button" data-indicator-key="' +
        escapeHtml(definition.key) + '" aria-label="View calculation for ' +
        escapeHtml(definition.label) + '"><i class="fas fa-info-circle" aria-hidden="true"></i></button>'
    var supplementalClass = definition.supplemental ? ' is-supplemental' : ''
    var supplementalBadge = definition.supplemental
      ? '<span class="dashboard-supplemental-badge">Supplemental</span>'
      : ''
    return '<article class="dashboard-chart-card' + supplementalClass + '">' +
      supplementalBadge +
      '<h3 class="dashboard-chart-title">' + escapeHtml(definition.label) + '</h3>' +
      infoButton +
      '<div id="' + chartId(definition) + '" class="dashboard-chart" role="img" aria-label="' +
      escapeHtml(definition.label) + ' chart"></div>' +
      '</article>'
  }

  function overviewChartDefinition() {
    return {
      key: 'overview_service_comparison',
      label: 'Service Headcount',
      chart: 'bar',
      detailMap: '__overview'
    }
  }

  function overviewMap() {
    return {
      'Registered Mothers': number('registration.mothers'),
      'Registered Babies': number('registration.babies'),
      ANC: number('anc.clients'),
      'High Risk': number('highRisk.clients'),
      'Delivery Notes': number('delivery.actualNotes'),
      PNC: number('pnc.clients'),
      'NBC Clients': number('newborn.canonicalClients'),
      Referral: number('referral.total'),
      'Joint Care': number('jointCare.clients')
    }
  }

  function baseChartOptions(definition, entries) {
    var labels = entries.map(function (item) { return item[0] })
    var values = entries.map(function (item) { return item[1] })
    var donut = definition.chart === 'donut'
    return {
      chart: {
        type: donut ? 'donut' : 'bar',
        height: 290,
        fontFamily: 'inherit',
        toolbar: { show: false },
        animations: {
          enabled: !global.matchMedia ||
            !global.matchMedia('(prefers-reduced-motion: reduce)').matches
        }
      },
      series: donut ? values : [{ name: definition.label, data: values }],
      labels: donut ? labels : undefined,
      xaxis: donut ? undefined : {
        categories: labels,
        labels: {
          rotate: labels.length > 5 ? -35 : 0,
          trim: true,
          style: { colors: '#64748b', fontSize: '11px' }
        }
      },
      yaxis: donut ? undefined : {
        min: 0,
        forceNiceScale: true,
        labels: { formatter: function (value) { return Math.round(value).toLocaleString() } }
      },
      plotOptions: donut ? {
        pie: { donut: { size: '62%' } }
      } : {
        bar: {
          borderRadius: 6,
          columnWidth: '54%',
          horizontal: labels.some(function (label) { return label.length > 20 })
        }
      },
      dataLabels: { enabled: donut, formatter: function (value) { return value.toFixed(1) + '%' } },
      colors: donut
        ? ['#047857', '#0f766e', '#2563eb', '#d97706', '#7c3aed', '#dc2626', '#0891b2']
        : ['#047857'],
      legend: {
        position: 'bottom',
        fontSize: '12px',
        labels: { colors: '#475569' }
      },
      grid: { borderColor: '#e2e8f0', strokeDashArray: 4 },
      tooltip: {
        y: { formatter: function (value) { return Number(value || 0).toLocaleString() } }
      },
      noData: { text: 'No data for this filter' },
      responsive: [{
        breakpoint: 480,
        options: {
          chart: { height: 270 },
          legend: { position: 'bottom' }
        }
      }]
    }
  }

  function chartEntries(definition) {
    if (definition.detailMap === '__overview') {
      return sortedMapEntries(overviewMap())
    }
    return entriesForDefinition(definition, currentMetrics)
  }

  function renderChartFallback(element, definition, entries) {
    var rows = entries.filter(function (item) {
      return Number(item[1] || 0) > 0
    }).map(function (item) {
      return '<li><span>' + escapeHtml(item[0]) + '</span><strong>' +
        Number(item[1] || 0).toLocaleString() + '</strong></li>'
    }).join('')
    element.innerHTML =
      '<div class="dashboard-chart-fallback" role="status">' +
      '<p>Chart display unavailable. Recorded values:</p>' +
      '<ul>' + rows + '</ul>' +
      '</div>'
    element.setAttribute(
      'aria-label',
      definition.label + ' values shown as a list because the chart could not render'
    )
  }

  function performChartRender(definition, entries) {
    var id = chartId(definition)
    var element = document.getElementById(id)
    if (!element || !global.ApexCharts || !isChartVisible(element)) return

    destroyChart(id)
    var token = chartRenderTokens[id]
    element.innerHTML = ''
    element.setAttribute('aria-label', definition.label + ' chart')

    var chart
    try {
      chart = new global.ApexCharts(element, baseChartOptions(definition, entries))
      chartInstances[id] = chart
      var renderResult = chart.render()
      Promise.resolve(renderResult).catch(function (error) {
        if (chartRenderTokens[id] !== token) return
        console.error('Dashboard chart render failed:', id, error)
        try {
          chart.destroy()
        } catch (cleanupError) {
          console.warn('Dashboard chart cleanup failed:', id, cleanupError)
        }
        delete chartInstances[id]
        renderChartFallback(element, definition, entries)
      })
    } catch (error) {
      console.error('Dashboard chart render failed:', id, error)
      delete chartInstances[id]
      renderChartFallback(element, definition, entries)
    }
  }

  function scheduleChartRender(definition, force) {
    var id = chartId(definition)
    var element = document.getElementById(id)
    if (!element) return
    var entries = chartEntries(definition)
    observeChart(element, definition)

    if (!hasRecordedEntries(entries)) {
      destroyChart(id)
      element.innerHTML = '<div class="dashboard-chart-empty" role="status">' +
        escapeHtml(emptyTextForDefinition(definition)) + '</div>'
      return
    }

    if (!global.ApexCharts) {
      renderChartFallback(element, definition, entries)
      return
    }

    if (chartInstances[id] && !force) return
    requestFrame(function () {
      if (!isChartVisible(element)) return
      performChartRender(definition, entries)
    })
  }

  function renderChart(definition) {
    scheduleChartRender(definition, false)
  }

  function refreshChartsInSection(section, force) {
    var panel = document.getElementById(sectionId(section))
    if (!panel || !panel.classList.contains('is-active')) return
    panel.querySelectorAll('.dashboard-chart').forEach(function (element) {
      var definition = chartDefinitions[element.id]
      if (definition) scheduleChartRender(definition, force)
    })
  }

  function refreshVisibleCharts(force) {
    DashboardMetricsConfig.sections.forEach(function (section) {
      refreshChartsInSection(section, force)
    })
  }

  function attachDefinitionButtons(panel) {
    panel.querySelectorAll('[data-indicator-key]').forEach(function (button) {
      button.addEventListener('click', function () {
        showDefinition(button.getAttribute('data-indicator-key'))
      })
    })
  }

  function showDefinition(key) {
    var definition = DashboardMetricsConfig.allDefinitions.find(function (item) {
      return item.key === key
    })
    if (!definition) return
    document.getElementById('dashboardDefinitionTitle').textContent =
      definition.label + ' calculation'
    var numerator = definition.format === 'map'
      ? entriesForDefinition(definition, currentMetrics).reduce(function (total, item) {
        return total + Number(item[1] || 0)
      }, 0)
      : number(definition.numerator)
    var denominator = definition.denominator ? number(definition.denominator) : null
    var result = definition.format === 'map'
      ? numerator.toLocaleString()
      : numeratorDisplay(definition)
    document.getElementById('dashboardDefinitionBody').innerHTML =
      '<p>' + escapeHtml(definition.definition) + '</p>' +
      '<dl class="row mb-0">' +
      '<dt class="col-5">Counted as</dt><dd class="col-7">' +
      escapeHtml(definition.countedAs) + '</dd>' +
      '<dt class="col-5">Formula</dt><dd class="col-7">' +
      escapeHtml(DashboardMetricsConfig.formulaForDefinition(definition)) + '</dd>' +
      '<dt class="col-5">' + escapeHtml(definition.numeratorLabel) +
      '</dt><dd class="col-7">' + numerator.toLocaleString() + '</dd>' +
      (denominator == null ? '' : '<dt class="col-5">' +
        escapeHtml(definition.denominatorLabel) + '</dt><dd class="col-7">' +
        denominator.toLocaleString() + '</dd>') +
      '<dt class="col-5">Displayed result</dt><dd class="col-7"><strong>' +
      escapeHtml(result) + '</strong></dd>' +
      '</dl>'
    if (global.bootstrap && bootstrap.Modal) {
      bootstrap.Modal.getOrCreateInstance(
        document.getElementById('dashboardDefinitionModal')
      ).show()
    }
  }

  function renderSection(section) {
    var panel = document.getElementById(sectionId(section))
    if (!panel) return
    if (renderedSections.has(section)) {
      refreshChartsInSection(section, false)
      return
    }
    var definitions = DashboardMetricsConfig.definitionsForSection(section)
    var kpis = definitions.filter(function (definition) {
      return !definition.chartOnly &&
        definition.format !== 'map' &&
        definition.format !== 'series'
    })
    var charts = definitions.filter(function (definition) {
      return definition.format === 'map' ||
        definition.format === 'series' ||
        definition.detailMap ||
        definition.chartOnly
    })
    if (section === 'Overview') charts.push(overviewChartDefinition())
    unobserveCharts(panel)
    panel.querySelector('.dashboard-kpi-grid').innerHTML = kpis.map(renderKpi).join('')
    panel.querySelector('.dashboard-chart-grid').innerHTML = charts.map(chartCard).join('')
    attachDefinitionButtons(panel)
    charts.forEach(renderChart)
    renderedSections.add(section)
  }

  function setMetrics(metrics) {
    currentMetrics = metrics || {}
    renderedSections.clear()
    destroyAllCharts()
    var active = document.querySelector('.dashboard-tab[aria-selected="true"]')
    var activeSection = active
      ? DashboardMetricsConfig.sections.find(function (section) {
        return active.id === sectionId(section) + '-tab'
      })
      : 'Overview'
    renderSection(activeSection || 'Overview')
  }

  if (typeof global.addEventListener === 'function') {
    global.addEventListener('resize', function () {
      global.clearTimeout(resizeTimer)
      resizeTimer = global.setTimeout(function () {
        refreshVisibleCharts(true)
      }, 140)
    })
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', function () {
        if (!document.hidden) refreshVisibleCharts(false)
      })
    }
  }

  global.DashboardCharts = Object.freeze({
    initializeSections: initializeSections,
    selectSection: selectSection,
    setMetrics: setMetrics,
    renderSection: renderSection,
    showDefinition: showDefinition,
    entriesForDefinition: entriesForDefinition,
    emptyTextForDefinition: emptyTextForDefinition
  })
})(typeof window !== 'undefined' ? window : globalThis)
