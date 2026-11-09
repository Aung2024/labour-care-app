'use strict'

const ANALYTICS_V4_SCHEMA_VERSION = 'analytics-v4.3.0'
const ANALYTICS_V4_DEFINITION_VERSION = 'dashboard-2026-11-09-monthly-report'

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
  definition('ANC', 'anc_td1_completion', 'TD1 Completion Rate', 'anc.td.td1Completed', 'anc.clients'),
  definition('ANC', 'anc_td2_completion', 'TD2 Completion Rate', 'anc.td.td2Completed', 'anc.clients'),
  definition('ANC', 'anc_b1', 'B1 (ANC)', 'anc.vitaminB1', 'anc.clients'),
  definition('ANC', 'anc_deworming', 'Deworming', 'anc.deworming', 'anc.clients'),
  definition('ANC', 'anc_gbv', 'GBV Suspected', 'anc.gbv', 'anc.clients'),
  definition('ANC', 'anc_pmtct_reactive', 'ANC with PMTCT', 'anc.pmtctReactive', 'anc.clients'),
  definition('ANC', 'anc_hiv_testing', 'HIV Testing', 'anc.hivTested', 'anc.clients'),
  definition('ANC', 'anc_hiv_reactive', 'HIV Reactive Cases', 'anc.pmtctReactive', 'anc.hivTested'),
  definition('ANC', 'anc_tb', 'ANC with TB', 'anc.tb', 'anc.clients'),
  definition('ANC', 'anemia_in_pregnancy', 'Anemia in Pregnancy', 'anc.anemiaClients'),
  definition('ANC', 'anc_outcomes', 'ANC Outcome', 'anc.outcomes', null, {
    format: 'map',
    chart: 'donut'
  }),

  definition('High-Risk', 'high_risk_rate', 'High Risk Factor Rate', 'highRisk.clients', 'anc.clients'),
  definition('High-Risk', 'high_risk_factors', 'High Risk Factors', 'highRisk.factors', null, {
    format: 'map',
    chart: 'bar'
  }),
  definition('High-Risk', 'other_medical_conditions', 'Other Medical Conditions', 'highRisk.otherMedicalConditions', null, {
    format: 'map',
    chart: 'bar'
  }),
  definition('High-Risk', 'hrt_completed', 'High-Risk Completion', 'highRisk.completion.completed'),
  definition('High-Risk', 'high_risk_anc_average', 'Average ANC Visits — High Risk', 'highRisk.ancAverage.highRisk.visits', 'highRisk.ancAverage.highRisk.clients', {
    format: 'average'
  }),
  definition('High-Risk', 'normal_anc_average', 'Average ANC Visits — Normal Patients', 'highRisk.ancAverage.nonHighRisk.visits', 'highRisk.ancAverage.nonHighRisk.clients', {
    format: 'average'
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
  definition('Newborn & KMC', 'newborn_clients', 'Newborn Care Headcount', 'newborn.clients'),
  definition('Newborn & KMC', 'birth_weight_recorded', 'Birth Weight Recorded', 'newborn.birthWeightMeasured', 'registration.babies'),
  definition('Newborn & KMC', 'low_birth_weight', 'Total LBW Newborns', 'newborn.lowBirthWeight', 'registration.babies'),
  definition('Newborn & KMC', 'preterm_babies', 'Total Preterm Newborns', 'newborn.preterm', 'registration.babies'),
  definition('Newborn & KMC', 'newborn_care_2_days', 'Newborn Care ≤2 Days', 'newborn.careWithin2Days'),
  definition('Newborn & KMC', 'early_breastfeeding', 'Early Breastfeeding', 'newborn.earlyBreastfeeding'),
  definition('Newborn & KMC', 'kmc_eligible', 'KMC Eligible Newborns', 'newborn.kmcEligible'),
  definition('Newborn & KMC', 'kmc_eligible_rate', 'KMC Eligibility Rate', 'newborn.kmcEligible', 'newborn.aliveBirths'),
  definition('Newborn & KMC', 'kmc_preterm', 'KMC Preterm', 'newborn.kmcPreterm'),
  definition('Newborn & KMC', 'kmc_low_birth_weight', 'KMC Low Birth Weight', 'newborn.kmcLowBirthWeight'),
  definition('Newborn & KMC', 'kmc_preterm_lbw', 'Both Preterm + LBW Babies', 'newborn.kmcPretermAndLowBirthWeight'),
  definition('Newborn & KMC', 'kmc_received', 'Newborns Receiving KMC', 'newborn.kmcReceived'),
  definition('Newborn & KMC', 'kmc_rate', 'Newborn KMC Rate', 'newborn.kmcReceived', 'newborn.kmcEligible'),
  definition('Newborn & KMC', 'kmc_completion', 'KMC Completion', 'newborn.kmcCompleted', 'newborn.kmcEligible', {
    chart: 'completion'
  }),
  definition('Newborn & KMC', 'kmc_weight_gain', 'Average KMC Weight Gain', 'newborn.kmcWeightGain.totalGainGrams', 'newborn.kmcWeightGain.babiesWithTwoWeights', {
    format: 'averageGrams',
    chart: 'trend'
  }),

  definition('PNC', 'pnc_clients', 'Total PNC Headcount', 'pnc.clients'),
  definition('PNC', 'pnc_coverage', 'PNC Coverage', 'pnc.coverageNumerator', 'delivery.completedNotes'),
  definition('PNC', 'average_pnc_visits', 'Average PNC Visits', 'pnc.visits', 'pnc.clients', { format: 'average' }),
  definition('PNC', 'pnc_at_least_4', 'PNC with 4 or more Visits', 'pnc.atLeast4', 'pnc.clients'),
  definition('PNC', 'pnc_within_48h', 'PNC within 48 hr', 'pnc.within48Hours', 'pnc.clients'),
  definition('PNC', 'pnc_within_42d', 'PNC within 42 Days', 'pnc.within42Days', 'pnc.clients'),
  definition('PNC', 'pnc_mother_anc_4', 'Delivered Mothers with ≥4 ANC', 'pnc.mothersWithAnc4', 'pnc.deliveredMothers'),
  definition('PNC', 'pnc_mother_anc_8', 'Delivered Mothers with ≥8 ANC', 'pnc.mothersWithAnc8', 'pnc.deliveredMothers'),
  definition('PNC', 'pnc_iron_folate', 'Iron/Folate (PNC)', 'pnc.ironFolate', 'pnc.clients'),
  definition('PNC', 'pnc_b1', 'B1 (PNC within 42 days)', 'pnc.vitaminB1', 'pnc.clients'),
  definition('PNC', 'pph_cases', 'PPH Cases', 'pnc.pph', 'pnc.clients'),
  definition('PNC', 'pnc_outcome', 'PNC Outcome', 'pnc.outcomes', null, {
    format: 'map',
    chart: 'donut'
  }),

  definition('Referral & Joint Care', 'total_referrals', 'Total Referrals', 'referral.total'),
  definition('Referral & Joint Care', 'maternal_referrals', 'Maternal Referrals', 'referral.maternal.total'),
  definition('Referral & Joint Care', 'baby_referrals', 'Baby Referrals', 'referral.baby.total'),
  definition('Referral & Joint Care', 'joint_care_patients', 'Total Joint Care', 'jointCare.clients'),
  definition('Referral & Joint Care', 'joint_care_breakdown', 'Joint Care by Facility Account Type', 'jointCare.byFacilityAccountType', null, {
    format: 'map',
    chart: 'bar'
  }),
  definition('Referral & Joint Care', 'joint_care_owner_receiver', 'Joint Care: Original Owner and Receiver', 'jointCare.byOwnerReceiver', null, {
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
