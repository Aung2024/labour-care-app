(function (global) {
  'use strict'

  var sections = [
    'Overview',
    'ANC',
    'High-Risk',
    'Delivery',
    'Newborn & KMC',
    'PNC',
    'Referral & Joint Care'
  ]

  function metric(section, key, label, numerator, denominator, options) {
    return Object.assign({
      section: section,
      key: key,
      label: label,
      numerator: numerator,
      denominator: denominator || '',
      format: denominator ? 'percent' : 'count',
      chart: 'trend',
      definition: 'Aggregate clinical indicator for the selected scope and inclusive date range.',
      countedAs: 'Aggregate clinical records',
      numeratorLabel: 'Included records',
      denominatorLabel: 'Eligible records'
    }, options || {})
  }

  var definitions = [
    metric('Overview', 'total_clients', 'Total Clients', 'registration.total', '', {
      detailPaths: ['registration.mothers', 'registration.babies'],
      detailLabels: ['Mothers', 'Babies'],
      charts: [
        { type: 'trend', dimension: 'month', title: 'Monthly Trend' },
        { type: 'bar', dimension: 'facility', title: 'Total Clients by Facility' },
        { type: 'donut', dimension: 'township', title: 'Total Clients by TSP' }
      ]
    }),
    metric('Overview', 'anc_clients', 'ANC Headcount', 'anc.clients', '', {
      charts: [{ type: 'trend', dimension: 'month', title: 'Monthly Trend' }]
    }),
    metric('Overview', 'newborn_care_clients', 'Newborn Care Headcount', 'newborn.clients', '', {
      charts: [{ type: 'trend', dimension: 'month', title: 'Monthly Trend' }]
    }),
    metric('Overview', 'pnc_clients', 'PNC Headcount', 'pnc.clients', '', {
      charts: [{ type: 'trend', dimension: 'month', title: 'Monthly Trend' }]
    }),
    metric('Overview', 'hrt_completed', 'HRT', 'highRisk.completion.completed', '', {
      charts: [{ type: 'trend', dimension: 'month', title: 'Monthly Trend' }]
    }),
    metric('Overview', 'referrals', 'Referrals', 'referral.total', '', {
      detailPaths: ['referral.maternal.total', 'referral.baby.total'],
      detailLabels: ['Mother referrals', 'Baby referrals'],
      charts: [{ type: 'trend', dimension: 'month', title: 'Monthly Trend' }]
    }),
    metric('Overview', 'joint_care_patients', 'Joint Care Patients', 'jointCare.clients', '', {
      charts: []
    }),
    metric('Overview', 'finalized_outcomes', 'Finalized Service Outcomes', 'serviceClosure.total', '', {
      charts: [{ type: 'outcome', dimension: 'outcomes', title: 'Service Outcomes' }]
    }),
    metric('Overview', 'home_delivery_sba', 'Home Delivery by SBA', 'delivery.homeSba', '', {
      charts: [{ type: 'trend', dimension: 'month', title: 'Monthly Trend' }]
    }),
    metric('Overview', 'institutional_deliveries', 'Institutional Deliveries', 'delivery.institutional', '', {
      charts: [{ type: 'trend', dimension: 'month', title: 'Monthly Trend' }]
    }),
    {
      section: 'Overview',
      key: 'age_demographics',
      label: 'Age Demographics',
      numerator: 'registration.ageGroups',
      format: 'map',
      chartOnly: true,
      charts: [{ type: 'bar', dimension: 'ageGroups', title: 'Registered Mothers by Age' }]
    },
    {
      section: 'Overview',
      key: 'average_gp',
      label: 'Average Gravida and Parity',
      format: 'average',
      chartOnly: true,
      chartValues: [
        { label: 'Average Gravida', path: 'registration.gravidaTotal', denominator: 'registration.gravidaCount' },
        { label: 'Average Parity', path: 'registration.parityTotal', denominator: 'registration.parityCount' }
      ],
      charts: [{ type: 'bar', dimension: 'gp', title: 'Average Gravida and Parity' }]
    },

    metric('ANC', 'anc_clients', 'ANC Clients', 'anc.clients'),
    metric('ANC', 'anc_visits', 'ANC Visits', 'anc.services'),
    metric('ANC', 'anc_at_least_4', 'ANC ≥4 Visits', 'anc.atLeast4', 'anc.clients'),
    metric('ANC', 'anc_at_least_8', 'ANC ≥8 Visits', 'anc.atLeast8', 'anc.clients'),
    metric('ANC', 'early_anc', 'Early ANC', 'anc.early', 'anc.clients'),
    metric('ANC', 'anc_iron_folate', 'Iron/Folate (ANC)', 'anc.ironFolate', 'anc.clients'),
    metric('ANC', 'anc_td_protected', 'TD Protected', 'anc.td.protected', 'anc.clients', { chart: 'td', detailMap: 'anc.td.byLatestStatus' }),
    metric('ANC', 'anc_b1', 'B1 (ANC)', 'anc.vitaminB1', 'anc.clients'),
    metric('ANC', 'anc_deworming', 'Deworming', 'anc.deworming', 'anc.clients'),
    metric('ANC', 'anc_gbv', 'GBV Suspected', 'anc.gbv', 'anc.clients'),
    metric('ANC', 'anc_pmtct', 'ANC with PMTCT', 'anc.pmtctTested', 'anc.clients'),
    metric('ANC', 'anc_tb', 'ANC with TB', 'anc.tb', 'anc.clients'),

    metric('High-Risk', 'high_risk_clients', 'High Risks Identified Among All ANC', 'highRisk.clients'),
    metric('High-Risk', 'high_risk_factors', 'Risk Factors Documented', 'highRisk.factors', '', { format: 'map', chart: 'bar' }),
    metric('High-Risk', 'hrt_completed', 'High-Risk Completion', 'highRisk.completion.completed', '', { chart: 'completion', detailMap: 'highRisk.completion.byReason' }),
    metric('High-Risk', 'high_risk_anc_average', 'Average ANC Visits — High Risk', 'highRisk.ancAverage.highRisk.visits', 'highRisk.ancAverage.highRisk.clients', {
      format: 'average',
      chart: 'comparison',
      comparison: [
        { label: 'High Risk', numerator: 'highRisk.ancAverage.highRisk.visits', denominator: 'highRisk.ancAverage.highRisk.clients' },
        { label: 'Non-High Risk', numerator: 'highRisk.ancAverage.nonHighRisk.visits', denominator: 'highRisk.ancAverage.nonHighRisk.clients' }
      ]
    }),

    metric('Delivery', 'delivery_total', 'Total Deliveries', 'delivery.completedNotes'),
    metric('Delivery', 'home_delivery_sba', 'Home Delivery by SBA', 'delivery.homeSba'),
    metric('Delivery', 'institutional_delivery', 'Institutional Delivery', 'delivery.institutional'),
    metric('Delivery', 'skilled_birth_attendant_rate', 'Skilled Birth Attendant Rate', 'delivery.skilledTotal', 'delivery.completedNotes'),
    metric('Delivery', 'uterotonic_rate', 'Uterotonic Use Rate', 'delivery.uterotonic', 'delivery.completedNotes'),
    metric('Delivery', 'lcg_usage', 'LCG Usage', 'delivery.lcgUsed', 'delivery.completedNotes'),
    metric('Delivery', 'delivery_mode', 'Mode of Delivery', 'delivery.modes', '', { format: 'map', chart: 'donut' }),
    metric('Delivery', 'birthplace', 'Birthplace', 'delivery.places', '', { format: 'map', chart: 'donut' }),
    metric('Delivery', 'maternal_outcome', 'Delivery-Note Maternal Outcomes', 'delivery.maternalOutcomes', '', { format: 'map', chart: 'bar' }),
    metric('Delivery', 'newborn_outcome', 'Delivery-Note Newborn Outcomes', 'delivery.newbornOutcomes', '', { format: 'map', chart: 'bar' }),

    metric('Newborn & KMC', 'newborn_total', 'Total Newborns', 'registration.babies'),
    metric('Newborn & KMC', 'newborn_clients', 'Newborn Care Clients', 'newborn.clients'),
    metric('Newborn & KMC', 'birth_weight_recorded', 'Birth Weight Recorded', 'newborn.birthWeightMeasured', 'registration.babies'),
    metric('Newborn & KMC', 'low_birth_weight', 'Low Birth Weight Babies', 'newborn.lowBirthWeight', 'registration.babies'),
    metric('Newborn & KMC', 'preterm_babies', 'Preterm Babies', 'newborn.preterm', 'registration.babies'),
    metric('Newborn & KMC', 'newborn_care_2_days', 'NBC ≤2 Days', 'newborn.careWithin2Days', 'registration.babies'),
    metric('Newborn & KMC', 'kmc_completion', 'KMC Completion', 'newborn.kmcCompleted', 'newborn.kmcEligible', { chart: 'completion' }),
    metric('Newborn & KMC', 'kmc_weight_gain', 'Average KMC Weight Gain', 'newborn.kmcWeightGain.totalGainGrams', 'newborn.kmcWeightGain.babiesWithTwoWeights', { format: 'averageGrams' }),

    metric('PNC', 'pnc_clients', 'Total PNC Headcount', 'pnc.clients'),
    metric('PNC', 'pnc_coverage', 'PNC Coverage', 'pnc.coverageNumerator', 'pnc.deliveredMothers'),
    metric('PNC', 'average_pnc_visits', 'Average PNC Visits', 'pnc.visits', 'pnc.clients', { format: 'average' }),
    metric('PNC', 'pnc_at_least_4', 'PNC ≥4 Visits', 'pnc.atLeast4', 'pnc.clients'),
    metric('PNC', 'pnc_within_48h', 'PNC ≤48h Visits', 'pnc.within48Hours', 'pnc.clients'),
    metric('PNC', 'pnc_within_42d', 'PNC ≤42d Visits', 'pnc.within42Days', 'pnc.clients'),
    metric('PNC', 'pnc_mother_anc_4', 'Delivered Mothers with ≥4 ANC', 'pnc.mothersWithAnc4', 'pnc.deliveredMothers'),
    metric('PNC', 'pnc_mother_anc_8', 'Delivered Mothers with ≥8 ANC', 'pnc.mothersWithAnc8', 'pnc.deliveredMothers'),
    metric('PNC', 'pnc_iron_folate', 'Iron/Folate (PNC)', 'pnc.ironFolate', 'pnc.clients'),
    metric('PNC', 'pnc_b1', 'B1 (PNC within 42 days)', 'pnc.vitaminB1', 'pnc.clients'),
    metric('PNC', 'pph_cases', 'PPH Cases', 'pnc.pph', 'pnc.deliveredMothers'),

    metric('Referral & Joint Care', 'maternal_referrals', 'Maternal Referrals', 'referral.maternal.total'),
    metric('Referral & Joint Care', 'baby_referrals', 'Baby Referrals', 'referral.baby.total'),
    metric('Referral & Joint Care', 'maternal_referral_rate', 'Maternal Referral Rate', 'referral.maternal.total', 'registration.mothers'),
    metric('Referral & Joint Care', 'referral_stage', 'Maternal Referral by Stage', 'referral.maternal.byStage', '', { format: 'map', chart: 'bar' }),
    metric('Referral & Joint Care', 'referral_destination', 'Maternal Referral Destination', 'referral.maternal.byDestination', '', { format: 'map', chart: 'donut' }),
    metric('Referral & Joint Care', 'baby_referral_destination', 'Baby Referral Destination', 'referral.baby.byDestination', '', { format: 'map', chart: 'bar' }),
    metric('Referral & Joint Care', 'joint_care_patients', 'Active Joint-Care Patients', 'jointCare.clients'),
    metric('Referral & Joint Care', 'joint_care_facilities', 'Receiving Facilities', 'jointCare.receivingFacilityCount'),
    metric('Referral & Joint Care', 'joint_care_breakdown', 'Joint Care: Hospital vs Other', 'jointCare.byReceivingFacilityType', '', { format: 'map', chart: 'bar' })
  ]

  function valueAtPath(source, path) {
    return String(path || '').split('.').reduce(function (value, key) {
      return value && Object.prototype.hasOwnProperty.call(value, key) ? value[key] : undefined
    }, source)
  }

  function numberAtPath(source, path) {
    var value = Number(valueAtPath(source, path) || 0)
    return Number.isFinite(value) ? value : 0
  }

  function displayValue(definition, metrics) {
    var numerator = valueAtPath(metrics, definition.numerator)
    if (definition.format === 'map') return Object.values(numerator || {}).reduce(function (total, value) { return total + Number(value || 0) }, 0).toLocaleString()
    if (!definition.denominator) return Number(numerator || 0).toLocaleString()
    var denominator = numberAtPath(metrics, definition.denominator)
    if (!denominator) return '—'
    if (definition.format === 'average') return (Number(numerator || 0) / denominator).toFixed(1)
    if (definition.format === 'averageGrams') return Math.round(Number(numerator || 0) / denominator).toLocaleString() + ' g'
    return ((Number(numerator || 0) / denominator) * 100).toFixed(1) + '%'
  }

  function formulaForDefinition(definition) {
    if (definition.format === 'map') return 'Category totals from ' + definition.numerator
    if (!definition.denominator) return definition.numerator
    return definition.numerator + ' ÷ ' + definition.denominator
  }

  var config = {
    schemaVersion: 'analytics-v4.0.0',
    definitionVersion: 'dashboard-2026-10-25',
    sections: sections,
    allDefinitions: definitions,
    definitionsForSection: function (section) {
      return definitions.filter(function (item) { return item.section === section })
    },
    valueAtPath: valueAtPath,
    numberAtPath: numberAtPath,
    displayValue: displayValue,
    formulaForDefinition: formulaForDefinition,
    sectionNotes: {
      Delivery: 'Institutional Delivery counts public and private facility births. SBA Rate separately counts recorded skilled providers.'
    }
  }

  global.DashboardMetricsConfig = Object.freeze(config)
})(typeof window !== 'undefined' ? window : globalThis)
