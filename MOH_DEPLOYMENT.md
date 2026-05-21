# MOH Netlify Deployment (Separate Firebase)

This branch (`mnch-moh`) is prepared to run against a separate MOH Firebase project without changing the current pilot branch/database.

## What Changed

- `js/firebase.js` loads runtime config from `/firebase.runtime-config.json` first.
- If runtime config is missing, the code falls back to embedded defaults.
- `netlify.toml` is added and forces `firebase.runtime-config.json` to be uncached.

## Required Before Sharing With Client

1. Create a separate Firebase project for MOH.
2. Open `firebase.runtime-config.json`.
3. Replace every `REPLACE_WITH_...` value with the MOH Web App Firebase config from Firebase Console.
4. Deploy branch `mnch-moh` to a separate Netlify site.
5. Verify in browser console that this message appears:
   - `Runtime Firebase config loaded for project: <moh-project-id>`

## Safety Checklist (Do Not Break Pilot)

- Keep pilot app deployed from its existing branch/site.
- Do not copy MOH runtime config into pilot branch.
- Do not point pilot Netlify site to `mnch-moh`.
- Validate MOH login/users only in MOH Firebase project.

## Rules Note

You can keep the same Firestore rule model as pilot, but deploy it to the MOH Firebase project separately and test role access with MOH test accounts.

