'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

function readAppFile(name) {
  return fs.readFileSync(path.resolve(__dirname, '../..', name), 'utf8');
}

test('antenatal test save validates the form and hidden TB values are retained', () => {
  const source = readAppFile('antenatal-tests-form.html');
  assert.match(source, /if \(!form\.checkValidity\(\)\) \{\s*form\.reportValidity\(\);/);

  const toggleStart = source.indexOf('function toggleTbDetails()');
  const toggleEnd = source.indexOf('\n    function ', toggleStart + 1);
  const toggleSource = source.slice(toggleStart, toggleEnd);
  assert.doesNotMatch(toggleSource, /input\.value\s*=\s*['"]{2}/);
});

test('immediate newborn care requires exactly one breathing status before save', () => {
  const source = readAppFile('immediate-newborn-care-form.html');
  const requiredBreathingInputs = source.match(
    /name="breathing_status"[^>]*required/g
  ) || [];
  assert.equal(requiredBreathingInputs.length, 2);
  assert.match(source, /selectedBreathingStatuses\.length !== 1/);
  assert.match(source, /form\.reportValidity\(\);/);
});

test('newborn care uses shared alert logic and canonical storage patient ID', () => {
  const source = readAppFile('newborn-care-page.html');
  assert.match(source, /src="js\/infection-alerts\.js"/);
  assert.match(source, /InfectionAlerts\.collectFlags\(tests\)/);
  assert.match(
    source,
    /weightEl\.value = DeliveryNotesUtils\.gramsToKilograms\(grams\)/
  );
  assert.doesNotMatch(
    source,
    /\.doc\(patientId\)\s*\.collection\('newborn_care'\)/
  );
  assert.match(source, /id="body_weight_gram"[^>]*required/);
  assert.match(source, /stored > NEWBORN_SCHEDULE_VISIT_COUNT/);
  assert.match(
    source,
    /\.doc\(getNewbornCareStoragePatientId\(\)\)\s*\.collection\('newborn_care'\)/
  );
});

test('newborn report hides KMC table and cause of death unless death is recorded', () => {
  const source = readAppFile('newborn-report.html');
  assert.doesNotMatch(source, /function renderKmcReportSection/);
  assert.match(source, /function visitHasDeathOutcome/);
  assert.match(source, /showCauseOfDeath/);
});

test('delivery notes lock after save and reuse ANC gestational age', () => {
  const source = readAppFile('patient-care-hub.html');
  assert.match(source, /function isDeliveryNotesLocked/);
  assert.match(source, /function applyDeliveryGestationalWeek/);
  assert.match(source, /deliveryGaLockedFromAnc/);
  const utils = readAppFile('js/baby-patient-utils.js');
  assert.match(utils, /copyMotherScopeFields/);
  assert.match(utils, /fetchLatestAncContext/);
});

test('KMC tracker weight column always draws a sparkline block', () => {
  const source = readAppFile('kmc-tracking.html');
  assert.match(source, /kmc-weight-spark/);
  assert.match(source, /function weightSparklineSvg/);
  assert.match(source, /function enrichKmcRowWeights/);
  assert.match(source, /function canonicalKmcKey/);
  assert.match(source, /visit\.current_weight_gram \|\| visit\.currentWeightGram/);
  assert.doesNotMatch(source, /if \(!points \|\| points\.length < 2\) return '';/);
});

test('home page exposes a role-gated Quality Improvement card', () => {
  const source = readAppFile('home.html');
  assert.match(source, /id="qiCard"/);
  assert.match(source, /'qiCard'/);
  assert.match(source, /case 'quality-improvement'/);
  assert.match(source, /quality-improvement\.html/);
});

test('quality hubs and newborn score page are wired for the partner demo', () => {
  const hub = readAppFile('quality-improvement.html');
  const clinical = readAppFile('quality-clinical-database.html');
  const hardcopy = readAppFile('quality-hardcopy-upload.html');
  const readiness = readAppFile('quality-periodic-readiness.html');
  const checklist = readAppFile('quality-readiness-checklist.html');
  const facilityVisit = readAppFile('quality-facility-visit.html');
  const virtualVisits = readAppFile('quality-virtual-visits.html');
  const facilityReports = readAppFile('quality-facility-reports.html');
  const competency = readAppFile('quality-competency.html');
  const newborn = readAppFile('quality-newborn.html');
  const antenatal = readAppFile('quality-antenatal.html');
  const reviewActions = readAppFile('quality-review-actions.html');
  const home = readAppFile('home.html');

  assert.doesNotMatch(home, /stat-number[^>]*>QI</);
  assert.match(hub, /Clinical Database Assessment/);
  assert.match(hub, /Periodic Readiness Assessment/);
  assert.match(hub, /Facility Visit Assessment/);
  assert.match(hub, /Progress and Target Tracking/);
  assert.match(hub, /quality-clinical-database\.html/);
  assert.match(hub, /quality-periodic-readiness\.html/);
  assert.match(hub, /quality-facility-visit\.html/);
  assert.doesNotMatch(hub, /Competency Assessment/);
  assert.doesNotMatch(hub, /Facility Readiness Assessment/);
  assert.doesNotMatch(hub, /Coming soon/);

  assert.match(clinical, /Existing Database/);
  assert.match(clinical, /Create New database \(Hard copies\)/);
  assert.match(clinical, /quality-competency\.html/);
  assert.match(clinical, /quality-hardcopy-upload\.html/);
  assert.match(hardcopy, /Extract \/ Read records/);
  assert.match(hardcopy, /accept="\.xlsx/);

  assert.match(readiness, /quality-readiness-checklist\.html\?domain=/);
  assert.match(checklist, /localStorage/);
  assert.match(checklist, /CHECKLISTS/);
  assert.match(facilityVisit, /quality-virtual-visits\.html/);
  assert.match(facilityVisit, /quality-facility-reports\.html/);
  assert.match(virtualVisits, /Upcoming calls/);
  assert.match(virtualVisits, /Previous calls/);
  assert.match(facilityReports, /Daw Thin Thin \(TMO\)/);

  assert.match(competency, /quality-clinical-database\.html/);
  assert.match(competency, /Antenatal/);
  assert.match(competency, /Intrapartum/);
  assert.match(competency, /Postnatal/);
  assert.match(competency, /quality-newborn\.html/);
  assert.match(competency, /quality-antenatal\.html/);
  assert.match(competency, /navigateToAntenatal/);
  assert.doesNotMatch(competency, /showComingSoon\('Antenatal'\)/);

  assert.match(newborn, /QualityScoring\.INDICATOR_DEFS/);
  assert.doesNotMatch(newborn, /QualityScoring\.ANC_INDICATOR_DEFS/);
  assert.match(newborn, /loadProviderMonthSummary/);
  assert.doesNotMatch(newborn, /loadProviderAncMonthSummary/);
  assert.match(antenatal, /QualityScoring\.ANC_INDICATOR_DEFS/);
  assert.match(antenatal, /loadProviderAncMonthSummary/);
  assert.doesNotMatch(antenatal, /QualityImprovement\.loadProviderMonthSummary/);
  assert.match(newborn, /var options = \['all'\]/);
  assert.match(newborn, /'all'/);
  assert.match(newborn, /id="actionModal"/);
  assert.match(newborn, /id="modalNextAction"/);
  assert.match(newborn, /id="modalPossibleCauses"/);
  assert.match(newborn, /id="modalActionRows"/);
  assert.match(newborn, /id="modalTargetMonths"/);
  assert.match(newborn, /Possible causes/);
  assert.doesNotMatch(newborn, /Reason category/);
  assert.doesNotMatch(newborn, /Reason details/);
  assert.doesNotMatch(newborn, /id="modalReasonCategory"/);
  assert.doesNotMatch(newborn, /id="modalReasonText"/);
  assert.match(newborn, /quality-possible-causes\.js\?v=289/);
  assert.match(newborn, /quality-scoring\.js\?v=289/);
  assert.match(antenatal, /quality-scoring\.js\?v=289/);
  assert.match(antenatal, /Reason category/);
  assert.match(reviewActions, /quality-scoring\.js\?v=289/);
  assert.match(reviewActions, /loadSavedActions/);
  assert.match(reviewActions, /pageDomain/);
  assert.match(reviewActions, /backToScoresBtn/);
  assert.match(reviewActions, /Possible causes/);
  assert.doesNotMatch(newborn, /Average of scored newborn indicators/);
  assert.doesNotMatch(newborn, /Computed from this midwife/);
  assert.doesNotMatch(newborn, /ဒီမိုအတွက် သားဖွား၏ လူနာမှတ်တမ်းများမှ တွက်ချက်ထားသည်/);
  assert.match(newborn, /quality-review-actions\.html/);
  assert.match(antenatal, /domain=antenatal/);
  assert.match(reviewActions, /No saved improvement actions yet/);
  assert.match(reviewActions, /data-save-comment/);
  assert.match(reviewActions, /Update comment|Save comment/);
});

test('QI action plans persist to the all-time document used by Review Actions', () => {
  const helper = readAppFile('js/quality-improvement.js');
  const causes = readAppFile('js/quality-possible-causes.js');
  assert.match(helper, /quality_improvement_actions/);
  assert.match(helper, /loadSavedActions/);
  assert.match(helper, /formatMonthLabel/);
  assert.match(helper, /knownPlanMonths/);
  assert.match(helper, /loadPatientAncActivity/);
  assert.match(helper, /calculatePatientAncContribution/);
  assert.match(helper, /loadProviderAncMonthSummary/);
  assert.match(helper, /domain: 'antenatal'/);
  assert.match(helper, /possibleCauses/);
  assert.match(helper, /actionRows/);
  assert.match(helper, /targetMonths/);
  assert.match(causes, /skin_to_skin/);
  assert.match(causes, /eye_care_teo/);
  assert.match(causes, /follow_up_schedule/);
  assert.match(causes, /QualityPossibleCauses/);
});

test('server QI rebuild stays newborn-only', () => {
  const service = readAppFile('functions/src/quality/service.js');
  assert.match(service, /calculatePatientQualityContribution/);
  assert.doesNotMatch(service, /calculatePatientAncContribution/);
  assert.doesNotMatch(service, /antenatalVisits/);
});

test('immediate and routine newborn forms load QI target reminders', () => {
  const immediate = readAppFile('immediate-newborn-care-form.html');
  const newborn = readAppFile('newborn-care-page.html');
  assert.match(immediate, /quality-target-banner\.js/);
  assert.match(immediate, /QualityTargetBanner\.render/);
  assert.match(immediate, /source: 'immediate'/);
  assert.match(newborn, /quality-target-banner\.js/);
  assert.match(newborn, /QualityTargetBanner\.render/);
  assert.match(newborn, /source: 'newborn_visit'/);
});

test('antenatal forms load QI target reminders without changing newborn sources', () => {
  const visitForm = readAppFile('antenatal-form.html');
  const testForm = readAppFile('antenatal-tests-form.html');
  assert.match(visitForm, /quality-target-banner\.js/);
  assert.match(visitForm, /QualityTargetBanner\.render/);
  assert.match(visitForm, /source: 'anc_visit'/);
  assert.match(testForm, /quality-target-banner\.js/);
  assert.match(testForm, /QualityTargetBanner\.render/);
  assert.match(testForm, /source: 'anc_test'/);
});
