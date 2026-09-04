'use strict';

const admin = require('firebase-admin');
const { FieldPath } = require('firebase-admin/firestore');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { loadPatientActivity } = require('../leaderboard/repository');
const { recomputeLoadedPatientMonths } = require('../leaderboard/service');
const {
  buildPatientAchievements,
  monthKeyForDate
} = require('../leaderboard/scoring');
const { eventMonths, periodsWithAllTime } = require('../leaderboard/functions');
const { recomputePatientProjections } = require('./tracking-repository');
const { recomputeLoadedPatientQualityMonths } = require('../quality/service');

const REGION = 'us-central1';
const TRACKING_QUEUE = 'tracking_v2_refresh_queue';
const LEADERBOARD_QUEUE = 'leaderboard_v3_refresh_queue';

async function mapInChunks(items, size, worker) {
  for (let offset = 0; offset < items.length; offset += size) {
    await Promise.all(items.slice(offset, offset + size).map(worker));
  }
}

function snapshotLike(data) {
  return {
    exists: Boolean(data && typeof data === 'object'),
    data: () => data || {}
  };
}

function periodsForLoadedPatient(loaded, now) {
  const patient = loaded && loaded.patient;
  const activity = loaded && loaded.activity || {};
  const months = new Set();
  const addDataMonths = (data) => {
    eventMonths(null, snapshotLike(data), { fallbackToCurrent: false })
      .forEach((month) => months.add(month));
  };

  if (patient) addDataMonths(patient);
  Object.values(activity).forEach((value) => {
    if (Array.isArray(value)) value.forEach(addDataMonths);
    else if (value) addDataMonths(value);
  });
  buildPatientAchievements(patient || {}, activity).forEach((achievement) => {
    const month = monthKeyForDate(achievement.achievedAt);
    if (month) months.add(month);
  });
  if (!months.size) months.add(monthKeyForDate(now || new Date()));
  return periodsWithAllTime(Array.from(months));
}

async function processTrackingRefreshBatch(database, now, options) {
  const db = database || admin.firestore();
  const started = Date.now();
  const maxRuntimeMs = Number(options && options.maxRuntimeMs || 480000);
  let processed = 0;
  let failed = 0;
  let keepGoing = true;
  while (keepGoing && Date.now() - started < maxRuntimeMs) {
    const snapshot = await db.collection(TRACKING_QUEUE)
      .orderBy(FieldPath.documentId()).limit(50).get();
    if (snapshot.empty) break;
    for (let offset = 0; offset < snapshot.docs.length; offset += 5) {
      const results = await Promise.all(snapshot.docs.slice(offset, offset + 5)
        .map(async (queued) => {
          try {
            await recomputePatientProjections(
              db, queued.id, { asOf: now || new Date() }
            );
            await queued.ref.delete();
            return true;
          } catch (error) {
            console.error('Tracking refresh failed', queued.id, error);
            return false;
          }
        }));
      processed += results.filter(Boolean).length;
      failed += results.filter((result) => !result).length;
    }
    // Avoid retrying a poison item in a hot loop. Other items in its batch
    // still complete, and the failed item is retried on the next schedule.
    keepGoing = snapshot.size === 50 && failed === 0;
  }
  return { processed, failed, remainingPossible: keepGoing || failed > 0 };
}

async function processLeaderboardRefreshQueue(database, now, options) {
  const db = database || admin.firestore();
  const started = Date.now();
  const maxRuntimeMs = Number(options && options.maxRuntimeMs || 480000);
  let processed = 0;
  let keepGoing = true;
  while (keepGoing && Date.now() - started < maxRuntimeMs) {
    const snapshot = await db.collection(LEADERBOARD_QUEUE)
      .orderBy(FieldPath.documentId()).limit(100).get();
    if (snapshot.empty) break;
    await mapInChunks(snapshot.docs, 5, async (queued) => {
      const loaded = await loadPatientActivity(db, queued.id);
      const periods = new Set(periodsForLoadedPatient(loaded, now));
      const existing = await db.collection('leaderboard_v2_contributions')
        .where('patientId', '==', queued.id).get();
      existing.forEach((doc) => {
        const month = doc.data() && doc.data().month;
        if (month) periodsWithAllTime([month]).forEach((period) => periods.add(period));
      });
      await recomputeLoadedPatientMonths(db, queued.id, Array.from(periods), loaded);
      const qualityMonths = Array.from(periods).filter((period) =>
        period === 'all' || /^\d{4}-\d{2}$/.test(period)
      );
      await recomputeLoadedPatientQualityMonths(db, queued.id, qualityMonths, loaded, now);
      await queued.ref.delete();
    });
    processed += snapshot.size;
    keepGoing = snapshot.size === 100;
  }
  return { processed, remainingPossible: keepGoing };
}

const trackingRefreshQueueWorker = onSchedule({
  schedule: 'every 5 minutes',
  timeZone: 'Asia/Yangon',
  region: REGION,
  timeoutSeconds: 540,
  memory: '512MiB',
  maxInstances: 1,
  concurrency: 1
}, () => processTrackingRefreshBatch());

const leaderboardDailyRefreshWorker = onSchedule({
  schedule: 'every 24 hours',
  timeZone: 'Asia/Yangon',
  region: REGION,
  timeoutSeconds: 540,
  memory: '1GiB',
  maxInstances: 1,
  concurrency: 1
}, () => processLeaderboardRefreshQueue());

module.exports = {
  TRACKING_QUEUE,
  LEADERBOARD_QUEUE,
  periodsForLoadedPatient,
  processTrackingRefreshBatch,
  processLeaderboardRefreshQueue,
  trackingRefreshQueueWorker,
  leaderboardDailyRefreshWorker
};
