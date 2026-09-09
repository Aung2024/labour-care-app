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
  assert.match(source, /RHC\/SRHC/);
  assert.match(source, /ကျန်းမာရေးဌာန\/ဌာနခွဲ/);
  assert.doesNotMatch(source, /C-section \(legacy/);
  assert.doesNotMatch(source, /Public Facility \(legacy\)/);
  assert.doesNotMatch(source, /နောက်ဆုံး ANC မှ ယူထားပြီး ကိုယ်ဝန်ပတ် ထပ်မထည့်နိုင်အောင် ပိတ်ထားသည်/);
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
  assert.match(source, /serialCol/);
  assert.match(source, /pageSize: 100/);
  assert.match(source, /row\._projection && Array\.isArray\(row\.weightHistory\)/);
  assert.doesNotMatch(source, /statusFilter === 'all'\) \{\s*return rowMatchesCardFilter\(r, 'all'\) && !isCompleted\(r\);/);
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
  assert.match(hub, /Clinical Data-based Assessment/);
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
  assert.doesNotMatch(hardcopy, /Demo only: files are listed/);

  assert.match(readiness, /quality-readiness-checklist\.html\?domain=/);
  assert.match(checklist, /localStorage/);
  assert.match(checklist, /CHECKLISTS/);
  assert.doesNotMatch(checklist, /WHO\/UNICEF-style demo checklist/);
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
  assert.match(newborn, /id="modalPossibleCauses"/);
  assert.match(newborn, /id="modalActionRows"/);
  assert.match(newborn, /id="modalTargetMonths"/);
  assert.match(newborn, /Possible causes/);
  assert.doesNotMatch(newborn, /id="modalNextAction"/);
  assert.doesNotMatch(newborn, /Reason category/);
  assert.doesNotMatch(newborn, /Reason details/);
  assert.doesNotMatch(newborn, /id="modalReasonCategory"/);
  assert.doesNotMatch(newborn, /id="modalReasonText"/);
  assert.match(newborn, /quality-possible-causes\.js\?v=290/);
  assert.match(newborn, /quality-scoring\.js\?v=290/);
  assert.match(antenatal, /quality-scoring\.js\?v=290/);
  assert.match(antenatal, /Reason category/);
  assert.match(reviewActions, /quality-scoring\.js\?v=290/);
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

test('transfer hub hides deleted patients and returns from overall report', () => {
  const hubView = readAppFile('js/sent-transfer-hrt-view.js');
  const report = readAppFile('overall-patient-report.html');
  const form = readAppFile('transfer-patient.html');
  const requests = readAppFile('transfer-requests.html');
  const sw = readAppFile('service-worker.js');

  assert.match(hubView, /isUnavailablePatient/);
  assert.match(hubView, /if \(isUnavailablePatient\(patient\)\) return null;/);
  assert.doesNotMatch(hubView, /transferReq\.patientName \|\| 'Unknown'/);
  assert.match(hubView, /from=transfers/);
  assert.match(report, /reportFrom === 'transfers'/);
  assert.match(report, /AppNavBack\.toPatientTransfers/);
  assert.match(form, /Application အသုံးပြုသော ဆေးရုံ\/ကျန်းမာရေးဌာန/);
  assert.match(form, /Application အသုံးမပြုသော ဆေးရုံ\/ကျန်းမာရေးဌာန/);
  assert.match(requests, /destInternal/);
  assert.match(requests, /Application အသုံးပြုသော ဆေးရုံ\/ကျန်းမာရေးဌာန/);
  assert.match(sw, /mch-care-v302-moh/);
});

test('transfer page is single-midwife and hides helper counts', () => {
  const form = readAppFile('transfer-patient.html');
  assert.match(form, /type="radio" name="receivingMidwife"/);
  assert.match(form, /ids\.length !== 1/);
  assert.match(form, /လက်ခံမည့် နေရာ/);
  assert.doesNotMatch(form, /data-mm="လက်ခံမည့် midwife"/);
  assert.doesNotMatch(form, /toggleAllMidwives/);
  assert.doesNotMatch(form, /အားလုံး ရွေးပါ/);
  assert.doesNotMatch(form, /လွှဲပြောင်းနိုင်သော Midwife/);
  assert.doesNotMatch(form, /အမည်၊ အီးမေးလ်၊ ကျန်းမာရေးဌာန၊ တိုင်းဒေသကြီး သို့မဟုတ် မြို့နယ်ဖြင့် ရှာနိုင်ပါသည်/);
  assert.doesNotMatch(form, /type="checkbox"/);
});

test('new vaccine page can record multiple vaccines at once', () => {
  const source = readAppFile('vaccine-record.html');
  assert.match(source, /Add more vaccine/);
  assert.match(source, /ကာကွယ်ဆေး ထပ်ထည့်ရန်/);
  assert.match(source, /function addVaccineRow/);
  assert.match(source, /batch\.commit/);
});

test('patient registration requires patient phone and allows reused numbers', () => {
  const source = readAppFile('patient-enhanced.html');
  assert.match(source, /name="phone" id="phone"[^>]*required/);
  assert.match(source, /Patient phone number is required/);
  assert.match(source, /same phone is allowed/);
  assert.doesNotMatch(source, /This phone number already exists for another patient/);
  assert.doesNotMatch(source, /liveDuplicateState\.phoneBlocked = phoneDup/);
});
