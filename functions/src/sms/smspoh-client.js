'use strict';

const SMSPOH_SEND_URL = 'https://v3.smspoh.com/api/rest/send';

function buildSmsPohPayload({ to, message, from, clientReference, test }) {
  const payload = {
    to,
    message,
    from,
    unicode: 1
  };
  if (clientReference) payload.clientReference = String(clientReference);
  if (test) payload.test = 1;
  return payload;
}

function authHeader(apiKey, apiSecret) {
  const token = Buffer.from(`${apiKey}:${apiSecret}`, 'utf8').toString('base64');
  return `Bearer ${token}`;
}

function messageItems(body) {
  if (Array.isArray(body)) return body;
  if (!body || typeof body !== 'object') return [];
  if (Array.isArray(body.messages)) return body.messages;
  if (body.message && typeof body.message === 'object' && !Array.isArray(body.message)) {
    return [body.message];
  }
  if (body.messageId || body.status) return [body];
  return [];
}

function explicitErrorText(body) {
  if (!body || typeof body !== 'object') return '';
  if (body.errors && typeof body.errors === 'object') {
    return Object.values(body.errors).filter(Boolean).join(' ');
  }
  if (typeof body.error === 'string' && body.error.trim()) return body.error.trim();
  if (typeof body.message === 'string' && body.message.trim() &&
      (body.name || Number(body.status) >= 400)) {
    return body.message.trim();
  }
  return '';
}

function hasExplicitError(body) {
  if (!body || typeof body !== 'object') return false;
  if (body.errors) return true;
  if (typeof body.error === 'string' && body.error.trim()) return true;
  if (Number(body.status) >= 400) return true;
  if (body.name && typeof body.message === 'string') return true;
  return false;
}

function interpretSmsPohResponse(httpStatus, body) {
  const items = messageItems(body);
  const first = items[0] || {};
  if (httpStatus >= 200 && httpStatus < 300 && !hasExplicitError(body)) {
    return {
      ok: true,
      messageId: first.messageId || '',
      status: first.status || 'Accepted',
      operator: first.operator || first.network || '',
      to: first.to || '',
      credits: first.credits != null ? first.credits : null
    };
  }
  return { ok: false, items };
}

function mapSmsPohError(status, body) {
  const text = `${explicitErrorText(body)} ${JSON.stringify(body || {})}`.toLowerCase();
  if (status === 401) {
    return {
      code: 'failed-precondition',
      message: 'SMS service rejected the account. Check the API key, secret, Sender ID, and IP whitelist.'
    };
  }
  if (status === 402 || /balance|credit|insufficient/.test(text)) {
    return {
      code: 'resource-exhausted',
      message: 'SMS credit is too low. Top up the SMSPoh account and try again.'
    };
  }
  if (/sender/.test(text)) {
    return {
      code: 'failed-precondition',
      message: 'The SMS Sender ID is not approved on this account.'
    };
  }
  if (status >= 500) {
    return {
      code: 'unavailable',
      message: 'The SMS service is temporarily unavailable. Try again shortly.'
    };
  }
  return {
    code: 'failed-precondition',
    message: explicitErrorText(body) ||
      'The SMS could not be accepted. Try again or check the SMSPoh dashboard.'
  };
}

async function sendSmsPoh(options) {
  const payload = buildSmsPohPayload(options);
  const response = await fetch(SMSPOH_SEND_URL, {
    method: 'POST',
    headers: {
      Authorization: authHeader(options.apiKey, options.apiSecret),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
  const body = await response.json().catch(() => ({}));
  const interpreted = interpretSmsPohResponse(response.status, body);
  if (!interpreted.ok) {
    console.error('SMSPoh rejected send', response.status, body);
    const mapped = mapSmsPohError(response.status, body);
    const error = new Error(mapped.message);
    error.code = mapped.code;
    error.status = response.status;
    throw error;
  }
  return {
    messageId: interpreted.messageId,
    status: interpreted.status,
    operator: interpreted.operator,
    to: interpreted.to || options.to,
    credits: interpreted.credits
  };
}

module.exports = {
  SMSPOH_SEND_URL,
  buildSmsPohPayload,
  authHeader,
  interpretSmsPohResponse,
  mapSmsPohError,
  sendSmsPoh
};
