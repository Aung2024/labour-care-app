# m-MNCH Care — User Flow Diagram

**Updated:** July 2026  
**Audience:** Midwives, trainers, user-manual authors  
**Purpose:** Decision-style flowcharts for *what to do when a patient arrives* and how care modules connect.

For screen-by-screen navigation (file names), see [APP-SITEMAP.md](./APP-SITEMAP.md).

---

## 1. Session start

```mermaid
flowchart TD
    A[Open app] --> B{Logged in?}
    B -->|No| C[login.html]
    C --> D{Provider consent<br/>accepted?}
    D -->|No| E[provider-consent.html]
    D -->|Yes| F[home.html]
    E --> F
    B -->|Yes| F

    F --> G{What do you need?}
    G --> H[Register new patient]
    G --> I[Find existing patient]
    G --> J[Other modules<br/>Transfers, KMC, HRT, Reports, CME…]
```

---

## 2. Patient incoming — new or existing?

**Always search the list first** before registering. Duplicate phone numbers are blocked; similar names show a warning.

```mermaid
flowchart TD
    START[Patient arrives] --> SEARCH[Home → Select Patient for Care<br/>list.html]

    SEARCH --> Q{Found in list?}
    Q -->|Yes| FILTER{Mommy or Baby?}
    Q -->|No| NEW[Home → Patient Registration<br/>patient-enhanced.html]

    FILTER -->|Mommy tab| MOM[Open Patient Care Hub<br/>patient-care-hub.html]
    FILTER -->|Baby tab| BAB[Open Patient Care Hub<br/>baby context]

    NEW --> REGTYPE{Age entered}
    REGTYPE -->|Age ≥ 12| MOTHER_REG[Register as MOTHER<br/>parity, pregnancy fields]
    REGTYPE -->|Age &lt; 12| BABY_REG[Register as BABY<br/>birth time, sex, mother name]

    MOTHER_REG --> DUP{Duplicate check}
    BABY_REG --> MOTHER_LINK{Existing mother<br/>in system?}
    MOTHER_LINK -->|Yes| LINK[Link to mother record]
    MOTHER_LINK -->|No| STUB[Create/link at consent step]

    DUP -->|Phone duplicate| BLOCK[Stop — use existing patient]
    DUP -->|Name similar| WARN[Confirm new vs existing]
    DUP -->|Clear| CONSENT

    LINK --> CONSENT
    STUB --> CONSENT
    WARN --> CONSENT[patient-consent.html<br/>sign or verbal agreement]

    CONSENT --> LIST[list.html]
    LIST --> MOM
    LIST --> BAB
```

### Quick rules

| Situation | Action |
|-----------|--------|
| Woman already in system | **Select Patient** → Mommy filter → open hub |
| Baby already in system | **Select Patient** → Baby filter → open hub |
| New pregnant woman | **Register** → age ≥ 12 → consent → hub |
| New baby (not from delivery notes) | **Register** → age &lt; 12 → mother details → consent → hub |
| Baby born during care here | **Do not register manually** — use **Delivery Notes** on mother hub (auto-creates baby) |

---

## 3. Mommy care journey (full pathway)

```mermaid
flowchart LR
    subgraph Register
        R1[Register mother]
        R2[ANC visits]
    end

    subgraph Labour
        L1[LCG setup / entry]
        L2[Partograph monitoring]
        L3[Delivery Notes]
    end

    subgraph AfterBirth
        N1[Baby record auto-created]
        P1[PNC visits]
    end

    R1 --> R2 --> L1 --> L2 --> L3
    L3 --> N1
    L3 --> P1
```

### From Patient Care Hub (mother selected)

```mermaid
flowchart TD
    HUB[Patient Care Hub — MOTHER]

    HUB --> ANC[Antenatal Care<br/>antenatal-care.html]
    HUB --> LAB[Labour Care]
    HUB --> DEL[Delivery Notes modal]
    HUB --> PNC[Postpartum Care<br/>postpartum-care.html]
    HUB --> REP[Overall Patient Report]

    ANC --> ANC1[Record ANC visit]
    ANC --> ANC2[Lab tests]
    ANC --> ANC3[Health education]
    ANC --> ANC4[ANC report]
    ANC1 -->|Danger / referral| TR1[transfer-patient.html]

    LAB --> LCG1{Active 1st stage<br/>time set?}
    LCG1 -->|No| SETUP[labour-care-setup.html]
    LCG1 -->|Yes| ENTRY[labour-care-entry.html]
    SETUP --> ENTRY
    ENTRY --> SUM[summary.html — Classic LCG chart]
    LAB --> CAR[Carousel LCG path<br/>setup → entry]

    DEL --> AUTO[Auto-create BABY patient(s)<br/>linked to mother]
    AUTO --> BABLIST[Visible on list — Baby filter]

    PNC --> PNC1[Record PNC visit]
    PNC --> PNC2[PNC report]

    REP --> OVER[overall-patient-report.html<br/>ANC + labour + PNC + newborn summary]
```

### Care stage vs list status

| Stage in app | Typical list status |
|--------------|---------------------|
| Registered, no ANC yet | Registered |
| ANC in progress | Antenatal |
| In labour / LCG active | Intrapartum |
| Delivered / PNC / newborn | Postnatal |

---

## 4. Baby care journey

Babies exist as **first-class patients** (`patient_type: baby`), linked to mother via `mother_patient_id`.

### How a baby record is created

```mermaid
flowchart TD
    BSTART[Need baby record] --> PATH{How?}

    PATH -->|Normal workflow| DN[Mother hub → Delivery Notes → Save]
    DN --> AUTO[Baby patient auto-created<br/>name, weight, sex, birth time]

    PATH -->|Baby arrived from elsewhere<br/>or manual entry| MAN[Register with age &lt; 12]
    MAN --> MANUAL[Baby patient + link/create mother]

    AUTO --> BHUB[Baby Patient Care Hub]
    MANUAL --> BHUB
```

### From Patient Care Hub (baby selected)

Mother-only cards (ANC, Labour, PNC) are **hidden**. Baby cards are shown.

```mermaid
flowchart TD
    BHUB[Patient Care Hub — BABY]

    BHUB --> ENC[Essential Newborn Care hub<br/>immediate-newborn-care.html]
    BHUB --> IMM[Immunization<br/>vaccine-home.html]
    BHUB --> BREP[Newborn Report<br/>newborn-report.html]

    ENC --> INC[Immediate newborn care form<br/>once per baby]
    ENC --> VIS[Newborn care visits<br/>newborn-care-page.html]
    ENC --> NREP[Newborn report]
    ENC --> EDIT[Edit visit within window<br/>visit-edit.html]

    VIS --> KMC{KMC Yes?}
    KMC -->|Yes| KMCLOG[Log hours, vitals, weight]
    KMC -->|No| REASON[Record reason category]

    IMM --> SCHED[Schedule view]
    IMM --> DOSE[Record dose<br/>vaccine-record.html]

    KMCLOG --> TRACK{Eligible for KMC tracker?<br/>LBW &lt;2000g or preterm}
    TRACK -->|Yes| KMCHOME[Home → KMC Tracker<br/>kmc-tracking.html]
```

---

## 5. Select patient list behaviour

```mermaid
flowchart TD
    LIST[list.html]

    LIST --> PT[Patient type chip]
    PT --> M[Mommy — default]
    PT --> B[Baby]

    LIST --> ST[Status chip]
    ST --> ALL[All]
    ST --> REG[Registered]
    ST --> ANT[Antenatal]
    ST --> INT[Intrapartum]
    ST --> POS[Postnatal]

    LIST --> SRCH[Search name / phone / ID]
    SRCH --> EMPTY{No results on<br/>current tab?}
    EMPTY -->|Matches on other tab| HINT[Hint: Switch to Mommy/Baby]

    LIST --> TAP[Tap patient row]
    TAP --> HUB[patient-care-hub.html]
    TAP -->|LCG-only mode| LCGHUB[patient-care-hub-lcg.html]

    LIST --> ED[Edit patient<br/>edit-patient.html]
```

---

## 6. Transfers & joint care

```mermaid
flowchart TD
    subgraph Send
        S1[During ANC / LCG / PNC / newborn] --> S2[transfer-patient.html]
        S2 --> S3[Send request to receiving midwife]
    end

    subgraph Receive
        R1[Home → Patient Transfers] --> R2[patient-transfers.html]
        R2 --> R3{Incoming request}
        R3 -->|Accept| R4[Patient in your list]
        R3 -->|Reject| R5[Request closed]
    end

    subgraph Joint
        J1[Home → Joint Care<br/>joint-care.html] --> J2[Enter baby serial / ID]
        J2 --> J3[Open baby care without full list search]
    end
```

---

## 7. Reports & follow-up modules

```mermaid
flowchart TD
    HOME[home.html]

    HOME --> MR[Midwife Report<br/>mother activities only]
    HOME --> DASH[Analytics Dashboard]
    HOME --> HRT[High Risk Tracking]
    HOME --> KMC[KMC Tracker]
    HOME --> SB[Scoreboard / CME]

    HUBM[Mother hub] --> OVR[Overall Patient Report]
    HUBB[Baby hub] --> NWR[Newborn Report]

    OVR --> PRINT[Print / share PDF]
    NWR --> PRINT
```

| Report | Patient type | Shows |
|--------|--------------|-------|
| Overall Patient Report | Mother | ANC, labour, PNC, newborn summary |
| Newborn Report | Baby | Birth details, visits, immunization |
| Midwife Report | — | Mother-side visits (no baby rows) |
| ANC / PNC report | Mother | Module-specific history |

---

## 8. Offline & sync (high level)

```mermaid
flowchart TD
    OFF{Offline?}
    OFF -->|Yes| OK[Registration, ANC, some PNC<br/>may queue locally]
    OFF -->|Yes| NO[LCG, Delivery Notes, Immunization,<br/>Transfers, some reports — online only]

    OK --> SYNC[Home → Sync when online]
    SYNC --> CLOUD[Upload pending patients & visits]
```

---

## 9. One-page “midwife at the door” cheat sheet

```
Patient arrives
    │
    ├─ Know them already? ──YES──► Select Patient → search → open hub
    │
    └─ New? ──► Register
              │
              ├─ Pregnant woman (age ≥ 12) ──► mother form → consent → ANC path
              │
              └─ Baby (age < 12) ──► baby form + mother link → consent → newborn path
                                         │
                                         └─ Prefer: mother Delivery Notes instead (auto baby)

Mother hub pathway
    Register → ANC → Labour (LCG) → Delivery Notes → PNC
                              │
                              └─ creates linked baby record(s)

Baby hub pathway
    Essential Newborn (immediate + visits) → Immunization → Newborn report
                              │
                              └─ KMC tracker if LBW / preterm criteria met

Emergency / referral anytime
    Transfer patient  OR  Joint care (baby serial lookup)
```

---

## 10. Related docs

| Document | Use for |
|----------|---------|
| [APP-SITEMAP.md](./APP-SITEMAP.md) | Screen file names and navigation map |
| [MIDWIFE-USER-MANUAL.md](./MIDWIFE-USER-MANUAL.md) | Step-by-step training text |
| [user-manual-assets/README.md](./user-manual-assets/README.md) | Screenshot filenames for manual |

---

## Notes (current app behaviour)

- **Delivery Notes → auto baby** is the intended workflow after birth; manual baby registration is for babies not born through this facility’s delivery record.
- **Mommy / Baby** are separate list filters; search can hint when matches exist on the other tab.
- **Baby registration** (age &lt; 12) links to an existing mother when found; otherwise a minimal mother link is created at consent.
- **Patient Care Hub** shows different cards for mother vs baby (`data-care-audience`).
- **KMC Tracker** lists babies meeting low-birth-weight / preterm rules, not every baby with KMC Yes on a visit.
