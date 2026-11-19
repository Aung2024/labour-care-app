#!/usr/bin/env node
'use strict'

/**
 * Extracts the latest saved activity for every configured Pyinmana/Tatkon
 * facility. Activity is attributed to the facility that owns the patient
 * through the creating Midwife account, including linked newborn records.
 *
 * Usage:
 *   node scripts/export-facility-activity.js [output.csv]
 *
 * Authentication uses the existing Firebase CLI login.
 */

const fs = require('node:fs')
const path = require('node:path')
const { createRequire } = require('node:module')
const { initializeFirestore, loadData, isPilotFacilityCode } =
  require('./export-facility-application-data')
const { FacilityConfig } = require('../js/facility-config.js')

const FUNCTIONS_REQUIRE = createRequire(path.join(__dirname, '..', 'functions', 'package.json'))
const PROJECT_ID = 'mnch-1cbda'
const DEFAULT_OUTPUT = path.join(
  __dirname,
  '..',
  'docs',
  `Facility activity - ${new Date().toISOString().slice(0, 10)}.csv`,
)

const ACTIVITY_FIELDS = [
  'updatedAt',
  'updated_at',
  'lastUpdated',
  'last_updated',
  'createdAt',
  'created_at',
  'timestamp',
  'recordedAt',
  'recorded_at',
  'visitDate',
  'visit_date',
  'serviceDate',
  'service_date',
  'birth_time',
  'birthTime',
]

const asDate = (value) => {
  if (!value) return null
  if (typeof value.toDate === 'function') {
    const date = value.toDate()
    return Number.isNaN(date.getTime()) ? null : date
  }
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

const latestDateFromData = (data) => {
  if (!data || typeof data !== 'object') return null
  for (const field of ACTIVITY_FIELDS) {
    const date = asDate(data[field])
    if (date) return date
  }
  return null
}

const addActivity = (activityByFacility, facilityCode, data, source) => {
  if (!isPilotFacilityCode(facilityCode)) return
  const date = latestDateFromData(data)
  if (!date) return

  const current = activityByFacility.get(facilityCode)
  if (!current || date > current.date) {
    activityByFacility.set(facilityCode, { date, source })
  }
}

const addEntries = (activityByFacility, facilityCode, entries, source) => {
  ;(entries || []).forEach((entry) => {
    addActivity(activityByFacility, facilityCode, entry.data || entry, source)
  })
}

const getFacilityActivity = (data) => {
  const activityByFacility = new Map()

  data.patients.forEach((patient, patientId) => {
    const facilityCode = patient.facilityCode
    addActivity(activityByFacility, facilityCode, patient.data, 'Patient registration')
    addEntries(activityByFacility, facilityCode, data.antenatalVisits.get(patientId), 'ANC')
    addEntries(activityByFacility, facilityCode, data.postpartumVisits.get(patientId), 'PNC')
    addEntries(activityByFacility, facilityCode, data.tests.get(patientId), 'Laboratory')
    addEntries(activityByFacility, facilityCode, data.records.get(patientId), 'Patient record')
    addEntries(activityByFacility, facilityCode, data.labourCare.get(patientId), 'Labour care')
    addEntries(activityByFacility, facilityCode, data.newbornCare.get(patientId), 'Newborn care')
    addEntries(
      activityByFacility,
      facilityCode,
      data.immediateNewbornCare.get(patientId),
      'Immediate newborn care',
    )
    addEntries(activityByFacility, facilityCode, data.kmcActions.get(patientId), 'KMC')

    const linkedBabyIds = data.linkedBabyIds.get(patientId) || new Set()
    linkedBabyIds.forEach((babyId) => {
      addEntries(activityByFacility, facilityCode, data.newbornCare.get(babyId), 'Linked newborn care')
      addEntries(
        activityByFacility,
        facilityCode,
        data.immediateNewbornCare.get(babyId),
        'Linked immediate newborn care',
      )
      addEntries(activityByFacility, facilityCode, data.kmcActions.get(babyId), 'Linked KMC')
    })
  })

  return activityByFacility
}

const csvCell = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`

const buildRows = (activityByFacility, asOf) => {
  return FacilityConfig.getFacilities()
    .filter((facility) => isPilotFacilityCode(facility.code))
    .map((facility, index) => {
      const activity = activityByFacility.get(facility.code)
      const latestActivity = activity ? activity.date.toISOString() : ''
      const ageDays = activity
        ? Math.max(0, Math.floor((asOf - activity.date) / 86400000))
        : ''
      const status = !activity
        ? 'No recorded activity'
        : ageDays <= 30
          ? 'Active (last 30 days)'
          : ageDays <= 90
            ? 'Needs follow-up (31–90 days)'
            : 'Inactive (over 90 days)'

      return {
        number: index + 1,
        township: facility.township || '',
        facilityCode: facility.code,
        facilityName: facility.name_en,
        latestActivity,
        daysSinceActivity: ageDays,
        status,
        activitySource: activity ? activity.source : '',
      }
    })
}

const writeCsv = (outputPath, rows, asOf) => {
  const headers = [
    'No.',
    'Township',
    'Facility code',
    'Health facility',
    'Latest activity date (UTC)',
    'Days since activity',
    'Status',
    'Latest activity source',
  ]
  const lines = [
    `Project: ${PROJECT_ID}`,
    `As of: ${asOf.toISOString()}`,
    '',
    headers.map(csvCell).join(','),
    ...rows.map((row) => [
      row.number,
      row.township,
      row.facilityCode,
      row.facilityName,
      row.latestActivity,
      row.daysSinceActivity,
      row.status,
      row.activitySource,
    ].map(csvCell).join(',')),
  ]
  fs.writeFileSync(outputPath, `${lines.join('\n')}\n`, 'utf8')
}

const main = async () => {
  const outputPath = path.resolve(process.argv[2] || DEFAULT_OUTPUT)
  const asOf = new Date()
  const { db, cleanup } = await initializeFirestore()

  try {
    const data = await loadData(db)
    const rows = buildRows(getFacilityActivity(data), asOf)
    writeCsv(outputPath, rows, asOf)
    console.log(`Wrote ${rows.length} facility rows to ${outputPath}`)
    console.log(`Facilities with recorded activity: ${rows.filter((row) => row.latestActivity).length}`)
  } finally {
    cleanup()
    delete process.env.GOOGLE_APPLICATION_CREDENTIALS
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Facility activity export failed:', error && error.stack ? error.stack : error)
    process.exitCode = 1
  })
}

module.exports = {
  asDate,
  latestDateFromData,
  getFacilityActivity,
  buildRows,
}
