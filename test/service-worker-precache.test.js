'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

function extractPrecacheArray(source, name) {
  const re = new RegExp('const ' + name + ' = \\[([\\s\\S]*?)\\];');
  const match = source.match(re);
  assert.ok(match, name + ' not found in service-worker.js');
  return match[1]
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith("'./") || line.startsWith('"./'))
    .map((line) => line.replace(/[',]/g, ''));
}

test('service worker precache lists only existing files and no background HTML', () => {
  const source = read('service-worker.js');
  assert.doesNotMatch(source, /dashboard-v3/);
  assert.doesNotMatch(source, /report-facility/);

  const install = extractPrecacheArray(source, 'INSTALL_PRECACHE');
  const deferred = extractPrecacheArray(source, 'DEFERRED_SHELL_PRECACHE');
  const background = extractPrecacheArray(source, 'BACKGROUND_PRECACHE');

  background.forEach((file) => {
    assert.doesNotMatch(file, /\.html$/i, 'background precache must not include HTML: ' + file);
  });

  install.concat(deferred).concat(background).forEach((file) => {
    const diskPath = path.join(root, file.replace(/^\.\//, ''));
    assert.ok(fs.existsSync(diskPath), 'missing precache file: ' + file);
  });
});
