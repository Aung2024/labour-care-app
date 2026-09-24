'use strict'

const ANALYTICS_V3_SCHEMA_VERSION = 'analytics-v3.0.0'
const ANALYTICS_V31_SCHEMA_VERSION = 'analytics-v3.1.0'
const ANALYTICS_V32_SCHEMA_VERSION = 'analytics-v3.2.0'

const indicator = (
  row,
  section,
  key,
  displayName,
  numeratorKey,
  denominatorKey,
  output = 'counter'
) => Object.freeze({
  row,
  section,
  key,
  displayName,
  definitionVersion: ANALYTICS_V3_SCHEMA_VERSION,
  numeratorKey,
  denominatorKey: denominatorKey || null,
  output,
  aggregation: output === 'map' ? 'sum-by-key' : 'sum'
})

const INDICATOR_REGISTRY_V3 = Object.freeze([
  indicator(1, 'Overview', 'registration_clients', 'Total Registration Clients', 'registration.total'),
  indicator(2, 'Overview', 'overview_anc_clients', 'Total ANC', 'anc.clients'),
  indicator(3, 'Overview', 'overview_high_risk', 'High-Risk Pregnancy', 'highRisk.clients'),
  indicator(4, 'Overview', 'overview_institutional_delivery', 'Institutional Deliveries', 'delivery.institutionalSkilled'),
  indicator(5, 'Overview', 'overview_home_delivery', 'Home Deliveries by SBA', 'delivery.homeSkilled'),
  indicator(6, 'Overview', 'overview_pnc_clients', 'Total PNC', 'pnc.clients'),
  indicator(7, 'Overview', 'overview_newborn_clients', 'Total NBC', 'newborn.clients'),
  indicator(8, 'Overview', 'overview_maternal_referrals', 'Maternal Referrals', 'referral.total'),
  indicator(9, 'Overview', 'overview_joint_care', 'Joint Care', 'jointCare.clients'),
  indicator(10, 'ANC', 'anc_clients', 'Total ANC', 'anc.clients'),
  indicator(11, 'ANC', 'anc_services', 'ANC Services', 'anc.services'),
  indicator(12, 'ANC', 'anc_at_least_4', 'ANC ≥4', 'anc.atLeast4', 'anc.clients'),
  indicator(13, 'ANC', 'anc_at_least_8', 'ANC ≥8', 'anc.atLeast8', 'anc.clients'),
  indicator(14, 'ANC', 'early_anc', 'Early ANC', 'anc.early', 'anc.clients'),
  indicator(15, 'ANC', 'anc_iron_folate', 'Iron/Folate (ANC)', 'anc.ironFolate', 'anc.clients'),
  indicator(16, 'PNC', 'pnc_iron_folate', 'Iron/Folate (PNC)', 'pnc.ironFolate', 'pnc.deliveredMothers'),
  indicator(17, 'ANC', 'anc_b1', 'B1 (ANC)', 'anc.vitaminB1', 'anc.clients'),
  indicator(18, 'PNC', 'pnc_b1', 'B1 (PNC during 42 days)', 'pnc.vitaminB1', 'pnc.deliveredMothers'),
  indicator(19, 'ANC', 'anc_deworming', 'Deworming', 'anc.deworming', 'anc.clients'),
  indicator(20, 'ANC', 'anc_gbv', 'GBV suspected', 'anc.gbv', 'anc.clients'),
  indicator(21, 'ANC', 'anc_pmtct', 'ANC with PMTCT', 'anc.pmtctTested', 'anc.clients'),
  indicator(22, 'ANC', 'anc_tb', 'ANC with TB', 'anc.tb', 'anc.clients'),
  indicator(23, 'High-Risk', 'high_risk_clients', 'High-Risk Pregnancy', 'highRisk.clients'),
  indicator(24, 'High-Risk', 'high_risk_factors', 'High-Risk Factors', 'highRisk.factors', null, 'map'),
  indicator(25, 'High-Risk', 'high_risk_other_diseases', 'Other Medical Diseases', 'highRisk.otherMedicalDiseases', null, 'map'),
  indicator(26, 'Delivery', 'home_delivery_skilled', 'Home Delivery by SBA', 'delivery.homeSkilled', 'delivery.completedNotes'),
  indicator(27, 'Delivery', 'institutional_delivery_skilled', 'Institutional Delivery', 'delivery.institutionalSkilled', 'delivery.completedNotes'),
  indicator(28, 'Delivery', 'uterotonic_use', 'Uterotonic Use', 'delivery.uterotonic', 'delivery.completedNotes'),
  indicator(29, 'Delivery', 'uterotonic_rate', 'Uterotonic Use Rate', 'delivery.uterotonic', 'delivery.completedNotes'),
  indicator(30, 'Delivery', 'skilled_home_birth_rate', 'Skilled Home Birth Rate', 'delivery.homeSkilled', 'delivery.completedNotes'),
  indicator(31, 'Delivery', 'lcg_usage', 'LCG Usage', 'delivery.lcgUsed', 'delivery.completedNotes'),
  indicator(32, 'Delivery', 'delivery_mode', 'Mode of Delivery', 'delivery.modes', 'delivery.completedNotes', 'map'),
  indicator(33, 'Delivery', 'birthplace', 'Birthplace', 'delivery.places', 'delivery.completedNotes', 'map'),
  indicator(34, 'Delivery', 'maternal_outcome', 'Maternal Outcome', 'delivery.maternalOutcomes', 'delivery.completedNotes', 'map'),
  indicator(35, 'Delivery', 'newborn_outcome', 'Newborn Outcome', 'delivery.newbornOutcomes', 'newborn.births', 'map'),
  indicator(36, 'Newborn', 'early_breastfeeding', 'Early Breastfeeding', 'newborn.earlyBreastfeeding', 'newborn.liveBirths'),
  indicator(37, 'PNC', 'pnc_coverage', 'PNC coverage', 'pnc.clients', 'pnc.deliveredMothers'),
  indicator(38, 'PNC', 'average_pnc_visits', 'Average PNC visit', 'pnc.visits', 'pnc.clients'),
  indicator(39, 'PNC', 'pnc_at_least_4', 'PNC ≥4', 'pnc.atLeast4', 'pnc.clients'),
  indicator(40, 'PNC', 'pnc_within_48h', 'PNC ≤48h', 'pnc.within48Hours', 'pnc.deliveredMothers'),
  indicator(41, 'PNC', 'pnc_within_42d', 'PNC ≤42d', 'pnc.within42Days', 'pnc.deliveredMothers'),
  indicator(42, 'PNC', 'pnc_mother_anc_4', 'PN Mother with ≥4 ANC', 'pnc.mothersWithAnc4', 'pnc.deliveredMothers'),
  indicator(43, 'PNC', 'pnc_mother_anc_8', 'PN Mother with ≥8 ANC', 'pnc.mothersWithAnc8', 'pnc.deliveredMothers'),
  indicator(44, 'PNC', 'pph_cases', 'PPH', 'pnc.pph', 'pnc.deliveredMothers'),
  indicator(45, 'Newborn', 'birth_weight_measured', 'Birth Weight Measured', 'newborn.birthWeightMeasured', 'newborn.liveBirths'),
  indicator(46, 'Newborn', 'low_birth_weight', 'Low Birth Weight', 'newborn.lowBirthWeight', 'newborn.liveBirths'),
  indicator(47, 'Newborn', 'newborn_care_2_days', 'NBC ≤2 days', 'newborn.careWithin2Days', 'newborn.liveBirths'),
  indicator(48, 'Newborn', 'kmc_eligible', 'KMC Eligible', 'newborn.kmcEligible', 'newborn.liveBirths'),
  indicator(49, 'Newborn', 'kmc_received', 'KMC Cases and Coverage', 'newborn.kmcReceived', 'newborn.kmcEligible'),
  indicator(50, 'Referral', 'maternal_referrals', 'Total Maternal Referral', 'referral.total'),
  indicator(51, 'Referral', 'maternal_referral_rate', 'Maternal Referral Rate', 'referral.total', 'registration.mothers'),
  indicator(52, 'Referral', 'referral_stage', 'Referral by Stage', 'referral.byStage', null, 'map'),
  indicator(53, 'Referral', 'referral_destination', 'Referral Destination', 'referral.byDestination', null, 'map'),
  indicator(54, 'Joint Care', 'joint_care_patients', 'Joint Care', 'jointCare.clients')
])

const indicatorByKey = Object.freeze(Object.fromEntries(
  INDICATOR_REGISTRY_V3.map((item) => [item.key, item])
))

const supplementalIndicator = (
  row,
  section,
  key,
  displayName,
  numeratorKey,
  denominatorKey,
  output = 'counter'
) => Object.freeze({
  row,
  section,
  key,
  displayName,
  definitionVersion: ANALYTICS_V31_SCHEMA_VERSION,
  numeratorKey,
  denominatorKey: denominatorKey || null,
  output,
  aggregation: output === 'map' ? 'sum-by-key' : 'sum'
})

const SUPPLEMENTAL_INDICATORS_V31 = Object.freeze([
  supplementalIndicator(55, 'Overview', 'registered_mothers', 'Registered Mothers', 'registration.mothers'),
  supplementalIndicator(56, 'Overview', 'registered_babies', 'Registered Babies', 'registration.babies'),
  supplementalIndicator(57, 'Overview', 'maternal_age_groups', 'Maternal Age Groups', 'registration.ageGroups', null, 'map'),
  supplementalIndicator(58, 'Delivery', 'actual_delivery_notes', 'Delivery Notes', 'delivery.actualNotes'),
  supplementalIndicator(59, 'Delivery', 'babies_in_delivery_notes', 'Babies in Delivery Notes', 'delivery.babiesInNotes'),
  supplementalIndicator(60, 'Delivery', 'legacy_delivery_cases', 'Legacy-derived Delivery Cases', 'delivery.legacyDerived'),
  supplementalIndicator(61, 'Newborn', 'canonical_nbc_clients', 'Unique NBC Clients', 'newborn.canonicalClients'),
  supplementalIndicator(62, 'Newborn', 'canonical_newborns', 'Canonical Newborns', 'newborn.canonicalBabies'),
  supplementalIndicator(63, 'Newborn', 'total_kmc_yes', 'Total KMC (Yes)', 'newborn.kmcYes'),
  supplementalIndicator(64, 'Newborn', 'preterm_babies', 'Preterm Babies', 'newborn.preterm'),
  supplementalIndicator(65, 'Newborn', 'under_2kg_babies', 'Babies Under 2 kg', 'newborn.under2Kg'),
  supplementalIndicator(66, 'Newborn', 'preterm_under_2kg_babies', 'Preterm and Under 2 kg', 'newborn.pretermAndUnder2Kg'),
  supplementalIndicator(67, 'Newborn', 'kmc_eligible_union', 'Preterm / Under 2 kg', 'newborn.kmcEligible'),
  supplementalIndicator(68, 'Joint Care', 'active_joint_care_patients', 'Active Joint Care', 'jointCare.clients')
])

module.exports = {
  ANALYTICS_V3_SCHEMA_VERSION,
  ANALYTICS_V31_SCHEMA_VERSION,
  ANALYTICS_V32_SCHEMA_VERSION,
  INDICATOR_REGISTRY_V3,
  SUPPLEMENTAL_INDICATORS_V31,
  indicatorRegistryV3: INDICATOR_REGISTRY_V3,
  indicatorByKey
}
