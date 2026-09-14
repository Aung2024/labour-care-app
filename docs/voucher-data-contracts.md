# Voucher data contracts

All currency values use integer minor units. For MMK, the UI converts entered amounts to minor units consistently.

Invoice math:

- Regular price `R` and Lab cost share `L` are set by the Program Officer for each test at each lab.
- Hidden subsidized cost `S = R - L`.
- One project/client split is set per lab (`projectPercent + clientPercent = 100`).
- Client co-payment `C = round(S * clientPercent / 100)`.
- Project contribution `P = S - C`.

`C + P` always equals `S`. The invoice never shows `S`. Visible columns are Regular Price, Lab Cost share, Client Co- payment, and Project Contribution/ Client Received Amount.

Issued vouchers snapshot `lineItems` and `totals` so later price edits do not rewrite history.

## Collections

- `voucher_service_catalog/{serviceId}` — 16 standard laboratory tests used as the seed list.
- `voucher_lab_configs/{labId}` — per-lab name, address, percent split, and enabled tests with `R` and `L`.
- `voucher_price_sheets/{opaqueVersionId}` — immutable published snapshots for one lab or global defaults, including `pricesByServiceId` for rule-checked line-item prices.
- `voucher_price_assignments/{labId|global}` — current immutable version pointer.
- `voucher_account_quotas/{midwifeId}` — Midwife-readable allocated and remaining voucher counts. No budget fields.
- `voucher_account_budgets/{midwifeId}` — Program Officer-only financial amount and note.
- `vouchers/{shortCode}` — issued invoice snapshot, selected tests, line items, totals, and status audit.
- `vouchers/{shortCode}/artifacts/signatures` — compressed client, cashier, seal, and Program Officer images.
- `lab_settings/{labId}` — lab seal and up to three cashier names/signatures.
- `po_settings/{uid}` — Program Officer name, designation, and signature.
- `voucher_period_stats/{scope_period}` — monthly counts and project-amount totals for dashboards. Writes must include `lastVoucherId` and `lastStatus` and happen in the same transaction as that voucher’s status change.

Legacy `voucher_price_overrides`, `voucher_pricing_versions`, `voucher_quotas`, and `voucher_budgets` rules remain for compatibility. The UI uses lab configs, account quotas, account budgets, and price sheets.

## Voucher states

- `issued` — created by an active Midwife in the same transaction that decrements one quota unit.
- `redeemed` — Lab submitted the invoice after optional catalog-only line edits and a client signature.
- `verified` — Program Officer accepted the redeemed invoice. Lab cash incoming is the project contribution.
- `paid` — Program Officer recorded project payment. Lab money received is the project contribution.
- `rejected` — Program Officer rejected the redeemed invoice. This is terminal. Quota stays consumed.

Vouchers are not deleted. Expiry is derived from `expiresAt`; an expired issued voucher cannot be redeemed.

## Privacy boundary

The QR payload is only:

```json
{"v":1,"c":"AB3K-9Q2M"}
```

It contains no name, phone, NRC, patient ID, prices, or test names. Voucher details are fetched from Firestore only after an authenticated Lab or Program Officer supplies the code. New codes are 8 unambiguous characters shown as `XXXX-XXXX`. Existing 22-character codes remain valid.

## Role boundary

- Midwife: own quota and own vouchers; no budget access. The midwife selects a laboratory at issuance so the voucher uses that lab’s prices. Address is stored on the patient and on the voucher snapshot.
- Lab: lookup by voucher code, list vouchers assigned to that lab, edit selected catalog tests while issued, redeem with cashier and client signature. Labs cannot verify, reject, or mark paid.
- Program Officer: lab configuration and prices, allocations and hidden budgets, verification/payment, dashboards, and signature settings.
- Role, approval, and login credential management: manual administrator bootstrap only.
