# User Manual Screenshots

Mobile viewport (iPhone 13). Filenames match `m-MNCH_Care_User_Manual.docx` placeholders.

Capture:
```bash
npm install --prefix scripts playwright
npx --prefix scripts playwright install chromium
MANUAL_EMAIL=you@example.com MANUAL_PASSWORD=secret node scripts/capture-manual-screenshots.mjs
```

Long forms use **two mobile screenshots** (top + scrolled section), e.g. ANC, PNC, Newborn, Registration alerts.

## Files

- `01-login.png` — ok
- `02-registration.png` — ok
- `03-registration-success.png` — ok
- `03-provider-consent.png` — ok_login_flow
- `04-home.png` — ok
- `28-home-cards.png` — ok
- `05-patient-registration.png` — ok
- `05b-registration-alerts.png` — ok
- `06-patient-consent.png` — ok
- `07-patient-list.png` — ok
- `08-patient-care-hub.png` — ok
- `09-anc-hub.png` — ok
- `10-anc-form-top.png` — ok
- `10-anc-form-vitals.png` — ok
- `10-anc-form.png` — skipped_legacy
- `11-anc-report.png` — ok
- `12-anc-tests.png` — ok
- `13-labour-setup.png` — ok
- `14-lcg-entry.png` — ok
- `15-lcg-summary.png` — ok
- `16-transfer.png` — ok
- `17-newborn-hub.png` — ok
- `18-newborn-form.png` — ok
- `18-newborn-identity.png` — ok
- `18-newborn-vitals-kmc.png` — ok
- `19-newborn-report.png` — ok
- `20-pnc-hub.png` — ok
- `21-pnc-form-top.png` — ok
- `21-pnc-form-exam.png` — ok
- `21-pnc-form.png` — skipped_legacy
- `22-pnc-report.png` — ok
- `23-vaccine-home.png` — ok
- `24-vaccine-record.png` — ok
- `25-overall-report.png` — ok
- `26-print-report.png` — ok
- `27-offline-sync.png` — ok