const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')

test('generated manifest covers every static application asset', () => {
  const manifest = read('js/pwa-route-manifest.js')
  const assetPaths = []

  const collect = (directory, prefix) => {
    for (const name of fs.readdirSync(path.join(root, directory))) {
      const relative = path.join(prefix, name)
      const absolute = path.join(root, relative)
      if (fs.statSync(absolute).isDirectory()) {
        collect(relative, relative)
      } else if (/\.(?:js|css)$/i.test(name)) {
        assetPaths.push(`/${relative.split(path.sep).join('/')}`)
      }
    }
  }

  collect('js', 'js')
  collect('css', 'css')
  assetPaths.forEach((asset) => assert.match(manifest, new RegExp(asset.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))))
})

test('warm app survives an origin timeout through the validated shell', () => {
  const worker = read('service-worker.js')

  assert.match(worker, /const NETWORK_TIMEOUT_MS = 8000/)
  assert.match(worker, /if \(options\.preferCache && cachedResponse\)/)
  assert.match(worker, /if \(cachedResponse\)/)
  assert.match(worker, /Serving offline fallback/)
  assert.match(worker, /return Response\.error\(\)/)
})

test('release lifecycle preserves old sessions and never force-reloads', () => {
  const worker = read('service-worker.js')
  const registration = read('js/register-sw.js')

  assert.match(worker, /hasCompleteRequiredShell/)
  assert.match(worker, /deleteLegacyCaches/)
  assert.doesNotMatch(worker, /skipWaiting/)
  assert.doesNotMatch(worker, /clients\.claim/)
  assert.doesNotMatch(registration, /location\.reload/)
  assert.doesNotMatch(registration, /controllerchange/)
  assert.match(registration, /registration\.waiting/)
})

test('offline policy does not silently queue unsupported workflows', () => {
  const policy = read('js/offline-policy.js')
  const manager = read('js/offline-manager.js')
  const sync = read('js/sync-manager.js')

  assert.match(policy, /pending_patients/)
  assert.match(policy, /pending_anc_visits/)
  assert.match(manager, /if \(!offlineStoreSupported\)/)
  assert.match(manager, /This feature is not available offline/)
  assert.match(sync, /isSupportedOfflineStore/)
})

test('release test matrix names the required browser states', () => {
  const checklist = read('PWA-RELEASE-CHECKLIST.md')

  for (const state of [
    'fresh browser',
    'existing browser with an older worker',
    'installed PWA',
    'Chrome',
    'Safari',
    'Login',
    'Patient List'
  ]) {
    assert.match(checklist, new RegExp(state.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'))
  }
})
