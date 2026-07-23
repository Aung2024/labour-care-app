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
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Password must be at least 8 characters.'
    );
  }
  if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Password must include uppercase, lowercase, and a number.'
    );
  }
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

  validateAdminPassword(newPassword);

  try {
    await admin.auth().updateUser(userId, { password: newPassword });

    const userRef = admin.firestore().collection('users').doc(userId);
    const userDoc = await userRef.get();
    const userData = userDoc.exists ? userDoc.data() : {};
    const email = String(userData.email || '').trim().toLowerCase();

    await userRef.set({
      admin_password_reference: newPassword,
      admin_password_set_at: admin.firestore.FieldValue.serverTimestamp(),
      admin_password_set_by: context.auth.uid,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedBy: context.auth.uid
    }, { merge: true });

    if (email) {
      await admin.firestore().collection('account_lockouts').doc(email).set({
        attempts: 0,
        lockoutUntil: null,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    }

    return {
      success: true,
      message: 'Password updated and account unlocked.'
    };
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

    throw new functions.https.HttpsError(
      'internal',
      error.message || 'Failed to update password.'
    );
  }
});
