# MNCH Care App Documentation Index

**Product:** Maternal, Newborn and Child Health Care App  
**Branch context:** `version-2-upgrade` testing and client-review branch  
**Index owner:** MNCH App implementation team  
**Last reviewed:** 2026-10-22  
**Status:** Working handover package; client and technical approval required

This index identifies the authoritative document for each audience. The
application and approved programme definitions remain the source of truth for
implemented behavior and clinical indicators.

## Primary handover documents

| Document | Audience | Classification | Use it for |
|---|---|---|---|
| [MNCH v2 Client System and Workflow Guide](word/MNCH-v2-Client-System-and-Workflow-Guide.docx) | Client, programme, clinical reviewers, trainers, supervisors | Client-facing | Product purpose, roles, clinical workflows, UI/UX expectations, connectivity behavior, limitations, support, and UAT |
| [MNCH v2 Developer and Operations Technical Specification](word/MNCH-v2-Developer-and-Operations-Technical-Specification.docx) | Developers, technical leads, release managers, security reviewers, operations | Restricted internal handover | Architecture, data flow, Firestore model, authorization, offline queues, projections, deployment, testing, monitoring, rollback, and verification backlog |

## Existing supporting documents

| Document | Audience | Authority |
|---|---|---|
| [System design and architecture](system-design-and-architecture.md) | Programme and technical stakeholders | Current architecture reference; concise Markdown source |
| [National-scale system design](national-scale-system-design.md) | Technical leads, programme operations, release managers | 800-midwife capacity model and current Firebase/PWA architecture |
| [Clinical workflow low-level design](clinical-workflow-low-level-design.md) | Developers, clinical product owners, technical reviewers | ANC, LCG, PNC, newborn, HRT/KMC, dashboard, leaderboard, transfer, and joint-care data flows |
| [Firestore schema and access](firestore-schema-and-access.md) | Developers, security reviewers, data and operations leads | Application-level document schema, collection ownership, role access, and index contract |
| [Operations, capacity, and load testing](operations-capacity-and-load-testing.md) | Technical operations and release managers | Budgets, scheduled work, monitoring, recovery, and national-scale acceptance gates |
| [Read/write and full-scan audit](scale-read-write-scan-audit.md) | Technical leads and cost reviewers | Evidence-based broad-query findings and prioritized remediation |
| [All features](features.md) | Programme and management stakeholders | Current feature catalogue |
| [User manual](../user-manual.html) | Field users and trainers | Canonical in-app workflow reference; bilingual HTML |
| [PWA release checklist](../PWA-RELEASE-CHECKLIST.md) | Developers and release managers | Release gates and supported offline scope |
| [Version 2 upgrade TOR](m-MNCH-Version-2-Upgrade-TOR.md) | Client and implementation team | Approved scope, target capacity, acceptance, and responsibilities |
| [Testing branch development rule](../.cursor/rules/testing-branch-development.mdc) | Developers and AI-assisted development | Mandatory testing-branch and shared-database safeguards |

## Publication order

1. Confirm clinical terminology, workflow behavior, role matrix, and UAT
   results with the client.
2. Share the **Client System and Workflow Guide** with approved client,
   programme, clinical, and training reviewers.
3. Keep the **Developer and Operations Technical Specification** restricted to
   authorized technical and security personnel.
4. Review the privacy/consent wording with the responsible legal or
   data-protection owner before using it as a formal policy.
5. On production approval, update the release identifier, service-worker
   policy, deployment record, support contacts, and final acceptance status.

## Information classification

Client-facing documents must not contain:

- Patient names, IDs, phone numbers, addresses, dates of birth, clinical
  details, laboratory results, signatures, or raw exports.
- Passwords, API keys, bearer tokens, service-account files, or secret values.
- Internal Firebase project identifiers, Cloud Run URLs, Firestore collection
  paths, deployment commands, or security-rule implementation details.
- Unapproved legal, privacy, retention, security, clinical, or indicator
  guarantees.

Restricted technical documents may describe implementation paths and
operational controls, but must never reproduce credentials or live patient
data. Security findings are labeled as verification items until the responsible
owner approves them.

## Document control standard

Every future handover document should include:

- document owner and intended audience
- classification and environment
- version or branch context
- last-reviewed date
- approval status
- source-of-truth references
- known limitations and required decisions

