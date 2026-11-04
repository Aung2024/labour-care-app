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
        { type: 'donut', dimension: 'township', title: 'Total Clients by TSP', overviewInsight: true }
      ]
    }),
    metric('Overview', 'facility_count', 'Total Facilities', 'facilityCount', '', {
      definition: 'Counts facilities in the selected scope that have at least one registered client in the selected period.',
      countedAs: 'Facilities with registered clients',
      numeratorLabel: 'Facilities with registered clients',
      charts: [],
      compactContext: true,
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
      overviewInsight: true,
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
      overviewInsight: true,
      charts: [{ type: 'donut', dimension: 'babyOutcomes', title: 'Baby Service Outcomes' }]
    },
    metric('Overview', 'home_delivery_sba', 'Home Delivery by SBA', 'delivery.homeSba', '', {
      definition: 'Counts each delivery once when the delivery location is home and a skilled birth attendant is recorded.',
      countedAs: 'Unique home deliveries with SBA',
      numeratorLabel: 'Home deliveries attended by SBA',
      charts: [
        { type: 'trend', dimension: 'month', title: 'Monthly Trend' },
        { type: 'bar', dimension: 'facility', title: 'Home Delivery by SBA by Facility' }
      ]
    }),
    metric('Overview', 'institutional_deliveries', 'Institutional Deliveries', 'delivery.institutional', '', {
      definition: 'Counts each delivery once when the delivery location is a public or private health facility.',
      countedAs: 'Unique facility deliveries',
      numeratorLabel: 'Deliveries at health facilities',
      charts: [
        { type: 'trend', dimension: 'month', title: 'Monthly Trend' },
        { type: 'bar', dimension: 'facility', title: 'Institutional Deliveries by Facility' }
      ]
    }),
    {
      section: 'Overview',
      key: 'age_demographics',
      label: 'Age Demographics',
      numerator: 'registration.ageGroups',
      format: 'map',
      chartOnly: true,
      overviewInsight: true,
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
      overviewInsight: true,
      charts: [{ type: 'bar', dimension: 'gp', title: 'Average Gravida and Parity' }]
    },

    metric('ANC', 'anc_clients', 'ANC Clients', 'anc.clients'),
    metric('ANC', 'anc_visits', 'ANC Visits', 'anc.services'),
    metric('ANC', 'anc_at_least_4', 'ANC ≥4 Visits', 'anc.atLeast4', 'anc.clients'),
    metric('ANC', 'anc_at_least_8', 'ANC ≥8 Visits', 'anc.atLeast8', 'anc.clients'),
    metric('ANC', 'early_anc', 'Early ANC', 'anc.early', 'anc.clients'),
    metric('ANC', 'anc_iron_folate', 'Iron/Folate (ANC)', 'anc.ironFolate', 'anc.clients'),
    metric('ANC', 'anc_td1_completion', 'TD1 Completion Rate', 'anc.td.td1Completed', 'anc.clients', {
      definition: 'Shows the percentage of ANC mothers with TD1, TD2, or Completed recorded in an ANC visit during the selected period.',
      countedAs: 'Unique ANC mothers',
      numeratorLabel: 'Mothers with TD1 completed',
      charts: [{ type: 'trend', dimension: 'month', title: 'TD1 Completion Rate' }, { type: 'bar', dimension: 'facility', title: 'TD1 by Facility' }]
    }),
    metric('ANC', 'anc_td2_completion', 'TD2 Completion Rate', 'anc.td.td2Completed', 'anc.clients', {
      definition: 'Shows the percentage of ANC mothers with TD2 or Completed recorded in an ANC visit during the selected period.',
      countedAs: 'Unique ANC mothers',
      numeratorLabel: 'Mothers with TD2 completed',
      charts: [{ type: 'trend', dimension: 'month', title: 'TD2 Completion Rate' }, { type: 'bar', dimension: 'facility', title: 'TD2 by Facility' }]
    }),
    metric('ANC', 'anc_b1', 'B1 (ANC)', 'anc.vitaminB1', 'anc.clients'),
    metric('ANC', 'anc_deworming', 'Deworming', 'anc.deworming', 'anc.clients'),
    metric('ANC', 'anc_gbv', 'GBV Suspected', 'anc.gbv', 'anc.clients'),
    metric('ANC', 'anc_pmtct_reactive', 'ANC with PMTCT', 'anc.pmtctReactive', 'anc.clients', {
      definition: 'Counts ANC mothers with a reactive HIV result in the selected period. The percentage compares reactive cases with the ANC headcount.',
      countedAs: 'Unique ANC mothers',
      numeratorLabel: 'ANC mothers with reactive HIV result',
      detailPaths: ['anc.clients', 'anc.hivTested'],
      detailLabels: ['Total ANC headcount', 'HIV tests recorded'],
      charts: [{ type: 'trend', dimension: 'month', title: 'ANC with PMTCT' }, { type: 'bar', dimension: 'facility', title: 'PMTCT by Facility' }]
    }),
    metric('ANC', 'anc_hiv_testing', 'HIV Testing', 'anc.hivTested', 'anc.clients', {
      definition: 'Counts ANC mothers with any HIV test result recorded in the selected period, including reactive, non-reactive, and indeterminate results.',
      countedAs: 'Unique ANC mothers',
      numeratorLabel: 'ANC mothers with HIV testing',
      detailPaths: ['anc.pmtctReactive'],
      detailLabels: ['Reactive HIV cases'],
      charts: [{ type: 'trend', dimension: 'month', title: 'HIV Testing' }, { type: 'bar', dimension: 'facility', title: 'HIV Testing by Facility' }]
    }),
    metric('ANC', 'anc_hiv_reactive', 'HIV Reactive Cases', 'anc.pmtctReactive', 'anc.hivTested', {
      definition: 'Shows the percentage of ANC mothers with reactive HIV results among mothers who received HIV testing in the selected period.',
      countedAs: 'Unique ANC mothers',
      numeratorLabel: 'Reactive HIV cases',
      denominatorLabel: 'ANC mothers with HIV testing',
      charts: [{ type: 'trend', dimension: 'month', title: 'HIV Reactive Cases' }, { type: 'bar', dimension: 'facility', title: 'HIV Reactive by Facility' }]
    }),
    metric('ANC', 'anc_tb', 'ANC with TB', 'anc.tb', 'anc.clients'),
    metric('ANC', 'anemia_in_pregnancy', 'Anemia in Pregnancy', 'anc.anemiaClients', '', {
      definition: 'Counts each ANC mother once when her latest hemoglobin result in the selected period indicates moderate anemia (7.0–9.9 g/dL) or severe anemia (below 7.0 g/dL).',
      countedAs: 'Unique ANC mothers',
      numeratorLabel: 'Mothers with moderate or severe anemia',
      detailPaths: ['anc.anemiaBySeverity.Moderate', 'anc.anemiaBySeverity.Severe'],
      detailLabels: ['Moderate anemia', 'Severe anemia'],
      charts: [
        { type: 'trend', dimension: 'month', title: 'Monthly Trend' },
        { type: 'bar', dimension: 'facility', title: 'Anemia in Pregnancy by Facility' }
      ]
    }),
    {
      section: 'ANC',
      key: 'anc_outcomes',
      label: 'ANC Outcome',
      numerator: 'anc.outcomes',
      format: 'map',
      chartOnly: true,
      definition: 'Classifies each ANC mother once using her latest recorded outcome in the selected period. The current maternal outcome field takes priority, with legacy provisional diagnosis used when needed.',
      countedAs: 'Unique ANC mothers with a recorded outcome',
      numeratorLabel: 'ANC outcome categories',
      charts: [{ type: 'donut', dimension: 'ancOutcomes', title: 'Latest ANC Outcome' }]
    },

    metric('High-Risk', 'hrt_total', 'Total HRT Patients', 'highRisk.tracking.total', '', {
      definition: 'Counts all high-risk mothers currently represented in the HRT tracking list for the user’s authorized scope.',
      countedAs: 'Unique HRT tracking patients',
      numeratorLabel: 'HRT patients',
      charts: []
    }),
    metric('High-Risk', 'hrt_active', 'Active HRT', 'highRisk.tracking.active', '', {
      definition: 'Counts HRT patients whose next follow-up is currently on track.',
      countedAs: 'Unique active HRT patients',
      numeratorLabel: 'Active HRT patients',
      charts: []
    }),
    metric('High-Risk', 'hrt_overdue', 'Overdue HRT', 'highRisk.tracking.overdue', '', {
      definition: 'Counts HRT patients whose next follow-up date has passed but is still within the follow-up threshold.',
      countedAs: 'Unique overdue HRT patients',
      numeratorLabel: 'Overdue HRT patients',
      charts: []
    }),
    metric('High-Risk', 'hrt_defaulted', 'Defaulted HRT', 'highRisk.tracking.defaulted', '', {
      definition: 'Counts HRT patients whose follow-up is beyond the allowed threshold and has not been marked complete.',
      countedAs: 'Unique defaulted HRT patients',
      numeratorLabel: 'Defaulted HRT patients',
      charts: []
    }),
    metric('High-Risk', 'high_risk_rate', 'High Risk Rate', 'highRisk.clients', 'anc.clients', {
      definition: 'Shows the percentage of ANC mothers identified as high risk during the selected period.',
      countedAs: 'Unique high-risk ANC mothers',
      numeratorLabel: 'High-risk ANC mothers',
      charts: [
        { type: 'trend', dimension: 'month', title: 'High Risk Rate Trend' },
        { type: 'bar', dimension: 'facility', title: 'High Risk Rate by Facility' }
      ]
    }),
    metric('High-Risk', 'hrt_completed', 'Completed HRT', 'highRisk.tracking.completed', '', {
      definition: 'Counts HRT patients that a midwife explicitly marked complete. Completion is not automatic.',
      countedAs: 'Unique completed HRT patients',
      numeratorLabel: 'Completed HRT patients',
      charts: []
    }),
    metric('High-Risk', 'high_risk_anc_average', 'Average ANC Visits — High Risk', 'highRisk.ancAverage.highRisk.visits', 'highRisk.ancAverage.highRisk.clients', {
      definition: 'Average number of ANC visits recorded for mothers identified as high risk in the selected period.',
      countedAs: 'High-risk ANC mothers',
      numeratorLabel: 'High-risk ANC visits',
      format: 'average',
      charts: []
    }),
    metric('High-Risk', 'normal_anc_average', 'Average ANC Visits — Normal Patients', 'highRisk.ancAverage.nonHighRisk.visits', 'highRisk.ancAverage.nonHighRisk.clients', {
      definition: 'Average number of ANC visits recorded for mothers not identified as high risk in the selected period.',
      countedAs: 'Normal-risk ANC mothers',
      numeratorLabel: 'Normal-risk ANC visits',
      format: 'average',
      charts: []
    }),
    {
      section: 'High-Risk',
      key: 'high_risk_factors',
      label: 'High Risk Factors',
      numerator: 'highRisk.factors',
      format: 'map',
      chartOnly: true,
      definition: 'Breaks down the high-risk factors recorded in ANC visits. A mother may appear under more than one factor.',
      countedAs: 'Recorded high-risk factor assignments',
      numeratorLabel: 'High-risk factor assignments',
      charts: [{ type: 'bar', dimension: 'riskFactors', title: 'High Risk Factors' }]
    },
    {
      section: 'High-Risk',
      key: 'other_medical_conditions',
      label: 'Other Medical Conditions',
      numerator: 'highRisk.otherMedicalConditions',
      format: 'map',
      chartOnly: true,
      definition: 'Shows the other medical condition names entered manually in high-risk ANC records.',
      countedAs: 'Recorded manual condition names',
      numeratorLabel: 'Other medical condition entries',
      charts: [{ type: 'bar', dimension: 'otherMedicalConditions', title: 'Other Medical Conditions' }]
    },

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

  var ancClientExplanations = {
    anc_clients: 'Counts each mother once when at least one ANC visit is recorded in the selected period.',
    anc_visits: 'Counts all ANC visits recorded during the selected period. One mother may contribute multiple visits.',
    anc_at_least_4: 'Counts mothers whose ANC history reaches four or more visits, including visits recorded at another facility.',
    anc_at_least_8: 'Counts mothers whose ANC history reaches eight or more visits, including visits recorded at another facility.',
    early_anc: 'Counts mothers whose first ANC contact occurred before 12 weeks of pregnancy.',
    anc_iron_folate: 'Counts ANC mothers with iron or folic-acid supplementation recorded in the selected period.',
    anc_b1: 'Counts ANC mothers with vitamin B1 recorded in the selected period.',
    anc_deworming: 'Counts ANC mothers with deworming recorded in the selected period.',
    anc_gbv: 'Counts ANC mothers with suspected gender-based violence recorded in the selected period.',
    anc_tb: 'Counts ANC mothers with TB symptoms or suspected TB recorded in the selected period.'
  }
  definitions.filter(function (definition) {
    return definition.section === 'ANC'
  }).forEach(function (definition) {
    if (ancClientExplanations[definition.key]) {
      definition.definition = ancClientExplanations[definition.key]
      definition.countedAs = definition.key === 'anc_visits'
        ? 'Recorded ANC visits'
        : 'Unique ANC mothers'
      definition.numeratorLabel = definition.key === 'anc_visits'
        ? 'ANC visits'
        : 'ANC mothers'
    }
    if (!definition.charts) {
      definition.charts = [
        { type: 'trend', dimension: 'month', title: 'Monthly Trend' },
        { type: 'bar', dimension: 'facility', title: definition.label + ' by Facility' }
      ]
    }
  })

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
    schemaVersion: 'analytics-v4.1.0',
    definitionVersion: 'dashboard-2026-11-04',
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
