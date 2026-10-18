# PWA release checklist

Use this checklist before presenting the MNCH App or releasing a production change.

## Before pushing

1. Run `npm test`.
2. Confirm `RELEASE_ID` in `service-worker.js` is new for the release.
3. Open the Netlify Deploy Preview in a normal browser and a private window.
4. Test this path:
   - Login
   - Home
   - Patient list
   - One patient record or Firestore read
5. Confirm the browser console has no service-worker install or required-shell errors.

## Supported offline workflows

The supported offline workflows are limited to:

- Registering a new patient
- Selecting a patient already prepared on that device
- Creating a new ANC visit for that patient

HRT, KMC, labour, postnatal, newborn, reports, transfers, administration, dashboards, and other workflows require an active internet connection. They may load their cached interface, but they must not create offline records.

## Before a ministry presentation

1. Open the production URL once while the connection is stable.
2. Sign in and open the Home and patient-list pages.
3. Leave the presentation tab open; do not deploy another version during the presentation.
4. If the app shows an update notice, finish the current workflow, close the app, and reopen it before presenting.
5. Keep a second connection available, such as mobile data, when possible.

## Important update behavior

The app does not forcibly activate a new service worker or reload an open page. This protects Firestore live connections and prevents data-entry interruption. An installed PWA may therefore continue using its current worker until its open pages are closed naturally.

The service worker cache release identifier must change whenever application HTML or JavaScript changes. The new worker validates its required shell before removing old application caches.
