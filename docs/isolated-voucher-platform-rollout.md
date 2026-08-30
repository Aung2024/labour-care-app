# Isolated MNCH Voucher Platform rollout

## Hard safety boundary

- Firebase project: `labourcare-2481a`
- Protected MOH project: `mnch-1cbda`
- Never copy the MOH runtime configuration or a MOH service-account key into this worktree.
- Every Firebase CLI command must include `--project labourcare-2481a`.
- Do not import MOH Auth users or patient data.

## Spark limitations

This release does not use Cloud Functions. Firebase Auth account creation, deletion, login-email changes, and password resets must be completed by an authorized administrator in Firebase Console. Program Officers can edit display names, organization descriptions, active state, pricing, budgets, and voucher allocations only.

## Recommended rollout sequence

Complete these stages in order:

1. Open `/Users/user/Downloads/labour-care-app-isolated` in Cursor and confirm the branch is `mnch-moh-isolated`.
2. Run all local and Firestore Emulator tests.
3. Check the isolated Firebase project and back up its current Firestore rules.
4. Review, commit, and push `mnch-moh-isolated` to Git.
5. Deploy only Firestore rules and indexes to `labourcare-2481a`.
6. Create one Program Officer, one Lab, and at least one Midwife test account manually.
7. Use the Program Officer account to configure tests, prices, voucher allocations, and budgets.
8. Deploy `mnch-moh-isolated` to a separate Netlify branch preview/site.
9. Test Program Officer → Midwife → Lab in that order.
10. Review Firestore data, indexes, logs, and usage before inviting pilot users.

Do not connect the isolated Netlify preview to `mnch-1cbda`, and do not deploy Cloud Functions.

## Firebase Console preflight

Before creating accounts or deploying:

1. Open Firebase Console and confirm the project selector says **`labourcare-2481a`**.
2. Under **Project settings → General**, confirm the registered web app values match `firebase.runtime-config.json`.
3. Under **Authentication → Sign-in method**, confirm Email/Password authentication is enabled.
4. Under **Authentication → Settings → Authorized domains**, add the isolated Netlify preview domain when it is known.
5. Under **Firestore Database → Rules**, copy the current rules into a dated backup file before replacing them.
6. Under **Firestore Database → Indexes**, note any existing indexes. After deployment, wait until every new index reports **Enabled**.
7. Under **Functions**, confirm this Spark release does not require or deploy any function.
8. Under **Usage**, take a baseline screenshot of Firestore reads/writes and check it again after UAT.

## Account bootstrap

Create at least these UAT accounts:

- One `Program Officer`
- One `Lab`
- One or more `Midwife` accounts representing maternity homes

For each account:

1. In Firebase Console for `labourcare-2481a`, create the email/password user under Authentication.
2. Copy the generated UID.
3. Create `users/{uid}` in Firestore with:
   - `role`: `Midwife`, `Lab`, or `Program Officer`
   - `name`: display name
   - `organization_name`: maternity-home or laboratory name
   - `description`: optional
   - `active`: `true`
   - `approved`: `true`
4. For Midwives, retain the existing township, region, facility code, and provider fields required by patient care.
5. Sign in once and verify the correct role dashboard opens.

Do not allow users to choose or edit their own role.

## Local verification

```bash
node scripts/assert-isolated-project.js
npm test
npm run test:rules
```

Use the Firebase Emulator Suite for rule testing before any remote rules deployment.

## Controlled Firebase setup

After local/emulator tests pass and remote deployment is explicitly approved:

```bash
node scripts/assert-isolated-project.js
firebase deploy --only firestore:rules,firestore:indexes --project labourcare-2481a
```

No Functions deployment is required for the Spark release.

After deployment:

1. Confirm the CLI output names `labourcare-2481a`.
2. Open Firestore Rules and verify the latest publish time.
3. Wait for every voucher index to become **Enabled** before testing reports or Lab history.
4. Do not proceed if the Console project selector shows any other project.

## Program setup

1. Bootstrap one Program Officer account manually.
2. Sign in as the Program Officer.
3. Create the global laboratory-service catalog.
   - The **Load standard tests** button can seed the approved starter list with a 10% client / 90% project split.
4. Review all three cost columns and publish the resulting immutable price sheet.
5. Add maternity-home overrides only where needed.
6. Allocate voucher counts and record the internal budget separately.
7. Verify the Midwife sees voucher counts but never the budget.

## Role-based acceptance tests

Run the roles in this order because each stage creates data required by the next stage.

### Program Officer

- Sign-in redirects to `program-officer.html`; clinical home cards are not shown.
- Load the standard tests, then review Total cost, Discount price, and Project cost share.
- Confirm each row satisfies Total cost = Discount price + Project cost share.
- Add any laboratory override and verify a new immutable price sheet is published for that lab.
- Allocate voucher count and budget to the test Midwife.
- Edit a provider display name, description, and active state.
- Confirm role, email, and password cannot be changed from the page.
- Confirm budgets are visible here only.

### Midwife

- Existing registration and patient-care pages still work.
- Register or select a test patient with phone and optional NRC.
- Open **Tests & Results → Use Voucher**.
- Confirm patient phone uses the patient `phone` field, not emergency or community-health-worker phone.
- Confirm discount prices are read-only and come from the selected laboratory’s Program Officer configuration.
- Select the destination laboratory, then select tests and issue one voucher.
- NRC is optional and patient phone prefill uses `phone`.
- Voucher creation fails offline.
- One issued voucher decrements remaining quota exactly once.
- The QR payload contains only a short voucher code.
- A5 PNG shows the human-readable voucher details, including Discount price and the selected lab.
- Exhaust the test quota and confirm an additional voucher is rejected.

### Lab

- Sign-in redirects to `lab-vouchers.html`; clinical home cards are not shown.
- QR scan and manual code entry locate an issued voucher. Typed codes can omit the hyphen.
- The Lab sees voucher details only after authentication.
- Redeeming once submits it to Program Officers.
- Reusing the QR or racing two Labs cannot redeem it twice.
- History shows only vouchers redeemed by that Lab.
- A disabled Lab account cannot look up or redeem vouchers.

### Final Program Officer reconciliation

- The redeemed voucher appears in the report with the correct maternity home, Lab, tests, and cost.
- Reports default to the latest three months and filter by date, status, maternity home, and Lab.
- Midwife quota shows one fewer remaining voucher.
- The budget remains absent from Midwife and Lab views.
- Issued and redeemed records remain in Firestore; no financial records are deleted.

## Netlify preview

Use a separate Netlify site or branch preview for `mnch-moh-isolated`.

Before signing in:

1. Open `https://YOUR-PREVIEW-DOMAIN/firebase.runtime-config.json`.
2. Confirm it returns `"projectId": "labourcare-2481a"`.
3. Confirm the preview domain is listed in Firebase Authentication authorized domains.
4. Clear site data if this exact browser origin was ever used with another Firebase project.
5. Test in a private/incognito window first.

Do not promote the preview until all three role test sets pass.

## Firestore post-test inspection

After UAT, verify these collections in `labourcare-2481a`:

- `users`
- `voucher_service_catalog`
- `voucher_price_overrides`
- `voucher_price_sheets`
- `voucher_price_assignments`
- `voucher_account_quotas`
- `voucher_account_budgets`
- `vouchers`

For the test voucher, confirm:

- The document ID is a short code such as `AB3K-9Q2M`, or a legacy 22-character code.
- Status changed only from `issued` to `redeemed`.
- `selectedServiceIds`, `labId`, and `priceSheetId` are present.
- `redeemedBy` and `redeemedAt` identify the Lab submission.
- No budget value exists in the quota or voucher document.
- The QR itself contains no patient name, phone, NRC, test names, or prices.

## Later trusted-backend upgrade

Before high-value financial scale, enable a trusted backend and move Auth administration, voucher issuance, and redemption into server-side operations. Retain the same Firestore contracts so the UI migration is incremental.
