# Firestore Schema and Access Matrix

**Audience:** Developers, security reviewers, data and operations leads  
**Classification:** Restricted technical working document  
**Branch context:** `version-2-upgrade` testing branch  
**Status:** Current-state schema catalogue  
**Last reviewed:** 2026-11-03

Firestore is schemaless at the database layer. This document is the
application-level schema contract. Canonical fields should be preferred for new
writes; legacy aliases remain readable until a separately approved migration.

## 1. Identity and users

### `users/{uid}`

Core fields:

- `role`
- `region`
- `township`
- facility code/name and department fields
- display name and contact fields
- account status and approval fields

The user profile is the source for callable role and geographic scope. A missing
profile must fail closed; the application must not invent a role.

### `patient_counters/{counterId}`

Used for controlled patient identifier generation. Access should be limited to
the authenticated registration workflow and should be protected from arbitrary
counter manipulation by production rules/functions.

### `newborn_identity_keys/{identityId}`

Idempotency record linking a mother, baby, and birth order. It prevents duplicate
baby records when Delivery Notes or offline retries are replayed.

## 2. Clinical patient schema

### `patients/{patientId}`

Common fields:

- identity: name, patient ID, patient type, phone, age/date of birth
- scope: provider, care-team providers, facility, township, region
- lifecycle: status, deleted/archive flags, roster status
- links: mother patient ID, baby patient IDs, transfer/joint-care fields
- pregnancy anchors: LMP, EDD, gravida/parity
- closure/outcomes: `serviceClosure`, maternal/newborn outcome fields
- legacy embedded arrays: `antenatalVisits`, `postpartumVisits`,
  `newbornVisits`, `testRecords`, `hrtActions`

The embedded arrays are legacy-compatible facts. New code should use normalized
subcollections where the workflow already has them and rely on the server
repository to normalize both shapes.

### Patient subcollections

- `antenatal_visits/{visitId}`: ANC visits, risk, TD, PMTCT, medicines, dates
- `postpartum_visits/{visitId}`: PNC visits and interventions
- `newborn_care/{visitId}`: newborn follow-up and measures
- `immediate_newborn_care/{visitId}`: immediate newborn observations
- `testRecords/{testId}` and `test_records/{testId}`: laboratory/test records
- `lab_tests/{testId}`: additional legacy lab naming
- `records/deliveryNotes`: authoritative Delivery Note
- `records/summary`: summary record
- `records/startingTime`, `records/secondStage`: labour records
- `records/thirdStage`: legacy labour record
- `records/birthRecord`: legacy birth record
- `records/transferRecord`: transfer evidence
- `labour_care/{recordId}`: labour-care records
- `medication/{medicationId}`: medication records
- `vaccinations/{recordId}`: vaccination records
- `hrt_actions/{actionId}`: explicit HRT completion/reversal actions
- `kmc_actions/{actionId}`: KMC actions
- `consents/{consentId}`: patient consent records

Subcollection names are part of the compatibility contract. New features must
not create another alias without a migration decision.

## 3. Derived projections and queues

### `tracking_v2_hrt/{patientId}`

Server-only patient projection. Typical fields:

- patient identity and scope
- `status`: `on_track`, `overdue_followup`, `lost_to_followup`, or `complete`
- `riskFactors`, `visitCount`, due-date fields
- explicit completion and reversal state
- postpartum reminder group/date
- `projectionHash`, `calculatedAt`, schema version

### `tracking_v2_kmc/{patientId}_{babyIndex}`

Server-only baby-level KMC projection. Twin identity is part of the document key.

### Refresh queues

- `clinical_refresh_v1_queue/{patientId}`
- `tracking_v2_refresh_queue/{patientId}`
- `leaderboard_v3_refresh_queue/{patientId}`
- `dashboard_v4_refresh_queue/{patientId}`

Queue documents contain IDs, requester/reason metadata, and timestamps. They
must not contain unnecessary clinical payloads.

### Job state

- `tracking_v2_jobs/{jobId}`
- `analytics_v4_jobs/{jobId}`
- legacy analytics job collections retained only where deployed/required

Job state must include status, cursor/checkpoint, timestamps, retry/error
information, and a lease or concurrency guard where workers overlap.

## 4. Analytics and reporting

### V4

- `analytics_v4_contributions/{contributionId}`: server-only patient-period
  contributions, numeric counters/maps only
- `analytics_v4_range_cache/{cacheId}`: server-only exact-range cache
- `analytics_v4_jobs/{jobId}`: backfill state

The browser calls `queryDashboardV4`; it does not read contributions directly.
Current HRT status breakdowns use the role-scoped
`queryHrtStatusSummary` callable over HRT projections.

### Leaderboard

Current deployed leaderboard collections include provider/day or period
contributions, summaries, refresh queues, and rebuild job state. The browser
must use scoped callable/API paths rather than reading national contributions.

### Quality

Quality summaries, provider contributions, action plans, and comments are
separate products with their own scope rules. Quality pages must use bounded
provider lists and provider/month documents.

## 5. Operational and audit collections

- `sms_sends/{sendId}`: server-written SMS audit log
- `audit_logs/{logId}`: security and user-action audit records
- `feedback/{feedbackId}`: user feedback
- `patient_transfer_requests/{requestId}`: transfer workflow
- `joint_care_patient_index/{patientId}`: server-maintained active linked
  providers
- account lockout and password-reset collections

Secrets, bearer tokens, and service-account files do not belong in Firestore.

## 6. Access matrix

| Data area | Midwife | TMO | Regional | Central/Admin | Browser write |
|---|---|---|---|---|---|
| Own/care-team patient clinical data | Scoped | Township | Region | National | Authenticated workflow |
| HRT/KMC rows | Scoped callable | Township callable | Region callable | National callable | No direct write |
| Dashboard V4 | Provider scope | Township scope | Region scope | National/selected region | No direct write |
| Leaderboard summaries | Provider/scope | Township | Region | National | No direct write |
| SMS send | Own HRT scope | No | No | No | Callable only |
| SMS audit | No direct read | No direct read | No direct read | Server/admin review | No |
| Analytics contributions/jobs | No direct read | No direct read | No direct read | No direct read | No |
| User profile | Own profile | Scoped read where needed | Scoped read where needed | Administrative | Controlled |
| Audit logs | Own permitted entries | Own permitted entries | Own permitted entries | Super Admin | Create-only action |

This table is a product summary. The authoritative implementation remains
`firestore.rules` and the authorization code in callable Functions.

## 7. Index and query contract

Indexes should support:

- provider/care-team plus active range for tracking projections
- township or region plus active range for supervisor tracking
- updated-at cursors for incremental maintenance
- role-scoped leaderboard and provider summaries

Do not add indexes to make an unbounded page scan appear acceptable. First
replace the query with a projection, cursor, count summary, or bounded page.

## 8. Schema governance

Every new field or collection should record:

1. Owner and source-of-truth workflow.
2. Data type and required/optional status.
3. Role and security behavior.
4. Server-derived versus user-authored status.
5. Backfill and rollback plan.
6. Index and read/write cost impact.
7. Legacy alias behavior and deprecation date.
