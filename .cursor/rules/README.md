# Cursor rules for MNCH app

Agent and editor guidance for this repository.

## Files

| File | Purpose |
|------|---------|
| `product-quality-principles.mdc` | Always-on quality bar: clinical UX, performance, scale, **mobile/iPad/Safari**, PWA cache updates |

## Mobile / device checklist (every UI change)

- iPhone and iPad Safari, installed PWA, and Android Chrome
- Safe areas (`env(safe-area-inset-*)`), 44px touch targets, compact headers
- Phone (~375px), tablet (~768px), desktop breakpoints
- Bump `service-worker.js` `CACHE_NAME` when shipping static asset changes

See **Mobile, iPad, and Safari** in `product-quality-principles.mdc` for full requirements.
