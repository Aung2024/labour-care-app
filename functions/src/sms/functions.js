'use strict';

const admin = require('firebase-admin');
const { FieldValue } = require('firebase-admin/firestore');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const { HRT_COLLECTION } = require('../analytics/projections');
const { authorizedUser } = require('../analytics/tracking-functions');
const { loadClinicalFacts } = require('../analytics/repository');
const { normalizeMyanmarMobile } = require('./phone');
const { assertCanSendHrtSms, assertTrackingRowScope } = require('./access');
const {
  SMS_SOURCE,
  currentGaWeeks,
  latestVisit,
  riskFactorsFromFacts,
  resolveHrtSmsTemplate
} = require('./hrt-templates');
const { sendSmsPoh } = require('./smspoh-client');

const REGION = 'us-central1';
const SMS_COLLECTION = 'sms_sends';
const smspohApiKey = defineSecret('SMSPOH_API_KEY');
const smspohApiSecret = defineSecret('SMSPOH_API_SECRET');
const smspohSenderId = defineSecret('SMSPOH_SENDER_ID');

function db() {
  return admin.firestore();
}

function requirePatientId(data) {
  const patientId = String((data && data.patientId) || '').trim();
  if (!patientId || patientId.length > 120) {
    throw new HttpsError('invalid-argument', 'patientId is required.');
  }
  return patientId;
}

function mapResolveError(result) {
  const code = result && result.code;
  if (code === 'GA_REQUIRED') {
    return new HttpsError('failed-precondition', result.message);
  }
  return new HttpsError('failed-precondition', result.message ||
    'No approved high-risk SMS template matches this patient.');
}

function profilePhone(profile, fallback) {
  return (profile && (profile.phone || profile.phoneNumber)) || fallback || '';
}

async function resolveHrtSmsDraft(patientId, user) {
  const rowSnap = await db().collection(HRT_COLLECTION).doc(patientId).get();
  if (!rowSnap.exists) {
    throw new HttpsError('not-found', 'This patient is not on the high-risk register.');
  }
  const row = rowSnap.data() || {};
  assertTrackingRowScope(user, row);
  if (row.status === 'complete') {
    throw new HttpsError(
      'failed-precondition',
      'Completed high-risk patients cannot be sent a follow-up SMS.'
    );
  }
  const facts = await loadClinicalFacts(db(), patientId);
  const profile = (facts && (facts.profile || facts.registration)) || {};
  const latestAnc = facts ? latestVisit(facts.antenatalVisits) : null;
  const gaWeeks = currentGaWeeks({
    latestAnc,
    lmp: profile.lmp,
    edd: row.edd || profile.edd || profile.EDD
  });
  const riskFactors = facts
    ? riskFactorsFromFacts(facts, row.riskFactors)
    : (Array.isArray(row.riskFactors) ? row.riskFactors : []);
  const phone = normalizeMyanmarMobile(profilePhone(profile, row.patientPhone));
  if (!phone) {
    throw new HttpsError(
      'failed-precondition',
      'This patient has no valid Myanmar mobile number.'
    );
  }
  const resolved = resolveHrtSmsTemplate(riskFactors, gaWeeks);
  if (!resolved.ok) throw mapResolveError(resolved);
  return {
    patientId,
    patientName: row.patientName || profile.name || profile.patientName || '',
    to: phone,
    gaWeeks,
    gaBand: resolved.gaBand,
    riskFactors,
    matchedFactor: resolved.matchedFactor,
    templateKey: resolved.template.key,
    templateLabelEn: resolved.template.labelEn,
    templateLabelMm: resolved.template.labelMm,
    credit: resolved.template.credit,
    message: resolved.template.message,
    source: SMS_SOURCE
  };
}

async function writeSmsLog(payload) {
  const ref = db().collection(SMS_COLLECTION).doc();
  await ref.set({
    ...payload,
    createdAt: FieldValue.serverTimestamp()
  });
  return ref.id;
}

function publicDraft(draft) {
  return {
    patientId: draft.patientId,
    patientName: draft.patientName,
    to: draft.to,
    gaWeeks: draft.gaWeeks,
    templateKey: draft.templateKey,
    templateLabelEn: draft.templateLabelEn,
    templateLabelMm: draft.templateLabelMm,
    matchedFactor: draft.matchedFactor,
    credit: draft.credit,
    message: draft.message
  };
}

async function handleSendHrtSms(request, sender) {
  const user = await authorizedUser(request);
  assertCanSendHrtSms(user);
  const patientId = requirePatientId(request.data);
  const previewOnly = !!(request.data && request.data.previewOnly);
  const draft = await resolveHrtSmsDraft(patientId, user);
  if (previewOnly) {
    return { preview: true, ...publicDraft(draft) };
  }
  const senderId = String(smspohSenderId.value() || '').trim();
  const apiKey = String(smspohApiKey.value() || '').trim();
  const apiSecret = String(smspohApiSecret.value() || '').trim();
  if (!apiKey || !apiSecret || !senderId) {
    throw new HttpsError(
      'failed-precondition',
      'SMS account secrets are not configured on the server yet.'
    );
  }
  const logId = await writeSmsLog({
    type: 'hrt',
    status: 'pending',
    patientId: draft.patientId,
    patientName: draft.patientName,
    to: draft.to,
    gaWeeks: draft.gaWeeks,
    riskFactors: draft.riskFactors,
    matchedFactor: draft.matchedFactor,
    templateKey: draft.templateKey,
    message: draft.message,
    senderUid: user.uid,
    senderRole: user.role,
    source: draft.source
  });
  try {
    const result = await (sender || sendSmsPoh)({
      apiKey,
      apiSecret,
      from: senderId,
      to: draft.to,
      message: draft.message,
      clientReference: logId,
      test: String(process.env.SMSPOH_TEST_MODE || '').toLowerCase() === 'true'
    });
    await db().collection(SMS_COLLECTION).doc(logId).set({
      status: 'accepted',
      messageId: result.messageId || '',
      operator: result.operator || '',
      acceptedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    return {
      preview: false,
      accepted: true,
      messageId: result.messageId || '',
      operator: result.operator || '',
      ...publicDraft(draft)
    };
  } catch (error) {
    await db().collection(SMS_COLLECTION).doc(logId).set({
      status: 'failed',
      errorCode: error.code || 'unavailable',
      failedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    if (error instanceof HttpsError) throw error;
    throw new HttpsError(error.code || 'unavailable', error.message ||
      'The SMS could not be sent.');
  }
}

const sendHrtSms = onCall({
  region: REGION,
  timeoutSeconds: 60,
  memory: '256MiB',
  enforceAppCheck: false,
  secrets: [smspohApiKey, smspohApiSecret, smspohSenderId]
}, (request) => handleSendHrtSms(request));

module.exports = {
  SMS_COLLECTION,
  sendHrtSms,
  handleSendHrtSms
};
