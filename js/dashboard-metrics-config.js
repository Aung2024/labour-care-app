(function (global) {
  'use strict'

  var SCHEMA_VERSION = 'analytics-v3.0.0'

  var CALCULATION_DETAILS = {
    registration_clients: {
      definition: 'Counts each registered client once when they have registration, ANC, delivery, PNC, newborn-care, or referral activity in the selected period, including clients registered earlier. This is an active-client headcount, not a count of services.',
      countedAs: 'Unique client records',
      numeratorLabel: 'Active registered clients'
    },
    overview_anc_clients: {
      definition: 'Counts each patient once when they received at least one ANC visit in the selected period. Multiple ANC visits for the same patient do not increase this headcount.',
      countedAs: 'Unique ANC patients',
      numeratorLabel: 'Patients with ≥1 ANC visit'
    },
    overview_high_risk: {
      definition: 'Counts each pregnancy once in the period when it was first identified as high risk. Later high-risk follow-up visits do not count the patient again.',
      countedAs: 'Unique high-risk pregnancies',
      numeratorLabel: 'Pregnancies first identified as high risk'
    },
    overview_institutional_delivery: {
      definition: 'Counts completed deliveries in a public or private health facility when the recorded birth provider is a skilled birth attendant or AMW.',
      countedAs: 'Completed delivery records',
      numeratorLabel: 'Skilled institutional deliveries',
      denominatorLabel: 'Completed delivery records'
    },
    overview_home_delivery: {
      definition: 'Counts completed home deliveries when the recorded birth provider is a skilled birth attendant or AMW.',
      countedAs: 'Completed delivery records',
      numeratorLabel: 'Skilled home deliveries',
      denominatorLabel: 'Completed delivery records'
    },
    overview_pnc_clients: {
      definition: 'Counts each patient once when they received at least one PNC visit in the selected period. Multiple PNC visits for the same patient do not increase this headcount.',
      countedAs: 'Unique PNC patients',
      numeratorLabel: 'Patients with ≥1 PNC visit'
    },
    overview_newborn_clients: {
      definition: 'Counts each client record once when at least one newborn-care visit occurred in the selected period. It is a newborn-care headcount, not the number of visits.',
      countedAs: 'Unique newborn-care clients',
      numeratorLabel: 'Clients with ≥1 newborn-care visit'
    },
    overview_maternal_referrals: {
      definition: 'Counts each patient once when their maternal referral record is dated in the selected period.',
      countedAs: 'Unique referred patients',
      numeratorLabel: 'Patients referred'
    },
    overview_joint_care: {
      definition: 'Counts each active patient once when more than one provider is recorded in the care team. ANC, delivery, PNC, newborn, and KMC status are shown separately.',
      countedAs: 'Unique joint-care patients',
      numeratorLabel: 'Patients with a joint-care team'
    },
    anc_clients: {
      definition: 'Counts each patient once when they received at least one ANC visit in the selected period. Use ANC Services to see the total number of visits delivered.',
      countedAs: 'Unique ANC patients',
      numeratorLabel: 'Patients with ≥1 ANC visit'
    },
    anc_services: {
      definition: 'Counts every ANC visit dated in the selected period. One patient can contribute several ANC services.',
      countedAs: 'ANC visit records',
      numeratorLabel: 'ANC visits delivered'
    },
    anc_at_least_4: {
      definition: 'Counts an ANC patient when the fourth-visit milestone is reached in the selected period. A new ANC patient also qualifies if an in-period visit is numbered 4 or higher.',
      countedAs: 'Unique ANC patients',
      numeratorLabel: 'Patients reaching ANC visit 4',
      denominatorLabel: 'Patients with ≥1 ANC visit'
    },
    anc_at_least_8: {
      definition: 'Counts an ANC patient when the eighth-visit milestone is reached in the selected period. A new ANC patient also qualifies if an in-period visit is numbered 8 or higher.',
      countedAs: 'Unique ANC patients',
      numeratorLabel: 'Patients reaching ANC visit 8',
      denominatorLabel: 'Patients with ≥1 ANC visit'
    },
    early_anc: {
      definition: 'Counts a patient when their first-ever ANC visit occurs in the selected period at 12 completed gestational weeks or earlier.',
      countedAs: 'Unique new ANC patients',
      numeratorLabel: 'Early first ANC patients',
      denominatorLabel: 'Patients with ≥1 ANC visit'
    },
    anc_iron_folate: {
      definition: 'Counts each ANC patient once when any ANC visit in the selected period records iron/folate or micronutrients as Given, Prescribed, or Already Prescribed. Quantity is not required.',
      countedAs: 'Unique ANC patients',
      numeratorLabel: 'ANC patients receiving iron/folate',
      denominatorLabel: 'Patients with ≥1 ANC visit'
    },
    pnc_iron_folate: {
      definition: 'Currently counts a delivered mother when an ANC record in the selected period shows iron/folate or micronutrients as Given, Prescribed, or Already Prescribed.',
      countedAs: 'Unique delivered mothers',
      numeratorLabel: 'Delivered mothers meeting the recorded medicine rule',
      denominatorLabel: 'Mothers with delivery in the period'
    },
    anc_b1: {
      definition: 'Counts each ANC patient once when vitamin B1 is Given, Prescribed, or Already Prescribed during an ANC visit after 36 completed gestational weeks.',
      countedAs: 'Unique ANC patients',
      numeratorLabel: 'Eligible ANC patients receiving B1',
      denominatorLabel: 'Patients with ≥1 ANC visit'
    },
    pnc_b1: {
      definition: 'Counts each PNC patient once when an in-period visit within 42 days after delivery records vitamin B complex or vitamin B1 as received. The numerator’s PNC visits and denominator’s deliveries are period totals and can represent different cohorts.',
      countedAs: 'Unique PNC patients',
      numeratorLabel: 'PNC patients receiving B1 within 42 days',
      denominatorLabel: 'Mothers with delivery in the period'
    },
    anc_deworming: {
      definition: 'Counts each ANC patient once when deworming medicine is Given, Prescribed, or Already Prescribed after 12 completed gestational weeks.',
      countedAs: 'Unique ANC patients',
      numeratorLabel: 'Eligible ANC patients receiving deworming',
      denominatorLabel: 'Patients with ≥1 ANC visit'
    },
    anc_gbv: {
      definition: 'Counts each ANC patient once when any ANC visit in the selected period records suspected gender-based violence.',
      countedAs: 'Unique ANC patients',
      numeratorLabel: 'ANC patients with GBV suspected',
      denominatorLabel: 'Patients with ≥1 ANC visit'
    },
    anc_pmtct: {
      definition: 'Counts each ANC patient once when both ANC activity and a recorded HIV test with a known result occur in the selected period. Reactive results are shown separately.',
      countedAs: 'Unique ANC patients',
      numeratorLabel: 'ANC patients tested for HIV',
      denominatorLabel: 'Patients with ≥1 ANC visit'
    },
    anc_tb: {
      definition: 'Counts each ANC patient once when an ANC visit in the selected period records TB symptoms, suspected TB, or tuberculosis.',
      countedAs: 'Unique ANC patients',
      numeratorLabel: 'ANC patients with TB indication',
      denominatorLabel: 'Patients with ≥1 ANC visit'
    },
    high_risk_clients: {
      definition: 'Counts each pregnancy once in the period when it was first identified as high risk. It is a patient headcount, not a count of high-risk visits.',
      countedAs: 'Unique high-risk pregnancies',
      numeratorLabel: 'Pregnancies first identified as high risk'
    },
    high_risk_factors: {
      definition: 'Groups high-risk pregnancies by documented risk factor. Each distinct factor is counted once per patient whose first high-risk identification falls in the selected period.',
      countedAs: 'Unique patients per risk factor',
      numeratorLabel: 'Risk-factor assignments'
    },
    high_risk_other_diseases: {
      definition: 'Groups documented other medical diseases from high-risk ANC records for patients first identified as high risk in the selected period. Repeated records can increase a disease count.',
      countedAs: 'High-risk ANC disease records',
      numeratorLabel: 'Other-disease records'
    },
    home_delivery_skilled: {
      definition: 'Counts completed home deliveries attended by a skilled birth attendant or AMW.',
      countedAs: 'Completed delivery records',
      numeratorLabel: 'Skilled home deliveries',
      denominatorLabel: 'Completed delivery records'
    },
    institutional_delivery_skilled: {
      definition: 'Counts completed deliveries in a public or private health facility attended by a skilled birth attendant or AMW.',
      countedAs: 'Completed delivery records',
      numeratorLabel: 'Skilled institutional deliveries',
      denominatorLabel: 'Completed delivery records'
    },
    uterotonic_use: {
      definition: 'Counts completed deliveries where uterotonic or oxytocin use is recorded. Delivery Notes are authoritative; legacy birth data are used only when Delivery Notes are absent.',
      countedAs: 'Completed delivery records',
      numeratorLabel: 'Deliveries with uterotonic recorded',
      denominatorLabel: 'Completed delivery records'
    },
    uterotonic_rate: {
      definition: 'Uterotonic use rate = completed deliveries with uterotonic or oxytocin recorded ÷ all completed Delivery Notes × 100.',
      countedAs: 'Percentage of completed deliveries',
      numeratorLabel: 'Deliveries with uterotonic recorded',
      denominatorLabel: 'Completed delivery records'
    },
    skilled_home_birth_rate: {
      definition: 'Skilled home birth rate = completed home deliveries attended by a skilled birth attendant or AMW ÷ all completed Delivery Notes × 100.',
      countedAs: 'Percentage of completed deliveries',
      numeratorLabel: 'Skilled home deliveries',
      denominatorLabel: 'Completed delivery records'
    },
    lcg_usage: {
      definition: 'Counts completed deliveries where both labour starting-time and second-stage time are documented, indicating Labour Care Guide use.',
      countedAs: 'Completed delivery records',
      numeratorLabel: 'Deliveries with LCG timing documented',
      denominatorLabel: 'Completed delivery records'
    },
    delivery_mode: {
      definition: 'Groups each completed delivery by its recorded mode: normal vaginal, assisted vaginal, elective C-section, emergency C-section, C-section, or Other/Unknown.',
      countedAs: 'Completed delivery records',
      numeratorLabel: 'Deliveries categorized by mode'
    },
    birthplace: {
      definition: 'Groups each completed delivery by recorded birthplace: home, public health facility, private facility, or Other/Unknown.',
      countedAs: 'Completed delivery records',
      numeratorLabel: 'Deliveries categorized by birthplace'
    },
    maternal_outcome: {
      definition: 'Groups each completed delivery by the mother’s recorded outcome or condition.',
      countedAs: 'Completed delivery records',
      numeratorLabel: 'Deliveries categorized by maternal outcome'
    },
    newborn_outcome: {
      definition: 'Groups every baby recorded in completed Delivery Notes by newborn outcome. A multiple birth contributes one count for each baby.',
      countedAs: 'Babies born',
      numeratorLabel: 'Babies categorized by outcome'
    },
    early_breastfeeding: {
      definition: 'Counts live-born babies with immediate newborn-care documentation supporting early exclusive breastfeeding. Live birth includes outcomes recorded as alive or born alive then died; stillbirth is excluded. The count cannot exceed recorded live births.',
      countedAs: 'Live-born babies',
      numeratorLabel: 'Live births with early breastfeeding support',
      denominatorLabel: 'Recorded live births'
    },
    pnc_coverage: {
      definition: 'PNC coverage = unique patients with at least one PNC visit in the selected period ÷ mothers with a completed delivery in the selected period × 100. These are period totals and may not represent the same delivery cohort.',
      countedAs: 'Percentage of delivered mothers',
      numeratorLabel: 'Patients with ≥1 PNC visit',
      denominatorLabel: 'Mothers with delivery in the period'
    },
    average_pnc_visits: {
      definition: 'Average PNC visits = all PNC visits delivered in the selected period ÷ unique patients who received PNC in that period.',
      countedAs: 'Average visits per PNC patient',
      numeratorLabel: 'PNC visits delivered',
      denominatorLabel: 'Patients with ≥1 PNC visit'
    },
    pnc_at_least_4: {
      definition: 'Counts each PNC patient once when their fourth PNC visit occurs in the selected period.',
      countedAs: 'Unique PNC patients',
      numeratorLabel: 'Patients reaching PNC visit 4',
      denominatorLabel: 'Patients with ≥1 PNC visit'
    },
    pnc_within_48h: {
      definition: 'Counts a patient when their first-ever PNC visit occurs in the selected period with a date difference of 0–2 calendar days after delivery. This is not an exact 48-hour elapsed-time calculation.',
      countedAs: 'Unique PNC patients',
      numeratorLabel: 'Patients starting PNC within 48 hours',
      denominatorLabel: 'Mothers with delivery in the period'
    },
    pnc_within_42d: {
      definition: 'Counts a patient when their first-ever PNC visit occurs in the selected period within 42 calendar days after delivery. The numerator’s PNC visits and denominator’s deliveries are period totals and can represent different cohorts.',
      countedAs: 'Unique PNC patients',
      numeratorLabel: 'Patients starting PNC within 42 days',
      denominatorLabel: 'Mothers with delivery in the period'
    },
    pnc_mother_anc_4: {
      definition: 'Counts mothers delivering in the selected period who have at least four lifetime ANC visits and at least one baby recorded alive.',
      countedAs: 'Unique delivered mothers',
      numeratorLabel: 'Delivered mothers with ≥4 ANC visits',
      denominatorLabel: 'Mothers with delivery in the period'
    },
    pnc_mother_anc_8: {
      definition: 'Counts mothers delivering in the selected period who have at least eight lifetime ANC visits and at least one baby recorded alive.',
      countedAs: 'Unique delivered mothers',
      numeratorLabel: 'Delivered mothers with ≥8 ANC visits',
      denominatorLabel: 'Mothers with delivery in the period'
    },
    pph_cases: {
      definition: 'Counts each PNC patient once when any PNC visit in the selected period records heavy vaginal bleeding. The numerator’s PNC visits and denominator’s deliveries are period totals and can represent different cohorts.',
      countedAs: 'Unique PNC patients',
      numeratorLabel: 'Patients with heavy postpartum bleeding',
      denominatorLabel: 'Mothers with delivery in the period'
    },
    birth_weight_measured: {
      definition: 'Counts recorded live-born babies with a birth weight greater than zero. Live birth includes outcomes recorded as alive or born alive then died; stillbirth is excluded.',
      countedAs: 'Live-born babies',
      numeratorLabel: 'Live births with weight recorded',
      denominatorLabel: 'Recorded live births'
    },
    low_birth_weight: {
      definition: 'Counts recorded live-born babies with birth weight below 2,500 grams. Live birth includes outcomes recorded as alive or born alive then died; stillbirth is excluded.',
      countedAs: 'Live-born babies',
      numeratorLabel: 'Live births below 2,500 g',
      denominatorLabel: 'Recorded live births'
    },
    newborn_care_2_days: {
      definition: 'Counts recorded live-born babies when newborn-care documentation exists from birth through day 2. Live birth includes outcomes recorded as alive or born alive then died; stillbirth is excluded.',
      countedAs: 'Live-born babies',
      numeratorLabel: 'Live births receiving care within 2 days',
      denominatorLabel: 'Recorded live births'
    },
    kmc_eligible: {
      definition: 'Counts recorded live-born babies with birth weight below 2,000 grams or gestational age below 37 weeks. Live birth includes outcomes recorded as alive or born alive then died; stillbirth is excluded.',
      countedAs: 'Live-born babies',
      numeratorLabel: 'Live births eligible for KMC',
      denominatorLabel: 'Recorded live births'
    },
    kmc_received: {
      definition: 'KMC coverage = KMC-eligible babies with KMC selected as received ÷ all KMC-eligible babies.',
      countedAs: 'KMC-eligible babies',
      numeratorLabel: 'Eligible babies receiving KMC',
      denominatorLabel: 'KMC-eligible babies'
    },
    maternal_referrals: {
      definition: 'Counts each patient once when their maternal referral record is dated in the selected period.',
      countedAs: 'Unique referred patients',
      numeratorLabel: 'Patients referred'
    },
    maternal_referral_rate: {
      definition: 'Maternal referral rate = patients with a referral record in the selected period ÷ active registered mothers in that period × 100.',
      countedAs: 'Percentage of active registered mothers',
      numeratorLabel: 'Patients referred',
      denominatorLabel: 'Active registered mothers'
    },
    referral_stage: {
      definition: 'Groups each maternal referral as ANC, Delivery, or PNC using the recorded care context or referral stage.',
      countedAs: 'Unique referral records',
      numeratorLabel: 'Referrals categorized by stage'
    },
    referral_destination: {
      definition: 'Groups each maternal referral as Station Hospital, Township Hospital, or Other/Unknown using the structured destination facility type, facility code, or legacy destination text.',
      countedAs: 'Unique referral records',
      numeratorLabel: 'Referrals categorized by destination'
    },
    joint_care_patients: {
      definition: 'Counts each active patient once when more than one provider is recorded in the care team. The chart can count that patient once in each applicable service status: ANC, Delivery, PNC, Newborn, and KMC.',
      countedAs: 'Unique joint-care patients',
      numeratorLabel: 'Patients with a joint-care team'
    }
  }

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
      definition: '',
      countedAs: 'Clinical records',
      numeratorLabel: 'Included records',
      denominatorLabel: 'Eligible records'
    }, options || {}, CALCULATION_DETAILS[key] || {}))
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
