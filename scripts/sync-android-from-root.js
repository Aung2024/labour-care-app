const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const androidPublicDir = path.join(rootDir, 'android', 'app', 'src', 'main', 'assets', 'public');

const rootFiles = [
  'manifest.json',
  'service-worker.js',
  'firebase.runtime-config.json'
];

const rootFileExtensions = new Set(['.html']);
const assetDirs = ['css', 'js', 'icons', 'images', 'languages', 'docs'];

function removeDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function copyFile(src, dest) {
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
}

function copyDir(srcDir, destDir) {
  if (!fs.existsSync(srcDir)) return;
  ensureDir(destDir);

  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const src = path.join(srcDir, entry.name);
    const dest = path.join(destDir, entry.name);

    if (entry.isDirectory()) {
      copyDir(src, dest);
    } else if (entry.isFile()) {
      copyFile(src, dest);
    }
  }
}

function syncAndroidAssets() {
  removeDir(androidPublicDir);
  ensureDir(androidPublicDir);

  for (const entry of fs.readdirSync(rootDir, { withFileTypes: true })) {
    if (!entry.isFile()) continue;

    const ext = path.extname(entry.name);
    if (rootFileExtensions.has(ext) || rootFiles.includes(entry.name)) {
      copyFile(path.join(rootDir, entry.name), path.join(androidPublicDir, entry.name));
    }
  }

  for (const dir of assetDirs) {
    copyDir(path.join(rootDir, dir), path.join(androidPublicDir, dir));
  }

  console.log(`Synced root web app to ${path.relative(rootDir, androidPublicDir)}`);
}

syncAndroidAssets();
