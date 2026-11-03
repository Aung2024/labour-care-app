# All Features

**Product:** Maternal, Newborn and Child Health (MNCH) Care App  
**Audience:** Programme and management stakeholders  
**As of:** September 2026

This is a catalogue of **features that exist in the current app**. It is grouped the way users meet them: home, patient care, follow-up, quality, learning, and administration.

---

## 1. Access, language, and device

- Sign-in with approved user accounts (Firebase Authentication).
- Role-based home screen (midwife, TMO, regional officer, Super Admin / central).
- English and Myanmar throughout clinical screens.
- Installable PWA (home screen icon, offline cache, update after deploy).
- Designed for phone, tablet (including iPad), and desktop, including Safari / iOS PWA constraints.
- Privacy policy and consent flows for patients and providers.

---

## 2. Patient identity and caseload

| Feature | What it does |
|---|---|
| Register new patient | Creates the mother (or baby) record with demographics, phone, facility, and identifiers. Patient phone is required on the current registration form. |
| Select patient | Search and open the midwife’s caseload. |
| Edit patient | Update registration details. |
| Patient care hub | One place to open ANC, labour, newborn, PNC, vaccines, and the overall report for that patient. |
| Overall patient report | Combined printable / shareable clinical summary. |
| Patient summary view | Shareable clinician summary link. |
| Joint care | Open a shared patient with the serial Patient ID so more than one provider can care for the same woman or baby. |
| Care team | Midwives on the care team can continue visits after transfer or joint care. |

---

## 3. Antenatal care (ANC)

| Feature | What it does |
|---|---|
| New ANC visit | Structured visit: history, examination, LMP/EDD and gestational age, danger signs, high-risk assessment and risk factors, diagnosis, medicines (including IFA), next visit, notes. |
| ANC report | Review and print the ANC care summary. |
| Edit ANC visits | Midwife may edit her own visit for 7 days; older records need a one-time TMO approval. |
| Tests and results | ANC laboratory tests (including HIV, syphilis, hemoglobin and related results). |
| Health education | Counselling modules recommended by gestational age: pregnancy health, maternal nutrition, self-care, breastfeeding. |
| High-risk flag | A “yes” high-risk assessment with risk factors places the woman on the High Risk Pregnancy Tracker. |
| Early ANC | First-visit timing is calculated from LMP/EDD so coverage of ANC before 14 weeks can be measured. |
| Follow-up status | Next-visit dates drive active / overdue / defaulted status on tracking lists. |

---

## 4. Labour and delivery

| Feature | What it does |
|---|---|
| Labour care entry | Start and continue labour care for the selected patient. |
| Labour carousel / monitoring | In-labour monitoring tools, including partograph-style charts. |
| Third-stage care | Dedicated prompt for third-stage management from the care hub. |
| Delivery notes | Birth record, linked to gestational age from ANC where available. Notes can lock after save. |
| Labour protocols | On-device labour care protocols and guidelines. |
| Emergency protocols | Emergency labour procedures at the point of care. |
| Other outcome | Record outcomes that are not a routine facility birth pathway. |

---

## 5. Newborn and baby care

| Feature | What it does |
|---|---|
| Immediate newborn care | Essential procedures right after birth (skin-to-skin, drying, delayed cord clamping, early breastfeeding, eye care / TEO, vitamin K, and related fields). |
| Newborn care visits | Follow-up assessment, weight, vitals, feeding, danger signs, discharge examination. |
| Newborn report | Printable newborn care summary. |
| Edit newborn visits | Same 7-day / TMO-approval edit rule as other clinical modules. |
| Baby patient linkage | Baby records link to the mother for joint care and KMC. |
| Kangaroo Mother Care tracker | Follow low birth weight and preterm babies on KMC, including weight trend. |
| Immunization | Vaccine home, schedule, and multi-vaccine recording in one sitting. |

---

## 6. Postnatal care (PNC)

| Feature | What it does |
|---|---|
| New PNC visit | Structured postnatal visit for the mother. |
| PNC report | Review and print the PNC summary. |
| Edit PNC visits | 7-day self-edit or TMO approval for older records. |
| Postpartum history | Historical PNC context on the record. |

---

## 7. High-risk pregnancy follow-up

| Feature | What it does |
|---|---|
| High Risk Pregnancy Tracker (HRT) | Facility- and role-scoped list of women with a high-risk ANC assessment. |
| Status cards | Active, overdue, defaulted, and completed counts. |
| Communication | Call patient, emergency contact, and community health worker. |
| Official HRT SMS (MOH deployment) | Midwife previews approved Myanmar SMS by risk factor and gestational age, can send one or more official messages, or write a custom SMS. |
| Phone capture on SMS | If the record has no mobile number, the midwife can enter one and save it to the patient file. |
| Complete tracking | Mark follow-up complete with outcome (alive, transfer, death) when clinically appropriate. |
| New ANC from the list | Open another ANC visit without leaving the follow-up workflow. |

SMS uses the MOH SMSPoh account and official 14 August HRT copy. It is enabled on the MNCH Firebase project only, not on the pilot project. KMC / generic ANC / PNC SMS are not in the app yet.

---

## 8. Transfers and continuity

| Feature | What it does |
|---|---|
| Patient transfers hub | Send a transfer and see incoming requests. |
| Transfer request | Choose a receiving facility (in-app or non-app site) and receiving midwife where applicable. |
| Accept transfer | Receiving side accepts the patient onto their caseload. |
| Visit edit approvals | TMOs review one-time edit requests for records older than 7 days. |

---

## 9. Analytics and reports

| Feature | What it does |
|---|---|
| Analytics dashboard | Role-scoped charts: ANC coverage, early ANC, visit counts, anemia, high-risk, township comparisons, transfers, and related MNCH indicators. Midwives see their own data; supervisors see a wider scope. |
| Midwife report | Individual midwife activity / service report. |
| Township report | A4-oriented printable township health report with charts. |
| Scoreboard (leaderboard) | Rankings from server-scored clinical activity, with an explanation of how points are calculated. |
| Overall / lab / patient-info reports | Additional printable clinical and laboratory views. |

Dashboard and scoreboard numbers come from **backend summaries**, not from downloading the entire national database into the phone.

---

## 10. Quality improvement and quality assurance

See [QI/QA feature summary](./qi-qa-features.md) for management detail. In the product these screens exist:

- Quality Improvement hub (role-gated)
- Clinical data-based assessment (scores from records already in the app)
- Hard-copy database upload (Excel, Word, or photos of paper records)
- Newborn and antenatal competency score views
- Monthly targets and improvement reasons (knowledge, infrastructure, drugs, supplies, laboratory, other)
- Review Actions for supervisors to read midwife plans and comment
- Periodic readiness checklists (ANC, labour, postnatal, newborn)
- Facility visit assessment (in-person supervisor reports)
- Scheduled virtual visits
- Facility QI reports

---

## 11. Learning and support at the facility

| Feature | What it does |
|---|---|
| CME hub | Continuous medical education. |
| Mandatory CME | Required learning modules. |
| Optional CME | Additional learning modules. |
| Labour protocols and emergencies | Clinical reference during labour. |
| ANC health education | Patient counselling content on the same device used for the visit. |
| In-app user manual | Orientation material for users. |

---

## 12. Administration and operations

| Feature | What it does |
|---|---|
| Manage users | Approve accounts; maintain midwife, TMO, and regional user labels (authorised roles). |
| Admin tools | Super Admin operations such as email and password administration. |
| Settings | User/device settings. |
| Sync control | Manual sync from the home toolbar when connectivity returns. |
| Audit logging | Client audit helper for important actions (used with server-side rules). |
| Offline status | Visible banner when the app is offline or waiting to sync. |

---

## 13. Feature availability by role (summary)

| Area | Midwife | TMO | Regional | Super Admin |
|---|---|---|---|---|
| Register and give care | Yes (own / care-team) | Township scope | Region scope | National tools |
| HRT / KMC lists | Own scope | Wider township/region filters | Wider filters | Full operational access |
| Send HRT SMS | Yes (MOH project) | View facility contact, no send | View, no send | Operational, not the midwife send path |
| Township report | No | Yes | Yes | Yes |
| Visit-edit approvals | Request | Review | — | Yes |
| QI hub | Own scores and plans | Review / comment | Review / comment | Full |
| Manage users | No | Limited | Limited | Yes |

---

## 14. Related documents

- [System design and architecture](./system-design-and-architecture.md)
- [QI/QA feature summary](./qi-qa-features.md)
- [Point-of-care midwife quality features](./point-of-care-midwife-quality.md)
