# Cursor rules for MNCH app

Agent and editor guidance for this repository.

## Files

| File | Purpose |
|------|---------|
| `product-quality-principles.mdc` | Always-on quality bar: clinical UX, performance, scale, **mobile/iPad/Safari**, PWA cache updates |
| `testing-branch-development.mdc` | Testing-branch service-worker policy and shared pilot Firestore safeguards |

## Mobile / device checklist (every UI change)

- iPhone and iPad Safari, installed PWA, and Android Chrome
- Safe areas (`env(safe-area-inset-*)`), 44px touch targets, compact headers
- Phone (~375px), tablet (~768px), desktop breakpoints
- Bump `service-worker.js` `CACHE_NAME` only for the approved production/midwife release. The current testing branch keeps the service worker disabled so client-review changes appear immediately.

See **Mobile, iPad, and Safari** in `product-quality-principles.mdc` for full requirements.
