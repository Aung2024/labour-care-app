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

function recordsById(entries) {
  const result = new Map();
  (entries || []).forEach((entry) => result.set(entry.id, entry.data));
  return result;
}

function visitWeight(data, baby) {
  const source = baby || data || {};
  const visit = Number.parseInt(source.visit_number || source.visitNumber || data.visit_number || data.visitNumber, 10) || 1;
  const current = grams(source.current_weight_gram != null ? source.current_weight_gram : source.visit_weight_gram);
  if (current) return current;
  if (visit <= 1) return grams(source.body_weight_gram || source.birthWeightGram || source.birth_weight_gram);
  return null;
}

function babyPoints(entry, babyIndex) {
  const data = entry.data || {};
  const date = dateFrom(data, ['visit_date', 'visitDate', 'timestamp', 'createdAt', 'created_at']);
  const visitNumber = Number.parseInt(data.visit_number || data.visitNumber, 10) || 0;
  const points = [];
  const push = (index, baby) => {
    if (index !== babyIndex) return;
    const hours = hoursValue(
      (baby && (baby.kmc_hours_per_day != null ? baby.kmc_hours_per_day : baby.kmcHoursPerDay))
      ?? data.kmc_hours_per_day
    );
    points.push({
      date,
      visitNumber,
      weight: visitWeight(data, baby || data),
      hours,
    });
  };
  if (Array.isArray(data.babies) && data.babies.length) {
    data.babies.forEach((baby, index) => {
      const indexValue = Number.parseInt(baby && (baby.babyIndex || baby.baby_index), 10) || index + 1;
      push(indexValue, baby);
    });
  } else if (Array.isArray(data.kmc_babies) && data.kmc_babies.length) {
    data.kmc_babies.forEach((baby, index) => {
      const indexValue = Number.parseInt(baby && (baby.babyIndex || baby.baby_index), 10) || index + 1;
      push(indexValue, baby);
    });
  } else {
    push(Number.parseInt(data.babyIndex || data.baby_index, 10) || 1, data);
  }
  return points;
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

function blankPlace() {
  return {
    newbornCareBabies: 0,
    newbornCareServices: 0,
    within48h: 0,
    day3to42: 0,
    after42: 0,
    timingUnknown: 0,
    pretermLbw: 0,
    kmcYes: 0,
    kmcTwoVisits: 0,
    weightDiffs: [],
    hourAverages: [],
    transfers: 0,
    accepted: 0,
    external: 0,
  };
}

async function main() {
  const { db, cleanup } = await initializeFirestore();
  try {
    const data = await loadData(db);
    const canonicalIds = canonicalNewbornPatientIds(data.patients);
    const places = { Pyinmana: blankPlace(), Tatkon: blankPlace(), Other: blankPlace() };
    const timing = { within48h: 0, day3to42: 0, after42: 0, unknown: 0 };
    const unknownReason = { noVisitDate: 0, noBirthDate: 0, visitBeforeBirth: 0 };
    let immediateHeadcount = 0;
    let newbornHeadcount = 0;
    let newbornServices = 0;
    let immediateServices = 0;
    let pretermLbw = 0;
    let kmcYes = 0;
    const weightDiffs = [];
    const hourAverages = [];
    let kmcWithTwoVisits = 0;
    let kmcTwoVisitsWithWeights = 0;
    let kmcTwoVisitsWithHours = 0;

    data.patients.forEach((patient, patientId) => {
      if (!canonicalIds.has(patientId)) return;
      const place = places[townshipOf(patient)] || places.Other;
      const newborn = data.newbornCare.get(patientId) || [];
      const immediate = data.immediateNewbornCare.get(patientId) || [];
      if (immediate.length) {
        immediateHeadcount += 1;
        immediateServices += immediate.length;
      }
      if (newborn.length) {
        newbornHeadcount += 1;
        newbornServices += newborn.length;
        place.newbornCareBabies += 1;
        place.newbornCareServices += newborn.length;
        const records = recordsById(data.records.get(patientId) || []);
        const linked = collectNewbornEntries(data, patientId);
        const dated = newborn
          .map((entry) => ({
            data: entry.data,
            date: dateFrom(entry.data, ['visitDate', 'visit_date', 'date', 'timestamp', 'createdAt', 'created_at', 'recordedAt']),
          }))
          .filter((entry) => entry.date)
          .sort((left, right) => left.date - right.date);
        const first = dated.length ? dated[0].data : newborn[0].data;
        const visitDate = dated.length ? dated[0].date : null;
        const linkedForBirth = collectNewbornEntries(data, patientId);
        const motherId = String(
          patient.data.mother_patient_id || patient.data.motherPatientId || ''
        ).trim();
        const motherRecords = recordsById((motherId && data.records.get(motherId)) || []);
        let birth = dateFrom(first, ['birth_time', 'birthTime', 'deliveredDateTime', 'deliveryDate']);
        if (!birth) birth = deliveryDateFromNotes(records.deliveryNotes || records.thirdStage || {});
        if (!birth) birth = deliveryDateFromNotes(motherRecords.deliveryNotes || motherRecords.thirdStage || {});
        if (!birth) {
          const babies = canonicalNewbornBabies(linkedForBirth);
          birth = babies.map((baby) => dateFrom(baby, ['birthTime', 'birth_time', 'birthDate'])).find(Boolean) || null;
        }
        const visitDay = yangonDayOrdinal(visitDate);
        const birthDay = yangonDayOrdinal(birth);
        const days = visitDay !== null && birthDay !== null ? visitDay - birthDay : null;
        if (days === null || days < 0) {
          if (!visitDate) unknownReason.noVisitDate += 1;
          else if (!birth) unknownReason.noBirthDate += 1;
          else unknownReason.visitBeforeBirth += 1;
        }
        const bucket = pncTimingBucket(days !== null && days >= 0 ? days : null);
        if (bucket === 'pnc48h') { timing.within48h += 1; place.within48h += 1; }
        else if (bucket === 'pnc42d') { timing.day3to42 += 1; place.day3to42 += 1; }
        else if (bucket === 'pncAfter42d') { timing.after42 += 1; place.after42 += 1; }
        else { timing.unknown += 1; place.timingUnknown += 1; }
      }

      const linked = collectNewbornEntries(data, patientId);
      if (!linked.length) return;
      const anc = (data.antenatalVisits.get(patientId) || [])
        .slice()
        .sort((left, right) => {
          const leftDate = dateFrom(left.data, ['visitDate', 'visit_date', 'timestamp', 'createdAt']);
          const rightDate = dateFrom(right.data, ['visitDate', 'visit_date', 'timestamp', 'createdAt']);
          return (leftDate ? leftDate.getTime() : 0) - (rightDate ? rightDate.getTime() : 0);
        });
      const latestAnc = anc.length ? anc[anc.length - 1].data : {};
      const babies = canonicalNewbornBabies(linked);
      const newbornOnly = linked.filter((entry) => String(entry.path || '').includes('/newborn_care/'));
      babies.forEach((baby) => {
        if (babyIsPretermOrLbw(patient.data, baby, latestAnc)) {
          pretermLbw += 1;
          place.pretermLbw += 1;
        }
        if (!babyHasKmcYes(linked, baby.babyIndex)) return;
        kmcYes += 1;
        place.kmcYes += 1;
        const points = [];
        newbornOnly.forEach((entry) => {
          babyPoints(entry, baby.babyIndex).forEach((point) => points.push(point));
        });
        const distinctVisits = new Set(points.map((point) => `${point.visitNumber}|${point.date ? point.date.getTime() : ''}`));
        if (distinctVisits.size < 2 && points.length < 2) return;
        kmcWithTwoVisits += 1;
        place.kmcTwoVisits += 1;
        const weighed = points
          .filter((point) => point.weight)
          .sort((left, right) => (left.visitNumber - right.visitNumber) || ((left.date ? left.date.getTime() : 0) - (right.date ? right.date.getTime() : 0)));
        if (weighed.length >= 2) {
          kmcTwoVisitsWithWeights += 1;
          weightDiffs.push(weighed[weighed.length - 1].weight - weighed[0].weight);
          place.weightDiffs.push(weighed[weighed.length - 1].weight - weighed[0].weight);
        }
        const hours = points.map((point) => point.hours).filter((value) => value !== null);
        if (hours.length) {
          kmcTwoVisitsWithHours += 1;
          hourAverages.push(hours.reduce((sum, value) => sum + value, 0) / hours.length);
          place.hourAverages.push(hours.reduce((sum, value) => sum + value, 0) / hours.length);
        }
      });
    });

    const transferPatients = new Set();
    data.records.forEach((entries, patientId) => {
      if (!data.patients.has(patientId)) return;
      if (entries.some((entry) => entry.id === 'transferRecord')) transferPatients.add(patientId);
    });
    const requests = await db.collection('patient_transfer_requests').get();
    const byPatient = new Map();
    requests.docs.forEach((doc) => {
      const row = doc.data() || {};
      const patientId = String(row.patientId || '').trim();
      if (!transferPatients.has(patientId)) return;
      if (!byPatient.has(patientId)) byPatient.set(patientId, []);
      byPatient.get(patientId).push(String(row.status || 'pending').toLowerCase());
    });
    let accepted = 0;
    let pendingOnly = 0;
    let rejectedOnly = 0;
    let noRequest = 0;
    let external = 0;
    transferPatients.forEach((patientId) => {
      const place = places[townshipOf(data.patients.get(patientId))] || places.Other;
      place.transfers += 1;
      const record = (data.records.get(patientId) || []).find((entry) => entry.id === 'transferRecord');
      const destination = String((record && record.data && record.data.transferDestination) || '').toLowerCase();
      if (destination === 'external') { external += 1; place.external += 1; }
      const statuses = byPatient.get(patientId) || [];
      if (statuses.includes('accepted')) { accepted += 1; place.accepted += 1; }
      else if (!statuses.length) noRequest += 1;
      else if (statuses.every((status) => status === 'rejected')) rejectedOnly += 1;
      else pendingOnly += 1;
    });

    const result = {
      scope: 'Pyinmana and Tatkon midwife-created patients, same cohort as the 15 October 2026 facility workbook',
      immediateNewbornHeadcount: immediateHeadcount,
      immediateNewbornRecords: immediateServices,
      newbornCareHeadcount: newbornHeadcount,
      newbornCareTiming: timing,
      newbornTimingUnknownReason: unknownReason,
      newbornTimingSum: timing.within48h + timing.day3to42 + timing.after42 + timing.unknown,
      newbornCareServices: newbornServices,
      pretermLbwBabies: pretermLbw,
      kmcYesBabies: kmcYes,
      kmcYesWithAtLeastTwoNewbornVisits: kmcWithTwoVisits,
      weight: {
        babies: kmcTwoVisitsWithWeights,
        averageGrams: mean(weightDiffs),
        values: weightDiffs,
      },
      kmcHours: {
        babies: kmcTwoVisitsWithHours,
        averageHoursPerDay: mean(hourAverages),
        values: hourAverages.map((value) => Math.round(value * 10) / 10),
      },
      transfers: {
        patientsWithTransferRecord: transferPatients.size,
        accepted,
        pendingOnly,
        rejectedOnly,
        noInAppRequest: noRequest,
        markedExternal: external,
      },
      byTownship: Object.fromEntries(Object.entries(places).map(([name, place]) => [name, {
        newbornCareBabies: place.newbornCareBabies,
        newbornCareServices: place.newbornCareServices,
        within48h: place.within48h,
        day3to42: place.day3to42,
        after42: place.after42,
        timingUnknown: place.timingUnknown,
        pretermLbw: place.pretermLbw,
        kmcYes: place.kmcYes,
        kmcTwoVisits: place.kmcTwoVisits,
        weightBabies: place.weightDiffs.length,
        averageWeightGrams: mean(place.weightDiffs),
        hourBabies: place.hourAverages.length,
        averageKmcHours: mean(place.hourAverages),
        transfers: place.transfers,
        accepted: place.accepted,
        external: place.external,
      }])),
    };
    console.log(JSON.stringify(result, null, 2));
  } finally {
    cleanup();
    delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
  }
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
