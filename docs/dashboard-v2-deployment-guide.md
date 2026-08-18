# Dashboard V2 backend deployment

Dashboard V2 replaces browser-side patient fan-out with aggregate-only,
role-scoped summaries. Custom date ranges keep the legacy calculation as a
temporary fallback.

## Data contract

- Schema version: see `functions/src/analytics/metrics.js`.
- Patient contributions: `analytics_v2_contributions/{period}_{patientId}`.
- Readable summaries: `analytics_v2_periods/{period}/scopes/{scopeType}:{scopeId}`.
- Resumable job: `analytics_v2_jobs/dashboard-v2-rebuild`.
- Periods: `all`, current `YYYY-MM`, current `YYYY-QN`, and current `YYYY`.
- Summary documents contain aggregate counts and series only. Patient names,
  identifiers, and clinical fields are not exposed in summaries.

## Safety gate

Do not deploy the analytics job functions while
`leaderboard_v2_jobs/leaderboard-v2-rebuild` has `status: "running"`. Wait for
`status: "complete"` so both workers cannot compete for the Bangkok Firestore
read budget.

## Test

From `functions/`:

```bash
npm test
npm run test:rules
npm run test:integration
```

The synthetic metric fixtures cover all dashboard metric families. Rules tests
verify Midwife, TMO, Regional Officer, Central/Super Admin boundaries and deny
all browser writes plus contribution/job reads.

## Preview deployment

1. Use a non-production Firebase project or emulator and run one synthetic
   backfill.
2. Deploy the site to a Netlify branch preview with
   `features.dashboardV2: true` in `firebase.runtime-config.json`.
3. Verify phone (~375 px), tablet (~768 px), desktop, iOS Safari, and installed
   PWA refresh behavior. Static changes use service-worker cache
   `mch-care-v260-moh`.

## Production deployment

Deploy only additive rules/indexes and the named functions:

```bash
firebase deploy --only firestore:rules,firestore:indexes --project mnch-1cbda
firebase deploy --only functions:startDashboardV2Rebuild,functions:dashboardV2ReconciliationWorker,functions:combinedAnalyticsReconciliation,functions:leaderboardNightlyReconciliation --project mnch-1cbda
```

Firestore is in `asia-southeast3`, where Eventarc-backed second-generation
Firestore document triggers are unavailable. Dashboard V2 therefore uses a
queue-only callable, a 15-minute checkpoint worker, and a 72-hour combined
reconciliation in `us-central1`. The updated legacy leaderboard 72-hour
schedule only continues an already-running legacy job; it no longer starts a
second country-wide scan.

## Backfill and monitoring

1. A Super Admin calls `startDashboardV2Rebuild` once.
2. Monitor `analytics_v2_jobs/dashboard-v2-rebuild`.
3. Confirm `processedPatients` advances and `lastPatientId` changes.
4. Wait for `status: "complete"`.
5. Confirm each period document reports `reconciliationStatus: "complete"`,
   a non-zero `contributionCount`, and an expected `scopeCount`.
6. Monitor Firestore reads and function errors during the build. The worker
   checkpoints every patient and runs with concurrency one.

## Role UAT

- Midwife: own provider summary only.
- TMO: own township plus provider summaries in that township.
- Regional Officer: own region plus its township/provider summaries.
- Central/Super Admin: national, region, township, and provider summaries.
- Every role: All time, month, quarter, and year use one summary read.
- Custom date range: displays the slow-range notice and uses the legacy path.
- Missing/stale summary: shows source status and temporarily falls back to the
  legacy calculation.
- Compare every tab, chart, card, breakdown, and HRT scorecard with the legacy
  values before enabling production traffic.

## Rollback

Set `features.dashboardV2` to `false` and redeploy the static site. This returns
all dashboard reads to the legacy path without deleting summaries. Keep the
prior analytics schema until parity and UAT are accepted; do not delete the
legacy client calculations during this rollout.
