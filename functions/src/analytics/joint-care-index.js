'use strict'

const admin = require('firebase-admin')
const { FieldValue, Timestamp } = require('firebase-admin/firestore')
const { onSchedule } = require('firebase-functions/v2/scheduler')

const REGION = 'us-central1'
const JOINT_CARE_INDEX_COLLECTION = 'joint_care_patient_index'
const CLINICAL_REFRESH_QUEUE = 'clinical_refresh_v1_queue'
const JOINT_CARE_REFRESH_JOB = 'joint-care-index-refresh'
const JOINT_CARE_REFRESH_OVERLAP_MS = 60 * 1000

const isActiveLink = (data) =>
  String(data && data.status || '').trim().toLowerCase() === 'active'

const normalizedProviders = (value) => Array.from(new Set(
  (Array.isArray(value) ? value : []).filter(Boolean).map(String)
)).sort()

const jointCareIndexRef = (db, patientId) =>
  db.collection(JOINT_CARE_INDEX_COLLECTION).doc(String(patientId))

const isJointCareLinkDocument = (doc) => {
  const segments = String(doc && doc.ref && doc.ref.path || '').split('/')
  return segments.length === 4 &&
    segments[0] === 'joint_care_links' &&
    segments[2] === 'patients'
}

const enqueueJointCareRefresh = (db, patientId) =>
  db.collection(CLINICAL_REFRESH_QUEUE).doc(String(patientId)).set({
    patientId: String(patientId),
    reason: 'joint_care_link',
    sourcePath: 'joint_care_index_refresh',
    status: 'pending',
    requestedAt: FieldValue.serverTimestamp(),
    attempts: FieldValue.increment(1)
  }, { merge: true })

const updateJointCareIndex = async (
  database,
  patientId,
  providerId,
  before,
  after
) => {
  if (!patientId || !providerId) return { changed: false }
  const db = database || admin.firestore()
  const beforeActive = isActiveLink(before)
  const afterActive = isActiveLink(after)
  if (beforeActive === afterActive) return { changed: false }
  const ref = jointCareIndexRef(db, patientId)
  const activeProviderIds = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref)
    const current = normalizedProviders(
      snapshot.exists ? snapshot.get('activeProviderIds') : []
    )
    const providers = new Set(current)
    if (afterActive) providers.add(String(providerId))
    else providers.delete(String(providerId))
    const next = Array.from(providers).sort()
    if (next.length) {
      transaction.set(ref, {
        patientId: String(patientId),
        activeProviderIds: next,
        activeLinkCount: next.length,
        status: 'active',
        updatedAt: FieldValue.serverTimestamp()
      }, { merge: false })
    } else {
      transaction.delete(ref)
    }
    return next
  })
  await enqueueJointCareRefresh(db, patientId)
  return { changed: true, activeProviderIds }
}

const rebuildJointCareIndex = async (database) => {
  const db = database || admin.firestore()
  const [activeLinks, existing] = await Promise.all([
    db.collectionGroup('patients').get(),
    db.collection(JOINT_CARE_INDEX_COLLECTION).get()
  ])
  const byPatient = new Map()
  let activeLinkCount = 0
  activeLinks.docs.forEach((doc) => {
    if (!isJointCareLinkDocument(doc)) return
    const data = doc.data() || {}
    if (!isActiveLink(data)) return
    activeLinkCount += 1
    const patientId = String(data.patientId || doc.id || '')
    const providerId = String(
      data.linkedMidwifeId ||
      doc.ref.parent && doc.ref.parent.parent && doc.ref.parent.parent.id ||
      ''
    )
    if (!patientId || !providerId) return
    if (!byPatient.has(patientId)) byPatient.set(patientId, new Set())
    byPatient.get(patientId).add(providerId)
  })

  const writer = db.bulkWriter()
  existing.docs.forEach((doc) => {
    if (!byPatient.has(doc.id)) writer.delete(doc.ref)
  })
  byPatient.forEach((providers, patientId) => {
    const activeProviderIds = Array.from(providers).sort()
    writer.set(jointCareIndexRef(db, patientId), {
      patientId,
      activeProviderIds,
      activeLinkCount: activeProviderIds.length,
      status: 'active',
      rebuiltAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    })
  })
  await writer.close()
  return {
    activeLinks: activeLinkCount,
    indexedPatients: byPatient.size,
    removedStaleDocuments: existing.docs.filter((doc) =>
      !byPatient.has(doc.id)
    ).length
  }
}

const refreshChangedJointCareIndex = async (database, now) => {
  const db = database || admin.firestore()
  const jobRef = db.collection('analytics_v31_jobs').doc(JOINT_CARE_REFRESH_JOB)
  const job = await jobRef.get()
  const currentMillis = now instanceof Date
    ? now.getTime()
    : Number(now || Date.now())
  if (!job.exists || !Number(job.get('lastScannedAtMillis') || 0)) {
    const rebuilt = await rebuildJointCareIndex(db)
    await jobRef.set({
      lastScannedAtMillis: currentMillis,
      updatedAt: FieldValue.serverTimestamp(),
      lastResult: rebuilt
    }, { merge: true })
    return { mode: 'full', ...rebuilt }
  }

  const sinceMillis = Math.max(
    0,
    Number(job.get('lastScannedAtMillis')) - JOINT_CARE_REFRESH_OVERLAP_MS
  )
  const changedLinks = await db.collectionGroup('patients')
    .where('updatedAt', '>', Timestamp.fromMillis(sinceMillis))
    .orderBy('updatedAt')
    .limit(2000)
    .get()
  const patientIds = Array.from(new Set(changedLinks.docs
    .filter(isJointCareLinkDocument)
    .map((doc) => String((doc.data() || {}).patientId || doc.id))
    .filter(Boolean)))
  let changedPatients = 0

  for (const patientId of patientIds) {
    const links = await db.collectionGroup('patients')
      .where('patientId', '==', patientId)
      .get()
    const providers = normalizedProviders(links.docs
      .filter((doc) => isJointCareLinkDocument(doc) && isActiveLink(doc.data()))
      .map((doc) => String(
        (doc.data() || {}).linkedMidwifeId ||
        doc.ref.parent.parent && doc.ref.parent.parent.id ||
        ''
      ))
      .filter(Boolean))
    const ref = jointCareIndexRef(db, patientId)
    const previous = await ref.get()
    const previousProviders = normalizedProviders(
      previous.exists ? previous.get('activeProviderIds') : []
    )
    if (JSON.stringify(previousProviders) === JSON.stringify(providers)) continue
    if (providers.length) {
      await ref.set({
        patientId,
        activeProviderIds: providers,
        activeLinkCount: providers.length,
        status: 'active',
        updatedAt: FieldValue.serverTimestamp()
      }, { merge: false })
    } else {
      await ref.delete()
    }
    await enqueueJointCareRefresh(db, patientId)
    changedPatients += 1
  }

  await jobRef.set({
    lastScannedAtMillis: currentMillis,
    updatedAt: FieldValue.serverTimestamp(),
    lastResult: {
      scannedLinks: changedLinks.size,
      affectedPatients: patientIds.length,
      changedPatients
    }
  }, { merge: true })
  return {
    mode: 'incremental',
    scannedLinks: changedLinks.size,
    affectedPatients: patientIds.length,
    changedPatients
  }
}

const jointCareIndexRefreshWorker = onSchedule({
  schedule: 'every 5 minutes',
  timeZone: 'Asia/Yangon',
  region: REGION,
  timeoutSeconds: 540,
  memory: '512MiB',
  maxInstances: 1,
  concurrency: 1
}, async () => refreshChangedJointCareIndex(
  admin.firestore(),
  new Date()
))

module.exports = {
  JOINT_CARE_INDEX_COLLECTION,
  isActiveLink,
  normalizedProviders,
  jointCareIndexRef,
  updateJointCareIndex,
  rebuildJointCareIndex,
  refreshChangedJointCareIndex,
  jointCareIndexRefreshWorker
}
