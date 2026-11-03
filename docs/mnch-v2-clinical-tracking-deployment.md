# MNCH V2 clinical and tracking deployment

Dashboard V2 remains held until its indicators are approved. Do not deploy
`startDashboardV2Rebuild`, `dashboardV2ReconciliationWorker`, or
`combinedAnalyticsReconciliation` as part of this rollout.

## 1. Pre-deployment checks

From `functions/`:

```bash
npm test
npm run test:rules
npm run test:integration
```

Confirm the facility-code taxonomy with the programme team before production
backfill, especially codes `001`, `004`, `007`, and `023`.

## 2. Deploy indexes and rules

From the repository root:

```bash
firebase deploy --only firestore:indexes,firestore:rules --project mnch-1cbda
```

Wait until the tracking and daily-leaderboard indexes report `Enabled` in the
Firebase console.

## 3. Deploy only approved functions

```bash
firebase deploy --only \
functions:startLeaderboardRebuild,\
functions:getLeaderboardCustomRange,\
functions:leaderboardNightlyReconciliation,\
functions:leaderboardReconciliationWorker,\
functions:queryHrtTracking,\
functions:queryKmcTracking,\
functions:startTrackingProjectionRepair,\
functions:trackingProjectionRepairWorker,\
functions:trackingWeeklyReconciliation,\
functions:trackingRefreshQueueWorker,\
functions:leaderboardDailyRefreshWorker \
--project mnch-1cbda
```

Do not deploy Firestore document triggers. The database is in `asia-southeast3`,
which cannot host those triggers. Clinical pages write patient IDs to two
offline-safe refresh queues instead. HRT/KMC projection updates run within five
minutes; Leaderboard queue processing runs daily. Leave the existing production
leaderboard document triggers in place until Google supports this region; they
continue the previous scoring until a Super Admin rebuild is started.

## 4. Backfill

Use a Super Admin session to call `startTrackingProjectionRepair`. Monitor:

- `tracking_v2_jobs/tracking-projection-repair`
- `tracking_v2_hrt`
- `tracking_v2_kmc`

Then use the Super Admin Leaderboard rebuild button. It rebuilds all-time,
five yearly periods, the latest twelve months, and daily achievement summaries
used by custom date ranges. Monitor:

- `leaderboard_v2_jobs/leaderboard-v2-rebuild`
- `leaderboard_v2_months`
- `leaderboard_v3_daily`

Do not start another rebuild while either job is running.

## 5. Frontend rollout and UAT

Deploy the static application only after both backfills complete. Validate
Provider, TMO, Regional, Central, and Super Admin accounts on phone, tablet,
and desktop. Verify role scope, multi-select facility filters, HRT/KMC
completion sources, Delivery Note locking, newborn Visit 1, ANC offline
carry-forward, and positive infection alerts.

Rollback the frontend feature readers first if needed. Derived collections are
server-written and can remain in place while the legacy readers are restored.
