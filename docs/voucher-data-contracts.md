# Voucher data contracts

All currency values use integer minor units. For MMK, the UI converts entered amounts to minor units consistently. Every price must satisfy:

`subsidizedCostMinor = clientCostShareMinor + projectCostShareMinor`

## Collections

- `voucher_service_catalog/{serviceId}` — Program Officer-managed service definitions and default cost shares.
- `voucher_price_overrides/{midwifeId}__{serviceId}` — optional maternity-home cost-share overrides.
- `voucher_price_sheets/{opaqueVersionId}` — immutable published snapshots containing all available services and cost shares.
- `voucher_price_assignments/{midwifeId|global}` — current immutable version pointer.
- `voucher_account_quotas/{midwifeId}` — Midwife-readable allocated and remaining voucher counts. No budget fields.
- `voucher_account_budgets/{midwifeId}` — Program Officer-only financial amount and note.
- `vouchers/{opaqueCode}` — issued voucher, patient/issuer snapshot, selected service IDs, immutable price-sheet reference, expiry, and one-time redemption fields.

Legacy `voucher_pricing_versions`, `voucher_quotas`, and `voucher_budgets` rules remain isolated for compatibility but the new UI uses the account quota, account budget, and complete price-sheet contracts above.

## Voucher states

- `issued` — created by an active Midwife in the same transaction that decrements one quota unit.
- `redeemed` — the only allowed update, performed by one active Lab. The record is retained permanently.

Vouchers are not deleted. Expiry is derived from `expiresAt`; an expired issued voucher cannot be redeemed.

## Privacy boundary

The QR payload is only:

```json
{"v":1,"c":"22-character-opaque-code"}
```

It contains no name, phone, NRC, patient ID, prices, or test names. Voucher details are fetched from Firestore only after an authenticated Lab supplies the unguessable code.

## Role boundary

- Midwife: own quota and own vouchers; no budget access.
- Lab: direct lookup by opaque code and listing only records redeemed by that Lab.
- Program Officer: profiles’ permitted display fields, catalog, overrides, price sheets, quotas, budgets, and all reports.
- Role, approval, and login credential management: manual administrator bootstrap only.
