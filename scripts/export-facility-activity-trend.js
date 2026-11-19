#!/usr/bin/env node
'use strict'

const fs = require('node:fs')
const path = require('node:path')
const {
  initializeFirestore,
  loadData,
  isPilotFacilityCode,
} = require('./export-facility-application-data')
const { FacilityConfig } = require('../js/facility-config.js')

const ROOT = path.resolve(__dirname, '..')
const PROJECT_ID = 'mnch-1cbda'
const YANGON_TIME_ZONE = 'Asia/Yangon'
const ACTIVITY_FIELDS = [
  'updatedAt', 'updated_at', 'lastUpdated', 'last_updated',
  'createdAt', 'created_at', 'timestamp', 'recordedAt', 'recorded_at',
  'visitDate', 'visit_date', 'serviceDate', 'service_date',
  'birth_time', 'birthTime',
]

const currentMonthKey = () => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: YANGON_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date())
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}`
}

const monthRange = (endMonth, count) => {
  const [year, month] = endMonth.split('-').map(Number)
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(Date.UTC(year, month - 1 - (count - 1 - index), 1))
    return date.toISOString().slice(0, 7)
  })
}

const asDate = (value) => {
  if (!value) return null
  if (typeof value.toDate === 'function') {
    const date = value.toDate()
    return Number.isNaN(date.getTime()) ? null : date
  }
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

const activityDate = (data) => {
  if (!data || typeof data !== 'object') return null
  for (const field of ACTIVITY_FIELDS) {
    const date = asDate(data[field])
    if (date) return date
  }
  return null
}

const monthKey = (date) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: YANGON_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(date)
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}`
}

const addEvent = (eventsByFacility, facilityCode, data, source, months) => {
  if (!isPilotFacilityCode(facilityCode)) return
  const date = activityDate(data)
  if (!date) return
  const month = monthKey(date)
  if (!months.includes(month)) return
  if (!eventsByFacility.has(facilityCode)) eventsByFacility.set(facilityCode, [])
  eventsByFacility.get(facilityCode).push({ date, month, source })
}

const addEntries = (eventsByFacility, facilityCode, entries, source, months) => {
  ;(entries || []).forEach((entry) => {
    addEvent(eventsByFacility, facilityCode, entry.data || entry, source, months)
  })
}

const collectTrendEvents = (data, months) => {
  const eventsByFacility = new Map()
  data.patients.forEach((patient, patientId) => {
    const facilityCode = patient.facilityCode
    addEvent(eventsByFacility, facilityCode, patient.data, 'Patient registration', months)
    addEntries(eventsByFacility, facilityCode, data.antenatalVisits.get(patientId), 'ANC', months)
    addEntries(eventsByFacility, facilityCode, data.postpartumVisits.get(patientId), 'PNC', months)
    addEntries(eventsByFacility, facilityCode, data.tests.get(patientId), 'Laboratory', months)
    addEntries(eventsByFacility, facilityCode, data.records.get(patientId), 'Patient record', months)
    addEntries(eventsByFacility, facilityCode, data.labourCare.get(patientId), 'Labour care', months)
    addEntries(eventsByFacility, facilityCode, data.newbornCare.get(patientId), 'Newborn care', months)
    addEntries(eventsByFacility, facilityCode, data.immediateNewbornCare.get(patientId), 'Immediate newborn care', months)
    addEntries(eventsByFacility, facilityCode, data.kmcActions.get(patientId), 'KMC', months)

    const linkedBabyIds = data.linkedBabyIds.get(patientId) || new Set()
    linkedBabyIds.forEach((babyId) => {
      addEntries(eventsByFacility, facilityCode, data.newbornCare.get(babyId), 'Linked newborn care', months)
      addEntries(eventsByFacility, facilityCode, data.immediateNewbornCare.get(babyId), 'Linked immediate newborn care', months)
      addEntries(eventsByFacility, facilityCode, data.kmcActions.get(babyId), 'Linked KMC', months)
    })
  })
  return eventsByFacility
}

const csvCell = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`

const buildRows = (data, months) => {
  const eventsByFacility = collectTrendEvents(data, months)
  return FacilityConfig.getFacilities()
    .filter((facility) => isPilotFacilityCode(facility.code))
    .map((facility, index) => {
      const events = eventsByFacility.get(facility.code) || []
      const counts = Object.fromEntries(months.map((month) => [
        month,
        events.filter((event) => event.month === month).length,
      ]))
      const latest = events.slice().sort((left, right) => right.date - left.date)[0]
      return {
        number: index + 1,
        township: facility.township || '',
        facilityCode: facility.code,
        facilityName: facility.name_en,
        counts,
        activeMonths: months.filter((month) => counts[month] > 0).length,
        latestActivity: latest ? latest.date.toISOString() : '',
        latestSource: latest ? latest.source : '',
      }
    })
}

const writeCsv = (outputPath, rows, months, asOf) => {
  const headers = [
    'No.', 'Township', 'Facility code', 'Health facility',
    ...months.map((month) => `${month} activity records`),
    'Active months (of 6)', 'Latest activity date (UTC)', 'Latest activity source',
  ]
  const lines = [
    `Project: ${PROJECT_ID}`,
    `As of: ${asOf.toISOString()}`,
    'Activity count means saved registration or clinical records attributed to the facility.',
    '',
    headers.map(csvCell).join(','),
    ...rows.map((row) => [
      row.number,
      row.township,
      row.facilityCode,
      row.facilityName,
      ...months.map((month) => row.counts[month]),
      row.activeMonths,
      row.latestActivity,
      row.latestSource,
    ].map(csvCell).join(',')),
  ]
  fs.writeFileSync(outputPath, `${lines.join('\n')}\n`, 'utf8')
}

const main = async () => {
  const asOf = new Date()
  const months = monthRange(currentMonthKey(), 6)
  const outputPath = path.join(
    ROOT,
    'docs',
    `Facility activity monthly trend - ${asOf.toISOString().slice(0, 10)}.csv`,
  )
  const { db, cleanup } = await initializeFirestore()
  try {
    const data = await loadData(db)
    const rows = buildRows(data, months)
    writeCsv(outputPath, rows, months, asOf)
    console.log(`Wrote ${rows.length} facility rows to ${outputPath}`)
    console.log(`Months: ${months.join(', ')}`)
  } finally {
    cleanup()
    delete process.env.GOOGLE_APPLICATION_CREDENTIALS
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Facility activity trend export failed:', error.stack || error)
    process.exitCode = 1
  })
}

module.exports = {
  activityDate,
  monthRange,
  buildRows,
}
