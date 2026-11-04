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
    'anc_td1_completion',
    'anc_td2_completion',
    'anemia_in_pregnancy',
    'anc_outcomes',
    'hrt_completed',
    'hrt_total',
    'hrt_active',
    'hrt_overdue',
    'hrt_defaulted',
    'high_risk_anc_average',
    'normal_anc_average',
    'high_risk_rate',
    'high_risk_factors',
    'other_medical_conditions',
    'skilled_birth_attendant_rate',
    'preterm_babies',
    'kmc_completion',
    'kmc_weight_gain',
    'pnc_clients',
    'average_pnc_visits',
    'baby_referrals',
    'joint_care_facilities'
  ].forEach((key) => assert.ok(keys.has(key), key))
  assert.equal(all.find((item) => item.key === 'anc_td1_completion').format, 'percent')
  assert.equal(all.find((item) => item.key === 'anemia_in_pregnancy').numerator, 'anc.anemiaClients')
  assert.equal(all.find((item) => item.key === 'anc_outcomes').chartOnly, true)
  assert.equal(all.find((item) => item.key === 'kmc_weight_gain').format, 'averageGrams')
})

test('high-risk dashboard uses client-facing rate, averages, and chart-only breakdowns', () => {
  const all = global.DashboardMetricsConfig.allDefinitions
  const rate = all.find((item) => item.key === 'high_risk_rate')
  assert.equal(rate.numerator, 'highRisk.clients')
  assert.equal(rate.denominator, 'anc.clients')
  assert.equal(rate.format, 'percent')
  assert.deepEqual(rate.charts.map((chart) => chart.dimension), ['month', 'facility'])
  assert.deepEqual(all.find((item) => item.key === 'hrt_completed').charts, [])
  assert.equal(all.find((item) => item.key === 'high_risk_factors').chartOnly, true)
  assert.equal(all.find((item) => item.key === 'other_medical_conditions').chartOnly, true)
  assert.equal(all.find((item) => item.key === 'high_risk_factors').label, 'High Risk Factors')
  assert.equal(all.find((item) => item.key === 'hrt_total').numerator, 'highRisk.tracking.total')
  assert.equal(all.find((item) => item.key === 'hrt_completed').numerator, 'highRisk.tracking.completed')
})

test('overview uses readable chart roles and keeps joint care in its own section', () => {
  const all = global.DashboardMetricsConfig.allDefinitions
  const totalClients = all.find((item) => item.key === 'total_clients')
  assert.deepEqual(
    totalClients.charts.map((chart) => [chart.dimension, chart.type]),
    [['month', 'trend'], ['facility', 'bar'], ['township', 'donut']]
  )
  assert.equal(all.find((item) => item.key === 'hrt_patients').numerator, 'highRisk.clients')
  assert.equal(all.find((item) => item.key === 'facility_count').visibleRoles.includes('midwife'), false)
  ;['anc_clients', 'newborn_care_clients', 'pnc_clients', 'hrt_patients', 'referrals']
    .forEach((key) => {
      assert.ok(
        all.find((item) => item.key === key).charts.some(
          (chart) => chart.dimension === 'facility'
        ),
        key
      )
    })
  assert.equal(all.find((item) => item.key === 'mother_service_outcomes').chartOnly, true)
  assert.equal(all.find((item) => item.key === 'baby_service_outcomes').chartOnly, true)
  assert.equal(all.find((item) => item.key === 'joint_care_patients').section, 'Referral & Joint Care')
  assert.equal(all.find((item) => item.key === 'facility_count').compactContext, true)
  assert.equal(totalClients.charts.find((chart) => chart.dimension === 'township').overviewInsight, true)
  ;['age_demographics', 'average_gp', 'mother_service_outcomes', 'baby_service_outcomes']
    .forEach((key) => assert.equal(all.find((item) => item.key === key).overviewInsight, true))
})

test('v4 display helpers distinguish zero from missing denominators', () => {
  const config = global.DashboardMetricsConfig
  const coverage = config.allDefinitions.find((item) => item.key === 'pnc_coverage')
  assert.equal(config.displayValue(coverage, { pnc: { coverageNumerator: 0, deliveredMothers: 10 } }), '0.0%')
  assert.equal(config.displayValue(coverage, { pnc: { coverageNumerator: 0, deliveredMothers: 0 } }), '—')
})

test('dashboard markup uses exact date controls and export action', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'dashboard.html'), 'utf8')
  assert.match(html, /<select[^>]+id="dashboardStartDate"/)
  assert.match(html, /<select[^>]+id="dashboardEndDate"/)
  assert.doesNotMatch(html, /dashboardTrendMode/)
  assert.match(html, /dashboardExportButton/)
  assert.match(html, /dashboard-v4-config\.js/)
})

test('dashboard chart controller uses fixed scorecard-led charts', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'dashboard-charts.js'), 'utf8')
  const styles = fs.readFileSync(path.join(__dirname, '..', 'css', 'dashboard-v3.css'), 'utf8')
  assert.match(source, /chartSpec\.dimension/)
  assert.match(source, /facilityLabel/)
  assert.match(source, /overviewChartDefinitions\.includes\(item\)/)
  assert.match(source, /ANC service activity/)
  assert.match(styles, /#dashboard-section-anc \.dashboard-insight-grid/)
  assert.match(styles, /#dashboard-section-anc \.dashboard-insight-charts/)
  assert.doesNotMatch(source, /data-metric-key/)
  assert.doesNotMatch(source, /dashboard-info-button/)
})

test('scorecards expose client-facing calculation explanations', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'dashboard-charts.js'), 'utf8')
  assert.match(source, /dashboard-kpi-clickable/)
  assert.match(source, /How ' \+ definition\.label \+ ' is calculated/)
  assert.doesNotMatch(source, /Formula<\/dt>/)
})
