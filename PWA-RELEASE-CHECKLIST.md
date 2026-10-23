# PWA release checklist

Use this checklist before presenting the MNCH App or releasing a production change.

## Testing branch (`version-2-upgrade`)

1. Run `npm test`.
2. Confirm `pwa-release-config.json` has `"enabled": false`.
3. Open the testing URL in Chrome and Safari, then test Login, Home, Patient List, and one Firestore read.
4. Confirm Chrome DevTools has no failed same-origin document, CSS, or JavaScript requests.
5. Do not present this branch as the offline-ready midwife release.

## Release candidate

1. Run `npm test` and `npm run build:pwa-manifest`.
2. Prepare a unique release:

   `PWA_RELEASE_MODE=production PWA_RELEASE_ID=YYYYMMDD-description npm run build:pwa-release`

3. Confirm the generated `pwa-release-config.json` has `"enabled": true`.
4. Test a fresh browser, an existing browser with an older worker, and an installed PWA.
5. Test Login → correct Home cards → Patient List → one Firestore read.
6. Turn off the network after the shell and patient mirror are ready. Confirm supported offline workflows still open and unsupported workflows show a clear online-only message.
7. Restore the network and tap Sync. Confirm queued records upload once and no duplicate patient appears.
8. Do not delete the previous cache until the new worker reports a complete required shell.

## Supported offline workflows

The supported offline workflows are limited to:

- Registering a new patient
- Selecting a patient already prepared on that device
- Creating a new ANC visit for that patient

HRT, KMC, labour, postnatal, newborn, reports, transfers, administration, dashboards, and other workflows require an active internet connection. They may load their cached interface, but they must not create offline records.

## Before a ministry presentation

1. Open the production custom-domain URL once while the connection is stable.
2. Sign in and open the Home and patient-list pages.
3. Leave the presentation tab open; do not deploy another version during the presentation.
4. If the app shows an update notice, tap **Update**. Wait for **Ready**, finish the current workflow, and open the app normally before presenting.
5. Keep a second connection available, such as mobile data, when possible.

## Important update behavior

The app does not forcibly activate a new service worker or reload an open page. This protects Firestore live connections and prevents data-entry interruption. An installed PWA may therefore continue using its current worker until its open pages are closed naturally.

The **Update** button downloads and verifies the waiting release without replacing code in the middle of a clinical workflow. The browser applies it automatically on a later app start after the old page is no longer active. Users do not need to clear browser data or reinstall the PWA.

The service worker cache release identifier must change whenever application HTML or JavaScript changes. The new worker validates its required shell before removing old application caches.

## Production front door

The bare `mnch-v2.netlify.app` hostname has shown intermittent edge timeouts on this network. Before midwife rollout:

1. Point the approved MOH custom hostname at Netlify through Cloudflare proxy.
2. Use Full (strict) TLS.
3. Do not cache HTML, `/service-worker.js`, `/manifest.json`, `/pwa-release-config.json`, `/firebase.runtime-config.json`, `/js/*.js`, or `/api/*`.
4. Only cache vendor assets or explicitly versioned static assets for a long duration.
5. Add the exact hostname to `MOH_DEPLOY_HOSTS` in `js/firebase.js`.
6. Add the hostname to Firebase Authentication Authorized Domains.
7. Run the release-candidate checks again on the custom hostname.
