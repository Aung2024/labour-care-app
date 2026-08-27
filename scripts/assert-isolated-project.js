#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const EXPECTED_PROJECT_ID = 'labourcare-2481a';
const BLOCKED_PROJECT_IDS = new Set(['mnch-1cbda']);
const projectDir = process.env.PROJECT_DIR || path.resolve(__dirname, '..');

function parseFirebaseConfigProject() {
  if (!process.env.FIREBASE_CONFIG) return null;
  try {
    return JSON.parse(process.env.FIREBASE_CONFIG).projectId || null;
  } catch (error) {
    throw new Error('FIREBASE_CONFIG is not valid JSON.');
  }
}

function readDefaultProject() {
  const rcPath = path.join(projectDir, '.firebaserc');
  const rc = JSON.parse(fs.readFileSync(rcPath, 'utf8'));
  return rc && rc.projects && rc.projects.default;
}

const candidates = [
  process.env.GCLOUD_PROJECT,
  process.env.GOOGLE_CLOUD_PROJECT,
  parseFirebaseConfigProject(),
  readDefaultProject()
].filter(Boolean);

if (!candidates.length) {
  throw new Error('Cannot determine Firebase project. Refusing to continue.');
}

for (const projectId of candidates) {
  if (BLOCKED_PROJECT_IDS.has(projectId)) {
    throw new Error(`Protected MOH project blocked: ${projectId}`);
  }
  if (projectId !== EXPECTED_PROJECT_ID) {
    throw new Error(`Unexpected Firebase project ${projectId}; expected ${EXPECTED_PROJECT_ID}.`);
  }
}

console.log(`Firebase project guard passed: ${EXPECTED_PROJECT_ID}`);
