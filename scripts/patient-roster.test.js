const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const vm = require('node:vm')

const rosterSource = fs.readFileSync(
  path.join(__dirname, '..', 'js', 'patient-roster.js'),
  'utf8'
)

function loadRoster() {
  const window = {}
  vm.runInNewContext(rosterSource, { window, Map, Promise, console })
  return window.PatientRoster
}

function createDatabase() {
  return {
    collection() {
      return {
        where(field, operator, value) {
          return { field, operator, value }
        }
      }
    }
  }
}

function snapshot(id, source) {
  return {
    _smartQuerySource: source,
    empty: false,
    forEach(callback) {
      callback({
        id,
        data: () => ({ id, name: `Patient ${id}` })
      })
    }
  }
}

test('patient roster uses cache-first reads and records the source', async () => {
  const roster = loadRoster()
  const optionsSeen = []
  const patients = await roster.loadMidwifePatients(
    createDatabase(),
    'provider-1',
    async (query, options) => {
      optionsSeen.push(options)
      return snapshot(`patient-${optionsSeen.length}`, 'cache')
    },
    { preferCache: true, cacheFirst: true, timeout: 5000, retries: 1 }
  )

  assert.equal(patients.length, 3)
  assert.equal(patients._smartQuerySource, 'cache')
  assert.equal(optionsSeen.length, 3)
  assert.ok(optionsSeen.every((options) => options.preferCache === true))
  assert.ok(optionsSeen.every((options) => options.cacheFirst === true))
})

test('patient roster deduplicates concurrent loads for the same provider and mode', async () => {
  const roster = loadRoster()
  let readCount = 0
  let release
  const gate = new Promise((resolve) => { release = resolve })
  const readQuery = async () => {
    readCount += 1
    await gate
    return snapshot(`patient-${readCount}`, 'server')
  }

  const first = roster.loadMidwifePatients(
    createDatabase(),
    'provider-2',
    readQuery,
    { preferCache: false }
  )
  const second = roster.loadMidwifePatients(
    createDatabase(),
    'provider-2',
    readQuery,
    { preferCache: false }
  )

  release()
  const [patients, secondPatients] = await Promise.all([first, second])
  assert.equal(readCount, 3)
  assert.equal(patients._smartQuerySource, 'server')
  assert.equal(secondPatients._smartQuerySource, 'server')
})
