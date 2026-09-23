(function (global) {
  'use strict'

  var SCHEMA_VERSION = 'analytics-v3.0.0'

  function metric(row, section, key, label, numerator, denominator, options) {
    return Object.freeze(Object.assign({
      row: row,
      section: section,
      key: key,
      label: label,
      numerator: numerator,
      denominator: denominator || '',
      format: denominator ? 'ratio' : 'count',
      chart: 'kpi',
      definition: ''
    }, options || {}))
  }

  var indicators = [
    metric(1, 'Overview', 'registration_clients', 'Total Registration Clients', 'registration.total', '', { definition: 'Registered mothers and newborn/child clients with activity in the reporting period.' }),
    metric(2, 'Overview', 'overview_anc_clients', 'Total ANC', 'anc.clients', '', { detailPaths: ['anc.new', 'anc.old'], detailLabels: ['New', 'Old'] }),
    metric(3, 'Overview', 'overview_high_risk', 'High-Risk Pregnancy', 'highRisk.clients'),
    metric(4, 'Overview', 'overview_institutional_delivery', 'Institutional Deliveries', 'delivery.institutionalSkilled', 'delivery.completedNotes'),
    metric(5, 'Overview', 'overview_home_delivery', 'Home Deliveries by SBA', 'delivery.homeSkilled', 'delivery.completedNotes'),
    metric(6, 'Overview', 'overview_pnc_clients', 'Total PNC', 'pnc.clients', '', { detailPaths: ['pnc.new', 'pnc.old'], detailLabels: ['New', 'Old'] }),
    metric(7, 'Overview', 'overview_newborn_clients', 'Total NBC', 'newborn.clients', '', { detailPaths: ['newborn.new', 'newborn.old'], detailLabels: ['New', 'Old'] }),
    metric(8, 'Overview', 'overview_maternal_referrals', 'Maternal Referrals', 'referral.total'),
    metric(9, 'Overview', 'overview_joint_care', 'Joint Care', 'jointCare.clients'),
    metric(10, 'ANC', 'anc_clients', 'Total ANC', 'anc.clients', '', { detailPaths: ['anc.new', 'anc.old'], detailLabels: ['New', 'Old'] }),
    metric(11, 'ANC', 'anc_services', 'ANC Services', 'anc.services'),
    metric(12, 'ANC', 'anc_at_least_4', 'ANC ≥4', 'anc.atLeast4', 'anc.clients'),
    metric(13, 'ANC', 'anc_at_least_8', 'ANC ≥8', 'anc.atLeast8', 'anc.clients'),
    metric(14, 'ANC', 'early_anc', 'Early ANC', 'anc.early', 'anc.clients', { definition: 'First-ever ANC visit at or before 12 completed weeks.' }),
    metric(15, 'ANC', 'anc_iron_folate', 'Iron/Folate (ANC)', 'anc.ironFolate', 'anc.clients'),
    metric(16, 'PNC', 'pnc_iron_folate', 'Iron/Folate (PNC)', 'pnc.ironFolate', 'pnc.deliveredMothers'),
    metric(17, 'ANC', 'anc_b1', 'B1 (ANC)', 'anc.vitaminB1', 'anc.clients'),
    metric(18, 'PNC', 'pnc_b1', 'B1 (PNC within 42 days)', 'pnc.vitaminB1', 'pnc.deliveredMothers'),
    metric(19, 'ANC', 'anc_deworming', 'Deworming', 'anc.deworming', 'anc.clients'),
    metric(20, 'ANC', 'anc_gbv', 'GBV Suspected', 'anc.gbv', 'anc.clients'),
    metric(21, 'ANC', 'anc_pmtct', 'ANC with PMTCT', 'anc.pmtctTested', 'anc.clients', { detailPaths: ['anc.pmtctReactive'], detailLabels: ['Reactive'] }),
    metric(22, 'ANC', 'anc_tb', 'ANC with TB', 'anc.tb', 'anc.clients'),
    metric(23, 'High-Risk', 'high_risk_clients', 'High-Risk Pregnancy', 'highRisk.clients'),
    metric(24, 'High-Risk', 'high_risk_factors', 'High-Risk Factors', 'highRisk.factors', '', { format: 'map', chart: 'bar' }),
    metric(25, 'High-Risk', 'high_risk_other_diseases', 'Other Medical Diseases', 'highRisk.otherMedicalDiseases', '', { format: 'map', chart: 'bar' }),
    metric(26, 'Delivery', 'home_delivery_skilled', 'Home Delivery by SBA', 'delivery.homeSkilled', 'delivery.completedNotes'),
    metric(27, 'Delivery', 'institutional_delivery_skilled', 'Institutional Delivery', 'delivery.institutionalSkilled', 'delivery.completedNotes'),
    metric(28, 'Delivery', 'uterotonic_use', 'Uterotonic Use', 'delivery.uterotonic', 'delivery.completedNotes'),
    metric(29, 'Delivery', 'uterotonic_rate', 'Uterotonic Use Rate', 'delivery.uterotonic', 'delivery.completedNotes', { format: 'percent' }),
    metric(30, 'Delivery', 'skilled_home_birth_rate', 'Skilled Home Birth Rate', 'delivery.homeSkilled', 'delivery.completedNotes', { format: 'percent' }),
    metric(31, 'Delivery', 'lcg_usage', 'LCG Usage', 'delivery.lcgUsed', 'delivery.completedNotes'),
    metric(32, 'Delivery', 'delivery_mode', 'Mode of Delivery', 'delivery.modes', '', { format: 'map', chart: 'donut' }),
    metric(33, 'Delivery', 'birthplace', 'Birthplace', 'delivery.places', '', { format: 'map', chart: 'donut' }),
    metric(34, 'Delivery', 'maternal_outcome', 'Maternal Outcome', 'delivery.maternalOutcomes', '', { format: 'map', chart: 'bar' }),
    metric(35, 'Delivery', 'newborn_outcome', 'Newborn Outcome', 'delivery.newbornOutcomes', '', { format: 'map', chart: 'bar' }),
    metric(36, 'Newborn', 'early_breastfeeding', 'Early Breastfeeding', 'newborn.earlyBreastfeeding', 'newborn.liveBirths'),
    metric(37, 'PNC', 'pnc_coverage', 'PNC Coverage', 'pnc.clients', 'pnc.deliveredMothers', { format: 'percent' }),
    metric(38, 'PNC', 'average_pnc_visits', 'Average PNC Visits', 'pnc.visits', 'pnc.clients', { format: 'average' }),
    metric(39, 'PNC', 'pnc_at_least_4', 'PNC ≥4', 'pnc.atLeast4', 'pnc.clients'),
    metric(40, 'PNC', 'pnc_within_48h', 'PNC ≤48h', 'pnc.within48Hours', 'pnc.deliveredMothers'),
    metric(41, 'PNC', 'pnc_within_42d', 'PNC ≤42d', 'pnc.within42Days', 'pnc.deliveredMothers'),
    metric(42, 'PNC', 'pnc_mother_anc_4', 'PN Mother with ≥4 ANC', 'pnc.mothersWithAnc4', 'pnc.deliveredMothers'),
    metric(43, 'PNC', 'pnc_mother_anc_8', 'PN Mother with ≥8 ANC', 'pnc.mothersWithAnc8', 'pnc.deliveredMothers'),
    metric(44, 'PNC', 'pph_cases', 'PPH Cases', 'pnc.pph', 'pnc.deliveredMothers'),
    metric(45, 'Newborn', 'birth_weight_measured', 'Birth Weight Measured', 'newborn.birthWeightMeasured', 'newborn.liveBirths'),
    metric(46, 'Newborn', 'low_birth_weight', 'Low Birth Weight', 'newborn.lowBirthWeight', 'newborn.liveBirths', { definition: 'Live birth weight below 2500 g.' }),
    metric(47, 'Newborn', 'newborn_care_2_days', 'NBC ≤2 days', 'newborn.careWithin2Days', 'newborn.liveBirths'),
    metric(48, 'Newborn', 'kmc_eligible', 'KMC Eligible', 'newborn.kmcEligible', 'newborn.liveBirths', { definition: 'Birth weight below 2000 g or preterm.' }),
    metric(49, 'Newborn', 'kmc_received', 'KMC Cases and Coverage', 'newborn.kmcReceived', 'newborn.kmcEligible'),
    metric(50, 'Referral', 'maternal_referrals', 'Total Maternal Referral', 'referral.total'),
    metric(51, 'Referral', 'maternal_referral_rate', 'Maternal Referral Rate', 'referral.total', 'registration.mothers', { format: 'percent' }),
    metric(52, 'Referral', 'referral_stage', 'Referral by Stage', 'referral.byStage', '', { format: 'map', chart: 'bar' }),
    metric(53, 'Referral', 'referral_destination', 'Referral Destination', 'referral.byDestination', '', { format: 'map', chart: 'donut' }),
    metric(54, 'Joint Care', 'joint_care_patients', 'Joint Care Patients', 'jointCare.clients', '', { detailMap: 'jointCare.byStatus', chart: 'bar' })
  ]

  function valueAtPath(source, path) {
    return String(path || '').split('.').reduce(function (value, key) {
      return value && Object.prototype.hasOwnProperty.call(value, key)
        ? value[key]
        : undefined
    }, source)
  }

  function numberAtPath(source, path) {
    var value = Number(valueAtPath(source, path) || 0)
    return Number.isFinite(value) ? value : 0
  }

  function ratio(numerator, denominator) {
    return denominator > 0 ? numerator / denominator : null
  }

  function displayValue(definition, metrics) {
    var numerator = numberAtPath(metrics, definition.numerator)
    if (!definition.denominator || definition.format === 'count') {
      return numerator.toLocaleString()
    }
    var denominator = numberAtPath(metrics, definition.denominator)
    var result = ratio(numerator, denominator)
    if (result == null) return '—'
    if (definition.format === 'average') return result.toFixed(1)
    return (result * 100).toFixed(1) + '%'
  }

  function indicatorsForSection(section) {
    return indicators.filter(function (item) {
      return item.section === section
    })
  }

  global.DashboardMetricsConfig = Object.freeze({
    schemaVersion: SCHEMA_VERSION,
    indicators: Object.freeze(indicators.slice()),
    sections: Object.freeze(['Overview', 'ANC', 'High-Risk', 'Delivery', 'Newborn', 'PNC', 'Referral', 'Joint Care']),
    valueAtPath: valueAtPath,
    numberAtPath: numberAtPath,
    ratio: ratio,
    displayValue: displayValue,
    indicatorsForSection: indicatorsForSection
  })
})(typeof window !== 'undefined' ? window : globalThis)
