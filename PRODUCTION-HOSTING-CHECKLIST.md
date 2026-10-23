# Production hosting checklist

The current testing URL is `mnch-v2.netlify.app`. It has shown intermittent
TLS timeouts on one Netlify edge, so it must not be the only URL distributed
to midwives.

## Cloudflare front door

1. Create the approved MOH hostname in Cloudflare.
2. Add a proxied CNAME to the Netlify site hostname.
3. Set SSL/TLS mode to **Full (strict)**.
4. Do not cache:
   - HTML documents
   - `/service-worker.js`
   - `/manifest.json`
   - `/pwa-release-config.json`
   - `/firebase.runtime-config.json`
   - `/js/*.js`
   - `/api/*`
5. Permit long caching only for vendor assets or explicitly versioned files.
6. Confirm POST requests under `/api/*` are never cached.
7. Add the exact hostname to `MOH_DEPLOY_HOSTS` in `js/firebase.js`.
8. Add the exact hostname to Firebase Authentication Authorized Domains.
9. Verify the hostname resolves over both IPv4 and IPv6 from the ministry network.

## Release validation

Run the release-candidate checklist on the custom hostname:

- New Chrome profile
- Existing Chrome profile with an older worker
- Installed Chrome PWA
- Safari on iPhone/iPad
- Login → Home → Patient List → one Firestore read
- Leave Home idle, resume, and open every role-allowed card
- Disconnect the network after offline preparation and test registration,
  patient selection, and ANC only
- Reconnect and confirm Sync uploads each record once

Do not announce the URL to midwives until the exact hostname has passed these
checks. DNS, Cloudflare settings, and Firebase Authorized Domains require
provider-console access and are not controlled by this repository.
