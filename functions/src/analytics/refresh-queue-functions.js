'use strict';

const admin = require('firebase-admin');
const { FieldPath } = require('firebase-admin/firestore');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { loadPatientActivity } = require('../leaderboard/repository');
const { recomputeLoadedPatientMonths } = require('../leaderboard/service');
const { ALL_TIME_PERIOD, monthKeyForDate } = require('../leaderboard/scoring');
const { recomputePatientProjections } = require('./tracking-repository');

const REGION = 'us-central1';
const TRACKING_QUEUE = 'tracking_v2_refresh_queue';
const LEADERBOARD_QUEUE = 'leaderboard_v3_refresh_queue';

async function mapInChunks(items, size, worker) {
  for (let offset = 0; offset < items.length; offset += size) {
    await Promise.all(items.slice(offset, offset + size).map(worker));
  }
}

async function processTrackingRefreshBatch(database, now) {
  const db = database || admin.firestore();
  const snapshot = await db.collection(TRACKING_QUEUE)
    .orderBy(FieldPath.documentId()).limit(50).get();
  await mapInChunks(snapshot.docs, 5, async (queued) => {
    await recomputePatientProjections(db, queued.id, { asOf: now || new Date() });
    await queued.ref.delete();
  });
  return { processed: snapshot.size, remainingPossible: snapshot.size === 50 };
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
    const date = now || new Date();
    const month = monthKeyForDate(date);
    const periods = [ALL_TIME_PERIOD, month, month.slice(0, 4)];
    await mapInChunks(snapshot.docs, 5, async (queued) => {
      const loaded = await loadPatientActivity(db, queued.id);
      await recomputeLoadedPatientMonths(db, queued.id, periods, loaded);
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
  processTrackingRefreshBatch,
  processLeaderboardRefreshQueue,
  trackingRefreshQueueWorker,
  leaderboardDailyRefreshWorker
};
