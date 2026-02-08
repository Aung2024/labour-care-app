# Labour Care Guide (LCG) — Portfolio Summary for Software House Proposal

**Project:** m-MNCH Care (Maternal, Newborn & Child Health Care)  
**Client/Context:** Healthcare digitalisation for maternal and newborn care workflows  
**Use this document for:** Portfolio, proposals, and “capabilities” sections (software house / founders with BCS background).

---

## Executive Summary

Labour Care Guide is a **hybrid mobile and web application** for maternal and newborn care, used by midwives, Township Medical Officers (TMOs), and administrators. It covers the full care pathway from **antenatal → labour → immediate newborn → postpartum → baby care**, with role-based access, consent management, audit logging, and offline-capable data entry. Built with **Capacitor** for Android/iOS and **Firebase** (Auth + Firestore) as the backend.

---

## Technologies & Stack

| Layer | Technology |
|-------|------------|
| **Platform** | Capacitor 8 (Android + iOS from single codebase); web-first (HTML/CSS/JS) |
| **Backend / BaaS** | Firebase (Authentication, Cloud Firestore) |
| **Frontend** | Vanilla HTML5, CSS3, JavaScript (ES6+); modular JS architecture |
| **Security** | Firestore Security Rules (role-based + township-scoped); RBAC in-app |
| **Persistence** | Firestore offline persistence (where supported); long-polling for restricted networks |
| **Build / Deploy** | npm scripts; Capacitor sync and Android debug build |

*Notable: No heavy framework — keeps bundle small and suitable for low-end devices and poor connectivity.*

---

## Features (Portfolio-Ready List)

### Clinical & Care Workflows
- **Antenatal care:** Visits, appointments, education, tests (forms, lists, reports)
- **Labour care:** Setup, monitoring, entry, protocols, emergencies, outcomes
- **Immediate newborn care:** Forms and documentation
- **Newborn & baby care:** Care records, vaccine schedule, reports
- **Postpartum:** Visits, history, forms, reports
- **Patient-centric hub:** Single view linking antenatal → labour → newborn → postpartum for a patient
- **Summaries:** Multiple summary views (e.g. summary-view, newsummary) for quick overview
- **Lab tests & reports:** Antenatal tests, lab reports, patient info reports, township reports, overall reports

### Patient & User Management
- **Patient registration** with duplicate detection (by phone and name/age similarity)
- **Patient transfer** and transfer recording
- **User registration** and approval workflow
- **Role-based access:** Super Admin, TMO (township-scoped), Midwife (own patients)
- **Leaderboard** (e.g. engagement or activity metrics)
- **Settings & profile** (including CME learning – mandatory/optional)

### Compliance, Security & Data Quality
- **Consent management:** Provider consent and patient consent (with Firestore rules enforcing provider/scoped write)
- **Audit logging:** Immutable audit trail (login/logout, patient create/update/delete/view, care events, consent, report generation, etc.) with optional client IP and user agent
- **Account lockout** after failed login attempts (tracked in Firestore)
- **Password policy:** History and reuse prevention (stored in `password_history`; no deletes)
- **Clinical validation:** EDD/LMP consistency, gestational age checks, and related validators
- **Sensitive data masking:** Configurable masking of phone numbers and patient names in list views
- **Data linkage:** Cross-check and cleanup across antenatal, labour, postpartum, and baby records

### User Experience & Reliability
- **Auth guard:** Route protection and role-based redirects
- **Session management:** Patient context and user session (e.g. current patient, antenatal visit counts)
- **User cache:** Cached user profile to reduce Firestore reads and speed up permission checks
- **Network diagnostics:** Connectivity checks (e.g. test document write) for Firebase
- **Page performance:** Basic performance monitoring (e.g. cache usage)
- **Offline / low connectivity:** Firestore persistence (non-Safari), long-polling to bypass WebSocket blocks (e.g. firewalls, Android)
- **Feedback form** for pilot/users (e.g. midwives)

### Admin & Operations
- **Admin panel:** User management, facilities, system stats
- **Audit log viewer** (Super Admin)
- **Feedback viewer** (Super Admin)
- **Migration utilities:** e.g. facility code migration

---

## Data Model (Firestore) — Highlights

- **Top-level collections:** `users`, `patients`, `patient_counters`, `provider_consents`, `feedback`, `audit_logs`, `account_lockouts`, `password_history`
- **Under `patients`:** `records`, `antenatal_visits`, `postpartum_visits`, `medication`, `testRecords` / `test_records`, `immediate_newborn_care`, `newborn_care`, `baby_records`, `labour_care`, `lab_tests`, `consents`, `plotData`, plus catch-all for other subcollections
- **Security:** Per-role and per-township read/write in rules; consent and audit writes tightly scoped; immutable audit and password history (no deletes/updates where required)

---

## Impressive Numbers (for Proposals)

| Metric | Value |
|--------|--------|
| **Screens / pages (HTML)** | 60+ distinct app screens (e.g. registration, dashboard, care forms, reports, admin, settings) |
| **Firestore collections / subcollections** | 10+ top-level; 15+ under `patients` |
| **User roles with distinct permissions** | 3 (Super Admin, TMO, Midwife) with full permission matrix |
| **Audit event types** | 20+ (auth, patient, care, consent, reports, security) |
| **Security rules (Firestore)** | 200+ lines of rule definitions |
| **Reusable JS modules** | 15+ (auth, RBAC, session, audit, consent, validation, masking, duplicate detection, network, performance, etc.) |
| **Platforms** | Web + Android + iOS from one codebase (Capacitor) |

---

## Key Selling Points for a Software House

1. **Full-stack healthcare product:** From auth and RBAC to clinical validation, consent, and audit — not just CRUD.
2. **Security and compliance:** Firestore rules, RBAC, audit logs, lockout, password history, consent — suitable for sensitive health data.
3. **Cross-platform:** One codebase for web and native Android/iOS via Capacitor.
4. **Low-infrastructure:** Firebase (Auth + Firestore) — no custom backend to host; scales with usage.
5. **Resilient to real-world conditions:** Long-polling for restricted networks, offline persistence where supported, duplicate detection, and data validation.
6. **Structured and maintainable:** Modular JS, clear separation of auth, session, RBAC, and domain logic (clinical, consent, audit).

---

## One-Paragraph Blurb (for Proposals)

*Labour Care Guide (m-MNCH Care) is a cross-platform maternal and newborn care application built with Capacitor for Android and iOS and Firebase for authentication and data. It supports the full care pathway—antenatal, labour, immediate newborn, postpartum, and baby care—with 60+ screens, role-based access (Super Admin, TMO, Midwife), consent management, and an immutable audit trail. The app includes duplicate patient detection, clinical data validation, sensitive data masking, and offline-capable data entry, with Firestore security rules and in-app RBAC designed for healthcare data. Delivered as a single codebase for web and mobile, it demonstrates our ability to deliver secure, compliant, and maintainable health-tech solutions.*

---

*Document generated from codebase analysis for portfolio and proposal use. Update figures (e.g. exact page count) if you refine the app structure.*
