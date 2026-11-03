# Features That Improve Midwife Quality at the Point of Care

**Product:** Maternal, Newborn and Child Health (MNCH) Care App  
**Audience:** Programme, training, and management stakeholders  
**As of:** September 2026

This document answers: **which features help a midwife give better care in the room, at the bedside, or in the community — at the moment of care?**

It is not a list of every report. It is the set of tools that change what happens **while the woman or baby is in front of the midwife**.

---

## 1. What “point of care” means here

Point of care is the ANC visit, the labour room, the first hour after birth, the PNC visit, the immunization session, and the follow-up call or SMS to a high-risk mother.

Features help midwife quality at that moment if they:

- **prompt** the next correct action
- **standardise** what is asked and recorded
- **surface danger** so it is not missed
- **put a protocol or counselling aid** on the same screen
- **close the loop** (next visit, transfer, SMS, KMC)
- **teach** without leaving the clinic workflow

Supervisor dashboards still matter for QA, but they are usually used *after* the visit. Those are covered in [QI/QA feature summary](./qi-qa-features.md).

---

## 2. Structured clinical forms (the strongest daily quality tool)

The ANC, labour, immediate newborn, newborn follow-up, PNC, and vaccine forms are not blank notes. They encode MOH-relevant steps as required or highly visible fields.

**How this improves practice**

- The midwife is walked through danger-sign screening, blood pressure, weight, dating, medicines, and a next-visit date — not only “ANC done”.
- Immediate newborn care asks for skin-to-skin, drying, delayed cord clamping, early breastfeeding, TEO, and vitamin K at the time of birth, not in a later memory exercise.
- Immunization allows several vaccines to be recorded in one sitting, which reduces missed antigens before the family leaves.

**Quality effect:** fewer skipped steps, more complete records, and a dataset that later QI scores can trust.

---

## 3. Decision support and alerts during the visit

| Feature | Point-of-care quality effect |
|---|---|
| High-risk pregnancy assessment | Forces an explicit yes/no and risk-factor list. A “yes” keeps the woman on the HRT list until follow-up is completed. |
| Danger-sign screening (ANC and newborn) | Makes red-flag symptoms a routine part of the visit, not an optional note. |
| Gestational-age / LMP–EDD tools | Correct dating drives early ANC, trimester-specific counselling, and correct HRT SMS templates. |
| Labour monitoring / partograph-style charts | Supports timely recognition of prolonged or obstructed labour. |
| Third-stage prompt on the care hub | Reminds the midwife to complete third-stage care, a common quality gap. |
| Follow-up badges on home / lists | Shows overdue ANC or KMC work before the midwife opens a random chart. |
| QI target reminders on ANC forms | While recording the visit, the midwife can see which competency targets she is working on (for example TEO or early ANC). |

---

## 4. Protocols and counselling on the same device

Midwives do not need a separate binder or a second app for the common teaching moments.

| Feature | When it is used | Quality effect |
|---|---|
| Labour protocols | During labour | Standard management instead of recall alone |
| Labour emergency protocols | During a crisis | Faster, shared emergency steps |
| ANC health education (pregnancy health, nutrition, self-care, breastfeeding) | During ANC, recommended by gestational age | Consistent counselling; content matches trimester |
| CME mandatory and optional modules | Between patients or on quiet clinic days | Knowledge and skills refresh tied to the same workforce |

This is **just-in-time learning**. It improves the midwife’s quality of decision-making and of patient communication, not only her reporting.

---

## 5. Closing the loop after the visit

Quality fails when the visit was good but nobody comes back.

| Feature | Point-of-care action | Quality effect |
|---|---|
| Next ANC / PNC / newborn date | Set before the woman leaves | Converts a visit into a plan |
| High Risk Tracker + call buttons | Call mother, emergency contact, or CHW from the list | Active follow-up of the women most likely to die or lose the baby |
| HRT SMS (MOH) | Send the official message for the selected risk(s), or a custom reminder; add a phone if missing | Standard health education reaches the household that day |
| KMC tracker | Keep small / preterm babies visible after birth | Prevents KMC from stopping when the delivery form is closed |
| Transfer + joint care | Hand over with Patient ID and receiving midwife | Continuity when the woman is referred |
| Care hub overall report | Review the whole story with the family or receiving clinician | Fewer conflicting histories |

---

## 6. Data integrity at the bedside (so quality is real)

- Midwives can correct a mistake for **7 days**.
- After that, a **TMO one-time approval** is required. That discourages silent rewriting of the record used for QI and township reports.
- Patient phone on registration, and phone save from HRT SMS, means the midwife can actually contact the woman.
- Consent and identity fields reduce care being entered on the wrong chart.

These rules improve midwife *practice quality* by making the chart a reliable clinical instrument, not only a reporting form.

---

## 7. Feedback that changes the next patient, not only the monthly meeting

Two features sit between “point of care” and “supervision”, and both change how a midwife behaves with the *next* woman:

1. **Competency scores from her own recent records**  
   If TEO is 8% this month, she sees it. The next birth is the improvement opportunity.

2. **Scoreboard**  
   Completeness and timely practices are visible among peers. Used carefully, this rewards doing the essential steps, not only seeing more patients.

3. **Review Actions with the TMO**  
   The midwife names a barrier (no drug, no training, no lab). The supervisor can act on the system problem so the midwife is not blamed for a stock-out.

---

## 8. Mapping: feature → midwife skill or behaviour

| Midwife quality dimension | Features that support it at the point of care |
|---|---|
| Clinical completeness | Structured ANC / labour / ENC / PNC / vaccine forms |
| Recognition of risk | High-risk assessment, danger signs, labour charts, HRT list |
| Adherence to essential newborn care | Immediate newborn form + QI newborn indicators + target reminders |
| Counselling skill | Gestational-age education modules + official HRT SMS copy |
| Emergency readiness | Labour emergency protocols; readiness checklists (facility system) |
| Continuity and reliability | Next-visit dates, transfers, joint care, KMC and HRT follow-up |
| Learning culture | CME; QI reasons; supervisor comments |
| Honest documentation | Edit window, TMO approval, locked delivery notes |

---

## 9. What supervisors should not expect these features to replace

- The app **prompts and records**; it does not examine the patient.
- A protocol page is not a substitute for drills and stocks.
- SMS is a reminder and education channel, not a clinical consultation.
- Scores will look poor if care is given but not entered — that is also a quality signal about documentation discipline.

---

## 10. Related documents

- [System design and architecture](./system-design-and-architecture.md)
- [All features](./features.md)
- [QI/QA feature summary](./qi-qa-features.md)
