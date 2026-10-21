(function (window) {
  'use strict'

  const PatientRoster = {
    ownershipQueries(db, uid) {
      if (!db || !uid) return []
      return [
        db.collection('patients').where('created_by', '==', uid),
        db.collection('patients').where('createdBy', '==', uid),
        db.collection('patients').where('care_team_midwife_ids', 'array-contains', uid)
      ]
    },

    async loadMidwifePatients(db, uid, readQuery) {
      if (!db || !uid || typeof readQuery !== 'function') return []

      const patientMap = new Map()
      const snapshots = await Promise.all(
        PatientRoster.ownershipQueries(db, uid).map(function (query) {
          return readQuery(query).catch(function (error) {
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

      return Array.from(patientMap.values())
    }
  }

  window.PatientRoster = PatientRoster
})(window)
