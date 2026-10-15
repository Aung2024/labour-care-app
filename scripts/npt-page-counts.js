#!/usr/bin/env node
'use strict';

const path = require('node:path');
const { FacilityConfig } = require(path.join(__dirname, '..', 'js', 'facility-config.js'));
const {
  initializeFirestore,
  loadData,
  canonicalNewbornBabies,
  canonicalNewbornPatientIds,
  babyIsPretermOrLbw,
  babyHasKmcYes,
  collectNewbornEntries,
  yangonDayOrdinal,
  deliveryDateFromNotes,
  pncTimingBucket,
} = require('./export-facility-application-data');

function asDate(value) {
  if (!value) return null;
  if (typeof value.toDate === 'function') {
    const date = value.toDate();
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'object' && typeof value.seconds === 'number') return new Date(value.seconds * 1000);
  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

function dateFrom(data, fields) {
  for (const field of fields) {
    const date = asDate(data && data[field]);
    if (date) return date;
  }
  return null;
}

function grams(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return null;
  return number < 30 ? Math.round(number * 1000) : Math.round(number);
}

function hoursValue(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 24) return null;
  return number;
}

function mean(values) {
  if (!values.length) return null;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
}

function townshipOf(patient) {
  const code = String(
    (patient && patient.facilityCode) ||
    (patient && patient.data && (patient.data.facility_code || patient.data.facilityCode)) ||
    ''
  ).trim();
  const facility = FacilityConfig.getFacilityByCode(code);
  if (facility && (facility.township === 'Pyinmana' || facility.township === 'Tatkon')) return facility.township;
  const township = String(patient && patient.data && patient.data.township || '').trim();
  if (township === 'Pyinmana' || township === 'Tatkon') return township;
  return 'Other';
}

function isBaby(profile) {
  return ['baby', 'newborn', 'child'].includes(
    String(profile.patient_type || profile.patientType || '').toLowerCase()
  );
}

function recordsById(entries) {
  const result = new Map();
  (entries || []).forEach((entry) => result.set(entry.id, entry.data));
  return result;
}

function blank() {
  return {
    immediateBabies: 0,
    newbornCareBabies: 0,
    newbornCareServices: 0,
    within48h: 0,
    day3to42: 0,
    after42: 0,
    timingUnknown: 0,
    pretermLbw: 0,
    kmcYesBabies: 0,
    kmcTwoVisits: 0,
    weightDiffs: [],
    hourAverages: [],
    transfers: 0,
    accepted: 0,
    external: 0,
    pending: 0,
    rejected: 0,
  };
}

function pageTotal(row) {
  return row.enrolled === true || row.status === 'complete';
}

async function main() {
  const { db, cleanup } = await initializeFirestore();
  try {
    const scopes = await db.collection('analytics_v32_periods').doc('all').collection('scopes').get();
    const dashboard = [];
    scopes.docs.forEach((doc) => {
      const data = doc.data() || {};
      if (data.department || data.facilityType) return;
      if (!['national', 'region', 'township'].includes(data.geographyType)) return;
      const newborn = (data.metrics && data.metrics.newborn) || {};
      if (!newborn.immediateClients && !newborn.clients && !newborn.kmcYes) return;
      dashboard.push({
        geographyType: data.geographyType,
        geographyId: data.geographyId,
        immediateClients: newborn.immediateClients || 0,
        nbcClients: newborn.clients || 0,
        kmcYes: newborn.kmcYes || 0,
        preterm: newborn.preterm || 0,
        under2Kg: newborn.under2Kg || 0,
        pretermAndUnder2Kg: newborn.pretermAndUnder2Kg || 0,
      });
    });

    const trackingSnap = await db.collection('tracking_v2_kmc').get();
    const tracking = { regions: {}, townships: {}, pageRows: [] };
    trackingSnap.docs.forEach((doc) => {
      const row = doc.data() || {};
      const region = row.region || '(blank region)';
      const township = row.township || '(blank township)';
      if (!tracking.regions[region]) tracking.regions[region] = { rows: 0, enrolled: 0, complete: 0, pageTotal: 0 };
      const regionBucket = tracking.regions[region];
      regionBucket.rows += 1;
      if (row.enrolled) regionBucket.enrolled += 1;
      if (row.status === 'complete') regionBucket.complete += 1;
      if (pageTotal(row)) regionBucket.pageTotal += 1;
      if (!tracking.townships[township]) {
        tracking.townships[township] = { rows: 0, enrolled: 0, complete: 0, pageTotal: 0, region };
      }
      const townshipBucket = tracking.townships[township];
      townshipBucket.rows += 1;
      if (row.enrolled) townshipBucket.enrolled += 1;
      if (row.status === 'complete') townshipBucket.complete += 1;
      if (pageTotal(row)) townshipBucket.pageTotal += 1;
    });

    const immediateParents = new Set();
    const immediateSnap = await db.collectionGroup('immediate_newborn_care').get();
    immediateSnap.docs.forEach((doc) => {
      const parent = doc.ref.parent && doc.ref.parent.parent;
      if (parent) immediateParents.add(parent.id);
    });

    console.log(JSON.stringify({
      dashboard,
      trackingDocs: trackingSnap.size,
      immediateDocs: immediateSnap.size,
      immediateParents: immediateParents.size,
      regions: tracking.regions,
      townships: tracking.townships,
    }, null, 2));
  } finally {
    cleanup();
    delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
  }
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
