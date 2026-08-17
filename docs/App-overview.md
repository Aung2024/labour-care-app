**MNCH  — Application Overview**

  
**Product:** Maternal, Newborn and Child Health (MNCH Care) digital workflow  
**Current live project:** F (Nay Pyi Taw pilot: Pyinmana and Tatkon)

This note describes what the app is, how it is built, how it scales, and how it helps midwives, Township Medical Officers (TMO), and Regional Officers.

---

**1. Purpose**

MNCH Care is a production healthcare application for frontline maternal and newborn services. It helps with a shared digital record that follows the mother and baby from antenatal care through labour, postnatal care, newborn care, immunization, high-risk follow-up, and Kangaroo Mother Care.

The design intent is national-scale use: one codebase, role-based access, facility and township identity, and offline-capable devices used in rural stations as well as township and regional offices.

---

**2. Technologies used**


|                              |                                                         |                                                                                       |
| ---------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| **Layer**                    | **Choice**                                              | **Why it is used**                                                                    |
| Client                       | HTML, CSS, JavaScript (no heavy SPA framework)          | Fast load on phones, simple PWA install, easier field maintenance                     |
| UI                           | Bootstrap, Font Awesome, bilingual English / Myanmar    | Readable on phone, tablet, and desktop                                                |
| App shell                    | Progressive Web App (manifest + service worker)         | Install on home screen, cache updates, usable in poor network                         |
| Native wrap                  | Capacitor (Android and iOS)                             | Optional store / device packaging from the same web app                               |
| Identity                     | Firebase Authentication                                 | Secure login, account approval, password and email administration                     |
| Database                     | Cloud Firestore                                         | Structured clinical records, role-scoped security rules, indexes                      |
| Backend                      | Firebase Cloud Functions (Node.js)                      | Privileged admin actions (email change, password reset) without exposing secrets      |
| Offline                      | IndexedDB queue + sync manager                          | Midwives can register and record visits when connectivity drops                       |
| Security                     | Firestore rules + RBAC in the client                    | Access is enforced by role and geography, not only by hiding menu items               |
| Analytics (current)          | Dashboard, township report, midwife report, leaderboard | Live operational view for TMO / Regional / Super Admin                                |
| Analytics (planned scale-up) | Server-side summary collections and Cloud Functions     | Keeps dashboards fast at 25,000+ patients without loading every chart from raw visits |


Clinical content already in the app includes  Labour Care Guide (LCG) recording, ANC visit forms and labs, delivery notes, PNC, newborn and immediate newborn care, vaccines, high-risk pregnancy tracking, KMC tracking, transfers, joint care, consent, CME learning, and printable reports.

---

**3. Scalability**

The app is designed for wider use, not only a small pilot dataset.

**Data model.** Patients carry region, township, and a 3-digit facility_code. Unique patient IDs are {township}-{facility}-{year}{serial} so identity stays stable as volume grows. Facilities are a controlled catalogue (currently codes 001–043 for the Nay Pyi Taw pilot).

**Access model.** Super Admin sees the whole programme. Regional Officers see their region. TMOs see their township. Midwives see their own caseload (plus joint-care and accepted transfers). This keeps queries and screens bounded as the user base grows.

**Device and network.** The PWA caches static assets. Clinical writes can queue in IndexedDB and sync when the network returns. That is required for station hospitals and SRHCs with intermittent connectivity.

**Current vs next performance layer.** Today the dashboard and leaderboard aggregate in the browser from patient documents and visit subcollections. That is acceptable for the pilot. The Version 2 plan already specifies indexed summary collections, Cloud Function updates, and paginated lists.

**Operations.** One codebase with environment-specific Firebase/hosting configuration. Security is validated in Firestore rules. Service-worker cache versions are bumped on deploy so installed PWAs pick up updates.

---

**4. Core features and functions**

**4.1 Registration and identity**

- Register mother and baby patients with unique IDs tied to township and facility.
- Bilingual forms, consent, and provider consent.
- Account approval before login (midwife / TMO / regional self-registration; Super Admin assignment).

**4.2 Continuum of care (the clinical record)**

- **ANC:** visits, gestational age / LMP / EDD, labs (including haemoglobin), high-risk assessment, education.
- **Labour / LCG:** first-stage start, second-stage time, medications, birth record, delivery notes.
- **PNC:** postpartum visits, timing from delivery (including within 48 hours and 42 days), danger signs, maternal outcome.
- **Newborn:** immediate newborn care, newborn care visits, birth weight, preterm / LBW flags.
- **KMC:** eligibility (birth weight < 2000 g or birth ≥ 3 weeks before EDD) and whether KMC was selected.
- **Immunization:** vaccine home, schedule, and records.
- **High-risk tracker:** follow-up status for high-risk pregnancies (on track, overdue, lost, completed).

**4.3 Teamwork across facilities**

- **Transfers** with accept / decline and history.
- **Joint care** so another midwife can open a shared patient by Patient ID.
- **Visit-edit approvals** for TMO review when a record older than 7 days must be corrected.

**4.4 Supervision, learning, and quality**

- Analytics dashboard (ANC, labour, PNC/NBC, referrals, township aggregates).
- Midwife report and township report (printable).
- Scoreboard / leaderboard to make completeness visible (registration, ANC/PNC completeness, LCG, labs, NBC).
- CME modules (Coming Soon).
- User management for Super Admin (approve accounts, labels, email).

**4.5 Reliability in the field**

- Offline registration and visit capture.
- Sync from the home screen.
- English / Myanmar language toggle throughout clinical screens.

---

**5. How it helps each role**

**Midwives**

Midwives are the primary users. The app is their day-to-day register and care checklist.

- Keep one record per mother and baby instead of scattered paper books.
- See what is still due: next ANC, PNC timing, vaccines, high-risk follow-up, KMC.
- Record LCG and delivery notes at the bedside, including second-stage time.
- Continue work offline at SRHCs and station sites, then sync.
- Transfer or jointly care for a patient when she moves to hospital or another midwife.
- See their own caseload report and scoreboard standing, which rewards complete documentation.

They do not export the full township database; that stays with TMO / Regional / Super Admin.

**Township Medical Officer (TMO)**

The TMO supervises all midwives in one township.

- See every patient in the township, not only one midwife’s book.
- Generate a township report with charts for monthly / quarterly review.
- Watch high-risk and KMC lists for missed follow-up.
- Approve one-time visit edits on older records, so data quality is controlled.
- Use the dashboard to compare ANC 4+/8+, early ANC, deliveries, PNC within 48 hours and 42 days, LCG use, anaemia, and preterm/LBW.
- Export data for Ministry and township meetings.

This replaces waiting for paper compilation at month-end with a live township picture.

**Regional Officer**

The Regional Officer looks across townships in the region (for the pilot, Nay Pyi Taw / Pyinmana and Tatkon).

- Region-scoped dashboard and reports without opening each midwife account.
- Compare township performance (coverage, volume, high-risk load, LCG application).
- See whether services are concentrating in a few hospitals or reaching SRHCs.
- Export regional extracts for Ministry reporting.
- Support supervision visits with the same indicators the township already uses.

**Super Admin (programme / Ministry technical lead)**

- Approve users and keep facility / role labels consistent.
- See the full pilot (or future national) dataset.
- Manage account email and password administration through Cloud Functions.
- Steward the single national codebase and Firebase project configuration.

---

**6. What reporting can already show**

From live midwife-created records, the facility workbook reports:

- Total registered (mothers **and** babies)
- ANC headcount and services, early ANC, ANC 4+ and 8+
- Mild / severe anaemia, high-risk pregnancy (HRT)
- Deliveries and LCG second-stage application
- PNC headcount, services, PNC within 48 hours and 42 days
- NBC headcount and services, pretrm/LBW, KMC

Those indicators are the same concepts used on the in-app dashboard, rolled up by health facility for Pyinmana, Tatkon, and any unmapped / “Other” facility codes.

---

 