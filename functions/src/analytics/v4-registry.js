'use strict'

const ANALYTICS_V4_SCHEMA_VERSION = 'analytics-v4.0.0'
const ANALYTICS_V4_DEFINITION_VERSION = 'dashboard-2026-10-25'

const definition = (
  section,
  key,
  label,
  numerator,
  denominator,
  options = {}
) => Object.freeze({
  section,
  key,
  label,
  numerator,
  denominator: denominator || null,
  format: denominator ? 'percent' : 'count',
  chart: 'trend',
  ...options
})

const SECTIONS = Object.freeze([
  'Overview',
  'ANC',
  'High-Risk',
  'Delivery',
  'Newborn & KMC',
  'PNC',
  'Referral & Joint Care'
])

const DASHBOARD_METRICS = Object.freeze([
  definition('Overview', 'total_clients', 'Total Clients', 'registration.total', null, {
    chart: 'trend',
    detailPaths: ['registration.mothers', 'registration.babies']
  }),
  definition('Overview', 'anc_clients', 'ANC Clients', 'anc.clients'),
  definition('Overview', 'high_risk_identified', 'High Risks Identified Among All ANC', 'highRisk.clients'),
  definition('Overview', 'institutional_deliveries', 'Institutional Deliveries', 'delivery.institutional', null, { chart: 'trend' }),
  definition('Overview', 'home_delivery_sba', 'Home Delivery by SBA', 'delivery.homeSba', null, { chart: 'trend' }),
  definition('Overview', 'pnc_clients', 'PNC Clients', 'pnc.clients'),
  definition('Overview', 'newborn_care_clients', 'Newborn Care Clients', 'newborn.clients'),
  definition('Overview', 'baby_referrals', 'Baby Referrals', 'referral.baby.total'),
  definition('Overview', 'finalized_outcomes', 'Finalized Service Outcomes', 'serviceClosure.total', null, {
    chart: 'outcome'
  }),

  definition('ANC', 'anc_clients', 'ANC Clients', 'anc.clients'),
  definition('ANC', 'anc_visits', 'ANC Visits', 'anc.services'),
  definition('ANC', 'anc_at_least_4', 'ANC ≥4 Visits', 'anc.atLeast4', 'anc.clients'),
  definition('ANC', 'anc_at_least_8', 'ANC ≥8 Visits', 'anc.atLeast8', 'anc.clients'),
  definition('ANC', 'early_anc', 'Early ANC', 'anc.early', 'anc.clients'),
  definition('ANC', 'anc_iron_folate', 'Iron/Folate (ANC)', 'anc.ironFolate', 'anc.clients'),
  definition('ANC', 'anc_td_protected', 'TD Protected', 'anc.td.protected', 'anc.clients', {
    chart: 'td',
    detailMap: 'anc.td.byLatestStatus'
  }),
  definition('ANC', 'anc_b1', 'B1 (ANC)', 'anc.vitaminB1', 'anc.clients'),
  definition('ANC', 'anc_deworming', 'Deworming', 'anc.deworming', 'anc.clients'),
  definition('ANC', 'anc_gbv', 'GBV Suspected', 'anc.gbv', 'anc.clients'),
  definition('ANC', 'anc_pmtct', 'ANC with PMTCT', 'anc.pmtctTested', 'anc.clients'),
  definition('ANC', 'anc_tb', 'ANC with TB', 'anc.tb', 'anc.clients'),

  definition('High-Risk', 'high_risk_clients', 'High Risks Identified Among All ANC', 'highRisk.clients'),
  definition('High-Risk', 'high_risk_factors', 'Risk Factors Documented', 'highRisk.factors', null, {
    format: 'map',
    chart: 'bar'
  }),
  definition('High-Risk', 'hrt_completed', 'High-Risk Completion', 'highRisk.completion.completed', null, {
    chart: 'completion',
    detailMap: 'highRisk.completion.byReason'
  }),
  definition('High-Risk', 'high_risk_anc_average', 'Average ANC Visits — High Risk', 'highRisk.ancAverage.highRisk.visits', 'highRisk.ancAverage.highRisk.clients', {
    format: 'average',
    chart: 'comparison',
    comparison: [
      { label: 'High Risk', numerator: 'highRisk.ancAverage.highRisk.visits', denominator: 'highRisk.ancAverage.highRisk.clients' },
      { label: 'Non-High Risk', numerator: 'highRisk.ancAverage.nonHighRisk.visits', denominator: 'highRisk.ancAverage.nonHighRisk.clients' }
    ]
  }),

  definition('Delivery', 'delivery_total', 'Total Deliveries', 'delivery.completedNotes'),
  definition('Delivery', 'home_delivery_sba', 'Home Delivery by SBA', 'delivery.homeSba'),
  definition('Delivery', 'institutional_delivery', 'Institutional Delivery', 'delivery.institutional'),
  definition('Delivery', 'skilled_birth_attendant_rate', 'Skilled Birth Attendant Rate', 'delivery.skilledTotal', 'delivery.completedNotes'),
  definition('Delivery', 'uterotonic_rate', 'Uterotonic Use Rate', 'delivery.uterotonic', 'delivery.completedNotes'),
  definition('Delivery', 'lcg_usage', 'LCG Usage', 'delivery.lcgUsed', 'delivery.completedNotes'),
  definition('Delivery', 'delivery_mode', 'Mode of Delivery', 'delivery.modes', null, { format: 'map', chart: 'donut' }),
  definition('Delivery', 'birthplace', 'Birthplace', 'delivery.places', null, { format: 'map', chart: 'donut' }),
  definition('Delivery', 'maternal_outcome', 'Delivery-Note Maternal Outcomes', 'delivery.maternalOutcomes', null, { format: 'map', chart: 'bar' }),
  definition('Delivery', 'newborn_outcome', 'Delivery-Note Newborn Outcomes', 'delivery.newbornOutcomes', null, { format: 'map', chart: 'bar' }),

  definition('Newborn & KMC', 'newborn_total', 'Total Newborns', 'registration.babies'),
  definition('Newborn & KMC', 'newborn_clients', 'Newborn Care Clients', 'newborn.clients'),
  definition('Newborn & KMC', 'birth_weight_recorded', 'Birth Weight Recorded', 'newborn.birthWeightMeasured', 'registration.babies'),
  definition('Newborn & KMC', 'low_birth_weight', 'Low Birth Weight Babies', 'newborn.lowBirthWeight', 'registration.babies'),
  definition('Newborn & KMC', 'preterm_babies', 'Preterm Babies', 'newborn.preterm', 'registration.babies'),
  definition('Newborn & KMC', 'newborn_care_2_days', 'NBC ≤2 Days', 'newborn.careWithin2Days', 'registration.babies'),
  definition('Newborn & KMC', 'kmc_completion', 'KMC Completion', 'newborn.kmcCompleted', 'newborn.kmcEligible', {
    chart: 'completion'
  }),
  definition('Newborn & KMC', 'kmc_weight_gain', 'Average KMC Weight Gain', 'newborn.kmcWeightGain.totalGainGrams', 'newborn.kmcWeightGain.babiesWithTwoWeights', {
    format: 'averageGrams',
    chart: 'trend'
  }),

  definition('PNC', 'pnc_clients', 'Total PNC Headcount', 'pnc.clients'),
  definition('PNC', 'pnc_coverage', 'PNC Coverage', 'pnc.coverageNumerator', 'pnc.deliveredMothers'),
  definition('PNC', 'average_pnc_visits', 'Average PNC Visits', 'pnc.visits', 'pnc.clients', { format: 'average' }),
  definition('PNC', 'pnc_at_least_4', 'PNC ≥4 Visits', 'pnc.atLeast4', 'pnc.clients'),
  definition('PNC', 'pnc_within_48h', 'PNC ≤48h Visits', 'pnc.within48Hours', 'pnc.clients'),
  definition('PNC', 'pnc_within_42d', 'PNC ≤42d Visits', 'pnc.within42Days', 'pnc.clients'),
  definition('PNC', 'pnc_mother_anc_4', 'Delivered Mothers with ≥4 ANC', 'pnc.mothersWithAnc4', 'pnc.deliveredMothers'),
  definition('PNC', 'pnc_mother_anc_8', 'Delivered Mothers with ≥8 ANC', 'pnc.mothersWithAnc8', 'pnc.deliveredMothers'),
  definition('PNC', 'pnc_iron_folate', 'Iron/Folate (PNC)', 'pnc.ironFolate', 'pnc.clients'),
  definition('PNC', 'pnc_b1', 'B1 (PNC within 42 days)', 'pnc.vitaminB1', 'pnc.clients'),
  definition('PNC', 'pph_cases', 'PPH Cases', 'pnc.pph', 'pnc.deliveredMothers'),

  definition('Referral & Joint Care', 'maternal_referrals', 'Maternal Referrals', 'referral.maternal.total'),
  definition('Referral & Joint Care', 'baby_referrals', 'Baby Referrals', 'referral.baby.total'),
  definition('Referral & Joint Care', 'maternal_referral_rate', 'Maternal Referral Rate', 'referral.maternal.total', 'registration.mothers'),
  definition('Referral & Joint Care', 'referral_stage', 'Maternal Referral by Stage', 'referral.maternal.byStage', null, { format: 'map', chart: 'bar' }),
  definition('Referral & Joint Care', 'referral_destination', 'Maternal Referral Destination', 'referral.maternal.byDestination', null, { format: 'map', chart: 'donut' }),
  definition('Referral & Joint Care', 'baby_referral_destination', 'Baby Referral Destination', 'referral.baby.byDestination', null, { format: 'map', chart: 'bar' }),
  definition('Referral & Joint Care', 'joint_care_patients', 'Active Joint-Care Patients', 'jointCare.clients'),
  definition('Referral & Joint Care', 'joint_care_facilities', 'Receiving Facilities', 'jointCare.receivingFacilityCount'),
  definition('Referral & Joint Care', 'joint_care_breakdown', 'Joint Care: Hospital vs Other', 'jointCare.byReceivingFacilityType', null, {
    format: 'map',
    chart: 'bar'
  })
])

const metricByKey = Object.freeze(Object.fromEntries(
  DASHBOARD_METRICS.map((item) => [item.key, item])
))

module.exports = {
  ANALYTICS_V4_SCHEMA_VERSION,
  ANALYTICS_V4_DEFINITION_VERSION,
  SECTIONS,
  DASHBOARD_METRICS,
  metricByKey
}
