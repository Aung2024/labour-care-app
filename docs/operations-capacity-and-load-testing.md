# Operations, Capacity, and Load Testing

**Audience:** Technical operations, release managers, programme leads  
**Classification:** Restricted technical working document  
**Branch context:** `version-2-upgrade` testing branch  
**Status:** Current controls and recommended acceptance gates  
**Last reviewed:** 2026-11-03

## 1. Capacity model

The planning target is 800 midwives. Capacity should be measured with:

- registered mothers and babies
- clinical records per patient
- active midwives per hour
- peak concurrent sessions
- writes per clinical encounter
- dashboard/tracking requests per minute
- queue age and backlog
- scheduled Function reads/writes and duration

An “800-user” test with no patient data is not meaningful. The minimum
representative dataset should include mothers, babies, twins, historical ANC,
PNC, labour, KMC, HRT, transfers, joint care, archived records, and legacy
field aliases.

## 2. Function schedule inventory

### Normal queue-driven work

- `unifiedClinicalRefreshWorker`: drains patient refresh work and updates
  derived products.
- Dashboard V4 daily refresh: consumes the V4 refresh queue.

These workers should process bounded batches, use a lease, and continue from a
checkpoint.

### Current-time or reconciliation work

- HRT/KMC tracking reconciliation updates time-dependent status fields.
- Leaderboard reconciliation repairs missed provider/day summaries.
- Joint-care index refresh uses incremental `updatedAt` work after its initial
  index build.
- Dashboard cache reconciliation removes expired cache records.

Each job needs a documented reason to scan existing records. Time-dependent
status reconciliation should not be confused with normal clinical refresh.

### Deliberate maintenance work

- V4 backfill
- tracking projection repair
- leaderboard rebuild
- first Joint Care index rebuild

These are operational actions, not page-load behavior. They require a visible
job state, a checkpoint, a concurrency guard, and a change window.

## 3. Read/write budget

The project should set an internal budget before national release:

- **Point-of-care page load:** bounded patient/profile reads; no national
  collection read.
- **Clinical save:** clinical write plus one queue write; derived writes occur
  asynchronously.
- **Tracking page:** one callable request per page, server-paginated; no client
  patient scan.
- **Dashboard load:** one V4 aggregate request plus one HRT status-count
  request; no raw patient reads.
- **Routine worker:** queue-bounded reads and writes proportional to changed
  patients, not total patients.
- **Maintenance rebuild:** separately budgeted and rate-limited.

The exact numeric budget should be calibrated from production telemetry. The
budget must be reviewed whenever a new page-load query or scheduled Function is
added.

## 4. Cost controls

1. Replace raw patient scans with projections or aggregate counts.
2. Require cursor pagination for every potentially large list.
3. Use `count()` or precomputed counters for counts; do not download rows only
   to count them.
4. Deduplicate refresh requests by patient ID.
5. Keep Function schedules idle when queues are empty.
6. Keep repair jobs separate from normal workers and cap their runtime.
7. Use `writeIfChanged`/hashing for projections to avoid identical writes.
8. Expire range caches without deleting active sessions or clinical data.
9. Keep old analytics workers disabled/not exported when V4 is authoritative.
10. Track Firestore document reads/writes and Function invocations by product.

## 5. Monitoring and alerts

Recommended metrics:

- Firestore reads, writes, deletes, and billed operations by day/product
- Function invocation count, duration, error rate, and memory
- queue depth, oldest queue age, failed entries, and retry count
- rebuild progress and last successful checkpoint
- dashboard cache hit rate and query latency
- HRT/KMC page page-size and pagination completion
- frontend errors by browser/device

Alert conditions:

- queue age above the clinical freshness target
- repeated job checkpoint reset
- full-scan job running outside an approved window
- Function error rate or duration regression
- dashboard response timeout or high cache-miss rate
- abnormal write/read ratio after a deployment

## 6. Backup, recovery, and rollback

- Clinical patient documents are the protected source of truth.
- Derived projections and analytics can be deleted/rebuilt only with an
  approved job and a documented checkpoint.
- A function rollback must not silently change clinical schema or status
  transitions.
- Before a production migration, export or snapshot the affected derived
  collections and record the schema/definition version.
- Testing-branch changes must not ask users to clear site data and must not
  enable production service-worker behavior.

## 7. Load-test scenarios

### Scenario A: point-of-care concurrency

Simulate 800 accounts with a realistic active subset performing login, patient
lookup, ANC save, newborn save, and PNC save. Measure:

- p50/p95 page and save latency
- Firestore reads/writes per workflow
- queue creation rate
- refresh completion latency

### Scenario B: dashboard and tracking peak

Simulate simultaneous midwife, TMO, regional, and central users loading:

- all-time Dashboard V4
- multi-month dashboard filters
- HRT/KMC paginated pages
- leaderboard pages

Verify that no client reads the raw patient collection and that scope filters
cannot widen access.

### Scenario C: queue burst

Create a burst of clinical writes and verify that one patient with multiple
changed records produces deduplicated refresh work. Measure queue age,
concurrency, retries, and eventual consistency.

### Scenario D: maintenance isolation

Run a controlled tracking or V4 repair while normal clinical writes and
dashboard reads continue. Verify that the maintenance job is resumable and
does not monopolize Firestore or the queue worker.

## 8. Acceptance gates

Before an 800-midwife production release:

- no high-priority unbounded page-load patient query remains
- all large lists are cursor-paginated or projection-backed
- role/scope tests pass for every callable
- Firestore rules tests pass
- queue burst recovers within the agreed freshness target
- maintenance jobs have resumable checkpoints
- read/write budgets are measured on a representative dataset
- dashboard and HRT status counts are reconciled against the same projections
- login → home → one Firestore read works online and on poor network
- service-worker production release is tested separately from this branch
