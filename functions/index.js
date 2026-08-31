const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');
const { FieldValue } = require('firebase-admin/firestore');

admin.initializeApp();

/**
 * Update a user's sign-in email (Super Admin only).
 * Updates both Firebase Auth and Firestore users collection.
 * Callable from the admin dashboard.
 */
exports.updateUserEmail = functions.https.onCall(async (data, context) => {
  // Require authentication
  if (!context.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'You must be logged in to perform this action.'
    );
  }

  const { userId, newEmail } = data;

  if (!userId || !newEmail || typeof newEmail !== 'string') {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'userId and newEmail are required.'
    );
  }

  const newEmailTrimmed = newEmail.trim().toLowerCase();
  if (!newEmailTrimmed || !newEmailTrimmed.includes('@')) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Please provide a valid email address.'
    );
  }

  // Verify caller is Super Admin
  const callerDoc = await admin.firestore()
    .collection('users')
    .doc(context.auth.uid)
    .get();

  if (!callerDoc.exists) {
    throw new functions.https.HttpsError(
      'permission-denied',
      'Your account was not found.'
    );
  }

  const callerRole = callerDoc.data().role;
  if (callerRole !== 'Super Admin') {
    throw new functions.https.HttpsError(
      'permission-denied',
      'Only Super Admin can update user emails.'
    );
  }

  try {
    // 1. Update Firebase Auth (sign-in email)
    await admin.auth().updateUser(userId, { email: newEmailTrimmed });

    // 2. Update Firestore users collection (for display consistency)
    await admin.firestore()
      .collection('users')
      .doc(userId)
      .update({ email: newEmailTrimmed });

    return {
      success: true,
      message: `Email updated successfully. User can now sign in with ${newEmailTrimmed}`,
    };
  } catch (error) {
    console.error('Error updating user email:', error);

    if (error.code === 'auth/email-already-in-use') {
      throw new functions.https.HttpsError(
        'already-exists',
        'This email is already in use by another account.'
      );
    }
    if (error.code === 'auth/user-not-found') {
      throw new functions.https.HttpsError(
        'not-found',
        'User account not found in Firebase Auth.'
      );
    }
    if (error.code === 'auth/invalid-email') {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Please provide a valid email address.'
      );
    }

    throw new functions.https.HttpsError(
      'internal',
      error.message || 'Failed to update email.'
    );
  }
});

function assertSuperAdmin(context) {
  if (!context.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'You must be logged in to perform this action.'
    );
  }
  return admin.firestore()
    .collection('users')
    .doc(context.auth.uid)
    .get()
    .then(function (callerDoc) {
      if (!callerDoc.exists || callerDoc.data().role !== 'Super Admin') {
        throw new functions.https.HttpsError(
          'permission-denied',
          'Only Super Admin can perform this action.'
        );
      }
      return callerDoc;
    });
}

function validateAdminPassword(password) {
  if (!password || typeof password !== 'string' || password.length < 8) {
    throw new Error('Password must be at least 8 characters.');
  }
  if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
    throw new Error('Password must include uppercase, lowercase, and a number.');
  }
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    throw new Error('Password must include at least one special character (!@#$%...).');
  }
}

async function applyAdminPasswordReset(userId, newPassword, adminUid) {
  validateAdminPassword(newPassword);
  await admin.auth().updateUser(userId, { password: newPassword });

  const userRef = admin.firestore().collection('users').doc(userId);
  const userDoc = await userRef.get();
  const userData = userDoc.exists ? userDoc.data() : {};
  const email = String(userData.email || '').trim().toLowerCase();

  await userRef.set({
    admin_password_reference: newPassword,
    admin_password_set_at: FieldValue.serverTimestamp(),
    admin_password_set_by: adminUid,
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: adminUid
  }, { merge: true });

  if (email) {
    await admin.firestore().collection('account_lockouts').doc(email).set({
      attempts: 0,
      lockoutUntil: null,
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
  }

  return { success: true, message: 'Password updated and account unlocked.' };
}

/**
 * Set or reset a user's sign-in password (Super Admin only).
 * Stores the admin-set password reference in Firestore for support visibility.
 */
exports.adminSetUserPassword = functions.https.onCall(async (data, context) => {
  await assertSuperAdmin(context);

  const userId = data && data.userId;
  const newPassword = data && data.newPassword;

  if (!userId || !newPassword) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'userId and newPassword are required.'
    );
  }

  try {
    return await applyAdminPasswordReset(userId, newPassword, context.auth.uid);
  } catch (error) {
    console.error('Error setting user password:', error);

    if (error.code === 'auth/user-not-found') {
      throw new functions.https.HttpsError(
        'not-found',
        'User account not found in Firebase Auth.'
      );
    }
    if (error.code === 'auth/weak-password') {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Password is too weak. Choose a stronger password.'
      );
    }
    if (error.message && error.message.indexOf('Password must') === 0) {
      throw new functions.https.HttpsError('invalid-argument', error.message);
    }

    throw new functions.https.HttpsError(
      'internal',
      error.message || 'Failed to update password.'
    );
  }
});

async function processPasswordResetRequest(docSnap) {
  const data = docSnap.data() || {};
  const requestRef = docSnap.ref;
  const userId = data.userId;
  const newPassword = data.newPassword;
  const requestedBy = data.requestedBy;

  if (!userId || !newPassword || !requestedBy) {
    await requestRef.set({
      status: 'failed',
      error: 'Missing userId, newPassword, or requestedBy.',
      completedAt: FieldValue.serverTimestamp(),
      newPassword: FieldValue.delete()
    }, { merge: true });
    return;
  }

  const callerDoc = await admin.firestore().collection('users').doc(requestedBy).get();
  if (!callerDoc.exists || callerDoc.data().role !== 'Super Admin') {
    await requestRef.set({
      status: 'failed',
      error: 'Only Super Admin can reset passwords.',
      completedAt: FieldValue.serverTimestamp(),
      newPassword: FieldValue.delete()
    }, { merge: true });
    return;
  }

  await applyAdminPasswordReset(userId, newPassword, requestedBy);
  await requestRef.set({
    status: 'completed',
    completedAt: FieldValue.serverTimestamp(),
    newPassword: FieldValue.delete()
  }, { merge: true });
}

/**
 * Poll pending Super Admin password resets from Firestore.
 * Avoids direct HTTPS calls from networks that block cloudfunctions.net.
 */
exports.processPendingPasswordResets = functions
  .region('us-central1')
  .pubsub.schedule('every 1 minutes')
  .onRun(async function () {
    const snap = await admin.firestore()
      .collection('admin_password_resets')
      .where('status', '==', 'pending')
      .limit(20)
      .get();

    for (var i = 0; i < snap.docs.length; i++) {
      var docSnap = snap.docs[i];
      try {
        await docSnap.ref.set({ status: 'processing' }, { merge: true });
        await processPasswordResetRequest(docSnap);
      } catch (error) {
        console.error('processPendingPasswordResets failed:', error);
        await docSnap.ref.set({
          status: 'failed',
          error: error.message || 'Failed to update password.',
          completedAt: FieldValue.serverTimestamp(),
          newPassword: FieldValue.delete()
        }, { merge: true });
      }
    }
    return null;
  });

// Version 2 leaderboard backend. Existing admin functions above remain unchanged.
const leaderboardFunctions = require('./src/leaderboard/functions');
exports.startLeaderboardRebuild = leaderboardFunctions.startLeaderboardRebuild;
exports.getLeaderboardCustomRange = leaderboardFunctions.getLeaderboardCustomRange;
exports.leaderboardNightlyReconciliation =
  leaderboardFunctions.leaderboardNightlyReconciliation;
exports.leaderboardReconciliationWorker =
  leaderboardFunctions.leaderboardReconciliationWorker;

// Dashboard V2 backend. Deploy these named functions only after the active
// leaderboard rebuild has completed.
const analyticsFunctions = require('./src/analytics/functions');
exports.startDashboardV2Rebuild = analyticsFunctions.startDashboardV2Rebuild;
exports.dashboardV2ReconciliationWorker =
  analyticsFunctions.dashboardV2ReconciliationWorker;
exports.combinedAnalyticsReconciliation =
  analyticsFunctions.combinedAnalyticsReconciliation;

// HRT/KMC server projections. These exports are independent of Dashboard V2.
const trackingFunctions = require('./src/analytics/tracking-functions');
exports.queryHrtTracking = trackingFunctions.queryHrtTracking;
exports.queryKmcTracking = trackingFunctions.queryKmcTracking;
exports.startTrackingProjectionRepair =
  trackingFunctions.startTrackingProjectionRepair;
exports.trackingProjectionRepairWorker =
  trackingFunctions.trackingProjectionRepairWorker;
exports.trackingWeeklyReconciliation =
  trackingFunctions.trackingWeeklyReconciliation;

// Incremental queues used because asia-southeast3 cannot host Firestore
// document triggers. Clinical clients enqueue only patient IDs.
const refreshQueueFunctions = require('./src/analytics/refresh-queue-functions');
exports.trackingRefreshQueueWorker =
  refreshQueueFunctions.trackingRefreshQueueWorker;
exports.leaderboardDailyRefreshWorker =
  refreshQueueFunctions.leaderboardDailyRefreshWorker;
