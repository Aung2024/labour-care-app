# MNCH App V2 Leaderboard Backend: Deployment Guide

This guide is written for a project owner who is new to backend deployment. The coding agent prepares and tests the code; the project owner runs the production commands and confirms each result.

## 1. What the new backend does

The clinical forms continue saving to the existing `mnch-1cbda` Firestore database exactly as before.

1. A midwife saves a registration or clinical record.
2. A Firestore-triggered Cloud Function detects that write.
3. The Function recalculates only that patient’s contribution for the affected month.
4. It updates a compact monthly provider total.
5. `leaderboard.html` reads the compact totals instead of opening every patient and every clinical subcollection. The default view is **all time** and **all midwives**; users can still filter to a specific month or provider type.
6. A nightly job checks the totals again. A resumable worker repairs them in small batches.

The backend never modifies clinical records. It writes only to:

- `leaderboard_v2_months` (including an `all` document for all-time totals)
- `leaderboard_v2_contributions`
- `leaderboard_v2_jobs`

Browser users can read authorized monthly summaries but cannot write any of these collections.

## 2. Before starting

Confirm these items in Firebase Console:

1. Open [Firebase Console](https://console.firebase.google.com/).
2. Select the project whose ID is exactly `mnch-1cbda`.
3. Open Project settings and verify the Project ID.
4. Open Usage and billing. Cloud Functions v2 and Cloud Scheduler require the Blaze plan.
5. In Firestore Database, note the database location. The current code uses `us-central1` because the existing backend uses that region; stop and request a code adjustment if the Firestore location makes another Functions region necessary.
6. In Build → Functions, record the existing function names. The read-only baseline check on 12 August 2026 found:
   - `adminSetUserPassword`
   - `processPendingPasswordResets`
   
   The source also exports `updateUserEmail`, but it was not deployed in the live baseline. The named deployment below deliberately deploys only the six new leaderboard Functions.
7. In Firestore Database → Rules, copy the currently deployed rules into a dated backup file before deploying rules.
8. In Google Cloud Console → Billing → Budgets & alerts, create a small warning budget before starting the all-time and 4-month build.

Do not continue if the selected project ID is different.

## 3. Install the required tools

Use Node.js 20. Check:

```bash
node --version
```

The result should start with `v20`. Then install Firebase CLI:

```bash
npm install -g firebase-tools
firebase --version
firebase login
```

The CLI opens a Google sign-in page. Use the Google account that has permission to deploy Functions, Firestore rules, and indexes for `mnch-1cbda`.

Verify access without changing anything:

```bash
firebase projects:list
firebase functions:list --project mnch-1cbda
```

`--project mnch-1cbda` is a safety lock. It prevents Firebase CLI from using another remembered project.

## 4. Download and verify the branch

From the repository folder:

```bash
git fetch origin
git switch version-2-upgrade
git pull origin version-2-upgrade
git status
```

`git status` should report a clean working tree.

Install the exact locked backend dependencies:

```bash
cd functions
npm ci
```

## 5. Run local tests before production

These commands use synthetic/local data and do not write to the live database:

```bash
npm test
npm run test:rules
npm run test:integration
```

Expected result:

- scoring tests pass;
- Midwife, TMO, Regional Officer, and Super Admin rule tests pass;
- unauthenticated reads and browser writes are denied;
- trigger retry does not double-count;
- deleting a visit removes its score;
- rebuild checkpoints resume and complete.

Do not deploy if any test fails.

## 6. Deploy only the new Functions

Return to the repository root:

```bash
cd ..
```

First perform a dry review:

```bash
firebase deploy --dry-run --only functions:leaderboardPatientWritten,functions:leaderboardPatientActivityWritten,functions:leaderboardProviderWritten,functions:startLeaderboardRebuild,functions:leaderboardNightlyReconciliation,functions:leaderboardReconciliationWorker --project mnch-1cbda
```

Confirm that it lists only the six new leaderboard Functions. It must not propose deleting either existing admin Function. Then run the same command without `--dry-run`.

**Bangkok limitation:** Firestore is in `asia-southeast3`. Google cannot attach document triggers in that region yet, so `leaderboardPatientWritten`, `leaderboardPatientActivityWritten`, and `leaderboardProviderWritten` will fail to create. That is expected. Deploy and keep these three, which do work:

```bash
firebase deploy --only functions:startLeaderboardRebuild,functions:leaderboardNightlyReconciliation,functions:leaderboardReconciliationWorker --project mnch-1cbda
```

After deployment, open Firebase Console → Functions and verify:

- `adminSetUserPassword` and `processPendingPasswordResets` are still present;
- `startLeaderboardRebuild`, `leaderboardNightlyReconciliation`, and `leaderboardReconciliationWorker` are healthy.

The 15-minute worker continues Super Admin rebuilds. A separate 6-hour job starts all-time plus the current month only when no rebuild is already running, so scores still catch up without live document triggers.

## 7. Deploy indexes and additive rules

Deploy indexes:

```bash
firebase deploy --only firestore:indexes --project mnch-1cbda
```

Firebase may take several minutes to build indexes. Wait until Firestore Database → Indexes shows them as enabled.

Compare `firestore.rules` with the rules backup made in step 2. Existing rules should be unchanged; only the `leaderboard_v2_*` blocks and helper functions should be new.

Then deploy rules:

```bash
firebase deploy --only firestore:rules --project mnch-1cbda
```

## 8. Deploy the branch preview

Push `version-2-upgrade` to GitHub if it is not already available:

```bash
git push -u origin version-2-upgrade
```

Use the Netlify branch preview for `version-2-upgrade`. Do not make it the production branch yet.

## 9. Build all-time and the last 4 months

1. Open the branch-preview Leaderboard.
2. Sign in as Super Admin.
3. Click **Build all-time and last 4 months**.
4. Confirm the prompt once.
5. The first batch starts immediately. The scheduled worker continues every 15 minutes.
6. In Firestore Console, inspect `leaderboard_v2_jobs/leaderboard-v2-rebuild`.
7. Wait until `status` becomes `complete`.

Do not click the button repeatedly. A rebuild scans clinical records and therefore creates Firestore reads, although it never changes those records.

## 10. Live UAT

Test each available role:

### Midwife

- Only the permitted township leaderboard is visible.
- Period defaults to All time. Month and provider filters work.
- Score breakdown equals approved source records.
- “Last updated” is visible.

### TMO

- Only the permitted township is visible.
- Provider filters and period filters work. The default is All time and All midwives.

### Regional Officer

- Only the permitted region is visible.

### Super Admin

- All providers are visible.
- The rebuild control is visible only to Super Admin.

Compare several provider/month results with the legacy page before approving cutover.

## 11. Monitoring

During the first days, check:

- Firebase Console → Functions → Logs for errors and retries;
- Firestore Usage for reads and writes;
- Cloud Scheduler for successful nightly and 15-minute worker runs;
- `leaderboard_v2_jobs` for failed or stuck jobs;
- the Leaderboard freshness label.

The expensive all-time and 4-month build is a one-time operation. Normal page loads read only summary documents.

## 12. Rollback

### Disable the V2 page reader

In `firebase.runtime-config.json`, change:

```json
"leaderboardV2": true
```

to:

```json
"leaderboardV2": false
```

Redeploy the static branch. The page returns to the legacy calculation. Clinical data is unaffected.

### Remove only the new Functions

If required, delete only the six new leaderboard Functions from Firebase Console or with explicit named CLI commands. Do not delete existing admin Functions.

The derived `leaderboard_v2_*` documents may remain safely while investigating. They are ignored in legacy mode and contain no patient clinical fields.

## 13. Important limits

- Keeping the old Git branch does not automatically roll back Cloud Functions; use the feature flag or remove only the new named Functions.
- Live visual testing is necessary but does not replace local retry, deletion, month-boundary, and security tests.
- Do not run destructive load tests or edit clinical records for testing.
- Do not use `firebase deploy` without `--only` and `--project mnch-1cbda`.
