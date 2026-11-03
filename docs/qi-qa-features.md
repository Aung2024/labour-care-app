# QI / QA Feature Summary

**Product:** Maternal, Newborn and Child Health (MNCH) Care App  
**Audience:** Programme, quality, and management stakeholders  
**As of:** September 2026

This document answers: **which parts of the app help Quality Improvement (QI) and Quality Assurance (QA)?**  
It separates (a) the dedicated Quality Improvement module from (b) routine clinical features that generate the evidence QI/QA needs.

---

## 1. How this app treats QI and QA

**Quality Assurance (QA)** here means: can we see whether essential care was actually given, documented, and followed up — at midwife, facility, township, and region level?

**Quality Improvement (QI)** here means: can a midwife and her supervisor see a gap, set a target, name a reason, and review actions over time?

The app does both:

1. **Measure from real patient records** (not a separate survey-only database, unless paper records are uploaded).
2. **Support a plan–do–study–act loop**: score → target → reason → supervisor review.
3. **Assess the facility system** (readiness, supervisor visits), not only the individual midwife.

The Quality Improvement card on the home screen is **role-gated**. Midwives edit their own plans. TMOs and regional officers can review and comment. Super Admin can see the full module.

---

## 2. Dedicated Quality Improvement module

### 2.1 Hub

`Quality Improvement` is a separate workspace with:

- Clinical Data-based Assessment
- Periodic Readiness Assessment
- Facility Visit Assessment
- Progress and target tracking

The hub chart is a **target-versus-actual** view (for example eye care / TEO). Live monthly results appear when the backend quality months have been computed for that provider.

### 2.2 Clinical data-based assessment (competency scores)

This is the core QI measurement engine.

**Existing database.** Scores are calculated from ANC visits, ANC tests, immediate newborn care, and newborn follow-up visits already saved in the app. No extra “QI form” is required for those indicators.

**Hard-copy database.** Facilities that still use paper can upload Excel, Word, or photographs so those records can enter the QI pathway.

**Newborn indicators** (examples of what is scored)

- Immediate skin-to-skin contact
- Thorough drying at birth
- Delayed cord clamping (1–3 minutes)
- Breastfeeding within one hour
- Eye care with tetra eye ointment (TEO)
- Vitamin K on the first day of life
- Vital signs monitoring
- Birth weight recorded
- Full pre-discharge examination (infection, jaundice, cord, visible anomalies)
- Exclusive breastfeeding from birth to discharge
- Follow-up scheduled in the first six weeks (day 3, 7, 14 and 6 weeks)

**Antenatal indicators** (examples of what is scored)

- Early ANC (first visit before 14 weeks)
- Pregnancy dating (LMP/EDD or manual dating)
- Blood pressure recorded
- Weight recorded
- Iron and folic acid prescribed
- Tetanus-diphtheria (TD) status recorded
- Danger-sign screening
- High-risk status documented
- Next ANC visit scheduled
- Provisional diagnosis recorded
- HIV and syphilis results recorded
- Hemoglobin result recorded

Each indicator has a **default target** (typically 80%, with skin-to-skin defaulting to 60%). Midwives can set monthly targets and see actual percentages.

### 2.3 Improvement reasons and Review Actions

When a score is below target, the midwife can record **why**, using programme categories:

- knowledge / training
- infrastructure
- drugs
- supplies and equipment
- laboratory / test
- other

Supervisors use **Review Actions** to open a midwife’s plan, read those reasons, and comment. That is the QA conversation: not only “the percentage is low”, but “this is the barrier and this is the next action”.

### 2.4 Periodic readiness assessment

Checklists for whether the site is **ready** to deliver:

- antenatal care
- labour care
- postnatal care
- newborn care

This is system QA (staff, space, drugs, equipment), complementary to competency scores from patient notes.

### 2.5 Facility visit assessment

- In-person supervisor / facility visit reports
- Scheduled virtual visits
- Facility-level QI reports

These support external QA and mentoring, not only self-assessment.

---

## 3. Routine features that feed QI/QA evidence

These are not labelled “QI” on the home screen, but they are what make the scores honest.

| Feature | QI/QA contribution |
|---|---|
| Structured ANC, labour, newborn, and PNC forms | Same fields are used for care and for indicator numerators/denominators |
| ANC tests | HIV, syphilis, and hemoglobin completeness can be audited |
| High-risk tracker | QA that identified high-risk women are followed, not only flagged |
| HRT SMS (MOH) | Documents that counselling / reminder content was actually sent |
| KMC tracker | QA for small and preterm babies after discharge from birth care |
| 7-day edit rule + TMO approval | Protects the integrity of the dataset used for QI |
| Transfers and joint care | Reduces lost-to-follow-up when the woman moves |
| Analytics dashboard | Coverage, early ANC, anemia, high-risk, and township comparisons for managers |
| Township report | Printable QA pack for township review meetings |
| Midwife scoreboard | Makes completeness and timely care visible as performance, not only as a chart |
| Consent and identity | QA that the right patient is being followed over time |

---

## 4. What managers can do with this

**At midwife / facility level**

- See which essential newborn or ANC practices are missing in *their own* recent records.
- Set a monthly target (for example TEO 80%).
- Name the constraint (no ointment, no training, no lab).
- Discuss the plan with the TMO.

**At township / region level**

- Compare coverage and high-risk burden across townships on the dashboard.
- Print a township report for the monthly meeting.
- Review visit-edit requests (data integrity).
- Open Review Actions across midwives.
- Use readiness and facility-visit modules for supervision.

**At programme / national level**

- One longitudinal clinical database instead of disconnected paper registers.
- QI indicators derived from care, so improvement work is not a parallel reporting burden.
- Separate pilot and MOH environments so national rollout does not overwrite pilot operations.

---

## 5. What this module does not claim yet

To stay accurate with management:

- Quality scores depend on **records being entered**. A practice that was done but not documented will look like a gap.
- Some hub visuals may still show a **worked example** until live months are computed for that user.
- SMS quality support is currently **high-risk ANC follow-up only**.
- Hard-copy upload is a bridge for paper sites; the preferred source remains digital point-of-care entry.

---

## 6. Related documents

- [System design and architecture](./system-design-and-architecture.md)
- [All features](./features.md)
- [Point-of-care midwife quality features](./point-of-care-midwife-quality.md)
