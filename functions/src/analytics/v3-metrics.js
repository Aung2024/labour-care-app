'use strict'

const { facilityTaxonomy } = require('../shared/facility-taxonomy')
const {
  unwrap,
  firstDate,
  normalizeOutcome,
  normalizeInfectionResult
} = require('../shared/clinical-normalizers')
const {
  parseDateValue,
  isDateInPeriod,
  normalizePeriod,
  monthKeyForDate,
  yearKeyForDate
} = require('./metrics')

const DAY_MS = 86400000
const KMC_WEIGHT_GRAM = 2000
const PRETERM_DAYS_BEFORE_EDD = 21

const emptyV3Metrics = () => ({
  registration: {
    total: 0,
    new: 0,
    old: 0,
    mothers: 0,
    babies: 0,
    ageGroups: {
      'Under 18': 0,
      '18 to 35': 0,
      'Over 35': 0,
      Unknown: 0
    }
  },
  anc: {
    clients: 0, new: 0, old: 0, services: 0, atLeast4: 0, atLeast8: 0,
    early: 0, ironFolate: 0, vitaminB1: 0, deworming: 0, gbv: 0,
    pmtctTested: 0, pmtctReactive: 0, tb: 0
  },
  highRisk: { clients: 0, factors: {}, otherMedicalDiseases: {} },
  delivery: {
    completedNotes: 0, homeSkilled: 0, institutionalSkilled: 0,
    uterotonic: 0, lcgUsed: 0, modes: {}, places: {},
    maternalOutcomes: {}, newbornOutcomes: {},
    actualNotes: 0, legacyDerived: 0, babiesInNotes: 0
  },
  newborn: {
    clients: 0, new: 0, old: 0, births: 0, liveBirths: 0,
    earlyBreastfeeding: 0, birthWeightMeasured: 0, lowBirthWeight: 0,
    careWithin2Days: 0, kmcEligible: 0, kmcReceived: 0,
    canonicalClients: 0, canonicalBabies: 0, kmcYes: 0,
    preterm: 0, under2Kg: 0, pretermAndUnder2Kg: 0,
    immediateClients: 0
  },
  pnc: {
    clients: 0, new: 0, old: 0, visits: 0, atLeast4: 0,
    within48Hours: 0, within42Days: 0, deliveredMothers: 0,
    mothersWithAnc4: 0, mothersWithAnc8: 0, pph: 0,
    ironFolate: 0, vitaminB1: 0
  },
  referral: { total: 0, byStage: {}, byDestination: {} },
  jointCare: { clients: 0, byStatus: {} }
})

const numeric = (value) => {
  const result = Number(value || 0)
  return Number.isFinite(result) ? result : 0
}

const bump = (map, key, amount = 1) => {
  const normalized = String(key || 'Other/Unknown')
  map[normalized] = numeric(map[normalized]) + amount
}

const sortedRecords = (records, fields) => (records || [])
  .map(unwrap)
  .filter(Boolean)
  .sort((left, right) => {
    const a = firstDate(left, fields)
    const b = firstDate(right, fields)
    return (a ? a.getTime() : 0) - (b ? b.getTime() : 0)
  })

const recordDate = (record, fields) => firstDate(unwrap(record), fields)

const recordsInPeriod = (records, period, fields) => sortedRecords(records, fields)
  .filter((record) => {
    const date = recordDate(record, fields)
    return date && isDateInPeriod(date, period)
  })

const medicineReceived = (value) => {
  const normalized = String(value == null ? '' : value).trim().toLowerCase()
  if (!normalized || /not\s+(given|prescribed)/.test(normalized)) return false
  return normalized === 'given' || normalized === 'prescribed' ||
    normalized === 'already prescribed'
}

const affirmative = (value) => value === true ||
  ['yes', 'true', 'y', '1'].includes(String(value || '').trim().toLowerCase())

const firstServiceClassification = (allRecords, inPeriodRecords, fields, period) => {
  if (!inPeriodRecords.length) return null
  const first = sortedRecords(allRecords, fields)
    .map((record) => recordDate(record, fields))
    .find(Boolean)
  return first && isDateInPeriod(first, period) ? 'new' : 'old'
}

const recordOrdinal = (record, allRecords) => {
  const explicit = numeric(record.visitNumber || record.visit_number)
  if (explicit) return explicit
  const index = allRecords.indexOf(record)
  return index >= 0 ? index + 1 : 0
}

const completedWeeksAtVisit = (visit, profile) => {
  const visitDate = recordDate(visit, ['visitDate', 'visit_date', 'recordedAt', 'timestamp', 'createdAt'])
  const lmp = parseDateValue(visit.lmp || (profile && profile.lmp))
  if (visitDate && lmp && visitDate >= lmp) {
    return Math.floor((visitDate - lmp) / (7 * DAY_MS))
  }
  const value = Number(
    visit.gestationalAge ?? visit.gestational_age ?? visit.ga_weeks ??
    visit.manualGestationalAge
  )
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : null
}

const isEarlyAncV3 = (allVisits, profile) => {
  const first = sortedRecords(allVisits, [
    'visitDate', 'visit_date', 'recordedAt', 'timestamp', 'createdAt'
  ])[0]
  if (!first) return false
  const weeks = completedWeeksAtVisit(first, profile)
  return weeks != null && weeks <= 12
}

const normalizeBirthPlace = (value) => {
  const key = String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_')
  if (!key) return 'Other/Unknown'
  if (key.includes('home') || key.includes('အိမ်')) return 'Home'
  if (key.includes('private') || key.includes('ပုဂ္ဂလိက')) return 'Private Facility'
  if ([
    'facility', 'public_facility', 'government_hospital',
    'health_facility_subfacility', 'rhc', 'srhc'
  ].includes(key) || key.includes('hospital') || key.includes('ကျန်းမာရေး')) {
    return 'Public Health Facility'
  }
  return 'Other/Unknown'
}

const normalizeBirthProvider = (value) => {
  const key = String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_')
  if (['skilled_birth_attendant', 'skilled_birth_attendance', 'sba'].includes(key)) {
    return 'skilled_birth_attendant'
  }
  return key === 'amw' ? 'amw' : key
}

const normalizeDeliveryMode = (value) => {
  const key = String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_')
  if (!key) return 'Other/Unknown'
  if (key.includes('emergency') && key.includes('section')) return 'Emergency C-section'
  if (key.includes('elective') && key.includes('section')) return 'Elective C-section'
  if (key.includes('section') || key.includes('caesarean') || key.includes('cesarean')) {
    return 'C-section'
  }
  if (key.includes('assist') || key.includes('forceps') || key.includes('vacuum')) {
    return 'Assisted vaginal'
  }
  if (key.includes('normal') || key.includes('vaginal')) return 'Normal vaginal'
  return 'Other/Unknown'
}

const deliveryFacts = (facts) => {
  const notes = unwrap(facts.deliveryNotes) || {}
  const details = notes.deliveryDetails || notes.labourDetails || {}
  const hasNotes = Object.keys(notes).length > 0 &&
    (Object.keys(details).length > 0 || Object.keys(notes.thirdStage || {}).length > 0)
  if (hasNotes) {
    const babies = Array.isArray(details.babies) ? details.babies : []
    return {
      completed: true,
      source: 'delivery_notes',
      date: babies.map((baby) => firstDate(baby, ['birthTime', 'birth_time']))
        .find(Boolean) || firstDate(notes, ['deliveryDate', 'birthTime', 'createdAt', 'updatedAt']),
      provider: normalizeBirthProvider(details.birthProvider || details.birth_provider),
      place: normalizeBirthPlace(details.birthPlace || details.birthplace),
      mode: normalizeDeliveryMode(details.modeOfDelivery || details.mode_of_delivery),
      maternalOutcome: normalizeOutcome(
        details.maternalCondition || details.maternal_condition
      ) || 'unknown',
      babies: babies.map((baby, index) => ({
        babyIndex: numeric(baby.babyIndex || baby.baby_index) || index + 1,
        outcome: normalizeOutcome(baby.outcome) || 'unknown',
        weightGram: numeric(
          baby.birthWeightGram || baby.birth_weight_gram || baby.body_weight_gram
        ) || null,
        birthDate: firstDate(baby, ['birthTime', 'birth_time']),
        gestationalWeek: numeric(
          baby.gestationalWeek || baby.gestational_week || details.gestationalWeek
        ) || null
      })),
      uterotonic: affirmative(
        (notes.thirdStage || {}).oxytocinGiven ?? notes.oxytocinGiven
      )
    }
  }

  const newborn = sortedRecords(
    facts.newbornVisits || (facts.newbornCare ? [facts.newbornCare] : []),
    ['visitDate', 'visit_date', 'birth_time', 'timestamp', 'createdAt']
  )[0] || {}
  const birth = unwrap(facts.birthRecord) || {}
  if (!Object.keys(newborn).length && !Object.keys(birth).length) {
    return { completed: false, source: null, babies: [] }
  }
  const babies = Array.isArray(newborn.babies) && newborn.babies.length
    ? newborn.babies
    : [newborn]
  return {
    completed: true,
    source: 'legacy_fallback',
    date: firstDate(newborn, ['birth_time', 'birthTime', 'visitDate']) ||
      firstDate(birth, ['deliveryDate', 'birthDate', 'birthTime']),
    provider: normalizeBirthProvider(newborn.birth_provider || birth.birth_provider),
    place: normalizeBirthPlace(newborn.birthplace || birth.birthplace),
    mode: normalizeDeliveryMode(newborn.mode_of_delivery || birth.mode_of_delivery),
    maternalOutcome: normalizeOutcome(
      newborn.maternal_condition || birth.maternalOutcome
    ) || 'unknown',
    babies: babies.map((baby, index) => ({
      babyIndex: numeric(baby.babyIndex || baby.baby_index) || index + 1,
      outcome: normalizeOutcome(baby.outcome || baby.baby_outcome ||
        birth.newbornOutcome) || 'unknown',
      weightGram: numeric(
        baby.birthWeightGram || baby.birth_weight_gram || baby.body_weight_gram
      ) || null,
      birthDate: firstDate(baby, ['birthTime', 'birth_time']) ||
        firstDate(birth, ['deliveryDate', 'birthDate', 'birthTime']),
      gestationalWeek: numeric(
        baby.gestationalWeek || baby.gestational_week || newborn.gestational_week
      ) || null
    })),
    uterotonic: affirmative(
      newborn.oxytocinGiven || birth.uterotonicGivenThirdStage || birth.uterotonic
    )
  }
}

const lcgUsed = (facts) => {
  const summary = unwrap(facts.summary) || {}
  const starting = unwrap(facts.startingTimeDoc) || {}
  const second = unwrap(facts.secondStageDoc) || {}
  const firstValue = summary.startingTime || summary.activeFirstStage_Time ||
    starting.startingTime
  const secondValue = summary.secondStageTime || summary.secondStage_Time ||
    second.secondStageStartTime || second.secondStageTime
  return Boolean(firstValue && secondValue)
}

const birthWeightForBaby = (baby) => {
  const value = numeric(baby && baby.weightGram)
  if (!value) return null
  return value < 30 ? Math.round(value * 1000) : Math.round(value)
}

const referralDestination = (record) => {
  const data = unwrap(record) || {}
  const structuredType = String(
    data.referralFacilityType || data.destinationFacilityType || ''
  ).trim().toLowerCase()
  if (structuredType === 'station_hospital') return 'Station Hospital'
  if (structuredType === 'township_hospital') return 'Township Hospital'
  if (data.transferDestination === 'external') return 'Other/Unknown'
  const code = data.facilityCode || data.referralFacilityCode ||
    data.destinationFacilityCode
  if (code) {
    const type = facilityTaxonomy(code).facilityType
    if (type === 'station_hospital') return 'Station Hospital'
    if (type === 'township_hospital') return 'Township Hospital'
  }
  const text = String(
    data.referralFacility || data.destinationFacility || data.externalFacility || ''
  ).toLowerCase()
  if (/station\s*hospital/.test(text)) return 'Station Hospital'
  if (/township\s*hospital/.test(text)) return 'Township Hospital'
  return 'Other/Unknown'
}

const referralStage = (record, profile) => {
  const value = String(
    (record && (record.careContext || record.stage || record.referralStage)) ||
    (profile && profile.status) || ''
  ).toLowerCase()
  if (value.includes('labour') || value.includes('labor') || value.includes('delivery')) {
    return 'Delivery'
  }
  if (value.includes('pnc') || value.includes('post')) return 'PNC'
  return 'ANC'
}

const isMother = (profile) => {
  const type = String(profile.patient_type || profile.patientType || '').toLowerCase()
  if (['baby', 'newborn', 'child'].includes(type)) return false
  const age = numeric(profile.age)
  return !age || age >= 12
}

const isRegisteredBaby = (profile) => !isMother(profile || {})

const maternalAgeGroup = (profile) => {
  const age = Number.parseInt(profile && profile.age, 10)
  if (!Number.isFinite(age) || age <= 0 || age >= 120) return 'Unknown'
  if (age < 18) return 'Under 18'
  if (age <= 35) return '18 to 35'
  return 'Over 35'
}

const canonicalNewbornOwner = (facts) => {
  const newbornFacts = facts && facts.newbornFacts || {}
  return String(
    newbornFacts.canonicalOwnerId ||
    newbornFacts.motherPatientId ||
    facts && facts.id ||
    ''
  )
}

const isCanonicalNewbornOwner = (facts) =>
  Boolean(facts && facts.id && canonicalNewbornOwner(facts) === String(facts.id))

const babyIndexOf = (baby, fallback) =>
  numeric(baby && (baby.babyIndex || baby.baby_index)) || fallback || 1

const canonicalNewbornBabies = (facts, delivery) => {
  const byIndex = new Map()
  const merge = (baby, fallbackIndex, base) => {
    const index = babyIndexOf(baby, fallbackIndex)
    const previous = byIndex.get(index) || {}
    byIndex.set(index, {
      ...previous,
      ...(base || {}),
      ...(baby || {}),
      babyIndex: index
    })
  }
  sortedRecords(facts && facts.newbornVisits || [], [
    'visitDate', 'visit_date', 'timestamp', 'createdAt'
  ]).forEach((visit) => {
    if (Array.isArray(visit.babies) && visit.babies.length) {
      visit.babies.forEach((baby, index) => merge(baby, index + 1, visit))
    } else {
      merge(visit, babyIndexOf(visit, 1))
    }
    if (Array.isArray(visit.kmc_babies)) {
      visit.kmc_babies.forEach((baby, index) => merge(baby, index + 1))
    }
  })
  return Array.from(byIndex.values()).sort((left, right) =>
    left.babyIndex - right.babyIndex
  )
}

const effectiveEdd = (facts) => {
  const profile = facts && facts.profile || {}
  const visits = sortedRecords(facts && facts.antenatalVisits || [], [
    'visitDate', 'visit_date', 'recordedAt', 'timestamp', 'createdAt'
  ])
  const latest = visits[visits.length - 1] || {}
  return firstDate(profile, [
    'edd', 'EDD', 'maternal_edd', 'manualEdd', 'manual_edd'
  ]) || firstDate(latest, ['edd', 'EDD', 'manualEdd', 'manual_edd'])
}

const babyBirthDate = (baby, delivery) =>
  firstDate(baby || {}, [
    'birthTime', 'birth_time', 'birthDate', 'birth_date', 'date_of_birth'
  ]) || delivery && delivery.date || null

const babyGestationalWeek = (baby) => {
  const week = numeric(baby && (
    baby.gestationalWeek || baby.gestational_week ||
    baby.gestationalAge || baby.gestational_age
  ))
  return week > 0 ? week : null
}

const kmcEligibility = (facts, baby, delivery) => {
  const weight = birthWeightForBaby({
    weightGram: baby && (
      baby.weightGram || baby.birthWeightGram ||
      baby.birth_weight_gram || baby.body_weight_gram
    )
  })
  const birth = babyBirthDate(baby, delivery)
  const edd = effectiveEdd(facts)
  const gestationalWeek = babyGestationalWeek(baby)
  const under2Kg = Boolean(weight && weight < KMC_WEIGHT_GRAM)
  const pretermByWeek = Boolean(gestationalWeek && gestationalWeek < 37)
  const pretermByEdd = Boolean(
    birth && edd &&
    Math.floor((edd.getTime() - birth.getTime()) / DAY_MS) >=
      PRETERM_DAYS_BEFORE_EDD
  )
  return {
    under2Kg,
    preterm: pretermByWeek || pretermByEdd
  }
}

const kmcYesForBaby = (facts, babyIndex, period) => sortedRecords(
  facts.newbornVisits || [],
  ['visitDate', 'visit_date', 'timestamp', 'createdAt']
).some((visit) => {
  const visitDate = recordDate(visit, [
    'visitDate', 'visit_date', 'timestamp', 'createdAt'
  ])
  if (period.key !== 'all' && (!visitDate || !isDateInPeriod(visitDate, period))) {
    return false
  }
  if (Array.isArray(visit.kmc_babies)) {
    const baby = visit.kmc_babies.find((item, index) =>
      babyIndexOf(item, index + 1) === babyIndex)
    return baby && affirmative(baby.kmc_selected ?? baby.kmcSelected)
  }
  return babyIndex === 1 && affirmative(visit.kmc_selected ?? visit.kmcSelected)
})

const newbornCareWithinDays = (facts, birthDate, days) => {
  if (!birthDate) return false
  return sortedRecords(facts.newbornVisits || [], [
    'visitDate', 'visit_date', 'timestamp', 'createdAt'
  ]).some((visit) => {
    const date = recordDate(visit, ['visitDate', 'visit_date', 'timestamp', 'createdAt'])
    const difference = date ? (date - birthDate) / DAY_MS : Infinity
    return difference >= 0 && difference <= days
  })
}

const pncDays = (visit, birthDate) => {
  const explicit = visit.postpartumDays ?? visit.postpartum_days ??
    visit.daysPostpartum ?? visit.days_since_delivery
  if (explicit !== '' && explicit != null && numeric(explicit) >= 0) {
    return numeric(explicit)
  }
  const date = recordDate(visit, ['visitDate', 'visit_date', 'timestamp', 'createdAt'])
  return date && birthDate ? Math.floor((date - birthDate) / DAY_MS) : null
}

const kmcReceivedForBaby = (facts, babyIndex) => sortedRecords(
  facts.newbornVisits || [],
  ['visitDate', 'visit_date', 'timestamp', 'createdAt']
).some((visit) => {
  if (Array.isArray(visit.kmc_babies)) {
    const baby = visit.kmc_babies.find((item, index) =>
      Number(item.babyIndex || item.baby_index || index + 1) === babyIndex
    )
    return baby && String(baby.kmc_selected || '').toLowerCase() === 'yes'
  }
  return babyIndex === 1 && String(visit.kmc_selected || '').toLowerCase() === 'yes'
})

const registeredBabyIndex = (facts) => numeric(
  facts && facts.newbornFacts && facts.newbornFacts.birthOrder
) || numeric(
  String(facts && facts.id || '')
    .match(/_baby_(?:(?:\d{8}|unknown)_)?(\d+)$/)?.[1]
) || 1

const indexedBabyFromRecord = (record, babyIndex) => {
  const data = unwrap(record) || {}
  const collections = [data.babies, data.kmc_babies]
  for (const babies of collections) {
    if (!Array.isArray(babies)) continue
    const match = babies.find((baby, index) =>
      babyIndexOf(baby, index + 1) === babyIndex
    )
    if (match) return match
  }
  return null
}

const recordAppliesToRegisteredBaby = (facts, record) => {
  const data = unwrap(record) || {}
  const babyIndex = registeredBabyIndex(facts)
  if (data._newbornSourcePatientId === facts.id) return true
  if (numeric(data._kmcSourceBabyIndex)) {
    return numeric(data._kmcSourceBabyIndex) === babyIndex
  }
  const indexedBaby = indexedBabyFromRecord(data, babyIndex)
  if (indexedBaby) return true
  const hasIndexedBabies = [data.babies, data.kmc_babies].some((babies) =>
    Array.isArray(babies) && babies.length
  )
  if (hasIndexedBabies) return false
  if (data._newbornSourcePatientId) return babyIndex === 1
  return true
}

const babyWeightGram = (facts, relevantVisits) => {
  const profile = facts && facts.profile || {}
  const newbornFacts = facts && facts.newbornFacts || {}
  const babyIndex = registeredBabyIndex(facts)
  const candidates = [
    profile.birth_weight_gram,
    profile.birthWeightGram,
    newbornFacts.birthWeightGram
  ]
  ;(relevantVisits || []).forEach((visit) => {
    const data = unwrap(visit) || {}
    const baby = indexedBabyFromRecord(data, babyIndex) || {}
    candidates.push(
      baby.birthWeightGram,
      baby.birth_weight_gram,
      baby.body_weight_gram,
      data.birthWeightGram,
      data.birth_weight_gram,
      data.body_weight_gram
    )
  })
  const value = candidates.map(numeric).find((weight) => weight > 0)
  if (!value) return null
  return value < 30 ? Math.round(value * 1000) : Math.round(value)
}

const registeredBabyBirthDate = (facts, relevantVisits) => {
  const profile = facts && facts.profile || {}
  const newbornFacts = facts && facts.newbornFacts || {}
  const babyIndex = registeredBabyIndex(facts)
  const profileDate = firstDate(profile, [
    'date_of_birth', 'dateOfBirth', 'birth_time', 'birthTime', 'birthDate'
  ]) || firstDate(newbornFacts, ['birthDate'])
  if (profileDate) return profileDate
  for (const visit of relevantVisits || []) {
    const data = unwrap(visit) || {}
    const baby = indexedBabyFromRecord(data, babyIndex)
    const date = firstDate(baby || data, [
      'birthTime', 'birth_time', 'birthDate', 'birth_date', 'date_of_birth'
    ])
    if (date) return date
  }
  return null
}

const registeredBabyIsPreterm = (facts, birthDate, relevantVisits) => {
  const profile = facts && facts.profile || {}
  const newbornFacts = facts && facts.newbornFacts || {}
  const babyIndex = registeredBabyIndex(facts)
  const weeks = [
    profile.gestational_age_at_birth,
    profile.gestationalAgeAtBirth,
    newbornFacts.gestationalAgeAtBirth,
    ...(relevantVisits || []).map((visit) => {
      const data = unwrap(visit) || {}
      const baby = indexedBabyFromRecord(data, babyIndex) || data
      return baby.gestationalWeek || baby.gestational_week ||
        baby.gestationalAge || baby.gestational_age
    })
  ].map(numeric).find((value) => value > 0)
  if (weeks && weeks < 37) return true
  const edd = firstDate(profile, [
    'maternal_edd', 'edd', 'EDD', 'manualEdd', 'manual_edd'
  ]) || firstDate(newbornFacts, ['maternalEdd'])
  return Boolean(
    birthDate && edd &&
    Math.floor((edd.getTime() - birthDate.getTime()) / DAY_MS) >=
      PRETERM_DAYS_BEFORE_EDD
  )
}

const registeredBabyHasKmcYes = (facts, visits) => {
  const babyIndex = registeredBabyIndex(facts)
  return (visits || []).some((visit) => {
    const data = unwrap(visit) || {}
    const baby = Array.isArray(data.kmc_babies)
      ? data.kmc_babies.find((item, index) =>
        babyIndexOf(item, index + 1) === babyIndex
      )
      : null
    if (baby && affirmative(baby.kmc_selected ?? baby.kmcSelected)) return true
    return recordAppliesToRegisteredBaby(facts, data) &&
      affirmative(data.kmc_selected ?? data.kmcSelected)
  })
}

const applyRegisteredBabyMetrics = (metrics, facts, period) => {
  const resetKeys = [
    'clients', 'new', 'old', 'birthWeightMeasured', 'lowBirthWeight',
    'careWithin2Days', 'kmcEligible', 'kmcReceived', 'canonicalClients',
    'canonicalBabies', 'kmcYes', 'preterm', 'under2Kg',
    'pretermAndUnder2Kg', 'immediateClients'
  ]
  resetKeys.forEach((key) => { metrics.newborn[key] = 0 })
  if (!isRegisteredBaby(facts.profile || facts.registration || {})) return

  const newbornFields = [
    'visitDate', 'visit_date', 'recordedAt', 'timestamp', 'createdAt'
  ]
  const allRelevantVisits = sortedRecords(
    facts.newbornVisits || [],
    newbornFields
  ).filter((visit) => recordAppliesToRegisteredBaby(facts, visit))
  const relevantVisits = allRelevantVisits.filter((visit) => {
    if (period.key === 'all') return true
    const date = recordDate(visit, newbornFields)
    return date && isDateInPeriod(date, period)
  })
  const immediate = sortedRecords(
    facts.immediateNewbornCare || [],
    newbornFields
  ).filter((record) =>
    recordAppliesToRegisteredBaby(facts, record) &&
    (period.key === 'all' || (
      recordDate(record, newbornFields) &&
      isDateInPeriod(recordDate(record, newbornFields), period)
    ))
  )
  const included = metrics.registration.babies === 1
  if (!included) return

  metrics.newborn.canonicalBabies = 1
  if (relevantVisits.length) {
    metrics.newborn.clients = 1
    metrics.newborn.canonicalClients = 1
    const classification = firstServiceClassification(
      allRelevantVisits,
      relevantVisits,
      newbornFields,
      period
    )
    if (classification) metrics.newborn[classification] = 1
  }
  if (immediate.length) metrics.newborn.immediateClients = 1

  const weight = babyWeightGram(facts, allRelevantVisits)
  if (weight) {
    metrics.newborn.birthWeightMeasured = 1
    if (weight < 2500) metrics.newborn.lowBirthWeight = 1
    if (weight < KMC_WEIGHT_GRAM) metrics.newborn.under2Kg = 1
  }
  const birthDate = registeredBabyBirthDate(facts, allRelevantVisits)
  if (registeredBabyIsPreterm(facts, birthDate, allRelevantVisits)) {
    metrics.newborn.preterm = 1
  }
  if (metrics.newborn.preterm && metrics.newborn.under2Kg) {
    metrics.newborn.pretermAndUnder2Kg = 1
  }
  if (metrics.newborn.preterm || metrics.newborn.under2Kg) {
    metrics.newborn.kmcEligible = 1
  }
  if (birthDate && allRelevantVisits.some((visit) => {
    const date = recordDate(visit, newbornFields)
    const difference = date ? (date - birthDate) / DAY_MS : Infinity
    return difference >= 0 && difference <= 2
  })) {
    metrics.newborn.careWithin2Days = 1
  }
  if (registeredBabyHasKmcYes(facts, relevantVisits)) {
    metrics.newborn.kmcYes = 1
    metrics.newborn.kmcReceived = 1
  }
}

const calculateV3Metrics = (facts, periodDescriptor, options) => {
  const metrics = emptyV3Metrics()
  if (!facts || !facts.id) return metrics
  const period = normalizePeriod(periodDescriptor)
  const corrected = Boolean(options && options.corrected)
  const registeredBabyTruth = Boolean(options && options.registeredBabyTruth)
  const profile = facts.profile || facts.registration || {}
  const registrationDate = firstDate(profile, [
    'createdAt', 'created_at', 'registrationDate', 'registration_date', 'timestamp'
  ])
  const ancFields = ['visitDate', 'visit_date', 'recordedAt', 'timestamp', 'createdAt']
  const pncFields = ['visitDate', 'visit_date', 'recordedAt', 'timestamp', 'createdAt']
  const newbornFields = ['visitDate', 'visit_date', 'recordedAt', 'timestamp', 'createdAt']
  const allAnc = sortedRecords(facts.antenatalVisits || [], ancFields)
  const allPnc = sortedRecords(facts.postpartumVisits || [], pncFields)
  const allNewborn = sortedRecords(facts.newbornVisits || [], newbornFields)
  const anc = recordsInPeriod(allAnc, period, ancFields)
  const pnc = recordsInPeriod(allPnc, period, pncFields)
  const newbornVisits = recordsInPeriod(allNewborn, period, newbornFields)
  const delivery = deliveryFacts(facts)
  const deliveryInPeriod = delivery.completed && delivery.date &&
    isDateInPeriod(delivery.date, period)
  const actualNotePresent = delivery.completed && delivery.source === 'delivery_notes'
  const actualNoteInPeriod = actualNotePresent && (
    period.key === 'all' ||
    (delivery.date && isDateInPeriod(delivery.date, period))
  )
  const legacyDeliveryInPeriod = delivery.completed &&
    delivery.source === 'legacy_fallback' && (
      period.key === 'all' ||
      (delivery.date && isDateInPeriod(delivery.date, period))
    )
  const countedDeliveryInPeriod = corrected
    ? actualNoteInPeriod && isCanonicalNewbornOwner(facts)
    : deliveryInPeriod
  const referral = unwrap(facts.transferRecord) || null
  const referralDate = referral && firstDate(referral, [
    'referralTime', 'transferDate', 'timestamp', 'createdAt', 'recordedAt'
  ])
  const referralInPeriod = referralDate && isDateInPeriod(referralDate, period)
  const anyActivity = Boolean(
    (corrected && period.key === 'all') ||
    (registrationDate && isDateInPeriod(registrationDate, period)) ||
    anc.length || pnc.length || newbornVisits.length || deliveryInPeriod || referralInPeriod
  )

  if (anyActivity) {
    metrics.registration.total = 1
    metrics.registration[registrationDate && isDateInPeriod(registrationDate, period)
      ? 'new' : 'old'] = 1
    if (isMother(profile)) {
      metrics.registration.mothers = 1
      if (corrected) bump(metrics.registration.ageGroups, maternalAgeGroup(profile))
    } else if (corrected) {
      metrics.registration.babies = 1
    }
  }

  if (anc.length) {
    metrics.anc.clients = 1
    metrics.anc.services = anc.length
    const classification = firstServiceClassification(allAnc, anc, ancFields, period)
    metrics.anc[classification] = 1
    const inPeriodOrdinals = anc.map((visit) => recordOrdinal(visit, allAnc))
    if (classification === 'new'
      ? inPeriodOrdinals.some((ordinal) => ordinal >= 4)
      : inPeriodOrdinals.includes(4)) metrics.anc.atLeast4 = 1
    if (classification === 'new'
      ? inPeriodOrdinals.some((ordinal) => ordinal >= 8)
      : inPeriodOrdinals.includes(8)) metrics.anc.atLeast8 = 1
    if (classification === 'new' && isEarlyAncV3(allAnc, profile)) {
      metrics.anc.early = 1
    }
    if (anc.some((visit) => medicineReceived(visit.ironFolicAcid) ||
      medicineReceived(visit.micronutrientsTablet))) metrics.anc.ironFolate = 1
    if (anc.some((visit) =>
      medicineReceived(visit.vitaminB1) &&
      completedWeeksAtVisit(visit, profile) > 36
    )) metrics.anc.vitaminB1 = 1
    if (anc.some((visit) =>
      medicineReceived(visit.deworming) &&
      completedWeeksAtVisit(visit, profile) > 12
    )) metrics.anc.deworming = 1
    if (anc.some((visit) => affirmative(visit.gbvSuspected))) metrics.anc.gbv = 1
    if (anc.some((visit) => affirmative(visit.tbSymptoms) ||
      affirmative(visit.tbSuspected) || affirmative(visit.tuberculosis))) metrics.anc.tb = 1

    const allRiskVisits = allAnc.filter((visit) =>
      affirmative(visit.high_risk ?? visit.highRisk)
    )
    const firstRiskVisit = allRiskVisits[0]
    const firstRiskDate = firstRiskVisit && recordDate(firstRiskVisit, ancFields)
    if (firstRiskDate && isDateInPeriod(firstRiskDate, period)) {
      metrics.highRisk.clients = 1
      const factors = new Set()
      allRiskVisits.forEach((visit) => {
        const rawFactors = visit.risk_factors || visit.riskFactors || []
        const factorList = Array.isArray(rawFactors)
          ? rawFactors
          : String(rawFactors).split(',').map((factor) => factor.trim())
        factorList.forEach((factor) => {
          const value = String(factor || '').trim()
          if (value) factors.add(value)
        })
      })
      factors.forEach((factor) => bump(metrics.highRisk.factors, factor))
      allRiskVisits.forEach((visit) => {
        const disease = String(
          visit.otherMedicalConditionName || visit.other_medical_condition_name || ''
        ).trim()
        if (disease) bump(metrics.highRisk.otherMedicalDiseases, disease)
      })
    }
  }

  const tests = recordsInPeriod(facts.testRecords || [], period, [
    'testDate', 'visitDate', 'recordedAt', 'timestamp', 'createdAt'
  ])
  if (anc.length && tests.length) {
    const hivResults = tests.map((test) =>
      normalizeInfectionResult(test.hivResult || test.hiv_result)
    ).filter((value) => value !== 'unknown')
    if (hivResults.length) metrics.anc.pmtctTested = 1
    if (hivResults.includes('positive')) metrics.anc.pmtctReactive = 1
  }

  if (corrected) {
    if (actualNoteInPeriod) {
      metrics.delivery.actualNotes = 1
      metrics.delivery.babiesInNotes = delivery.babies.length
    } else if (legacyDeliveryInPeriod) {
      metrics.delivery.legacyDerived = 1
    }
  }

  if (countedDeliveryInPeriod) {
    metrics.delivery.completedNotes = 1
    const skilled = ['skilled_birth_attendant', 'amw'].includes(delivery.provider)
    if (skilled && delivery.place === 'Home') metrics.delivery.homeSkilled = 1
    if (skilled && ['Public Health Facility', 'Private Facility'].includes(delivery.place)) {
      metrics.delivery.institutionalSkilled = 1
    }
    if (delivery.uterotonic) metrics.delivery.uterotonic = 1
    if (lcgUsed(facts)) metrics.delivery.lcgUsed = 1
    bump(metrics.delivery.modes, delivery.mode)
    bump(metrics.delivery.places, delivery.place)
    bump(metrics.delivery.maternalOutcomes, delivery.maternalOutcome)
    delivery.babies.forEach((baby) => {
      metrics.newborn.births += 1
      bump(metrics.delivery.newbornOutcomes, baby.outcome)
      const liveBirth = ['alive', 'death'].includes(baby.outcome)
      if (liveBirth) metrics.newborn.liveBirths += 1
      const weight = birthWeightForBaby(baby)
      if (liveBirth && weight) {
        metrics.newborn.birthWeightMeasured += 1
        if (weight < 2500) metrics.newborn.lowBirthWeight += 1
      }
    })
    metrics.pnc.deliveredMothers = 1
    if (anc.some((visit) => medicineReceived(visit.ironFolicAcid) ||
      medicineReceived(visit.micronutrientsTablet))) {
      metrics.pnc.ironFolate = 1
    }
    if (delivery.babies.some((baby) => baby.outcome === 'alive')) {
      if (allAnc.length >= 4) metrics.pnc.mothersWithAnc4 = 1
      if (allAnc.length >= 8) metrics.pnc.mothersWithAnc8 = 1
    }

    const immediate = (facts.immediateNewbornCare &&
      (Array.isArray(facts.immediateNewbornCare)
        ? facts.immediateNewbornCare
        : [facts.immediateNewbornCare])) || []
    metrics.newborn.earlyBreastfeeding = Math.min(
      metrics.newborn.liveBirths,
      immediate.map(unwrap).filter((care) =>
        affirmative(care && care.support_early_exclusive_breastfeeding)
      ).length
    )
    delivery.babies.forEach((baby, index) => {
      if (!['alive', 'death'].includes(baby.outcome)) return
      if (newbornCareWithinDays(facts, baby.birthDate || delivery.date, 2)) {
        metrics.newborn.careWithin2Days += 1
      }
      if (!corrected) {
        const weight = birthWeightForBaby(baby)
        const eligible = (weight && weight < 2000) ||
          (baby.gestationalWeek && baby.gestationalWeek < 37)
        if (eligible) {
          metrics.newborn.kmcEligible += 1
          if (kmcReceivedForBaby(facts, index + 1)) metrics.newborn.kmcReceived += 1
        }
      }
    })
  }

  if (corrected && isCanonicalNewbornOwner(facts)) {
    const babies = canonicalNewbornBabies(facts, delivery)
    babies.forEach((baby) => {
      const birth = babyBirthDate(baby, delivery)
      const birthInPeriod = period.key === 'all' ||
        (birth && isDateInPeriod(birth, period))
      const eligibility = kmcEligibility(facts, baby, delivery)
      const kmcYes = kmcYesForBaby(facts, baby.babyIndex, period)
      if (birthInPeriod) {
        metrics.newborn.canonicalBabies += 1
        if (eligibility.preterm) metrics.newborn.preterm += 1
        if (eligibility.under2Kg) metrics.newborn.under2Kg += 1
        if (eligibility.preterm && eligibility.under2Kg) {
          metrics.newborn.pretermAndUnder2Kg += 1
        }
        if (eligibility.preterm || eligibility.under2Kg) {
          metrics.newborn.kmcEligible += 1
          if (kmcYes) metrics.newborn.kmcReceived += 1
        }
      }
      if (kmcYes) metrics.newborn.kmcYes += 1
    })
  }

  if (newbornVisits.length && (!corrected || isCanonicalNewbornOwner(facts))) {
    metrics.newborn.clients = 1
    if (corrected) metrics.newborn.canonicalClients = 1
    metrics.newborn[firstServiceClassification(
      allNewborn, newbornVisits, newbornFields, period
    )] = 1
  }

  if (pnc.length) {
    metrics.pnc.clients = 1
    metrics.pnc.visits = pnc.length
    metrics.pnc[firstServiceClassification(allPnc, pnc, pncFields, period)] = 1
    if (pnc.map((visit) => recordOrdinal(visit, allPnc)).includes(4)) {
      metrics.pnc.atLeast4 = 1
    }
    const first = allPnc[0]
    const birthDate = delivery.date || (facts.birthAnchor && facts.birthAnchor.value)
    const days = pncDays(first, birthDate)
    if (days != null && days <= 2 &&
        recordDate(first, pncFields) && isDateInPeriod(recordDate(first, pncFields), period)) {
      metrics.pnc.within48Hours = 1
    }
    if (days != null && days <= 42 &&
        recordDate(first, pncFields) && isDateInPeriod(recordDate(first, pncFields), period)) {
      metrics.pnc.within42Days = 1
    }
    if (pnc.some((visit) => {
      const visitDays = pncDays(visit, birthDate)
      return visitDays != null && visitDays <= 42 &&
        (visit.vitaminBComplex === true || medicineReceived(visit.vitaminB1))
    })) metrics.pnc.vitaminB1 = 1
    if (pnc.some((visit) =>
      String(visit.vaginalBleeding || '').toLowerCase().includes('heavy')
    )) metrics.pnc.pph = 1
  }

  if (referralInPeriod) {
    metrics.referral.total = 1
    bump(metrics.referral.byStage, referralStage(referral, profile))
    bump(metrics.referral.byDestination, referralDestination(referral))
  }

  const jointCareIds = Array.isArray(facts.scope && facts.scope.careTeamProviderIds)
    ? facts.scope.careTeamProviderIds.filter(Boolean)
    : []
  const activeJointCareIds = Array.isArray(
    facts.jointCareFacts && facts.jointCareFacts.activeProviderIds
  ) ? facts.jointCareFacts.activeProviderIds.filter(Boolean) : []
  const hasJointCare = corrected
    ? activeJointCareIds.length > 0
    : jointCareIds.length > 0
  if (hasJointCare && anyActivity) {
    metrics.jointCare.clients = 1
    if (anc.length) bump(metrics.jointCare.byStatus, 'ANC')
    if (deliveryInPeriod) bump(metrics.jointCare.byStatus, 'Delivery')
    if (pnc.length) bump(metrics.jointCare.byStatus, 'PNC')
    if (newbornVisits.length) bump(metrics.jointCare.byStatus, 'Newborn')
    const kmcActions = recordsInPeriod(facts.kmcActions || [], period, [
      'recordedAt', 'visitDate', 'timestamp', 'createdAt'
    ])
    const kmcVisit = newbornVisits.some((visit) =>
      String(visit.kmc_selected || '').toLowerCase() === 'yes' ||
      (visit.kmc_hours_per_day != null && Number(visit.kmc_hours_per_day) > 0)
    )
    if (kmcActions.length || kmcVisit ||
        metrics.newborn.kmcEligible || metrics.newborn.kmcReceived) {
      bump(metrics.jointCare.byStatus, 'KMC')
    }
  }

  if (registeredBabyTruth) {
    applyRegisteredBabyMetrics(metrics, facts, period)
  }

  return metrics
}

const eventDates = (facts) => {
  const values = []
  const add = (value) => {
    const date = parseDateValue(value)
    if (date) values.push(date)
  }
  const addRecord = (record) => {
    const data = unwrap(record) || {}
    ;[
      'visitDate', 'visit_date', 'testDate', 'referralTime', 'transferDate',
      'birthTime', 'birth_time', 'deliveryDate', 'createdAt', 'created_at',
      'registrationDate', 'registration_date', 'recordedAt', 'timestamp'
    ].forEach((field) => add(data[field]))
  }
  addRecord(facts.profile || facts.registration)
  ;[
    facts.antenatalVisits, facts.postpartumVisits, facts.testRecords,
    facts.newbornVisits, facts.immediateNewbornCare
  ].forEach((records) => (Array.isArray(records) ? records : records ? [records] : [])
    .forEach(addRecord))
  addRecord(facts.transferRecord)
  const delivery = deliveryFacts(facts)
  add(delivery.date)
  return values
}

const reportingPeriodsForFacts = (facts) => {
  const keys = new Set(['all'])
  eventDates(facts).forEach((date) => {
    keys.add(monthKeyForDate(date))
    keys.add(yearKeyForDate(date))
  })
  return Array.from(keys).filter(Boolean).sort()
}

const mergeNumericTrees = (left, right) => {
  if (typeof left === 'number' || typeof right === 'number') {
    return numeric(left) + numeric(right)
  }
  const result = {}
  const a = left && typeof left === 'object' ? left : {}
  const b = right && typeof right === 'object' ? right : {}
  new Set([...Object.keys(a), ...Object.keys(b)]).forEach((key) => {
    result[key] = mergeNumericTrees(a[key], b[key])
  })
  return result
}

const subtractNumericTrees = (next, previous) => {
  if (typeof next === 'number' || typeof previous === 'number') {
    return numeric(next) - numeric(previous)
  }
  const result = {}
  const a = next && typeof next === 'object' ? next : {}
  const b = previous && typeof previous === 'object' ? previous : {}
  new Set([...Object.keys(a), ...Object.keys(b)]).forEach((key) => {
    result[key] = subtractNumericTrees(a[key], b[key])
  })
  return result
}

const applyDeltaNonNegative = (current, delta) => {
  if (typeof current === 'number' || typeof delta === 'number') {
    return Math.max(0, numeric(current) + numeric(delta))
  }
  const result = {}
  const a = current && typeof current === 'object' ? current : {}
  const b = delta && typeof delta === 'object' ? delta : {}
  new Set([...Object.keys(a), ...Object.keys(b)]).forEach((key) => {
    result[key] = applyDeltaNonNegative(a[key], b[key])
  })
  return result
}

module.exports = {
  DAY_MS,
  emptyV3Metrics,
  medicineReceived,
  completedWeeksAtVisit,
  isEarlyAncV3,
  normalizeBirthPlace,
  normalizeBirthProvider,
  normalizeDeliveryMode,
  deliveryFacts,
  maternalAgeGroup,
  canonicalNewbornOwner,
  canonicalNewbornBabies,
  kmcEligibility,
  recordAppliesToRegisteredBaby,
  babyWeightGram,
  registeredBabyBirthDate,
  registeredBabyIsPreterm,
  applyRegisteredBabyMetrics,
  referralDestination,
  calculateV3Metrics,
  reportingPeriodsForFacts,
  mergeNumericTrees,
  subtractNumericTrees,
  applyDeltaNonNegative
}
