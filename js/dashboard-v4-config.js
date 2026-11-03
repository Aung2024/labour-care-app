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
      definition: 'Counts every registered mother and baby once in the selected period. This includes registered records and baby records automatically created from delivery documentation.',
      countedAs: 'Unique registered clients',
      numeratorLabel: 'Registered mothers and babies',
      detailPaths: ['registration.mothers', 'registration.babies'],
      detailLabels: ['Mothers', 'Babies'],
      charts: [
        { type: 'trend', dimension: 'month', title: 'Monthly Trend' },
        { type: 'bar', dimension: 'facility', title: 'Total Clients by Facility' },
        { type: 'donut', dimension: 'township', title: 'Total Clients by TSP' }
      ]
    }),
    metric('Overview', 'facility_count', 'Total Facilities', 'facilityCount', '', {
      definition: 'Counts facilities in the selected scope that have at least one registered client in the selected period.',
      countedAs: 'Facilities with registered clients',
      numeratorLabel: 'Facilities with registered clients',
      charts: [],
      visibleRoles: ['tmo', 'regional officer', 'central', 'super admin', 'admin']
    }),
    metric('Overview', 'anc_clients', 'ANC Headcount', 'anc.clients', '', {
      definition: 'Counts each client once when at least one antenatal care visit is recorded in the selected period.',
      countedAs: 'Unique ANC clients',
      numeratorLabel: 'Clients with ANC',
      charts: [
        { type: 'trend', dimension: 'month', title: 'Monthly Trend' },
        { type: 'bar', dimension: 'facility', title: 'ANC by Facility' }
      ]
    }),
    metric('Overview', 'newborn_care_clients', 'Newborn Care Headcount', 'newborn.clients', '', {
      definition: 'Counts each baby once when newborn care is recorded in the selected period.',
      countedAs: 'Unique newborn-care clients',
      numeratorLabel: 'Babies receiving newborn care',
      charts: [
        { type: 'trend', dimension: 'month', title: 'Monthly Trend' },
        { type: 'bar', dimension: 'facility', title: 'Newborn Care by Facility' }
      ]
    }),
    metric('Overview', 'pnc_clients', 'PNC Headcount', 'pnc.clients', '', {
      definition: 'Counts each mother once when at least one postnatal care visit is recorded in the selected period.',
      countedAs: 'Unique PNC clients',
      numeratorLabel: 'Mothers with PNC',
      charts: [
        { type: 'trend', dimension: 'month', title: 'Monthly Trend' },
        { type: 'bar', dimension: 'facility', title: 'PNC by Facility' }
      ]
    }),
    metric('Overview', 'hrt_patients', 'HRT Patients', 'highRisk.clients', '', {
      definition: 'Counts each mother once when an ANC record identifies the pregnancy as high risk. Completion status does not change this count.',
      countedAs: 'Unique high-risk pregnancies',
      numeratorLabel: 'Mothers identified as high risk',
      charts: [
        { type: 'trend', dimension: 'month', title: 'Monthly Trend' },
        { type: 'bar', dimension: 'facility', title: 'HRT by Facility' }
      ]
    }),
    metric('Overview', 'referrals', 'Referrals', 'referral.total', '', {
      definition: 'Counts each recorded maternal or baby referral once when the referral is dated in the selected period.',
      countedAs: 'Unique referred clients',
      numeratorLabel: 'Maternal and baby referrals',
      detailPaths: ['referral.maternal.total', 'referral.baby.total'],
      detailLabels: ['Mother referrals', 'Baby referrals'],
      charts: [
        { type: 'trend', dimension: 'month', title: 'Monthly Trend' },
        { type: 'bar', dimension: 'facility', title: 'Referrals by Facility' }
      ]
    }),
    metric('Overview', 'joint_care_patients', 'Joint Care Patients', 'jointCare.clients', '', {
      definition: 'Counts each client once when an active joint-care relationship is recorded in the selected scope.',
      countedAs: 'Unique joint-care clients',
      numeratorLabel: 'Active joint-care clients',
      charts: []
    }),
    {
      section: 'Overview',
      key: 'mother_service_outcomes',
      label: 'Mother Service Outcomes',
      numerator: 'serviceClosure.mother.byOutcome',
      format: 'map',
      definition: 'Shows the service outcome assigned to each included mother. Mothers without a finalized outcome are shown as In service.',
      countedAs: 'Unique mothers with service records',
      numeratorLabel: 'Mother outcome categories',
      chartOnly: true,
      charts: [{ type: 'donut', dimension: 'motherOutcomes', title: 'Mother Service Outcomes' }]
    },
    {
      section: 'Overview',
      key: 'baby_service_outcomes',
      label: 'Baby Service Outcomes',
      numerator: 'serviceClosure.baby.byOutcome',
      format: 'map',
      definition: 'Shows the service outcome assigned to each included baby. Babies without a finalized outcome are shown as In service.',
      countedAs: 'Unique babies with service records',
      numeratorLabel: 'Baby outcome categories',
      chartOnly: true,
      charts: [{ type: 'donut', dimension: 'babyOutcomes', title: 'Baby Service Outcomes' }]
    },
    metric('Overview', 'home_delivery_sba', 'Home Delivery by SBA', 'delivery.homeSba', '', {
      definition: 'Counts each delivery once when the delivery location is home and a skilled birth attendant is recorded.',
      countedAs: 'Unique home deliveries with SBA',
      numeratorLabel: 'Home deliveries attended by SBA',
      charts: [{ type: 'trend', dimension: 'month', title: 'Monthly Trend' }]
    }),
    metric('Overview', 'institutional_deliveries', 'Institutional Deliveries', 'delivery.institutional', '', {
      definition: 'Counts each delivery once when the delivery location is a public or private health facility.',
      countedAs: 'Unique facility deliveries',
      numeratorLabel: 'Deliveries at health facilities',
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
    definitionVersion: 'dashboard-2026-11-03',
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
