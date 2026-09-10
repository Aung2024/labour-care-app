'use strict';

const { HttpsError } = require('firebase-functions/v2/https');
const { normalizeMyanmarMobile } = require('./phone');

const CUSTOM_TEMPLATE_KEY = 'custom';
const MAX_CUSTOM_MESSAGE = 800;
const MAX_SELECTED_MESSAGES = 8;

function uniqueKeys(values) {
  return Array.from(new Set((values || [])
    .map((value) => String(value || '').trim())
    .filter(Boolean)));
}

function selectOutgoingMessages(templates, input) {
  const allowed = new Map((templates || []).map((template) => [template.key, template]));
  let keys = uniqueKeys(input && input.templateKeys).filter((key) =>
    key !== CUSTOM_TEMPLATE_KEY
  );
  const requestedCustom = String((input && input.customMessage) || '').replace(/\s+/g, ' ').trim();
  if (!keys.length && !requestedCustom && templates && templates.length) {
    keys = [templates[0].key];
  }
  const outgoing = [];
  keys.forEach((key) => {
    const template = allowed.get(key);
    if (!template) {
      throw new HttpsError(
        'invalid-argument',
        'Selected SMS template is not valid for this patient.'
      );
    }
    outgoing.push({
      key: template.key,
      labelEn: template.labelEn,
      labelMm: template.labelMm,
      credit: template.credit,
      message: template.message,
      matchedFactor: template.matchedFactor || null,
      sourceType: 'official'
    });
  });
  const custom = requestedCustom;
  if (custom) {
    if (custom.length > MAX_CUSTOM_MESSAGE) {
      throw new HttpsError(
        'invalid-argument',
        'Custom SMS must be 800 characters or fewer.'
      );
    }
    outgoing.push({
      key: CUSTOM_TEMPLATE_KEY,
      labelEn: 'Custom message',
      labelMm: 'ကိုယ်တိုင်ရေးသားသော စာ',
      credit: null,
      message: custom,
      matchedFactor: null,
      sourceType: 'custom'
    });
  }
  if (!outgoing.length) {
    throw new HttpsError(
      'invalid-argument',
      'Select at least one official message or write a custom message.'
    );
  }
  if (outgoing.length > MAX_SELECTED_MESSAGES) {
    throw new HttpsError(
      'invalid-argument',
      'Send at most 8 SMS messages at a time.'
    );
  }
  return outgoing;
}

function resolveSendPhone(storedPhone, requestedPhone) {
  return normalizeMyanmarMobile(requestedPhone) ||
    normalizeMyanmarMobile(storedPhone) ||
    null;
}

module.exports = {
  CUSTOM_TEMPLATE_KEY,
  MAX_CUSTOM_MESSAGE,
  MAX_SELECTED_MESSAGES,
  selectOutgoingMessages,
  resolveSendPhone
};
