'use strict';

const SMSPOH_SEND_URL = 'https://v3.smspoh.com/api/rest/send';

function buildSmsPohPayload({ to, message, from, clientReference, test }) {
  const payload = {
    to,
    message,
    from,
    unicode: true
  };
  if (clientReference) payload.clientReference = String(clientReference);
  if (test) payload.test = true;
  return payload;
}

function authHeader(apiKey, apiSecret) {
  const token = Buffer.from(`${apiKey}:${apiSecret}`, 'utf8').toString('base64');
  return `Bearer ${token}`;
}

function mapSmsPohError(status, body) {
  const text = JSON.stringify(body || {}).toLowerCase();
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
    code: 'unavailable',
    message: 'The SMS could not be accepted. Try again or check the SMSPoh dashboard.'
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
  const accepted = response.status === 201 &&
    Array.isArray(body.messages) &&
    body.messages.some((item) => String(item && item.status) === 'Accepted');
  if (!accepted) {
    const mapped = mapSmsPohError(response.status, body);
    const error = new Error(mapped.message);
    error.code = mapped.code;
    error.status = response.status;
    throw error;
  }
  const first = body.messages[0] || {};
  return {
    messageId: first.messageId || '',
    status: first.status || 'Accepted',
    operator: first.operator || '',
    to: first.to || options.to,
    credits: first.credits != null ? first.credits : null
  };
}

module.exports = {
  SMSPOH_SEND_URL,
  buildSmsPohPayload,
  authHeader,
  mapSmsPohError,
  sendSmsPoh
};
