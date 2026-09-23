(function (global) {
  'use strict'

  var chartInstances = {}
  var renderedSections = new Set()
  var currentMetrics = {}

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

  function initializeSections(onSelect) {
    var tabs = document.getElementById('dashboardTabs')
    var sections = document.getElementById('dashboardSections')
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
    return '<article class="dashboard-kpi">' +
      '<p class="dashboard-kpi-label">' + escapeHtml(definition.label) + '</p>' +
      '<div class="dashboard-kpi-value">' + escapeHtml(numeratorDisplay(definition)) + '</div>' +
      (detail ? '<div class="dashboard-kpi-detail">' + detail + '</div>' : '') +
      '<button class="dashboard-info-button" type="button" data-indicator-key="' +
      escapeHtml(definition.key) + '" aria-label="View calculation for ' +
      escapeHtml(definition.label) + '"><i class="fas fa-info-circle" aria-hidden="true"></i></button>' +
      '</article>'
  }

  function mapForDefinition(definition) {
    var path = definition.detailMap || definition.numerator
    var value = DashboardMetricsConfig.valueAtPath(currentMetrics, path)
    return value && typeof value === 'object' ? value : {}
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

  function chartCard(definition) {
    var infoButton = definition.key === 'overview_service_comparison'
      ? ''
      : '<button class="dashboard-info-button dashboard-chart-info-button" type="button" data-indicator-key="' +
        escapeHtml(definition.key) + '" aria-label="View calculation for ' +
        escapeHtml(definition.label) + '"><i class="fas fa-info-circle" aria-hidden="true"></i></button>'
    return '<article class="dashboard-chart-card">' +
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
      Registration: number('registration.total'),
      ANC: number('anc.clients'),
      HighRisk: number('highRisk.clients'),
      Delivery: number('delivery.completedNotes'),
      PNC: number('pnc.clients'),
      NBC: number('newborn.clients'),
      Referral: number('referral.total'),
      JointCare: number('jointCare.clients')
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
        animations: { enabled: !global.matchMedia('(prefers-reduced-motion: reduce)').matches }
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

  function renderChart(definition) {
    var id = chartId(definition)
    var element = document.getElementById(id)
    if (!element || !global.ApexCharts) return
    if (chartInstances[id]) {
      chartInstances[id].destroy()
      delete chartInstances[id]
    }
    var map = definition.detailMap === '__overview'
      ? overviewMap()
      : mapForDefinition(definition)
    var entries = sortedMapEntries(map)
    if (!entries.length) {
      element.innerHTML = '<div class="dashboard-chart-empty">No data for this filter</div>'
      return
    }
    var chart = new ApexCharts(element, baseChartOptions(definition, entries))
    chart.render()
    chartInstances[id] = chart
  }

  function attachDefinitionButtons(panel) {
    panel.querySelectorAll('[data-indicator-key]').forEach(function (button) {
      button.addEventListener('click', function () {
        showDefinition(button.getAttribute('data-indicator-key'))
      })
    })
  }

  function showDefinition(key) {
    var definition = DashboardMetricsConfig.indicators.find(function (item) {
      return item.key === key
    })
    if (!definition) return
    document.getElementById('dashboardDefinitionTitle').textContent =
      definition.label + ' calculation'
    var rawNumerator = DashboardMetricsConfig.valueAtPath(
      currentMetrics,
      definition.numerator
    )
    var numerator = definition.format === 'map'
      ? Object.keys(rawNumerator || {}).reduce(function (total, item) {
        return total + Number(rawNumerator[item] || 0)
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
    if (!panel || renderedSections.has(section)) return
    var definitions = DashboardMetricsConfig.indicatorsForSection(section)
    var kpis = definitions.filter(function (definition) {
      return definition.format !== 'map'
    })
    var charts = definitions.filter(function (definition) {
      return definition.format === 'map' || definition.detailMap
    })
    if (section === 'Overview') charts.push(overviewChartDefinition())
    panel.querySelector('.dashboard-kpi-grid').innerHTML = kpis.map(renderKpi).join('')
    panel.querySelector('.dashboard-chart-grid').innerHTML = charts.map(chartCard).join('')
    attachDefinitionButtons(panel)
    charts.forEach(renderChart)
    renderedSections.add(section)
  }

  function setMetrics(metrics) {
    currentMetrics = metrics || {}
    renderedSections.clear()
    Object.keys(chartInstances).forEach(function (id) {
      chartInstances[id].destroy()
      delete chartInstances[id]
    })
    var active = document.querySelector('.dashboard-tab[aria-selected="true"]')
    var activeSection = active
      ? DashboardMetricsConfig.sections.find(function (section) {
        return active.id === sectionId(section) + '-tab'
      })
      : 'Overview'
    renderSection(activeSection || 'Overview')
  }

  global.DashboardCharts = Object.freeze({
    initializeSections: initializeSections,
    selectSection: selectSection,
    setMetrics: setMetrics,
    renderSection: renderSection,
    showDefinition: showDefinition
  })
})(typeof window !== 'undefined' ? window : globalThis)
