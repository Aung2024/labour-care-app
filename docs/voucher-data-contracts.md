# Voucher data contracts

All currency values use integer minor units. For MMK, the UI converts entered amounts to minor units consistently. Every price must satisfy:

`subsidizedCostMinor = clientCostShareMinor + projectCostShareMinor`

In the UI this is shown as:

`Total cost = Discount price + Project cost share`

Discount price is the amount the client pays. Midwives see only Discount price. Program Officers and Labs also see Total cost.

## Collections

- `voucher_service_catalog/{serviceId}` — Program Officer-managed service definitions and default cost shares.
- `voucher_price_overrides/{labId}__{serviceId}` — optional laboratory cost-share overrides.
- `voucher_price_sheets/{opaqueVersionId}` — immutable published snapshots containing all available services and cost shares for one lab, or the global defaults.
- `voucher_price_assignments/{labId|global}` — current immutable version pointer for a laboratory or the global catalog.
- `voucher_account_quotas/{midwifeId}` — Midwife-readable allocated and remaining voucher counts. No budget fields.
- `voucher_account_budgets/{midwifeId}` — Program Officer-only financial amount and note.
- `vouchers/{shortCode}` — issued voucher, patient/issuer snapshot, selected lab, selected service IDs, immutable price-sheet reference, expiry, and one-time redemption fields.

Legacy `voucher_pricing_versions`, `voucher_quotas`, and `voucher_budgets` rules remain isolated for compatibility but the new UI uses the account quota, account budget, and complete price-sheet contracts above.

## Voucher states

- `issued` — created by an active Midwife in the same transaction that decrements one quota unit.
- `redeemed` — the only allowed update, performed by one active Lab. The record is retained permanently.

Vouchers are not deleted. Expiry is derived from `expiresAt`; an expired issued voucher cannot be redeemed.

## Privacy boundary

The QR payload is only:

```json
{"v":1,"c":"AB3K-9Q2M"}
```

It contains no name, phone, NRC, patient ID, prices, or test names. Voucher details are fetched from Firestore only after an authenticated Lab supplies the code. New codes are 8 unambiguous characters shown as `XXXX-XXXX`. Existing 22-character codes remain valid.

## Role boundary

- Midwife: own quota and own vouchers; no budget access. The midwife selects a laboratory at issuance so the voucher uses that lab’s prices.
- Lab: direct lookup by voucher code and listing only records redeemed by that Lab. A voucher assigned to another lab cannot be redeemed.
- Program Officer: profiles’ permitted display fields, catalog, overrides, price sheets, quotas, budgets, and all reports.
- Role, approval, and login credential management: manual administrator bootstrap only.
