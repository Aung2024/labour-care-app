'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')

require('../js/dashboard-metrics-config.js')
require('../js/dashboard-data.js')

test('dashboard frontend exposes all 54 workbook indicators', () => {
  const indicators = global.DashboardMetricsConfig.indicators
  assert.equal(indicators.length, 54)
  assert.deepEqual(
    indicators.map((indicator) => indicator.row),
    Array.from({ length: 54 }, (_, index) => index + 1)
  )
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
