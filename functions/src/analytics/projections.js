'use strict';

const { firstDate, normalizeOutcome, toDate, unwrap } =
  require('../shared/clinical-normalizers');

const DAY_MS = 86400000;
const HRT_SCHEMA_VERSION = 'tracking-hrt-v1';
const KMC_SCHEMA_VERSION = 'tracking-kmc-v1';
const HRT_COLLECTION = 'tracking_v2_hrt';
const KMC_COLLECTION = 'tracking_v2_kmc';
const HRT_COMPLETE_REASONS = new Set([
  'completed', 'delivered_safely', 'death', 'transferred', 'transfer',
  'loss_of_contact', 'lost_to_followup', 'abortion'
]);
const KMC_COMPLETE_TYPES = new Set(['kmc_resolved', 'resolved']);

const HRT_PROJECTION_CONTRACT = Object.freeze({
  schemaVersion: HRT_SCHEMA_VERSION,
  collection: HRT_COLLECTION,
  documentKey: '{patientId}'
});
const KMC_PROJECTION_CONTRACT = Object.freeze({
  schemaVersion: KMC_SCHEMA_VERSION,
  collection: KMC_COLLECTION,
  documentKey: '{patientId}_{babyIndex}'
});

function dateOnly(value) {
  const date = toDate(value);
  if (!date) return null;
  return new Date(Date.UTC(
    date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()
  ));
}

function isoDate(value) {
  const date = dateOnly(value);
  return date ? date.toISOString().slice(0, 10) : null;
}

function addDays(value, days) {
  const date = dateOnly(value);
  return date ? new Date(date.getTime() + days * DAY_MS) : null;
}

function addCalendarMonths(value, months) {
  const date = dateOnly(value);
  if (!date) return null;
  const day = date.getUTCDate();
  const result = new Date(Date.UTC(
    date.getUTCFullYear(), date.getUTCMonth() + months, 1
  ));
  const lastDay = new Date(Date.UTC(
    result.getUTCFullYear(), result.getUTCMonth() + 1, 0
  )).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}

function latest(records, dateFields) {
  return (records || []).map(unwrap).filter(Boolean).sort((a, b) => {
    const aDate = firstDate(a, dateFields) || new Date(0);
    const bDate = firstDate(b, dateFields) || new Date(0);
    const aVisit = Number(a.visitNumber || a.visit_number || 0);
    const bVisit = Number(b.visitNumber || b.visit_number || 0);
    return bVisit - aVisit || bDate - aDate;
  })[0] || null;
}

function completedVisitCount(records) {
  const visits = (records || []).map(unwrap);
  const maximum = visits.reduce((value, visit) => Math.max(
    value, Number(visit.visitNumber || visit.visit_number || 0)
  ), 0);
  return Math.min(8, maximum || visits.length);
}

function effectiveEdd(facts) {
  const profile = facts.profile || facts.registration || {};
  const anc = latest(facts.antenatalVisits, ['visitDate', 'visit_date', 'recordedAt']);
  return firstDate(profile, ['edd', 'EDD', 'maternal_edd', 'manualEdd', 'manual_edd']) ||
    firstDate(anc, ['edd', 'EDD', 'manualEdd', 'manual_edd']);
}

function effectiveLmp(facts) {
  const profile = facts.profile || facts.registration || {};
  const profileLmp = firstDate(profile, ['lmp']);
  if (profileLmp) return profileLmp;
  const visits = (facts.antenatalVisits || []).map(unwrap).sort((a, b) =>
    Number(a.visitNumber || 999) - Number(b.visitNumber || 999));
  return firstDate(visits.find((visit) =>
    !['unknown', 'not recorded'].includes(String(visit.lmp || '').toLowerCase())
  ), ['lmp']);
}

function recommendedAncDate(lmp, visitNumber) {
  const monthOffsets = { 2: 5, 3: 6, 4: 7, 5: 8, 6: 8, 7: 9, 8: 9 };
  if (!lmp || !monthOffsets[visitNumber]) return null;
  const date = addCalendarMonths(lmp, monthOffsets[visitNumber]);
  return [6, 8].includes(visitNumber) ? addDays(date, 14) : date;
}

function scopeFields(facts) {
  const scope = facts.scope || {};
  return {
    providerId: scope.providerId || '',
    providerName: scope.providerName || '',
    providerPhone: scope.providerPhone || '',
    careTeamProviderIds: Array.isArray(scope.careTeamProviderIds)
      ? scope.careTeamProviderIds : [],
    township: scope.township || '',
    region: scope.region || '',
    facilityCode: scope.facilityCode || '',
    department: scope.department || 'other',
    facilityType: scope.facilityType || 'other'
  };
}

function resolvePatientAge(profile) {
  const data = profile || {};
  const parsed = parseInt(data.age, 10);
  if (parsed > 0 && parsed < 120) return parsed;
  const dob = firstDate(data, ['date_of_birth', 'dateOfBirth', 'dob', 'birthDate']);
  if (!dob) return null;
  const years = Math.floor((Date.now() - dob.getTime()) / (365.25 * DAY_MS));
  return years > 0 && years < 120 ? years : null;
}

function patientFields(facts) {
  const profile = facts.profile || facts.registration || {};
  return {
    patientName: profile.name || profile.patientName || '',
    patientCode: profile.patient_id || profile.patientId || facts.id || '',
    patientPhone: profile.phone || profile.phoneNumber || '',
    patientAge: resolvePatientAge(profile),
    infectionFlags: facts.infectionFlags || {}
  };
}

function actionDate(action) {
  return firstDate(action, [
    'actionDate', 'recordedAt', 'recorded_at', 'timestamp', 'createdAt'
  ]);
}

function hrtCompletion(actions) {
  return (actions || []).map(unwrap).filter((action) =>
    ['resolved', 'completed'].includes(action.type) && (
      HRT_COMPLETE_REASONS.has(normalizeOutcome(
        action.completionReason || action.resolvedReason || action.reason
      )) ||
      ['alive', 'death', 'transfer', 'abortion', 'loss_of_contact'].includes(
        normalizeOutcome(action.outcome)
      )
    )).sort((a, b) => (actionDate(b) || 0) - (actionDate(a) || 0))[0] || null;
}

function trackingStatus(dueDate, graceDays, asOf) {
  if (!dueDate) return { status: 'on_track', daysLate: null };
  const daysLate = Math.floor((dateOnly(asOf) - dateOnly(dueDate)) / DAY_MS);
  if (daysLate < 0) return { status: 'on_track', daysLate };
  if (daysLate <= graceDays) return { status: 'overdue_followup', daysLate };
  return { status: 'lost_to_followup', daysLate };
}

function projectionAsOf(options) {
  const asOf = dateOnly(options && options.asOf);
  if (!asOf) throw new Error('Projection builders require a valid asOf date.');
  return asOf;
}

function highRiskDetails(facts) {
  const highRiskVisits = (facts.antenatalVisits || []).filter((entry) => {
    const visit = unwrap(entry);
    return visit && ['yes', 'true'].includes(
      String(visit.high_risk ?? visit.highRisk).toLowerCase()
    );
  });
  const visit = latest(highRiskVisits, [
    'visitDate', 'visit_date', 'recordedAt', 'createdAt'
  ]);
  const activeFrom = highRiskVisits.map((entry) => firstDate(unwrap(entry), [
    'visitDate', 'visit_date', 'recordedAt', 'createdAt'
  ])).filter(Boolean).sort((a, b) => a - b)[0] || null;
  return {
    eligible: !!visit,
    visit,
    riskFactors: visit && Array.isArray(visit.risk_factors)
      ? visit.risk_factors : [],
    activeFrom
  };
}

/**
 * Builds one deterministic HRT row. A null result means the patient is not
 * currently represented by the HRT registry.
 */
function buildHrtProjection(facts, options) {
  if (!facts || !facts.id) return null;
  const asOf = projectionAsOf(options);
  const highRisk = highRiskDetails(facts);
  if (!highRisk.eligible) return null;
  const visitCount = completedVisitCount(facts.antenatalVisits);
  const latestAnc = latest(facts.antenatalVisits, [
    'visitDate', 'visit_date', 'recordedAt', 'createdAt'
  ]) || {};
  const manualDue = firstDate(latestAnc, ['nextVisitDate', 'next_visit_date']);
  const derivedDue = recommendedAncDate(effectiveLmp(facts), visitCount + 1);
  const dueDate = manualDue || derivedDue;
  const explicit = hrtCompletion(facts.hrtActions);
  const birth = facts.birthAnchor && facts.birthAnchor.confirmed
    ? dateOnly(facts.birthAnchor.value) : null;
  const edd = dateOnly(effectiveEdd(facts));
  const autoDate = addDays(birth || edd, 42);
  const autoComplete = !explicit && autoDate && asOf >= autoDate;
  const complete = !!explicit || autoComplete;
  const tracked = complete
    ? { status: 'complete', daysLate: 0 }
    : trackingStatus(dueDate, visitCount + 1 >= 5 ? 14 : 30, asOf);
  const activeFrom = dateOnly(highRisk.activeFrom) ||
    firstDate(facts.profile || {}, ['createdAt', 'registration_date']) || asOf;
  const activeTo = complete
    ? dateOnly(explicit && actionDate(explicit) || autoDate) : null;
  const outcome = explicit
    ? normalizeOutcome(explicit.outcome || explicit.resolvedReason) : null;
  return {
    schemaVersion: HRT_SCHEMA_VERSION,
    projectionType: 'hrt',
    rowId: facts.id,
    patientId: facts.id,
    ...patientFields(facts),
    ...scopeFields(facts),
    eligible: true,
    riskFactors: highRisk.riskFactors,
    visitCount,
    dueDate: isoDate(dueDate),
    dueDateSource: manualDue ? 'manual_next_visit' :
      (derivedDue ? 'lmp_schedule' : null),
    daysLate: tracked.daysLate,
    status: tracked.status,
    activeFrom: isoDate(activeFrom),
    activeTo: isoDate(activeTo),
    activeUntil: isoDate(activeTo) || '9999-12-31',
    explicitCompletion: !!explicit,
    derivedCompletion: !!autoComplete,
    completionSource: explicit ? 'clinical_action' :
      (autoComplete ? (birth ? 'confirmed_birth_plus_42d' : 'edd_plus_42d') : null),
    completionDate: complete ? isoDate(activeTo) : null,
    outcome,
    completionReason: explicit ? normalizeOutcome(
      explicit.completionReason || explicit.resolvedReason || explicit.reason || explicit.outcome
    ) : null,
    maternalOutcome: explicit ? normalizeOutcome(explicit.maternalOutcome) : null,
    newbornOutcome: explicit ? normalizeOutcome(explicit.newbornOutcome) : null,
    birthAnchorDate: isoDate(birth),
    birthAnchorSource: birth && facts.birthAnchor.source || (edd ? 'edd' : null),
    edd: isoDate(edd),
    postpartumAgeDays: birth
      ? Math.max(0, Math.floor((asOf - birth) / DAY_MS)) : null
  };
}

function newbornVisitData(facts) {
  return (facts.newbornVisits || []).map(unwrap).filter(Boolean);
}

function firstNewbornVisit(facts) {
  const visits = newbornVisitData(facts);
  return visits.find((visit) =>
    Number(visit.visit_number || visit.visitNumber || 1) === 1
  ) || visits[0] || {};
}

function babiesForKmc(facts) {
  const care = firstNewbornVisit(facts);
  const profile = facts.profile || {};
  const byIndex = new Map();
  newbornVisitData(facts).sort((a, b) => {
    const visitDiff = Number(b.visit_number || b.visitNumber || 0) -
      Number(a.visit_number || a.visitNumber || 0);
    return visitDiff || (firstDate(b, ['visitDate', 'visit_date']) || 0) -
      (firstDate(a, ['visitDate', 'visit_date']) || 0);
  }).forEach((visit) => {
    const candidates = [];
    if (Array.isArray(visit.babies)) candidates.push(...visit.babies);
    if (Array.isArray(visit.kmc_babies)) candidates.push(...visit.kmc_babies);
    if (!candidates.length) candidates.push(visit);
    candidates.forEach((baby, index) => {
      const babyIndex = Number(baby.babyIndex || baby.baby_index || index + 1);
      const existing = byIndex.get(babyIndex) || {};
      const merged = { ...baby, ...existing };
      merged.potential_kmc = existing.potential_kmc || baby.potential_kmc;
      merged.kmc_eligible_reasons = Array.from(new Set([
        ...(baby.kmc_eligible_reasons || []),
        ...(existing.kmc_eligible_reasons || [])
      ]));
      byIndex.set(babyIndex, merged);
    });
  });
  if (!byIndex.size) byIndex.set(1, care);
  return Array.from(byIndex.entries()).sort((a, b) => a[0] - b[0])
    .map(([babyIndex, baby]) => ({
    babyIndex,
    babyName: baby.babyName || baby.baby_name || care.baby_name ||
      (profile.name ? `Baby ${profile.name}` : 'Baby'),
    birthWeightGram: Number(baby.birthWeightGram || baby.birth_weight_gram ||
      baby.body_weight_gram || care.body_weight_gram) || null,
    birthDate: firstDate(baby, [
      'birthTime', 'birth_time', 'dateOfBirth', 'date_of_birth'
    ]) || firstDate(care, ['birth_time', 'birthTime']) ||
      (facts.birthAnchor && facts.birthAnchor.value) || null,
    outcome: normalizeOutcome(baby.outcome || baby.baby_outcome || care.outcome),
    dischargeDate: firstDate(baby, ['discharge_date', 'dischargeDate']) ||
      firstDate(care, ['discharge_date', 'dischargeDate']),
    potentialKmc: baby.potential_kmc === true ||
      String(baby.potential_kmc || '').toLowerCase() === 'yes',
    recordedReasons: Array.isArray(baby.kmc_eligible_reasons)
      ? baby.kmc_eligible_reasons : []
  }));
}

function kmcDecision(visit, babyIndex) {
  if (Array.isArray(visit.kmc_babies)) {
    const baby = visit.kmc_babies.find((item) =>
      Number(item.babyIndex || item.baby_index || 1) === babyIndex);
    return baby ? { ...visit, ...baby } : null;
  }
  return babyIndex === 1 && visit.kmc_selected ? visit : null;
}

function kmcVisits(facts, babyIndex) {
  return newbornVisitData(facts).map((visit) => kmcDecision(visit, babyIndex))
    .filter((visit) => visit &&
      String(visit.kmc_selected || '').toLowerCase() === 'yes')
    .sort((a, b) => (firstDate(a, ['visitDate', 'visit_date']) || 0) -
      (firstDate(b, ['visitDate', 'visit_date']) || 0));
}

function kmcCompletion(actions, babyIndex) {
  return (actions || []).map(unwrap).filter((action) => {
    const index = Number(action.babyIndex || action.baby_index || 1);
    return index === babyIndex && KMC_COMPLETE_TYPES.has(action.type);
  }).sort((a, b) => (actionDate(b) || 0) - (actionDate(a) || 0))[0] || null;
}

function kmcDueDate(dischargeDate, visits) {
  if (!dischargeDate) return null;
  const count = visits.filter((visit) => {
    const visitDate = firstDate(visit, ['visitDate', 'visit_date']);
    return visitDate && dateOnly(visitDate) >= dateOnly(dischargeDate);
  }).length;
  if (count === 0) return addDays(dischargeDate, 3);
  if (count === 1) return addDays(dischargeDate, 7);
  if (count === 2) return addDays(dischargeDate, 14);
  return addCalendarMonths(dischargeDate, count - 2);
}

/** Builds zero or more deterministic, per-baby KMC rows. */
function buildKmcProjections(facts, options) {
  if (!facts || !facts.id) return [];
  const asOf = projectionAsOf(options);
  const edd = dateOnly(effectiveEdd(facts));
  return babiesForKmc(facts).map((baby) => {
    const birth = dateOnly(baby.birthDate);
    const reasons = [];
    if (baby.birthWeightGram > 0 && baby.birthWeightGram < 2000) {
      reasons.push('low_weight');
    }
    if (birth && edd && (edd - birth) / DAY_MS >= 21) reasons.push('preterm');
    baby.recordedReasons.forEach((reason) => {
      if (reason && !reasons.includes(reason)) reasons.push(reason);
    });
    const visits = kmcVisits(facts, baby.babyIndex);
    const enrolled = visits.length > 0;
    if (!reasons.length && !enrolled && !baby.potentialKmc) return null;
    const explicit = kmcCompletion(facts.kmcActions, baby.babyIndex);
    const autoDate = addCalendarMonths(birth, 2);
    const autoComplete = !explicit && autoDate && asOf >= autoDate;
    const complete = !!explicit || autoComplete;
    const discharge = baby.dischargeDate ||
      firstDate(visits.slice().reverse()[0], ['discharge_date', 'dischargeDate']);
    const dueDate = kmcDueDate(discharge, visits);
    const tracked = complete
      ? { status: 'complete', daysLate: 0 }
      : trackingStatus(dueDate, 14, asOf);
    const activeFrom = birth || firstDate(visits[0], [
      'visitDate', 'visit_date', 'recordedAt'
    ]) || asOf;
    const activeTo = complete
      ? dateOnly(explicit && actionDate(explicit) || autoDate) : null;
    return {
      schemaVersion: KMC_SCHEMA_VERSION,
      projectionType: 'kmc',
      rowId: `${facts.id}_${baby.babyIndex}`,
      patientId: facts.id,
      babyIndex: baby.babyIndex,
      babyName: baby.babyName,
      ...patientFields(facts),
      ...scopeFields(facts),
      eligible: reasons.length > 0,
      eligibilityReasons: reasons,
      enrolled,
      birthWeightGram: baby.birthWeightGram,
      birthAnchorDate: isoDate(birth),
      birthAnchorSource: birth
        ? (facts.birthAnchor && facts.birthAnchor.source || 'newborn_baby') : null,
      edd: isoDate(edd),
      postpartumAgeDays: birth
        ? Math.max(0, Math.floor((asOf - birth) / DAY_MS)) : null,
      visitCount: visits.length,
      dueDate: isoDate(dueDate),
      dueDateSource: dueDate ? 'kmc_discharge_schedule' : null,
      daysLate: tracked.daysLate,
      status: tracked.status,
      activeFrom: isoDate(activeFrom),
      activeTo: isoDate(activeTo),
      activeUntil: isoDate(activeTo) || '9999-12-31',
      explicitCompletion: !!explicit,
      derivedCompletion: !!autoComplete,
      completionSource: explicit ? 'clinical_action' :
        (autoComplete ? 'birth_plus_2_calendar_months' : null),
      completionDate: complete ? isoDate(activeTo) : null,
      outcome: explicit
        ? normalizeOutcome(explicit.outcome || explicit.resolvedReason)
        : baby.outcome
    };
  }).filter(Boolean);
}

function projectionWriterContract(name) {
  if (name === 'hrt') return HRT_PROJECTION_CONTRACT;
  if (name === 'kmc') return KMC_PROJECTION_CONTRACT;
  throw new Error('Unknown projection writer contract: ' + name);
}

module.exports = {
  HRT_SCHEMA_VERSION,
  KMC_SCHEMA_VERSION,
  HRT_COLLECTION,
  KMC_COLLECTION,
  HRT_PROJECTION_CONTRACT,
  KMC_PROJECTION_CONTRACT,
  projectionWriterContract,
  buildHrtProjection,
  buildKmcProjections,
  addCalendarMonths,
  isoDate,
  resolvePatientAge
};
