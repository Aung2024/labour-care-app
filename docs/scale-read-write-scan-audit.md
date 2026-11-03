# Read, Write, and Full-Scan Audit

**Audience:** Technical leads, cost reviewers, release managers  
**Classification:** Restricted technical working document  
**Branch context:** `version-2-upgrade` testing branch  
**Status:** Evidence-based current-state audit  
**Last reviewed:** 2026-11-03

This is an audit, not an authorization to change production behavior. Findings
marked “code change” require a separate reviewed implementation and testing
window.

## 1. Classification

- **Queue-driven:** reads only changed patient IDs and writes derived products.
- **Bounded page:** reads a limited page with a cursor.
- **Incremental reconciliation:** reads records changed since a checkpoint.
- **Deliberate repair:** scans the patient population only when an operator
  starts a resumable rebuild.
- **Broad page scan:** a user-facing page downloads a large patient cohort.
- **Repeated full scan:** a scheduled job repeatedly revisits the whole
  population or whole projection collection.

## 2. High-priority findings

### A. Broad patient queries in legacy operational pages

**Evidence**

- `list.html` loads broad patient cohorts for central, regional, TMO, and
  midwife views in its role-specific fetch path.
- `baby-care.html` queries all postpartum patients for central users and broad
  township/provider cohorts for other roles.
- `labour-monitoring.html` queries all labour-status patients for central users
  and broad township/provider cohorts for other roles.

**Root cause:** These pages predate the server-projection pattern and build
operational lists directly from the raw `patients` collection.

**Impact:** Reads scale with the entire matching patient cohort on every page
load, increase mobile latency, and can repeatedly exceed Firestore free quotas.

**Safe replacement:** Create scoped, cursor-paginated server callables or
dedicated projections for each operational list. Return only fields required
for the list and load the full patient record on deliberate selection.

**Migration risk:** Medium. Sorting, role scope, legacy ownership fields, and
offline expectations must be preserved. Do not remove the raw query until the
projection has parity tests and a fallback period.

**Priority:** High. This is a page-load problem and should be addressed before
national expansion.

### B. Daily tracking reconciliation revisits every tracking row

**Evidence**

- `functions/src/analytics/tracking-functions.js` schedules
  `trackingWeeklyReconciliation` every 24 hours.
- Its active reconciliation walks HRT and KMC projection collections and
  recomputes patient projections to update time-dependent status.

**Root cause:** HRT/KMC statuses depend on the date, so the system uses a
  daily repair path even when no clinical record changed.

**Impact:** At national scale this can read and rewrite every HRT/KMC row every
  day. It is valid maintenance work but is a predictable cost driver.

**Safe replacement:** Store the next status transition date and query only
  rows whose transition is due, or maintain a due-status queue. Keep a bounded
  periodic reconciliation as a safety net rather than the primary path.

**Migration risk:** High for HRT because due-date/status semantics are
  clinical workflow behavior. Implement only after parity tests and a
  measured dual-run.

**Priority:** High cost optimization, but do not disable it without a
  replacement.

### C. Checkpoint loss can restart deliberate full repairs

**Evidence**

- Tracking repair, V4 backfill, and leaderboard rebuild workers scan patients
  in batches using job documents and cursors.
- A missing or reset job document causes a new repair to begin at the first
  patient.

**Root cause:** A repair is intentionally population-wide, but job state is
  operational data and can be deleted, reset, or started again by an operator.

**Impact:** Duplicate reads and derived writes; potentially many hours of
  additional work.

**Safe replacement:** Add generation IDs, immutable repair manifests, an
  explicit “resume/restart” choice, and an operator-visible lock. Refuse a new
  full scan while a prior generation is incomplete unless the operator
  confirms it.

**Priority:** High operational control.

## 3. Medium-priority findings

### D. Initial Joint Care index rebuild

`functions/src/analytics/joint-care-index.js` performs a collection-group scan
when no checkpoint exists. This is acceptable as a one-time initialization,
but the job must retain its checkpoint and use the incremental `updatedAt`
path afterward. Monitor for accidental job-state deletion.

### E. V4, tracking, and leaderboard repair jobs

These jobs are appropriate for migrations and recovery, not normal page loads.
They should remain manually started, batch-limited, resumable, and visible in
operations documentation. Run them outside peak clinical hours where possible.

### F. Bounded provider and QI lists

Several QI/provider paths use explicit limits. These are safer than unbounded
queries, but national deployment should replace fixed limits with cursor
pagination so records beyond the limit are not silently omitted.

## 4. Low-risk or acceptable patterns

- One-patient clinical document reads.
- Bounded recent visit reads with `limit`.
- Offline prefetch with explicit per-subcollection limits.
- HRT/KMC callable pages with server-side cursor pagination.
- Unified refresh queue work keyed by patient ID.
- Dashboard V4 contribution/range aggregation through callable Functions.
- Patient projection writes guarded by a projection hash.

These patterns still need monitoring; “bounded” is not the same as “free.”

## 5. Duplicate work and write amplification

The unified clinical refresh worker refreshes multiple derived products for a
changed patient. This is preferable to several independent full scans, but it
can still amplify one clinical write into multiple derived writes.

Measure:

- products actually changed per patient
- identical projection writes avoided by hashes
- queue entries deduplicated per patient
- Function retries and failed patients

Do not remove a product refresh solely to save writes if it breaks a clinical
list. First confirm whether `writeIfChanged` and queue coalescing are working.

## 6. Recommended remediation order

1. Instrument reads/writes and queue age by Function/page.
2. Replace `baby-care.html` and `labour-monitoring.html` broad lists with
   scoped paginated APIs.
3. Replace the broad `list.html` roster path with a server-paginated roster
   contract.
4. Design due-date queues for HRT/KMC status transitions and dual-run them
   against daily reconciliation.
5. Add repair generations and checkpoint protections.
6. Add load tests and only then reduce reconciliation frequency or scope.

## 7. What was not changed by this audit

- No Firestore rules, indexes, clinical schemas, status transitions, or
  scheduled Functions were changed.
- No patient data was read or written as part of producing this document.
- No legacy collection was deleted.
- The testing-branch service-worker policy remains unchanged.
