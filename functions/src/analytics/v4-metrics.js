'use strict'

const {
  ANALYTICS_V4_SCHEMA_VERSION,
  ANALYTICS_V4_DEFINITION_VERSION
} = require('./v4-registry')

const DAY_MS = 24 * 60 * 60 * 1000
const KMC_WEIGHT_GRAM = 2000

const asText = (value) => String(value == null ? '' : value).trim()

const dateOnly = (value) => {
  if (!value) return null
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
  if (typeof value.toDate === 'function') return dateOnly(value.toDate())
  if (typeof value.seconds === 'number') return new Date(value.seconds * 1000)
  const text = asText(value)
  const parsed = new Date(/^\d{4}-\d{2}-\d{2}$/.test(text)
    ? `${text}T00:00:00+06:30`
    : text)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

const dateKey = (value) => {
  const date = dateOnly(value)
  if (!date) return ''
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Yangon',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date).reduce((result, part) => {
    result[part.type] = part.value
    return result
  }, {})
  return `${parts.year}-${parts.month}-${parts.day}`
}

const monthKey = (value) => dateKey(value).slice(0, 7)

const normalizePeriod = (period) => {
  const start = dateKey(period && (period.startDate || period.start))
  const end = dateKey(period && (period.endDate || period.end))
  if (!start || !end || start > end) throw new Error('A valid inclusive date range is required')
  return { start, end }
}

const inPeriod = (value, period) => {
  const key = dateKey(value)
  return Boolean(key && key >= period.start && key <= period.end)
}

const unwrap = (value) => value && value.data ? value.data : (value || {})

const records = (value) => Array.isArray(value)
  ? value.map(unwrap)
  : []

const recordId = (record, fallback) => asText(
  record.id || record.docId || record.visitId || record.actionId || fallback
)

const numeric = (value) => {
  const result = Number(value)
  return Number.isFinite(result) ? result : 0
}

const affirmative = (value) => ['yes', 'true', '1', 'given', 'completed', 'received'].includes(
  asText(value).toLowerCase()
)

const normalizeTd = (value) => {
  const raw = asText(value).toLowerCase()
  if (raw === 'td1' || raw === 'td 1') return 'TD1'
  if (raw === 'td2' || raw === 'td 2') return 'TD2'
  if (['completed', 'complete', 'done'].includes(raw)) return 'Completed'
  if (['not_given', 'not given', 'none'].includes(raw)) return 'Not Given'
  return raw ? 'Unknown' : ''
}

const normalizeOutcome = (value) => {
  const raw = asText(value).toLowerCase()
  if (['alive', 'live', 'living'].includes(raw)) return 'alive'
  if (['death', 'dead', 'died', 'maternal_death'].includes(raw)) return 'death'
  if (['stillbirth', 'still_birth', 'stillborn'].includes(raw)) return 'stillbirth'
  if (['transfer', 'transferred', 'referred'].includes(raw)) return 'transfer'
  return raw || 'unknown'
}

const normalizeFacilityPlace = (value) => {
  const raw = asText(value).toLowerCase()
  if (raw.includes('home')) return 'Home'
  if (raw.includes('private')) return 'Private Facility'
  if (raw.includes('hospital') || raw.includes('health') || raw.includes('facility')) {
    return 'Public Health Facility'
  }
  return 'Other/Unknown'
}

const normalizeProvider = (value) => {
  const raw = asText(value).toLowerCase()
  if (raw === 'self' || raw.includes('skilled')) return raw === 'self' ? 'self' : 'skilled_birth_attendant'
  if (raw === 'amw') return 'amw'
  return raw || 'unknown'
}

const sorted = (items, fields) => items
  .map((item, index) => ({ item, index, date: fields.map((field) => item[field]).find(Boolean) }))
  .sort((left, right) => dateOnly(left.date) - dateOnly(right.date) || left.index - right.index)
  .map(({ item }) => item)

const emptyMetrics = () => ({
  registration: { total: 0, mothers: 0, babies: 0 },
  anc: {
    clients: 0, services: 0, atLeast4: 0, atLeast8: 0, early: 0,
    ironFolate: 0, td: { protected: 0, byLatestStatus: {} },
    vitaminB1: 0, deworming: 0, gbv: 0, pmtctTested: 0, tb: 0
  },
  highRisk: {
    clients: 0, factors: {}, completion: { completed: 0, byReason: {} },
    ancAverage: {
      highRisk: { visits: 0, clients: 0 },
      nonHighRisk: { visits: 0, clients: 0 }
    }
  },
  delivery: {
    completedNotes: 0, homeSba: 0, institutional: 0, skilledTotal: 0,
    uterotonic: 0, lcgUsed: 0, modes: {}, places: {},
    maternalOutcomes: {}, newbornOutcomes: {}
  },
  newborn: {
    clients: 0, births: 0, birthWeightMeasured: 0, lowBirthWeight: 0,
    preterm: 0, careWithin2Days: 0, kmcEligible: 0, kmcCompleted: 0,
    kmcWeightGain: { totalGainGrams: 0, babiesWithTwoWeights: 0 }
  },
  pnc: {
    clients: 0, visits: 0, deliveredMothers: 0, coverageNumerator: 0,
    atLeast4: 0, within48Hours: 0, within42Days: 0,
    mothersWithAnc4: 0, mothersWithAnc8: 0, ironFolate: 0, vitaminB1: 0, pph: 0
  },
  referral: {
    maternal: { total: 0, byStage: {}, byDestination: {} },
    baby: { total: 0, byStage: {}, byDestination: {} }
  },
  jointCare: {
    clients: 0, receivingFacilityCount: 0, receivingProviderCount: 0,
    byReceivingFacilityType: {}
  },
  serviceClosure: {
    total: 0, mother: { total: 0, byOutcome: {} },
    baby: { total: 0, byOutcome: {} }, undated: 0
  }
})

const bump = (map, key, amount = 1) => {
  const normalized = asText(key) || 'Unknown'
  map[normalized] = Number(map[normalized] || 0) + amount
}

const visitDate = (visit) => visit.visitDate || visit.visit_date ||
  visit.recordedAt || visit.timestamp || visit.createdAt

const externalAncVisits = (visits) => {
  const output = []
  const seen = new Set()
  records(visits).forEach((visit, visitIndex) => {
    records(visit.otherVisits).forEach((other, otherIndex) => {
      const key = [
        dateKey(other.visitDate || other.visit_date),
        asText(other.facilityType).toLowerCase(),
        asText(other.facilityName).toLowerCase()
      ].join('|')
      if (!key || seen.has(key)) return
      seen.add(key)
      output.push({
        ...other,
        id: `other-${visitIndex}-${otherIndex}-${key}`,
        visitDate: other.visitDate || other.visit_date,
        external: true
      })
    })
  })
  return output
}

const allAncVisits = (facts) => {
  const own = records(facts.antenatalVisits)
    .map((visit, index) => ({ ...visit, id: recordId(visit, `anc-${index}`), external: false }))
  return sorted(own.concat(externalAncVisits(facts.antenatalVisits)), ['visitDate', 'visit_date', 'createdAt'])
}

const deliveryRecord = (facts) => {
  const notes = unwrap(facts.deliveryNotes)
  const details = notes.deliveryDetails || notes.delivery_details || notes
  const babies = Array.isArray(details.babies) ? details.babies : (
    Array.isArray(notes.babies) ? notes.babies : []
  )
  return {
    exists: Boolean(facts.deliveryNotes),
    date: details.deliveryDate || details.delivery_date || notes.deliveryDate || notes.createdAt,
    provider: normalizeProvider(details.birthProvider || details.birth_provider),
    place: normalizeFacilityPlace(details.birthPlace || details.birthplace),
    mode: asText(details.modeOfDelivery || details.mode_of_delivery) || 'Other/Unknown',
    maternalOutcome: normalizeOutcome(details.maternalOutcome || details.maternal_outcome),
    uterotonic: affirmative(details.oxytocinGiven || details.uterotonic || notes.oxytocinGiven),
    lcgUsed: Boolean(facts.startingTimeDoc && facts.secondStageDoc),
    babies: babies.map((baby, index) => ({
      ...baby,
      id: recordId(baby, `baby-${index}`),
      outcome: normalizeOutcome(baby.outcome || baby.birth_outcome),
      weight: numeric(baby.birthWeightGram || baby.birth_weight_gram || baby.body_weight_gram),
      gestationalWeek: numeric(baby.gestationalWeek || baby.gestational_age_at_birth)
    }))
  }
}

const hrtCompletion = (facts) => sorted(records(facts.hrtActions), ['recordedAt', 'createdAt'])
  .filter((action) => ['resolved', 'completed'].includes(asText(action.type).toLowerCase()) ||
    action.completionReason || action.outcome)
  .map((action) => ({
    ...action,
    reason: asText(action.completionReason || action.resolvedReason || action.reason || action.outcome).toLowerCase(),
    date: action.recordedAt || action.completedAt || action.createdAt
  }))
  .filter((action) => action.reason)
  .pop() || null

const kmcActionsForBaby = (facts, babyIndex) => records(facts.kmcActions)
  .filter((action) => numeric(action.babyIndex || action.baby_index || 1) === babyIndex)

const weightHistoryForBaby = (facts, babyIndex, delivery) => {
  const points = []
  records(facts.newbornVisits).forEach((visit, visitIndex) => {
    const babies = Array.isArray(visit.babies) ? visit.babies : [visit]
    babies.forEach((baby, index) => {
      const indexValue = numeric(baby.babyIndex || baby.baby_index || index + 1)
      if (indexValue !== babyIndex) return
      const grams = numeric(
        baby.current_weight_gram || baby.currentWeightGram || baby.visit_weight_gram ||
        baby.body_weight_gram || baby.birth_weight_gram
      )
      if (grams > 0) points.push({
        date: visitDate(visit),
        visit: numeric(baby.visitNumber || baby.visit_number || visit.visitNumber || visitIndex + 1),
        grams: grams < 30 ? grams * 1000 : grams
      })
    })
  })
  const deliveryBaby = delivery.babies[babyIndex - 1]
  if (deliveryBaby && deliveryBaby.weight > 0 && !points.some((point) => point.visit === 1)) {
    points.unshift({ date: delivery.date, visit: 1, grams: deliveryBaby.weight })
  }
  return points.sort((left, right) => left.visit - right.visit || dateOnly(left.date) - dateOnly(right.date))
}

const referralFromFacts = (facts) => {
  const record = unwrap(facts.transferRecord)
  if (!Object.keys(record).length) return null
  const baby = String(
    facts.profile && (facts.profile.patient_type || facts.profile.patientType)
  ).toLowerCase() === 'baby' || asText(record.careContext || record.stage).toLowerCase() === 'newborn'
  return {
    baby,
    date: record.referralTime || record.timestamp || record.createdAt,
    stage: asText(record.careContext || record.stage) || 'Unknown',
    destination: asText(record.referralFacilityType || record.destinationFacility || record.referralFacility) || 'Other/Unknown'
  }
}

const calculateV4Metrics = (facts, inputPeriod) => {
  const period = normalizePeriod(inputPeriod)
  const metrics = emptyMetrics()
  const profile = facts.profile || facts.registration || {}
  const patientType = asText(profile.patient_type || profile.patientType).toLowerCase()
  const anc = allAncVisits(facts)
  const ancInPeriod = anc.filter((visit) => inPeriod(visit.visitDate, period))
  const pnc = sorted(records(facts.postpartumVisits), ['visitDate', 'visit_date', 'createdAt'])
  const pncInPeriod = pnc.filter((visit) => inPeriod(visitDate(visit), period))
  const delivery = deliveryRecord(facts)
  const deliveryInPeriod = delivery.exists && inPeriod(delivery.date, period)

  const registrationDate = profile.registration_date || profile.registrationDate ||
    profile.createdAt || profile.created_at
  if (inPeriod(registrationDate, period) || period.start === period.end || !registrationDate) {
    metrics.registration.total = 1
    if (patientType === 'baby') metrics.registration.babies = 1
    else metrics.registration.mothers = 1
  }

  if (ancInPeriod.length) {
    metrics.anc.clients = 1
    metrics.anc.services = ancInPeriod.length
    const ordinal = (visit) => anc.indexOf(visit) + 1
    if (ancInPeriod.some((visit) => ordinal(visit) >= 4)) metrics.anc.atLeast4 = 1
    if (ancInPeriod.some((visit) => ordinal(visit) >= 8)) metrics.anc.atLeast8 = 1
    const first = anc[0]
    if (first && inPeriod(first.visitDate, period) &&
      numeric(first.gestationalAge || first.gestational_age) <= 12 &&
      numeric(first.gestationalAge || first.gestational_age) > 0) metrics.anc.early = 1
    if (ancInPeriod.some((visit) => affirmative(visit.ironFolicAcid) ||
      affirmative(visit.micronutrientsTablet))) metrics.anc.ironFolate = 1
    const td = anc
      .filter((visit) => dateKey(visit.visitDate) <= period.end)
      .map((visit) => normalizeTd(visit.tetanusToxoid || visit.td))
      .filter(Boolean)
      .pop() || 'Unknown'
    bump(metrics.anc.td.byLatestStatus, td)
    if (['TD2', 'Completed'].includes(td)) metrics.anc.td.protected = 1
    if (ancInPeriod.some((visit) => affirmative(visit.vitaminB1))) metrics.anc.vitaminB1 = 1
    if (ancInPeriod.some((visit) => affirmative(visit.deworming))) metrics.anc.deworming = 1
    if (ancInPeriod.some((visit) => affirmative(visit.gbvSuspected))) metrics.anc.gbv = 1
    if (ancInPeriod.some((visit) => visit.hivResult || visit.hiv_result)) metrics.anc.pmtctTested = 1
    if (ancInPeriod.some((visit) => affirmative(visit.tbSymptoms) || affirmative(visit.tbSuspected))) metrics.anc.tb = 1

    const highRisk = anc.some((visit) => affirmative(visit.high_risk || visit.highRisk))
    const group = highRisk ? metrics.highRisk.ancAverage.highRisk : metrics.highRisk.ancAverage.nonHighRisk
    group.clients = 1
    group.visits = ancInPeriod.length
    if (highRisk) {
      metrics.highRisk.clients = 1
      anc.filter((visit) => affirmative(visit.high_risk || visit.highRisk))
        .flatMap((visit) => Array.isArray(visit.risk_factors) ? visit.risk_factors : [])
        .forEach((factor) => bump(metrics.highRisk.factors, factor))
    }
  }

  const completion = hrtCompletion(facts)
  if (completion && inPeriod(completion.date, period)) {
    metrics.highRisk.completion.completed = 1
    bump(metrics.highRisk.completion.byReason, completion.reason)
  }

  if (deliveryInPeriod) {
    metrics.delivery.completedNotes = 1
    if (delivery.place === 'Home' && ['self', 'skilled_birth_attendant', 'amw'].includes(delivery.provider)) {
      metrics.delivery.homeSba = 1
    }
    if (['Public Health Facility', 'Private Facility'].includes(delivery.place)) metrics.delivery.institutional = 1
    if (delivery.provider === 'self' || ['skilled_birth_attendant', 'amw'].includes(delivery.provider)) {
      metrics.delivery.skilledTotal = 1
    }
    if (delivery.uterotonic) metrics.delivery.uterotonic = 1
    if (delivery.lcgUsed) metrics.delivery.lcgUsed = 1
    bump(metrics.delivery.modes, delivery.mode)
    bump(metrics.delivery.places, delivery.place)
    bump(metrics.delivery.maternalOutcomes, delivery.maternalOutcome)
    delivery.babies.forEach((baby) => {
      metrics.newborn.births += 1
      bump(metrics.delivery.newbornOutcomes, baby.outcome)
      if (baby.weight > 0) {
        metrics.newborn.birthWeightMeasured += 1
        if (baby.weight < 2500) metrics.newborn.lowBirthWeight += 1
      }
      if (baby.gestationalWeek > 0 && baby.gestationalWeek < 37) metrics.newborn.preterm += 1
    })
  }

  if (pncInPeriod.length) {
    metrics.pnc.clients = 1
    metrics.pnc.visits = pncInPeriod.length
    if (pncInPeriod.some((visit) => numeric(visit.visitNumber || visit.visit_number) >= 4)) metrics.pnc.atLeast4 = 1
    const birth = delivery.date || profile.birth_time || profile.date_of_birth
    const first = pnc[0]
    const days = birth && first && Math.floor((dateOnly(visitDate(first)) - dateOnly(birth)) / DAY_MS)
    if (days >= 0 && days <= 2 && inPeriod(visitDate(first), period)) metrics.pnc.within48Hours = 1
    if (days >= 0 && days <= 42 && inPeriod(visitDate(first), period)) metrics.pnc.within42Days = 1
    if (pncInPeriod.some((visit) => affirmative(visit.ironFolic))) metrics.pnc.ironFolate = 1
    if (pncInPeriod.some((visit) => affirmative(visit.vitaminBComplex) || affirmative(visit.vitaminB1))) metrics.pnc.vitaminB1 = 1
    if (pncInPeriod.some((visit) => asText(visit.vaginalBleeding).toLowerCase().includes('heavy'))) metrics.pnc.pph = 1
  }
  if (deliveryInPeriod) {
    metrics.pnc.deliveredMothers = 1
    metrics.pnc.coverageNumerator = pnc.some((visit) => {
      const visitKey = dateKey(visitDate(visit))
      return visitKey >= period.start && visitKey <= period.end
    }) ? 1 : 0
    if (anc.length >= 4) metrics.pnc.mothersWithAnc4 = 1
    if (anc.length >= 8) metrics.pnc.mothersWithAnc8 = 1
  }

  if (records(facts.newbornVisits).some((visit) => inPeriod(visitDate(visit), period))) metrics.newborn.clients = 1

  const kmcYes = records(facts.newbornVisits).some((visit) =>
    affirmative(visit.kmc_selected || visit.kmcSelected) ||
    records(visit.kmc_babies || visit.babies).some((baby) =>
      affirmative(baby.kmc_selected || baby.kmcSelected)
    )
  )
  const kmcBabyCount = delivery.babies.length || (patientType === 'baby' ? 1 : 0)
  for (let babyIndex = 1; babyIndex <= kmcBabyCount; babyIndex += 1) {
    const history = weightHistoryForBaby(facts, babyIndex, delivery)
    const birthWeight = history[0] && history[0].grams
    const eligible = birthWeight > 0 && birthWeight < KMC_WEIGHT_GRAM
    const actions = kmcActionsForBaby(facts, babyIndex)
    const completed = actions.find((action) =>
      ['kmc_resolved', 'resolved'].includes(asText(action.type).toLowerCase()) &&
      inPeriod(action.recordedAt || action.createdAt, period)
    )
    if (eligible) {
      metrics.newborn.kmcEligible += 1
      if (completed) metrics.newborn.kmcCompleted += 1
    }
    if (kmcYes && history.length >= 2) {
      const latest = history.filter((point) => inPeriod(point.date, period)).pop() || history[history.length - 1]
      if (latest && latest.grams !== birthWeight) {
        metrics.newborn.kmcWeightGain.totalGainGrams += latest.grams - birthWeight
        metrics.newborn.kmcWeightGain.babiesWithTwoWeights += 1
      }
    }
  }

  const referral = referralFromFacts(facts)
  if (referral && inPeriod(referral.date, period)) {
    const target = referral.baby ? metrics.referral.baby : metrics.referral.maternal
    target.total = 1
    bump(target.byStage, referral.stage)
    bump(target.byDestination, referral.destination)
  }

  const closure = unwrap(profile.serviceClosure)
  if (closure.status === 'closed') {
    const closedAt = closure.closedAt || closure.closed_at
    if (inPeriod(closedAt, period)) {
      const outcome = asText(closure.outcome) || 'other'
      metrics.serviceClosure.total = 1
      const target = patientType === 'baby' ? metrics.serviceClosure.baby : metrics.serviceClosure.mother
      target.total = 1
      bump(target.byOutcome, outcome)
    } else if (!closedAt) {
      metrics.serviceClosure.undated = 1
    }
  }

  const activeProviders = Array.from(new Set(
    (facts.jointCareFacts && facts.jointCareFacts.activeProviderIds) ||
    (facts.scope && facts.scope.activeJointCareProviderIds) || []
  ))
  if (activeProviders.length) {
    metrics.jointCare.clients = 1
    const receiving = (facts.jointCareFacts && facts.jointCareFacts.receivingProviders) || []
    const facilities = new Map()
    receiving.forEach((provider) => {
      const code = asText(provider.facilityCode || provider.facility_code || provider.providerId)
      if (!code || facilities.has(code)) return
      facilities.set(code, provider)
      const type = asText(provider.facilityType || provider.facility_type).toLowerCase().includes('hospital')
        ? 'Hospital'
        : 'Other Facilities'
      bump(metrics.jointCare.byReceivingFacilityType, type)
    })
    metrics.jointCare.receivingFacilityCount = facilities.size
    metrics.jointCare.receivingProviderCount = activeProviders.length
  }

  return metrics
}

const mergeNumericTrees = (left, right) => {
  if (typeof left === 'number' || typeof right === 'number') return numeric(left) + numeric(right)
  const output = {}
  const keys = new Set(Object.keys(left || {}).concat(Object.keys(right || {})))
  keys.forEach((key) => {
    output[key] = mergeNumericTrees(left && left[key], right && right[key])
  })
  return output
}

const buildContribution = (facts, month) => {
  const period = {
    start: `${month}-01`,
    end: `${month}-31`
  }
  const metrics = calculateV4Metrics(facts, period)
  return {
    schemaVersion: ANALYTICS_V4_SCHEMA_VERSION,
    definitionVersion: ANALYTICS_V4_DEFINITION_VERSION,
    patientId: facts.id,
    month,
    scope: facts.scope || {},
    metrics,
    sourceHash: asText(facts.sourceHash || ''),
    updatedAt: new Date().toISOString()
  }
}

module.exports = {
  DAY_MS,
  dateOnly,
  dateKey,
  monthKey,
  normalizePeriod,
  inPeriod,
  emptyMetrics,
  externalAncVisits,
  allAncVisits,
  deliveryRecord,
  weightHistoryForBaby,
  calculateV4Metrics,
  mergeNumericTrees,
  buildContribution
}
