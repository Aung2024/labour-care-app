'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

require('../js/dashboard-v4-config.js')

test('v4 dashboard exposes the approved seven sections', () => {
  assert.deepEqual(global.DashboardMetricsConfig.sections, [
    'Overview',
    'ANC',
    'High-Risk',
    'Delivery',
    'Newborn & KMC',
    'PNC',
    'Referral & Joint Care'
  ])
})

test('v4 dashboard contains the requested clinical cards', () => {
  const all = global.DashboardMetricsConfig.allDefinitions
  const keys = new Set(all.map((item) => item.key))
  ;[
    'anc_td_protected',
    'hrt_completed',
    'high_risk_anc_average',
    'skilled_birth_attendant_rate',
    'preterm_babies',
    'kmc_completion',
    'kmc_weight_gain',
    'pnc_clients',
    'average_pnc_visits',
    'baby_referrals',
    'joint_care_facilities'
  ].forEach((key) => assert.ok(keys.has(key), key))
  assert.equal(all.find((item) => item.key === 'anc_td_protected').chart, 'td')
  assert.equal(all.find((item) => item.key === 'kmc_weight_gain').format, 'averageGrams')
})

test('v4 display helpers distinguish zero from missing denominators', () => {
  const config = global.DashboardMetricsConfig
  const coverage = config.allDefinitions.find((item) => item.key === 'pnc_coverage')
  assert.equal(config.displayValue(coverage, { pnc: { coverageNumerator: 0, deliveredMothers: 10 } }), '0.0%')
  assert.equal(config.displayValue(coverage, { pnc: { coverageNumerator: 0, deliveredMothers: 0 } }), '—')
})

test('dashboard markup uses exact date controls and export action', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'dashboard.html'), 'utf8')
  assert.match(html, /dashboardStartDate/)
  assert.match(html, /dashboardEndDate/)
  assert.match(html, /dashboardExportButton/)
  assert.match(html, /dashboard-v4-config\.js/)
})

test('dashboard chart controller supports selectable KPI cards and trend modes', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'dashboard-charts.js'), 'utf8')
  assert.match(source, /data-metric-key/)
  assert.match(source, /aria-pressed/)
  assert.match(source, /setTrendMode/)
  assert.match(source, /currentSeries\[activeTrendMode\]/)
})
