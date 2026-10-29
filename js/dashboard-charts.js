(function (global) {
  'use strict'

  var chartInstances = {}
  var chartDefinitions = {}
  var chartRenderTokens = {}
  var observedWidths = {}
  var renderedSections = new Set()
  var currentMetrics = {}
  var currentSeries = {}
  var activeTrendMode = 'month'
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

  function chartId(definition, chartSpec, index) {
    var suffix = chartSpec && (chartSpec.dimension || chartSpec.type) || 'default'
    return 'dashboard-chart-' + sectionId(definition.section) + '-' +
      definition.key + '-' + suffix + '-' + Number(index || 0)
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
          var chartDefinition = chartDefinitions[element.id]
          if (!chartDefinition || !isChartVisible(element)) return
          var width = Math.round(entry.contentRect.width)
          if (!width || Math.abs(width - Number(observedWidths[element.id] || 0)) < 8) return
          observedWidths[element.id] = width
          scheduleChartRender(
            chartDefinition.definition,
            chartDefinition.chartSpec,
            chartDefinition.index,
            true
          )
        })
      })
    }
    if (!intersectionObserver && typeof global.IntersectionObserver === 'function') {
      intersectionObserver = new global.IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          var chartDefinition = chartDefinitions[entry.target.id]
          if (entry.isIntersecting && chartDefinition && !chartInstances[entry.target.id]) {
            scheduleChartRender(
              chartDefinition.definition,
              chartDefinition.chartSpec,
              chartDefinition.index,
              false
            )
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
      tab.setAttribute('tabindex', index === 0 ? '0' : '-1')
      tab.textContent = section
      tab.addEventListener('click', function () {
        selectSection(section)
        if (typeof onSelect === 'function') onSelect(section)
      })
      tab.addEventListener('keydown', function (event) {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
        event.preventDefault()
        var targetIndex = event.key === 'Home' ? 0
          : event.key === 'End' ? DashboardMetricsConfig.sections.length - 1
            : (index + (event.key === 'ArrowRight' ? 1 : -1) +
              DashboardMetricsConfig.sections.length) % DashboardMetricsConfig.sections.length
        var target = tabs.children[targetIndex]
        if (target) {
          target.focus()
          target.click()
        }
      })
      tabs.appendChild(tab)

      var panel = document.createElement('section')
      panel.id = id
      panel.className = 'dashboard-section' + (index === 0 ? ' is-active' : '')
      panel.setAttribute('role', 'tabpanel')
      panel.setAttribute('aria-labelledby', tab.id)
      var sectionNote = DashboardMetricsConfig.sectionNotes[section]
      panel.innerHTML =
        '<h2 class="dashboard-section-heading">' + escapeHtml(section) + '</h2>' +
        (sectionNote
          ? '<p class="dashboard-section-note">' + escapeHtml(sectionNote) + '</p>'
          : '') +
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
      if (tab) tab.setAttribute('tabindex', active ? '0' : '-1')
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
    var rawNumerator = DashboardMetricsConfig.valueAtPath(currentMetrics, definition.numerator)
    var numerator = definition.format === 'map'
      ? Object.keys(rawNumerator || {}).reduce(function (total, key) {
        return total + Number(rawNumerator[key] || 0)
      }, 0)
      : number(definition.numerator)
    var denominator = definition.denominator ? number(definition.denominator) : 0
    if (definition.format === 'average') {
      return denominator > 0 ? (numerator / denominator).toFixed(1) : '—'
    }
    if (definition.format === 'averageGrams') {
      return denominator > 0 ? Math.round(numerator / denominator).toLocaleString() + ' g' : '—'
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
    if (definition.format === 'average' || definition.format === 'averageGrams') {
      return numerator.toLocaleString() + ' visits / ' + denominator.toLocaleString() + ' clients'
    }
    if (definition.format === 'percent') {
      return numerator.toLocaleString() + ' of ' + denominator.toLocaleString()
    }
    return numerator.toLocaleString() + ' of ' + denominator.toLocaleString() + ' · ' + percentage
  }

  function detailText(definition) {
    var details = []
    if (definition.detailCalculations) {
      definition.detailCalculations.forEach(function (calculation) {
        var value = calculation.path
          ? number(calculation.path)
          : Math.max(
            0,
            number(calculation.minuendPath) - number(calculation.subtrahendPath)
          )
        details.push(
          escapeHtml(calculation.label) + ' <strong>' +
          value.toLocaleString() + '</strong>'
        )
      })
    }
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
      '<span class="dashboard-kpi-label">' + escapeHtml(definition.label) + '</span>' +
      '<span class="dashboard-kpi-value">' + escapeHtml(numeratorDisplay(definition)) + '</span>' +
      (detail
        ? '<span class="dashboard-kpi-detail">' + detail + '</span>'
        : '') +
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

  function facilityLabel(value) {
    var facility = global.FacilityConfig &&
      FacilityConfig.getFacilityByCode(value)
    return facility
      ? FacilityConfig.getFacilityLabel(facility, 'en')
      : String(value || 'Unknown facility')
  }

  function entriesForDefinition(definition, metrics, chartSpec) {
    var source = metrics || {}
    var dimension = chartSpec && chartSpec.dimension
    var series = currentSeries[dimension || activeTrendMode] || []
    if (['facility', 'township', 'region'].includes(dimension) &&
        !Object.prototype.hasOwnProperty.call(currentSeries, dimension)) {
      return []
    }
    if (dimension === 'month' || (!dimension && definition.chart === 'trend' && definition.format !== 'map')) {
      return series.map(function (item) {
        return [item.label, DashboardMetricsConfig.numberAtPath(item.metrics || {}, definition.numerator)]
      })
    }
    if (dimension === 'facility' || dimension === 'township' || dimension === 'region') {
      return series.map(function (item) {
        return [
          dimension === 'facility' ? facilityLabel(item.label) : item.label,
          DashboardMetricsConfig.numberAtPath(item.metrics || {}, definition.numerator)
        ]
      }).sort(function (left, right) {
        return right[1] - left[1] || left[0].localeCompare(right[0])
      })
    }
    if (series.length && definition.chart === 'comparison' && definition.comparison) {
      return definition.comparison.map(function (item) {
        var totals = series.reduce(function (result, entry) {
          return {
            numerator: result.numerator +
              DashboardMetricsConfig.numberAtPath(entry.metrics || {}, item.numerator),
            denominator: result.denominator +
              DashboardMetricsConfig.numberAtPath(entry.metrics || {}, item.denominator)
          }
        }, { numerator: 0, denominator: 0 })
        return [item.label, totals.denominator ? totals.numerator / totals.denominator : 0]
      })
    }
    if (definition.chartValues) {
      return definition.chartValues.map(function (item) {
        var numerator = DashboardMetricsConfig.numberAtPath(source, item.path)
        var denominator = item.denominator
          ? DashboardMetricsConfig.numberAtPath(source, item.denominator)
          : 1
        return [item.label, denominator ? numerator / denominator : 0]
      })
    }
    if (dimension === 'outcomes') {
      return sortedMapEntries(source.serviceClosure && source.serviceClosure.outcomes)
    }
    if (dimension === 'ageGroups') {
      var ageGroups = source.registration && source.registration.ageGroups || {}
      return ['Under 18', '18-35', 'Over 35', 'Unknown'].map(function (label) {
        return [label, Number(ageGroups[label] || 0)]
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

  function chartCard(definition, chartSpec, index) {
    var supplementalClass = definition.supplemental ? ' is-supplemental' : ''
    var supplementalBadge = definition.supplemental
      ? '<span class="dashboard-supplemental-badge">Supplemental</span>'
      : ''
    var title = chartSpec && chartSpec.title
      ? definition.label + ' · ' + chartSpec.title
      : definition.label
    return '<article class="dashboard-chart-card' + supplementalClass + '">' +
      supplementalBadge +
      '<h3 class="dashboard-chart-title">' + escapeHtml(title) + '</h3>' +
      (definition.helperText
        ? '<p class="dashboard-chart-note">' + escapeHtml(definition.helperText) + '</p>'
        : '') +
      '<div id="' + chartId(definition, chartSpec, index) + '" class="dashboard-chart" role="img" aria-label="' +
      escapeHtml(title) + ' chart"></div>' +
      '</article>'
  }

  function baseChartOptions(definition, entries, chartType) {
    var labels = entries.map(function (item) { return item[0] })
    var values = entries.map(function (item) { return item[1] })
    var selectedChartType = chartType || definition.chart
    var donut = selectedChartType === 'donut'
    var line = selectedChartType === 'trend'
    var options = {
      chart: {
        type: donut ? 'donut' : line ? 'line' : 'bar',
        height: 270,
        fontFamily: 'inherit',
        toolbar: { show: false },
        animations: {
          enabled: !global.matchMedia ||
            !global.matchMedia('(prefers-reduced-motion: reduce)').matches
        }
      },
      series: donut ? values : [{ name: definition.label, data: values }],
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
          chart: { height: 250 },
          legend: { position: 'bottom' }
        }
      }]
    }

    if (donut) {
      options.labels = labels
      options.plotOptions = {
        pie: {
          donut: {
            size: '62%',
            labels: {
              show: true,
              total: {
                show: true,
                label: 'Total',
                formatter: function (context) {
                  return context.globals.seriesTotals.reduce(function (total, value) {
                    return total + Number(value || 0)
                  }, 0).toLocaleString()
                }
              }
            }
          }
        }
      }
      options.dataLabels = {
        enabled: true,
        formatter: function (value) { return value.toFixed(1) + '%' }
      }
      return options
    }

    var horizontal = labels.some(function (label) { return String(label).length > 20 })
    var formatAxisLabel = function (value) {
      if (typeof value === 'string' && value.trim() && Number.isNaN(Number(value))) return value
      var number = Number(value)
      return Number.isFinite(number) ? Math.round(number).toLocaleString() : (value == null ? '' : String(value))
    }
    options.xaxis = {
      categories: labels,
      labels: {
        rotate: horizontal || labels.length <= 5 ? 0 : -35,
        trim: true,
        style: { colors: '#64748b', fontSize: '11px' },
        formatter: formatAxisLabel
      }
    }
    options.yaxis = {
      labels: {
        style: { colors: '#64748b', fontSize: '11px' },
        formatter: formatAxisLabel
      }
    }
    if (!horizontal) {
      options.yaxis.min = 0
      options.yaxis.forceNiceScale = true
    }
    if (line) {
      options.stroke = { curve: 'smooth', width: 3 }
      options.markers = { size: 4 }
      options.fill = { type: 'gradient', gradient: { opacityFrom: 0.3, opacityTo: 0.05 } }
    }
    options.plotOptions = {
      bar: {
        borderRadius: 6,
        columnWidth: '54%',
        horizontal: horizontal
      }
    }
    if (horizontal) options.chart.height = Math.max(270, labels.length * 34)
    options.dataLabels = { enabled: false }
    return options
  }

  function chartEntries(definition, chartSpec) {
    return entriesForDefinition(definition, currentMetrics, chartSpec)
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

  function performChartRender(definition, chartSpec, index, entries) {
    var id = chartId(definition, chartSpec, index)
    var element = document.getElementById(id)
    if (!element || !global.ApexCharts || !isChartVisible(element)) return

    destroyChart(id)
    var token = chartRenderTokens[id]
    element.innerHTML = ''
    element.setAttribute('aria-label', definition.label + ' chart')

    var chart
    try {
      chart = new global.ApexCharts(
        element,
        baseChartOptions(definition, entries, chartSpec.type || definition.chart)
      )
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

  function scheduleChartRender(definition, chartSpec, index, force) {
    var id = chartId(definition, chartSpec, index)
    var element = document.getElementById(id)
    if (!element) return
    var entries = chartEntries(definition, chartSpec)
    observeChart(element, {
      definition: definition,
      chartSpec: chartSpec,
      index: index
    })

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
      performChartRender(definition, chartSpec, index, entries)
    })
  }

  function renderChart(definition, chartSpec, index) {
    scheduleChartRender(definition, chartSpec, index, false)
  }

  function refreshChartsInSection(section, force) {
    var panel = document.getElementById(sectionId(section))
    if (!panel || !panel.classList.contains('is-active')) return
    panel.querySelectorAll('.dashboard-chart').forEach(function (element) {
      var definition = chartDefinitions[element.id]
      if (definition) {
        scheduleChartRender(
          definition.definition,
          definition.chartSpec,
          definition.index,
          force
        )
      }
    })
  }

  function refreshVisibleCharts(force) {
    DashboardMetricsConfig.sections.forEach(function (section) {
      refreshChartsInSection(section, force)
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
      return !definition.chartOnly
    })
    unobserveCharts(panel)
    var grid = panel.querySelector('.dashboard-kpi-grid')
    grid.setAttribute('data-section', section)
    grid.innerHTML = kpis.map(renderKpi).join('')
    var chartDefinitions = []
    definitions.forEach(function (definition) {
      var charts = definition.charts || [{
        type: definition.chart === 'trend' ? 'trend' : definition.chart,
        dimension: definition.chart === 'trend' ? 'month' : ''
      }]
      charts.forEach(function (chartSpec, index) {
        if (chartSpec.dimension &&
            chartSpec.dimension !== 'month' &&
            !Object.prototype.hasOwnProperty.call(currentSeries, chartSpec.dimension)) {
          return
        }
        chartDefinitions.push({ definition: definition, chartSpec: chartSpec, index: chartDefinitions.length })
      })
    })
    panel.querySelector('.dashboard-chart-grid').innerHTML = chartDefinitions.map(function (item) {
      return chartCard(item.definition, item.chartSpec, item.index)
    }).join('')
    chartDefinitions.forEach(function (item) {
      renderChart(item.definition, item.chartSpec, item.index)
    })
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

  function setSeries(series) {
    currentSeries = series || {}
    renderedSections.clear()
    var active = document.querySelector('.dashboard-tab[aria-selected="true"]')
    var activeSection = active
      ? DashboardMetricsConfig.sections.find(function (section) {
        return active.id === sectionId(section) + '-tab'
      })
      : 'Overview'
    renderSection(activeSection || 'Overview')
  }

  function setTrendMode(mode) {
    activeTrendMode = mode || 'month'
    renderedSections.clear()
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
    setSeries: setSeries,
    setTrendMode: setTrendMode,
    renderSection: renderSection,
    showDefinition: showDefinition,
    entriesForDefinition: entriesForDefinition,
    emptyTextForDefinition: emptyTextForDefinition,
    optionsForDefinition: baseChartOptions
  })
})(typeof window !== 'undefined' ? window : globalThis)
