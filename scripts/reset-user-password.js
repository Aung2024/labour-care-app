#!/usr/bin/env node
/**
 * Reset a user's password using Firebase Admin SDK.
 * Also clears account lockout so they can sign in immediately.
 *
 * Usage:
 *   node reset-user-password.js <userId|email> <newPassword>
 *   node reset-user-password.js                    (interactive - will prompt)
 *
 * Examples:
 *   node reset-user-password.js midwife@facility.local MyNewPass123!
 *   node reset-user-password.js RTMufBmHXfTv2iHM0ztY4HumBV73 TempPass123!
 *
 * Prerequisites:
 *   1. Download service account key from Firebase Console:
 *      Project Settings → Service accounts → Generate new private key
 *   2. Save as: scripts/serviceAccountKey.json (or set path via GOOGLE_APPLICATION_CREDENTIALS)
 *   3. Run: npm install (in scripts folder)
 */

const admin = require('firebase-admin');
const readline = require('readline');

// Load service account - try multiple locations
const path = require('path');
const fs = require('fs');
const possiblePaths = [
  path.join(__dirname, 'serviceAccountKey.json'),
  path.join(__dirname, '..', 'serviceAccountKey.json'),
  process.env.GOOGLE_APPLICATION_CREDENTIALS
].filter(Boolean);

let serviceAccountPath = null;
for (const p of possiblePaths) {
  if (p && fs.existsSync(p)) {
    serviceAccountPath = p;
    break;
  }
}

if (!serviceAccountPath) {
  console.error('\n❌ Service account key not found.');
  console.error('\nTo fix:');
  console.error('  1. Go to Firebase Console → Project Settings → Service accounts');
  console.error('  2. Click "Generate new private key"');
  console.error('  3. Save the JSON file as: scripts/serviceAccountKey.json');
  console.error('  4. Or set env: GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json\n');
  process.exit(1);
}

const serviceAccount = require(serviceAccountPath);
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

const auth = admin.auth();
const db = admin.firestore();

async function getUser(userIdOrEmail) {
  if (userIdOrEmail.includes('@')) {
    return auth.getUserByEmail(userIdOrEmail.trim().toLowerCase());
  }
  return auth.getUser(userIdOrEmail);
}

async function resetPassword(userIdOrEmail, newPassword) {
  const user = await getUser(userIdOrEmail);
  const uid = user.uid;
  const email = user.email;

  if (!newPassword || newPassword.length < 6) {
    throw new Error('Password must be at least 6 characters');
  }

  // 1. Update password in Firebase Auth
  await auth.updateUser(uid, { password: newPassword });
  console.log('  ✓ Password updated in Firebase Auth');

  // 2. Clear account lockout (keyed by email in account_lockouts)
  if (email) {
    try {
      await db.collection('account_lockouts').doc(email).delete();
      console.log('  ✓ Account lockout cleared (if any)');
    } catch (e) {
      // Lockout doc may not exist - that's fine
      console.log('  ✓ (No lockout to clear)');
    }
  }

  return { uid, email };
}

function prompt(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function main() {
  let userIdOrEmail = process.argv[2];
  let newPassword = process.argv[3];

  if (!userIdOrEmail || !newPassword) {
    console.log('\n🔐 Reset User Password (Firebase Admin SDK)\n');
    if (!userIdOrEmail) userIdOrEmail = await prompt('Enter user ID or email: ');
    if (!newPassword) newPassword = await prompt('Enter new password: ');
  }

  if (!userIdOrEmail || !newPassword) {
    console.error('\n❌ User ID/email and new password are required.\n');
    process.exit(1);
  }

  try {
    console.log(`\nResetting password for: ${userIdOrEmail}`);
    const { uid, email } = await resetPassword(userIdOrEmail, newPassword);
    console.log(`\n✅ Success!`);
    console.log(`   User can now sign in with the new password.`);
    if (email) console.log(`   Sign-in email: ${email}`);
    console.log(`   UID: ${uid}\n`);
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.code === 'auth/user-not-found') {
      console.error('   User not found. Check the user ID or email.\n');
    } else if (error.code === 'auth/invalid-email') {
      console.error('   Invalid email format.\n');
    } else if (error.code === 'auth/weak-password') {
      console.error('   Password is too weak (Firebase requires at least 6 chars).\n');
    }
    process.exit(1);
  }
}

main();
