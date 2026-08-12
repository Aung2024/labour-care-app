# Terms of Reference: m-MNCH Care Version 2 Upgrade

**Project:** Pilot revisions and scalable Firebase analytics upgrade  
**Implementation baseline:** Current live pilot (`mnch-moh`)  
**Indicative duration:** 16–20 weeks for one engineer, including staged UAT  
**Technology:** JavaScript, Node.js, Firebase Authentication, Firestore and Cloud Functions

## 1. Purpose

Upgrade the current m-MNCH Care pilot to Version 2 by completing the 25 approved pilot revisions and replacing slow browser-based dashboard/leaderboard calculations with a scalable hybrid Firebase architecture, while preserving existing clinical records, offline workflows and live-pilot continuity.

## 2. Scope of work

### A. Twenty-five pilot revisions

1. **ANC completeness and risk:** require height at ANC visit 1; require LMP known/unknown; carry editable LMP to later visits; add three risk factors; require a factor when high risk is Yes; evaluate risk from visit 2 onward.
2. **Delivery, PNC and newborn:** define mandatory delivery-note fields with draft support; prefill PNC from delivery notes; standardize four birth-place options; display baby weight/age; expose appropriate maternal ANC information for linked babies; include baby newborn care in the mother’s report; add newborn visit-date selection.
3. **Reports and terminology:** show long-format LMP/EDD; use actual service dates; apply the approved new/old-patient definition; revise Myanmar gestational-age wording; update immunization pending text/remove Recommended Date; show HIV Indeterminate in yellow with a retest alert.
4. **Navigation and patient safety:** correct HRT patient selection/back navigation; show newborn-visit indicators in baby transfer history; open the correct overall report from transfer history.
5. **Transfer/referral:** add patient accept/decline; require the shared consent workflow from every referral entry point; add recipient search/filter; prevent TMO selection; enforce authorized state transitions and audit history.

These items will be delivered in controlled release groups. Changes affecting official indicators, delivery/PNC dependencies, patient context, authorization or transfer states require written clinical approval and full regression testing.

### B. Version 2 performance architecture

- Add versioned `analytics_v2_*` patient, midwife and geographic summary collections.
- Add retry-safe Firestore Cloud Function triggers to update summaries after clinical changes.
- Add scheduled, resumable reconciliation and controlled historical backfill.
- Change dashboard and leaderboard pages to read bounded summaries, show freshness and retain a temporary legacy fallback.
- Add indexed cursor pagination to patient lists.
- Add required Firestore indexes, summary authorization rules, monitoring and rollback controls.
- Preserve existing clinical form writes and offline operation; analytics failure must not block patient care.

## 3. Deliverables

- implemented and UAT-approved 25-item pilot revision backlog
- versioned indicator/scoring definitions and summary schema
- Node.js Cloud Functions, backfill and scheduled reconciliation
- optimized dashboard, leaderboard and paginated patient list
- Firestore indexes and role/scope security-rule tests
- compatibility, offline, clinical-regression and performance test reports
- deployment, monitoring, rollback and administrator documentation
- release notes, source code and final client acceptance record

## 4. Target capacity and acceptance criteria

Validation profile: **25 townships, 750 midwives, 25,000 patients and 250 simulated concurrent users** on an agreed device/network profile.

- dashboard/leaderboard first useful content: **p75 ≤3 seconds; p95 ≤8 seconds**
- first patient-list page: **p75 ≤2 seconds; p95 ≤5 seconds**
- UI timeout/retry or stale-cache state within **10 seconds**
- normal summary freshness typically **≤2 minutes**, p95 **≤15 minutes**
- reconciliation repair within **24 hours**
- no loss or unauthorized modification of pilot clinical records
- parity with approved indicators and leaderboard scoring
- successful online, offline/reconnect, phone, tablet, Safari/iOS and desktop UAT

Targets become contractual after baseline measurement and agreement on the test method; external network or Firebase outages are excluded from absolute page-load guarantees.

## 5. Implementation and pilot safeguards

Work will be developed from `mnch-moh` on controlled feature branches. Emulator and synthetic-data testing will precede live deployment. The live pilot database may be used only for approved read-only baseline measurements and additive shadow summaries; no destructive load test or clinical-record backfill is permitted. Rollout will follow **shadow → comparison → canary → role-based release**, with a tested feature-flag/hosting rollback and service-worker cache update.

## 6. Responsibilities and approval

The implementation team will design, develop, test, document and deploy the approved scope. The client will provide authorized test accounts, timely clinical definitions, UAT reviewers, Firebase access and release approval. Scope changes, data cleanup, on-premise migration, independent penetration testing and new third-party integrations require separate written approval and costing.

Completion requires signed clinical UAT, performance results against the agreed profile, security/authorization verification, rollback evidence and formal client acceptance.
