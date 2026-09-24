'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

require('../js/dashboard-metrics-config.js')
require('../js/dashboard-data.js')
require('../js/dashboard-charts.js')

test('dashboard frontend exposes all 54 workbook indicators', () => {
  const indicators = global.DashboardMetricsConfig.indicators
  assert.equal(indicators.length, 54)
  assert.deepEqual(
    indicators.map((indicator) => indicator.row),
    Array.from({ length: 54 }, (_, index) => index + 1)
  )
  assert.equal(indicators.find((indicator) => indicator.key === 'registration_clients').label, 'Total Clients')
})

test('dashboard presentation keeps only the approved sections and supplemental chart', () => {
  const config = global.DashboardMetricsConfig
  assert.equal(config.schemaVersion, 'analytics-v3.2.0')
  assert.equal(config.indicators.length, 54)
  assert.deepEqual(config.sections, [
    'Overview', 'ANC', 'High-Risk', 'Delivery', 'Newborn', 'PNC', 'Referral'
  ])
  assert.deepEqual(
    config.supplementalDefinitions.map((definition) => definition.key),
    ['supplemental_maternal_age_groups']
  )
  assert.ok(
    !config.definitionsForSection('High-Risk').some(
      (definition) => definition.key === 'high_risk_other_diseases'
    )
  )
})

test('approved primary delivery and newborn scorecards use truth paths', () => {
  const config = global.DashboardMetricsConfig
  const pathsByKey = Object.fromEntries(
    config.presentationDefinitions.map((definition) => [
      definition.key,
      definition.numerator
    ])
  )
  assert.deepEqual(pathsByKey, {
    delivery_total: 'delivery.actualNotes',
    delivery_total_babies: 'registration.babies',
    newborn_total: 'registration.babies',
    newborn_nbc_clients: 'newborn.clients',
    newborn_immediate_clients: 'newborn.immediateClients',
    newborn_total_kmc: 'newborn.kmcYes'
  })

  const overview = config.definitionsForSection('Overview')
  assert.equal(overview[0].label, 'Total Clients')
  assert.deepEqual(overview[0].detailLabels, ['Mothers', 'Babies'])
  assert.ok(overview.some((definition) => definition.label === 'Total ANC Headcount'))
  assert.ok(overview.some((definition) => definition.label === 'Total PNC Headcount'))
  assert.ok(overview.some((definition) => definition.label === 'Total NBC Headcount'))

  const delivery = config.definitionsForSection('Delivery')
  assert.deepEqual(
    delivery.slice(0, 2).map((definition) => definition.label),
    ['Total Deliveries', 'Total Babies']
  )
  assert.equal(
    config.supplementalForSection('Delivery').length,
    0
  )

  const newborn = config.definitionsForSection('Newborn')
  assert.deepEqual(
    newborn.map((definition) => definition.label),
    [
      'Total Newborns',
      'Birth Weight Measured',
      'Low Birth Weight',
      'Total NBC Headcount',
      'Total Immediate Newborn Care Headcount',
      'NBC ≤2 days',
      'Total KMC Babies'
    ]
  )
  assert.deepEqual(newborn[0].detailPaths, [
    'newborn.preterm',
    'newborn.lowBirthWeight'
  ])
})

test('maternal age chart has fixed ordered bands and supports v3 aliases', () => {
  const definition = global.DashboardMetricsConfig.supplementalDefinitions.find(
    (item) => item.key === 'supplemental_maternal_age_groups'
  )
  const entries = global.DashboardCharts.entriesForDefinition(definition, {
    registration: {
      ageGroups: {
        'Under 18': 2,
        '18 to 35': 7,
        'Over 35': 3,
        Unknown: 1
      }
    }
  })
  assert.deepEqual(entries, [
    ['Under 18', 2],
    ['18–35', 7],
    ['Over 35', 3],
    ['Unknown', 1]
  ])
})

test('high-risk factors and newborn outcomes expose chart entries', () => {
  const config = global.DashboardMetricsConfig
  const highRisk = config.indicators.find(
    (item) => item.key === 'high_risk_factors'
  )
  const newbornOutcome = config.indicators.find(
    (item) => item.key === 'newborn_outcome'
  )
  assert.deepEqual(
    global.DashboardCharts.entriesForDefinition(highRisk, {
      highRisk: { factors: { Anaemia: 3, Hypertension: 5 } }
    }),
    [['Hypertension', 5], ['Anaemia', 3]]
  )
  assert.deepEqual(
    global.DashboardCharts.entriesForDefinition(newbornOutcome, {
      delivery: { newbornOutcomes: { Alive: 8, Stillbirth: 1 } }
    }),
    [['Alive', 8], ['Stillbirth', 1]]
  )
})

test('maternal outcome supports an explicit empty state', () => {
  const definition = global.DashboardMetricsConfig.indicators.find(
    (item) => item.key === 'maternal_outcome'
  )
  assert.deepEqual(global.DashboardCharts.entriesForDefinition(definition, {}), [])
  assert.equal(
    global.DashboardCharts.emptyTextForDefinition(definition),
    'No data for this filter'
  )
})

test('chart lifecycle handles visibility, resize, and rejected renders', () => {
  const chartSource = fs.readFileSync(
    path.join(__dirname, '..', 'js', 'dashboard-charts.js'),
    'utf8'
  )
  assert.match(chartSource, /ResizeObserver/)
  assert.match(chartSource, /IntersectionObserver/)
  assert.match(chartSource, /visibilitychange/)
  assert.match(chartSource, /Promise\.resolve\(renderResult\)\.catch/)
  assert.match(chartSource, /refreshVisibleCharts\(true\)/)
  assert.doesNotMatch(chartSource, /Service Headcount/)
})

test('chart options omit incompatible axes and add donut center totals', () => {
  const charts = global.DashboardCharts
  const entries = [['One', 2], ['Two', 5]]
  const bar = charts.optionsForDefinition(
    { label: 'Bar', chart: 'bar' },
    entries
  )
  assert.ok(bar.xaxis)
  assert.ok(bar.yaxis)
  assert.equal(Object.hasOwn(bar, 'labels'), false)
  assert.equal(bar.yaxis.labels.formatter('Hypertension'), 'Hypertension')

  const horizontal = charts.optionsForDefinition(
    { label: 'Factors', chart: 'bar' },
    [['Very long high-risk factor name', 12], ['Another long clinical factor', 4]]
  )
  assert.equal(horizontal.plotOptions.bar.horizontal, true)
  assert.equal(horizontal.yaxis.labels.formatter('Hypertension'), 'Hypertension')
  assert.equal(horizontal.xaxis.labels.formatter(12), '12')

  const donut = charts.optionsForDefinition(
    { label: 'Donut', chart: 'donut' },
    entries
  )
  assert.deepEqual(donut.labels, ['One', 'Two'])
  assert.equal(Object.hasOwn(donut, 'xaxis'), false)
  assert.equal(Object.hasOwn(donut, 'yaxis'), false)
  assert.equal(
    donut.plotOptions.pie.donut.labels.total.formatter({
      globals: { seriesTotals: [2, 5] }
    }),
    '7'
  )

  const assertNoUndefined = (value) => {
    if (!value || typeof value !== 'object') return
    Object.values(value).forEach((child) => {
      assert.notEqual(child, undefined)
      assertNoUndefined(child)
    })
  }
  assertNoUndefined(bar)
  assertNoUndefined(donut)
})

test('scorecard ratio status uses inclusive approved thresholds', () => {
  const definition = {
    numerator: 'value',
    denominator: 'total',
    format: 'ratio'
  }
  const status = global.DashboardCharts.scorecardStatus
  assert.equal(status(definition, { value: 19, total: 100 }).className, 'is-status-low')
  assert.equal(status(definition, { value: 20, total: 100 }).className, 'is-status-medium')
  assert.equal(status(definition, { value: 60, total: 100 }).className, 'is-status-medium')
  assert.equal(status(definition, { value: 61, total: 100 }).className, 'is-status-high')
  assert.equal(
    status({ ...definition, format: 'average' }, { value: 61, total: 100 }),
    null
  )
})

test('every dashboard indicator explains its clinical calculation', () => {
  global.DashboardMetricsConfig.indicators.forEach((indicator) => {
    assert.ok(indicator.definition.length >= 40, indicator.key)
    assert.ok(indicator.countedAs, indicator.key)
    assert.ok(indicator.numeratorLabel, indicator.key)
    if (indicator.denominator) {
      assert.ok(indicator.denominatorLabel, indicator.key)
    }
  })
  const chartSource = fs.readFileSync(
    path.join(__dirname, '..', 'js', 'dashboard-charts.js'),
    'utf8'
  )
  assert.doesNotMatch(chartSource, /Workbook row/)
})

test('dashboard scope ids match the analytics-v3 backend contract', () => {
  assert.equal(
    global.DashboardData.scopeDocId(
      { type: 'township', id: 'Pyinmana' },
      'doph',
      'rhc'
    ),
    encodeURIComponent(
      'geography=township:Pyinmana|department=doph|facilityType=rhc'
    )
  )
})

test('role scope resolution never permits a wider implicit scope', () => {
  const filters = {
    year: '2026',
    month: '09',
    region: '',
    township: '',
    facilityCode: '',
    department: '',
    facilityTypes: []
  }
  assert.deepEqual(
    global.DashboardData.resolveGeography(
      { uid: 'midwife-1', role: 'Midwife', township: 'Pyinmana' },
      filters
    ),
    { type: 'provider', id: 'midwife-1' }
  )
  assert.deepEqual(
    global.DashboardData.resolveGeography(
      { uid: 'tmo-1', role: 'TMO', township: 'Pyinmana' },
      filters
    ),
    { type: 'township', id: 'Pyinmana' }
  )
  assert.deepEqual(
    global.DashboardData.resolveGeography(
      { uid: 'regional-1', role: 'Regional Officer', region: 'Nay Pyi Taw' },
      filters
    ),
    { type: 'region', id: 'Nay Pyi Taw' }
  )
})

test('dashboard periods use all, year, or month summary keys only', () => {
  assert.equal(global.DashboardData.periodKey({ year: '', month: '' }), 'all')
  assert.equal(global.DashboardData.periodKey({ year: '2026', month: '' }), '2026')
  assert.equal(
    global.DashboardData.periodKey({ year: '2026', month: '09' }),
    '2026-09'
  )
})

test('dashboard period controls default to All Time with Month disabled', () => {
  const createSelect = () => {
    const select = {
      options: [],
      disabled: false,
      _value: '',
      appendChild(option) {
        this.options.push(option)
      }
    }
    Object.defineProperty(select, 'innerHTML', {
      set() {
        select.options = []
        select._value = ''
      }
    })
    Object.defineProperty(select, 'value', {
      get() {
        return select._value
      },
      set(value) {
        select._value = select.options.some((option) => option.value === value)
          ? value
          : ''
      }
    })
    return select
  }

  const previousDocument = global.document
  const year = createSelect()
  const month = createSelect()
  global.document = {
    getElementById(id) {
      return id === 'dashboardYear' ? year : month
    },
    createElement() {
      return { value: '', textContent: '' }
    }
  }

  try {
    global.DashboardData.initializePeriodOptions(new Date('2026-09-24T00:00:00Z'))
    assert.equal(year.value, '')
    assert.equal(month.value, '')
    assert.equal(month.disabled, true)
    assert.equal(year.options[0].textContent, 'All time')
    assert.equal(month.options[0].textContent, 'All months')
  } finally {
    if (previousDocument === undefined) delete global.document
    else global.document = previousDocument
  }
})

test('filter panel starts collapsed and remains foldable at every width', () => {
  const controller = fs.readFileSync(
    path.join(__dirname, '..', 'js', 'dashboard-v3.js'),
    'utf8'
  )
  const styles = fs.readFileSync(
    path.join(__dirname, '..', 'css', 'dashboard-v3.css'),
    'utf8'
  )
  assert.match(controller, /setFilterExpanded\(false\)/)
  assert.match(styles, /\.dashboard-filter-toggle\s*\{[\s\S]*min-height:\s*44px/)
  assert.match(
    styles,
    /\.dashboard-filter-panel:not\(\.is-expanded\) #dashboardFilterForm/
  )
})
