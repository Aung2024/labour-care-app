(function (global) {
  'use strict'

  var SCHEMA_VERSION = 'analytics-v3.1.0'

  var CALCULATION_DETAILS = {
    registration_clients: {
      definition: 'All Time counts every registered patient document once, including records without a usable registration date. Month and year filters count each patient once when registration or clinical activity falls in the selected period. This is a client headcount, not a service count.',
      countedAs: 'Unique client records',
      numeratorLabel: 'Registered clients'
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
      definition: 'Counts each client record once when at least one canonical newborn-care visit occurred in the selected period. Repeated newborn-care visits for that client do not increase the headcount.',
      countedAs: 'Unique canonical newborn-care clients',
      numeratorLabel: 'Canonical clients with ≥1 newborn-care visit'
    },
    overview_maternal_referrals: {
      definition: 'Counts each patient once when their maternal referral record is dated in the selected period.',
      countedAs: 'Unique referred patients',
      numeratorLabel: 'Patients referred'
    },
    overview_joint_care: {
      definition: 'Counts each distinct patient once when the patient has at least one active Joint Care link in the selected reporting scope. Historical care-team arrays and inactive links are not counted.',
      countedAs: 'Unique joint-care patients',
      numeratorLabel: 'Patients with ≥1 active Joint Care link'
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
      definition: 'Counts canonical newborns who are preterm, under 2,000 grams, or both. The union counts each newborn once.',
      countedAs: 'Live-born babies',
      numeratorLabel: 'Newborns eligible for KMC',
      denominatorLabel: 'Recorded live births',
      formula: 'KMC eligible union = preterm + under 2 kg − both preterm and under 2 kg'
    },
    kmc_received: {
      definition: 'The main count includes eligible canonical newborns with KMC recorded as Yes. Coverage = eligible KMC Yes ÷ the preterm-or-under-2-kg eligibility union × 100. The detail shows all canonical newborns with KMC Yes, including babies outside that eligibility union.',
      countedAs: 'KMC-eligible babies',
      numeratorLabel: 'Eligible newborns with KMC Yes',
      denominatorLabel: 'KMC-eligible newborns',
      formula: 'KMC coverage = eligible KMC Yes ÷ KMC eligible union × 100; Total KMC Yes is shown separately'
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
      definition: 'Counts each distinct patient once when at least one active Joint Care link exists. The chart can show that patient once in each applicable service status: ANC, Delivery, PNC, Newborn, and KMC.',
      countedAs: 'Unique joint-care patients',
      numeratorLabel: 'Patients with ≥1 active Joint Care link'
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
      denominatorLabel: 'Eligible records',
      formula: ''
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
    metric(25, 'High-Risk', 'high_risk_other_diseases', 'Other Medical Diseases', 'highRisk.otherMedicalDiseases', '', {
      format: 'map',
      chart: 'bar',
      emptyText: 'No recorded historical names'
    }),
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
    metric(49, 'Newborn', 'kmc_received', 'KMC Cases and Coverage', 'newborn.kmcReceived', 'newborn.kmcEligible', { detailPaths: ['newborn.kmcYes'], detailLabels: ['All KMC Yes'] }),
    metric(50, 'Referral', 'maternal_referrals', 'Total Maternal Referral', 'referral.total'),
    metric(51, 'Referral', 'maternal_referral_rate', 'Maternal Referral Rate', 'referral.total', 'registration.mothers', { format: 'percent' }),
    metric(52, 'Referral', 'referral_stage', 'Referral by Stage', 'referral.byStage', '', { format: 'map', chart: 'bar' }),
    metric(53, 'Referral', 'referral_destination', 'Referral Destination', 'referral.byDestination', '', { format: 'map', chart: 'donut' }),
    metric(54, 'Joint Care', 'joint_care_patients', 'Joint Care Patients', 'jointCare.clients', '', { detailMap: 'jointCare.byStatus', chart: 'bar' })
  ]

  function supplemental(section, key, label, numerator, options) {
    return metric(null, section, key, label, numerator, '', Object.assign({
      supplemental: true,
      sourceLabel: 'Supplemental',
      format: 'count',
      chart: 'kpi'
    }, options || {}))
  }

  var supplementalDefinitions = [
    supplemental('Overview', 'supplemental_registered_mothers', 'Registered Mothers', 'registration.mothers', {
      definition: 'All Time counts every registered mother document once. Month and year filters count each mother once when registration or clinical activity falls in the selected reporting period and scope.',
      countedAs: 'Unique registered mothers',
      numeratorLabel: 'Registered mothers',
      formula: 'Registered mothers = registration.mothers'
    }),
    supplemental('Overview', 'supplemental_registered_babies', 'Registered Babies', 'registration.babies', {
      definition: 'All Time counts every registered baby or child patient document once. Month and year filters count each baby or child once when registration or clinical activity falls in the selected reporting period and scope.',
      countedAs: 'Unique registered babies',
      numeratorLabel: 'Registered babies',
      formula: 'Registered babies = registration.babies'
    }),
    supplemental('Overview', 'supplemental_maternal_age_groups', 'Registered Mothers by Age Band', 'registration.ageGroups', {
      definition: 'Assigns each registered mother included by the selected period to one profile-age band: Under 18; 18–35 inclusive; Over 35; or Unknown when age is missing, non-numeric, not positive, or 120 or above.',
      countedAs: 'Unique registered mothers per age band',
      numeratorLabel: 'Mothers assigned to age bands',
      formula: 'Registered mothers by age = Under 18 + 18–35 + Over 35 + Unknown',
      format: 'map',
      chart: 'bar',
      chartOnly: true,
      mapCategories: [
        { label: 'Under 18', paths: ['registration.ageGroups.Under 18'] },
        { label: '18–35', paths: ['registration.ageGroups.18–35', 'registration.ageGroups.18-35', 'registration.ageGroups.18 to 35'] },
        { label: 'Over 35', paths: ['registration.ageGroups.Over 35'] },
        { label: 'Unknown', paths: ['registration.ageGroups.Unknown'] }
      ]
    }),
    supplemental('Delivery', 'supplemental_actual_delivery_notes', 'Actual Delivery Notes', 'delivery.actualNotes', {
      definition: 'Counts actual Delivery Notes in the selected reporting period and scope. Legacy-derived delivery cases are excluded.',
      countedAs: 'Actual Delivery Note records',
      numeratorLabel: 'Actual Delivery Notes',
      formula: 'Actual Delivery Notes = delivery.actualNotes'
    }),
    supplemental('Delivery', 'supplemental_babies_in_delivery_notes', 'Babies Recorded in Delivery Notes', 'delivery.babiesInNotes', {
      definition: 'Counts every baby entry recorded inside actual Delivery Notes. Each baby in a multiple birth contributes one.',
      countedAs: 'Baby entries in actual Delivery Notes',
      numeratorLabel: 'Babies recorded in notes',
      formula: 'Babies recorded in notes = delivery.babiesInNotes'
    }),
    supplemental('Delivery', 'supplemental_legacy_delivery_cases', 'Legacy Delivery Cases (Derived)', 'delivery.legacyDerived', {
      definition: 'Counts delivery cases derived from legacy birth or newborn data only when an actual Delivery Note is absent. These are labelled separately from actual Delivery Notes.',
      countedAs: 'Legacy-derived delivery cases',
      numeratorLabel: 'Legacy delivery cases',
      formula: 'Legacy delivery cases = delivery.legacyDerived'
    }),
    supplemental('Delivery', 'supplemental_delivery_recording', 'Delivery Notes, Babies, and Legacy Cases', 'delivery.actualNotes', {
      definition: 'Shows actual Delivery Notes, baby entries recorded in those notes, and separately labelled legacy-derived delivery cases without combining them into one total.',
      countedAs: 'Separately labelled delivery record counts',
      numeratorLabel: 'Actual Delivery Notes',
      formula: 'Series = delivery.actualNotes; delivery.babiesInNotes; delivery.legacyDerived',
      format: 'series',
      chart: 'bar',
      chartOnly: true,
      chartValues: [
        { label: 'Actual Delivery Notes', path: 'delivery.actualNotes' },
        { label: 'Babies in Notes', path: 'delivery.babiesInNotes' },
        { label: 'Legacy Cases (Derived)', path: 'delivery.legacyDerived' }
      ]
    }),
    supplemental('Newborn', 'supplemental_canonical_nbc_clients', 'Canonical NBC Clients', 'newborn.canonicalClients', {
      definition: 'Counts unique client records represented in the canonical newborn-care dataset for the selected reporting period and scope.',
      countedAs: 'Unique canonical newborn-care clients',
      numeratorLabel: 'Canonical NBC clients',
      formula: 'Canonical NBC clients = newborn.canonicalClients'
    }),
    supplemental('Newborn', 'supplemental_canonical_newborns', 'Canonical Newborns', 'newborn.canonicalBabies', {
      definition: 'Counts deduplicated newborn identities represented in canonical newborn-care data. Multiple visits for one newborn count once.',
      countedAs: 'Unique canonical newborns',
      numeratorLabel: 'Canonical newborns',
      formula: 'Canonical newborns = newborn.canonicalBabies'
    }),
    supplemental('Newborn', 'supplemental_kmc_yes', 'KMC Yes', 'newborn.kmcYes', {
      definition: 'Counts canonical newborns when any linked newborn-care visit records KMC as Yes. A newborn contributes at most once.',
      countedAs: 'Unique canonical newborns',
      numeratorLabel: 'Newborns with KMC Yes',
      formula: 'KMC Yes = newborn.kmcYes'
    }),
    supplemental('Newborn', 'supplemental_preterm', 'Preterm Newborns', 'newborn.preterm', {
      definition: 'Counts canonical newborns classified as preterm by gestational age below 37 completed weeks or birth at least 21 calendar days before the effective EDD.',
      countedAs: 'Unique canonical newborns',
      numeratorLabel: 'Preterm newborns',
      formula: 'Preterm = gestational age <37 weeks OR birth ≥21 days before effective EDD'
    }),
    supplemental('Newborn', 'supplemental_under_2kg', 'Newborns Under 2 kg', 'newborn.under2Kg', {
      definition: 'Counts canonical newborns with a recorded birth weight below 2,000 grams.',
      countedAs: 'Unique canonical newborns',
      numeratorLabel: 'Newborns under 2 kg',
      formula: 'Under 2 kg = newborn.under2Kg'
    }),
    supplemental('Newborn', 'supplemental_preterm_and_under_2kg', 'Preterm and Under 2 kg', 'newborn.pretermAndUnder2Kg', {
      definition: 'Counts canonical newborns who meet the preterm rule and have birth weight below 2,000 grams. This is the intersection, not an additional eligibility group.',
      countedAs: 'Unique canonical newborns',
      numeratorLabel: 'Preterm newborns under 2 kg',
      formula: 'Both = newborn.pretermAndUnder2Kg'
    }),
    supplemental('Newborn', 'supplemental_kmc_eligible_union', 'KMC Eligible (Preterm or Under 2 kg)', 'newborn.kmcEligible', {
      definition: 'Counts the union of canonical newborns who are preterm or below 2,000 grams. Newborns meeting both conditions count once.',
      countedAs: 'Unique canonical newborns',
      numeratorLabel: 'KMC-eligible newborns',
      formula: 'KMC eligible union = preterm + under 2 kg − both'
    }),
    supplemental('Newborn', 'supplemental_kmc_breakdown', 'KMC and Eligibility Breakdown', 'newborn.kmcEligible', {
      definition: 'Shows KMC Yes and the preterm, under-2-kg, intersection, and eligibility-union counts as separately labelled series.',
      countedAs: 'Unique canonical newborns per labelled group',
      numeratorLabel: 'KMC-eligible newborns',
      formula: 'KMC eligible union = preterm + under 2 kg − both; KMC Yes is reported separately',
      format: 'series',
      chart: 'bar',
      chartOnly: true,
      chartValues: [
        { label: 'KMC Yes', path: 'newborn.kmcYes' },
        { label: 'Preterm', path: 'newborn.preterm' },
        { label: 'Under 2 kg', path: 'newborn.under2Kg' },
        { label: 'Both', path: 'newborn.pretermAndUnder2Kg' },
        { label: 'Eligible Union', path: 'newborn.kmcEligible' }
      ]
    })
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
    if (!definition.denominator || definition.format === 'count' || definition.format === 'ratio') {
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

  function supplementalForSection(section) {
    return supplementalDefinitions.filter(function (item) {
      return item.section === section
    })
  }

  function definitionsForSection(section) {
    return indicatorsForSection(section).concat(supplementalForSection(section))
  }

  function formulaForDefinition(definition) {
    if (definition.formula) return definition.formula
    if (definition.format === 'percent') {
      return definition.numeratorLabel + ' ÷ ' + definition.denominatorLabel + ' × 100'
    }
    if (definition.format === 'average') {
      return definition.numeratorLabel + ' ÷ ' + definition.denominatorLabel
    }
    if (definition.format === 'map') {
      return 'Sum each named category in ' + definition.numerator
    }
    return definition.numeratorLabel + ' = ' + definition.numerator
  }

  var allDefinitions = indicators.concat(supplementalDefinitions)

  global.DashboardMetricsConfig = Object.freeze({
    schemaVersion: SCHEMA_VERSION,
    indicators: Object.freeze(indicators.slice()),
    supplementalDefinitions: Object.freeze(supplementalDefinitions.slice()),
    allDefinitions: Object.freeze(allDefinitions.slice()),
    sections: Object.freeze(['Overview', 'ANC', 'High-Risk', 'Delivery', 'Newborn', 'PNC', 'Referral', 'Joint Care']),
    valueAtPath: valueAtPath,
    numberAtPath: numberAtPath,
    ratio: ratio,
    displayValue: displayValue,
    indicatorsForSection: indicatorsForSection,
    supplementalForSection: supplementalForSection,
    definitionsForSection: definitionsForSection,
    formulaForDefinition: formulaForDefinition
  })
})(typeof window !== 'undefined' ? window : globalThis)
