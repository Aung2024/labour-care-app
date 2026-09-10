'use strict';

/**
 * Normalize a Myanmar mobile number to the 09XXXXXXXXX form SMSPoh accepts.
 * Also accepts 959… and +959…. Returns null when the value cannot be sent.
 */
function normalizeMyanmarMobile(raw) {
  if (raw == null) return null;
  let digits = String(raw).trim().replace(/[^\d+]/g, '');
  if (!digits) return null;
  if (digits.startsWith('+')) digits = digits.slice(1);
  if (digits.startsWith('95') && digits.charAt(2) === '9') digits = `0${digits.slice(2)}`;
  else if (digits.startsWith('9') && !digits.startsWith('09')) digits = `0${digits}`;
  if (!/^09\d{7,10}$/.test(digits)) return null;
  return digits;
}

function isSendableMyanmarMobile(raw) {
  return !!normalizeMyanmarMobile(raw);
}

module.exports = {
  normalizeMyanmarMobile,
  isSendableMyanmarMobile
};
