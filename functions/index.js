const functions = require('firebase-functions');
const admin = require('firebase-admin');

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
