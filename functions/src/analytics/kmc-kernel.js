'use strict'

const { firstDate, unwrap } = require('../shared/clinical-normalizers')

const DAY_MS = 86400000
const LOW_BIRTH_WEIGHT_GRAM = 2000
const TARGET_WEIGHT_GRAM = 2500
const NORMAL_TEMPERATURE_MIN = 36.5
const NORMAL_TEMPERATURE_MAX = 37.5

const text = (value) => String(value == null ? '' : value).trim().toLowerCase()

const normalizeWeightGram = (value) => {
  const number = Number(value)
  if (!Number.isFinite(number) || number <= 0) return null
  return number < 30 ? Math.round(number * 1000) : Math.round(number)
}

const normalizeGestationalWeeks = (value) => {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : null
}

const isAliveOutcome = (value) => ![
  'dead', 'death', 'died', 'stillbirth', 'stillborn', 'fresh stillbirth',
  'macerated stillbirth'
].includes(text(value))

const dateValue = (record) => firstDate(record, [
  'visitDate', 'visit_date', 'birthTime', 'birth_time', 'recordedAt',
  'recorded_at', 'timestamp', 'createdAt', 'created_at'
])

const latestVisit = (visits) => (visits || [])
  .map(unwrap)
  .filter(Boolean)
  .sort((left, right) => (dateValue(right) || 0) - (dateValue(left) || 0))[0] || null

const latestField = (visits, fields) => {
  const visit = latestVisit(visits)
  if (!visit) return null
  for (const field of fields) {
    if (visit[field] !== undefined && visit[field] !== null && visit[field] !== '') {
      return visit[field]
    }
  }
  return null
}

const temperatureValue = (visit) => {
  if (!visit) return null
  const value = visit.temperature ?? visit.body_temperature ?? visit.bodyTemperature
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

const temperatureDate = (visit) => firstDate(visit, [
  'visitDate', 'visit_date', 'recordedAt', 'recorded_at', 'timestamp', 'createdAt'
])

const consecutiveNormalTemperatureDays = (temperatureHistory) => {
  const observations = (temperatureHistory || [])
    .map((entry) => {
      const visit = unwrap(entry)
      const date = temperatureDate(visit)
      const value = temperatureValue(visit)
      return date && value != null
        ? { date: dateOnly(date), value }
        : null
    })
    .filter(Boolean)
    .sort((left, right) => right.date - left.date)

  const unique = []
  const seenDates = new Set()
  observations.forEach((observation) => {
    const key = observation.date.toISOString().slice(0, 10)
    if (!seenDates.has(key)) {
      seenDates.add(key)
      unique.push(observation)
    }
  })

  let count = 0
  for (let index = 0; index < unique.length; index += 1) {
    const observation = unique[index]
    const normal = observation.value >= NORMAL_TEMPERATURE_MIN &&
      observation.value <= NORMAL_TEMPERATURE_MAX
    if (!normal) break
    if (index > 0) {
      const previous = unique[index - 1]
      const days = (previous.date - observation.date) / DAY_MS
      if (days !== 1) break
    }
    count += 1
  }
  return count
}

const dateOnly = (value) => {
  const date = value instanceof Date ? value : new Date(value)
  if (!Number.isFinite(date.getTime())) return null
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

const correctedGestationalWeeks = ({ gestationalWeeks, birthDate, asOf }) => {
  const weeks = normalizeGestationalWeeks(gestationalWeeks)
  const birth = firstDate({ value: birthDate }, ['value'])
  const end = firstDate({ value: asOf }, ['value']) || new Date()
  if (!weeks || !birth) return weeks
  return weeks + Math.max(0, end.getTime() - birth.getTime()) / DAY_MS / 7
}

const deriveKmcEligibility = ({
  birthWeightGram,
  gestationalWeeks,
  birthDate,
  edd,
  outcome,
  recordedReasons = []
}) => {
  if (!isAliveOutcome(outcome)) {
    return { eligible: false, reasons: [], lowBirthWeight: false, preterm: false }
  }
  const weight = normalizeWeightGram(birthWeightGram)
  const weeks = normalizeGestationalWeeks(gestationalWeeks)
  const birth = firstDate({ value: birthDate }, ['value'])
  const due = firstDate({ value: edd }, ['value'])
  const lowBirthWeight = weight != null && weight < LOW_BIRTH_WEIGHT_GRAM
  const pretermByWeeks = weeks != null && weeks < 37
  const pretermByEdd = birth && due && (due.getTime() - birth.getTime()) / DAY_MS >= 21
  const preterm = Boolean(pretermByWeeks || pretermByEdd)
  const reasons = []
  if (lowBirthWeight || recordedReasons.includes('low_weight')) reasons.push('low_weight')
  if (preterm || recordedReasons.includes('preterm')) reasons.push('preterm')
  return {
    eligible: reasons.length > 0,
    reasons,
    lowBirthWeight: reasons.includes('low_weight'),
    preterm: reasons.includes('preterm'),
    birthWeightGram: weight,
    gestationalWeeks: weeks
  }
}

const deriveReadiness = ({
  reasons,
  latestWeightGram,
  correctedWeeks,
  feedingMethod,
  temperature,
  temperatureHistory = []
}) => {
  const lowBirthWeight = reasons.includes('low_weight')
  const preterm = reasons.includes('preterm')
  const weightReady = !lowBirthWeight || normalizeWeightGram(latestWeightGram) >= TARGET_WEIGHT_GRAM
  const gestationalAgeReady = !preterm || Number(correctedWeeks) >= 40
  const feeding = text(feedingMethod).replace(/_/g, ' ')
  const feedingReady = ['breastfeeding', 'bottle', 'bottle feeding'].includes(feeding)
  const temperatureNumber = Number(temperature)
  const temperatureDays = temperatureHistory.length
    ? consecutiveNormalTemperatureDays(temperatureHistory)
    : (Number.isFinite(temperatureNumber) &&
      temperatureNumber >= NORMAL_TEMPERATURE_MIN &&
      temperatureNumber <= NORMAL_TEMPERATURE_MAX ? 1 : 0)
  const temperatureReady = temperatureDays >= 3
  return {
    ready: Boolean((lowBirthWeight || preterm) &&
      weightReady && gestationalAgeReady && feedingReady && temperatureReady),
    weightReady,
    gestationalAgeReady,
    feedingReady,
    temperatureReady,
    temperatureDays,
    criteria: { lowBirthWeight, preterm }
  }
}

const resolveKmcCompletion = (actions, babyIndex) => {
  let completion = null
  ;(actions || []).map(unwrap).filter(Boolean).sort((left, right) =>
    (dateValue(left) || 0) - (dateValue(right) || 0)
  ).forEach((action) => {
    const index = Number(action.babyIndex || action.baby_index || 1)
    if (index !== Number(babyIndex || 1)) return
    const type = text(action.type)
    if (['reopened', 'kmc_reopened', 'unresolved', 'active'].includes(type)) {
      completion = null
    } else if (['resolved', 'completed', 'kmc_resolved'].includes(type)) {
      completion = action
    }
  })
  return completion
}

module.exports = {
  DAY_MS,
  LOW_BIRTH_WEIGHT_GRAM,
  TARGET_WEIGHT_GRAM,
  normalizeWeightGram,
  normalizeGestationalWeeks,
  isAliveOutcome,
  latestVisit,
  latestField,
  consecutiveNormalTemperatureDays,
  correctedGestationalWeeks,
  deriveKmcEligibility,
  deriveReadiness,
  resolveKmcCompletion
}
