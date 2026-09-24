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
  assert.equal(
    indicators.find((indicator) => indicator.key === 'kmc_received').numerator,
    'newborn.kmcReceived'
  )
})

test('v3.1 supplemental definitions stay separate from workbook rows', () => {
  const config = global.DashboardMetricsConfig
  assert.equal(config.schemaVersion, 'analytics-v3.1.0')
  assert.equal(config.indicators.length, 54)
  assert.ok(config.supplementalDefinitions.length > 0)
  config.supplementalDefinitions.forEach((definition) => {
    assert.equal(definition.row, null, definition.key)
    assert.equal(definition.supplemental, true, definition.key)
    assert.equal(definition.sourceLabel, 'Supplemental', definition.key)
    assert.ok(definition.formula, definition.key)
  })
})

test('v3.1 scorecards use the approved presentation metric paths', () => {
  const pathsByKey = Object.fromEntries(
    global.DashboardMetricsConfig.supplementalDefinitions
      .filter((definition) => !definition.chartOnly)
      .map((definition) => [definition.key, definition.numerator])
  )
  assert.deepEqual(pathsByKey, {
    supplemental_registered_mothers: 'registration.mothers',
    supplemental_registered_babies: 'registration.babies',
    supplemental_actual_delivery_notes: 'delivery.actualNotes',
    supplemental_babies_in_delivery_notes: 'delivery.babiesInNotes',
    supplemental_legacy_delivery_cases: 'delivery.legacyDerived',
    supplemental_canonical_nbc_clients: 'newborn.canonicalClients',
    supplemental_canonical_newborns: 'newborn.canonicalBabies',
    supplemental_kmc_yes: 'newborn.kmcYes',
    supplemental_preterm: 'newborn.preterm',
    supplemental_under_2kg: 'newborn.under2Kg',
    supplemental_preterm_and_under_2kg: 'newborn.pretermAndUnder2Kg',
    supplemental_kmc_eligible_union: 'newborn.kmcEligible'
  })
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

test('KMC chart exposes yes, components, intersection, and union', () => {
  const definition = global.DashboardMetricsConfig.supplementalDefinitions.find(
    (item) => item.key === 'supplemental_kmc_breakdown'
  )
  assert.deepEqual(
    global.DashboardCharts.entriesForDefinition(definition, {
      newborn: {
        kmcYes: 4,
        preterm: 5,
        under2Kg: 3,
        pretermAndUnder2Kg: 2,
        kmcEligible: 6
      }
    }),
    [
      ['KMC Yes', 4],
      ['Preterm', 5],
      ['Under 2 kg', 3],
      ['Both', 2],
      ['Eligible Union', 6]
    ]
  )
  assert.match(
    global.DashboardMetricsConfig.formulaForDefinition(definition),
    /preterm \+ under 2 kg − both/
  )
})

test('empty Other Medical Diseases names are explicit', () => {
  const definition = global.DashboardMetricsConfig.indicators.find(
    (item) => item.key === 'high_risk_other_diseases'
  )
  assert.equal(
    global.DashboardCharts.emptyTextForDefinition(definition),
    'No recorded historical names'
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
