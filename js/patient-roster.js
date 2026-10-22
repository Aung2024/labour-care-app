(function (window) {
  'use strict'

  const inFlightLoads = new Map()

  function querySource(snapshot) {
    return snapshot && snapshot._smartQuerySource
      ? snapshot._smartQuerySource
      : 'unknown'
  }

  function markRosterSource(patients, snapshots) {
    const sources = snapshots.map(querySource)
    const source = sources.includes('server')
      ? 'server'
      : sources.includes('cache')
        ? 'cache'
        : 'failed'
    try {
      Object.defineProperty(patients, '_smartQuerySource', {
        value: source,
        configurable: true,
        enumerable: false
      })
    } catch (error) {
      patients._smartQuerySource = source
    }
    return patients
  }

  const PatientRoster = {
    ownershipQueries(db, uid) {
      if (!db || !uid) return []
      return [
        db.collection('patients').where('created_by', '==', uid),
        db.collection('patients').where('createdBy', '==', uid),
        db.collection('patients').where('care_team_midwife_ids', 'array-contains', uid)
      ]
    },

    async loadMidwifePatients(db, uid, readQuery, options = {}) {
      if (!db || !uid || typeof readQuery !== 'function') return []

      const preferCache = options.preferCache === true
      const loadKey = `${uid}:${preferCache ? 'cache-first' : 'server'}`
      if (inFlightLoads.has(loadKey)) return inFlightLoads.get(loadKey)

      const load = (async function () {
      const patientMap = new Map()
      const snapshots = await Promise.all(
        PatientRoster.ownershipQueries(db, uid).map(function (query) {
          return readQuery(query, {
            preferCache,
            cacheFirst: options.cacheFirst === true,
            timeout: options.timeout || 5000,
            retries: Number.isInteger(options.retries) ? options.retries : 1,
            fallbackToCache: options.fallbackToCache !== false
          }).catch(function (error) {
            console.warn('Patient ownership query failed:', error)
            return null
          })
        })
      )

      snapshots.forEach(function (snapshot) {
        if (!snapshot || typeof snapshot.forEach !== 'function' || snapshot.empty) return
        snapshot.forEach(function (doc) {
          if (!doc || !doc.id || typeof doc.data !== 'function' || patientMap.has(doc.id)) return
          patientMap.set(doc.id, { id: doc.id, ...doc.data() })
        })
      })

      return markRosterSource(Array.from(patientMap.values()), snapshots)
      })()

      inFlightLoads.set(loadKey, load)
      try {
        return await load
      } finally {
        inFlightLoads.delete(loadKey)
      }
    }
  }

  window.PatientRoster = PatientRoster
})(window)
