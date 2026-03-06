#!/usr/bin/env node
/**
 * Update a user's sign-in email using Firebase Admin SDK.
 * Updates both Firebase Auth and Firestore users collection.
 *
 * Usage:
 *   node update-user-email.js <userId> <newEmail>
 *   node update-user-email.js                    (interactive - will prompt)
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
const possiblePaths = [
  path.join(__dirname, 'serviceAccountKey.json'),
  path.join(__dirname, '..', 'serviceAccountKey.json'),
  process.env.GOOGLE_APPLICATION_CREDENTIALS
].filter(Boolean);

let serviceAccountPath = null;
for (const p of possiblePaths) {
  if (p && require('fs').existsSync(p)) {
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

async function updateUserEmail(userId, newEmail) {
  const emailTrimmed = newEmail.trim().toLowerCase();
  if (!emailTrimmed || !emailTrimmed.includes('@')) {
    throw new Error('Invalid email address');
  }

  // 1. Update Firebase Auth (sign-in email)
  await auth.updateUser(userId, { email: emailTrimmed });
  console.log('  ✓ Firebase Auth updated');

  // 2. Update Firestore users collection
  await db.collection('users').doc(userId).update({ email: emailTrimmed });
  console.log('  ✓ Firestore users document updated');

  return emailTrimmed;
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
  let userId = process.argv[2];
  let newEmail = process.argv[3];

  if (!userId || !newEmail) {
    console.log('\n📧 Update User Email (Firebase Admin SDK)\n');
    if (!userId) userId = await prompt('Enter user ID (Firebase Auth UID): ');
    if (!newEmail) newEmail = await prompt('Enter new email address: ');
  }

  if (!userId || !newEmail) {
    console.error('\n❌ userId and newEmail are required.\n');
    process.exit(1);
  }

  try {
    console.log(`\nUpdating email for user ${userId}...`);
    const updatedEmail = await updateUserEmail(userId, newEmail);
    console.log(`\n✅ Success! User can now sign in with: ${updatedEmail}\n`);
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.code === 'auth/email-already-in-use') {
      console.error('   This email is already in use by another account.\n');
    } else if (error.code === 'auth/user-not-found') {
      console.error('   User not found in Firebase Auth.\n');
    } else if (error.code === 'auth/invalid-email') {
      console.error('   Invalid email format.\n');
    }
    process.exit(1);
  }
}

main();
