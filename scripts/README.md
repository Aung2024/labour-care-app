# Admin Scripts

Admin scripts for Labour Care app. Require Firebase service account key. No Blaze plan required.

### Setup (one-time)

1. **Get your service account key**
   - Go to [Firebase Console](https://console.firebase.google.com) → your project
   - Click the gear icon → **Project settings**
   - Open the **Service accounts** tab
   - Click **Generate new private key** → **Generate key**
   - Save the downloaded JSON file as `scripts/serviceAccountKey.json`

2. **Install dependencies**
   ```bash
   cd scripts
   npm install
   ```

---

## Reset User Password

Resets a user's password and clears account lockout. Use when a user forgets their password and can't receive reset emails (e.g. fake/placeholder emails).

**Command line:**
```bash
node reset-user-password.js <userId|email> <newPassword>
```

**Examples:**
```bash
node reset-user-password.js midwife@facility.local TempPass123!
node reset-user-password.js RTMufBmHXfTv2iHM0ztY4HumBV73 NewSecret456!
```

**Interactive (prompts for input):**
```bash
node reset-user-password.js
```

You can pass either:
- **Email** (e.g. `midwife@facility.local`) – the sign-in identifier
- **User ID** (Firebase Auth UID) – from Firebase Console or Firestore `users` doc ID

---

## Update User Email

Updates a user's sign-in email in Firebase Auth and Firestore.

**Command line:**
```bash
node update-user-email.js <userId> <newEmail>
```

Example:
```bash
node update-user-email.js RTMufBmHXfTv2iHM0ztY4HumBV73 npt@gmail.com
```

**Interactive (prompts for input):**
```bash
node update-user-email.js
```

### Finding the User ID

- **Firebase Console** → Authentication → Users → click a user → copy the **User UID**
- **Firestore** → `users` collection → the document ID is the user ID

---

### Security

- **Never commit** `serviceAccountKey.json` to git (it's in .gitignore)
- Keep the key file private and secure
