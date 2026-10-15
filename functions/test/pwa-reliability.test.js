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

  assert.match(sw, /cache\.addAll\(REQUIRED_SHELL\)/)
  assert.match(sw, /required-shell-incomplete/)
  assert.match(sw, /fetchWithTimeout/)
  assert.match(sw, /AbortController/)
  assert.match(sw, /caches\.match\(cacheKey\)/)
  assert.match(sw, /caches\.match\(OFFLINE_PAGE\)/)
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
  assert.doesNotMatch(registerSw, /unregister/)
  assert.doesNotMatch(registerSw, /controllerchange/)
  assert.doesNotMatch(registerSw, /location\.reload/)
  assert.doesNotMatch(authGuard, /serviceWorker|getRegistrations|caches\.keys/)
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
  assert.match(netlify, /for = "\/firebase\.runtime-config\.json"[\s\S]*no-store, no-cache/)
})

test('offline readiness is recorded only after a completed mirror pull', () => {
  const offlineSync = readAppFile('js/offline-sync.js')
  const home = readAppFile('home.html')

  assert.match(offlineSync, /OFFLINE_READY_KEY_PREFIX/)
  assert.match(offlineSync, /markOfflineReady\(uid, patientSnaps\.length\)/)
  assert.match(home, /updateOfflineReadinessStatus/)
  assert.match(home, /navigator\.serviceWorker\.getRegistration/)
  assert.match(home, /rememberMe/)
  assert.match(home, /Offline ready/)
  assert.match(home, /Sync required/)
})
