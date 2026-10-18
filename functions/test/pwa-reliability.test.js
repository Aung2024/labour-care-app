const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '../..')
const readAppFile = (relativePath) => {
  return fs.readFileSync(path.join(root, relativePath), 'utf8')
}

test('stable worker has an atomic core shell and bounded network requests', () => {
  const sw = readAppFile('service-worker.js')

  const requiredPaths = [
    '/index.html',
    '/login.html',
    '/home.html',
    '/list.html',
    '/offline.html',
    '/js/firebase.js',
    '/js/offline-store.js',
    '/js/offline-sync.js'
  ]

  requiredPaths.forEach((requiredPath) => {
    assert.match(sw, new RegExp(requiredPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  })

  assert.match(sw, /cacheInBatches\(cache, REQUIRED_SHELL\)/)
  assert.match(sw, /CACHE_BATCH_SIZE = 6/)
  assert.match(sw, /RELEASE_ID = '20261018-navigation-stability'/)
  assert.match(sw, /required-shell-incomplete/)
  assert.match(sw, /fetchWithTimeout/)
  assert.match(sw, /AbortController/)
  assert.match(sw, /caches\.match\(cacheKey\)/)
  assert.match(sw, /caches\.match\(OFFLINE_PAGE\)/)
  assert.match(sw, /Serving offline fallback/)
  assert.match(sw, /network-error/)
  assert.match(sw, /navigationPreload\.enable/)
  assert.match(sw, /preloadResponse: event\.preloadResponse/)
  assert.match(sw, /event\.respondWith\(cacheFirst\(request\)\)/)
  assert.match(sw, /Response was delivered but could not be cached/)
  assert.doesNotMatch(sw, /skipWaiting/)
  assert.doesNotMatch(sw, /clients\.claim/)
  assert.doesNotMatch(sw, /location\.reload/)
})

test('worker bypasses sensitive and non-app traffic', () => {
  const sw = readAppFile('service-worker.js')

  assert.match(sw, /request\.method !== 'GET'/)
  assert.match(sw, /requestUrl\.origin !== self\.location\.origin/)
  assert.match(sw, /firebase\.runtime-config\.json/)
  assert.match(sw, /pathname === '\/api'/)
  assert.match(sw, /pathname\.startsWith\('\/api\/'\)/)
  assert.match(sw, /pathname === '\/service-worker\.js'/)
})

test('registration has one owner and never reloads an active page', () => {
  const registerSw = readAppFile('js/register-sw.js')
  const authGuard = readAppFile('js/auth-guard.js')

  assert.match(registerSw, /serviceWorker\.register/)
  assert.match(registerSw, /updateViaCache:\s*'none'/)
  assert.match(registerSw, /registration\.update/)
  assert.match(registerSw, /registration\.waiting/)
  assert.match(registerSw, /mnchUpdateNotice/)
  assert.match(registerSw, /Tap Update to prepare it safely/)
  assert.match(registerSw, /Update ready/)
  assert.match(registerSw, /current work will not be interrupted/)
  assert.match(registerSw, /mnchServiceWorkerUpdateAcknowledged/)
  assert.match(registerSw, /hasAcknowledgedUpdate/)
  assert.match(registerSw, /clearAcknowledgedUpdate/)
  assert.doesNotMatch(registerSw, /Dismiss/)
  assert.doesNotMatch(registerSw, /unregister/)
  assert.doesNotMatch(registerSw, /controllerchange/)
  assert.doesNotMatch(registerSw, /location\.reload/)
  assert.doesNotMatch(authGuard, /serviceWorker|getRegistrations|caches\.keys/)
})

test('stable shell includes Login, Home, List, and update dependencies', () => {
  const sw = readAppFile('service-worker.js')
  const requiredPaths = [
    '/patient-enhanced.html',
    '/patient-consent.html',
    '/antenatal-form.html',
    '/js/consent-manager.js',
    '/js/session-manager.js',
    '/js/status-manager.js',
    '/js/sync-manager.js',
    '/js/ui-dialogs.js',
    '/js/service-closure.js',
    '/css/compact-app-bar.css'
  ]

  requiredPaths.forEach((requiredPath) => {
    assert.match(sw, new RegExp(requiredPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  })
})

test('common online clinical routes have optional cached page shells', () => {
  const sw = readAppFile('service-worker.js')
  const optionalRoutes = [
    '/patient-care-hub.html',
    '/high-risk-tracking.html',
    '/kmc-tracking.html',
    '/vaccine-home.html',
    '/immediate-newborn-care.html',
    '/newborn-care-page.html'
  ]

  optionalRoutes.forEach((route) => {
    assert.match(sw, new RegExp(route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  })
})

test('offline storage allowlist supports registration and ANC only', () => {
  const offlineManager = readAppFile('js/offline-manager.js')
  const patientHub = readAppFile('patient-care-hub.html')

  assert.match(offlineManager, /pending_patients/)
  assert.match(offlineManager, /pending_anc_visits/)
  assert.match(offlineManager, /isOfflineStoreSupported/)
  assert.match(offlineManager, /This feature is not available offline/)
  assert.match(patientHub, /antenatal-form\.html\?patient=/)
  assert.match(patientHub, /'postnatal'/)
  assert.match(patientHub, /'newborn'/)
})

test('entry router is synchronous and login can render before Firebase', () => {
  const index = readAppFile('index.html')
  const login = readAppFile('login.html')
  const manifest = JSON.parse(readAppFile('manifest.json'))

  assert.doesNotMatch(index, /firebase-app\.js|onAuthStateChanged/)
  assert.match(index, /localStorage\.getItem\('rememberMe'\)/)
  assert.match(index, /Date\.parse\(rawExpiry\)/)
  assert.match(index, /window\.location\.replace\(destination\)/)
  assert.equal(manifest.start_url, './index.html')

  assert.match(login, /<form id="loginForm"/)
  assert.match(login, /<script defer src="js\/vendor\/firebase-app\.js"/)
  assert.match(login, /id="continueOfflineBtn"/)
  assert.match(login, /hasValidRememberedSession/)
  assert.doesNotMatch(login, /fonts\.googleapis\.com/)
})

test('cache headers keep HTML and the worker fresh', () => {
  const netlify = readAppFile('netlify.toml')

  assert.match(netlify, /for = "\/\*\.html"[\s\S]*no-cache, must-revalidate/)
  assert.match(netlify, /for = "\/service-worker\.js"[\s\S]*no-store, no-cache, must-revalidate/)
  assert.match(netlify, /for = "\/manifest\.json"[\s\S]*no-store, no-cache, must-revalidate/)
  assert.match(netlify, /for = "\/css\/style\.css"[\s\S]*no-cache, must-revalidate/)
  assert.match(netlify, /for = "\/firebase\.runtime-config\.json"[\s\S]*no-store, no-cache/)
})

test('offline fallback explains request failure without claiming all connectivity is lost', () => {
  const offline = readAppFile('offline.html')

  assert.match(offline, /data-fallback-reason="unknown"/)
  assert.match(offline, /This page could not be loaded/)
  assert.match(offline, /does not necessarily mean your device is fully offline/)
  assert.match(offline, /home\.html/)
})

test('offline readiness is recorded only after a completed mirror pull', () => {
  const offlineSync = readAppFile('js/offline-sync.js')
  const home = readAppFile('home.html')

  assert.match(offlineSync, /OFFLINE_READY_KEY_PREFIX/)
  assert.match(offlineSync, /markOfflineReady\(uid, patientSnaps\.length\)/)
  assert.match(home, /updateOfflineReadinessStatus/)
  assert.match(home, /typeof LabourCareOffline\.getOfflineReadiness === 'function'/)
  assert.match(home, /markHomeOfflineReadyFallback/)
  assert.match(home, /navigator\.serviceWorker\.getRegistration/)
  assert.match(home, /rememberMe/)
  assert.match(home, /Offline ready/)
  assert.match(home, /Sync required/)
})
