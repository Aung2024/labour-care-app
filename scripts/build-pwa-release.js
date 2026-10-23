const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const mode = process.env.PWA_RELEASE_MODE || 'testing'
const releaseId = process.env.PWA_RELEASE_ID || '20261018-navigation-stability'
const enabled = mode === 'production'

const config = {
  enabled,
  channel: mode,
  releaseId
}

fs.writeFileSync(
  path.join(root, 'pwa-release-config.json'),
  `${JSON.stringify(config, null, 2)}\n`
)

const serviceWorkerPath = path.join(root, 'service-worker.js')
const serviceWorker = fs.readFileSync(serviceWorkerPath, 'utf8')
const updatedServiceWorker = serviceWorker.replace(
  /const RELEASE_ID = '[^']+'/,
  `const RELEASE_ID = '${releaseId}'`
)
fs.writeFileSync(serviceWorkerPath, updatedServiceWorker)

console.log(`Prepared ${mode} PWA release ${releaseId}; worker enabled: ${enabled}`)
