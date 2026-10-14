'use strict';

const { HttpsError } = require('firebase-functions/v2/https');

const HRT_SMS_SEND_LIMIT = 3;

function normalizeHrtSmsSendCount(value) {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

function hrtSmsQuotaFromCount(count) {
  const sent = normalizeHrtSmsSendCount(count);
  const remaining = Math.max(0, HRT_SMS_SEND_LIMIT - sent);
  return {
    hrtSmsSendLimit: HRT_SMS_SEND_LIMIT,
    hrtSmsSendCount: sent,
    hrtSmsRemaining: remaining,
    canSendHrtSms: sent < HRT_SMS_SEND_LIMIT
  };
}

function assertCanConsumeHrtSmsSendSlot(count) {
  const sent = normalizeHrtSmsSendCount(count);
  if (sent >= HRT_SMS_SEND_LIMIT) {
    throw new HttpsError(
      'resource-exhausted',
      `This patient has already received the maximum of ${HRT_SMS_SEND_LIMIT} high-risk SMS send actions.`
    );
  }
}

module.exports = {
  HRT_SMS_SEND_LIMIT,
  normalizeHrtSmsSendCount,
  hrtSmsQuotaFromCount,
  assertCanConsumeHrtSmsSendSlot
};
