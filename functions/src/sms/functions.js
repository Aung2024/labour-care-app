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
  resolveHrtSmsTemplates
} = require('./hrt-templates');
const { selectOutgoingMessages, resolveSendPhone } = require('./compose');
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

function profilePhone(profile, fallback) {
  return (profile && (profile.phone || profile.phoneNumber)) || fallback || '';
}

function publicTemplates(templates) {
  return (templates || []).map((template) => ({
    key: template.key,
    labelEn: template.labelEn,
    labelMm: template.labelMm,
    credit: template.credit,
    message: template.message,
    matchedFactor: template.matchedFactor || null
  }));
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
  const resolved = resolveHrtSmsTemplates(riskFactors, gaWeeks);
  return {
    patientId,
    patientName: row.patientName || profile.name || profile.patientName || '',
    to: phone,
    storedPhone: phone,
    gaWeeks,
    gaBand: resolved.gaBand,
    needsGa: !!resolved.needsGa,
    riskFactors,
    templates: resolved.templates,
    canCustom: true,
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
    needsPhone: !draft.to,
    gaWeeks: draft.gaWeeks,
    gaBand: draft.gaBand,
    needsGa: !!draft.needsGa,
    riskFactors: draft.riskFactors || [],
    templates: publicTemplates(draft.templates),
    canCustom: true
  };
}

async function persistPatientPhone(patientId, phone, user) {
  const batch = db().batch();
  batch.set(db().collection('patients').doc(patientId), {
    phone,
    phoneNumber: phone,
    phoneUpdatedAt: FieldValue.serverTimestamp(),
    phoneUpdatedBy: user.uid,
    phoneUpdatedSource: 'hrt_sms'
  }, { merge: true });
  batch.set(db().collection(HRT_COLLECTION).doc(patientId), {
    patientPhone: phone
  }, { merge: true });
  batch.set(db().collection('tracking_v2_refresh_queue').doc(patientId), {
    patientId,
    requestedBy: user.uid,
    reason: 'hrt_sms_phone',
    updatedAt: FieldValue.serverTimestamp()
  });
  await batch.commit();
}

async function sendOneHrtSms({ draft, item, phone, user, sender, apiKey, apiSecret, senderId }) {
  const logId = await writeSmsLog({
    type: 'hrt',
    status: 'pending',
    patientId: draft.patientId,
    patientName: draft.patientName,
    to: phone,
    gaWeeks: draft.gaWeeks,
    riskFactors: draft.riskFactors,
    matchedFactor: item.matchedFactor,
    templateKey: item.key,
    sourceType: item.sourceType,
    message: item.message,
    senderUid: user.uid,
    senderRole: user.role,
    source: draft.source
  });
  try {
    const result = await sender({
      apiKey,
      apiSecret,
      from: senderId,
      to: phone,
      message: item.message,
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
      ok: true,
      templateKey: item.key,
      sourceType: item.sourceType,
      messageId: result.messageId || '',
      operator: result.operator || '',
      logId
    };
  } catch (error) {
    await db().collection(SMS_COLLECTION).doc(logId).set({
      status: 'failed',
      errorCode: error.code || 'unavailable',
      failedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    return {
      ok: false,
      templateKey: item.key,
      sourceType: item.sourceType,
      logId,
      error: error.message || 'The SMS could not be sent.'
    };
  }
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
  const outgoing = selectOutgoingMessages(draft.templates, request.data);
  const phone = resolveSendPhone(draft.storedPhone, request.data && request.data.phone);
  if (!phone) {
    throw new HttpsError(
      'failed-precondition',
      'Enter a valid Myanmar mobile number before sending.'
    );
  }
  let phoneSaved = false;
  if (request.data && request.data.savePhone !== false && phone !== draft.storedPhone) {
    await persistPatientPhone(patientId, phone, user);
    phoneSaved = true;
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
  const send = sender || sendSmsPoh;
  const sends = [];
  for (const item of outgoing) {
    sends.push(await sendOneHrtSms({
      draft,
      item,
      phone,
      user,
      sender: send,
      apiKey,
      apiSecret,
      senderId
    }));
  }
  const accepted = sends.filter((item) => item.ok);
  const failed = sends.filter((item) => !item.ok);
  if (!accepted.length) {
    const first = failed[0];
    throw new HttpsError(first && first.error && /credit|balance/i.test(first.error)
      ? 'resource-exhausted'
      : 'unavailable', (first && first.error) || 'The SMS could not be sent.');
  }
  return {
    preview: false,
    accepted: true,
    phone,
    phoneSaved,
    sentCount: accepted.length,
    failedCount: failed.length,
    messageId: accepted[0].messageId || '',
    operator: accepted[0].operator || '',
    sends,
    ...publicDraft({ ...draft, to: phone })
  };
}

const sendHrtSms = onCall({
  region: REGION,
  timeoutSeconds: 120,
  memory: '256MiB',
  enforceAppCheck: false,
  secrets: [smspohApiKey, smspohApiSecret, smspohSenderId]
}, (request) => handleSendHrtSms(request));

module.exports = {
  SMS_COLLECTION,
  sendHrtSms,
  handleSendHrtSms
};
