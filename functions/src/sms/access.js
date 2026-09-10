'use strict';

const { HttpsError } = require('firebase-functions/v2/https');

function assertCanSendHrtSms(user) {
  if (!user || user.role !== 'midwife') {
    throw new HttpsError(
      'permission-denied',
      'Only midwives can send high-risk SMS.'
    );
  }
}

function assertTrackingRowScope(user, row) {
  if (!row) {
    throw new HttpsError('not-found', 'High-risk record was not found.');
  }
  if (['super admin', 'central', 'admin'].includes(user.role)) return;
  if (user.role === 'regional officer') {
    if (!user.region || row.region !== user.region) {
      throw new HttpsError('permission-denied', 'This patient is outside your region.');
    }
    return;
  }
  if (['tmo', 'township medical officer'].includes(user.role)) {
    if (!user.township || row.township !== user.township) {
      throw new HttpsError('permission-denied', 'This patient is outside your township.');
    }
    return;
  }
  const careTeam = Array.isArray(row.careTeamProviderIds) ? row.careTeamProviderIds : [];
  if (row.providerId === user.uid || careTeam.includes(user.uid)) return;
  throw new HttpsError('permission-denied', 'This patient is not in your care team.');
}

module.exports = {
  assertCanSendHrtSms,
  assertTrackingRowScope
};
